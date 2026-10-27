"""Guided verification checklists (P5). ask -> check -> branch over playbooks.

A guide walks one playbook: the current check asks the technician to verify
something; OK advances (following explicit "next:" refs, else sequential),
BAD shows the manual remedy and offers retry / skip / stop. The full path is
recorded for the summary.
"""

from __future__ import annotations

import os
import re
import uuid

from .assist import load_pack_files

GUIDES_DIR = "data/guide"
_NEXT_RE = re.compile(r"next:\s*([a-z0-9\-]+)", re.IGNORECASE)


def _path(guide_id: str) -> str | None:
    if "/" in guide_id or guide_id.startswith("."):
        return None
    return os.path.join(GUIDES_DIR, f"{guide_id}.json")


def _load(guide_id: str) -> dict | None:
    import json
    path = _path(guide_id)
    if path is None or not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def _save(guide: dict) -> None:
    import json
    os.makedirs(GUIDES_DIR, exist_ok=True)
    path = _path(guide["id"])
    assert path is not None
    with open(path, "w") as f:
        json.dump(guide, f)


def get_playbook(machine: str, playbook_id: str) -> dict | None:
    pack = load_pack_files(machine)
    if pack is None:
        return None
    for pb in pack["playbooks"]:
        if pb["id"] == playbook_id:
            return pb
    return None


def start(machine: str, playbook_id: str) -> dict:
    pb = get_playbook(machine, playbook_id)
    if pb is None:
        return {"error": f"unknown playbook {playbook_id} for {machine}"}
    guide = {"id": uuid.uuid4().hex[:12], "machine": machine,
             "playbook": playbook_id, "symptom": pb["symptom"],
             "source": pb.get("source", ""),
             "current": pb["checks"][0]["id"], "path": [], "done": False,
             "outcome": None}
    _save(guide)
    return state_view(guide, pb)


def _check(pb: dict, check_id: str) -> dict | None:
    for ch in pb["checks"]:
        if ch["id"] == check_id:
            return ch
    return None


def _next_after(pb: dict, check_id: str, result: str) -> str | None:
    ch = _check(pb, check_id)
    if ch is None:
        return None
    if result == "ok":
        m = _NEXT_RE.search(ch.get("if_ok", ""))
        if m and _check(pb, m.group(1)) is not None:
            return m.group(1)
        if "exhausted" in ch.get("if_ok", "").lower():
            return None
        ids = [c["id"] for c in pb["checks"]]
        i = ids.index(check_id)
        return ids[i + 1] if i + 1 < len(ids) else None
    return check_id  # bad: stay, remedy shown; technician decides next


def state_view(guide: dict, pb: dict) -> dict:
    ch = _check(pb, guide["current"]) if not guide["done"] else None
    return {"id": guide["id"], "machine": guide["machine"],
            "playbook": guide["playbook"], "symptom": guide["symptom"],
            "source": guide.get("source", ""), "done": guide["done"],
            "outcome": guide["outcome"], "path": guide["path"],
            "current": ch}


def answer(guide_id: str, result: str, note: str = "",
           action: str = "continue") -> dict:
    """Answer the current check. result: ok|bad. On bad, action selects
    retry (stay), skip (advance), or stop (end guide)."""
    guide = _load(guide_id)
    if guide is None:
        return {"error": f"unknown guide {guide_id}"}
    if guide["done"]:
        return {"error": "guide already finished"}
    if result not in ("ok", "bad"):
        return {"error": "result must be ok or bad"}
    pb = get_playbook(guide["machine"], guide["playbook"])
    if pb is None:
        return {"error": "playbook unavailable"}
    ch = _check(pb, guide["current"])
    if ch is None:
        return {"error": "current check unavailable"}
    guide["path"].append({"check": ch["id"], "ask": ch["ask"],
                          "result": result, "note": note[:300]})
    if result == "ok":
        nxt = _next_after(pb, ch["id"], "ok")
        if nxt is None:
            guide["done"] = True
            guide["outcome"] = ("All checks passed. " + ch.get("if_ok", ""))
            guide["current"] = ch["id"]
        else:
            guide["current"] = nxt
    else:
        if action == "stop":
            guide["done"] = True
            guide["outcome"] = ("Stopped at check '%s'. Remedy: %s"
                                % (ch["id"], ch.get("if_bad", "")))
        elif action == "skip":
            ids = [c["id"] for c in pb["checks"]]
            i = ids.index(ch["id"])
            if i + 1 < len(ids):
                guide["current"] = ids[i + 1]
            else:
                guide["done"] = True
                guide["outcome"] = ("Finished with unresolved check '%s'. "
                                    "Remedy: %s" % (ch["id"],
                                                   ch.get("if_bad", "")))
        # retry (default): stay on the same check; remedy shown in view
    _save(guide)
    view = state_view(guide, pb)
    if result == "bad" and not guide["done"] and action == "continue":
        view["remedy"] = ch.get("if_bad", "")
        view["severe"] = ch.get("severe", False)
    return view
