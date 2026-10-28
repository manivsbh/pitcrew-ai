"""Supervisor + 3 specialists (P4b). Turn-based assist over machine packs.

- Vision specialist: photo -> registry part id (model, image input).
- Sound specialist: vibration CSV / WAV audio -> deterministic spectral
  summary (+ rig fault-frequency matching when rpm is given).
- Chat specialist: manual Q&A over pack excerpts with verified citations.
- Supervisor: routes, runs specialists, synthesizes one cited reply.
"""

from __future__ import annotations

import io
import json
import os
import re
import uuid

import numpy as np
from scipy.io import wavfile

from . import analysis
from .packs import PACKS_DIR

SESSIONS_DIR = "data/assist"
ASSIST_PROMPT_VERSION = "assist-v1"
_WS = re.compile(r"\s+")


def norm(s: str) -> str:
    return _WS.sub(" ", s).strip().lower()


def one_shot(client_factory, system: str, text: str,
             image: bytes | None = None,
             usage: dict | None = None) -> str:
    """One bounded model call, optional JPEG/PNG image. May raise.

    When `usage` is given, the call's token counts accumulate into it
    (missing usage attributes count as zero, for stub clients).
    """
    import base64

    from .config import MODEL_ID, REASONING_EFFORT
    content: list[dict] = [{"type": "input_text", "text": text}]
    if image is not None:
        b64 = base64.b64encode(image).decode()
        content.append({"type": "input_image",
                        "image_url": f"data:image/jpeg;base64,{b64}"})
    resp = client_factory().responses.create(
        model=MODEL_ID, instructions=system,
        input=[{"role": "user", "content": content}],
        reasoning={"effort": REASONING_EFFORT})
    if usage is not None:
        u = getattr(resp, "usage", None)
        usage["input_tokens"] += getattr(u, "input_tokens", 0) or 0
        usage["output_tokens"] += getattr(u, "output_tokens", 0) or 0
    return getattr(resp, "output_text", "") or ""


