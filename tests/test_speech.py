"""Speech helpers + endpoints. Models are stubbed: no downloads, no audio."""

from fastapi.testclient import TestClient

from backend.app import speech
from backend.app.main import app

client = TestClient(app)


def test_digits_from_words_restores_command_numbers():
    assert speech.digits_from_words("increase speed by twenty per cent") == \
        "increase speed by 20%"
    assert speech.digits_from_words("set shaft diameter to forty five") == \
        "set shaft diameter to 45"
    assert speech.digits_from_words("run at one thousand seven hundred fifty rpm") == \
        "run at 1750 rpm"


def test_speakable_spells_numbers_and_units():
    out = speech.speakable("**Verdict:** BPFO SNR 356.8 at 1500 rpm (95%)")
    assert "three hundred fifty six point eight" in out
    assert "one thousand five hundred r p m" in out
    assert "ninety five percent" in out
    assert "*" not in out and "(" not in out


def test_speech_endpoints(monkeypatch):
    monkeypatch.setattr(speech, "transcribe", lambda data: {"text": "check the pump"})
    monkeypatch.setattr(speech, "speak", lambda text: b"RIFFfake")
    r = client.post("/api/speech/transcribe",
                    files={"audio": ("v.wav", b"RIFF....", "audio/wav")})
    assert r.json() == {"text": "check the pump"}
    r = client.post("/api/speech/speak", json={"text": "hello"})
    assert r.headers["content-type"] == "audio/wav" and r.content == b"RIFFfake"
    assert "error" in client.post(
        "/api/speech/transcribe", files={"audio": ("v.wav", b"", "audio/wav")}).json()
