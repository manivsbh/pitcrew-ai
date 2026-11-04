# ⚡ PITCREW.AI: Giving Heavy Machinery a Brain

Autonomous machine diagnostics, parametric 3D digital twins, and acoustic fault investigation for industrial equipment. The technician supplies a vibration or microphone recording; the multi-agent mesh consults technical documentation via RAG, runs numerical and acoustic analyses, explains the evidence, and highlights the suspected component in an interactive 3D assembly while auto-drafting the replacement BOM.

Research question: can an agent that selects its own analyses produce a
better-supported investigation than a fixed workflow? See `evals/` for the
three-arm comparison protocol.

## Layout

- `backend/` — FastAPI app: recordings, numerical analyses, agent loop, reports.
- `frontend/` — Vite + TypeScript UI (assembly, evidence plots, investigation steps).
- `scripts/` — smoke tests, data acquisition, evaluation runners.
- `tests/` — automated tests (numerical, API, leakage, replay).
- `docs-pack/` — cited setup/geometry excerpts (label-free) + attribution.
- `evals/` — frozen splits, protocol, and results.
- `data/` — local recordings and reports (NOT committed; see below).
- `.claude/skills/anatomy/` — Anatomy agent skill (MIT, pinned at upstream
  `1482e84`, 2026-10-18): deterministic isometric SVG figures for docs/demo.
  Installed via `git clone` (the `npx skills` CLI is unusable here: broken
  root-owned npm cache); nested `.git` removed so the files commit with the
  repo. To update, re-clone and re-pin. See `visual-plan/reviews/` verdict.

## Setup (about 10 minutes)

Requires Python 3.12 and Node 20 or newer. No GPU: SAM 2.1, wav2vec 2.0 and
MMS-TTS run on the CPU.

1. Create a `.env` file in the repo root with your Meta API key (it is
   gitignored and only read by the server):

   ```
   MODEL_API_KEY=your-key-here
   ```

2. Install and build.

   Windows (PowerShell):

   ```powershell
   py -3.12 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   cd frontend; npx -y pnpm@10.34.3 install; npx -y pnpm@10.34.3 run build; cd ..
   .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
   ```

   macOS / Linux:

   ```bash
   python3.12 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   (cd frontend && npx -y pnpm@10.34.3 install && npx -y pnpm@10.34.3 run build)
   .venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
   ```

3. Open <http://127.0.0.1:8000/?calls=1#workspace>. The `calls=1` panel lists
   every Meta model call as it happens.

The first SAM 2.1 call downloads its 156 MB checkpoint to `data/models/`, and
the first voice call downloads wav2vec 2.0 and MMS-TTS from Hugging Face.
Expect those first calls to be slow.

Without a key, the app still runs: analysis, 3D and inventory work. Calls
to muse-spark-1.3 return a clear "MODEL_API_KEY is not set" message.

## Judge path (2 minutes)

1. **3D Twin**: pick *Wilfley centrifugal pump (US 3,402,671)*. It was built
   from a 1968 public-domain patent drawing. Try Assemble, Parts sheet,
   Isolate, Run and Explode. **Compare drawing** overlays the source sheet;
   **Verify again** has SAM 2.1 segment the drawing and muse-spark-1.3 grade the
   render and fix it.
2. **Agent lab**: render skills muse-spark-1.3 wrote during those checks. They
   apply to every machine and can be switched off.
3. **Blueprints**: upload any PDF or drawing image, or use
   `data/demo_assets/blueprints/`. The review asks questions, you answer, then
   Finalize builds a new 3D machine.
4. **Diagnose**: play a bundled recording (healthy, inner-race,
   outer-race). The crew avatars light up as each Meta call runs.

Results on drawings the pipeline had never seen: `evals/blueprint-to-3d.md`.

Tests (no network, no key needed):
`.venv/bin/python -m pytest tests/ -q` (Windows: `.\.venv\Scripts\python.exe -m pytest tests/ -q`).

## Data

Everything the demo needs is in `data/demo_assets/` (synthetic signals, bundled
blueprints, and three public-domain patents; see `data/README.md`).

Optional measured recordings come from the Paderborn Bearing DataCenter (CC BY-NC 4.0).
Raw recordings stay outside the repository. Acquisition:

```bash
source .venv/bin/activate
python scripts/fetch_sample.py --bearing K001 --out data/recordings
```

See `data/README.md` for the full acquisition + attribution instructions.

Data-use gate: confirm CC BY-NC 4.0 compatibility with the accepted competition
terms before submission use. Attribution and acquisition instructions do not
themselves resolve permission for competition use.

## Smoke test (Meta API)

```bash
.venv/bin/python scripts/smoke_meta.py   # Windows: .\.venv\Scripts\python.exe scripts\smoke_meta.py
```

Performs one real Responses API tool round-trip on `muse-spark-1.3` (Standard
mode) and logs model ID, latency, and token usage. Must pass before any agent
work (Day-1 gate).

The server binds to localhost only.

## Stack

Python 3.12, NumPy/SciPy, FastAPI, Vite + TypeScript, Three.js, Plotly.js.
Meta `muse-spark-1.3` via the Responses API (OpenAI-compatible SDK).
