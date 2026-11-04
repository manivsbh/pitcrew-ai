"""Local Meta open-weights speech: wav2vec 2.0 (speech-to-text) and MMS-TTS (voice).

Both run on CPU in-process; weights download from Hugging Face on first use
(wav2vec2-base-960h ~360 MB, Apache-2.0; mms-tts-eng ~145 MB, CC-BY-NC-4.0).
Every call is logged in the Meta call log like the API calls.
"""

from __future__ import annotations

import io
import re
import threading
import time

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

ASR_MODEL = "facebook/wav2vec2-base-960h"
TTS_MODEL = "facebook/mms-tts-eng"
ASR_RATE = 16_000
MAX_SPEECH_S = 15
MAX_TTS_CHARS = 400

_lock = threading.Lock()
_asr = None
_tts = None


def _load_asr():
    global _asr
    with _lock:
        if _asr is None:
            from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
            _asr = (Wav2Vec2Processor.from_pretrained(ASR_MODEL),
                    Wav2Vec2ForCTC.from_pretrained(ASR_MODEL).eval())
    return _asr


def _load_tts():
    global _tts
    with _lock:
        if _tts is None:
            from transformers import AutoTokenizer, VitsModel
            _tts = (AutoTokenizer.from_pretrained(TTS_MODEL),
                    VitsModel.from_pretrained(TTS_MODEL).eval())
    return _tts


def _mono_16k(data: bytes) -> np.ndarray:
    fs, raw = wavfile.read(io.BytesIO(data))
    x = raw.astype(np.float64)
    if np.issubdtype(raw.dtype, np.integer):
        x /= float(np.iinfo(raw.dtype).max)
    if x.ndim > 1:
        x = x.mean(axis=1)
    if fs != ASR_RATE:
        g = int(np.gcd(int(fs), ASR_RATE))
        x = resample_poly(x, ASR_RATE // g, int(fs) // g)
    x = x[: ASR_RATE * MAX_SPEECH_S]
    peak = float(np.abs(x).max()) if x.size else 0.0
    return (x / peak * 0.9 if peak > 1e-4 else x).astype(np.float32)


def transcribe(data: bytes) -> dict:
    """WAV bytes -> lower-case English transcript."""
    import torch

    from . import meta_calls
    x = _mono_16k(data)
    proc, model = _load_asr()
    t0 = time.monotonic()
    inputs = proc(x, sampling_rate=ASR_RATE, return_tensors="pt")
    with torch.no_grad(), meta_calls.inflight(
            "wav2vec2-base-960h", "local-cpu", agent="speech-to-text"):
        ids = model(inputs.input_values).logits.argmax(dim=-1)
    text = digits_from_words(proc.batch_decode(ids)[0].strip().lower())
    ms = (time.monotonic() - t0) * 1000
    meta_calls.record(model="wav2vec2-base-960h", host="local-cpu", status="ok",
                      latency_ms=ms, agent="speech-to-text",
                      detail=f"{len(x) / ASR_RATE:.1f}s audio, {len(text.split())} words")
    return {"text": text, "elapsed_ms": int(ms), "model": ASR_MODEL}


_ONES = ("zero one two three four five six seven eight nine ten eleven twelve "
         "thirteen fourteen fifteen sixteen seventeen eighteen nineteen").split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
_UNITS = {"rpm": "r p m", "hz": "hertz", "khz": "kilohertz", "mm": "millimetres",
          "nm": "newton metres", "kw": "kilowatts", "db": "decibels",
          "snr": "signal to noise", "bpfo": "outer race frequency",
          "bpfi": "inner race frequency", "fft": "f f t", "po": "purchase order"}


_WORD_VALUES = {w: i for i, w in enumerate(_ONES)} | {
    w: 10 * i for i, w in enumerate(_TENS) if w != "_"}
_SCALES = {"hundred": 100, "thousand": 1000, "million": 1_000_000}


def digits_from_words(text: str) -> str:
    """'increase speed by twenty per cent' -> 'increase speed by 20%'."""
    out: list[str] = []
    total = current = 0
    in_num = False

    def flush() -> None:
        nonlocal total, current, in_num
        if in_num:
            out.append(str(total + current))
        total = current = 0
        in_num = False

    for word in text.split():
        if word in _WORD_VALUES:
            current += _WORD_VALUES[word]
            in_num = True
        elif word in _SCALES and in_num:
            if _SCALES[word] == 100:
                current *= 100
            else:
                total += max(current, 1) * _SCALES[word]
                current = 0
        else:
            flush()
            out.append(word)
    flush()
    joined = " ".join(out)
    return re.sub(r"(\d) (?:per cent|percent)\b", r"\1%", joined)


def _int_words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + ("" if n % 10 == 0 else " " + _ONES[n % 10])
    for size, word in ((1_000_000, "million"), (1000, "thousand"), (100, "hundred")):
        if n >= size:
            rest = n % size
            return (f"{_int_words(n // size)} {word}"
                    + (f" {_int_words(rest)}" if rest else ""))
    return str(n)


def _number_words(m: re.Match) -> str:
    whole, _, frac = m.group(0).replace(",", "").partition(".")
    words = _int_words(int(whole)) if len(whole) < 10 else whole
    if frac:
        words += " point " + " ".join(_ONES[int(d)] for d in frac[:3])
    return f" {words} "


def speakable(text: str) -> str:
    """Normalize copilot markdown into words the MMS English vocabulary covers."""
    t = re.sub(r"\[[^\]]*\]|`|[*_#>|]", " ", text)
    t = t.replace("%", " percent ").replace("&", " and ").replace("$", " dollars ")
    t = re.sub(r"(\d)([a-zA-Z])", r"\1 \2", t)
    t = re.sub(r"\d[\d,]*(?:\.\d+)?", _number_words, t)
    t = re.sub(r"[A-Za-z]+", lambda m: _UNITS.get(m.group(0).lower(), m.group(0)), t)
    t = re.sub(r"[^a-zA-Z' .,?!-]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()[:MAX_TTS_CHARS]


def speak(text: str) -> bytes:
    """Text -> 16-bit mono WAV bytes in the MMS-TTS English voice."""
    import torch

    from . import meta_calls
    words = speakable(text)
    if not words:
        raise ValueError("nothing speakable in text")
    tok, model = _load_tts()
    t0 = time.monotonic()
    inputs = tok(words, return_tensors="pt")
    with torch.no_grad(), meta_calls.inflight("mms-tts-eng", "local-cpu",
                                              agent="voice"):
        wave = model(**inputs).waveform[0].numpy()
    ms = (time.monotonic() - t0) * 1000
    rate = int(model.config.sampling_rate)
    meta_calls.record(model="mms-tts-eng", host="local-cpu", status="ok",
                      latency_ms=ms, agent="voice",
                      detail=f"{len(words.split())} words, {len(wave) / rate:.1f}s audio")
    pcm = (np.clip(wave, -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    wavfile.write(buf, rate, pcm)
    return buf.getvalue()
