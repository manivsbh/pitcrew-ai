"""FastAPI backend. Serves the API and (in demo mode) the built frontend."""

import asyncio
import json
import os

from fastapi import (BackgroundTasks, FastAPI, File, Form, Request, Response,
                     UploadFile, WebSocket, WebSocketDisconnect)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .agent import (default_client_factory, list_traces, load_trace,
                    new_investigation_id, run)
from .config import ALLOWED_ORIGIN_REGEX, ALLOWED_ORIGINS, PORT, REFS_PATH, model_api_key
from .docs_store import DocsStore
from .evidence import series_for, waveform
from .assist import assist_turn, load_session, parse_signal_csv, parse_wav
from .guide import answer as guide_answer
from .guide import get_playbook, start as guide_start
from .inventory import (audit_trail, cancel, confirm, connect, create_draft,
                        get_order as inv_get_order, part_for_component,
                        recommend_repair_kit, restock_machine, search, submit,
                        sync_from_pack)
from .segment import ground_assembly_guide, segment_photo
from .packbuilder import (VALID_KINDS, apply_edits, derive_assembly,
                          derive_scenarios, finalize, load_draft,
                          merge_vision_candidates, new_draft,
                          reason_with_model, save_draft)
from .packs import list_packs, load_pack
from . import figures, harness, mobile_sync, orchestrator, rag
from .store import Store

app = FastAPI(title="PITCREW.AI — Giving Heavy Machinery a Brain")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

store = Store()
docs = DocsStore()
refs: dict = json.load(open(REFS_PATH)) if os.path.exists(REFS_PATH) else {}
jobs: dict[str, dict] = {}
figure_jobs: dict[str, dict] = {}


class ImportCase(BaseModel):
    case: str


class NewInvestigation(BaseModel):
    recording_id: str
    question: str = "What is the condition of this bearing?"
    mode: str = "v2"
    machine: str = "rig"


class UploadRecording(BaseModel):
    filename: str
    csv_text: str
    fs: float
    unit: str | None = None
    rpm: float | None = None
    machine: str


class FigureCreate(BaseModel):
    machine: str


class Reveal(BaseModel):
    investigation_id: str


class DraftAnswer(BaseModel):
    edits: list[dict] = []
    new_components: list[dict] = []
    kind: str | None = None


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


class RestockBody(BaseModel):
    machine: str
    part_id: str | None = None
    qty_add: int | None = None


class RepairKitBody(BaseModel):
    machine: str
    component_id: str
    auto_draft: bool = True


class HarnessResetBody(BaseModel):
    preset: str = "v2"


class HarnessDistillBody(BaseModel):
    predicted: str
    actual: str
    reasoning: str = ""
    technician_note: str = ""
    investigation_id: str | None = None


class DesignCopilotBody(BaseModel):
    machine: str
    prompt: str
    current_inputs: dict | None = None


def _ensure_rag() -> None:
    try:
        if rag.stats()["chunks"] == 0:
            rag.backfill_manual_sources()
            rag.index_all()
    except Exception:
        pass


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
    mode = body.mode if body.mode in ("v1", "v2") else "v2"
    jobs[job_id] = {"state": "running", "recording_id": body.recording_id,
                    "investigation_id": inv_id, "mode": mode}
    bg.add_task(_run_job, job_id, body.recording_id, body.question, inv_id,
                mode, body.machine)
    return {"job_id": job_id, "state": "running", "investigation_id": inv_id,
            "mode": mode}


def _run_job(job_id: str, recording_id: str, question: str, inv_id: str,
             mode: str = "v2", machine: str = "rig") -> None:
    try:
        trace = run(store, docs, refs, recording_id, question,
                    investigation_id=inv_id, mode=mode, machine=machine)
    except Exception as exc:  # noqa: BLE001 - boundary: never lose the job
        jobs[job_id] = {"state": "error", "error": f"{type(exc).__name__}"}
        return
    jobs[job_id] = {"state": trace["status"],
                    "investigation_id": trace["investigation_id"]}


@app.get("/api/traces")
def traces_list(limit: int = 25) -> dict:
    return {"traces": list_traces(limit=limit)}


@app.get("/api/traces/{investigation_id}")
def trace_get(investigation_id: str) -> dict:
    try:
        return load_trace(investigation_id)
    except FileNotFoundError:
        return {"error": f"unknown investigation {investigation_id}"}


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


