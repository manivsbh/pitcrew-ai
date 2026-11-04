"""Per-part placement in the drawing plane (layout v2).

Shared by pack building, render verification and render skills. Every part a
drawing locates gets its box in normalised drawing coordinates (x from the
left, y from the top), its own axis of symmetry as drawn, whether it is round
about that axis, a shape from a fixed vocabulary the 3D builder can draw, and
for small hardware the part it is fastened to.
"""

from __future__ import annotations

import re

SHAPES = (
    "bearing", "shell", "ring", "seal", "impeller", "shaft", "plate", "flange",
    "fastener", "nut", "washer", "spring", "pipe", "rod", "coupling", "motor",
    "rotor", "fan", "coil", "boxy", "piston", "crank", "small", "sphere", "gear",
)
AXES = ("horizontal", "vertical", "depth", "none")
MOUNTS = ("shaft_ring", "bolt_circle", "surface")
VIEWS = ("section", "elevation", "plan", "exploded", "schematic")
MIN_SIZE = 0.005


def unit(v, default: float | None = None) -> float | None:
    try:
        return round(min(1.0, max(0.0, float(v))), 4)
    except (TypeError, ValueError):
        return default


def clean_mount(m) -> dict | None:
    if not isinstance(m, dict) or m.get("on") in (None, ""):
        return None
    kind = m.get("as")
    return {"on": str(m["on"]), "as": kind} if kind in MOUNTS else None


def clean_entry(e: dict, source: str = "drawing") -> dict | None:
    """One layout entry from model output; legacy axial entries are converted."""
    if not isinstance(e, dict):
        return None
    if "cx" not in e and "x" in e:
        return from_legacy(e, source)
    cx, cy = unit(e.get("cx")), unit(e.get("cy"))
    if cx is None or cy is None:
        return None
    w = max(unit(e.get("w"), 0.03) or 0.03, MIN_SIZE)
    h = max(unit(e.get("h"), 0.03) or 0.03, MIN_SIZE)
    out = {"cx": cx, "cy": cy, "w": w, "h": h,
           "axis": e.get("axis") if e.get("axis") in AXES else "horizontal",
           "revolved": bool(e.get("revolved", True)),
           "source": source}
    if e.get("shape") in SHAPES:
        out["shape"] = e["shape"]
    mount = clean_mount(e.get("mount"))
    if mount:
        out["mount"] = mount
    return out


_BASE = re.compile(r"\bbase\b|pedestal(?! cap)|\bfoot\b|\bframe\b|\bskid\b", re.I)


def from_legacy(e: dict, source: str | None = None, name: str = "") -> dict | None:
    """Axial layout (x along the shaft, len, d) -> drawing-plane layout."""
    x = unit(e.get("x"))
    if x is None:
        return None
    axial = e.get("axial", True) is not False
    base = not axial and bool(_BASE.search(name))
    d = unit(e.get("d"))
    h = 0.03 if base else (round(d * 0.37, 4) if d else None)
    out = {"cx": x, "cy": 0.5 if axial else (0.72 if base else 0.28),
           "w": max(unit(e.get("len"), 0.0) or 0.03, MIN_SIZE),
           "h": max(h, MIN_SIZE) if h else 0.03,
           "axis": "horizontal", "revolved": axial,
           "source": source or e.get("source") or "drawing"}
    if e.get("anchor"):
        out["anchor"] = e["anchor"]
    return out


def clean_layout(raw) -> list[dict]:
    out = []
    for e in raw if isinstance(raw, list) else []:
        if not isinstance(e, dict) or e.get("pos") is None:
            continue
        entry = clean_entry(e)
        if entry:
            out.append({"pos": str(e["pos"]), **entry})
    return out[:150]


UPS = ("top", "right", "bottom", "left")


def clean_drawing(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    return {"view": raw.get("view") if raw.get("view") in VIEWS else "section",
            "main_axis": raw.get("main_axis") if raw.get("main_axis") in AXES
            else "horizontal",
            "up": raw.get("up") if raw.get("up") in UPS else "top"}


_SWAP_AXIS = {"horizontal": "vertical", "vertical": "horizontal", "depth": "depth", "none": "none"}


def upright(components: list[dict], drawing: dict) -> str | None:
    """Rotate layouts so the machine's real up points up (sheets are often sideways).

    Returns the rotation applied ("cw", "ccw", "180") or None; `drawing` is
    updated in place so main_axis matches the rotated layout.
    """
    up = drawing.get("up", "top")
    if up == "top":
        return None
    for c in components:
        lay = c.get("layout")
        if not isinstance(lay, dict) or "cx" not in lay:
            continue
        x, y, w, h = lay["cx"], lay["cy"], lay["w"], lay["h"]
        if up == "left":
            lay["cx"], lay["cy"], lay["w"], lay["h"] = round(1 - y, 4), x, h, w
        elif up == "right":
            lay["cx"], lay["cy"], lay["w"], lay["h"] = y, round(1 - x, 4), h, w
        else:
            lay["cx"], lay["cy"] = round(1 - x, 4), round(1 - y, 4)
        if up in ("left", "right"):
            lay["axis"] = _SWAP_AXIS.get(lay.get("axis", "horizontal"), "horizontal")
    rotation = {"left": "cw", "right": "ccw", "bottom": "180"}[up]
    if up in ("left", "right"):
        drawing["main_axis"] = _SWAP_AXIS.get(drawing.get("main_axis", "horizontal"), "horizontal")
    drawing["rotated"] = rotation
    drawing["up"] = "top"
    return rotation


def normalize_components(components: list[dict]) -> int:
    """Convert legacy axial layouts in place; returns how many changed."""
    n = 0
    for c in components:
        lay = c.get("layout")
        if isinstance(lay, dict) and "cx" not in lay and "x" in lay:
            new = from_legacy(lay, name=c.get("name", ""))
            if new:
                c["layout"] = new
                n += 1
    return n


_RING_PART = re.compile(r"\b(lock ?nut|nut|washer|lock ?washer|spacer|circlip|"
                        r"snap ring|collar|sleeve)\b", re.I)
_ON_SHAFT = re.compile(r"bearing|shaft|impeller|hub|rotor|spindle", re.I)
_BOLT_PART = re.compile(r"screw|bolt|stud", re.I)
_SURFACE_PART = re.compile(r"plug|nipple|\bcap\b|fitting|filler|vent|gauge|"
                           r"breather|grease|lubricator", re.I)


def infer_mount(name: str, anchor: dict) -> dict | None:
    """How small hardware sits on the part the text says it belongs to."""
    on = str(anchor.get("pos") or "")
    if not on:
        return None
    if _RING_PART.search(name) and _ON_SHAFT.search(anchor.get("name", "")):
        return {"on": on, "as": "shaft_ring"}
    if _BOLT_PART.search(name):
        return {"on": on, "as": "bolt_circle"}
    if _SURFACE_PART.search(name):
        return {"on": on, "as": "surface"}
    if _RING_PART.search(name):
        return {"on": on, "as": "bolt_circle"}
    return None
