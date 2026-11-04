"""Meta eyes: compare a captured 3D render with the source drawing and fix the layout.

Meta SAM 2.1 segments the drawing into numbered regions so muse-spark-1.3 can
cite which region confirms each part. muse-spark-1.3 then compares the drawing
with the render and returns per-part verdicts (keep / move / attach / hide), a
0-5 score, issues, and up to three render skills: declarative rules in a fixed
JSON format that the 3D builder applies to every machine. Patches and skills
are validated here before anything is written.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import time

from PIL import Image

from . import layout as L
from .packs import PACKS_DIR

SKILLS_PATH = "data/render_skills.json"
MAX_SKILLS = 50
MAX_ROUNDS = 2
VERIFY_PROMPT_VERSION = "render-verify-v3"
_IMAGE_TURN = {"cw": Image.Transpose.ROTATE_270,
               "ccw": Image.Transpose.ROTATE_90,
               "180": Image.Transpose.ROTATE_180}

VERIFY_SYSTEM = (
    "You are the Inspector on a machine-engineering crew. You compare a 2D "
    "engineering drawing with a 3D render that was built from it, part by part. "
    "Image 1 is the drawing with numbered segmentation regions (Meta SAM 2.1). "
    "Image 2 is the 3D render seen from the drawing's viewpoint. Layout "
    "coordinates are normalised to the upright drawing (x from the left, y from "
    "the top). Image 1 has already been rotated to that same upright view.\n"
    "Judge every part, but list ONLY parts you would move, attach, or hide. "
    "Omit parts that are already correct.\n"
    "- move: wrong place or size; give cx, cy, w, h (0..1) and, if needed, "
    "axis (horizontal|vertical|depth|none; depth = seen end-on), revolved and shape;\n"
    "- attach: small hardware that belongs on another part; give mount "
    "{\"on\": \"<callout>\", \"as\": \"shaft_ring|bolt_circle|surface\"};\n"
    "- hide: not visible in the drawing or does not make sense in the render.\n"
    "Only use these shapes: {shapes}. Only refer to callouts in the table. "
    "At most 12 parts.\n"
    "Also propose up to 3 render skills: general rules that would fix this kind "
    "of mistake on ANY machine, as {\"when\": {\"name_regex\": \"...\", "
    "\"near_shape\": \"<shape or null>\"}, \"then\": {\"shape\": \"...\"} or "
    "{\"mount_as\": \"...\"} or {\"hide\": true}, \"reason\": \"...\"}.\n"
    "Reply with one JSON object and nothing else, under 1500 tokens: "
    "{\"score\": 0-5, \"issues\": [\"short\"], \"parts\": [{\"pos\": \"76\", "
    "\"verdict\": \"move|attach|hide\"}], \"skills\": [...]}"
)


def _pack_dir(machine: str) -> str:
    if "/" in machine or "\\" in machine or machine.startswith(".") or not machine:
        raise ValueError("bad machine id")
    return os.path.join(PACKS_DIR, machine)


def _read(path: str, default):
    if not os.path.isfile(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _write(path: str, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)


def layout_table(components: list[dict]) -> list[dict]:
    rows = []
    for c in components:
        lay = c.get("layout") or {}
        rows.append({"pos": c.get("pos"), "name": c["name"],
                     **{k: lay.get(k) for k in ("cx", "cy", "w", "h", "axis",
                                                 "revolved", "shape", "mount", "source")}})
    return rows[:90]


def apply_patch(components: list[dict], parts: list, sam_ran: bool) -> list[dict]:
    """Apply validated verdicts in place; returns a change log."""
    by_pos = {str(c["pos"]): c for c in components if c.get("pos")}
    changes = []
    for p in parts if isinstance(parts, list) else []:
        if not isinstance(p, dict):
            continue
        c = by_pos.get(str(p.get("pos")))
        verdict = p.get("verdict")
        if c is None or verdict not in ("keep", "move", "attach", "hide"):
            continue
        lay = dict(c.get("layout") or {})
        region = p.get("region") if isinstance(p.get("region"), int) else None
        if verdict == "keep":
            if region is not None:
                lay["region"] = region
                c["layout"] = lay
            elif sam_ran and lay.get("source") == "assembly-order":
                c.pop("layout", None)
                c["hidden_reason"] = "vision: sequenced only, not found in drawing"
                changes.append({"pos": c["pos"], "verdict": "hide", "why": "unconfirmed"})
            continue
        if verdict == "hide":
            c.pop("layout", None)
            c["hidden_reason"] = "vision: not visible in drawing"
            changes.append({"pos": c["pos"], "verdict": "hide"})
            continue
        if verdict == "attach":
            mount = L.clean_mount(p.get("mount"))
            if not mount or mount["on"] not in by_pos or mount["on"] == str(c["pos"]):
                continue
            base = lay if "cx" in lay else (by_pos[mount["on"]].get("layout") or {})
            if "cx" not in base:
                continue
            new = L.clean_entry({**base, "mount": mount}, source="vision-verified")
            if new:
                c["layout"] = new
                changes.append({"pos": c["pos"], "verdict": "attach", "mount": mount})
            continue
        merged = {**lay, **{k: p[k] for k in ("cx", "cy", "w", "h", "axis", "revolved", "shape")
                            if k in p}}
        new = L.clean_entry(merged, source="vision-verified")
        if new:
            if region is not None:
                new["region"] = region
            c["layout"] = new
            changes.append({"pos": c["pos"], "verdict": "move"})
    return changes


def clean_skill(raw, response_id: str | None) -> dict | None:
    if not isinstance(raw, dict):
        return None
    when = raw.get("when") if isinstance(raw.get("when"), dict) else {}
    then = raw.get("then") if isinstance(raw.get("then"), dict) else {}
    pattern = str(when.get("name_regex") or "").strip()
    if not pattern or len(pattern) > 120:
        return None
    try:
        re.compile(pattern, re.I)
    except re.error:
        return None
    action: dict = {}
    if then.get("shape") in L.SHAPES:
        action = {"shape": then["shape"]}
    elif then.get("mount_as") in L.MOUNTS:
        action = {"mount_as": then["mount_as"]}
    elif then.get("hide") is True:
        action = {"hide": True}
    if not action:
        return None
    clean_when = {"name_regex": pattern}
    if when.get("near_shape") in L.SHAPES:
        clean_when["near_shape"] = when["near_shape"]
    key = json.dumps([clean_when, action], sort_keys=True)
    return {"id": "sk_" + hashlib.sha1(key.encode()).hexdigest()[:10],
            "when": clean_when, "then": action,
            "reason": str(raw.get("reason", ""))[:200],
            "source_response_id": response_id,
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "enabled": True}


def load_skills(path: str = SKILLS_PATH) -> list[dict]:
    return _read(path, {"skills": []}).get("skills", [])


def add_skills(raw_skills: list, response_id: str | None,
               path: str = SKILLS_PATH) -> list[dict]:
    skills = load_skills(path)
    known = {s["id"] for s in skills}
    added = []
    for raw in (raw_skills if isinstance(raw_skills, list) else []):
        if len(added) >= 3:
            break
        s = clean_skill(raw, response_id)
        if s and s["id"] not in known:
            skills.append(s)
            known.add(s["id"])
            added.append(s)
    if added:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        _write(path, {"skills": skills[-MAX_SKILLS:]})
    return added


def toggle_skill(skill_id: str, enabled: bool, path: str = SKILLS_PATH) -> dict | None:
    skills = load_skills(path)
    for s in skills:
        if s["id"] == skill_id:
            s["enabled"] = bool(enabled)
            _write(path, {"skills": skills})
            return s
    return None


def upright_image(data: bytes, rotation: str | None) -> bytes:
    """Rotate a drawing so it matches layout coordinates after upright()."""
    turn = _IMAGE_TURN.get(rotation or "")
    if turn is None:
        return data
    im = Image.open(io.BytesIO(data)).convert("RGB")
    out = io.BytesIO()
    im.transpose(turn).save(out, format="JPEG", quality=85)
    return out.getvalue()


def parse_reply(text: str) -> dict | None:
    """The model's JSON object, including one cut off at the end."""
    from .packbuilder import _first_json_object

    data = _first_json_object(text or "")
    if isinstance(data, dict) and "score" in data:
        return data
    start = (text or "").find("{")
    if start < 0:
        return None
    chunk = text[start:]
    last = len(chunk)
    for _ in range(12):
        cut = chunk.rfind("}", 0, last)
        if cut < 0:
            return None
        frag = chunk[:cut + 1]
        opens: list[str] = []
        in_str = esc = False
        for ch in frag:
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch in "{[":
                opens.append("}" if ch == "{" else "]")
            elif ch in "}]" and opens:
                opens.pop()
        if in_str or not opens:
            last = cut
            continue
        try:
            obj = json.loads(frag + "".join(reversed(opens)))
        except json.JSONDecodeError:
            last = cut
            continue
        if isinstance(obj, dict) and "score" in obj:
            return obj
        last = cut
    return None


