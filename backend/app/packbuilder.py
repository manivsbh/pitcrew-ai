"""Pack-builder agent flow: manual PDF -> candidate components -> user Q&A -> pack.

The agent reasons with the user about whether the manual is enough to build
a 3D model: heuristics extract candidates, one bounded model call reviews
them, the user confirms/edits, and finalize writes a validated pack that the
generic 3D builder renders on demand.
"""

from __future__ import annotations

import io
import json
import os
import re
import uuid

from pypdf import PdfReader

DRAFTS_DIR = "data/pack_drafts"

# "Coupling Halves (Pos. 10a)". Name = up to 5 capitalized words so a
# sentence start ("Slide parts on the Base (Pos. 90)") cannot swallow it.
_POS_RE = re.compile(
    r"((?:[A-Z][A-Za-z0-9/\-]*\s+){0,4}[A-Z][A-Za-z0-9/\-]*)"
    r"\s*\(?[Pp]os\.?\s+(\d+[a-z]*(?:/[a-z\d]+)?)\)?")
# Torque-table rows: " 7a Coupling Guard Screw ........ 2 Nm"
_TORQUE_RE = re.compile(
    r"^\s*(\d+[a-z]?)\s+([A-Z][A-Za-z0-9 /&\-]{3,44}?)\s+\.{2,}", re.MULTILINE)
_DIM_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:mm|cm|Nm|ft\.?-lbs?|in\.?|°)\b")
_VERB_LEAD = re.compile(
    r"^(remove|insert|install|check|place|loosen|tighten|slide|lift|rotate|"
    r"inspect|clean|apply|mount|fit|seat|press|pull|push|turn|hold|replace|"
    r"discard|thread|lubricate|torque|pry|tap|drive|verify|unclip|release|" 
    r"disconnect|unbolt|detach|separate)\b", re.IGNORECASE)
_MAX_TEXT = 200_000


def pdf_text(data: bytes) -> str:
    rdr = PdfReader(io.BytesIO(data))
    return chr(12).join((p.extract_text() or "") for p in rdr.pages)


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "part"


def extract_candidates(text: str) -> list[dict]:
    """Heuristic component candidates: [{id, name, pos, mentions}]."""
    found: dict[str, dict] = {}

    def add(name: str, pos: str | None) -> None:
        name = re.sub(r"\s+", " ", name).strip(" .,;:-")
        if _VERB_LEAD.match(name) and " " in name:
            # Procedural match ("Remove Sleeve O-ring (Pos. 37)"): the
            # verb is instruction, the rest is the part. Strip and keep.
            name = name.split(" ", 1)[1]
        if len(name) < 3:
            return
        key = pos or f"n:{name.lower()}"
        d = found.setdefault(key, {"name": name, "pos": pos, "mentions": 0})
        d["mentions"] += 1
        if len(name) > len(d["name"]):
            d["name"] = name

    for m in _TORQUE_RE.finditer(text):
        add(m.group(2), m.group(1))
    for m in _POS_RE.finditer(text):
        if re.search(r"[a-z]{4,}\s+[a-z]{3,}", m.group(1)):
            continue  # sentence fragment, not a part name
        add(m.group(1), m.group(2))
    cands = sorted(found.values(), key=lambda d: -d["mentions"])
    seen: set[str] = set()
    for d in cands:
        base = slug(d["name"])
        cid, i = base, 2
        while cid in seen:
            cid, i = f"{base}-{i}", i + 1
        seen.add(cid)
        d["id"] = cid
    return cands


def assess(candidates: list[dict], text: str) -> dict:
    """Rule-based 3D-readiness assessment + questions for the user."""
    n = len(candidates)
    with_pos = sum(1 for c in candidates if c["pos"])
    dims = len(_DIM_RE.findall(text))
    has_exploded = bool(re.search(r"exploded|sectional|assembly drawing|"
                                  r"parts list|spare parts", text,
                                  re.IGNORECASE))
    has_steps = bool(re.search(r"dismantl|reassembl|remov\w+ .*step|step \d+",
                               text, re.IGNORECASE))
    score = 0
    if n >= 8:
        score += 35
    elif n >= 3:
        score += 15
    if n and with_pos / n >= 0.5:
        score += 20
    if dims >= 10:
        score += 15
    if has_exploded:
        score += 15
    if has_steps:
        score += 15
    questions: list[str] = []
    if n < 3:
        questions.append(
            "I found almost no part names. Is this the right manual, or is "
            "the parts list in a separate document?")
    elif with_pos < n / 2:
        questions.append(
            f"Only {with_pos} of {n} parts have position numbers. Should I "
            "treat the unnamed ones as sub-parts of the numbered ones?")
    if not has_exploded:
        questions.append(
            "No exploded/parts-list section detected. Can you confirm the "
            "part list is complete, or point me at the missing pages?")
    if dims < 10:
        questions.append(
            "Almost no dimensions found, so the 3D model will be schematic "
            "(illustrative proportions, not to scale). Is that acceptable?")
    if not has_steps:
        questions.append(
            "No disassembly/assembly procedure detected. I will nest parts "
            "by name only — please correct parents in the list below.")
    questions.append(
        "Review the candidate list: drop wrong entries, fix names, and set "
        "each part's parent before finalizing.")
    return {"score": min(score, 100), "n_candidates": n,
            "with_pos": with_pos, "dimensions": dims,
            "has_exploded": has_exploded, "has_steps": has_steps,
            "questions": questions}


