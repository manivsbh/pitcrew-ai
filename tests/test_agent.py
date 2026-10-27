"""Agent-loop tests. No network: the model client is stubbed.

Covers tool validation, finding consistency, leakage guards, loop caps,
stalls, retries, and trace replay.
"""

import json

import numpy as np
import pytest

from _fakes import FakeDocs, FakeStore, refs, synth_recording
from backend.app import tools as T
from backend.app.agent import load_trace, run, save_trace
from backend.app.config import MAX_TOOL_CALLS


def ctx():
    return T.ToolContext(FakeStore(), FakeDocs(), refs())


# ---- tool validation ----

def test_schemas_well_formed():
    assert len(T.TOOL_SCHEMAS) == 5
    for s in T.TOOL_SCHEMAS:
        assert T.TOOL_NAME_RE.match(s["name"])
        assert "." not in s["name"]
        assert s["parameters"]["type"] == "object"


def test_analyze_rejects_bad_inputs():
    c = ctx()
    assert T.execute("analyze_vibration", {"recording_id": "nope",
                                           "analysis": "time_stats"}, c)["status"] == "error"
    assert T.execute("analyze_vibration", {"recording_id": "rec_0001",
                                           "analysis": "bogus"}, c)["status"] == "error"
    assert T.execute("analyze_vibration", {"recording_id": "rec_0001",
                                           "analysis": "envelope"}, c)["status"] == "error"
    assert T.execute("analyze_vibration", {"recording_id": "rec_0001",
                                           "analysis": "envelope", "band_lo": 400,
                                           "band_hi": 100}, c)["status"] == "error"


def test_analyze_happy_paths():
    c = ctx()
    for kind, extra in [("time_stats", {}), ("spectrum", {}),
                        ("psd", {"nperseg": 1024}),
                        ("envelope", {"band_lo": 50, "band_hi": 200}),
                        ("fault_match", {"band_lo": 50, "band_hi": 200})]:
        r = T.execute("analyze_vibration", {"recording_id": "rec_0001",
                                            "analysis": kind, **extra}, c)
        assert r["status"] == "success", (kind, r)
        assert r["artifacts"] and r["data"]


def test_compare_and_docs():
    c = ctx()
    r = T.execute("compare_reference", {"recording_id": "rec_0001"}, c)
    assert r["status"] == "success" and "rms" in r["data"]["comparison"]
    r = T.execute("compare_reference", {"recording_id": "rec_0001",
                                        "metric": "bogus"}, c)
    assert r["status"] == "error"
    r = T.execute("read_documentation", {"topic": "geometry"}, c)
    assert r["status"] == "success"
    r = T.execute("read_documentation", {"topic": "bogus"}, c)
    assert r["status"] == "error"
    assert T.execute("nope", {}, c)["status"] == "error"


def test_submit_validation():
    c = ctx()
    T.execute("analyze_vibration", {"recording_id": "rec_0001",
                                    "analysis": "time_stats"}, c)
    good = {"hypothesis": "healthy", "component": "none",
            "evidence_ids": ["ev_0001"], "reasoning": "r",
            "contradictions": "c", "next_measurement": "n"}
    assert T.execute("submit_finding", good, c)["status"] == "success"
    bad_component = dict(good, hypothesis="outer_ring_damage",
                         component="ring_inner")
    assert T.execute("submit_finding", bad_component, c)["status"] == "error"
    bad_ev = dict(good, evidence_ids=["ev_9999"])
    assert T.execute("submit_finding", bad_ev, c)["status"] == "error"
    bad_h = dict(good, hypothesis="bogus")
    assert T.execute("submit_finding", bad_h, c)["status"] == "error"
    empty = dict(good, reasoning="  ")
    assert T.execute("submit_finding", empty, c)["status"] == "error"


def test_docs_store_clean():
    from backend.app.docs_store import DocsStore
    docs = DocsStore()
    assert set(docs.topics()) == {"operating-conditions",
                                  "test-rig-6203-geometry", "sampling"}


def test_tool_crash_becomes_error_result():
    class BrokenStore(FakeStore):
        def load(self, rid):
            raise RuntimeError("disk gone")

    c = T.ToolContext(BrokenStore(), FakeDocs(), refs())
    r = T.execute("analyze_vibration", {"recording_id": "rec_0001",
                                        "analysis": "time_stats"}, c)
    assert r["status"] == "error" and "RuntimeError" in r["summary"]


# ---- loop mechanics (stubbed model) ----

class Call:
    def __init__(self, name, args, call_id="call_1"):
        self.type = "function_call"
        self.name = name
        self.arguments = args if isinstance(args, str) else json.dumps(args)
        self.call_id = call_id


class Usage:
    input_tokens = 10
    output_tokens = 5
    input_tokens_details = type("D", (), {"cached_tokens": 1})()


