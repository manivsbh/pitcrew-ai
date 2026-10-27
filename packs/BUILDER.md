# Pack-builder contract (FINAL — accepted 2026-10-27)

User acceptance: "accept" (2026-10-27, this session).

How the agent turns a manual PDF into a generic 3D model, and how it
reasons with the user about whether the manual is enough.

## Settled decisions

1. **Sufficiency bar (accepted 2026-10-27).** Confirmed part names +
   parent structure is ENOUGH to build 3D. Dimensions deferred to a
   later stage. All drafted 3D is schematic (illustrative proportions,
   labeled not-to-scale). Input reliability ladder agreed:
   text structure first, vendor 3D files when obtainable, blueprints
   as verification only, photos for part ID only.
2. **Auto-finalize (accepted 2026-10-27).** Agent may finalize without
   per-part user review when the draft passes the threshold. Threshold
   (accepted 2026-10-27): rule score >= 80 AND model verdict "enough"
   AND >= 8 parts. Below threshold: turn-based Q&A, user confirms.
3. **Schematic generic 3D (accepted 2026-10-27).** Hierarchy auto-layout
   (levels stack, siblings ring) + name-keyword shapes for any machine
   without a hand-built template. Diagrammatic look accepted; hand-built
   templates stay for demo machines.
4. **Manual-only failure modes (accepted 2026-10-27).** Failure modes
   only from manual troubleshooting text; empty lists shown honestly as
   "none documented". Never agent-suggested.

## Scope boundary (proposed, needs acceptance)

In scope: `backend/app/packbuilder.py`, draft/review/answer/finalize API
routes, generic schematic 3D builder, draft Q&A UI, tests, this contract.
Out of scope: photo/vision input, voice I/O, inventory, UI refresh,
dimension-accurate geometry (deferred stage, own interview).

## Open questions
2. (settled below) **Who confirms structure?** Agent may auto-finalize
   above a confidence threshold (alternative accepted 2026-10-27).
   Threshold settled: score >= 80 + verdict enough + >= 8 parts.
3. (settled below) **Generic layout rules.** Schematic auto-layout
   accepted 2026-10-27.
4. (settled below) **Failure modes.** Manual-only accepted 2026-10-27.

## Done means (proposed)

- [ ] Upload PDF -> candidates + readiness score + questions in UI
- [ ] One bounded model review per draft, user edits, finalize writes pack
- [ ] New pack renders in generic 3D + appears in machine tabs
- [ ] Tests green, commit landed