@app.post("/api/figures")
def create_figure(body: FigureCreate) -> dict:
    """Start figure work: derive the spec, open a job for the author."""
    spec = figures.build_spec(body.machine)
    if spec is None:
        return {"error": f"unknown or unusable pack {body.machine}"}
    spec["status"] = "awaiting_author"
    figures.write_spec(body.machine, spec)
    job_id = f"fg_{len(figure_jobs) + 1:04d}"
    figure_jobs[job_id] = {"state": "awaiting_author",
                           "machine": body.machine, "gates": []}
    return {"job_id": job_id, "state": "awaiting_author",
            "machine": body.machine}


def _run_figure_job(job_id: str, machine: str) -> None:
    try:
        gates = figures.run_code_gates(machine)
    except Exception as exc:  # noqa: BLE001 - boundary: never lose the job
        figure_jobs[job_id] = {"state": "failed", "machine": machine,
                               "gates": [], "error": f"{type(exc).__name__}"}
        return
    if not all(g["pass"] for g in gates):
        spec = figures.load_spec(machine) or {}
        spec["status"] = "awaiting_author"
        figures.write_spec(machine, spec)
        figure_jobs[job_id] = {"state": "failed", "machine": machine,
                               "gates": gates}
        return
    spec = figures.load_spec(machine) or {}
    spec["status"] = "verified"
    figures.write_spec(machine, spec)
    figure_jobs[job_id] = {"state": "eval", "machine": machine, "gates": gates}
    try:
        key = model_api_key()
    except RuntimeError:
        ev = {"state": "failed", "attempts": 0,
              "verdict": {"publish": False, "score": 0,
                          "reasons": ["vision unavailable (no MODEL_API_KEY)"],
                          "missing": [], "artifacts": []}}
    else:
        try:
            ev = figures.run_eval_gate(
                machine, default_client_factory(key))
        except Exception as exc:  # noqa: BLE001 - boundary: fail closed
            ev = {"state": "failed", "attempts": 0,
                  "verdict": {"publish": False, "score": 0,
                              "reasons": [f"eval crashed: {type(exc).__name__}"],
                              "missing": [], "artifacts": []}}
    if ev["state"] == "eval_pass":
        spec["status"] = "eval_pass"
        figures.write_spec(machine, spec)
        figure_jobs[job_id] = {"state": "eval_pass", "machine": machine,
                               "gates": gates, "verdict": ev["verdict"],
                               "segment": ev.get("segment"),
                               "attempts": ev.get("attempts", 0)}
    else:
        spec["status"] = "awaiting_author"
        figures.write_spec(machine, spec)
        figure_jobs[job_id] = {"state": "failed", "machine": machine,
                               "gates": gates, "verdict": ev["verdict"],
                               "attempts": ev.get("attempts", 0)}


@app.post("/api/figures/{job_id}/submit")
def submit_figure(job_id: str, bg: BackgroundTasks) -> dict:
    job = figure_jobs.get(job_id)
    if job is None:
        return {"error": f"unknown figure job {job_id}"}
    if job["state"] not in ("awaiting_author", "failed"):
        return {"error": f"job {job_id} is {job['state']}"}
    job["state"] = "verifying"
    bg.add_task(_run_figure_job, job_id, job["machine"])
    return {"job_id": job_id, "state": "verifying"}


@app.get("/api/figures/{job_id}")
def figure_status(job_id: str) -> dict:
    job = figure_jobs.get(job_id)
    if job is None:
        return {"error": f"unknown figure job {job_id}"}
    return {"state": job["state"], "machine": job.get("machine"),
            "gates": job.get("gates", []),
            "verdict": job.get("verdict"),
            "segment": job.get("segment"),
            "attempts": job.get("attempts", 0)}


@app.post("/api/figures/{job_id}/approve")
def approve_figure(job_id: str) -> dict:
    """Human publish approval. Only offered on eval_pass; no override."""
    job = figure_jobs.get(job_id)
    if job is None:
        return {"error": f"unknown figure job {job_id}"}
    if job["state"] != "eval_pass":
        return {"error": f"job {job_id} is {job['state']}, not eval_pass"}
    spec = figures.load_spec(job["machine"]) or {}
    spec["status"] = "published"
    figures.write_spec(job["machine"], spec)
    job["state"] = "published"
    return {"job_id": job_id, "state": "published",
            "machine": job["machine"]}


@app.get("/api/figures")
def figures_index() -> dict:
    return {"figures": figures.list_figures(jobs=figure_jobs)}


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
            "source_kind": draft.get("source_kind", "pdf"),
            "has_image": bool(draft.get("image_b64")),
            "dimensions": draft.get("dimensions") or {},
            "candidates": draft["candidates"],
            "assessment": draft["assessment"], "review": draft["review"]}


_DRAFT_EXT_MEDIA = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


