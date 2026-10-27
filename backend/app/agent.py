"""Bounded investigator loop over the Responses API.

One investigating agent, application-enforced caps: MAX_TOOL_CALLS tool calls,
INVESTIGATION_TIMEOUT_S wall clock, serialized turns (parallel_tool_calls
False). Every turn is recorded; the trace is the deliverable and replays
without new model calls.
"""

from __future__ import annotations

import json
import os
import time
import uuid

from .config import (API_BASE_URL, INVESTIGATION_TIMEOUT_S, MAX_TOOL_CALLS,
                     MODEL_ID, REASONING_EFFORT)
from .prompts import PROMPT_VERSION, SYSTEM_PROMPT, TERMINATION_NUDGE
from .tools import TOOL_SCHEMAS, ToolContext, execute

REPORTS_DIR = "data/reports"
_RETRYABLE = {"RateLimitError", "InternalServerError", "ServiceUnavailableError",
              "Timeout", "APITimeoutError", "APIConnectionError"}


def default_client_factory(key: str | None = None):
    from openai import OpenAI

    def make():
        return OpenAI(base_url=API_BASE_URL, api_key=key, timeout=60.0)
    return make


def _is_retryable(exc: Exception) -> bool:
    return type(exc).__name__ in _RETRYABLE


def run(store, docs, refs: dict, recording_id: str, question: str,
        client_factory=None, key: str | None = None,
        max_calls: int = MAX_TOOL_CALLS,
        timeout_s: float = INVESTIGATION_TIMEOUT_S) -> dict:
    """Run one investigation to a finding or an explicit incomplete state."""
    if client_factory is None:
        if not key:
            from .config import model_api_key
            key = model_api_key()
        client_factory = default_client_factory(key)
    client = client_factory()
    ctx = ToolContext(store, docs, refs)
    inv_id = f"inv_{uuid.uuid4().hex[:8]}"
    trace: dict = {
        "investigation_id": inv_id, "recording_id": recording_id,
        "question": question, "model_id": MODEL_ID,
        "prompt_version": PROMPT_VERSION, "status": "incomplete",
        "steps": [], "usage": {"input_tokens": 0, "output_tokens": 0,
                               "cached_tokens": 0},
    }
    t0 = time.monotonic()
    prev: str | None = None
    pending: object = f"{question}\nRecording under investigation: {recording_id}"
    calls = 0
    stalls = 0
    retried = False

    while True:
        if time.monotonic() - t0 > timeout_s:
            trace["incomplete_reason"] = (
                f"timeout after {timeout_s:.0f}s and {calls} tool calls")
            break
        try:
            resp = client.responses.create(
                model=MODEL_ID, instructions=SYSTEM_PROMPT, input=pending,
                tools=TOOL_SCHEMAS, previous_response_id=prev,
                parallel_tool_calls=False,
                reasoning={"effort": REASONING_EFFORT})
        except Exception as exc:  # noqa: BLE001 - boundary: record, maybe retry
            if not retried and _is_retryable(exc):
                retried = True
                time.sleep(5)
                continue
            trace["incomplete_reason"] = f"api_error: {type(exc).__name__}"
            break
        retried = False
        prev = resp.id
        _accumulate(trace["usage"], resp)
        fns = [i for i in resp.output
               if getattr(i, "type", None) == "function_call"]
        if not fns:
            stalls += 1
            trace["steps"].append({"turn": len(trace["steps"]) + 1,
                                   "type": "text",
                                   "text": str(resp.output_text)[:2000]})
            if stalls >= 2:
                trace["incomplete_reason"] = "stalled: no tool call or finding"
                break
            pending = TERMINATION_NUDGE
            continue
        stalls = 0
        outputs = []
        for fc in fns:
            calls += 1
            if calls > max_calls:
                trace["incomplete_reason"] = (
                    f"tool cap reached ({max_calls} calls)")
                break
            try:
                args = json.loads(fc.arguments)
                if not isinstance(args, dict):
                    raise ValueError("arguments not an object")
            except (ValueError, TypeError):
                args = {}
                result = {"status": "error", "summary": "arguments not JSON",
                          "next_actions": ["retry with JSON arguments"],
                          "artifacts": []}
            else:
                result = execute(fc.name, args, ctx)
            trace["steps"].append({
                "turn": len(trace["steps"]) + 1, "type": "tool",
                "tool": fc.name, "args": args, "status": result["status"],
                "summary": result["summary"][:500],
                "artifacts": result.get("artifacts", [])})
            outputs.append({"type": "function_call_output",
                            "call_id": fc.call_id,
                            "output": json.dumps(result)[:8000]})
            if fc.name == "submit_finding" and result["status"] == "success":
                trace["status"] = "complete"
                trace["finding"] = result["data"]["finding"]
                trace["evidence"] = ctx.evidence.items
                trace["latency_s"] = round(time.monotonic() - t0, 1)
                save_trace(trace)
                return trace
        else:
            pending = outputs
            continue
        break  # cap reached inside the for loop

    trace["evidence"] = ctx.evidence.items
    trace["latency_s"] = round(time.monotonic() - t0, 1)
    save_trace(trace)
    return trace


def _accumulate(total: dict, resp) -> None:
    u = resp.usage
    total["input_tokens"] += getattr(u, "input_tokens", 0) or 0
    total["output_tokens"] += getattr(u, "output_tokens", 0) or 0
    det = getattr(u, "input_tokens_details", None)
    total["cached_tokens"] += getattr(det, "cached_tokens", 0) or 0


def save_trace(trace: dict, reports_dir: str = REPORTS_DIR) -> str:
    os.makedirs(reports_dir, exist_ok=True)
    path = os.path.join(reports_dir, f"{trace['investigation_id']}.json")
    with open(path, "w") as f:
        json.dump(trace, f, indent=1)
    return path


def load_trace(investigation_id: str, reports_dir: str = REPORTS_DIR) -> dict:
    with open(os.path.join(reports_dir, f"{investigation_id}.json")) as f:
        return json.load(f)
