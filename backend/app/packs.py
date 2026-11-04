"""Machine-pack serving. Reads committed packs/* only (never local PDFs)."""

from __future__ import annotations

import json
import os

PACKS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "packs")


def list_packs() -> list[dict]:
    out = []
    for machine in sorted(os.listdir(PACKS_DIR)):
        meta_path = os.path.join(PACKS_DIR, machine, "pack.json")
        if not os.path.isfile(meta_path):
            continue
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        n_comp = 0
        comp_path = os.path.join(PACKS_DIR, machine, "components.json")
        if os.path.isfile(comp_path):
            with open(comp_path, encoding="utf-8") as f:
                n_comp = len(json.load(f))
        out.append({"machine": meta["machine"], "name": meta["name"],
                    "kind": meta.get("kind"), "components": n_comp,
                    "dimensions": meta.get("dimensions")})
    return out


def load_pack(machine: str) -> dict | None:
    if "/" in machine or machine.startswith("."):
        return None
    base = os.path.join(PACKS_DIR, machine)
    meta_path = os.path.join(base, "pack.json")
    comp_path = os.path.join(base, "components.json")
    pb_path = os.path.join(base, "playbooks.json")
    if not os.path.isfile(meta_path) or not os.path.isfile(comp_path):
        return None
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    with open(comp_path, encoding="utf-8") as f:
        components = json.load(f)
    playbooks: list[dict] = []
    if os.path.isfile(pb_path):
        with open(pb_path, encoding="utf-8") as f:
            for pb in json.load(f):
                playbooks.append({"id": pb["id"], "symptom": pb["symptom"],
                                  "checks": len(pb.get("checks", []))})
    scenarios: list[dict] = []
    sc_path = os.path.join(base, "scenarios.json")
    if os.path.isfile(sc_path):
        with open(sc_path, encoding="utf-8") as f:
            scenarios = json.load(f)
    assembly = None
    asm_path = os.path.join(base, "assembly.json")
    if os.path.isfile(asm_path):
        with open(asm_path, encoding="utf-8") as f:
            assembly = json.load(f)
        ids = {c["id"] for c in components}
        steps = []
        for st in assembly.get("order", []):
            parts = [p for p in st.get("parts", []) if p in ids]
            if parts:
                steps.append({**st, "parts": parts})
        assembly["order"] = steps
    verification = None
    ver_path = os.path.join(base, "verification.json")
    if os.path.isfile(ver_path):
        with open(ver_path, encoding="utf-8") as f:
            rounds = json.load(f).get("rounds", [])
        if rounds:
            last = rounds[-1]
            verification = {k: last.get(k) for k in
                            ("round", "score", "issues", "changes", "response_id", "at")}
    return {"meta": meta, "components": components, "playbooks": playbooks,
            "scenarios": scenarios, "assembly": assembly,
            "verification": verification}
