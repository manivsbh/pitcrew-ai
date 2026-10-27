"""Three-arm evaluation runner with checkpointing.

Arms: baseline (deterministic rules), fixed (one structured model call over a
fixed bundle), investigate (tool-choosing agent). Splits: dev/val/final/
challenge. Results append to evals/results.jsonl; completed rows are skipped
on rerun, so long runs resume. `run_eval.py --report` scores and writes
evals/report.md without running anything.

Labels come from evals/labels.json after predictions are recorded.
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app import analysis as A
from backend.app.agent import run as run_agent
from backend.app.config import MODEL_ID, REASONING_EFFORT
from backend.app.docs_store import DocsStore
from backend.app.store import Store
from backend.app.tools import HYPOTHESES, HYPOTHESIS_COMPONENT

SPLITS = {
    "dev": ["K001", "KA04", "KI04"],
    "val": ["K002", "KA15", "KI14"],
    "final": ["K003", "KA16", "KI16"],
    "challenge": ["KB23"],
}
REPS = {"dev": [1, 2, 3], "val": [1, 5, 9, 13, 17], "final": [1, 5, 9, 13, 17],
        "challenge": [1, 5, 9, 13, 17]}
CONDS = ["N15_M07_F10", "N09_M07_F10", "N15_M01_F10", "N15_M07_F04"]
RESULTS = "evals/results.jsonl"
BASELINE_BAND = (2000.0, 8000.0)
BASELINE_RATIO = 2.0
BASELINE_Z = 5.0

FINDING_SCHEMA = {
    "type": "json_schema",
    "name": "Finding",
    "schema": {
        "type": "object",
        "properties": {
            "hypothesis": {"type": "string", "enum": [
                "healthy", "outer_ring_damage", "inner_ring_damage",
                "insufficient_evidence"]},
            "component": {"type": "string", "enum": [
                "motor", "shaft", "housing", "ring_inner", "ring_outer",
                "rollers", "cage", "none"]},
            "reasoning": {"type": "string"},
            "contradictions": {"type": "string"},
            "next_measurement": {"type": "string"},
        },
        "required": ["hypothesis", "component", "reasoning",
                     "contradictions", "next_measurement"],
    },
}


def cases(split: str) -> list[tuple[str, str, int, str]]:
    out = []
    for b in SPLITS[split]:
        for c in CONDS:
            for r in REPS[split]:
                p = f"data/recordings/{b}/{c}_{b}_{r}.mat"
                out.append((b, c, r, p))
    missing = [p for _, _, _, p in out if not os.path.exists(p)]
    if missing:
        raise SystemExit(f"{len(missing)} case files missing, e.g. {missing[0]}; "
                         f"run download_all.py first")
    return out


def load_results() -> list[dict]:
    if not os.path.exists(RESULTS):
        return []
    with open(RESULTS) as f:
        return [json.loads(ln) for ln in f if ln.strip()]


def append_result(row: dict) -> None:
    with open(RESULTS, "a") as f:
        f.write(json.dumps(row) + "\n")


def arm_baseline(rec) -> dict:
    """Frozen deterministic rule (see evals/protocol.md)."""
    t0 = time.monotonic()
    vib = rec.channels["vibration_1"]
    stats = A.time_stats(vib.data)
    comp = A.reference_compare(
        {k: v for k, v in stats.items() if v is not None}, _ref_dicts(rec))
    zs = [abs(v["z"]) for v in comp.values() if v.get("z") is not None]
    detail = {"stats": stats, "z": {k: v.get("z") for k, v in comp.items()}}
    if rec.speed_rpm is None:
        return _pred("insufficient_evidence", "none", t0, detail,
                     "no speed")
    ff = A.fault_frequencies(rec.speed_rpm)
    f, m, _ = A.envelope_spectrum(vib.data, vib.fs, *BASELINE_BAND)
    hits = A.match_peaks(f, m, {"bpfo": ff["bpfo"], "bpfi": ff["bpfi"]})
    detail.update({"targets": ff, "hits": hits})
    ao = hits["bpfo"]["amp"] if hits["bpfo"] else 0.0
    ai = hits["bpfi"]["amp"] if hits["bpfi"] else 0.0
    zmax = max(zs) if zs else 0.0
    damaged = zmax > BASELINE_Z
    if ao > BASELINE_RATIO * ai and ao > 0 and damaged:
        return _pred("outer_ring_damage", "ring_outer", t0, detail,
                     "bpfo dominant + abnormal stats")
    if ai > BASELINE_RATIO * ao and ai > 0 and damaged:
        return _pred("inner_ring_damage", "ring_inner", t0, detail,
                     "bpfi dominant + abnormal stats")
    if zs and zmax < BASELINE_Z and ao < BASELINE_RATIO * ai + 1e-9 and \
            ai < BASELINE_RATIO * ao + 1e-9:
        return _pred("healthy", "none", t0, detail, "within reference")
    return _pred("insufficient_evidence", "none", t0, detail, "ambiguous")


def _ref_dicts(rec) -> list[dict]:
    refs = json.load(open("backend/app/refs.json")).get(rec.condition or "", {})
    keys = [k for k in ("rms", "crest", "kurtosis_excess") if k in refs]
    if not keys:
        return []
    n = min(len(refs[k]) for k in keys)
    return [{k: refs[k][i] for k in keys} for i in range(n)]


def _pred(h, c, t0, detail, why):
    return {"hypothesis": h, "component": c, "latency_s": time.monotonic() - t0,
            "input_tokens": 0, "output_tokens": 0, "detail": detail, "why": why}


def fixed_bundle(rec) -> str:
    vib = rec.channels["vibration_1"]
    stats = A.time_stats(vib.data)
    comp = A.reference_compare(
        {k: v for k, v in stats.items() if v is not None}, _ref_dicts(rec))
    lines = [f"condition={rec.condition} speed_rpm={rec.speed_rpm}",
             f"time_stats={stats}",
             f"reference_z={ {k: v.get('z') for k, v in comp.items()} }"]
    if rec.speed_rpm is not None:
        ff = A.fault_frequencies(rec.speed_rpm)
        f, m, _ = A.envelope_spectrum(vib.data, vib.fs, *BASELINE_BAND)
        hits = A.match_peaks(f, m, {"bpfo": ff["bpfo"], "bpfi": ff["bpfi"]})
        lines.append(f"fault_targets={ff}")
        lines.append(f"envelope_hits_2_8kHz={hits}")
    else:
        lines.append("speed unavailable; no fault frequencies")
    return "\n".join(lines)


def arm_fixed(client, rec) -> dict:
    from openai import OpenAI  # noqa: F401 (client type only)
    t0 = time.monotonic()
    resp = client.responses.create(
        model=MODEL_ID,
        instructions=("You are a vibration analyst. Given fixed numerical "
                      "results, return a structured finding. Component must "
                      "match the hypothesis (outer->ring_outer, inner->"
                      "ring_inner, else none). Abstain when unclear."),
        input=fixed_bundle(rec),
        text={"format": FINDING_SCHEMA},
        reasoning={"effort": REASONING_EFFORT})
    try:
        f = json.loads(resp.output_text)
        ok = (f.get("hypothesis") in HYPOTHESES
              and HYPOTHESIS_COMPONENT.get(f.get("hypothesis"))
              == f.get("component"))
    except (ValueError, TypeError, AttributeError):
        ok = False
    u = resp.usage
    if not ok:
        return {"hypothesis": "insufficient_evidence", "component": "none",
                "latency_s": time.monotonic() - t0,
                "input_tokens": u.input_tokens,
                "output_tokens": u.output_tokens, "detail": "invalid output"}
    return {"hypothesis": f["hypothesis"], "component": f["component"],
            "latency_s": time.monotonic() - t0,
            "input_tokens": u.input_tokens, "output_tokens": u.output_tokens,
            "detail": {k: f.get(k) for k in ("reasoning", "contradictions",
                                            "next_measurement")}}


def _investigate_one(store, docs, refs, rid):
    trace = run_agent(store, docs, refs, rid,
                      "What is the condition of this bearing?")
    inv = trace["investigation_id"]
    if trace["status"] == "complete":
        f = trace["finding"]
        return inv, {"hypothesis": f["hypothesis"],
                     "component": f["component"],
                     "latency_s": trace["latency_s"],
                     "input_tokens": trace["usage"]["input_tokens"],
                     "output_tokens": trace["usage"]["output_tokens"],
                     "detail": f["reasoning"][:300]}
    return inv, {"hypothesis": "insufficient_evidence", "component": "none",
                 "latency_s": trace["latency_s"],
                 "input_tokens": trace["usage"]["input_tokens"],
                 "output_tokens": trace["usage"]["output_tokens"],
                 "detail": trace.get("incomplete_reason", "")}


def run_arm(arm: str, split: str, limit: int | None, store, docs, refs,
            client, workers: int = 1) -> None:
    import threading
    from concurrent.futures import ThreadPoolExecutor
    done = {(r["split"], r["arm"], r["bearing"], r["cond"], r["rep"])
            for r in load_results()}
    all_cases = cases(split)
    if limit:
        all_cases = all_cases[:limit]
    pending = [(b, c, r, p) for b, c, r, p in all_cases
               if (split, arm, b, c, r) not in done]
    lock = threading.Lock()

    def one(case):
        b, c, r, path = case
        print(f"[{arm}/{split}] {b} {c} rep{r}", flush=True)
        if arm == "baseline":
            rec = A.load_recording(path)
            pred = arm_baseline(rec)
            inv = None
        elif arm == "fixed":
            rec = A.load_recording(path)
            pred = arm_fixed(client, rec)
            inv = None
        else:
            rid = store.import_case(f"{b}/{c}_{b}_{r}.mat")["recording_id"]
            inv, pred = _investigate_one(store, docs, refs, rid)
        with lock:
            append_result({"split": split, "arm": arm, "bearing": b, "cond": c,
                           "rep": r, "investigation_id": inv, **pred})
        print(f"  -> {pred['hypothesis']} ({pred['latency_s']:.1f}s)",
              flush=True)

    if arm == "investigate":
        # Pre-import sequentially (registry writes are not thread-safe),
        # then run the independent investigations in parallel.
        for b, c, r, _ in pending:
            store.import_case(f"{b}/{c}_{b}_{r}.mat")
        with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            list(ex.map(one, pending))
    else:
        for case in pending:
            one(case)


def report() -> int:
    rows = load_results()
    labels = json.load(open("evals/labels.json"))["labels"]
    out = ["# Evaluation report", ""]
    for split in ("dev", "val", "final"):
        for arm in ("baseline", "fixed", "investigate"):
            sub = [r for r in rows if r["split"] == split and r["arm"] == arm
                   and labels.get(r["bearing"]) != "mixed_fault_unscored"]
            if not sub:
                continue
            out.extend(_score_block(f"{arm} / {split}", sub, labels))
    chal = [r for r in rows if r["split"] == "challenge"]
    if chal:
        out.append("## Challenge KB23 (unscored)")
        for r in sorted(chal, key=lambda r: (r["arm"], r["cond"], r["rep"])):
            out.append(f"- {r['arm']} {r['cond']} rep{r['rep']}: "
                       f"{r['hypothesis']} ({r['latency_s']:.0f}s)")
        out.append("")
    text = "\n".join(out)
    with open("evals/report.md", "w") as f:
        f.write(text + "\n")
    print(text)
    return 0


def _score_block(title: str, sub: list, labels: dict) -> list[str]:
    n = len(sub)
    correct = sum(1 for r in sub
                  if r["hypothesis"] == labels[r["bearing"]])
    answered = [r for r in sub if r["hypothesis"] != "insufficient_evidence"]
    ans_correct = sum(1 for r in answered
                      if r["hypothesis"] == labels[r["bearing"]])
    missed = sum(1 for r in sub if labels[r["bearing"]] != "healthy"
                 and r["hypothesis"] == "healthy")
    per_class: dict[str, list] = {}
    for r in sub:
        per_class.setdefault(labels[r["bearing"]], []).append(
            r["hypothesis"] == labels[r["bearing"]])
    bal = sum(sum(v) / len(v) for v in per_class.values()) / len(per_class)
    lat = sum(r["latency_s"] for r in sub) / n
    tin = sum(r["input_tokens"] for r in sub) / n
    tou = sum(r["output_tokens"] for r in sub) / n
    by_bearing: dict[str, str] = {}
    for b in sorted({r["bearing"] for r in sub}):
        votes = [r["hypothesis"] for r in sub if r["bearing"] == b
                 and r["hypothesis"] != "insufficient_evidence"]
        by_bearing[b] = max(set(votes), key=votes.count) if votes else (
            "insufficient_evidence")
    bcorrect = sum(1 for b, v in by_bearing.items() if v == labels[b])
    return [
        f"## {title} (n={n} recordings, {len(by_bearing)} bearings)",
        f"- balanced accuracy (abstain=miss): {bal:.3f}",
        f"- accuracy overall: {correct}/{n} = {correct / n:.3f}",
        f"- abstention rate: {(n - len(answered)) / n:.3f}",
        f"- accuracy among answered: "
        f"{ans_correct}/{len(answered)} = "
        f"{(ans_correct / len(answered)) if answered else 0:.3f}",
        f"- damaged called healthy: {missed}",
        f"- mean latency: {lat:.1f}s; mean tokens in/out: {tin:.0f}/{tou:.0f}",
        f"- per-bearing majority: {bcorrect}/{len(by_bearing)} "
        f"{ {b: v for b, v in sorted(by_bearing.items())} }",
        "",
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", default="all",
                    choices=["all", "baseline", "fixed", "investigate"])
    ap.add_argument("--split", default="final",
                    choices=["all", "dev", "val", "final", "challenge"])
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    if args.report:
        return report()
    arms = ["baseline", "fixed", "investigate"] if args.arm == "all" else [args.arm]
    splits = (["dev", "val", "final", "challenge"] if args.split == "all"
              else [args.split])
    store, docs = Store(), DocsStore()
    refs = json.load(open("backend/app/refs.json"))
    client = None
    if "fixed" in arms:
        from openai import OpenAI
        from backend.app.config import API_BASE_URL, model_api_key
        client = OpenAI(base_url=API_BASE_URL, api_key=model_api_key(),
                        timeout=120.0)
    for split in splits:
        for arm in arms:
            run_arm(arm, split, args.limit, store, docs, refs, client,
                    workers=args.workers)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
