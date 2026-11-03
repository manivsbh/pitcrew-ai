# Machine Fault Investigator

Local AI investigation workspace for a technician diagnosing a motor-and-bearing
assembly. The technician supplies a vibration recording; the system consults
technical documentation, runs numerical analyses, explains the evidence, and
highlights the suspected bearing component in an interactive 3D assembly.

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

## Setup

Requires Python 3.12 and Node 24.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export MODEL_API_KEY="..."   # never commit; server-side only
```

Frontend (from `frontend/`): `npm install`, then `npm run build`.
The backend serves the built frontend (`frontend/dist/`, not committed)
locally in demo mode — without the build step the UI is blank.
Use `npm run dev` only for frontend development.

## Data

Measured recordings come from the Paderborn Bearing DataCenter (CC BY-NC 4.0).
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
source .venv/bin/activate
python scripts/smoke_meta.py
```

Performs one real Responses API tool round-trip on `muse-spark-1.3` (Standard
mode) and logs model ID, latency, and token usage. Must pass before any agent
work (Day-1 gate).

## Run

```bash
source .venv/bin/activate
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Binds to localhost only. No public exposure.

## Stack

Python 3.12, NumPy/SciPy, FastAPI, Vite + TypeScript, Three.js, Plotly.js.
Meta `muse-spark-1.3` via the Responses API (OpenAI-compatible SDK).
