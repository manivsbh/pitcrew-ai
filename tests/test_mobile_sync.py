"""End-to-end tests for Mobile Field Companion pairing, QR SVG encoding,
HTTPS tunnel URL management, real-time WebSocket + REST room sync, and
resilient mobile field capture (with offline deterministic fallback).
"""
from __future__ import annotations

import io
import math
import struct
import wave

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from backend.app.main import app
from backend.app.mobile_sync import encode_qr_matrix, encode_qr_svg, stop_https_tunnel


client = TestClient(app)


def _make_fault_wav_bytes(freq_hz: float = 162.0, fs: int = 8000, duration_s: float = 0.6) -> bytes:
    """Synthesize a 16-bit PCM mono WAV with harmonic impulses."""
    n = int(fs * duration_s)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(fs)
        samples = []
        period = max(1, int(fs / freq_hz))
        for i in range(n):
            carrier = 0.25 * math.sin(2.0 * math.pi * 1200.0 * (i / fs))
            impulse = 0.65 if (i % period) < 4 else 0.0
            val = max(-0.98, min(0.98, carrier + impulse))
            samples.append(int(val * 32767))
        wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    return buf.getvalue()


def _make_test_png_bytes() -> bytes:
    img = Image.new("RGB", (160, 160), (28, 32, 38))
    draw = ImageDraw.Draw(img)
    draw.ellipse((28, 28, 132, 132), outline=(220, 170, 60), width=8)
    draw.ellipse((58, 58, 102, 102), fill=(110, 125, 145))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_qr_encoder_matrix_and_svg_endpoint() -> None:
    url = "https://demo-stage.trycloudflare.com/?room=STAGE1&mobile=1"
    mat = encode_qr_matrix(url)
    size = len(mat)
    assert size >= 29 and (size - 17) % 4 == 0
    # Top-left, top-right, bottom-left 7x7 finder corners must have dark outer border
    for c in range(7):
        assert mat[0][c] is True
        assert mat[6][c] is True
        assert mat[0][size - 7 + c] is True
        assert mat[size - 7][c] is True
    # Center of top-left finder (3,3) is dark
    assert mat[3][3] is True

    svg = encode_qr_svg(url)
    assert svg.startswith("<svg ") and svg.endswith("</svg>")
    assert "<rect " in svg

    r = client.get("/api/mobile/qr.svg", params={"url": url})
    assert r.status_code == 200
    assert "image/svg+xml" in r.headers["content-type"]
    assert "<svg" in r.text

    # Empty or oversized QR URLs fail cleanly with 400
    assert client.get("/api/mobile/qr.svg", params={"url": ""}).status_code == 400
    assert client.get("/api/mobile/qr.svg", params={"url": "https://x.io/" + "a" * 300}).status_code == 400


def test_mobile_connection_info_and_custom_https_url() -> None:
    stop_https_tunnel()
    info = client.get("/api/mobile/info", params={"room": "stage-alpha"}).json()
    assert info["room_id"] == "STAGE-ALPHA"
    assert "mobile=1" in info["recommended_url"]
    assert isinstance(info["lan_ips"], list)

    # Reject non-http(s) URL
    bad = client.post("/api/mobile/tunnel/url", json={"url": "ftp://invalid.example.com"}).json()
    assert "error" in bad

    # Set custom HTTPS tunnel URL (e.g., cloudflared / ngrok / Tailscale Funnel)
    t_res = client.post(
        "/api/mobile/tunnel/url",
        json={"url": "https://meta-stage.trycloudflare.com/"},
    ).json()
    assert t_res["status"] == "ready"
    assert t_res["url"] == "https://meta-stage.trycloudflare.com"

    info_https = client.get("/api/mobile/info", params={"room": "stage-alpha"}).json()
    assert info_https["is_https"] is True
    assert info_https["recommended_url"] == "https://meta-stage.trycloudflare.com/?room=STAGE-ALPHA&mobile=1"
    assert info_https["tunnel_companion_url"] == info_https["recommended_url"]

    # Clear custom tunnel URL
    cleared = client.post("/api/mobile/tunnel/url", json={"url": ""}).json()
    assert cleared["status"] == "idle"
    stop_https_tunnel()


def test_sync_hub_polling_cursor_and_peer_presence() -> None:
    room = "TESTROOM01"
    # Mobile peer polls -> triggers peer_joined event and registers presence
    p1 = client.get(
        f"/api/sync/{room}",
        params={"since": 0, "peer_id": "mob_iphone15", "role": "mobile", "device": "iPhone Safari"},
    ).json()
    assert p1["room_id"] == room
    assert any(p["peer_id"] == "mob_iphone15" and p["role"] == "mobile" for p in p1["peers"])
    assert any(e["type"] == "peer_joined" for e in p1["events"])
    seq1 = p1["seq"]

    # Desktop switches active machine -> mobile incremental poll receives only new events
    pub = client.post(
        f"/api/sync/{room}/event",
        json={"type": "machine_switched", "payload": {"machine": "pump"}, "sender": "desk_mac"},
    ).json()
    assert pub["seq"] > seq1

    p2 = client.get(f"/api/sync/{room}", params={"since": seq1}).json()
    assert p2["machine"] == "pump"
    assert len(p2["events"]) == 1
    assert p2["events"][0]["type"] == "machine_switched"
    assert p2["events"][0]["payload"]["machine"] == "pump"


