# Smoke baseline (Day-1 gate, 2026-10-27)

One real Responses API tool round-trip, `muse-spark-1.3`, Standard mode.

- Tool round-trip (`get_recording_info` + `previous_response_id` threading): OK
- Latency: 35.9 s for 2 model calls (~18 s/call)
- Tokens: 689 in / 148 out, 113 cached on the second call (prefix cache works)
- Cost of this exchange: ~$0.0015 at $1.25/$4.25 per 1M in/out

## Budget projection (final evaluation)

- Fixed-explanation arm (~1 call): ~$0.002/recording
- Investigation arm (~5 calls): ~$0.008/recording
- 60 recordings x both arms: roughly $0.60 total. Credits-only, no overage.

## Live-run calibration (Day 3, dev data)

First real run timed out at 120 s after 3 calls (~40 s/call with default
reasoning and doc-heavy history). Calibrated on dev data:

- `INVESTIGATION_TIMEOUT_S`: 120 -> 300 (guard, not target)
- `REASONING_EFFORT`: default -> low (tool orchestration, not deep reasoning)
- Prompt inv-v1 -> inv-v2 (inspect first, analyze early, docs on demand)

Second run (KA04 outer-ring damage): complete in 8 calls / 113.7 s, correct
outer_ring_damage finding with BPFO 76.25 vs 76.35 Hz target. Cost ~$0.035.
Revised full-eval projection: 60 recordings x ~$0.04 ~= $2.50 worst case.
