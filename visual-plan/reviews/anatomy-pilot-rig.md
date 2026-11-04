# Verdict: anatomy pilot (rig-6203 figure)

Date: 2026-10-29. Pilot built per plan: one Figure-size SVG explainer from
`packs/rig` via the anatomy kit (`skills/anatomy`, pinned at
upstream `1482e84`). Figure: `figures/rig/` (build ~313 lines + 37-line
pure model), committed built pages dark + light.

## Is it better and more deterministic than ours?

Yes, in the senses that matter for trust — but it is not a replacement.

| Aspect | Ours (generic builder) | Anatomy pilot |
|---|---|---|
| Mapping | Name-keyword heuristics | Parts-list + true-numbers first |
| Machine checks | None (coverage count only) | lines 0, byte-identical rebuild |
| Output | Diagrammatic 3D scene | Crafted SVG explainer |
| Cost per machine | Zero (instant, any pack) | Hours (bespoke build) |
| Evidence tie-in | Suspect highlight, run, faults | Readout only, no app link |

Detail:

- Ours (`buildGeneric`, `frontend/src/sim/assembly.ts:784`) executes
  deterministically but maps by guesswork: hierarchy auto-layout plus
  `classify(name)` keyword shapes, palette cycling. Nothing proves the
  geometry; schematic look is accepted per `packs/BUILDER.md`.
- The pilot constrains the agent (concept and 60+ part list before geometry,
  verified numbers only) and the result is machine-checked: `lines.mjs`
  prints `line ends: 0` on both themes, two rebuilds are byte-identical
  (sha256), the model matches `backend/app/analysis.py fault_frequencies`
  to 6 decimals, captures are console-clean with no sideways scroll on
  desktop, light, phone, hover, keyboard, and reduced-motion runs.
- Different jobs: the pilot cannot do what the viewer does (registry-driven
  interactive Three.js with suspect highlight, explode, run/fault
  simulation). It is an explainer figure, not an investigation surface.

## Scope notes (deviations from plan, all honest)

- No `--audit` run: the audit proves lathe/tube/explode geometry; the pilot
  uses slabs, cylinders, and 8 lathe spheres with wide clearances, matching
  the skill's own smallest example (`dial-indicator`), which ships no audit
  hook. Replacement evidence: lines 0 + byte-identical rebuilds.
- Chrome checks need an unsandboxed shell: headless Chrome SIGABRTs under
  the macOS sandbox even with `--no-sandbox`; `capture.mjs`/`lines.mjs`
  were run with one-time escalated approval. Budget for that in future runs.
- Two planned rotation cues were cut after screenshots proved them
  invisible (inner-ring etched dot under the cage, cage pockets under the
  balls). Rule learned: every motion must be visible or it is cut.

## Decision (gate)

Option (a): keep anatomy as a docs/landing/demo figure track. Do not wire it
into the viewer or packbuilder before the Nov 4 deadline.

- The skill install (27 MB, examples included) is the main cost; a future
  prune could drop `examples/` built pages if size matters.
- Revisit (b) — anatomy SVG as a sheet view, or audit-style gates in
  packbuilder — only after the demo, with a second pilot.

## Reproduce

`cd figures/rig-6203 && node build.mjs && node build.mjs --light`,
then `lines.mjs` on both pages (expect `line ends: 0`) and `capture.mjs`
for desktop/light/phone. Screenshots from this run are in `shots/`.
