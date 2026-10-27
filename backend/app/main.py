"""FastAPI backend. Serves the API and (in demo mode) the built frontend."""

import json
import os

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .agent import load_trace, new_investigation_id, run
from .config import ALLOWED_ORIGINS, REFS_PATH
from .docs_store import DocsStore
from .evidence import series_for, waveform
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


class UploadRecording(BaseModel):
    filename: str
    csv_text: str
    fs: float
    unit: str | None = None
    rpm: float | None = None
    machine: str


class Reveal(BaseModel):
    investigation_id: str


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


@app.post("/api/recordings/upload")
def upload_recording(body: UploadRecording) -> dict:
    try:
        return store.import_upload(body.filename, body.csv_text, body.fs,
                                   body.unit, body.rpm, body.machine)
    except ValueError as e:
        return {"error": str(e)}


@app.post("/api/reveal")
def reveal(body: Reveal) -> dict:
    """Freeze-and-reveal: compare the frozen finding to the documented fault.

    Refuses unless the investigation is complete. Evaluator-owned labels are
    read here only, never in agent paths.
    """
    try:
        trace = load_trace(body.investigation_id)
    except FileNotFoundError:
        return {"error": f"unknown investigation {body.investigation_id}"}
    if trace.get("status") != "complete" or "finding" not in trace:
        return {"error": "investigation not frozen (no complete finding)"}
    fault = store.documented_fault(trace["recording_id"])
    if fault is None:
        return {"error": "documented fault unavailable for this recording"}
    frozen = trace["finding"]["hypothesis"]
    if fault == "mixed_fault_unscored":
        return {"frozen": frozen, "documented": fault, "match": None,
                "note": "challenge case, unscored"}
    return {"frozen": frozen, "documented": fault, "match": frozen == fault}


@app.get("/api/recordings/{recording_id}/waveform")
def recording_waveform(recording_id: str, max_points: int = 8000) -> dict:
    try:
        rec = store.load(recording_id)
    except KeyError:
        return {"error": f"unknown recording {recording_id}"}
    return waveform(rec, max_points=max_points)


@app.post("/api/investigations")
def create_investigation(body: NewInvestigation, bg: BackgroundTasks) -> dict:
    if body.recording_id not in store.recordings:
        return {"error": f"unknown recording {body.recording_id}"}
    job_id = f"job_{len(jobs) + 1:04d}"
    inv_id = new_investigation_id()
    jobs[job_id] = {"state": "running", "recording_id": body.recording_id,
                    "investigation_id": inv_id}
    bg.add_task(_run_job, job_id, body.recording_id, body.question, inv_id)
    return {"job_id": job_id, "state": "running", "investigation_id": inv_id}


def _run_job(job_id: str, recording_id: str, question: str, inv_id: str) -> None:
    try:
        trace = run(store, docs, refs, recording_id, question,
                    investigation_id=inv_id)
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
    try:
        trace = load_trace(job["investigation_id"])
    except FileNotFoundError:
        return {"state": job["state"]}
    if job["state"] == "running":
        return {"state": "running", "steps": trace.get("steps", []),
                "usage": trace.get("usage", {})}
    return {"state": job["state"], "trace": trace}


@app.get("/api/evidence/{investigation_id}/{evidence_id}")
def evidence_series(investigation_id: str, evidence_id: str) -> dict:
    try:
        trace = load_trace(investigation_id)
    except FileNotFoundError:
        return {"error": f"unknown investigation {investigation_id}"}
    item = trace.get("evidence", {}).get(evidence_id)
    if item is None:
        return {"error": f"unknown evidence {evidence_id}"}
    try:
        rec = store.load(trace["recording_id"])
    except KeyError:
        return {"error": "recording unavailable"}
    return series_for(rec, item)


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
