"""Day-1 gate: one real Responses API tool round-trip.

Uses muse-spark-1.3 in Standard mode with a single developer-defined tool,
threaded via previous_response_id. Logs model ID, latency, and token usage
(including cached tokens) for evaluation budgeting.

Requires MODEL_API_KEY in the environment. Exits non-zero on any failure.
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from openai import OpenAI

from backend.app.config import API_BASE_URL, MODEL_ID


def get_recording_info(recording_id: str) -> dict:
    """Stub tool: real implementation inspects actual recordings."""
    return {"recording_id": recording_id, "channels": ["vibration"], "quality": "ok"}


TOOLS = [
    {
        "type": "function",
        "name": "get_recording_info",
        "description": "Return metadata and quality checks for a recording ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "recording_id": {"type": "string", "description": "Opaque recording ID."}
            },
            "required": ["recording_id"],
            "additionalProperties": False,
        },
    }
]


def main() -> int:
    key = os.environ.get("MODEL_API_KEY", "")
    if not key:
        print("ERROR: MODEL_API_KEY is not set", file=sys.stderr)
        return 2
    client = OpenAI(base_url=API_BASE_URL, api_key=key)

    t0 = time.monotonic()
    response = client.responses.create(
        model=MODEL_ID,
        input="Check recording rec_smoke_001 and report its channels.",
        tools=TOOLS,
    )
    calls = [i for i in response.output if i.type == "function_call"]
    if not calls:
        print("ERROR: model returned no function_call", file=sys.stderr)
        return 1
    call = calls[0]
    args = json.loads(call.arguments)  # validated narrowly: one known tool
    if set(args) != {"recording_id"}:
        print(f"ERROR: unexpected arguments: {args!r}", file=sys.stderr)
        return 1
    result = get_recording_info(**args)
    final = client.responses.create(
        model=MODEL_ID,
        input=[
            {
                "type": "function_call_output",
                "call_id": call.call_id,
                "output": json.dumps(result),
            }
        ],
        previous_response_id=response.id,
        tools=TOOLS,
    )
    dt = time.monotonic() - t0

    usage = final.usage
    cached = getattr(getattr(usage, "input_tokens_details", None), "cached_tokens", 0)
    print(f"model: {final.model}")
    print(f"answer: {final.output_text.strip()}")
    print(f"latency_s: {dt:.1f}")
    print(f"input_tokens: {usage.input_tokens} output_tokens: {usage.output_tokens}")
    print(f"cached_tokens: {cached or 0}")
    print("SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