REVIEW_PROMPT = """You review a draft component list extracted from a machine manual.
The goal: decide whether the manual gives ENOUGH to build an illustrative
parametric 3D model (part names + rough assembly structure; exact dimensions
not required).

Manual text (truncated):
---
{text}
---

Candidate components (JSON):
{cands}

Reply with JSON only, exactly this shape:
{{"verdict": "enough" | "needs_info", "confidence": 0.0-1.0,
  "summary": "one or two sentences",
  "questions": ["at most 5 short questions for the user"],
  "drop": ["candidate ids that are clearly not parts"],
  "parents": {{"child-id": "parent-id or null"}},
  "roles": {{"candidate-id": "one-sentence role"}}}}
"""


REVIEW_PROMPT_VERSION = "review-v1"


def reason_with_model(text: str, candidates: list[dict],
                      client_factory) -> dict:
    """One bounded model call reviewing the draft. Never raises."""
    from .config import MODEL_ID
    fallback = {"verdict": "needs_info", "confidence": 0.0,
                "summary": "Model review unavailable; using rule-based "
                           "assessment only.",
                "questions": [], "drop": [], "parents": {}, "roles": {},
                "model_id": MODEL_ID,
                "prompt_version": REVIEW_PROMPT_VERSION,
                "usage": {"input_tokens": 0, "output_tokens": 0}}
    try:
        from .config import MODEL_ID, REASONING_EFFORT
        client = client_factory()
        slim = [{"id": c["id"], "name": c["name"], "pos": c["pos"]}
                for c in candidates[:80]]
        resp = client.responses.create(
            model=MODEL_ID, reasoning={"effort": REASONING_EFFORT},
            input=REVIEW_PROMPT.format(text=text[:12_000],
                                       cands=json.dumps(slim)))
        out = getattr(resp, "output_text", "") or ""
        m = re.search(r"\{.*\}", out, re.DOTALL)
        if not m:
            return fallback
        data = json.loads(m.group(0))
        if data.get("verdict") not in ("enough", "needs_info"):
            return fallback
        for key in ("questions", "drop"):
            data[key] = list(data.get(key) or [])[:5]
        for key in ("parents", "roles"):
            data[key] = dict(data.get(key) or {})
        data["confidence"] = float(data.get("confidence", 0.0) or 0.0)
        data["summary"] = str(data.get("summary", ""))[:500]
        u = getattr(resp, "usage", None)
        data["usage"] = {
            "input_tokens": getattr(u, "input_tokens", 0) or 0,
            "output_tokens": getattr(u, "output_tokens", 0) or 0}
        data["model_id"] = MODEL_ID
        data["prompt_version"] = REVIEW_PROMPT_VERSION
        return data
    except Exception:
        return fallback


def _path(draft_id: str) -> str | None:
    if "/" in draft_id or draft_id.startswith("."):
        return None
    return os.path.join(DRAFTS_DIR, f"{draft_id}.json")


def save_draft(draft: dict) -> None:
    os.makedirs(DRAFTS_DIR, exist_ok=True)
    path = _path(draft["id"])
    assert path is not None
    with open(path, "w") as f:
        json.dump(draft, f)


def load_draft(draft_id: str) -> dict | None:
    path = _path(draft_id)
    if path is None or not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def new_draft(machine: str, title: str, pdf_data: bytes) -> dict:
    text = pdf_text(pdf_data)[:_MAX_TEXT]
    candidates = extract_candidates(text)
    draft = {"id": uuid.uuid4().hex[:12], "machine": machine, "title": title,
             "status": "draft", "text": text, "candidates": candidates,
             "assessment": assess(candidates, text), "review": None,
             "edits": []}
    save_draft(draft)
    return draft


