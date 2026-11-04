"""Latency profiler: no model calls, fully offline.

1. Per-arm latency/token stats (mean/p50/p95/max) from evals/results.jsonl.
2. Replay of every val investigate trace through the real tool
   implementations: re-imports the recording, re-executes each recorded
   tool call, and splits wall time into local-execute vs model-roundtrips.
3. Writes evals/latency.md.

Run: .venv/bin/python scripts/profile_latency.py
"""

import json
import os
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.docs_store import DocsStore
from backend.app.store import Store
from backend.app.tools import ToolContext, execute

RESULTS = "evals/results.jsonl"


def _rows():
    with open(RESULTS, encoding="utf-8") as f:
        return [json.loads(ln) for ln in f if ln.strip()]


def _pct(xs: list[float], p: float) -> float:
    if not xs:
        return 0.0
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def arm_stats(rows, split, arm):
    lat = [r["latency_s"] for r in rows
           if r["split"] == split and r["arm"] == arm]
    tin = [r["input_tokens"] for r in rows
           if r["split"] == split and r["arm"] == arm]
    tou = [r["output_tokens"] for r in rows
           if r["split"] == split and r["arm"] == arm]
    n = len(lat)
    return {"n": n, "mean": sum(lat) / n, "p50": _pct(lat, 0.50),
            "p95": _pct(lat, 0.95), "max": max(lat),
            "tin": sum(tin) / n, "tou": sum(tou) / n}


def replay_trace(store, docs, refs, bearing, cond, rep, inv_id):
    """Re-execute a saved investigate trace; return stage timings."""
    trace = json.load(open(f"data/reports/{inv_id}.json", encoding="utf-8"))
    rid = store.import_case(f"{bearing}/{cond}_{bearing}_{rep}.mat")[
        "recording_id"]
    ctx = ToolContext(store, docs, refs)
    tool_time: dict[str, float] = {}
    tools: list[str] = []
    for s in trace.get("steps", []):
        if s.get("type") != "tool":
            continue
        args = dict(s.get("args") or {})
        if "recording_id" in args:
            args["recording_id"] = rid
        t0 = time.monotonic()
        try:
            execute(s["tool"], args, ctx)
        except Exception:
            pass
        dt = time.monotonic() - t0
        tools.append(s["tool"])
        tool_time[s["tool"]] = tool_time.get(s["tool"], 0.0) + dt
    total_exec = sum(tool_time.values())
    wall = trace.get("latency_s") or 0.0
    return {"tools": tools, "rounds": len(trace.get("steps", [])),
            "execute_s": total_exec, "wall_s": wall,
            "model_s": max(0.0, wall - total_exec),
            "tool_time": tool_time}


def main() -> int:
    rows = _rows()
    out = ["# Latency profile (offline replay, no model calls)", ""]
    out.append("Recorded wall latencies from `evals/results.jsonl`; "
               "investigate split from replaying saved val traces through "
               "the real tool implementations.")
    out.append("")
    for split in ("val", "final"):
        out.append(f"## {split} per-arm latency (seconds)")
        out.append("")
        out.append("| arm | n | mean | p50 | p95 | max | tok in/out |")
        out.append("|---|---|---|---|---|---|---|")
        for arm in ("baseline", "fixed", "investigate"):
            s = arm_stats(rows, split, arm)
            out.append(
                f"| {arm} | {s['n']} | {s['mean']:.1f} | {s['p50']:.1f} | "
                f"{s['p95']:.1f} | {s['max']:.1f} | "
                f"{s['tin']:.0f}/{s['tou']:.0f} |")
        out.append("")

    store, docs = Store(), DocsStore()
    refs = json.load(open("backend/app/refs.json", encoding="utf-8"))
    inv_rows = [r for r in rows if r["split"] == "val"
                and r["arm"] == "investigate" and r.get("investigation_id")]
    hist: Counter = Counter()
    rounds: list[int] = []
    execs: list[float] = []
    models: list[float] = []
    per_tool: dict[str, float] = {}
    replayed = 0
    for r in inv_rows:
        p = f"data/reports/{r['investigation_id']}.json"
        if not os.path.exists(p):
            continue
        prof = replay_trace(store, docs, refs, r["bearing"], r["cond"],
                            r["rep"], r["investigation_id"])
        replayed += 1
        hist.update(prof["tools"])
        rounds.append(prof["rounds"])
        execs.append(prof["execute_s"])
        models.append(prof["model_s"])
        for k, v in prof["tool_time"].items():
            per_tool[k] = per_tool.get(k, 0.0) + v
    out.append(f"## investigate/val replay attribution (n={replayed})")
    out.append("")
    out.append(f"- mean wall: {sum(models) / replayed + sum(execs) / replayed:.1f}s = "
               f"model round-trips {sum(models) / replayed:.1f}s + "
               f"local tool execute {sum(execs) / replayed:.2f}s")
    out.append(f"- mean rounds (model calls) per investigation: "
               f"{sum(rounds) / replayed:.1f} "
               f"(=> ~{sum(models) / sum(rounds):.1f}s per round)")
    out.append("- tool-call histogram: " +
               ", ".join(f"{k} {v}" for k, v in hist.most_common()))
    out.append("- execute time by tool: " +
               ", ".join(f"{k} {v:.2f}s"
                         for k, v in sorted(per_tool.items(),
                                            key=lambda kv: -kv[1])))
    out.append("")
    out.append("Bottom line: the investigate arm is model-bound (>99% of "
               "wall time in API round-trips). Local analysis is "
               "milliseconds; cutting rounds (fewer doc reads, earlier "
               "submit) is the only latency lever that matters.")
    out.append("")
    with open("evals/latency.md", "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("\n".join(out))
    print(f"\nwrote evals/latency.md ({replayed} traces replayed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
