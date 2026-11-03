# Eval: figure publish readiness

Gate between a verified figure build and the Workspace Figure tab.
Applies to every `figures/<machine>` submit. Golden set:
`evals/figures-golden/` (pass-rig-dark/light, fail-blank/blob).

## Capability evals

- CE1: segment rules PASS both rig captures.
- CE2: segment rules FAIL `fail-blank.png` (nothing rendered).
- CE3: segment rules FAIL `fail-blob.png` (undifferentiated fill).
- CE4: vision verdict publishes the rig capture (needs `MODEL_API_KEY`).
- CE5: vision verdict rejects `fail-blank.png` (needs `MODEL_API_KEY`).

## Regression evals

- RE1: code gates unchanged (full pytest suite green).
- RE2: traceability rule intact (100% sourced numbers).

## Graders

1. Code — ink coverage: non-background pixel fraction of the dark desktop
   capture (corner pixel = background, >30 channel-sum distance = ink).
   Rule: ink >= 0.02. Calibrated 2026-10-29: rig 0.099/0.106, blank 0.000.
2. Rule — SAM largest region: `segment_photo` largest mask area / frame.
   Rule: largest <= 0.50. Calibrated: rig 0.00/0.02, blank 1.00, blob 0.73.
   (SAM auto-masks barely fire on thin line art, so this rule catches only
   catastrophic fills; it is not a quality score. Overlay is kept for the
   human and the vision prompt context.)
3. Model — vision verdict: dark capture + registry + spec concept/readout/
   honesty + segment summary → JSON
   `{publish, score 1-5, reasons[<=3], missing[], artifacts[]}`.
   Pass: `publish == true && score >= 4`. Bounded: 3 attempts per submit,
   pass@1-of-3; any error fails closed. Rubric: recognizable machine
   matching the concept; subject parts visible, not floating or blobbed;
   readout present; no large unfinished regions.
4. Human — approval in Blueprints, only offered on model pass. No override
   of a model fail in v1.

## Metrics

- Segment rules: deterministic; re-run on the golden set must stay 4/4.
- Model grader: pass@3 agreement with the golden labels, target >= 0.90.
  (Agreement run pending `MODEL_API_KEY`; until then the rubric + stub
  tests ship and the gate runs in production only with a key, else the
  submit fails closed with `vision unavailable`.)

## Run history

- 2026-10-29: bands fixed (ink>=0.02, largest<=0.50) from golden set;
  CE1-CE3 pass; CE4-CE5 pending key.
