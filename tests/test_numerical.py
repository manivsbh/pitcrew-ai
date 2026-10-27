"""Numerical tests: synthetic-signal verification + real-file import.

Synthetic tests use exact known signals; the real-file test is skipped when
the sample recording is absent (fresh environments without data).
"""

import os

import numpy as np
import pytest

from backend.app.analysis import (
    envelope_spectrum,
    fault_frequencies,
    g_to_ms2,
    load_recording,
    match_peaks,
    quality_checks,
    reference_compare,
    spectrum,
    time_stats,
)

FS = 64000.0
SAMPLE = "data/recordings/K001/N09_M07_F10_K001_1.mat"


def tone(freq: float, dur: float = 4.0, amp: float = 1.0):
    t = np.arange(int(FS * dur)) / FS
    return t, amp * np.sin(2 * np.pi * freq * t)


def test_tone_peak_location_and_repeatability():
    _, x = tone(123.64)
    f1, m1 = spectrum(x, FS)
    f2, m2 = spectrum(x, FS)
    assert np.array_equal(m1, m2)  # deterministic
    peak = f1[int(np.argmax(m1))]
    assert abs(peak - 123.64) < 0.5


def test_sine_time_stats():
    _, x = tone(100.0, amp=2.0)
    s = time_stats(x)
    assert s["rms"] == pytest.approx(2.0 / np.sqrt(2), rel=1e-3)
    assert s["crest"] == pytest.approx(np.sqrt(2), rel=1e-3)
    assert s["kurtosis_excess"] == pytest.approx(-1.5, abs=0.02)


def test_envelope_recovers_modulation():
    t = np.arange(int(FS * 4.0)) / FS
    x = (1 + 0.5 * np.sin(2 * np.pi * 123.64 * t)) * np.sin(2 * np.pi * 3000 * t)
    f, m, settings = envelope_spectrum(x, FS, 2000.0, 4000.0)
    assert settings["band_lo"] == 2000.0
    peak = f[int(np.argmax(m[1:])) + 1]
    assert abs(peak - 123.64) < 1.0


def test_envelope_rejects_bad_band():
    _, x = tone(100.0, dur=0.5)
    with pytest.raises(ValueError):
        envelope_spectrum(x, FS, 4000.0, 2000.0)
    with pytest.raises(ValueError):
        envelope_spectrum(x, FS, 1000.0, FS / 2)


def test_unit_conversion_exact():
    assert g_to_ms2(1.0) == 9.80665


def test_fault_frequency_math():
    ff = fault_frequencies(1500.0)
    assert ff["fr"] == pytest.approx(25.0)
    assert ff["bpfo"] == pytest.approx(76.36, abs=0.05)
    assert ff["bpfi"] == pytest.approx(123.64, abs=0.05)
    hits = match_peaks(*spectrum(tone(123.64)[1], FS), {"bpfi": ff["bpfi"]})
    assert hits["bpfi"] is not None
    assert abs(hits["bpfi"]["freq"] - 123.64) < 0.5


def test_flat_signal_quality():
    from backend.app.analysis import Channel, Recording
    r = Recording(path="synthetic", condition=None, bearing=None, repetition=None,
                  channels={"vib": Channel("vib", np.zeros(1000), 1000.0, None)})
    findings = quality_checks(r)
    assert any("flat" in f for f in findings)
    flat_stats = time_stats(np.zeros(1000))
    assert flat_stats["crest"] is None and flat_stats["kurtosis_excess"] is None
    import json as _json
    _json.dumps(flat_stats)  # strict-JSON safe
    assert "NaN" not in _json.dumps(flat_stats)


def test_reference_compare():
    refs = [{"rms": 1.0}, {"rms": 1.1}, {"rms": 0.9}]
    out = reference_compare({"rms": 1.0}, refs)
    assert out["rms"]["z"] == pytest.approx(0.0, abs=1e-9)
    out = reference_compare({"rms": 5.0}, [{"rms": 1.0}])
    assert out["rms"]["z"] is None


@pytest.mark.skipif(not os.path.exists(SAMPLE), reason="sample recording absent")
def test_real_file_import():
    rec = load_recording(SAMPLE)
    assert rec.condition == "N09_M07_F10"
    vib = rec.channels["vibration_1"]
    assert abs(vib.fs - 64000.0) / 64000.0 < 0.01
    assert abs(vib.data.size / vib.fs - 4.0) < 0.05
    assert abs(rec.speed_rpm - 900.0) < 5.0
    assert any("unit undocumented" in lim for lim in rec.limitations)