def parse_json_blob(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def load_pack_files(machine: str) -> dict | None:
    if "/" in machine or machine.startswith("."):
        return None
    base = os.path.join(PACKS_DIR, machine)
    comp = os.path.join(base, "components.json")
    if not os.path.isfile(comp):
        return None
    with open(comp) as f:
        components = json.load(f)
    excerpts: dict[str, str] = {}
    exdir = os.path.join(base, "excerpts")
    if os.path.isdir(exdir):
        for fn in sorted(os.listdir(exdir)):
            if fn.endswith(".md"):
                with open(os.path.join(exdir, fn)) as f:
                    excerpts[fn] = f.read()
    playbooks: list[dict] = []
    pb = os.path.join(base, "playbooks.json")
    if os.path.isfile(pb):
        with open(pb) as f:
            playbooks = json.load(f)
    return {"components": components, "excerpts": excerpts,
            "playbooks": playbooks}


VISION_SYSTEM = (
    "You identify machine parts in photos. Reply with JSON only: "
    '{"part_id": "<registry id or null>", "confidence": 0.0-1.0, '
    '"rationale": "one sentence"}. Use null when unsure; never guess an '
    "id not in the registry.")


def vision_identify(pack: dict, image: bytes, client_factory,
                    usage: dict | None = None) -> dict:
    reg = [{"id": c["id"], "name": c["name"], "pos": c.get("pos")}
           for c in pack["components"]]
    prompt = ("Registry:\n" + json.dumps(reg) +
              "\n\nWhich registry part is shown in this photo?")
    try:
        data = parse_json_blob(one_shot(client_factory, VISION_SYSTEM,
                                        prompt, image, usage))
    except Exception:
        data = None
    ids = {c["id"] for c in pack["components"]}
    part_id = (data or {}).get("part_id")
    if part_id not in ids:
        part_id = None
    conf = float((data or {}).get("confidence", 0.0) or 0.0)
    return {"part_id": part_id, "confidence": min(max(conf, 0.0), 1.0),
            "rationale": str((data or {}).get("rationale", ""))[:300]}


def top_peaks(freqs: np.ndarray, mag: np.ndarray, n: int = 5) -> list[dict]:
    idx = np.argsort(mag)[::-1][: n * 3]
    peaks: list[dict] = []
    for i in idx:
        f = float(freqs[i])
        if f < 1.0:
            continue
        if all(abs(f - p["freq"]) > max(2.0, f * 0.02) for p in peaks):
            peaks.append({"freq": round(f, 2), "amp": float(mag[i])})
        if len(peaks) >= n:
            break
    return peaks


def sound_analyze(x: np.ndarray, fs: float, rpm: float | None,
                  machine: str) -> dict:
    """Deterministic spectral summary. Never calls the model."""
    x = np.asarray(x, dtype=np.float64).ravel()
    x = x[np.isfinite(x)]
    if x.size < 64 or fs <= 0:
        return {"error": "too few finite samples"}
    dur = x.size / fs
    freqs, mag = analysis.spectrum(x, fs)
    out: dict = {"n_samples": int(x.size), "fs": fs,
                 "duration_s": round(dur, 3),
                 "stats": analysis.time_stats(x),
                 "top_peaks": top_peaks(freqs, mag)}
    if machine == "rig" and rpm:
        targets = analysis.fault_frequencies(rpm)
        out["targets"] = targets
        out["hits"] = analysis.match_peaks(freqs, mag, targets)
    return out


def parse_signal_csv(text: str) -> np.ndarray:
    vals: list[float] = []
    for line in text.splitlines():
        line = line.strip().rstrip(",")
        if not line:
            continue
        try:
            vals.append(float(line.split(",")[0]))
        except ValueError:
            continue
    return np.array(vals, dtype=np.float64)


def parse_wav(data: bytes) -> tuple[np.ndarray, float]:
    fs, arr = wavfile.read(io.BytesIO(data))
    a = np.asarray(arr, dtype=np.float64)
    if a.ndim > 1:
        a = a.mean(axis=1)
    peak = np.abs(a).max()
    if peak > 0:
        a = a / peak
    return a, float(fs)


CHAT_SYSTEM = (
    "You answer technician questions using ONLY the manual excerpts below. "
    "Reply with JSON only: "
    '{"answer": "markdown, concise", "citations": '
    '[{"file": "<excerpt filename>", "quote": "<exact substring from it>"}]}. '
    "Every factual claim needs a citation. If the excerpts do not cover "
    "the question, say so in the answer and leave citations empty.")


def chat_answer(pack: dict, message: str, history: list[dict],
                client_factory, usage: dict | None = None) -> dict:
    bundle = "\n\n".join(f"=== {fn} ===\n{text[:6000]}"
                         for fn, text in pack["excerpts"].items())
    turns = "\n".join(f"{t['role']}: {t['text'][:500]}"
                      for t in history[-6:])
    prompt = (f"Excerpts:\n{bundle}\n\nConversation:\n{turns}\n"
              f"Technician: {message}")
    try:
        data = parse_json_blob(one_shot(client_factory, CHAT_SYSTEM, prompt,
                                        None, usage))
    except Exception:
        data = None
    answer = str((data or {}).get("answer", ""))[:4000]
    cites, dropped = [], 0
    for cite in (data or {}).get("citations", []) or []:
        fn, quote = cite.get("file", ""), str(cite.get("quote", ""))
        body = pack["excerpts"].get(fn, "")
        if body and len(quote) >= 20 and norm(quote) in norm(body):
            cites.append({"file": fn, "quote": quote[:400]})
        else:
            dropped += 1
    if not answer:
        answer = "I could not produce a grounded answer from the manual."
    return {"answer": answer, "citations": cites,
            "citations_dropped": dropped}


SUPERVISOR_SYSTEM = (
    "You are the supervising technician agent. Fuse the specialist outputs "
    "into one concise reply for the technician. Reply with JSON only: "
    '{"reply": "markdown", "next_checks": ["short follow-ups"], '
    '"needs": ["missing inputs, if any"]}. Never invent part names, '
    "numbers, or procedures beyond the specialist outputs.")


def match_playbook(pack: dict, message: str) -> dict | None:
    words = set(re.findall(r"[a-z]{3,}", message.lower()))
    best, best_score = None, 0
    for pb in pack["playbooks"]:
        sym = set(re.findall(r"[a-z]{3,}", pb["symptom"].lower()))
        score = len(words & sym)
        if score > best_score:
            best, best_score = pb, score
    if best is None or best_score < 2:
        return None
    return {"id": best["id"], "symptom": best["symptom"],
            "checks": best["checks"][:4],
            "n_checks_total": len(best["checks"])}


def _session_path(session: str) -> str | None:
    if "/" in session or session.startswith("."):
        return None
    return os.path.join(SESSIONS_DIR, f"{session}.json")


def load_session(session: str) -> dict | None:
    path = _session_path(session)
    if path is None or not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def save_session(sess: dict) -> None:
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    path = _session_path(sess["session"])
    assert path is not None
    with open(path, "w") as f:
        json.dump(sess, f)


def assist_turn(machine: str, message: str, client_factory,
                session: str | None = None,
                photo: bytes | None = None,
                signal: tuple[np.ndarray, float] | None = None,
                rpm: float | None = None) -> dict:
    """One turn-based supervisor round. Returns the reply + traces."""
    pack = load_pack_files(machine)
    if pack is None:
        return {"error": f"unknown machine pack {machine}"}
    sess = load_session(session) if session else None
    if sess is None:
        from .config import MODEL_ID
        sess = {"session": session or uuid.uuid4().hex[:12],
                "machine": machine, "turns": [],
                "model_id": MODEL_ID,
                "prompt_version": ASSIST_PROMPT_VERSION,
                "usage": {"input_tokens": 0, "output_tokens": 0}}
    history = [{"role": t["role"], "text": t["text"]}
               for t in sess["turns"][-6:]]
    fired: list[str] = []
    turn_usage = {"input_tokens": 0, "output_tokens": 0}
    vision = sound = None
    if photo is not None:
        vision = vision_identify(pack, photo, client_factory, turn_usage)
        fired.append("vision")
    if signal is not None:
        x, fs = signal
        sound = sound_analyze(x, fs, rpm, machine)
        fired.append("sound")
    chat = chat_answer(pack, message, history, client_factory, turn_usage)
    fired.append("chat")
    checks = match_playbook(pack, message)
    if len(fired) > 1:
        brief = json.dumps({"technician": message, "vision": vision,
                            "sound": sound, "chat": chat,
                            "playbook": (checks or {}).get("symptom")})
        try:
            fused = parse_json_blob(one_shot(client_factory,
                                             SUPERVISOR_SYSTEM, brief,
                                             None, turn_usage))
        except Exception:
            fused = None
        reply = (fused or {}).get("reply") or chat["answer"]
        next_checks = list((fused or {}).get("next_checks", []) or [])[:5]
        needs = list((fused or {}).get("needs", []) or [])[:5]
        fired.append("supervisor")
    else:
        reply, next_checks, needs = chat["answer"], [], []
    sess["turns"].append({"role": "user", "text": message})
    sess["turns"].append({"role": "assistant", "text": reply,
                          "specialists": fired})
    total = sess.setdefault("usage", {"input_tokens": 0, "output_tokens": 0})
    total["input_tokens"] += turn_usage["input_tokens"]
    total["output_tokens"] += turn_usage["output_tokens"]
    save_session(sess)
    return {"session": sess["session"], "reply": reply,
            "specialists": fired, "vision": vision, "sound": sound,
            "chat": chat, "playbook": checks, "next_checks": next_checks,
            "needs": needs, "usage": turn_usage,
            "session_usage": dict(total)}
