"""Latency budgets and model-call accounting. No network: all model
clients are stubbed. Complements evals/latency.md (recorded + replayed
measurements) with fast regression tests.
"""

import json
import sys
import time

import numpy as np

sys.path.insert(0, "scripts")

from _fakes import (Channel, FakeDocs, FakeStore, Recording, refs,
                    synth_recording)
from backend.app.agent import run
from run_eval import arm_baseline, arm_fixed


def _wideband_recording():
    """Synthetic recording with fs high enough for the 2-8 kHz band."""
    fs = 20000.0
    t = np.arange(8000) / fs
    vib = np.sin(2 * np.pi * 150 * t)
    channels = {"vibration_1": Channel("vibration_1", vib, fs, "g")}
    return Recording(path="synthetic", condition="N15_M07_F10",
                     bearing="K000", repetition=1, channels=channels,
                     speed_rpm=1500.0)


class _Usage:
    input_tokens = 10
    output_tokens = 5


class _Call:
    type = "function_call"

    def __init__(self, name, args):
        self.name = name
        self.arguments = json.dumps(args)
        self.call_id = f"c-{name}"


class _Resp:
    def __init__(self, output, text=""):
        self.output = output
        self.output_text = text
        self.id = "resp_x"
        self.usage = _Usage()


class _StubResponses:
    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        return self.script.pop(0)


class _StubClient:
    def __init__(self, script):
        self.responses = _StubResponses(script)


def test_baseline_arm_under_budget_offline():
    t0 = time.monotonic()
    pred = arm_baseline(_wideband_recording())
    dt = time.monotonic() - t0
    assert pred["hypothesis"] in ("healthy", "outer_ring_damage",
                                  "inner_ring_damage",
                                  "insufficient_evidence")
    assert dt < 2.0, dt
    assert pred["latency_s"] < 2.0


def _fixed_client(text):
    return _StubClient([_Resp([], text=text)])


def test_fixed_arm_makes_exactly_one_model_call():
    client = _fixed_client(json.dumps(
        {"hypothesis": "healthy", "component": "none", "reasoning": "r",
         "contradictions": "c", "next_measurement": "n"}))
    pred = arm_fixed(client, _wideband_recording())
    assert pred["hypothesis"] == "healthy"
    assert len(client.responses.calls) == 1
    kw = client.responses.calls[0]
    assert kw["text"]["format"]["name"] == "Finding"


def test_fixed_arm_abstains_on_invalid_output():
    client = _fixed_client("not json {{{")
    pred = arm_fixed(client, _wideband_recording())
    assert pred["hypothesis"] == "insufficient_evidence"
    assert len(client.responses.calls) == 1
    mismatch = _fixed_client(json.dumps(
        {"hypothesis": "outer_ring_damage", "component": "ring_inner",
         "reasoning": "r", "contradictions": "c", "next_measurement": "n"}))
    pred2 = arm_fixed(mismatch, _wideband_recording())
    assert pred2["hypothesis"] == "insufficient_evidence"


def test_loop_rounds_bounded_by_cap(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    script = [_Resp([_Call("inspect_recording",
                           {"recording_id": "rec_0001"})])] * 20
    client = _StubClient(script)
    trace = run(FakeStore(), FakeDocs(), {}, "rec_0001", "q",
                client_factory=lambda: client, max_calls=4)
    assert "cap" in trace["incomplete_reason"]
    assert len(client.responses.calls) == 5  # 4 tools + the capped 5th round
    assert trace["latency_s"] >= 0


def test_loop_timeout_records_latency(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    trace = run(FakeStore(), FakeDocs(), {}, "rec_0001", "q",
                client_factory=lambda: _StubClient([]), timeout_s=0)
    assert "timeout" in trace["incomplete_reason"]
    assert trace["latency_s"] == 0.0


def test_profiler_stats_helpers():
    from run_eval import majority  # noqa: F401 (import surface check)
    import profile_latency as P
    assert P._pct([], 0.95) == 0.0
    assert P._pct([1.0, 2.0, 3.0, 4.0], 0.50) == 3.0
    rows = [{"split": "val", "arm": "fixed", "latency_s": float(i),
             "input_tokens": 10, "output_tokens": 5} for i in range(1, 5)]
    s = P.arm_stats(rows, "val", "fixed")
    assert (s["n"], s["mean"], s["max"]) == (4, 2.5, 4.0)
