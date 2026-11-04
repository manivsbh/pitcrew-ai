"""Narrate script2.json with ElevenLabs (Bella) and save word timings.

Usage: .venv\\Scripts\\python.exe submission/video/tts_bella.py
Writes submission/video/edit/assets/voice2/<scene>.mp3 and <scene>.words.json
([{text, start, end}] in seconds). Skips scenes already voiced. Key: ELEVENLABS_API_KEY in .env.
"""

from __future__ import annotations

import base64
import json
import urllib.request
from pathlib import Path

from dotenv import dotenv_values

HERE = Path(__file__).parent
KEY = dotenv_values(HERE.parents[1] / ".env")["ELEVENLABS_API_KEY"].strip()
VOICE = "hpp4J3VqNfWAUOO0d1Us"
OUT = HERE / "edit" / "assets" / "voice2"


def words(al: dict) -> list[dict]:
    out, cur = [], None
    for ch, s, e in zip(al["characters"], al["character_start_times_seconds"],
                        al["character_end_times_seconds"]):
        if ch.isspace():
            if cur:
                out.append(cur)
            cur = None
            continue
        if cur is None:
            cur = {"text": ch, "start": round(s, 3), "end": round(e, 3)}
        else:
            cur["text"] += ch
            cur["end"] = round(e, 3)
    if cur:
        out.append(cur)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    script = json.loads((HERE / "script2.json").read_text(encoding="utf-8"))
    for sc in script["scenes"]:
        mp3 = OUT / f"{sc['id']}.mp3"
        if mp3.exists():
            print("skip", sc["id"])
            continue
        body = json.dumps({"text": sc["text"], "model_id": "eleven_multilingual_v2",
                           "voice_settings": {"stability": 0.45, "similarity_boost": 0.75,
                                              "style": 0.25, "use_speaker_boost": True}}).encode()
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps"
            "?output_format=mp3_44100_128",
            data=body, headers={"xi-api-key": KEY, "Content-Type": "application/json"})
        data = json.load(urllib.request.urlopen(req, timeout=90))
        mp3.write_bytes(base64.b64decode(data["audio_base64"]))
        w = words(data["alignment"])
        (OUT / f"{sc['id']}.words.json").write_text(json.dumps(w, indent=1), encoding="utf-8")
        print("voiced", sc["id"], f"{w[-1]['end']:.1f}s" if w else "", flush=True)


if __name__ == "__main__":
    main()
