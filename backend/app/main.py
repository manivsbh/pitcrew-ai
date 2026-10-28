"""FastAPI backend. Serves the API and (in demo mode) the built frontend."""

import json
import os

from fastapi import BackgroundTasks, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .agent import default_client_factory, load_trace, new_investigation_id, run
from .config import ALLOWED_ORIGINS, REFS_PATH, model_api_key
from .docs_store import DocsStore
from .evidence import series_for, waveform
from .assist import assist_turn, load_session, parse_signal_csv, parse_wav
from .guide import answer as guide_answer
from .guide import get_playbook, start as guide_start
from .inventory import audit_trail, cancel, confirm, connect, create_draft
from .inventory import get_order as inv_get_order
from .inventory import part_for_component, search, submit, sync_from_pack
from .segment import segment_photo
from .packbuilder import (apply_edits, finalize, load_draft, new_draft,
                          reason_with_model)
from .packs import list_packs, load_pack
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


class DraftAnswer(BaseModel):
    edits: list[dict] = []
    new_components: list[dict] = []


class GuideStart(BaseModel):
    machine: str
    playbook_id: str


class GuideAnswer(BaseModel):
    result: str
    note: str = ""
    action: str = "continue"


class OrderDraft(BaseModel):
    machine: str
    lines: list[dict]
    budget_cap: float | None = None


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


@app.get("/api/packs")
def packs() -> dict:
    return {"packs": list_packs()}


@app.get("/api/meta")
def meta() -> dict:
    """Honest headline stats for the hero. All values computed locally."""
    import re

    packs = list_packs()
    components = sum(p["components"] for p in packs)
    checks = 0
    for p in packs:
        loaded = load_pack(p["machine"])
        if loaded:
            checks += sum(pb["checks"] for pb in loaded["playbooks"])
    eval_rows = 0
    if os.path.exists("evals/results.jsonl"):
        with open("evals/results.jsonl") as f:
            eval_rows = sum(1 for line in f if line.strip())
    unsupported = None
    if os.path.exists("evals/analysis.md"):
        with open("evals/analysis.md") as f:
            m = re.search(r"Unsupported claims:\s*(\d+)/(\d+)", f.read())
        if m:
            unsupported = {"n": int(m.group(1)), "of": int(m.group(2))}
    return {"packs": len(packs), "components": components, "checks": checks,
            "eval_rows": eval_rows, "unsupported_claims": unsupported}


@app.get("/api/packs/{machine}")
def pack(machine: str) -> dict:
    loaded = load_pack(machine)
    if loaded is None:
        return {"error": f"unknown machine pack {machine}"}
    return loaded


def _draft_view(draft: dict) -> dict:
    return {"id": draft["id"], "machine": draft["machine"],
            "title": draft["title"], "status": draft["status"],
            "candidates": draft["candidates"],
            "assessment": draft["assessment"], "review": draft["review"]}