def apply_edits(draft: dict, edits: list[dict],
                new_components: list[dict]) -> dict:
    """User answers: rename/reparent/drop candidates, add new ones."""
    by_id = {c["id"]: c for c in draft["candidates"]}
    for e in edits:
        c = by_id.get(e.get("id", ""))
        if c is None:
            continue
        if e.get("drop"):
            by_id.pop(c["id"])
        else:
            if e.get("name"):
                c["name"] = str(e["name"])[:80]
            if "parent" in e:
                c["parent"] = e["parent"]
    for n in new_components:
        cid = slug(str(n.get("name", "")))
        if cid and cid not in by_id:
            by_id[cid] = {"id": cid, "name": str(n.get("name", ""))[:80],
                          "pos": n.get("pos"), "mentions": 0,
                          "parent": n.get("parent")}
    draft["candidates"] = list(by_id.values())
    draft["edits"] = edits
    if draft.get("review"):
        for cid, role in draft["review"].get("roles", {}).items():
            if cid in by_id:
                by_id[cid]["role"] = role
    save_draft(draft)
    return draft


KIND_KEYWORDS = {
    "engine": ["piston", "crank", "injector", "camshaft", "spark",
               "flywheel", "fuel rail", "connecting rod", "cylinder",
               "fuel", "exhaust", "timing", "turbo", "crankcase",
               "engine block", "head gasket", "piston ring"],
    "pump": ["impeller", "diffuser", "volute", "neck ring", "wear ring",
             "staybolt", "sleeve", "discharge flange", "pump", "seal",
             "chamber", "stage", "multistage", "grundfos", "discharge",
             "suction", "casing", "motor", "coupling", "flange",
             "gasket", "o-ring", "shaft"],
    "bearing-rig": ["6203", "raceway", "rolling element", "test rig",
                    "test bearing", "inner ring", "outer ring",
                    "paderborn", "load motor", "vibration",
                    "accelerometer", "rig"],
}

VALID_KINDS = {"engine", "pump", "bearing-rig", "generic"}


def derive_assembly(components: list[dict]) -> dict:
    """Assembly order from the confirmed parent tree: roots first, BFS.

    Captions are structural (level + part names/positions), never manual
    steps — the PDF parts list does not evidence an assembly sequence.
    """
    ids = {c["id"] for c in components}
    kids: dict[str, list[dict]] = {}
    roots: list[dict] = []
    for c in components:
        p = c.get("parent")
        if p and p in ids:
            kids.setdefault(p, []).append(c)
        else:
            roots.append(c)
    levels: dict[str, int] = {}
    queue = [(r, 0) for r in roots]
    while queue:
        c, lv = queue.pop(0)
        if c["id"] in levels:
            continue
        levels[c["id"]] = lv
        for k in kids.get(c["id"], []):
            queue.append((k, lv + 1))
    top = max(levels.values(), default=-1)
    for c in components:
        levels.setdefault(c["id"], top + 1)
    by_level: dict[int, list[dict]] = {}
    for c in components:
        by_level.setdefault(levels.get(c["id"], 0), []).append(c)
    order = []
    for lv in sorted(by_level):
        grp = sorted(by_level[lv],
                     key=lambda c: (c.get("pos") or "~", c["name"]))
        names = ", ".join(
            c["name"] + (f" (Pos. {c['pos']})" if c.get("pos") else "")
            for c in grp)
        order.append(
            {"caption": f"Install {names}.",
             "parts": [c["id"] for c in grp]})
    return {"order": order, "source": "derived"}


# kind -> (scenario id, label, name-pattern, slow, wobble, note)
_SCENARIO_TPL: dict[str, list[tuple]] = {
    "engine": [
        ("misfire", "Injector misfire", r"injector|spark|plug", 0.7, 0.6,
         "One cylinder stops contributing: uneven crank pulses."),
        ("fuel-starve", "Fuel starvation", r"fuel pump|fuel rail", 0.5, 0.3,
         "Weak fuel delivery: rail pressure sags, output drops."),
        ("crank-knock", "Crank knock", r"crank(?!case)|connecting rod",
         0.9, 1.0,
         "Excess crank/rod clearance: audible knock each revolution."),
    ],
    "pump": [
        ("seal-leak", "Shaft seal leak", r"seal", 1.0, 0.0,
         "Leakage at the shaft seal: motion unchanged, fluid lost."),
        ("worn-impeller", "Worn impeller", r"impeller|wear ring|neck ring",
         0.7, 0.5, "Worn impeller or ring clearances: head and flow fall."),
        ("clogged-passage", "Clogged passage", r"chamber|diffuser|stage",
         0.5, 0.3, "Clogged impeller or diffuser passage: flow starved."),
        ("coupling-misset", "Coupling misset", r"coupling", 0.9, 1.0,
         "Improper coupling setting: tight rotation and rub."),
    ],
    "bearing-rig": [
        ("inner-race", "Inner-ring damage", r"inner", 0.9, 1.0,
         "Inner-race defect: pulses at the inner-ring rate."),
        ("outer-race", "Outer-ring damage", r"outer", 0.9, 1.0,
         "Outer-race defect: pulses at the outer-ring rate."),
        ("rolling-wear", "Rolling-element wear", r"roll|ball|cage", 0.95,
         0.6, "Worn rolling elements: elevated broadband vibration."),
    ],
    "generic": [
        ("wear", "Component wear", r"bearing|seal|gasket|bushing", 0.8, 0.6,
         "Wear in the matched running parts: output sags."),
    ],
}


