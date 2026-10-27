"""The five agent tools: schemas, validation, execution.

Observation contract per tool result: status / summary / next_actions /
artifacts (evidence IDs). Every argument is validated locally before use;
Meta-side schema settings are never trusted.

Termination design note: submit_finding is an explicit 5th tool (rather than
a text.format final) so termination is a validated, auditable step and the
demo can show it. text.format structured output is used by the arm-2
fixed-explanation path instead.
"""

from __future__ import annotations

import json
import os
import re

from . import analysis as A

TOOL_NAME_RE = re.compile(r"^[a-zA-Z0-9_.-]+$")
COMPONENTS = ["motor", "shaft", "housing", "ring_inner", "ring_outer",
              "rollers", "cage", "none"]
HYPOTHESES = ["healthy", "outer_ring_damage", "inner_ring_damage",
              "insufficient_evidence"]
HYPOTHESIS_COMPONENT = {"healthy": "none", "outer_ring_damage": "ring_outer",
                        "inner_ring_damage": "ring_inner",
                        "insufficient_evidence": "none"}

TOOL_SCHEMAS = [
    {"type": "function", "name": "read_documentation",
     "description": "Retrieve an approved technical excerpt by topic, with source location.",
     "parameters": {"type": "object",
                    "properties": {"topic": {"type": "string",
                        "description": "One of: conditions, geometry, sampling, rig."}},
                    "required": ["topic"], "additionalProperties": False}},
    {"type": "function", "name": "inspect_recording",
     "description": "Return validated metadata and quality checks for a recording ID.",
     "parameters": {"type": "object",
                    "properties": {"recording_id": {"type": "string",
                        "description": "Opaque recording ID, e.g. rec_0001."}},
                    "required": ["recording_id"], "additionalProperties": False}},
    {"type": "function", "name": "analyze_vibration",
     "description": "Run one numerical analysis on the vibration channel.",
     "parameters": {"type": "object",
                    "properties": {
                        "recording_id": {"type": "string"},
                        "analysis": {"type": "string", "description": (
                            "One of: time_stats, spectrum, psd, envelope, fault_match.")},
                        "band_lo": {"type": "number", "description": "Required for envelope/fault_match."},
                        "band_hi": {"type": "number", "description": "Required for envelope/fault_match."},
                        "nperseg": {"type": "integer", "description": "Welch segment length."}},
                    "required": ["recording_id", "analysis"],
                    "additionalProperties": False}},
    {"type": "function", "name": "compare_reference",
     "description": "Compare recording stats against healthy references under the same operating condition.",
     "parameters": {"type": "object",
                    "properties": {
                        "recording_id": {"type": "string"},
                        "metric": {"type": "string", "description": (
                            "Optional: rms, crest, or kurtosis_excess. Default: all.")}},
                    "required": ["recording_id"], "additionalProperties": False}},
    {"type": "function", "name": "submit_finding",
     "description": "Submit the final structured hypothesis. Call exactly once to finish.",
     "parameters": {"type": "object",
                    "properties": {
                        "hypothesis": {"type": "string"},
                        "component": {"type": "string"},
                        "evidence_ids": {"type": "array", "items": {"type": "string"}},
                        "reasoning": {"type": "string"},
                        "contradictions": {"type": "string"},
                        "next_measurement": {"type": "string"}},
                    "required": ["hypothesis", "component", "evidence_ids",
                                 "reasoning", "contradictions",
                                 "next_measurement"],
                    "additionalProperties": False}},
]

for _s in TOOL_SCHEMAS:  # fail fast on schema bugs, not at call time
    assert _s["type"] == "function" and TOOL_NAME_RE.match(_s["name"])
    assert _s["parameters"]["type"] == "object"


class EvidenceStore:
    """Per-investigation evidence registry. Full series stay in memory;
    traces persist summaries; plots recompute deterministically."""

    def __init__(self):
        self.items: dict[str, dict] = {}
        self.series: dict[str, dict] = {}
        self.counter = 0

    def add(self, summary: dict, series: dict | None = None) -> str:
        self.counter += 1
        eid = f"ev_{self.counter:04d}"
        self.items[eid] = {"id": eid, **summary}
        if series is not None:
            self.series[eid] = series
        return eid


class ToolContext:
    def __init__(self, store, docs, refs: dict):
        self.store = store
        self.docs = docs
        self.refs = refs
        self.evidence = EvidenceStore()


def _err(summary: str, retry: str, stop: str) -> dict:
    return {"status": "error", "summary": summary,
            "next_actions": [retry], "stop_condition": stop, "artifacts": []}


