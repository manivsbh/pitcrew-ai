# Latency profile (offline replay, no model calls)

Recorded wall latencies from `evals/results.jsonl`; investigate split from replaying saved val traces through the real tool implementations.

## val per-arm latency (seconds)

| arm | n | mean | p50 | p95 | max | tok in/out |
|---|---|---|---|---|---|---|
| baseline | 60 | 0.1 | 0.1 | 0.1 | 0.1 | 0/0 |
| fixed | 60 | 5.6 | 5.6 | 7.7 | 8.7 | 428/1272 |
| investigate | 60 | 72.9 | 72.2 | 91.2 | 114.5 | 15330/2081 |

## final per-arm latency (seconds)

| arm | n | mean | p50 | p95 | max | tok in/out |
|---|---|---|---|---|---|---|
| baseline | 60 | 0.1 | 0.1 | 0.1 | 0.1 | 0/0 |
| fixed | 60 | 5.6 | 5.5 | 7.5 | 12.6 | 428/1226 |
| investigate | 60 | 71.9 | 72.9 | 97.5 | 111.3 | 15169/1832 |

## investigate/val replay attribution (n=60)

- mean wall: 72.9s = model round-trips 72.8s + local tool execute 0.09s
- mean rounds (model calls) per investigation: 6.3 (=> ~11.5s per round)
- tool-call histogram: analyze_vibration 120, read_documentation 78, submit_finding 62, inspect_recording 60, compare_reference 59
- execute time by tool: analyze_vibration 4.52s, inspect_recording 0.54s, compare_reference 0.51s, submit_finding 0.00s, read_documentation 0.00s

Bottom line: the investigate arm is model-bound (>99% of wall time in API round-trips). Local analysis is milliseconds; cutting rounds (fewer doc reads, earlier submit) is the only latency lever that matters.