def derive_scenarios(components: list[dict], kind: str,
                     source: str) -> list[dict]:
    """Fault scenarios from kind templates matched against part names.

    All derived scenarios are illustrative: a parts list evidences which
    parts exist, not how each fault behaves.
    """
    out = [{"id": "healthy", "illustrative": True, "label": "Healthy",
            "note": "Baseline motion: running parts rotate together. "
                    "Illustrative simulation.",
            "parts": [], "slow": 1.0, "source": source, "wobble": 0.0}]
    tpl = _SCENARIO_TPL.get(kind, _SCENARIO_TPL["generic"])
    for sid, label, pat, slow, wobble, note in tpl:
        rx = re.compile(pat, re.IGNORECASE)
        parts = [c["id"] for c in components if rx.search(c["name"])]
        out.append({"id": sid, "illustrative": True, "label": label,
                    "note": note + " Illustrative.",
                    "parts": parts, "slow": slow, "source": source,
                    "wobble": wobble})
    return out


def classify_kind(components: list[dict]) -> str:
    """Best-effort machine kind from component names (review.kind wins)."""
    text = " ".join(c.get("name", "") for c in components).lower()
    scores = {k: sum(kw in text for kw in kws)
              for k, kws in KIND_KEYWORDS.items()}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] else "generic"


def finalize(draft: dict, packs_dir: str = "packs") -> dict:
    """Write a validated pack from user-confirmed candidates."""
    machine = draft["machine"]
    if "/" in machine or machine.startswith(".") or not machine:
        raise ValueError("bad machine id")
    review = draft.get("review") or {}
    parents = review.get("parents", {})
    roles = review.get("roles", {})
    dropped = [cid for cid in review.get("drop", [])
               if cid in {c["id"] for c in draft["candidates"]}]
    kept = [c for c in draft["candidates"] if c["id"] not in dropped]
    ids = {c["id"] for c in kept}
    components = []
    for c in kept:
        parent = c.get("parent", parents.get(c["id"]))
        if parent not in ids:
            parent = None
        role = c.get("role") or roles.get(c["id"]) or (
            f"{c['name']}: role not yet confirmed; see {draft['title']}.")
        components.append(
            {"id": c["id"], "name": c["name"], "pos": c.get("pos"),
             "parent": parent, "role": role,
             "role_source": "manual" if c["id"] in roles else "standard",
             "service_ref": draft["title"],
             "failure_modes": [], "failure_source": None})
    if len(components) < 3:
        raise ValueError("need at least 3 confirmed components")
    base = os.path.join(packs_dir, machine)
    os.makedirs(base, exist_ok=True)
    kind = review.get("kind") if review.get("kind") in VALID_KINDS else None
    kind = kind or classify_kind(components)
    with open(os.path.join(base, "pack.json"), "w") as f:
        json.dump({"machine": machine, "name": draft["title"],
                   "kind": kind, "created": "2026-10-27",
                   "notes": "Agent-drafted pack: user-confirmed from manual "
                            "via pack-builder Q&A.",
                   "sources": [{"title": draft["title"]}]}, f, indent=1)
    with open(os.path.join(base, "components.json"), "w") as f:
        json.dump(components, f, indent=1)
    with open(os.path.join(base, "assembly.json"), "w") as f:
        json.dump(derive_assembly(components), f, indent=1)
    with open(os.path.join(base, "scenarios.json"), "w") as f:
        json.dump(derive_scenarios(components, kind, draft["title"]), f,
                  indent=1)
    draft["status"] = "finalized"
    save_draft(draft)
    return {"machine": machine, "components": len(components),
            "kind": kind, "dropped_by_review": dropped}