def _ok(summary: str, next_actions: list, artifacts: list, data: dict) -> dict:
    return {"status": "success", "summary": summary,
            "next_actions": next_actions, "artifacts": artifacts, "data": data}


TOPIC_FILES = {"conditions": "operating-conditions", "geometry": "test-rig-6203-geometry",
               "sampling": "sampling", "rig": "test-rig-6203-geometry"}


def execute(tool: str, args: dict, ctx: ToolContext) -> dict:
    if tool == "read_documentation":
        return _t_docs(args, ctx)
    if tool == "inspect_recording":
        return _t_inspect(args, ctx)
    if tool == "analyze_vibration":
        return _t_analyze(args, ctx)
    if tool == "compare_reference":
        return _t_compare(args, ctx)
    if tool == "submit_finding":
        return _t_submit(args, ctx)
    return _err(f"unknown tool {tool!r}", "call a defined tool", "unknown tool")


def _t_docs(args: dict, ctx: ToolContext) -> dict:
    topic = args.get("topic")
    if topic not in TOPIC_FILES:
        return _err(f"unknown topic {topic!r}; use {sorted(TOPIC_FILES)}",
                    "retry with a listed topic", "unknown topic")
    doc = ctx.docs.get(TOPIC_FILES[topic])
    eid = ctx.evidence.add({"kind": "document", "doc_id": doc["id"],
                            "source_file": doc["source_file"], "title": doc["title"]})
    return _ok(f"excerpt {doc['id']}: {doc['title']}",
               ["cite this id when using its facts"],
               [eid], {"doc_id": doc["id"], "source_file": doc["source_file"],
                       "text": doc["text"]})


def _t_inspect(args: dict, ctx: ToolContext) -> dict:
    rid = args.get("recording_id")
    try:
        view = ctx.store.agent_view(rid)
    except KeyError:
        return _err(f"unknown recording {rid!r}", "use the given recording ID",
                    "unknown recording")
    eid = ctx.evidence.add({"kind": "recording_meta", "recording_id": rid})
    return _ok(f"{rid}: {view['condition']}, {len(view['channels'])} channels",
               ["run analyze_vibration/time_stats next"], [eid], view)


def _t_analyze(args: dict, ctx: ToolContext) -> dict:
    rid, kind = args.get("recording_id"), args.get("analysis")
    if kind not in ("time_stats", "spectrum", "psd", "envelope", "fault_match"):
        return _err(f"unknown analysis {kind!r}", "use a listed analysis",
                    "unknown analysis")
    try:
        rec = ctx.store.load(rid)
    except KeyError:
        return _err(f"unknown recording {rid!r}", "use the given recording ID",
                    "unknown recording")
    if "vibration_1" not in rec.channels:
        return _err("no vibration channel", "inspect another recording",
                    "missing channel")
    ch = rec.channels["vibration_1"]
    if ch.fs is None:
        return _err("vibration rate unknown", "do not use spectral analyses",
                    "unknown rate")
    x, fs = ch.data, ch.fs

    if kind == "time_stats":
        stats = A.time_stats(x)
        eid = ctx.evidence.add({"kind": "time_stats", "stats": stats})
        return _ok(f"rms={stats['rms']:.4f} crest={stats['crest']:.2f} "
                   f"kurt={stats['kurtosis_excess']:.2f}",
                   ["compare_reference", "analyze envelope/fault_match"], [eid],
                   {"stats": stats})
    if kind == "spectrum":
        f, m = A.spectrum(x, fs)
        peaks = _top_peaks(f, m)
        eid = ctx.evidence.add({"kind": "spectrum", "peaks": peaks},
                               {"freqs": f, "mag": m})
        return _ok(f"spectrum peaks: {peaks[:3]}", ["try envelope analysis"],
                   [eid], {"peaks": peaks})
    if kind == "psd":
        nperseg = args.get("nperseg", 65536)
        if not isinstance(nperseg, int) or not 256 <= nperseg <= x.size:
            return _err(f"bad nperseg {nperseg!r}", "use 256..len",
                        "invalid parameter")
        f, p = A.psd_welch(x, fs, nperseg=nperseg)
        peaks = _top_peaks(f, p)
        eid = ctx.evidence.add({"kind": "psd", "nperseg": nperseg, "peaks": peaks},
                               {"freqs": f, "mag": p})
        return _ok(f"psd peaks: {peaks[:3]}", ["try envelope analysis"],
                   [eid], {"peaks": peaks})
    # envelope + fault_match need an explicit band
    try:
        lo, hi = float(args["band_lo"]), float(args["band_hi"])
        f, m, settings = A.envelope_spectrum(x, fs, lo, hi)
    except (KeyError, TypeError, ValueError) as e:
        return _err(f"band required inside (0, {fs / 2}): {e}",
                    "retry with explicit band_lo/band_hi", "invalid band")
    if kind == "envelope":
        peaks = _top_peaks(f, m)
        eid = ctx.evidence.add({"kind": "envelope", "settings": settings,
                                "peaks": peaks}, {"freqs": f, "mag": m})
        return _ok(f"envelope peaks {settings['band_lo']}-{settings['band_hi']}Hz: "
                   f"{peaks[:3]}", ["run fault_match on this band"], [eid],
                   {"peaks": peaks, "settings": settings})
    if rec.speed_rpm is None:
        return _err("speed unavailable; fault frequencies withheld",
                    "choose insufficient_evidence or another analysis",
                    "missing speed")
    ff = A.fault_frequencies(rec.speed_rpm)
    hits = A.match_peaks(f, m, {"bpfo": ff["bpfo"], "bpfi": ff["bpfi"]})
    eid = ctx.evidence.add({"kind": "fault_match", "targets": ff, "hits": hits,
                            "settings": settings}, {"freqs": f, "mag": m})
    desc = {k: (round(v["freq"], 2) if v else None) for k, v in hits.items()}
    return _ok(f"fault match @ {rec.speed_rpm:.0f}rpm: {desc}",
               ["compare_reference", "submit_finding"], [eid],
               {"targets": ff, "hits": hits, "settings": settings})


