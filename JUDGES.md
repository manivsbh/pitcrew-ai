# For the judges

Thank you for reviewing PitCrew.ai. This page is the front door: a fast way to
confirm the app runs, a short guided tour, and where to see every Meta model
call as it happens.

Everything you need is in this one public repository — the backend, the built
UI, bundled demo assets (synthetic signals, three public-domain patents), the
tests, and the eval protocol and results. There is nothing else to download.

- **Video (2:54):** see `submission/youtube.md` for the link, chapters, and the
  Meta response IDs behind each sped-up span.
- **Repo:** <https://github.com/manivsbh/pitcrew-ai>

## What is Meta here

PitCrew is a crew of agents that are all the same Meta model, `muse-spark-1.3`,
each given a different role, plus three local open-weight Meta models for
perception and voice. The coordination layer is what we built.

| Model | Where it runs | What it does |
| --- | --- | --- |
| `muse-spark-1.3` | api.meta.ai | blueprint review, render verification, supervisor, investigator, assembly grounding, harness distillation |
| SAM 2.1 | local, CPU | segments drawings and workbench photos |
| wav2vec 2.0 | local, CPU | push-to-talk speech to text |
| MMS-TTS | local, CPU | speaks the reply |

Muse Image 1.0 generated the b-roll stills in the demo video only; it is not
part of the running product.

Every call — API and local — is tagged with the crew role that made it and
streamed live to the call log. Open any page with `?calls=1` to watch it.

## Run it (about 10 minutes)

Full requirements and both OS command blocks are in
[`README.md`](README.md#setup-about-10-minutes). A normal laptop, no GPU.

1. Put a Meta key in `.env` at the repo root:

   ```
   MODEL_API_KEY=your-key-here
   ```

   **No key?** The app still runs. The 3D twin, numerical and acoustic
   analysis, and the inventory all work. Only the `muse-spark-1.3` calls return
   a clear "MODEL_API_KEY is not set" message, so you can still review the whole
   UI and the local Meta models (SAM 2.1, wav2vec 2.0, MMS-TTS) without one.

2. Install, build the UI, and start one server (Windows PowerShell):

   ```powershell
   py -3.12 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   cd frontend; npx -y pnpm@10.34.3 install; npx -y pnpm@10.34.3 run build; cd ..
   .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
   ```

   macOS / Linux commands are in the README.

3. Open **<http://127.0.0.1:8000/?calls=1#workspace>**. The `calls=1` panel
   lists every Meta call live.

The first SAM 2.1 call downloads a 156 MB checkpoint, and the first voice call
downloads wav2vec 2.0 and MMS-TTS. Those first calls are slow; later ones are
not.

## 60-second check it is really running

With the server up:

```
http://127.0.0.1:8000/api/health   ->  {"status":"ok"}
http://127.0.0.1:8000/api/meta      ->  packs, components, checks, eval rows
```

Or run the tests (no network, no key needed):

```powershell
.\.venv\Scripts\python.exe -m pytest tests/ -q
```

## 2-minute guided tour

1. **3D Twin** — pick *Wilfley centrifugal pump (US 3,402,671)*, built from a
   1968 public-domain patent drawing. Try Assemble, Parts sheet, Isolate, Run,
   Explode. **Compare drawing** overlays the source sheet. **Verify again** has
   SAM 2.1 segment the drawing and `muse-spark-1.3` grade the render and fix it
   — watch both appear in the call log.
2. **Agent lab** — the render skills `muse-spark-1.3` wrote during those checks.
   This is the self-improving harness: confirmed teardowns become reusable
   skills the next diagnosis reads first. You can toggle them off.
3. **Blueprints** — upload any PDF or drawing, or use
   `data/demo_assets/blueprints/`. The review asks questions; answer, then
   Finalize builds a new 3D machine.
4. **Diagnose** — play a bundled recording (healthy, inner-race, outer-race).
   The crew avatars light up as each Meta call runs.

Results on drawings the pipeline had never seen: `evals/blueprint-to-3d.md`.
The three-arm comparison (does the self-improving harness beat a fixed
workflow?) is in `evals/`.

## Where to look for depth

- Live call wrapper that tags every call with its crew role:
  [`backend/app/meta_calls.py`](backend/app/meta_calls.py)
- Bounded investigator loop (the agent picks its own analyses):
  [`backend/app/agent.py`](backend/app/agent.py)
- Self-evolving harness (propose-probe-compose, experience distillation):
  [`backend/app/harness.py`](backend/app/harness.py)
- Supervisor that fuses sound + photo + manual:
  [`backend/app/assist.py`](backend/app/assist.py)
- Video + model credits: `submission/youtube.md`, `submission/video/CREDITS.md`.
