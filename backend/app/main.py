"""FastAPI backend. Serves the API and (in demo mode) the built frontend."""

import json
import os

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .agent import REPORTS_DIR, load_trace, run
from .config import ALLOWED_ORIGINS, REFS_PATH
from .docs_store import DocsStore
from .store import Store

app = FastAPI(title="Machine Fault Investigator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

store = Store()
docs = DocsStore()
refs: dict = json.load(open(REFS_PATH)) if os.path.exists(REFS_PATH) else {}
jobs: dict[str, dict] = {}


class ImportCase(BaseModel):
    case: str


class NewInvestigation(BaseModel):
    recording_id: str
    question: str = "What is the condition of this bearing?"


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/cases")
def cases() -> dict:
    return {"cases": store.bundled_cases()}


@app.post("/api/recordings/import")
def import_recording(body: ImportCase) -> dict:
    try:
        return store.import_case(body.case)
    except ValueError as e:
        return {"error": str(e)}


@app.post("/api/investigations")
def create_investigation(body: NewInvestigation, bg: BackgroundTasks) -> dict:
    if body.recording_id not in store.recordings:
        return {"error": f"unknown recording {body.recording_id}"}
    job_id = f"job_{len(jobs) + 1:04d}"
    jobs[job_id] = {"state": "running", "recording_id": body.recording_id}
    bg.add_task(_run_job, job_id, body.recording_id, body.question)
    return {"job_id": job_id, "state": "running"}


def _run_job(job_id: str, recording_id: str, question: str) -> None:
    try:
        trace = run(store, docs, refs, recording_id, question)
    except Exception as exc:  # noqa: BLE001 - boundary: never lose the job
        jobs[job_id] = {"state": "error", "error": f"{type(exc).__name__}"}
        return
    jobs[job_id] = {"state": trace["status"],
                    "investigation_id": trace["investigation_id"]}


@app.get("/api/investigations/{job_id}")
def investigation_status(job_id: str) -> dict:
    job = jobs.get(job_id)
    if job is None:
        return {"error": f"unknown job {job_id}"}
    if job["state"] in ("complete", "incomplete"):
        trace = load_trace(job["investigation_id"])
        return {"state": job["state"], "trace": trace}
    return job


@app.get("/api/report/{investigation_id}")
def report(investigation_id: str) -> dict:
    try:
        trace = load_trace(investigation_id)
    except FileNotFoundError:
        return {"error": f"unknown investigation {investigation_id}"}
    return {
        "investigation": trace,
        "provenance": {
            "source_hashes": _hashes(),
            "refs_built_from": "K001 development repetitions",
            "limitations": ["vibration unit undocumented; geometry FAG 6203 +/-2%"],
        },
    }


def _hashes() -> dict:
    out = {}
    if os.path.exists("data/hashes.txt"):
        with open("data/hashes.txt") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2:
                    out[parts[1]] = parts[0]
    return out


if os.path.isdir("frontend/dist"):  # demo mode: serve the built UI
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="ui")
