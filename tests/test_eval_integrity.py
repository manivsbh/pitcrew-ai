"""Frozen-eval integrity: the stakeholder accuracy story is locked.

results.jsonl + labels.json are committed; these tests pin row schema,
per-block coverage, and the exact frozen headline counts so any change to
the comparison is deliberate. Trace scans (leak/cites/version) run when
local traces exist and skip on a fresh checkout (data/reports is local).
"""

import glob
import json
import os
import re
import sys

import pytest

from backend.app.config import MODEL_ID
from backend.app.prompts import PROMPT_VERSION

RESULTS = "evals/results.jsonl"
LABELS = "evals/labels.json"
BEARING_RE = re.compile(r"\bK[AIB]?\d+")

REQUIRED_KEYS = {"split", "arm", "bearing", "cond", "rep", "hypothesis",
                 "component", "latency_s", "input_tokens", "output_tokens"}
HYPOTHESES = {"healthy", "outer_ring_damage", "inner_ring_damage",
              "insufficient_evidence"}
EXPECTED_N = {("dev", 36), ("val", 60), ("final", 60), ("challenge", 20)}

# (arm, split) -> (correct, n, abstentions, damaged_called_healthy,
#                   per_bearing_correct). Frozen 2026-10-27; change only
# with a protocol amendment.
FROZEN = {
    ("baseline", "dev"): (33, 36, 3, 0, 3),
    ("fixed", "dev"): (24, 36, 6, 0, 2),
    ("investigate", "dev"): (16, 36, 20, 0, 3),
    ("baseline", "val"): (17, 60, 39, 0, 2),
    ("fixed", "val"): (26, 60, 16, 0, 2),
    ("investigate", "val"): (4, 60, 42, 5, 0),
    ("baseline", "final"): (20, 60, 30, 0, 1),
    ("fixed", "final"): (22, 60, 17, 0, 1),
    ("investigate", "final"): (10, 60, 41, 2, 1),
}


def _rows():
    with open(RESULTS, encoding="utf-8") as f:
        return [json.loads(ln) for ln in f if ln.strip()]


def _labels():
    with open(LABELS, encoding="utf-8") as f:
        return json.load(f)["labels"]


def test_results_schema_and_coverage():
    rows = _rows()
    assert len(rows) == 528, len(rows)
    for r in rows:
        assert REQUIRED_KEYS <= set(r), r
        assert r["hypothesis"] in HYPOTHESES, r
        assert r["latency_s"] >= 0 and r["input_tokens"] >= 0
        assert r["output_tokens"] >= 0
    for split, n in EXPECTED_N:
        for arm in ("baseline", "fixed", "investigate"):
            sub = [r for r in rows
                   if r["split"] == split and r["arm"] == arm]
            assert len(sub) == n, (split, arm, len(sub))


def test_frozen_headlines():
    rows = _rows()
    labels = _labels()
    for (arm, split), (c0, n0, a0, m0, b0) in FROZEN.items():
        sub = [r for r in rows
               if r["split"] == split and r["arm"] == arm]
        assert len(sub) == n0
        correct = sum(1 for r in sub
                      if r["hypothesis"] == labels[r["bearing"]])
        abst = sum(1 for r in sub
                   if r["hypothesis"] == "insufficient_evidence")
        missed = sum(1 for r in sub
                     if labels[r["bearing"]] != "healthy"
                     and r["hypothesis"] == "healthy")
        assert (correct, abst, missed) == (c0, a0, m0), (arm, split)
        sys.path.insert(0, "scripts")
        from run_eval import majority
        bb = 0
        for b in {r["bearing"] for r in sub}:
            votes = [r["hypothesis"] for r in sub if r["bearing"] == b
                     and r["hypothesis"] != "insufficient_evidence"]
            bb += majority(votes) == labels[b]
        assert bb == b0, (arm, split)
    chal = [r for r in rows if r["split"] == "challenge"]
    assert len(chal) == 60
    assert {r["bearing"] for r in chal} == {"KB23"}


def test_majority_tiebreak_is_deterministic():
    sys.path.insert(0, "scripts")
    from run_eval import majority
    assert majority([]) == "insufficient_evidence"
    assert majority(["outer_ring_damage", "healthy"]) == "outer_ring_damage"
    assert majority(["healthy", "outer_ring_damage"]) == "healthy"
    assert majority(["a", "b", "b", "a", "a"]) == "a"


def _traces():
    paths = sorted(glob.glob("data/reports/*.json"))
    if not paths:
        pytest.skip("no local traces (data/reports is local-only)")
    return [json.load(open(p, encoding="utf-8")) for p in paths]


def test_saved_traces_carry_no_labels():
    for t in _traces():
        blob = json.dumps(t)
        assert not BEARING_RE.search(blob), t.get("investigation_id")


def test_saved_traces_have_zero_unsupported_cites():
    n_findings = 0
    for t in _traces():
        f = t.get("finding") or {}
        if not f:
            continue
        n_findings += 1
        ev = t.get("evidence") or {}
        for eid in f.get("evidence_ids", []):
            assert eid in ev, (t.get("investigation_id"), eid)
    if n_findings <= 100:
        pytest.skip(f"{n_findings} local findings; frozen eval corpus not present")


def test_eval_linked_traces_are_frozen_version():
    invs = {r["investigation_id"] for r in _rows()
            if r.get("investigation_id")}
    assert len(invs) == 176, len(invs)
    missing = [i for i in invs
               if not os.path.exists(f"data/reports/{i}.json")]
    if missing:
        pytest.skip(f"{len(missing)} linked traces absent locally")
    for i in invs:
        t = json.load(open(f"data/reports/{i}.json", encoding="utf-8"))
        assert t["prompt_version"] == PROMPT_VERSION, i
        assert t["model_id"] == MODEL_ID, i
