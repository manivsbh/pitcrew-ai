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

## Latency note

At ~18 s per serial call, 8 calls would exceed the 120 s investigation
timeout. The cap and the timeout are independent guards: typical paths
(inspect -> analyze -> compare -> finding, 4-5 calls) fit in ~70-90 s;
longer runs time out explicitly as incomplete investigations. Reasoning
effort stays at the model default until dev-set tuning says otherwise.
