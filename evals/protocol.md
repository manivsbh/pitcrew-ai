# Final evaluation protocol (FROZEN 2026-10-27)

No tuning after this point. Prompts, settings, and refs are fixed; only the
frozen pipeline may touch final-evaluation bearings.

## Splits (by bearing; every recording stays in its split)

- Development: K001 (healthy), KA04 (outer), KI04 (inner)
- Validation: K002 (healthy), KA15 (outer), KI14 (inner)
- Final: K003 (healthy), KA16 (outer), KI16 (inner)
- Challenge (unscored, reported separately): KB23 (mixed)

Labels: `evals/labels.json`, verified against the PHM paper damage tables.
Labels live in the evaluator only and are revealed after predictions freeze.

## Final-evaluation cases

All four operating conditions x repetitions {1, 5, 9, 13, 17} x the three
final bearings = 60 recordings. Counts are reported per recording and per
bearing (majority vote per bearing as a secondary view).

## Arms (same 60 cases each)

1. `baseline` — deterministic numerical rules only (no model). Rule v2
   (amended 2026-10-27 from dev-set inspection, before any final-bearing
   contact): envelope BPFO/BPFI hits (band 2-8 kHz) plus reference z-scores.
   Damage call requires BOTH a >2x dominant fault-frequency amplitude AND
   max|z| > 5; healthy requires max|z| < 5 AND no dominant peak; anything
   else abstains. (v1 used a 3x ratio without the z-gate and scored 25/36
   on dev with 10 inner-ring abstentions; v2 scores 33/36 with 0 confident
   errors. K001 healthy max ratio was 1.81, KI04 damaged min ratio 1.80,
   so the ratio alone cannot separate them — the z-gate carries the
   separation.)
2. `fixed` — one model call (text.format structured finding) over a fixed
   evidence bundle: time stats, envelope peaks, fault-match hits, reference
   z-scores. No tool choices.
3. `investigate` — the full tool-choosing agent (prompt inv-v2, effort low,
   8-call cap, 300 s timeout).

## Metrics

Balanced accuracy (abstentions count as misses), abstention rate, accuracy
among answered, damaged-called-healthy count, unsupported claims (finding
cites evidence IDs not in trace: must be zero by construction), mean
latency, mean input/output tokens.

## Frozen settings

- Model `muse-spark-1.3`, Standard mode, Responses API, reasoning low
- Prompt inv-v2; tools as defined in `backend/app/tools.py` at freeze
- Refs: K001 development repetitions 1-3 per condition (`backend/app/refs.json`)
- Envelope band for arm 1: 2000-8000 Hz; tolerance +/-2%
- Leakage: agent inputs contain no bearing codes (tested); filenames shown
  in the demo UI are anonymized labels only

## Running

    .venv/bin/python scripts/download_all.py     # fetch + hash + extract
    .venv/bin/python scripts/run_eval.py --arm all --split final
    .venv/bin/python scripts/run_eval.py --report

Results: `evals/results.jsonl` (one row per recording per arm) and
`evals/report.md`. Saved traces persist under `data/reports/` (local only).
