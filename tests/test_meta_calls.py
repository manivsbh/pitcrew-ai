"""Meta call log: wrapper records every responses.create. No network."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.app import meta_calls
from backend.app.main import app


class _Responses:
    def __init__(self, fail: bool = False):
        self.fail = fail

    def create(self, **kwargs):
        if self.fail:
            raise TimeoutError("boom")
        return SimpleNamespace(
            id="resp_abc123", model=kwargs["model"], output_text="ok",
            usage=SimpleNamespace(input_tokens=120, output_tokens=34))


def _client(fail: bool = False):
    inner = SimpleNamespace(responses=_Responses(fail), api_key="k")
    return meta_calls.RecordingClient(inner, "https://api.meta.ai/v1")


@pytest.fixture(autouse=True)
def _fresh_log():
    meta_calls.clear()
    yield
    meta_calls.clear()


def test_successful_call_is_recorded_with_role_and_usage(capsys):
    with meta_calls.role("investigator"):
        resp = _client().responses.create(model="muse-spark-1.3", input="hi")
    assert resp.output_text == "ok"
    [entry] = meta_calls.recent()
    assert entry["agent"] == "investigator"
    assert entry["model"] == "muse-spark-1.3"
    assert entry["host"] == "api.meta.ai"
    assert entry["response_id"] == "resp_abc123"
    assert (entry["input_tokens"], entry["output_tokens"]) == (120, 34)
    assert entry["status"] == "ok"
    assert "[META] muse-spark-1.3 @ api.meta.ai resp_abc123" in capsys.readouterr().out


def test_failed_call_is_recorded_and_reraised():
    with pytest.raises(TimeoutError):
        _client(fail=True).responses.create(model="muse-spark-1.3", input="x")
    [entry] = meta_calls.recent()
    assert entry["status"] == "error" and entry["error"] == "TimeoutError"
    assert entry["agent"] == "agent"


def test_inflight_lists_running_calls_until_they_finish():
    seen = {}

    class Slow:
        def create(self, **kwargs):
            seen["running"] = meta_calls.running()
            return SimpleNamespace(id="resp_1", model="muse-spark-1.3", usage=None)

    inner = SimpleNamespace(responses=Slow())
    client = meta_calls.RecordingClient(inner, "https://api.meta.ai/v1")
    with meta_calls.role("blueprint-reviewer"):
        client.responses.create(model="muse-spark-1.3", input="x")
    [run] = seen["running"]
    assert run["agent"] == "blueprint-reviewer" and run["model"] == "muse-spark-1.3"
    assert meta_calls.running() == []


def test_wrapper_passes_through_other_attributes():
    assert _client().api_key == "k"


def test_endpoint_returns_calls_after_cursor():
    meta_calls.record(model="sam2.1_hiera_tiny", host="local-cpu",
                      status="ok", latency_ms=812, agent="sam-segmenter")
    first = meta_calls.recent()[0]["seq"]
    meta_calls.record(model="muse-spark-1.3", host="api.meta.ai",
                      status="ok", latency_ms=2300, response_id="resp_2")
    body = TestClient(app).get("/api/meta/calls",
                               params={"after": first}).json()
    assert [c["response_id"] for c in body["calls"]] == ["resp_2"]
    assert body["model"] == "muse-spark-1.3"
    assert body["base_url"] == "https://api.meta.ai/v1"