def test_websocket_bidirectional_desktop_mobile_sync() -> None:
    room = "WSROOM99"
    with client.websocket_connect(
        f"/ws/sync/{room}?peer_id=desk_main&role=desktop&device=MacStudio"
    ) as ws_desktop:
        welcome_d = ws_desktop.receive_json()
        assert welcome_d["type"] == "welcome"
        assert welcome_d["room_id"] == room

        with client.websocket_connect(
            f"/ws/sync/{room}?peer_id=mob_pixel&role=mobile&device=Pixel9"
        ) as ws_mobile:
            # Mobile join broadcasts peer_joined to already-connected desktop!
            joined_evt = ws_desktop.receive_json()
            assert joined_evt["type"] == "peer_joined"
            assert joined_evt["payload"]["peer_id"] == "mob_pixel"

            welcome_m = ws_mobile.receive_json()
            assert welcome_m["type"] == "welcome"

            # Mobile selects a fault on 3D Twin -> Desktop receives fault_selected in real time
            ws_mobile.send_json({
                "type": "fault_selected",
                "payload": {"machine": "rig", "fault_id": "outer_ring_damage"},
            })
            evt_d = ws_desktop.receive_json()
            assert evt_d["type"] == "fault_selected"
            assert evt_d["payload"]["fault_id"] == "outer_ring_damage"
            # Mobile also receives the canonical sequenced room event
            evt_m = ws_mobile.receive_json()
            assert evt_m["type"] == "fault_selected"
            assert evt_m["seq"] == evt_d["seq"]

            # Heartbeat ping -> pong
            ws_mobile.send_json({"type": "ping"})
            pong = ws_mobile.receive_json()
            assert pong["type"] == "pong"
            assert len(pong["peers"]) >= 2


def test_mobile_capture_offline_deterministic_syncs_to_room(monkeypatch) -> None:
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.setattr(
        "backend.app.segment.segment_photo",
        lambda _b: {
            "regions": [{"id": 1, "area": 420, "bbox": [10, 10, 80, 80]}],
            "overlay_b64": "ZmFrZV9vdmVybGF5",
        },
    )
    room = "CAPTUREROOM7"
    baseline = client.get(f"/api/sync/{room}", params={"since": 0}).json()["seq"]

    wav_bytes = _make_fault_wav_bytes(freq_hz=162.0)
    png_bytes = _make_test_png_bytes()
    resp = client.post(
        "/api/mobile/capture",
        data={
            "room_id": room,
            "machine": "rig",
            "message": "Outer bearing ring grinding noise at 1800 RPM",
            "rpm": "1800",
            "sender": "mob_field_1",
        },
        files={
            "wav": ("probe.wav", wav_bytes, "audio/wav"),
            "photo": ("bearing.png", png_bytes, "image/png"),
        },
    )
    assert resp.status_code == 200
    turn = resp.json()
    assert "error" not in turn
    assert turn.get("offline_deterministic") is True
    assert "sound" in turn["specialists"]
    assert "vision" in turn["specialists"]
    assert turn["sound"] is not None
    assert turn["vision"]["regions"] == 1
    assert len(turn["chat"]["citations"]) >= 1
    assert turn.get("acoustic_series") is not None
    assert len(turn["acoustic_series"]["x"]) > 10

    # Confirm Desktop room feed received the field_capture broadcast automatically
    polled = client.get(f"/api/sync/{room}", params={"since": baseline}).json()
    captures = [e for e in polled["events"] if e["type"] == "field_capture"]
    assert len(captures) == 1
    assert captures[0]["sender"] == "mob_field_1"
    assert captures[0]["payload"]["has_audio"] is True
    assert captures[0]["payload"]["has_photo"] is True
    assert captures[0]["payload"]["turn"]["session"] == turn["session"]


def test_mobile_capture_and_assembly_validation_guards(monkeypatch) -> None:
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.setattr(
        "backend.app.segment.segment_photo",
        lambda _b: {
            "regions": [{"id": 1, "area": 500, "bbox": [12, 12, 90, 90]}],
            "overlay_b64": "ZmFrZV9hc3NlbWJseQ==",
            "image_size": [160, 160],
            "device": "cpu",
            "elapsed_ms": 15,
        },
    )
    room = "GUARDROOM"

    # Empty WAV rejected
    r_empty = client.post(
        "/api/mobile/capture",
        data={"room_id": room, "machine": "rig", "message": "check"},
        files={"wav": ("empty.wav", b"", "audio/wav")},
    ).json()
    assert "error" in r_empty

    # Unknown machine pack rejected cleanly
    r_unknown = client.post(
        "/api/mobile/capture",
        data={"room_id": room, "machine": "nonexistent_turbine_999", "message": "check"},
    ).json()
    assert "error" in r_unknown

    # Mobile assembly guide photo grounding broadcasts assembly_grounded event
    png_bytes = _make_test_png_bytes()
    r_asm = client.post(
        "/api/mobile/assembly-guide",
        data={"room_id": room, "machine": "rig", "sender": "mob_cam"},
        files={"photo": ("bench.png", png_bytes, "image/png")},
    )
    assert r_asm.status_code == 200
    body = r_asm.json()
    assert "error" not in body
    assert "steps" in body

    sync_state = client.get(f"/api/sync/{room}", params={"since": 0}).json()
    assert any(e["type"] == "assembly_grounded" for e in sync_state["events"])
