# Evaluations

Three workflows compared on the same frozen cases:

1. Deterministic numerical baseline.
2. Meta explanation over a fixed set of numerical results.
3. Meta investigation choosing analyses through tools.

Metrics: balanced accuracy, abstention rate, accuracy among answered cases,
damaged bearings called healthy, unsupported claims, latency, token usage.
Abstentions count as misses in the overall classification score.

The final protocol (splits, repetitions, seeds, budgets) is frozen Nov 1
before inspecting final results. Labels live in the evaluator only and are
revealed after predictions freeze.