def _top_peaks(f, m, n: int = 10) -> list:
    idx = sorted(range(1, m.size), key=lambda i: -m[i])[:n]
    return [{"freq": round(float(f[i]), 2), "amp": round(float(m[i]), 3)}
            for i in sorted(idx)]


def _t_compare(args: dict, ctx: ToolContext) -> dict:
    rid = args.get("recording_id")
    try:
        rec = ctx.store.load(rid)
    except KeyError:
        return _err(f"unknown recording {rid!r}", "use the given recording ID",
                    "unknown recording")
    cond = rec.condition
    refs = ctx.refs.get(cond or "", {})
    if not refs:
        return _err(f"no healthy references for condition {cond}",
                    "proceed without comparison; note the gap", "no references")
    stats = A.time_stats(rec.channels["vibration_1"].data)
    metric = args.get("metric")
    if metric is not None and metric not in ("rms", "crest", "kurtosis_excess"):
        return _err(f"unknown metric {metric!r}", "use rms/crest/kurtosis_excess",
                    "invalid metric")
    comp = A.reference_compare(stats, _ref_dicts(refs))
    if metric:
        comp = {metric: comp[metric]}
    eid = ctx.evidence.add({"kind": "reference_compare", "condition": cond,
                            "comparison": comp})
    desc = {k: (round(v["z"], 2) if v.get("z") is not None else None)
            for k, v in comp.items()}
    return _ok(f"z-scores vs healthy {cond}: {desc}", ["submit_finding"],
               [eid], {"comparison": comp})


def _ref_dicts(refs: dict) -> list[dict]:
    keys = [k for k in ("rms", "crest", "kurtosis_excess") if k in refs]
    n = min(len(refs[k]) for k in keys)
    return [{k: refs[k][i] for k in keys} for i in range(n)]


def _t_submit(args: dict, ctx: ToolContext) -> dict:
    h = args.get("hypothesis")
    if h not in HYPOTHESES:
        return _err(f"hypothesis must be one of {HYPOTHESES}",
                    "resubmit with a listed hypothesis", "invalid hypothesis")
    want = HYPOTHESIS_COMPONENT[h]
    if args.get("component") != want:
        return _err(f"{h} requires component {want!r}",
                    "resubmit with matching component", "component mismatch")
    evs = args.get("evidence_ids")
    if not isinstance(evs, list) or not evs or not all(
            isinstance(e, str) and e in ctx.evidence.items for e in evs):
        return _err("evidence_ids must be non-empty and reference real evidence",
                    "cite evidence IDs from tool results", "bad evidence ref")
    for field in ("reasoning", "contradictions", "next_measurement"):
        if not isinstance(args.get(field), str) or not args[field].strip():
            return _err(f"{field} must be a non-empty string",
                        f"resubmit with {field}", "empty field")
    finding = {"hypothesis": h, "component": args["component"],
               "evidence_ids": evs, "reasoning": args["reasoning"],
               "contradictions": args["contradictions"],
               "next_measurement": args["next_measurement"]}
    eid = ctx.evidence.add({"kind": "finding", **finding})
    return _ok("finding accepted", [], [eid], {"finding": finding,
                                               "finding_id": eid})