class Resp:
    def __init__(self, output, text="", rid="resp_1"):
        self.output = output
        self.output_text = text
        self.id = rid
        self.usage = Usage()


class StubResponses:
    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class StubClient:
    def __init__(self, script):
        self.responses = StubResponses(script)


def test_loop_happy_path(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    script = [
        Resp([Call("inspect_recording", {"recording_id": "rec_0001"})]),
        Resp([Call("analyze_vibration", {"recording_id": "rec_0001",
                                        "analysis": "time_stats"})]),
        Resp([Call("submit_finding",
                   {"hypothesis": "healthy", "component": "none",
                    "evidence_ids": ["ev_0001", "ev_0002"], "reasoning": "r",
                    "contradictions": "c", "next_measurement": "n"})]),
    ]
    client = StubClient(script)
    trace = run(FakeStore(), FakeDocs(), {}, "rec_0001", "q",
                client_factory=lambda: client)
    assert trace["status"] == "complete"
    assert trace["finding"]["hypothesis"] == "healthy"
    assert trace["usage"] == {"input_tokens": 30, "output_tokens": 15,
                              "cached_tokens": 3}
    kws = client.responses.calls
    assert all(k["parallel_tool_calls"] is False for k in kws)
    assert len(kws[0]["tools"]) == 5
    assert kws[0]["previous_response_id"] is None
    assert kws[1]["previous_response_id"] == "resp_1"
    json.dumps(trace)  # serializable


def test_loop_tool_cap(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    script = [Resp([Call("inspect_recording", {"recording_id": "rec_0001"})],
                   rid=f"r{i}") for i in range(20)]
    trace = run(FakeStore(), FakeDocs(), {}, "rec_0001", "q",
                client_factory=lambda: StubClient(script))
    assert trace["status"] == "incomplete"
    assert "cap" in trace["incomplete_reason"]
    assert sum(1 for s in trace["steps"] if s["type"] == "tool") == MAX_TOOL_CALLS


def test_loop_text_stall_and_timeout(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    trace = run(FakeStore(), FakeDocs(), {}, "rec_0001", "q",
                client_factory=lambda: StubClient(
                    [Resp([], text="hmm"), Resp([], text="still hmm")]))
    assert trace["status"] == "incomplete" and "stall" in trace["incomplete_reason"]
    trace = run(FakeStore(), FakeDocs(), {}, "rec_0001", "q",
                client_factory=lambda: StubClient([]), timeout_s=0)
    assert "timeout" in trace["incomplete_reason"]


def test_loop_retry_then_fail(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    RateLimit = type("RateLimitError", (Exception,), {})
    BadReq = type("BadRequestError", (Exception,), {})
    trace = run(FakeStore(), FakeDocs(), {}, "rec_0001", "q",
                client_factory=lambda: StubClient(
                    [RateLimit("slow"), Resp([], text="a"), Resp([], text="b")]))
    assert "stall" in trace["incomplete_reason"]  # retried, then stalled
    trace = run(FakeStore(), FakeDocs(), {}, "rec_0001", "q",
                client_factory=lambda: StubClient([BadReq("bad")]))
    assert "api_error" in trace["incomplete_reason"]


def test_submit_rejection_continues(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    script = [
        Resp([Call("submit_finding",
                   {"hypothesis": "healthy", "component": "ring_outer",
                    "evidence_ids": ["ev_9999"], "reasoning": "r",
                    "contradictions": "c", "next_measurement": "n"})]),
        Resp([Call("inspect_recording", {"recording_id": "rec_0001"})]),
        Resp([Call("submit_finding",
                   {"hypothesis": "insufficient_evidence", "component": "none",
                    "evidence_ids": ["ev_0001"], "reasoning": "r",
                    "contradictions": "c", "next_measurement": "measure speed"})]),
    ]
    trace = run(FakeStore(), FakeDocs(), {}, "rec_0001", "q",
                client_factory=lambda: StubClient(script))
    assert trace["status"] == "complete"
    assert trace["finding"]["hypothesis"] == "insufficient_evidence"


def test_trace_replay(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    trace = {"investigation_id": "inv_x", "steps": [{"a": 1}]}
    path = save_trace(trace, reports_dir=str(tmp_path))
    assert load_trace("inv_x", reports_dir=str(tmp_path)) == trace
    assert path.endswith("inv_x.json")


def test_agent_view_has_no_bearing_code(tmp_path):
    import os

    from backend.app.store import Store
    sample = "data/recordings/K001/N09_M07_F10_K001_1.mat"
    if not os.path.exists(sample):
        pytest.skip("sample absent")
    store = Store(registry_path=str(tmp_path / "reg.json"))
    rid = store.import_case("K001/N09_M07_F10_K001_1.mat")["recording_id"]
    blob = json.dumps(store.agent_view(rid))
    assert "K001" not in blob and "k001" not in blob
