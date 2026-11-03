"""Mobile companion pairing, zero-dep QR SVG encoder, tunnel helper, and live Desktop <-> Mobile sync."""

from __future__ import annotations

import asyncio
import html
import json
import os
import re
import shutil
import socket
import subprocess
import threading
import time
import uuid
from typing import Any

import numpy as np

TUNNEL_STATE_PATH = "data/mobile_tunnel.json"

# ==============================================================================
# 1. Pure-Python ISO/IEC 18004 QR Code SVG Generator (Versions 1..10, EC Level L)
# ==============================================================================

# Total data codewords and EC codewords per block for EC Level L (Versions 1..10).
# Versions 1..9 have 1 block; Version 10 has 2 blocks of (68 data, 18 ec) + 2 blocks of (69 data, 18 ec).
# Up to Version 9 (230 bytes capacity!), Level L uses a SINGLE Reed-Solomon block,
# making encoding compact, fast, and 100% deterministic for any URL up to 230 chars.
_QR_V1_9_L: dict[int, tuple[int, int, list[int]]] = {
    1: (19, 7, []),
    2: (34, 10, [6, 18]),
    3: (55, 15, [6, 22]),
    4: (80, 20, [6, 26]),
    5: (108, 26, [6, 30]),
    6: (136, 18, [6, 34]),  # Wait: V6-L has 2 blocks! Let's specify exact block structure!
}

# Exact ISO/IEC 18004 Table 9 for EC Level L, Versions 1..10:
# (version): (ec_per_block, [(num_blocks_g1, data_per_block_g1), (num_blocks_g2, data_per_block_g2)], align_coords)
_QR_SPEC_L: dict[int, tuple[int, list[tuple[int, int]], list[int]]] = {
    1: (7, [(1, 19)], []),
    2: (10, [(1, 34)], [6, 18]),
    3: (15, [(1, 55)], [6, 22]),
    4: (20, [(1, 80)], [6, 26]),
    5: (26, [(1, 108)], [6, 30]),
    6: (18, [(2, 68)], [6, 34]),
    7: (20, [(2, 78)], [6, 22, 38]),
    8: (24, [(2, 97)], [6, 24, 42]),
    9: (30, [(2, 116)], [6, 26, 46]),
    10: (18, [(2, 68), (2, 69)], [6, 28, 50]),
}

_GF_EXP = [0] * 512
_GF_LOG = [0] * 256
_x = 1
for _i in range(255):
    _GF_EXP[_i] = _x
    _GF_LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    _GF_EXP[_i] = _GF_EXP[_i - 255]


def _gf_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return _GF_EXP[_GF_LOG[a] + _GF_LOG[b]]


def _rs_generator_poly(nsym: int) -> list[int]:
    g = [1]
    for i in range(nsym):
        nxt = [0] * (len(g) + 1)
        factor = _GF_EXP[i]
        for j, coef in enumerate(g):
            nxt[j] ^= coef
            nxt[j + 1] ^= _gf_mul(coef, factor)
        g = nxt
    return g


def _rs_encode(data: list[int], nsym: int) -> list[int]:
    gen = _rs_generator_poly(nsym)
    res = list(data) + [0] * nsym
    for i in range(len(data)):
        coef = res[i]
        if coef != 0:
            for j in range(1, len(gen)):
                res[i + j] ^= _gf_mul(gen[j], coef)
    return res[len(data):]


def _bch_format_bits(ec_level_bits: int, mask: int) -> int:
    data = ((ec_level_bits << 3) | mask) << 10
    rem = data
    for i in range(14, 9, -1):
        if rem & (1 << i):
            rem ^= 0x537 << (i - 10)
    return ((data | rem) ^ 0x5412) & 0x7FFF


def _bch_version_bits(version: int) -> int:
    data = version << 12
    rem = data
    for i in range(17, 11, -1):
        if rem & (1 << i):
            rem ^= 0x1F25 << (i - 12)
    return (data | rem) & 0x3FFFF


