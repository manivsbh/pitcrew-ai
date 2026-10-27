# Analysis: the agent did not beat the fixed workflow

## Headline (final split, 60 recordings, 3 unseen bearings)

| Arm | Balanced acc. | Answered acc. | Abstain | Damaged→healthy | Per-bearing | Mean latency |
|---|---|---|---|---|---|---|
| baseline | 0.333 (20/60) | 0.667 (20/30) | 0.500 | 0 | 1/3 | 0.1s |
| fixed | 0.367 (22/60) | 0.512 (22/43) | 0.283 | 0 | 1/3 | 5.6s |
| investigate | 0.167 (10/60) | 0.526 (10/19) | 0.683 | 2 | 1/3 | 71.9s |

Validation shows the same ranking (baseline 17/60, fixed 26/60,
investigate 4/60). Dev is not comparable across arms (see caveat).

## Answer to the research question

No: the tool-choosing agent produced worse-supported investigations than
the fixed workflow on unseen bearings. It abstained on 68% of final cases
(vs 28-50%), its answers were less accurate than the baseline's (53% vs
67%), and it was the only arm with damaged-called-healthy errors (2).
Per-bearing majority vote is 1/3 for every arm: only the outer-ring
bearing (KA16) is consistently identified.

## Root cause: references do not transfer across bearings

All arms compare against K001-only healthy references, and K001-healthy
is unusually loud (rms ~0.40, crest ~12, kurtosis ~10-17). On unseen
bearings:

- Healthy K002/K003 read as highly abnormal (|z| large) with
  BPFO-dominant envelope ratios → all arms overcall outer-ring damage.
- Damaged KA15/KA16 read QUIETER than K001 (rms ~0.21, z ≈ −35) →
  the agent reasons "below healthy mean" and calls them healthy or
  abstains; the baseline's absolute |z| rule at least abstains instead
  of misfiring (0 missed damage).
- Inner-ring damage (KI14/KI16) shows outer-dominant ratios in the
  2-8 kHz band → systematic inner/outer confusion in every arm.

The agent's reasoning is coherent given its inputs; the inputs (single-
bearing references, self-chosen bands) are what fail. It also spends
2-3 of its 8 calls reading documentation, leaving little room to
recover from a weak first analysis.

## Other findings

- Unsupported claims: 0/164 investigated findings cite evidence outside
  their trace. The validation boundary held everywhere.
- Abstention is honest but excessive in the agent (68%): it withholds
  judgment where the baseline's fixed rule commits correctly.
- Challenge KB23 (mixed, unscored): investigate called outer 11/20 and
  abstained 9/20 — directionally sensible for IR(+OR) damage.
- Cost for the full 528-row comparison: $5.88. Mean investigate latency
  72s per recording makes the agent ~700x slower than the baseline.

## Caveats

- Dev K001 reps 1-3 are also the reference files, so dev scores for
  reference-using arms are inflated. Val/final are clean.
- Three bearings per split is a small benchmark, not industrial evidence.
- Frozen protocol was followed: no tuning after val contact; the only
  post-freeze code change was eval-runner parallelism (wall-clock only).

## What would have to change

Population references (multiple healthy bearings), a band policy grounded
in resonance data rather than model choice, and calibration of the
healthy/abstain boundary on held-out bearings — none of which fit the
frozen single-reference design. Those are V2 directions, not V1 fixes.
