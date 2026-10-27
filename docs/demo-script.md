# Demo script (7 beats, ~6 minutes)

Setup: `source .venv/bin/activate`, `uvicorn backend.app.main:app
--host 127.0.0.1 --port 8000`, open http://127.0.0.1:8000/ in a browser.

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
6. **Freeze & reveal (30s).** Read the frozen finding, press "Freeze &
   reveal documented fault": MATCH against the dataset record.
7. **Abstention (60s).** Upload CSV: 64000 zeros at 64 kHz / 1500 rpm.
   Investigate: flat signal, no references, agent submits
   insufficient_evidence with a concrete next measurement. No forced
   diagnosis.

Fallbacks: if the live run stalls, open a saved trace from `data/reports/`
via Export; if the API key is missing, the smoke command
`python scripts/smoke_meta.py` shows the exact failure.
