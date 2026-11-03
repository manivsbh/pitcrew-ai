"""Inspectable evidence series. Recomputed deterministically on demand.

Traces persist summaries (peaks, settings); full plot series are recomputed
from the recording plus the recorded parameters, so plots always match the
numbers the agent saw. Decimation is a fixed stride (deterministic); peaks
are computed on the full arrays before decimation.
"""

from __future__ import annotations

import numpy as np

from . import analysis as A

MAX_POINTS = 16384


def _decimate(x: np.ndarray, y: np.ndarray) -> tuple[list, list]:
    n = x.size
    stride = max(1, -(-n // MAX_POINTS))
    return ([round(float(v), 4) for v in x[::stride]],
            [round(float(v), 4) for v in y[::stride]])


def series_for(recording, item: dict) -> dict:
    """Recompute plot series for a trace evidence item."""
    kind = item.get("kind")
    ch = recording.channels.get("vibration_1")
    if ch is None or ch.fs is None:
        return {"kind": kind, "error": "no vibration series available"}
    x, fs = ch.data, ch.fs
    if kind == "spectrum":
        f, m = A.spectrum(x, fs)
        label = ("Frequency (Hz)", "Magnitude")
    elif kind == "psd":
        f, m = A.psd_welch(x, fs, nperseg=item.get("nperseg", 65536))
        label = ("Frequency (Hz)", "Power/Frequency")
    elif kind in ("envelope", "fault_match"):
        s = item.get("settings", {})
        f, m, _ = A.envelope_spectrum(x, fs, s["band_lo"], s["band_hi"])
        label = ("Envelope frequency (Hz)", "Magnitude")
    elif kind == "band_probe" and item.get("best"):
        b = item["best"]
        f, m, _ = A.envelope_spectrum(x, fs, b["band_lo"], b["band_hi"])
        label = (f"Envelope frequency (Hz), band {b['band_lo']:.0f}-"
                 f"{b['band_hi']:.0f} Hz", "Magnitude")
        keep = f <= 600.0  # fault lines + harmonics live well below 600 Hz
        f, m = f[keep], m[keep]
    else:
        return {"kind": kind, "data": item}
    xs, ys = _decimate(f, m)
    out = {"kind": kind, "x": xs, "y": ys, "xlabel": label[0],
           "ylabel": label[1], "peaks": item.get("peaks", [])}
    if kind == "fault_match":
        out["targets"] = item.get("targets", {})
        out["hits"] = item.get("hits", {})
    if kind == "band_probe":
        t = item.get("targets", {})
        out["targets"] = {k: t[k] for k in ("bpfo", "bpfi") if k in t}
        out["bands"] = item.get("bands", [])
        out["verdict"] = item.get("verdict")
    return out


def waveform(recording, max_points: int = 8000) -> dict:
    ch = recording.channels.get("vibration_1")
    if ch is None or ch.fs is None:
        return {"error": "no vibration series available"}
    n = ch.data.size
    stride = max(1, -(-n // max(100, min(max_points, 60000))))
    t = np.arange(n) / ch.fs
    return {"x": [round(float(v), 5) for v in t[::stride]],
            "y": [round(float(v), 5) for v in ch.data[::stride]],
            "fs": ch.fs, "unit": ch.unit, "n": n,
            "xlabel": "Time (s)", "ylabel": "Acceleration"}
