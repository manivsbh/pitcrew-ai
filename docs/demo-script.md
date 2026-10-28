# Demo script (9 beats, ~8 minutes)

Setup: `source .venv/bin/activate`, `export MODEL_API_KEY="..."`,
`cd frontend && npm run build && cd ..` (required: serves the UI),
`uvicorn backend.app.main:app --host 127.0.0.1 --port 8000`,
open http://127.0.0.1:8000/ in a browser.

> UI map (React app): landing page → "Enter the workspace" →
> Workspace tab. Recording dropdown, agent steps, finding,
> freeze/reveal, and evidence chips live in the right-hand
> Investigation copilot; waveform/Spectrum tabs sit under the
> assembly; sim controls (Parts sheet / Assemble / Run / Fault)
> are under the 3D viewport; Blueprints = pack-builder +
> segmentation; Inventory = catalog + sandbox orders; Agent lab =
> specialists + guided checks.

1. **Select (30s).** Pick "Recording N — N15_M07_F10" from the dropdown.
   Note the anonymized label: operating point only, no bearing identity.
   Waveform appears.
2. **Inspect (30s).** Point out the assembly, waveform, and the question box.
   Press Investigate.
3. **Investigate (2-3 min, live).** Steps stream into the Investigation panel:
   inspect, time stats, reference comparison, envelope fault match,
   citations, finding. Narrate one tool choice and its output.
4. **Evidence (60s).** Click the `fault_match` evidence chip: envelope plot
   with BPFO/BPFI target lines and the hits table. Open the geometry
   excerpt to show the cited source.
5. **Assembly (45s).** The suspect ring is highlighted and the bearing
   exploded automatically. Drag to orbit; use the Explode slider; pick
   parts from the keyboard-accessible component list.
6. **Simulation (60s).** On the pump: Parts sheet lays out all groups;
   Assemble rebuilds in the 13 manual-verified steps with captions;
   pick Worn impeller and Run — the stack spins at 70% speed with red
   fault markers, wobble, and an impacted-output caption.
7. **Freeze & reveal (30s).** Read the frozen finding, press "Freeze &
   reveal documented fault": MATCH against the dataset record.
8. **Abstention (60s).** Upload CSV: 64000 zeros at 64 kHz / 1500 rpm.
   Investigate: flat signal, no references, agent submits
   insufficient_evidence with a concrete next measurement. No forced
   diagnosis.
9. **New machines from PDFs (90s).** Switch the machine picker across
   all four machines: rig, CR pump (authored), demo pump and V6 engine
   (both built from manual PDFs via Blueprints → pack-builder, no
   per-machine code). On the V6: Parts sheet, Assemble (4 derived
   steps), Run with Injector misfire — fuel pulses stop on the dead
   cylinder. Inventory fills itself from pack components.

Fallbacks: if the live run stalls, open a saved trace from `data/reports/`
via Export; if the API key is missing, the smoke command
`python scripts/smoke_meta.py` shows the exact failure. Never run a cold
investigate on stage: the agent averages ~72s per recording
(see `evals/latency.md`); pre-run and replay saved traces instead.