@app.post("/api/packs/draft")
async def draft_upload(machine: str = Form(...), title: str = Form(...),
                       file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if not data or len(data) == 0:
        return {"error": "empty file upload"}
    if len(data) > 30_000_000:
        return {"error": "file exceeds the 30 MB draft cap"}
    fn = (file.filename or "").lower()
    ext = os.path.splitext(fn)[1]
    media_type = _DRAFT_EXT_MEDIA.get(ext)
    if not media_type:
        return {"error": "upload a .pdf manual or 2D blueprint image (.png, .jpg, .webp)"}
    try:
        draft = new_draft(machine.strip().lower().replace(" ", "-"), title,
                          data, media_type=media_type)
    except Exception as e:
        return {"error": f"could not read blueprint/PDF: {e}"}
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
    review = reason_with_model(draft["text"], draft["candidates"],
                               default_client_factory(key),
                               image_b64=draft.get("image_b64"))
    draft["review"] = review
    if review.get("extracted_components") or review.get("dimensions"):
        draft = merge_vision_candidates(draft, review)
    save_draft(draft)
    auto = (draft["assessment"]["score"] >= 80
            and review.get("verdict") == "enough"
            and len(draft["candidates"]) >= 8)
    return {"review": review, "auto_finalize": auto, "draft": _draft_view(draft)}


@app.post("/api/packs/draft/{draft_id}/answer")
def draft_answer(draft_id: str, body: DraftAnswer) -> dict:
    draft = load_draft(draft_id)
    if draft is None:
        return {"error": f"unknown draft {draft_id}"}
    if draft["status"] == "finalized":
        return {"error": "draft already finalized"}
    if body.kind is not None:
        if body.kind not in VALID_KINDS:
            return {"error": f"unknown kind {body.kind}"}
        draft["review"] = {**(draft.get("review") or {}), "kind": body.kind}
    return _draft_view(apply_edits(draft, body.edits, body.new_components))


@app.post("/api/assist")
async def assist(session: str | None = Form(None),
                 machine: str = Form(...), message: str = Form(...),
                 fs: float = Form(0.0), rpm: float | None = Form(None),
                 photo: UploadFile | None = File(None),
                 signal_csv: UploadFile | None = File(None),
                 wav: UploadFile | None = File(None)) -> dict:
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
        if not data or len(data) == 0:
            return {"error": "empty wav upload"}
        if len(data) > 10_000_000:
            return {"error": "wav exceeds the 10 MB cap"}
        try:
            signal = parse_wav(data)
        except Exception as e:
            return {"error": f"could not read wav: {e}"}
    try:
        key = model_api_key()
    except RuntimeError as e:
        return {"error": str(e)}
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


@app.post("/api/vision/assembly-guide")
async def vision_assembly_guide(machine: str = Form("rig"),
                                photo: UploadFile = File(...)) -> dict:
    data = await photo.read()
    if not data:
        return {"error": "empty photo upload"}
    if len(data) > 8_000_000:
        return {"error": "photo exceeds the 8 MB cap"}
    _ensure_rag()
    cf = None
    try:
        cf = default_client_factory(model_api_key())
    except RuntimeError:
        cf = None
    try:
        return ground_assembly_guide(data, machine, cf)
    except Exception as e:
        return {"error": f"assembly grounding failed: {e}"}


@app.get("/api/rag/search")
def rag_search(machine: str, q: str, component_id: str | None = None,
               k: int = 6) -> dict:
    _ensure_rag()
    hits = rag.retrieve(machine, q, component_id=component_id,
                        k=min(max(k, 1), 20))
    return {"machine": machine, "query": q, "hits": hits, "stats": rag.stats()}


@app.post("/api/rag/reindex")
def rag_reindex() -> dict:
    backfilled = rag.backfill_manual_sources()
    indexed = rag.index_all()
    return {"backfilled": backfilled, "indexed": indexed, "stats": rag.stats()}


@app.get("/api/harness/{machine}")
def harness_get(machine: str) -> dict:
    return {"harness": harness.load_harness(machine),
            "experience": harness.list_experience(machine)}


@app.post("/api/harness/{machine}/reset")
def harness_reset(machine: str, body: HarnessResetBody) -> dict:
    return {"harness": harness.reset_harness(machine, body.preset),
            "experience": harness.list_experience(machine)}


@app.post("/api/harness/{machine}/distill")
def harness_distill(machine: str, body: HarnessDistillBody) -> dict:
    cf = None
    try:
        cf = default_client_factory(model_api_key())
    except RuntimeError:
        cf = None
    out = harness.distill_lesson(
        machine=machine,
        predicted=body.predicted,
        actual=body.actual,
        reasoning=body.reasoning,
        technician_note=body.technician_note,
        investigation_id=body.investigation_id,
        client_factory=cf,
    )
    return {
        "lesson": out["experience"],
        "harness": out["harness"],
        "experience": harness.list_experience(machine),
    }


@app.post("/api/inventory/restock")
def inv_restock(body: RestockBody) -> dict:
    with connect() as conn:
        return restock_machine(conn, body.machine, body.part_id, body.qty_add)


@app.post("/api/inventory/repair-kit")
def inv_repair_kit(body: RepairKitBody) -> dict:
    with connect() as conn:
        return recommend_repair_kit(conn, body.machine, body.component_id,
                                    body.auto_draft)


@app.get("/api/agents/catalog")
def agents_catalog(machine: str = "rig") -> dict:
    _ensure_rag()
    return orchestrator.agent_catalog(machine)


@app.post("/api/orchestrate/design")
def orchestrate_design(body: DesignCopilotBody) -> dict:
    cf = None
    try:
        cf = default_client_factory(model_api_key())
    except RuntimeError:
        cf = None
    return orchestrator.run_design_copilot(
        body.machine, body.prompt, body.current_inputs, cf
    )


@app.get("/api/demo-assets")
def demo_assets_list() -> dict:
    root = "data/demo_assets"
    items: list[dict] = []
    if os.path.isdir(root):
        for sub in sorted(os.listdir(root)):
            sub_p = os.path.join(root, sub)
            if os.path.isdir(sub_p):
                for fn in sorted(os.listdir(sub_p)):
                    if not fn.startswith("."):
                        items.append({
                            "category": sub,
                            "filename": fn,
                            "url": f"/demo-assets/{sub}/{fn}",
                        })
            elif not sub.startswith("."):
                items.append({
                    "category": "root",
                    "filename": sub,
                    "url": f"/demo-assets/{sub}",
                })
    return {"assets": items}


@app.get("/api/assist/{session_id}")
def assist_history(session_id: str) -> dict:
    sess = load_session(session_id)
    if sess is None:
        return {"error": f"unknown assist session {session_id}"}
    return {"session": sess["session"], "machine": sess["machine"],
            "turns": sess["turns"],
            "usage": sess.get("usage", {"input_tokens": 0,
                                       "output_tokens": 0}),
            "model_id": sess.get("model_id"),
            "prompt_version": sess.get("prompt_version")}


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


@app.post("/api/packs/{machine}/derive")
def pack_derive(machine: str) -> dict:
    loaded = load_pack(machine)
    if loaded is None:
        return {"error": f"unknown pack {machine}"}
    base = os.path.join("packs", machine)
    asm = derive_assembly(loaded["components"])
    scn = derive_scenarios(
        loaded["components"], loaded["meta"].get("kind", "generic"),
        loaded["meta"].get("name", machine))
    with open(os.path.join(base, "assembly.json"), "w") as f:
        json.dump(asm, f, indent=1)
    with open(os.path.join(base, "scenarios.json"), "w") as f:
        json.dump(scn, f, indent=1)
    return {"machine": machine, "steps": len(asm["order"]),
            "scenarios": len(scn)}


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


class TunnelUrlBody(BaseModel):
    url: str = ""


class SyncEventBody(BaseModel):
    type: str
    payload: dict = {}
    sender: str = "desktop"


@app.get("/api/mobile/info")
def mobile_info(request: Request, room: str = "PITCREW1") -> dict:
    host = request.headers.get("host")
    return mobile_sync.get_mobile_connection_info(room, request_host=host, default_port=PORT)


@app.get("/api/mobile/qr.svg")
def mobile_qr_svg(url: str) -> Response:
    if not url or len(url) > 270:
        return Response(content="Invalid or oversized QR URL", status_code=400)
    try:
        svg = mobile_sync.encode_qr_svg(url)
    except ValueError as e:
        return Response(content=str(e), status_code=400)
    return Response(content=svg, media_type="image/svg+xml")


@app.post("/api/mobile/tunnel/start")
def mobile_tunnel_start(local_port: int = PORT) -> dict:
    return mobile_sync.start_https_tunnel(local_port=local_port)


@app.post("/api/mobile/tunnel/stop")
def mobile_tunnel_stop() -> dict:
    return mobile_sync.stop_https_tunnel()


@app.post("/api/mobile/tunnel/url")
def mobile_tunnel_custom_url(body: TunnelUrlBody) -> dict:
    return mobile_sync.set_custom_tunnel_url(body.url)


@app.get("/api/sync/{room_id}")
def sync_poll(room_id: str, since: int = 0, peer_id: str | None = None,
              role: str = "desktop", device: str = "") -> dict:
    return mobile_sync.sync_hub.poll(
        room_id, since=since, peer_id=peer_id, role=role, device=device
    )


@app.post("/api/sync/{room_id}/event")
def sync_publish(room_id: str, body: SyncEventBody) -> dict:
    return mobile_sync.sync_hub.publish(
        room_id, body.type, body.payload, sender=body.sender
    )


@app.websocket("/ws/sync/{room_id}")
async def ws_sync(websocket: WebSocket, room_id: str, peer_id: str = "",
                  role: str = "desktop", device: str = "") -> None:
    await websocket.accept()
    pid = peer_id or f"{role}_{os.urandom(3).hex()}"
    peers = mobile_sync.sync_hub.touch_peer(room_id, pid, role=role, device=device)
    loop = asyncio.get_running_loop()
    queue = mobile_sync.sync_hub.subscribe(room_id, loop)
    try:
        await websocket.send_json({
            "type": "welcome",
            "room_id": room_id,
            "peer_id": pid,
            "peers": peers,
        })
        while True:
            recv_task = asyncio.create_task(websocket.receive_text())
            queue_task = asyncio.create_task(queue.get())
            done, pending = await asyncio.wait(
                {recv_task, queue_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for p in pending:
                p.cancel()
            if recv_task in done:
                raw = recv_task.result()
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                mtype = msg.get("type", "")
                if mtype == "ping":
                    cur_peers = mobile_sync.sync_hub.touch_peer(
                        room_id, pid, role=role, device=device
                    )
                    await websocket.send_json({"type": "pong", "peers": cur_peers})
                elif mtype:
                    mobile_sync.sync_hub.publish(
                        room_id, mtype, msg.get("payload") or {}, sender=pid
                    )
            if queue_task in done:
                evt = queue_task.result()
                await websocket.send_json(evt)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        mobile_sync.sync_hub.unsubscribe(room_id, loop, queue)


@app.post("/api/mobile/capture")
async def mobile_capture(
    room_id: str = Form("PITCREW1"),
    machine: str = Form("rig"),
    message: str = Form("Field inspection capture"),
    session: str | None = Form(None),
    rpm: float | None = Form(None),
    sender: str = Form("mobile"),
    photo: UploadFile | None = File(None),
    wav: UploadFile | None = File(None),
) -> dict:
    photo_bytes = None
    if photo is not None:
        photo_bytes = await photo.read()
        if not photo_bytes:
            return {"error": "empty photo upload"}
        if len(photo_bytes) > 8_000_000:
            return {"error": "photo exceeds the 8 MB cap"}
    signal = None
    if wav is not None:
        data = await wav.read()
        if not data:
            return {"error": "empty wav upload"}
        if len(data) > 10_000_000:
            return {"error": "wav exceeds the 10 MB cap"}
        try:
            signal = parse_wav(data)
        except Exception as e:
            return {"error": f"could not read wav: {e}"}

    _ensure_rag()
    cf = None
    try:
        cf = default_client_factory(model_api_key())
    except RuntimeError:
        cf = None

    return mobile_sync.process_mobile_capture(
        room_id=room_id,
        machine=machine,
        message=message,
        photo_bytes=photo_bytes,
        signal=signal,
        rpm=rpm,
        session=session,
        sender=sender,
        client_factory=cf,
    )


@app.post("/api/mobile/assembly-guide")
async def mobile_assembly_guide(
    room_id: str = Form("PITCREW1"),
    machine: str = Form("rig"),
    sender: str = Form("mobile"),
    photo: UploadFile = File(...),
) -> dict:
    data = await photo.read()
    if not data:
        return {"error": "empty photo upload"}
    if len(data) > 8_000_000:
        return {"error": "photo exceeds the 8 MB cap"}
    _ensure_rag()
    cf = None
    try:
        cf = default_client_factory(model_api_key())
    except RuntimeError:
        cf = None
    try:
        res = ground_assembly_guide(data, machine, cf)
    except Exception as e:
        return {"error": f"assembly grounding failed: {e}"}
    mobile_sync.sync_hub.publish(
        room_id,
        "assembly_grounded",
        {"machine": machine, "guide": res},
        sender=sender,
    )
    return res


os.makedirs("data/demo_assets", exist_ok=True)
app.mount("/demo-assets", StaticFiles(directory="data/demo_assets"),
          name="demo-assets")
if os.path.isdir("figures"):  # published + in-progress figure builds
    app.mount("/figures", StaticFiles(directory="figures", html=True),
              name="figures")
if os.path.isdir("frontend/dist"):  # demo mode: serve the built UI
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="ui")