@app.post("/api/packs/draft")
async def draft_upload(machine: str = Form(...), title: str = Form(...),
                       file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if len(data) > 30_000_000:
        return {"error": "PDF exceeds the 30 MB draft cap"}
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return {"error": "upload a .pdf manual"}
    try:
        draft = new_draft(machine.strip().lower().replace(" ", "-"), title,
                          data)
    except Exception as e:
        return {"error": f"could not read PDF: {e}"}
    return _draft_view(draft)


@app.get("/api/packs/draft/{draft_id}")
def draft_get(draft_id: str) -> dict:
    draft = load_draft(draft_id)
    if draft is None:
        return {"error": f"unknown draft {draft_id}"}
    return _draft_view(draft)


@app.post("/api/packs/draft/{draft_id}/reason")
def draft_reason(draft_id: str) -> dict:
    draft = load_draft(draft_id)
    if draft is None:
        return {"error": f"unknown draft {draft_id}"}
    try:
        key = model_api_key()
    except RuntimeError as e:
        return {"error": str(e)}
    from .packbuilder import save_draft
    review = reason_with_model(draft["text"], draft["candidates"],
                               default_client_factory(key))
    draft["review"] = review
    save_draft(draft)
    auto = (draft["assessment"]["score"] >= 80
            and review.get("verdict") == "enough"
            and len(draft["candidates"]) >= 8)
    return {"review": review, "auto_finalize": auto}


@app.post("/api/packs/draft/{draft_id}/answer")
def draft_answer(draft_id: str, body: DraftAnswer) -> dict:
    draft = load_draft(draft_id)
    if draft is None:
        return {"error": f"unknown draft {draft_id}"}
    if draft["status"] == "finalized":
        return {"error": "draft already finalized"}
    return _draft_view(apply_edits(draft, body.edits, body.new_components))


@app.post("/api/assist")
async def assist(session: str | None = Form(None),
                 machine: str = Form(...), message: str = Form(...),
                 fs: float = Form(0.0), rpm: float | None = Form(None),
                 photo: UploadFile | None = File(None),
                 signal_csv: UploadFile | None = File(None),
                 wav: UploadFile | None = File(None)) -> dict:
    try:
        key = model_api_key()
    except RuntimeError as e:
        return {"error": str(e)}
    photo_bytes = None
    if photo is not None:
        photo_bytes = await photo.read()
        if len(photo_bytes) > 5_000_000:
            return {"error": "photo exceeds the 5 MB cap"}
        if not photo_bytes:
            return {"error": "empty photo upload"}
    signal = None
    if signal_csv is not None:
        if fs <= 0:
            return {"error": "signal_csv needs fs (Hz)"}
        raw = (await signal_csv.read()).decode("utf-8", "replace")
        if len(raw) > 10_000_000:
            return {"error": "signal_csv exceeds the 10 MB cap"}
        signal = (parse_signal_csv(raw), fs)
    if wav is not None:
        data = await wav.read()
        if len(data) > 10_000_000:
            return {"error": "wav exceeds the 10 MB cap"}
        try:
            signal = parse_wav(data)
        except Exception as e:
            return {"error": f"could not read wav: {e}"}
    return assist_turn(machine, message, default_client_factory(key),
                       session=session, photo=photo_bytes, signal=signal,
                       rpm=rpm)


@app.get("/api/packs/{machine}/playbooks/{playbook_id}")
def playbook_full(machine: str, playbook_id: str) -> dict:
    pb = get_playbook(machine, playbook_id)
    if pb is None:
        return {"error": f"unknown playbook {playbook_id} for {machine}"}
    return pb


@app.post("/api/guide/start")
def guide_start_route(body: GuideStart) -> dict:
    return guide_start(body.machine, body.playbook_id)


@app.post("/api/guide/{guide_id}/answer")
def guide_answer_route(guide_id: str, body: GuideAnswer) -> dict:
    return guide_answer(guide_id, body.result, body.note, body.action)


@app.get("/api/inventory/search")
def inv_search(machine: str, q: str = "") -> dict:
    with connect() as conn:
        return {"parts": search(conn, machine, q), "sandbox": True}


@app.get("/api/inventory/by-component/{machine}/{component_id}")
def inv_component(machine: str, component_id: str) -> dict:
    with connect() as conn:
        part = part_for_component(conn, machine, component_id)
    if part is None:
        return {"error": f"no orderable part for {component_id}"}
    part["sandbox"] = True
    return part


@app.post("/api/inventory/orders")
def inv_draft(body: OrderDraft) -> dict:
    with connect() as conn:
        return create_draft(conn, body.machine, body.lines, body.budget_cap)


@app.get("/api/inventory/orders/{order_id}")
def inv_order(order_id: str) -> dict:
    with connect() as conn:
        return inv_get_order(conn, order_id)


@app.post("/api/inventory/orders/{order_id}/confirm")
def inv_confirm(order_id: str) -> dict:
    with connect() as conn:
        return confirm(conn, order_id)


@app.post("/api/inventory/orders/{order_id}/submit")
def inv_submit(order_id: str) -> dict:
    with connect() as conn:
        return submit(conn, order_id)


@app.post("/api/inventory/orders/{order_id}/cancel")
def inv_cancel(order_id: str) -> dict:
    with connect() as conn:
        return cancel(conn, order_id)


@app.get("/api/inventory/audit")
def inv_audit() -> dict:
    with connect() as conn:
        return {"audit": audit_trail(conn)}


@app.post("/api/vision/segment")
async def vision_segment(photo: UploadFile = File(...)) -> dict:
    data = await photo.read()
    if not data:
        return {"error": "empty photo upload"}
    if len(data) > 5_000_000:
        return {"error": "photo exceeds the 5 MB cap"}
    try:
        return segment_photo(data)
    except Exception as e:
        return {"error": f"segmentation failed: {e}"}


@app.get("/api/assist/{session_id}")
def assist_history(session_id: str) -> dict:
    sess = load_session(session_id)
    if sess is None:
        return {"error": f"unknown assist session {session_id}"}
    return {"session": sess["session"], "machine": sess["machine"],
            "turns": sess["turns"]}


@app.post("/api/packs/draft/{draft_id}/finalize")
def draft_finalize(draft_id: str) -> dict:
    draft = load_draft(draft_id)
    if draft is None:
        return {"error": f"unknown draft {draft_id}"}
    if draft["status"] == "finalized":
        return {"error": "draft already finalized"}
    try:
        out = finalize(draft)
    except ValueError as e:
        return {"error": str(e)}
    try:
        with connect() as conn:
            out["inventory_added"] = sync_from_pack(
                conn, out["machine"],
                load_pack(out["machine"])["components"])
    except Exception as e:
        out["inventory_error"] = str(e)
    return out


@app.post("/api/inventory/backfill")
def inv_backfill() -> dict:
    total, per = 0, {}
    with connect() as conn:
        for m in list_packs():
            n = sync_from_pack(
                conn, m["machine"],
                load_pack(m["machine"])["components"])
            per[m["machine"]] = n
            total += n
    return {"added": total, "per_machine": per}


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
