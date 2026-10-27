"""Deterministic numerical vibration analyses.

Pure functions over loaded recordings: no model calls, no network, no hidden
state. Every tolerance, window, and filter setting is an explicit parameter.
Conventions (see docs-pack/excerpts/):

- Sampling rates are derived per channel from the file's own time vector and
  sanity-checked against nominal (64 kHz fast, 4 kHz slow).
- Bearing geometry is the verified FAG 6203 table; matching tolerance is
  +/-2% per the paper's cross-manufacturer statement.
- Kurtosis is excess kurtosis (normal distribution = 0); a pure sine = -1.5.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

import numpy as np
from scipy import signal as sp_signal
from scipy.io import loadmat
from scipy.stats import kurtosis as sp_kurtosis

GEOMETRY_6203 = {
    "pitch_dia_mm": 28.55,
    "ball_dia_mm": 6.75,
    "n_elements": 8,
    "contact_angle_deg": 0.0,
}
GEOMETRY_TOL = 0.02
FS_VIBRATION_NOMINAL = 64000.0
FS_SLOW_NOMINAL = 4000.0
FS_DEVIATION_WARN = 0.01
G_TO_MS2 = 9.80665

OPERATING_CONDITIONS = {
    "N15_M07_F10": {"rpm": 1500.0, "torque_nm": 0.7, "force_n": 1000.0},
    "N09_M07_F10": {"rpm": 900.0, "torque_nm": 0.7, "force_n": 1000.0},
    "N15_M01_F10": {"rpm": 1500.0, "torque_nm": 0.1, "force_n": 1000.0},
    "N15_M07_F04": {"rpm": 1500.0, "torque_nm": 0.7, "force_n": 400.0},
}

_FILENAME_RE = re.compile(r"^(N\d+_M\d+_F\d+)_([A-Z]+\d+)_(\d+)\.mat$")


@dataclass
class Channel:
    name: str
    data: np.ndarray
    fs: float | None  # None when the time base is unusable
    unit: str | None  # None when undocumented; never guessed


@dataclass
class Recording:
    path: str
    condition: str | None
    bearing: str | None
    repetition: int | None
    channels: dict[str, Channel] = field(default_factory=dict)
    speed_rpm: float | None = None
    limitations: list[str] = field(default_factory=list)


def parse_filename(path: str) -> tuple[str | None, str | None, int | None]:
    m = _FILENAME_RE.match(os.path.basename(path))
    if not m:
        return None, None, None
    return m.group(1), m.group(2), int(m.group(3))


def _time_fs(t: np.ndarray) -> float | None:
    t = np.asarray(t, dtype=float).ravel()
    if t.size < 2 or not np.all(np.isfinite(t)):
        return None
    span = t[-1] - t[0]
    if span <= 0:
        return None
    return (t.size - 1) / span


def load_recording(path: str) -> Recording:
    """Load one Paderborn .mat file into channels with derived sample rates."""
    d = loadmat(path)
    keys = [k for k in d if not k.startswith("__")]
    if len(keys) != 1:
        raise ValueError(f"expected one dataset, found {keys}")
    s = d[keys[0]][0, 0]
    condition, bearing, rep = parse_filename(path)
    rec = Recording(path=path, condition=condition, bearing=bearing, repetition=rep)

    xs = s["X"]
    for i in range(s["Y"].shape[1]):
        y = s["Y"][0, i]
        name = str(y["Name"][0]) if y["Name"].size else f"ch{i}"
        data = np.asarray(y["Data"], dtype=float).ravel()
        unit = str(y["Unit"][0]).strip() or None if y["Unit"].size else None
        fs: float | None = None
        for j in range(xs.shape[1]):
            t = np.asarray(xs[0, j]["Data"]).ravel()
            if t.size == data.size:
                fs = _time_fs(t)
                break
        if fs is None:
            rec.limitations.append(f"{name}: no matching time base; rate unknown")
        else:
            nominal = FS_VIBRATION_NOMINAL if fs > 10000 else FS_SLOW_NOMINAL
            if data.size >= 1000 and abs(fs - nominal) / nominal > FS_DEVIATION_WARN:
                rec.limitations.append(
                    f"{name}: derived rate {fs:.1f} Hz differs >1% from {nominal:.0f}"
                )
        if unit is None:
            rec.limitations.append(f"{name}: unit undocumented; no conversion applied")
        rec.channels[name] = Channel(name=name, data=data, fs=fs, unit=unit)

    if "speed" in rec.channels:
        spd = rec.channels["speed"].data
        if spd.size and np.all(np.isfinite(spd)):
            rec.speed_rpm = float(np.mean(spd))
    if rec.speed_rpm is None:
        rec.limitations.append("speed unavailable; fault frequencies withheld")
    return rec


def quality_checks(rec: Recording) -> list[str]:
    """Finite samples, duration, rate, flatness. Returns human findings."""
    out: list[str] = list(rec.limitations)
    for ch in rec.channels.values():
        if ch.data.size == 0:
            out.append(f"{ch.name}: empty")
            continue
        if not np.all(np.isfinite(ch.data)):
            out.append(f"{ch.name}: non-finite samples present")
        if np.all(ch.data == ch.data.flat[0]):
            out.append(f"{ch.name}: flat signal (constant value)")
        if ch.fs is not None:
            out.append(f"{ch.name}: n={ch.data.size} fs={ch.fs:.1f} "
                       f"dur={ch.data.size / ch.fs:.3f}s")
    return out


def time_stats(x: np.ndarray) -> dict[str, float | None]:
    """RMS, crest factor, excess kurtosis.

    JSON-safe: undefined values (crest of a flat signal, kurtosis of a
    constant) are None, never inf or nan, so traces stay strict JSON.
    """
    x = np.asarray(x, dtype=float).ravel()
    rms = float(np.sqrt(np.mean(x**2)))
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    crest = peak / rms if rms > 0 else None
    kurt: float | None = None
    if x.size > 3:
        with np.errstate(all="ignore"):
            k = float(sp_kurtosis(x, fisher=True, bias=False))
        kurt = k if np.isfinite(k) else None
    return {"rms": rms, "crest": crest, "kurtosis_excess": kurt, "peak": peak}


def spectrum(x: np.ndarray, fs: float) -> tuple[np.ndarray, np.ndarray]:
    """Windowed magnitude spectrum (Hann, rfft). For peak comparison."""
    x = np.asarray(x, dtype=float).ravel()
    w = np.hanning(x.size)
    mag = np.abs(np.fft.rfft(x * w))
    freqs = np.fft.rfftfreq(x.size, 1.0 / fs)
    return freqs, mag


def psd_welch(x: np.ndarray, fs: float, nperseg: int = 65536
              ) -> tuple[np.ndarray, np.ndarray]:
    """Welch power spectral density with explicit segment length."""
    return sp_signal.welch(x, fs=fs, nperseg=min(nperseg, x.size))


def envelope_spectrum(x: np.ndarray, fs: float, band_lo: float, band_hi: float,
                      order: int = 4) -> tuple[np.ndarray, np.ndarray, dict]:
    """Bandpass + Hilbert envelope spectrum. Band edges are required."""
    if not 0 < band_lo < band_hi < fs / 2:
        raise ValueError(f"band ({band_lo}, {band_hi}) outside (0, {fs / 2})")
    sos = sp_signal.butter(order, [band_lo, band_hi], btype="band", fs=fs,
                           output="sos")
    filt = sp_signal.sosfiltfilt(sos, x)
    env = np.abs(sp_signal.hilbert(filt))
    env = env - np.mean(env)
    freqs, mag = spectrum(env, fs)
    settings = {"band_lo": band_lo, "band_hi": band_hi, "order": order,
                "method": "butter-bandpass+sosfiltfilt+hilbert"}
    return freqs, mag, settings


def fault_frequencies(rpm: float, geometry: dict = GEOMETRY_6203) -> dict[str, float]:
    """Outer/inner-ring fault frequencies for a rotating inner ring."""
    fr = rpm / 60.0
    n = geometry["n_elements"]
    ratio = (geometry["ball_dia_mm"] / geometry["pitch_dia_mm"]) * np.cos(
        np.deg2rad(geometry["contact_angle_deg"]))
    return {
        "fr": fr,
        "bpfo": (n / 2) * fr * (1 - ratio),
        "bpfi": (n / 2) * fr * (1 + ratio),
    }


def match_peaks(freqs: np.ndarray, mag: np.ndarray, targets: dict[str, float],
                tol: float = GEOMETRY_TOL) -> dict[str, dict | None]:
    """Strongest bin within +/-tol of each target; None when absent."""
    hits: dict[str, dict | None] = {}
    for label, f0 in targets.items():
        lo, hi = f0 * (1 - tol), f0 * (1 + tol)
        idx = np.where((freqs >= lo) & (freqs <= hi))[0]
        if idx.size == 0:
            hits[label] = None
            continue
        k = idx[int(np.argmax(mag[idx]))]
        hits[label] = {"freq": float(freqs[k]), "amp": float(mag[k]),
                       "target": float(f0)}
    return hits


def reference_compare(stats: dict[str, float],
                      refs: list[dict[str, float]]) -> dict[str, dict]:
    """Deviation of stats from same-condition healthy references (z-scores)."""
    out: dict[str, dict] = {}
    for metric, value in stats.items():
        vals = np.array([r[metric] for r in refs if metric in r], dtype=float)
        if vals.size < 2:
            out[metric] = {"value": value, "z": None,
                           "note": "fewer than 2 references"}
            continue
        mu, sd = float(np.mean(vals)), float(np.std(vals, ddof=1))
        out[metric] = {"value": value, "ref_mean": mu, "ref_std": sd,
                       "z": (value - mu) / sd if sd > 0 else None}
    return out


def g_to_ms2(x: float) -> float:
    return x * G_TO_MS2
