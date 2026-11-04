"""Run one backend investigation end to end (Day-3 proof).

Usage:
    MODEL_API_KEY=... .venv/bin/python scripts/run_investigation.py \
        --case K001/N09_M07_F10_K001_1.mat --question "Is this bearing healthy?"

Prints each step and the final finding or incomplete reason, then the trace path.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.agent import REPORTS_DIR
from backend.app.agent import run as run_agent
from backend.app.config import REFS_PATH
from backend.app.docs_store import DocsStore
from backend.app.store import Store


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", required=True)
    ap.add_argument("--question", default="What is the condition of this bearing?")
    args = ap.parse_args()

    store, docs = Store(), DocsStore()
    refs = json.load(open(REFS_PATH, encoding="utf-8")) if os.path.exists(REFS_PATH) else {}
    imp = store.import_case(args.case)
    print(f"recording: {imp['recording_id']} ({imp['display_label']})")
    trace = run_agent(store, docs, refs, imp["recording_id"], args.question)
    for s in trace["steps"]:
        if s["type"] == "tool":
            print(f"- {s['tool']} {json.dumps(s['args'])[:120]} -> {s['status']}: "
                  f"{s['summary'][:160]}")
        else:
            print(f"- text: {s['text'][:160]}")
    print(f"status: {trace['status']}")
    if trace["status"] == "complete":
        f = trace["finding"]
        print(f"finding: {f['hypothesis']} / {f['component']}")
        print(f"reasoning: {f['reasoning'][:400]}")
    else:
        print(f"reason: {trace['incomplete_reason']}")
    print(f"usage: {trace['usage']} latency_s: {trace['latency_s']}")
    print(f"trace: {REPORTS_DIR}/{trace['investigation_id']}.json")
    return 0 if trace["status"] == "complete" else 1


if __name__ == "__main__":
    raise SystemExit(main())
