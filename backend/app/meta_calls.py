"""Live log of Meta model calls: muse-spark-1.3 over api.meta.ai and local SAM 2.1.

Every production model client is wrapped here, so each `responses.create`
lands in an in-memory ring buffer (served by GET /api/meta/calls and drawn by
the UI call log) and prints one `[META]` line to stdout. Nothing is persisted.
"""

from __future__ import annotations

import contextvars
import itertools
import threading
import time
from collections import deque
from contextlib import contextmanager
from urllib.parse import urlparse

MAX_CALLS = 200

_calls: deque[dict] = deque(maxlen=MAX_CALLS)
_inflight: dict[int, dict] = {}
_lock = threading.Lock()
_seq = itertools.count(1)
_role: contextvars.ContextVar[str] = contextvars.ContextVar(
    "meta_role", default="agent")


@contextmanager
def role(name: str):
    """Label calls made inside the block with the agent role `name`."""
    token = _role.set(name)
    try:
        yield
    finally:
        _role.reset(token)


def record(*, model: str, host: str, status: str, latency_ms: float,
           response_id: str | None = None, input_tokens: int = 0,
           output_tokens: int = 0, error: str | None = None,
           detail: str | None = None, agent: str | None = None) -> dict:
    entry = {
        "seq": next(_seq),
        "ts": time.time(),
        "agent": agent or _role.get(),
        "model": model,
        "host": host,
        "status": status,
        "latency_ms": int(latency_ms),
        "response_id": response_id,
        "input_tokens": int(input_tokens or 0),
        "output_tokens": int(output_tokens or 0),
        "error": error,
        "detail": detail,
    }
    with _lock:
        _calls.append(entry)
    rid = response_id or "-"
    tail = f" error={error}" if error else ""
    print(f"[META] {model} @ {host} {rid} {entry['latency_ms']}ms "
          f"in={entry['input_tokens']} out={entry['output_tokens']} "
          f"agent={entry['agent']}{tail}", flush=True)
    return entry


def recent(after: int = 0, limit: int = 50) -> list[dict]:
    with _lock:
        items = [c for c in _calls if c["seq"] > after]
    return items[-limit:]


def running() -> list[dict]:
    """Calls started but not yet finished, oldest first."""
    now = time.time()
    with _lock:
        return [{**c, "elapsed_ms": int((now - c["started"]) * 1000)}
                for c in _inflight.values()]


@contextmanager
def inflight(model: str, host: str, agent: str | None = None):
    """Mark a model call as running so the UI can show who is working."""
    key = next(_seq)
    entry = {"agent": agent or _role.get(), "model": model, "host": host,
             "started": time.time()}
    with _lock:
        _inflight[key] = entry
    try:
        yield
    finally:
        with _lock:
            _inflight.pop(key, None)


def clear() -> None:
    with _lock:
        _calls.clear()
        _inflight.clear()


class _RecordingResponses:
    def __init__(self, inner, host: str):
        self._inner = inner
        self._host = host

    def create(self, **kwargs):
        t0 = time.monotonic()
        try:
            with inflight(str(kwargs.get("model")), self._host):
                resp = self._inner.create(**kwargs)
        except Exception as exc:
            record(model=str(kwargs.get("model")), host=self._host,
                   status="error", error=type(exc).__name__,
                   latency_ms=(time.monotonic() - t0) * 1000)
            raise
        usage = getattr(resp, "usage", None)
        record(model=str(getattr(resp, "model", None) or kwargs.get("model")),
               host=self._host, status="ok",
               latency_ms=(time.monotonic() - t0) * 1000,
               response_id=getattr(resp, "id", None),
               input_tokens=getattr(usage, "input_tokens", 0) or 0,
               output_tokens=getattr(usage, "output_tokens", 0) or 0)
        return resp

    def __getattr__(self, name):
        return getattr(self._inner, name)


class RecordingClient:
    """Pass-through client whose `responses.create` is logged."""

    def __init__(self, inner, base_url: str):
        self._inner = inner
        self.responses = _RecordingResponses(
            inner.responses, urlparse(base_url).netloc or base_url)

    def __getattr__(self, name):
        return getattr(self._inner, name)