def _decode_image(data: str | bytes) -> bytes:
    if isinstance(data, bytes):
        return data
    if data.startswith("data:"):
        data = data.split(",", 1)[1]
    return base64.b64decode(data)


def verify(machine: str, render_png: str | bytes, client_factory, round_no: int = 1,
           seg_fn=None, skills_path: str = SKILLS_PATH) -> dict:
    """One verification round: SAM regions + muse-spark comparison + validated patch."""
    from . import meta_calls
    from .config import MODEL_ID, REASONING_EFFORT

    if round_no > MAX_ROUNDS:
        return {"error": f"at most {MAX_ROUNDS} verification rounds"}
    base = _pack_dir(machine)
    meta = _read(os.path.join(base, "pack.json"), None)
    components = _read(os.path.join(base, "components.json"), None)
    if meta is None or components is None:
        return {"error": f"unknown machine pack {machine}"}
    render = _decode_image(render_png)
    drawing_path = os.path.join(base, (meta.get("drawing") or {}).get("image") or "drawing.jpg")
    content: list[dict] = []
    regions: list[dict] = []
    sam_ran = False
    if os.path.isfile(drawing_path):
        with open(drawing_path, "rb") as f:
            drawing_bytes = upright_image(f.read(), (meta.get("drawing") or {}).get("rotated"))
        overlay_b64 = base64.b64encode(drawing_bytes).decode()
        try:
            from .segment import segment_photo
            seg = (seg_fn or segment_photo)(drawing_bytes)
            regions = [{"id": r["id"], "bbox": r["bbox"]} for r in seg.get("regions", [])]
            overlay_b64 = seg.get("overlay_b64") or overlay_b64
            sam_ran = bool(regions)
        except Exception:
            pass
        content.append({"type": "input_image", "image_url": f"data:image/png;base64,{overlay_b64}"})
    content.append({"type": "input_image",
                    "image_url": "data:image/png;base64," + base64.b64encode(render).decode()})
    drawing = meta.get("drawing") or {}
    prompt = (f"Machine: {meta.get('name')} (kind {meta.get('kind')}). "
              f"Drawing view: {drawing.get('view', 'unknown')}; rotated to upright: "
              f"{drawing.get('rotated', 'no')}.\n"
              f"SAM regions in image 1: {json.dumps(regions)[:3000]}\n"
              f"Layout table: {json.dumps(layout_table(components))}")
    content.insert(0, {"type": "input_text", "text": prompt})
    instructions = VERIFY_SYSTEM.replace("{shapes}", ", ".join(L.SHAPES))

    def ask():
        with meta_calls.role("render-verifier"):
            return client_factory().responses.create(
                model=MODEL_ID, instructions=instructions,
                input=[{"role": "user", "content": content}],
                reasoning={"effort": REASONING_EFFORT})

    resp = ask()
    data = parse_reply(getattr(resp, "output_text", "") or "")
    if data is None:
        content[0]["text"] += ("\nYour previous reply was not valid JSON. "
                               "Return one compact JSON object, at most 12 parts.")
        resp = ask()
        data = parse_reply(getattr(resp, "output_text", "") or "") or {}
    try:
        score = max(0, min(5, int(data.get("score", 0))))
    except (TypeError, ValueError):
        score = 0
    ver_path = os.path.join(base, "verification.json")
    log = _read(ver_path, {"rounds": []})
    prev = log["rounds"][-1] if round_no > 1 and log["rounds"] else None
    backup = os.path.join(base, "components.before-verify.json")
    reverted = prev is not None and score < prev.get("score", 0) and os.path.isfile(backup)
    if reverted:
        # the last round's fixes lowered the score: put its layout back
        _write(os.path.join(base, "components.json"), _read(backup, components))
        changes = []
    else:
        _write(backup, components)
        changes = apply_patch(components, data.get("parts"), sam_ran)
        if changes:
            _write(os.path.join(base, "components.json"), components)
    response_id = getattr(resp, "id", None)
    added = add_skills(data.get("skills"), response_id, skills_path)
    record = {"round": round_no, "score": score, "reverted": reverted,
              "issues": [str(i)[:240] for i in (data.get("issues") or [])][:8],
              "changes": changes, "skills_added": [s["id"] for s in added],
              "sam_regions": len(regions), "response_id": response_id,
              "prompt_version": VERIFY_PROMPT_VERSION,
              "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    log["rounds"].append(record)
    _write(ver_path, log)
    return {**record, "skills": added,
            "again": score < 4 and bool(changes) and round_no < MAX_ROUNDS}
