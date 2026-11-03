# Figures demo + test plan (cr-pump first, rig second)

Pipeline: spec → author → code gates (9) → eval gate (SAM + vision) → human
approve → Workspace Figure tab. Full suite green: 130 passed (29 Oct).

## 0. Setup (once per terminal)

```bash
source .venv/bin/activate
set -a; . ./.env; set +a   # MODEL_API_KEY lives in gitignored .env
cd frontend && npm run build && cd ..
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/. Check `echo $MODEL_API_KEY | head -c 8`
prints `LLM_1143` before any eval run. Port 8000 must be free; the server
holds jobs in memory, so restarting it wipes job ids (specs on disk stay).

Direct figure URLs (no job needed):
` /figures/cr-pump/cr-pump.html`, ` /figures/cr-pump/cr-pump-light.html`,
`/figures/rig/rig-6203.html`.

## Part A — Demo script (~12 min)

1. **Premise (30s).** Crafted SVG explainer figures, dimension-grounded, no
   invented numbers. Everything on screen traces to `spec.json`
   (213 sourced numbers for cr-pump).
2. **Generate + submit (1 min).** Blueprints → Crafted figures →
   `Generate figure` next to the CR pump, then `Submit build`. The job
   verifies in the background (~4–6 min, ~1–3 vision calls).
3. **While it runs (4 min).** Open the cr-pump figure URL. Arrow keys step
   the 13 torque stations; the readout shows pos + name + torque. Show the
   light theme and `figures/cr-pump/shots/phone.png`. Point out the
   honesty line: heights/diameters illustrative, torques/sequence manual-true.
4. **Gates (1 min).** Back in Blueprints the job line shows all 9 gates
   passing: toolchain, build, determinism (stable sha), lines-dark,
   lines-light (0/245 float), capture dark/light/phone (console-clean),
   traceability.
5. **Verdict + approve (2 min).** Read the verdict (publish, score ≥ 4,
   reasons) and segment line (ink ≈ 0.07, largest ≈ 0.005). Click
   `Approve & publish`. No override exists: approve is refused unless the
   job is `eval_pass`.
6. **Workspace (1 min).** Workspace → 3D/Figure toggle → Figure tab shows
   the published cr-pump figure in an iframe. The generic 3D viewer is
   untouched.

Fallbacks: if the live submit stalls, narrate from
`figures/cr-pump/shots/` (dark/light/phone/reduced/station close-ups) and
the committed gate captures; if the key is missing, the verdict says
`vision unavailable (no MODEL_API_KEY)` — that is the designed fail-closed,
demo it as T5 instead.

## Part B — Test plan (do in order, tick off)

- [ ] **T1 automated.** `python -m pytest tests/ -q` → 130 passed.
  `cd frontend && npm run build` → builds clean.
- [ ] **T2 happy path.** Fresh server, Blueprints → Generate (cr-pump) →
  Submit → wait → `eval_pass`. Expect 9/9 gates, verdict publish true,
  score ≥ 4, attempts ≤ 3. Click Approve → status `published` →
  Workspace Figure tab renders the figure. Record vision attempts (spend).
- [ ] **T3 resume.** After T2's submit (or any live job), open the app in a
  second tab: expect `Resume job fg_NNNN` next to the machine. Click it →
  job line, gates, and verdict load; Approve appears on `eval_pass`.
- [ ] **T4 restart recovery.** Restart the server mid-flow: jobs vanish,
  specs stay. UI offers Generate again (never strands on `eval_pass` with
  no buttons). Re-run T2 to green.
- [ ] **T5 no-key fail-closed.** `unset MODEL_API_KEY`, restart server,
  Generate + Submit → gates pass, verdict is `vision unavailable
  (no MODEL_API_KEY)`, score 0, attempts 0. Approve click (via Resume) is
  refused. Restore the key afterwards.
- [ ] **T6 determinism.** Submit the same build twice → the `determinism`
  gate shows the identical sha both times; `lines-*` stay 0/245.
- [ ] **T7 figure QA (author-level).** `cd figures/cr-pump`:
  `node build.mjs && node build.mjs --light`, then
  `node ../../.claude/skills/anatomy/scripts/lines.mjs cr-pump.html --wait 1500,8000`
  (expect `0 of 245 ... float`, console clean) and the same for
  `cr-pump-light.html`. Spot-check one station close-up with `capture.mjs
  --zoom` and confirm the lit marker sits on the readout fastener.
- [ ] **T8 rig regression.** Repeat T2 for the rig machine. Expect the same
  green shape (its line/ink counts differ; any red is a real bug).

## Sign-off

Demo-ready when T1–T4 + T8 pass and one full run's vision spend is logged.
T5–T7 are release gates for the Nov 4 deadline. Work is currently
uncommitted in the tree; commit when the plan is green.
