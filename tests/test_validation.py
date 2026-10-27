"""Day-6 validation: uploads, missing-evidence paths, leakage scans, reveal.

No network, no model calls. Real-file cases skip when samples are absent.
"""

import json
import os
import re

import pytest
from fastapi.testclient import TestClient

from _fakes import FakeDocs, FakeStore, refs, synth_recording
from backend.app import tools as T
from backend.app.main import app

client = TestClient(app)
SAMPLE_CASE = "K001/N09_M07_F10_K001_1.mat"
MACHINE = "paderborn-6203-rig"
BEARING_RE = re.compile(r"\bK[AIB]?\d+")
FAULT_RE = re.compile(
    r"\b(damage[ds]?|defect[sed]?|fault[ys]?|cracks?|spall[a-z]*|pitting|pits?)\b",
    re.IGNORECASE)


def needs_sample():
    return pytest.mark.skipif(
        not os.path.exists(f"data/recordings/{SAMPLE_CASE}"),
        reason="sample recording absent")


def sine_csv(n=2000, fs=1000.0, freq=100.0):
    import numpy as np
    t = np.arange(n) / fs
    return "\n".join(f"{v:.6f}" for v in np.sin(2 * np.pi * freq * t))


# ---- CSV uploads ----

def test_upload_valid_and_flat():
    r = client.post("/api/recordings/upload", json={
        "filename": "bench01.csv", "csv_text": sine_csv(), "fs": 1000.0,
        "unit": "g", "rpm": 1500.0, "machine": MACHINE}).json()
    assert r["recording_id"].startswith("rec_") and r["n_samples"] == 2000
    wf = client.get(f"/api/recordings/{r['recording_id']}/waveform").json()
    assert wf["fs"] == 1000.0 and len(wf["x"]) > 100

    flat = client.post("/api/recordings/upload", json={
        "filename": "flat01.csv", "csv_text": "0.0\n" * 1000, "fs": 8000.0,
        "unit": "g", "rpm": 900.0, "machine": MACHINE}).json()
    assert flat["recording_id"].startswith("rec_")


def test_upload_rejections():
    base = {"filename": "ok.csv", "csv_text": sine_csv(), "fs": 8000.0,
            "unit": "g", "rpm": 1500.0, "machine": MACHINE}
    cases = [
        (dict(base, machine="other-rig"), "unsupported machine"),
        (dict(base, fs=10.0), "sampling rate"),
        (dict(base, rpm=99999.0), "speed"),
        (dict(base, filename="../evil.csv"), "filename"),
        (dict(base, filename="evil.txt"), "filename"),
        (dict(base, csv_text="1.0\nabc\n3.0\n" * 100), "non-numeric"),
        (dict(base, csv_text="1.0\n2.0\n"), "need 256"),
        (dict(base, csv_text="0 " * 1_100_000), "exceeds"),
    ]
    for payload, needle in cases:
        body = client.post("/api/recordings/upload", json=payload).json()
        assert needle in body.get("error", ""), (needle, body)


def test_missing_speed_withholds_fault_match():
    c = T.ToolContext(FakeStore(synth_recording(speed_rpm=None)), FakeDocs(),
                      refs())
    r = T.execute("analyze_vibration",
                  {"recording_id": "rec_0001", "analysis": "fault_match",
                   "band_lo": 50, "band_hi": 200}, c)
    assert r["status"] == "error" and "withheld" in r["summary"]


def test_nonfinite_analyses_refuse():
    c = T.ToolContext(FakeStore(synth_recording(nonfinite=True)), FakeDocs(),
                      refs())
    r = T.execute("analyze_vibration", {"recording_id": "rec_0001",
                                        "analysis": "time_stats"}, c)
    assert r["status"] == "error" and "non-finite" in r["summary"]


# ---- leakage scans ----

def test_tool_blobs_carry_no_labels():
    c = T.ToolContext(FakeStore(), FakeDocs(), refs())
    T.execute("inspect_recording", {"recording_id": "rec_0001"}, c)
    T.execute("analyze_vibration", {"recording_id": "rec_0001",
                                    "analysis": "time_stats"}, c)
    T.execute("compare_reference", {"recording_id": "rec_0001"}, c)
    T.execute("read_documentation", {"topic": "geometry"}, c)
    T.execute("submit_finding",
              {"hypothesis": "healthy", "component": "none",
               "evidence_ids": ["ev_0001"], "reasoning": "r",
               "contradictions": "c", "next_measurement": "n"}, c)
    blob = json.dumps(c.evidence.items)
    assert not BEARING_RE.search(blob), blob[:300]


def test_docs_pack_has_no_labels():
    from backend.app.docs_store import DocsStore  # asserts on load
    docs = DocsStore()
    for doc in docs.excerpts.values():
        assert not BEARING_RE.search(doc["text"])
        assert not FAULT_RE.search(doc["text"])


# ---- reveal ----

@needs_sample()
def test_reveal_flow():
    from backend.app.agent import save_trace
    from backend.app.store import Store
    rid = Store().import_case(SAMPLE_CASE)["recording_id"]
    trace = {"investigation_id": "inv_reveal", "recording_id": rid,
             "status": "complete",
             "finding": {"hypothesis": "healthy", "component": "none",
                        "evidence_ids": [], "reasoning": "r",
                        "contradictions": "c", "next_measurement": "n"}}
    save_trace(trace)
    try:
        r = client.post("/api/reveal",
                        json={"investigation_id": "inv_reveal"}).json()
        assert r == {"frozen": "healthy", "documented": "healthy",
                     "match": True}
        bad = dict(trace, investigation_id="inv_open",
                   status="incomplete")
        del bad["finding"]
        save_trace(bad)
        e = client.post("/api/reveal",
                        json={"investigation_id": "inv_open"}).json()
        assert "not frozen" in e["error"]
    finally:
        os.remove("data/reports/inv_reveal.json")
        os.remove("data/reports/inv_open.json")
    e = client.post("/api/reveal",
                    json={"investigation_id": "inv_nope"}).json()
    assert "unknown investigation" in e["error"]


@needs_sample()
def test_report_has_provenance():
    from backend.app.agent import save_trace
    from backend.app.store import Store
    rid = Store().import_case(SAMPLE_CASE)["recording_id"]
    save_trace({"investigation_id": "inv_rep", "recording_id": rid,
                "status": "complete", "finding": {"hypothesis": "healthy"}})
    try:
        r = client.get("/api/report/inv_rep").json()
    finally:
        os.remove("data/reports/inv_rep.json")
    assert r["investigation"]["investigation_id"] == "inv_rep"
    assert "source_hashes" in r["provenance"] and "limitations" in r["provenance"]
