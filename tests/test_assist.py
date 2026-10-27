"""Supervisor + specialists tests. Stub model only, no network calls."""

import io
import json
import os

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.io import wavfile

import backend.app.main as main
from backend.app.assist import (assist_turn, load_pack_files, parse_signal_csv,
                                parse_wav, sound_analyze)

client = TestClient(main.app)

REAL_QUOTE = "Turn off power and manually rotate pump shaft."


class ScriptedClient:
    def __init__(self, script):
        self.script = script
        self.calls = []

    @property
    def responses(self):
        outer = self

        class R:
            @staticmethod
            def create(**kwargs):
                return outer._create(**kwargs)
        return R()

    def _create(self, **kwargs):
        text = json.dumps(kwargs.get("input", ""))
        self.calls.append(text)
        if "Which registry part" in text:
            return _Out(self.script["vision"])
        if "Excerpts:" in text:
            return _Out(self.script["chat"])
        return _Out(self.script["supervisor"])


class _Out:
    def __init__(self, payload):
        self.output_text = json.dumps(payload)


@pytest.fixture()
def script():
    return {
        "vision": {"part_id": "shaft-seal", "confidence": 0.9,
                   "rationale": "Cartridge visible."},
        "chat": {"answer": "Rotate the shaft by hand.",
                 "citations": [{"file": "io-diagnosing-problems.md",
                                "quote": REAL_QUOTE}]},
        "supervisor": {"reply": "Fused reply.", "next_checks": ["Check seal."],
                       "needs": []},
    }


@pytest.fixture()
def factory(script):
    holder = {}
    def make():
        client = ScriptedClient(script)
        holder["client"] = client
        return client
    make.holder = holder
    return make


@pytest.fixture()
def pack():
    return load_pack_files("cr-pump")


def test_chat_citation_verified_and_fabricated_dropped(factory, script, pack,
                                                       tmp_path, monkeypatch):
    import backend.app.assist as assist_mod
    monkeypatch.setattr(assist_mod, "SESSIONS_DIR", str(tmp_path))
    out = assist_turn("cr-pump", "Pump blocked?", factory)
    assert out["chat"]["citations"][0]["file"] == "io-diagnosing-problems.md"
    assert out["chat"]["citations_dropped"] == 0
    script["chat"]["citations"].append(
        {"file": "io-diagnosing-problems.md", "quote": "Forty-two widgets."})
    out2 = assist_turn("cr-pump", "Pump blocked?", factory)
    assert out2["chat"]["citations_dropped"] == 1
    assert len(out2["chat"]["citations"]) == 1


def test_vision_rejects_unknown_id(factory, script, pack, tmp_path,
                                   monkeypatch):
    import backend.app.assist as assist_mod
    monkeypatch.setattr(assist_mod, "SESSIONS_DIR", str(tmp_path))
    script["vision"]["part_id"] = "ghost-part"
    out = assist_turn("cr-pump", "What is this?", factory,
                      photo=b"fake-jpeg-bytes")
    assert out["vision"]["part_id"] is None
    assert out["specialists"] == ["vision", "chat", "supervisor"]


def test_supervisor_skipped_for_chat_only(factory, pack, tmp_path,
                                          monkeypatch):
    import backend.app.assist as assist_mod
    monkeypatch.setattr(assist_mod, "SESSIONS_DIR", str(tmp_path))
    out = assist_turn("cr-pump", "How do I prime?", factory)
    assert out["specialists"] == ["chat"]
    assert out["reply"] == "Rotate the shaft by hand."
    assert factory.holder["client"].calls and len(
        factory.holder["client"].calls) == 1


def test_playbook_attached_on_symptom(factory, pack, tmp_path, monkeypatch):
    import backend.app.assist as assist_mod
    monkeypatch.setattr(assist_mod, "SESSIONS_DIR", str(tmp_path))
    out = assist_turn(
        "cr-pump", "The pump runs but delivers no water, reduced performance",
        factory)
    assert out["playbook"]["id"] == "pump-low-performance"
    assert len(out["playbook"]["checks"]) == 4


def test_unknown_machine_errors(factory):
    assert "error" in assist_turn("nope", "hi", factory)


def test_sound_csv_finds_tone():
    fs = 1000.0
    t = np.arange(4000) / fs
    csv = "\n".join(f"{v:.6f}" for v in np.sin(2 * np.pi * 50 * t))
    out = sound_analyze(parse_signal_csv(csv), fs, None, "cr-pump")
    assert out["top_peaks"][0]["freq"] == pytest.approx(50, abs=2)
    assert out["stats"]["rms"] == pytest.approx(0.707, abs=0.05)


def test_sound_wav_and_rig_targets():
    fs = 8000
    t = np.arange(fs * 2) / fs
    buf = io.BytesIO()
    wavfile.write(buf, fs, (np.sin(2 * np.pi * 440 * t) * 30000).astype("int16"))
    x, fs2 = parse_wav(buf.getvalue())
    assert fs2 == 8000
    out = sound_analyze(x, fs2, 1500.0, "rig")
    assert out["top_peaks"][0]["freq"] == pytest.approx(440, abs=5)
    assert set(out["targets"]) == {"fr", "bpfi", "bpfo"}
    assert set(out["hits"]) == {"fr", "bpfi", "bpfo"}


def test_assist_endpoints(monkeypatch, tmp_path, script):
    import backend.app.assist as assist_mod
    monkeypatch.setattr(assist_mod, "SESSIONS_DIR", str(tmp_path))
    monkeypatch.setenv("MODEL_API_KEY", "test-key")
    holder = {}
    def fake_factory(key):
        assert key == "test-key"
        client = ScriptedClient(script)
        holder["c"] = client
        return client
    monkeypatch.setattr(main, "default_client_factory", fake_factory)
    r = client.post("/api/assist", data={"machine": "cr-pump",
                                         "message": "Pump blocked?"})
    assert "specialists" in r.json(), r.json()
    session = r.json()["session"]
    h = client.get(f"/api/assist/{session}").json()
    assert len(h["turns"]) == 2
    r2 = client.post("/api/assist",
                     data={"machine": "cr-pump", "message": "And now?",
                           "session": session})
    assert r2.json()["session"] == session
    assert "error" in client.get("/api/assist/nope").json()
    assert "error" in client.post("/api/assist", data={"machine": "nope",
                                                       "message": "hi"}).json()
    r3 = client.post("/api/assist", data={"machine": "rig", "message": "look",
                                           "fs": "1000"},
                     files={"photo": ("p.jpg", b"bytes", "image/jpeg"),
                            "signal_csv": ("s.csv", "0.1\n0.2\n",
                                           "text/csv")})
    assert r3.json()["specialists"][0] == "vision"
    assert "error" in r3.json()["sound"]  # 2 samples < 64 minimum


def test_assist_needs_key(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    r = client.post("/api/assist", data={"machine": "rig", "message": "hi"})
    assert "error" in r.json()
