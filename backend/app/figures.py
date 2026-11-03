"""Figure pipeline: pack -> figure spec with dimension inventory.

Committed figures live in figures/<machine>/. The spec is the contract the
figure author (agent) builds from and the eval gate checks against: every
number in it carries the excerpt ref it came from.

Spec status lifecycle (job API transitions it):
spec -> awaiting_author -> verifying -> verified|awaiting_author
(verified -> eval -> eval_pass|failed -> published; see the eval gate).

Code gates prove the build only. Publish readiness (segment + vision +
human approval) is a separate gate that runs after `verified`.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import time

import numpy as np
from PIL import Image

from .assist import one_shot, parse_json_blob
from .packs import load_pack
from .segment import segment_photo

FIGURES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "figures")
PACKS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "packs")
SKILL_DIR = os.path.join(os.path.dirname(__file__), "..", "..",
                         ".claude", "skills", "anatomy")

TIMEOUTS = {"build": 120, "lines": 240, "capture": 240}

# Calibrated 2026-10-29 on evals/figures-golden (see evals/figures-publish.md):
# rig ink 0.099/0.106, blank 0.000; rig largest 0.00/0.02, blank 1.00,
# blob 0.73.
INK_MIN = 0.02
LARGEST_MAX = 0.50
VERDICT_SCORE_MIN = 4
VERDICT_ATTEMPTS = 3

_DIM_RE = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*(mm|cm|Nm|bar|MPa|kPa|kW|rpm|Hz|°|in\.?|ft\.?-lbs?)\b")
_WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
             "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
             "eleven": 11, "twelve": 12}
_COUNT_NOUNS = ("balls?", "vanes?", "stages?", "elements?", "impellers?",
                "bolts?", "screws?", "nuts?", "washers?", "parts?", "rings?",
                "springs?", "pistons?", "rollers?")
_COUNT_RE = re.compile(
    r"\b(\d+|" + "|".join(_WORD_NUM) + r")\s+(?:[A-Za-z]+\s+)?("
    + "|".join(_COUNT_NOUNS) + r")\b",
    re.IGNORECASE)

AUTHOR_FIELDS = ("concept", "readout", "honesty", "status")


def _number(raw: str):
    v = float(raw)
    return int(v) if v.is_integer() else v


def _context(text: str, start: int, end: int, span: int = 60) -> str:
    return re.sub(r"\s+", " ",
                  text[max(0, start - span):end + span]).strip()


def extract_dimensions(excerpts: list[dict]) -> list[dict]:
    """Unit-bearing numbers + part counts with excerpt refs.

    excerpts: [{file, text}]. Returns one list; each entry is
    {kind, value, unit, context, ref} with kind dimension|count.
    Pure; no I/O.
    """
    dimensions: list[dict] = []
    counts: list[dict] = []
    for ex in excerpts:
        text = ex["text"]
        ref = ex["file"]
        for m in _DIM_RE.finditer(text):
            dimensions.append(
                {"kind": "dimension", "value": _number(m.group(1)),
                 "unit": m.group(2).rstrip("."),
                 "context": _context(text, m.start(), m.end()),
                 "ref": ref})
        for m in _COUNT_RE.finditer(text):
            raw = m.group(1).lower()
            value = _WORD_NUM.get(raw, int(raw) if raw.isdigit() else None)
            if value is None:
                continue
            noun = m.group(2).lower()
            noun = noun if noun.endswith("s") else noun + "s"
            counts.append(
                {"kind": "count", "value": value, "unit": noun,
                 "context": _context(text, m.start(), m.end()),
                 "ref": ref})
    return dimensions + counts


def _excerpt_entry(ref: str, path: str) -> dict | None:
    try:
        with open(path) as f:
            text = f.read()
    except OSError:
        return None
    title = ""
    for line in text.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
            break
    return {"file": ref, "title": title, "text": text}


def read_excerpts(machine: str, packs_dir: str | None = None) -> list[dict]:
    """Committed excerpt markdown for a pack (never local PDFs).

    Reads packs/<machine>/excerpts/*.md plus any pack.json source `file`
    that resolves to committed markdown inside the repo (e.g. docs-pack).
    """
    root = packs_dir or PACKS_DIR
    repo = os.path.dirname(root)
    out: list[dict] = []
    seen: set[str] = set()
    base = os.path.join(root, machine, "excerpts")
    if os.path.isdir(base):
        for name in sorted(os.listdir(base)):
            if not name.endswith(".md"):
                continue
            entry = _excerpt_entry(
                f"excerpts/{name}", os.path.join(base, name))
            if entry:
                out.append(entry)
                seen.add(entry["file"])
    meta_path = os.path.join(root, machine, "pack.json")
    if os.path.isfile(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)
        for src in meta.get("sources", []):
            ref = str(src.get("file", ""))
            if not ref.endswith(".md") or ref in seen:
                continue
            full = os.path.realpath(os.path.join(repo, ref))
            if not full.startswith(os.path.realpath(repo) + os.sep):
                continue
            entry = _excerpt_entry(ref, full)
            if entry:
                out.append(entry)
                seen.add(ref)
    return out


def _valid_machine(machine: str) -> bool:
    return bool(machine) and "/" not in machine and not machine.startswith(".")


def build_spec(machine: str, packs_dir: str | None = None) -> dict | None:
    """Spec derivation from a committed pack. None when unusable."""
    if not _valid_machine(machine):
        return None
    root = packs_dir or PACKS_DIR
    meta_path = os.path.join(root, machine, "pack.json")
    comp_path = os.path.join(root, machine, "components.json")
    if not os.path.isfile(meta_path) or not os.path.isfile(comp_path):
        return None
    with open(meta_path) as f:
        meta = json.load(f)
    with open(comp_path) as f:
        components = json.load(f)
    if len(components) < 3:
        return None
    excerpts = read_excerpts(machine, packs_dir)
    found = extract_dimensions(excerpts)
    dimensions = [d for d in found if d["kind"] == "dimension"]
    counts = [d for d in found if d["kind"] == "count"]
    return {
        "machine": meta["machine"],
        "pack": {"name": meta.get("name"), "kind": meta.get("kind"),
                 "components": len(components),
                 "excerpts": len(excerpts)},
        "concept": "",
        "dimensions": dimensions,
        "counts": counts,
        "parts": [{"id": c["id"], "name": c["name"],
                   "parent": c.get("parent"), "role": c.get("role"),
                   "service_ref": c.get("service_ref")}
                  for c in components],
        "readout": "",
        "honesty": [],
        "status": "spec",
    }


def figure_dir(machine: str, figures_dir: str | None = None) -> str:
    if not _valid_machine(machine):
        raise ValueError("bad machine id")
    return os.path.join(figures_dir or FIGURES_DIR, machine)


def write_spec(machine: str, spec: dict,
               figures_dir: str | None = None) -> str:
    """Write spec.json, preserving author fields across regenerations."""
    path = os.path.join(figure_dir(machine, figures_dir), "spec.json")
    if os.path.isfile(path):
        with open(path) as f:
            prev = json.load(f)
        for field in AUTHOR_FIELDS:
            incoming = spec.get(field)
            if field in prev and (incoming in ("", [], None) or (
                    field == "status" and incoming == "spec")):
                spec[field] = prev[field]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(spec, f, indent=2)
    return path


def load_spec(machine: str, figures_dir: str | None = None) -> dict | None:
    if not _valid_machine(machine):
        return None
    path = os.path.join(figures_dir or FIGURES_DIR, machine, "spec.json")
    if not os.path.isfile(path):
        return None
    with open(path) as f:
        return json.load(f)


def list_figures(figures_dir: str | None = None,
                 jobs: dict | None = None) -> list[dict]:
    """Registered figure dirs, deterministic order. Never raises.

    When the live job dict is given, each entry also carries the latest
    live job for that machine (job_id + job_state), so a fresh UI can
    resume it instead of stranding eval_pass behind a lost job id.
    """
    root = figures_dir or FIGURES_DIR
    out = []
    if not os.path.isdir(root):
        return out
    for machine in sorted(os.listdir(root)):
        spec = load_spec(machine, root)
        if spec is None:
            continue
        dark, light = _find_pages(os.path.join(root, machine))
        entry = {"machine": machine, "status": spec.get("status", "spec"),
                 "pages": [p for p in (dark, light) if p]}
        if jobs:
            live = [jid for jid, job in jobs.items()
                    if isinstance(job, dict)
                    and job.get("machine") == machine]
            if live:
                entry["job_id"] = live[-1]
                entry["job_state"] = jobs[live[-1]].get("state")
        out.append(entry)
    return out


def _run_cmd(argv: list[str], cwd: str, timeout: int) -> dict:
    """One subprocess. Separated for tests (monkeypatch point)."""
    t0 = time.time()
    try:
        proc = subprocess.run(argv, cwd=cwd, capture_output=True, text=True,
                              timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"ok": False, "out": f"timeout after {timeout}s",
                "ms": int((time.time() - t0) * 1000)}
    except OSError as e:
        return {"ok": False, "out": f"spawn failed: {e}",
                "ms": int((time.time() - t0) * 1000)}
    return {"ok": proc.returncode == 0,
            "out": (proc.stdout + proc.stderr)[-2000:],
            "ms": int((time.time() - t0) * 1000)}


def parse_lines_output(text: str) -> tuple[bool, str]:
    """Parse `lines.mjs` summary. Pure."""
    m = re.search(r"line ends: (\d+) of (\d+) ends on (\d+) lines float", text)
    if not m:
        return False, "no lines summary in output"
    floating = int(m.group(1))
    if floating:
        return False, f"{floating} floating line ends"
    return True, f"0 of {m.group(2)} ends float"


def parse_capture_output(text: str) -> tuple[bool, str]:
    """Parse `capture.mjs` footer. Pure."""
    if "console: clean" not in text:
        return False, "console not clean"
    if "scrolls sideways: no" not in text:
        return False, "page scrolls sideways"
    return True, "console clean, no sideways scroll"


def _find_pages(figdir: str) -> tuple[str | None, str | None]:
    """Primary + light built pages. (stem.html, stem-light.html)."""
    if not os.path.isdir(figdir):
        return None, None
    names = sorted(f for f in os.listdir(figdir) if f.endswith(".html"))
    for name in names:
        if name.endswith("-light.html"):
            continue
        light = name[:-5] + "-light.html"
        if light in names:
            return name, light
    return None, None


def _sha(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def run_code_gates(machine: str, figures_dir: str | None = None,
                   skill_dir: str | None = None) -> list[dict]:
    """Build + determinism + lines + captures + traceability gates.

    Returns [{gate, pass, detail, ms}]. Fail-closed: any missing tool,
    page, or unparsable output fails its gate; later gates record skips.
    """
    root = figures_dir or FIGURES_DIR
    skill = skill_dir or SKILL_DIR
    figdir = os.path.join(root, machine)
    gates: list[dict] = []

    def record(name: str, passed: bool, detail: str, ms: int = 0):
        gates.append({"gate": name, "pass": passed,
                      "detail": detail[:300], "ms": ms})

    def skipped(names: list[str], why: str):
        for name in names:
            record(name, False, f"skipped: {why}")

    node = shutil.which("node")
    scripts = [os.path.join(skill, "scripts", s)
               for s in ("lines.mjs", "capture.mjs")]
    if not node or not all(os.path.isfile(s) for s in scripts):
        record("toolchain", False,
               f"node={node}, skill scripts present="
               f"{[os.path.isfile(s) for s in scripts]}")
        skipped(["build", "determinism", "lines-dark", "lines-light",
                 "capture-dark", "capture-light", "capture-phone",
                 "traceability"], "toolchain unavailable")
        return gates
    record("toolchain", True, f"node {node}")

    rest = ["determinism", "lines-dark", "lines-light", "capture-dark",
            "capture-light", "capture-phone", "traceability"]
    if not os.path.isfile(os.path.join(figdir, "build.mjs")):
        record("build", False, "no build.mjs (awaiting author)")
        skipped(rest, "no build")
        return gates

    shots = os.path.join(figdir, "shots")
    os.makedirs(shots, exist_ok=True)

    def build_all() -> dict:
        out1 = _run_cmd(["node", "build.mjs"], cwd=figdir,
                        timeout=TIMEOUTS["build"])
        out2 = _run_cmd(["node", "build.mjs", "--light"], cwd=figdir,
                        timeout=TIMEOUTS["build"])
        return {"ok": out1["ok"] and out2["ok"],
                "out": out1["out"] + out2["out"],
                "ms": out1["ms"] + out2["ms"]}

    built = build_all()
    dark, light = _find_pages(figdir)
    if not built["ok"] or not dark:
        record("build", False, (built["out"] or "no built pages")[-300:])
        skipped(rest, "build failed")
        return gates
    record("build", True, f"{dark} + {light}", built["ms"])

    before = {dark: _sha(os.path.join(figdir, dark)),
              light: _sha(os.path.join(figdir, light))}
    rebuilt = build_all()
    after = {p: _sha(os.path.join(figdir, p)) for p in (dark, light)}
    if not rebuilt["ok"]:
        record("determinism", False, "rebuild failed")
    elif before != after:
        record("determinism", False, "rebuild bytes differ")
    else:
        record("determinism", True, f"sha {before[dark][:12]}…", rebuilt["ms"])

    lines = os.path.join(skill, "scripts", "lines.mjs")
    for name, page, theme in (("lines-dark", dark, "dark"),
                              ("lines-light", light, "light")):
        # Two tour positions: moving marks can float at one angle and
        # pass at another (proven by the rig pilot's shaft witness).
        results = []
        for wait in (1500, 8000):
            out = _run_cmd(["node", lines, page, "--out",
                            os.path.join("shots", f"gate-lines-{theme}.png"),
                            "--wait", str(wait)],
                           cwd=figdir, timeout=TIMEOUTS["lines"])
            ok, detail = parse_lines_output(out["out"]) if out["ok"] else (False, out["out"] or "lines run failed")
            results.append((ok and out["ok"], detail, out["ms"]))
        passed = all(r[0] for r in results)
        record(name, passed, " | ".join(r[1] for r in results),
               sum(r[2] for r in results))

    capture = os.path.join(skill, "scripts", "capture.mjs")
    shotspec = [("capture-dark", [dark, "--out", "shots/gate-desktop-dark.png"]),
                ("capture-light", [light, "--out", "shots/gate-desktop-light.png"]),
                ("capture-phone", [dark, "--out", "shots/gate-phone.png",
                                   "--width", "390", "--height", "800"])]
    for name, args in shotspec:
        out = _run_cmd(["node", capture, *args], cwd=figdir,
                       timeout=TIMEOUTS["capture"])
        ok, detail = parse_capture_output(out["out"]) if out["ok"] else (False, out["out"] or "capture run failed")
        record(name, ok and out["ok"], detail, out["ms"])

    spec = load_spec(machine, root)
    if spec is None or not spec.get("parts"):
        record("traceability", False, "no usable spec")
    else:
        def sourced(ref: str) -> bool:
            return ref.startswith("excerpts/") or ref.startswith("docs-pack/")
        unsourced = [d for d in spec.get("dimensions", []) + spec.get("counts", [])
                     if not sourced(str(d.get("ref", "")))]
        if unsourced:
            record("traceability", False,
                   f"{len(unsourced)} unsourced numbers")
        else:
            n = len(spec["dimensions"]) + len(spec["counts"])
            record("traceability", True, f"{n} numbers sourced")
    return gates


def ink_coverage(png: bytes) -> float:
    """Non-background pixel fraction. Corner pixel = background. Pure."""
    img = np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(float)
    dist = np.abs(img - img[5, 5]).sum(axis=2)
    return float((dist > 30).mean())


def check_segment_rules(regions: list[dict], image_size: list[int],
                        ink: float) -> tuple[bool, list[str]]:
    """Catastrophic-render rules over SAM regions + ink. Pure."""
    reasons = []
    frame = max(1, image_size[0] * image_size[1])
    largest = max([r["area"] for r in regions] + [0]) / frame
    if ink < INK_MIN:
        reasons.append(f"ink {ink:.3f} < {INK_MIN} (nothing rendered)")
    if largest > LARGEST_MAX:
        reasons.append(f"largest region {largest:.2f} of frame "
                       f"(undifferentiated fill)")
    return not reasons, reasons


VISION_SYSTEM = (
    "You judge whether an isometric engineering figure is good enough to "
    "publish in a technician workspace. Reply with JSON only: "
    '{"publish": true|false, "score": 1-5, '
    '"reasons": ["<=3 short strings"], "missing": [], "artifacts": []}. '
    "Publish only a recognizable machine matching the concept, with its "
    "subject parts visible (not floating, blobbed, or unfinished) and its "
    "readout present. Score 4+ means publishable with at most trivial "
    "nits; 3 or below, or any doubt, means publish false.")


def vision_verdict(pack: dict, spec: dict, capture_png: bytes,
                   seg_summary: dict, client_factory,
                   usage: dict | None = None) -> tuple[bool, dict]:
    """One bounded vision call. Fail-closed on any error. No retries here."""
    reg = [{"id": c["id"], "name": c["name"]} for c in pack["components"]]
    prompt = ("Figure concept: " + str(spec.get("concept", "")) +
              "\nReadout: " + str(spec.get("readout", "")) +
              "\nKnown illustrative parts: " +
              json.dumps(spec.get("honesty", [])) +
              "\nRegistry:\n" + json.dumps(reg) +
              "\nSegment summary:\n" + json.dumps(seg_summary) +
              "\n\nJudge the attached figure capture for publishing.")
    try:
        data = parse_json_blob(one_shot(client_factory, VISION_SYSTEM,
                                        prompt, capture_png, usage))
    except Exception:
        data = None
    verdict = {"publish": False, "score": 0, "reasons": [], "missing": [],
               "artifacts": []}
    if not data:
        verdict["reasons"] = ["verdict parse failed"]
        return False, verdict
    try:
        verdict["publish"] = bool(data.get("publish", False))
        verdict["score"] = int(data.get("score", 0))
        verdict["reasons"] = [str(r)[:200] for r in data.get("reasons", [])][:3]
        verdict["missing"] = [str(m)[:100] for m in data.get("missing", [])]
        verdict["artifacts"] = [str(a)[:100] for a in data.get("artifacts", [])]
    except (TypeError, ValueError):
        verdict["reasons"] = ["verdict shape invalid"]
        return False, verdict
    ok = verdict["publish"] and verdict["score"] >= VERDICT_SCORE_MIN
    return ok, verdict


def run_eval_gate(machine: str, client_factory,
                  figures_dir: str | None = None,
                  usage: dict | None = None) -> dict:
    """Segment rules then vision verdict (3 attempts, pass@1). Fail-closed.

    Returns {state: eval_pass|failed, verdict, segment, overlay?, attempts}.
    Expects the code gates' desktop-dark capture to exist.
    """
    root = figures_dir or FIGURES_DIR
    figdir = os.path.join(root, machine)
    out: dict = {"state": "failed", "attempts": 0,
                 "verdict": {"publish": False, "score": 0, "reasons": [],
                             "missing": [], "artifacts": []}}
    cap_path = os.path.join(figdir, "shots", "gate-desktop-dark.png")
    if not os.path.isfile(cap_path):
        out["verdict"]["reasons"] = ["no code-gate capture (run code gates)"]
        return out
    with open(cap_path, "rb") as f:
        capture = f.read()
    try:
        seg = segment_photo(capture)
    except Exception as e:
        out["verdict"]["reasons"] = [f"segmentation failed: {type(e).__name__}"]
        return out
    ink = ink_coverage(capture)
    ok, reasons = check_segment_rules(seg["regions"], seg["image_size"], ink)
    overlay_rel = "shots/eval-overlay.png"
    with open(os.path.join(figdir, overlay_rel), "wb") as f:
        f.write(base64.b64decode(seg["overlay_b64"]))
    out["overlay"] = overlay_rel
    seg_summary = {"regions": len(seg["regions"]),
                   "largest": round(max([r["area"] for r in seg["regions"]] + [0]) / max(1, seg["image_size"][0] * seg["image_size"][1]), 3),
                   "ink": round(ink, 4)}
    out["segment"] = seg_summary
    if not ok:
        out["verdict"]["reasons"] = reasons
        return out
    spec = load_spec(machine, root) or {}
    pack = load_pack(machine) or {"components": []}
    for _ in range(VERDICT_ATTEMPTS):
        out["attempts"] += 1
        passed, verdict = vision_verdict(pack, spec, capture, seg_summary,
                                         client_factory, usage)
        out["verdict"] = verdict
        if passed:
            out["state"] = "eval_pass"
            return out
    return out