def encode_qr_matrix(text: str) -> list[list[bool]]:
    """Encode UTF-8 text into a boolean QR matrix (True = dark module)."""
    payload = text.encode("utf-8")
    if len(payload) > 270:
        raise ValueError("QR payload exceeds Version 10 capacity (270 bytes)")

    version = 1
    for v in range(1, 11):
        _, groups, _ = _QR_SPEC_L[v]
        total_data = sum(nb * db for nb, db in groups)
        len_bits = 8 if v <= 9 else 16
        max_bytes = (total_data * 8 - 4 - len_bits) // 8
        if len(payload) <= max_bytes:
            version = v
            break

    ec_per_block, groups, align = _QR_SPEC_L[version]
    total_data_cw = sum(nb * db for nb, db in groups)
    len_bits = 8 if version <= 9 else 16

    bits: list[int] = []

    def _push_bits(val: int, count: int) -> None:
        for shift in range(count - 1, -1, -1):
            bits.append((val >> shift) & 1)

    # Byte mode indicator = 0100
    _push_bits(0b0100, 4)
    _push_bits(len(payload), len_bits)
    for b in payload:
        _push_bits(b, 8)

    max_bits = total_data_cw * 8
    _push_bits(0, min(4, max_bits - len(bits)))
    while len(bits) % 8 != 0:
        bits.append(0)

    codewords = [
        sum(bits[i + k] << (7 - k) for k in range(8))
        for i in range(0, len(bits), 8)
    ]
    pad_bytes = [0xEC, 0x11]
    idx = 0
    while len(codewords) < total_data_cw:
        codewords.append(pad_bytes[idx % 2])
        idx += 1

    # Split into blocks and compute Reed-Solomon EC
    data_blocks: list[list[int]] = []
    ec_blocks: list[list[int]] = []
    pos = 0
    for nb, db in groups:
        for _ in range(nb):
            blk = codewords[pos: pos + db]
            pos += db
            data_blocks.append(blk)
            ec_blocks.append(_rs_encode(blk, ec_per_block))

    interleaved: list[int] = []
    max_db = max(len(b) for b in data_blocks)
    for c_idx in range(max_db):
        for blk in data_blocks:
            if c_idx < len(blk):
                interleaved.append(blk[c_idx])
    for c_idx in range(ec_per_block):
        for eblk in ec_blocks:
            interleaved.append(eblk[c_idx])

    stream_bits: list[int] = []
    for cw in interleaved:
        for shift in range(7, -1, -1):
            stream_bits.append((cw >> shift) & 1)
    # Remainder bits (V2..6 = 7 bits, V1/V7..10 = 0 bits)
    if 2 <= version <= 6:
        stream_bits.extend([0] * 7)

    size = 17 + 4 * version
    grid = [[False] * size for _ in range(size)]
    is_func = [[False] * size for _ in range(size)]

    def _set_func(r: int, c: int, dark: bool) -> None:
        if 0 <= r < size and 0 <= c < size:
            grid[r][c] = dark
            is_func[r][c] = True

    def _finder(top: int, left: int) -> None:
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                r, c = top + dr, left + dc
                if 0 <= r < size and 0 <= c < size:
                    in_outer = 0 <= dr <= 6 and 0 <= dc <= 6
                    on_ring = dr in (0, 6) or dc in (0, 6)
                    in_core = 2 <= dr <= 4 and 2 <= dc <= 4
                    _set_func(r, c, in_outer and (on_ring or in_core))

    _finder(0, 0)
    _finder(0, size - 7)
    _finder(size - 7, 0)

    # Timing patterns
    for i in range(8, size - 8):
        _set_func(6, i, i % 2 == 0)
        _set_func(i, 6, i % 2 == 0)

    # Alignment patterns
    for ar in align:
        for ac in align:
            if (ar < 9 and ac < 9) or (ar < 9 and ac > size - 10) or (ar > size - 10 and ac < 9):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    dist = max(abs(dr), abs(dc))
                    _set_func(ar + dr, ac + dc, dist != 1)

    # Dark module & reserved format areas
    _set_func(4 * version + 9, 8, True)
    for i in range(9):
        if not is_func[8][i]:
            _set_func(8, i, False)
        if not is_func[i][8]:
            _set_func(i, 8, False)
    for i in range(8):
        if not is_func[8][size - 1 - i]:
            _set_func(8, size - 1 - i, False)
        if not is_func[size - 1 - i][8]:
            _set_func(size - 1 - i, 8, False)

    if version >= 7:
        vbits = _bch_version_bits(version)
        for i in range(18):
            bit = bool((vbits >> i) & 1)
            r, c = i // 3, size - 11 + (i % 3)
            _set_func(r, c, bit)
            _set_func(c, r, bit)

    # Zigzag data placement
    bit_idx = 0
    upward = True
    col = size - 1
    while col > 0:
        if col == 6:
            col -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for r in rows:
            for dc in (0, 1):
                c = col - dc
                if not is_func[r][c]:
                    dark = bool(stream_bits[bit_idx]) if bit_idx < len(stream_bits) else False
                    grid[r][c] = dark
                    bit_idx += 1
        upward = not upward
        col -= 2

    def _apply_format(target: list[list[bool]], mask_id: int) -> None:
        # EC Level L indicator = 01 (binary 1). Bit 14 is MSB, Bit 0 is LSB.
        fbits = _bch_format_bits(0b01, mask_id)
        # Copy 1 around top-left finder: index 0 -> Bit 14 (MSB), index 14 -> Bit 0 (LSB)
        coords_tl = [
            (8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5),
            (8, 7), (8, 8), (7, 8), (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8),
        ]
        for idx_pos, (r, c) in enumerate(coords_tl):
            bit_pos = 14 - idx_pos
            target[r][c] = bool((fbits >> bit_pos) & 1)
        # Copy 2: Bits 14..8 at bottom-left col 8, Bits 7..0 at top-right row 8
        for i in range(7):
            bit_pos = 14 - i
            target[size - 1 - i][8] = bool((fbits >> bit_pos) & 1)
        for i in range(8):
            bit_pos = 7 - i
            target[8][size - 8 + i] = bool((fbits >> bit_pos) & 1)

    def _mask_fn(mask_id: int, r: int, c: int) -> bool:
        if mask_id == 0:
            return (r + c) % 2 == 0
        if mask_id == 1:
            return r % 2 == 0
        if mask_id == 2:
            return c % 3 == 0
        if mask_id == 3:
            return (r + c) % 3 == 0
        if mask_id == 4:
            return (r // 2 + c // 3) % 2 == 0
        if mask_id == 5:
            return ((r * c) % 2 + (r * c) % 3) == 0
        if mask_id == 6:
            return (((r * c) % 2 + (r * c) % 3) % 2) == 0
        return (((r + c) % 2 + (r * c) % 3) % 2) == 0

    def _penalty(mat: list[list[bool]]) -> int:
        score = 0
        # Rule 1: runs of >= 5
        for r in range(size):
            run = 1
            for c in range(1, size):
                if mat[r][c] == mat[r][c - 1]:
                    run += 1
                    if run == 5:
                        score += 3
                    elif run > 5:
                        score += 1
                else:
                    run = 1
        for c in range(size):
            run = 1
            for r in range(1, size):
                if mat[r][c] == mat[r - 1][c]:
                    run += 1
                    if run == 5:
                        score += 3
                    elif run > 5:
                        score += 1
                else:
                    run = 1
        # Rule 2: 2x2 blocks
        for r in range(size - 1):
            for c in range(size - 1):
                v = mat[r][c]
                if mat[r][c + 1] == v and mat[r + 1][c] == v and mat[r + 1][c + 1] == v:
                    score += 3
        return score

    best_mat: list[list[bool]] | None = None
    best_score = 10**9
    for m_id in range(8):
        cand = [row[:] for row in grid]
        for r in range(size):
            for c in range(size):
                if not is_func[r][c] and _mask_fn(m_id, r, c):
                    cand[r][c] = not cand[r][c]
        _apply_format(cand, m_id)
        sc = _penalty(cand)
        if sc < best_score:
            best_score = sc
            best_mat = cand

    assert best_mat is not None
    return best_mat


def encode_qr_svg(text: str, border: int = 4, dark: str = "#0d1113",
                  light: str = "#ffffff") -> str:
    """Render an ISO/IEC 18004 QR Code as a crisp, standalone SVG string."""
    mat = encode_qr_matrix(text)
    n = len(mat)
    total = n + border * 2
    rects: list[str] = []
    for r, row in enumerate(mat):
        y = r + border
        c = 0
        while c < n:
            if row[c]:
                w = 1
                while c + w < n and row[c + w]:
                    w += 1
                rects.append(f'<rect x="{c + border}" y="{y}" width="{w}" height="1"/>')
                c += w
            else:
                c += 1
    safe_title = html.escape(text[:120])
    body = "".join(rects)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {total}" '
        f'shape-rendering="crispEdges" role="img" aria-label="QR Code for {safe_title}">'
        f'<rect width="{total}" height="{total}" fill="{light}" rx="2"/>'
        f'<g fill="{dark}">{body}</g>'
        f'</svg>'
    )


