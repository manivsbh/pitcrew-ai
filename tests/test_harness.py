"""Tests for Self-Evolving Harness² (multi-band probe + skill distillation)."""

import json
import numpy as np
from fastapi.testclient import TestClient

import backend.app.harness as H
from backend.app import analysis
from backend.app.main import app

client = TestClient(app)


def test_multi_band_probe_and_harness_verdicts():
    rng = np.random.default_rng(7)
    fs = 16000.0
    t = np.arange(int(fs * 3.0)) / fs
    fr = 25.0
    bpfo = 3.05 * fr

    healthy = 0.3 * np.sin(2 * np.pi * fr * t) + rng.normal(0, 0.1, t.size)
    p_h = analysis.multi_band_probe(healthy, fs, 1500.0, bands=[(500.0, 4000.0)])
    v_h = H.evaluate_probe(p_h)
    assert v_h["suggests"] == "healthy"

    # Periodic outer-race impacts at BPFO modulating 2200 Hz structural resonance
    imp = np.zeros_like(t)
    step = int(fs / bpfo)
    tau = np.arange(int(0.02 * fs)) / fs
    burst = np.exp(-450 * tau) * np.sin(2 * np.pi * 2200.0 * tau)
    for idx in range(0, t.size - burst.size, step):
        imp[idx: idx + burst.size] += burst
    outer = 0.2 * np.sin(2 * np.pi * fr * t) + imp + rng.normal(0, 0.05, t.size)
    p_o = analysis.multi_band_probe(outer, fs, 1500.0, bands=[(500.0, 4000.0)])
    v_o = H.evaluate_probe(p_o)
    assert v_o["suggests"] == "outer_ring_damage"
    assert v_o["component"] == "ring_outer"


def test_distill_lesson_scrubs_bearing_codes_and_evolves_v1(tmp_path, monkeypatch):
    monkeypatch.setattr(H, "HARNESS_DIR", str(tmp_path))
    h1 = H.reset_harness("rig", preset="v1_naive")
    assert h1["preset"] == "v1_naive"

    out = H.distill_lesson(
        machine="rig",
        predicted="healthy",
        actual="outer_ring_damage",
        reasoning="K001 z-score was negative while KA16 had quiet amplitude.",
        technician_note="K002 ultrasonic band was noisy; check BPFO harmonics.",
        investigation_id="inv_unit1",
        client_factory=None,
    )
    blob = json.dumps(out)
    assert "K001" not in blob
    assert "KA16" not in blob
    assert "K002" not in blob
    assert out["harness"]["preset"] == "v2_evolved"
    assert len(H.list_experience("rig")) == 1


def test_harness_api_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(H, "HARNESS_DIR", str(tmp_path))
    g1 = client.get("/api/harness/rig").json()
    assert g1["harness"]["machine"] == "rig"

    r_naive = client.post("/api/harness/rig/reset", json={"preset": "v1_naive"}).json()
    assert r_naive["harness"]["preset"] == "v1_naive"

    d = client.post(
        "/api/harness/rig/distill",
        json={
            "predicted": "healthy",
            "actual": "inner_ring_damage",
            "technician_note": "Check 500-4000 Hz BPFI sidebands.",
        },
    ).json()
    assert d["harness"]["preset"] == "v2_evolved"
    assert d["experience"]
