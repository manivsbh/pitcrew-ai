"""API tests via TestClient. No network, no model calls."""

import os

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)
SAMPLE_CASE = "K001/N09_M07_F10_K001_1.mat"


def needs_sample():
    return pytest.mark.skipif(
        not os.path.exists(f"data/recordings/{SAMPLE_CASE}"),
        reason="sample recording absent")


def test_health_and_cases():
    assert client.get("/api/health").json() == {"status": "ok"}
    assert "cases" in client.get("/api/cases").json()


@needs_sample()
def test_import_waveform_and_evidence_roundtrip():
    rid = client.post("/api/recordings/import",
                      json={"case": SAMPLE_CASE}).json()["recording_id"]
    assert rid.startswith("rec_")
    # importing twice returns the same opaque id
    rid2 = client.post("/api/recordings/import",
                       json={"case": SAMPLE_CASE}).json()["recording_id"]
    assert rid == rid2
    wf = client.get(f"/api/recordings/{rid}/waveform?max_points=1000").json()
    assert len(wf["x"]) == len(wf["y"]) <= 1000
    assert wf["fs"] > 60000
    # determinism: same bytes twice
    wf2 = client.get(f"/api/recordings/{rid}/waveform?max_points=1000").json()
    assert wf == wf2


@needs_sample()
def test_evidence_recompute_deterministic():
    import json as _json

    from backend.app.agent import save_trace
    from backend.app.store import Store
    store = Store()
    rid = store.import_case(SAMPLE_CASE)["recording_id"]
    trace = {"investigation_id": "inv_testev", "recording_id": rid,
             "evidence": {"ev_0001": {"kind": "envelope", "peaks": [],
                                      "settings": {"band_lo": 2000.0,
                                                   "band_hi": 6000.0}}}}
    save_trace(trace)
    try:
        r1 = client.get("/api/evidence/inv_testev/ev_0001").json()
        r2 = client.get("/api/evidence/inv_testev/ev_0001").json()
    finally:
        os.remove("data/reports/inv_testev.json")
    assert r1 == r2
    assert r1["kind"] == "envelope" and len(r1["x"]) > 1000
    assert r1["xlabel"].startswith("Envelope")


def test_unknown_ids_return_errors():
    assert "error" in client.post("/api/recordings/import",
                                  json={"case": "../x.mat"}).json()
    assert "error" in client.post("/api/recordings/import",
                                  json={"case": "nope.mat"}).json()
    assert "error" in client.get("/api/recordings/rec_9999/waveform").json()
    assert "error" in client.get("/api/investigations/job_9999").json()
    assert "error" in client.get("/api/evidence/inv_nope/ev_0001").json()
    assert "error" in client.get("/api/report/inv_nope").json()
    assert "error" in client.post("/api/investigations",
                                  json={"recording_id": "rec_9999",
                                        "question": "q"}).json()