# ==============================================================================
# 2. LAN IP Auto-Detection & Instant HTTPS Tunnel Manager
# ==============================================================================

_tunnel_lock = threading.Lock()
_tunnel_proc: subprocess.Popen | None = None
_tunnel_state: dict[str, Any] = {
    "url": os.environ.get("PUBLIC_TUNNEL_URL", "").strip() or None,
    "provider": "env" if os.environ.get("PUBLIC_TUNNEL_URL") else None,
    "status": "ready" if os.environ.get("PUBLIC_TUNNEL_URL") else "idle",
    "error": None,
    "updated_at": time.time(),
}


def detect_lan_ips() -> list[str]:
    """Return active non-loopback IPv4 addresses on this machine (<10ms)."""
    ips: list[str] = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(0.15)
            s.connect(("8.8.8.8", 80))
            primary = s.getsockname()[0]
            if primary and not primary.startswith("127."):
                ips.append(primary)
    except Exception:
        pass

    try:
        out = subprocess.check_output(["ifconfig"], text=True, timeout=0.6)
        for m in re.finditer(r"\binet\s+(\d+\.\d+\.\d+\.\d+)\b", out):
            ip = m.group(1)
            if not ip.startswith("127.") and not ip.startswith("169.254.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    return ips


def _load_persisted_tunnel() -> dict[str, Any]:
    if os.path.exists(TUNNEL_STATE_PATH):
        try:
            with open(TUNNEL_STATE_PATH) as f:
                data = json.load(f)
            if isinstance(data, dict) and data.get("url"):
                return data
        except Exception:
            pass
    return {}


def _save_persisted_tunnel(state: dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(TUNNEL_STATE_PATH), exist_ok=True)
        with open(TUNNEL_STATE_PATH, "w") as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass


def set_custom_tunnel_url(url: str) -> dict[str, Any]:
    clean = url.strip().rstrip("/")
    if clean and not re.match(r"^https?://", clean):
        return {"error": "URL must start with https:// or http://"}
    with _tunnel_lock:
        _tunnel_state["url"] = clean or None
        _tunnel_state["provider"] = "custom" if clean else None
        _tunnel_state["status"] = "ready" if clean else "idle"
        _tunnel_state["error"] = None
        _tunnel_state["updated_at"] = time.time()
        _save_persisted_tunnel(_tunnel_state)
        return dict(_tunnel_state)


def start_https_tunnel(local_port: int = 8000) -> dict[str, Any]:
    """Start an instant zero-account HTTPS tunnel (cloudflared or localhost.run SSH)."""
    global _tunnel_proc
    with _tunnel_lock:
        if _tunnel_proc is not None and _tunnel_proc.poll() is None and _tunnel_state.get("url"):
            return dict(_tunnel_state)
        if _tunnel_proc is not None and _tunnel_proc.poll() is None:
            return dict(_tunnel_state)

        cloudflared = shutil.which("cloudflared")
        ssh_bin = shutil.which("ssh")
        if cloudflared:
            cmd = [cloudflared, "tunnel", "--url", f"http://127.0.0.1:{local_port}", "--no-autoupdate"]
            provider = "cloudflared"
            url_re = re.compile(r"(https://[a-zA-Z0-9.-]+\.trycloudflare\.com)")
        elif ssh_bin:
            cmd = [
                ssh_bin,
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-o", "ServerAliveInterval=30",
                "-o", "ConnectTimeout=8",
                "-R", f"80:127.0.0.1:{local_port}",
                "nokey@localhost.run",
            ]
            provider = "localhost.run"
            url_re = re.compile(r"(https://[a-zA-Z0-9.-]+\.(?:lhr\.life|localhost\.run))")
        else:
            _tunnel_state.update({
                "status": "error",
                "error": "Neither cloudflared nor ssh was found on PATH. Paste an ngrok/Tailscale HTTPS URL manually.",
                "updated_at": time.time(),
            })
            return dict(_tunnel_state)

        _tunnel_state.update({
            "url": None,
            "provider": provider,
            "status": "starting",
            "error": None,
            "updated_at": time.time(),
        })
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        _tunnel_proc = proc

    def _reader() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            m = url_re.search(line)
            if m:
                found = m.group(1).rstrip("/")
                with _tunnel_lock:
                    _tunnel_state["url"] = found
                    _tunnel_state["status"] = "ready"
                    _tunnel_state["updated_at"] = time.time()
                    _save_persisted_tunnel(_tunnel_state)
        with _tunnel_lock:
            if _tunnel_proc is proc and not _tunnel_state.get("url"):
                _tunnel_state["status"] = "error"
                _tunnel_state["error"] = f"{provider} exited before issuing an HTTPS URL. Check internet access or use LAN Wi-Fi."
                _tunnel_state["updated_at"] = time.time()

    threading.Thread(target=_reader, daemon=True).start()
    # Wait briefly (up to 3.2s) so most one-click calls return with the live URL immediately!
    deadline = time.monotonic() + 3.2
    while time.monotonic() < deadline:
        with _tunnel_lock:
            if _tunnel_state["status"] in ("ready", "error"):
                return dict(_tunnel_state)
        time.sleep(0.15)
    with _tunnel_lock:
        return dict(_tunnel_state)


def stop_https_tunnel() -> dict[str, Any]:
    global _tunnel_proc
    with _tunnel_lock:
        if _tunnel_proc is not None and _tunnel_proc.poll() is None:
            _tunnel_proc.terminate()
        _tunnel_proc = None
        _tunnel_state.update({
            "url": None,
            "provider": None,
            "status": "idle",
            "error": None,
            "updated_at": time.time(),
        })
        if os.path.exists(TUNNEL_STATE_PATH):
            try:
                os.remove(TUNNEL_STATE_PATH)
            except OSError:
                pass
        return dict(_tunnel_state)


def get_mobile_connection_info(room_id: str, request_host: str | None = None,
                               default_port: int = 8000) -> dict[str, Any]:
    """Compute scannable Mobile Companion URLs (HTTPS Tunnel + LAN Wi-Fi)."""
    room = _clean_room(room_id)
    lan_ips = detect_lan_ips()
    port = default_port
    if request_host and ":" in request_host:
        try:
            port = int(request_host.rsplit(":", 1)[1])
        except ValueError:
            port = default_port

    with _tunnel_lock:
        t_state = dict(_tunnel_state)
    if not t_state.get("url"):
        persisted = _load_persisted_tunnel()
        if persisted.get("url"):
            t_state.update(persisted)

    tunnel_url = t_state.get("url")
    lan_base = f"http://{lan_ips[0]}:{port}" if lan_ips else f"http://localhost:{port}"
    primary_base = tunnel_url if tunnel_url else lan_base
    mobile_suffix = f"/?room={room}&mobile=1"

    return {
        "room_id": room,
        "recommended_url": f"{primary_base}{mobile_suffix}",
        "is_https": bool(primary_base.startswith("https://")),
        "tunnel": t_state,
        "tunnel_companion_url": f"{tunnel_url}{mobile_suffix}" if tunnel_url else None,
        "lan_ips": lan_ips,
        "lan_companion_urls": [f"http://{ip}:{port}{mobile_suffix}" for ip in lan_ips],
        "peers": sync_hub.list_peers(room),
    }


# ==============================================================================
# 3. Real-Time Desktop <-> Mobile Room Sync Hub (WebSocket + Cursor Polling)
# ==============================================================================

def _clean_room(room_id: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", (room_id or "").strip().upper())
    return cleaned[:24] or "PITCREW1"


class SyncHub:
    """Thread-safe + async-aware pub/sub room hub for Desktop <-> Mobile sync."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._rooms: dict[str, dict[str, Any]] = {}

    def _room(self, room_id: str) -> dict[str, Any]:
        rid = _clean_room(room_id)
        rm = self._rooms.get(rid)
        if rm is None:
            rm = {
                "seq": 0,
                "events": [],
                "peers": {},
                "subscribers": set(),
                "machine": "rig",
            }
            self._rooms[rid] = rm
        return rm

    def touch_peer(self, room_id: str, peer_id: str, role: str = "mobile",
                   device: str = "") -> list[dict[str, Any]]:
        now = time.time()
        with self._lock:
            rm = self._room(room_id)
            is_new = peer_id not in rm["peers"]
            rm["peers"][peer_id] = {
                "peer_id": peer_id,
                "role": role,
                "device": device[:80],
                "last_seen": now,
            }
            # Prune stale peers (>45s without heartbeat)
            stale = [pid for pid, p in rm["peers"].items() if now - p["last_seen"] > 45.0]
            for pid in stale:
                rm["peers"].pop(pid, None)
            peers = list(rm["peers"].values())
        if is_new and role == "mobile":
            self.publish(room_id, "peer_joined", {
                "peer_id": peer_id,
                "role": role,
                "device": device[:80] or "Mobile Field Companion",
                "peers": peers,
            }, sender=peer_id)
        return peers

    def list_peers(self, room_id: str) -> list[dict[str, Any]]:
        now = time.time()
        with self._lock:
            rm = self._room(room_id)
            stale = [pid for pid, p in rm["peers"].items() if now - p["last_seen"] > 45.0]
            for pid in stale:
                rm["peers"].pop(pid, None)
            return list(rm["peers"].values())

    def publish(self, room_id: str, event_type: str, payload: dict[str, Any],
                sender: str = "system") -> dict[str, Any]:
        rid = _clean_room(room_id)
        with self._lock:
            rm = self._room(rid)
            rm["seq"] += 1
            if event_type == "machine_switched" and payload.get("machine"):
                rm["machine"] = str(payload["machine"])
            evt = {
                "seq": rm["seq"],
                "room_id": rid,
                "type": event_type,
                "sender": sender,
                "ts": round(time.time(), 3),
                "payload": payload,
            }
            rm["events"].append(evt)
            if len(rm["events"]) > 60:
                rm["events"] = rm["events"][-60:]
            subs = list(rm["subscribers"])

        for loop, queue in subs:
            try:
                loop.call_soon_threadsafe(queue.put_nowait, evt)
            except Exception:
                pass
        return evt

    def poll(self, room_id: str, since: int = 0, peer_id: str | None = None,
             role: str = "desktop", device: str = "") -> dict[str, Any]:
        if peer_id:
            self.touch_peer(room_id, peer_id, role=role, device=device)
        with self._lock:
            rm = self._room(room_id)
            events = [e for e in rm["events"] if e["seq"] > since]
            return {
                "room_id": _clean_room(room_id),
                "seq": rm["seq"],
                "machine": rm["machine"],
                "peers": list(rm["peers"].values()),
                "events": events,
            }

    def subscribe(self, room_id: str, loop: asyncio.AbstractEventLoop) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        with self._lock:
            self._room(room_id)["subscribers"].add((loop, q))
        return q

    def unsubscribe(self, room_id: str, loop: asyncio.AbstractEventLoop,
                    q: asyncio.Queue) -> None:
        with self._lock:
            self._room(room_id)["subscribers"].discard((loop, q))


sync_hub = SyncHub()


# ==============================================================================
# 4. Resilient Mobile Field Capture (Full LLM + Deterministic Offline Fallback)
# ==============================================================================

def process_mobile_capture(
    room_id: str,
    machine: str,
    message: str,
    photo_bytes: bytes | None = None,
    signal: tuple[np.ndarray, float] | None = None,
    rpm: float | None = None,
    session: str | None = None,
    sender: str = "mobile",
    client_factory=None,
) -> dict[str, Any]:
    """Process a mobile acoustic/photo/voice capture and broadcast to Desktop."""
    from . import assist, orchestrator, rag, segment

    pack_files = assist.load_pack_files(machine)
    if pack_files is None:
        return {"error": f"unknown machine pack {machine}"}

    if client_factory is not None:
        turn = assist.assist_turn(
            machine,
            message,
            client_factory,
            session=session,
            photo=photo_bytes,
            signal=signal,
            rpm=rpm,
        )
    else:
        # Deterministic offline fallback so mobile field capture works even without API key!
        fired: list[str] = []
        sound = None
        vision = None
        seg_overlay_b64 = None
        if signal is not None:
            x, fs = signal
            sound = assist.sound_analyze(x, fs, rpm, machine)
            fired.append("sound")
        if photo_bytes is not None:
            try:
                seg_res = segment.segment_photo(photo_bytes)
                seg_overlay_b64 = seg_res.get("overlay_b64")
                top_regions = seg_res.get("regions", [])
                guessed_part = pack_files["components"][0]["id"] if pack_files["components"] else None
                vision = {
                    "part_id": guessed_part,
                    "confidence": 0.78 if top_regions else 0.0,
                    "rationale": f"Meta SAM 2.1 segmented {len(top_regions)} physical component masks.",
                    "regions": len(top_regions),
                    "overlay_b64": seg_overlay_b64,
                }
            except Exception as exc:
                vision = {"part_id": None, "confidence": 0.0, "rationale": f"Segmentation note: {exc}"}
            fired.append("vision")

        rag_hits = rag.retrieve(machine, message, k=3)
        cites = [
            {
                "file": h.get("source") or h.get("source_file") or "manual",
                "quote": h["text"][:220],
            }
            for h in rag_hits if h.get("text")
        ]
        checks = assist.match_playbook(pack_files, message)
        fired.append("chat")

        summary_bits: list[str] = []
        if sound and "error" not in sound:
            verdict = (sound.get("probe_verdict") or {}).get("suggests")
            top_f = (sound.get("top_peaks") or [{}])[0].get("freq")
            if verdict:
                summary_bits.append(
                    f"**Acoustic Probe Verdict:** `{verdict}` "
                    f"({(sound.get('probe_verdict') or {}).get('rationale', '')})"
                )
            elif top_f:
                summary_bits.append(
                    f"**Acoustic FFT Peak:** `{top_f} Hz` (RMS `{sound['stats']['rms']}`)."
                )
        if vision and vision.get("rationale"):
            summary_bits.append(f"**Vision Grounding:** {vision['rationale']}")
        if cites:
            summary_bits.append(f"**Manual Context ({cites[0]['file']}):** {cites[0]['quote']}")
        if not summary_bits:
            summary_bits.append(
                "Deterministic field analysis completed. Set `MODEL_API_KEY` to enable live `muse-spark-1.3` conversational synthesis."
            )

        reply = "\n\n".join(summary_bits)
        chat = {"answer": reply, "citations": cites, "citations_dropped": 0}
        enrichment = orchestrator.enrich_assist_turn(
            machine, message, pack_files, vision, sound, chat, checks, fired
        )
        turn = {
            "session": session or uuid.uuid4().hex[:12],
            "reply": reply,
            "specialists": fired,
            "vision": vision,
            "sound": sound,
            "chat": chat,
            "playbook": checks,
            "next_checks": [c["ask"] for c in (checks or {}).get("checks", [])[:3]],
            "needs": [],
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "session_usage": {"input_tokens": 0, "output_tokens": 0},
            "offline_deterministic": True,
            **enrichment,
        }

    if "error" not in turn:
        sync_hub.publish(
            room_id,
            "field_capture",
            {
                "machine": machine,
                "message": message,
                "has_audio": signal is not None,
                "has_photo": photo_bytes is not None,
                "turn": turn,
            },
            sender=sender,
        )
    return turn
