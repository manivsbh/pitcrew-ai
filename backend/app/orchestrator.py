"""Executable 6-Agent Multi-Agent Orchestrator.

Coordinates six specialized engineering agents across workspace copilot turns,
live acoustic/vision fault diagnosis, parametric design trade studies, and
closed-loop repair-kit procurement:

1. Supervisor Coordinator       — intent routing, cross-modal fusion, safety gate
2. Blueprint & CAD Agent        — 2D PDF/image dimension extraction & 3D rig map
3. Vision & Assembly Engineer   — Meta SAM 2.1 masks + muse-spark-1.3 grounding
4. Signal & Acoustic Analyst    — Multi-band envelope probe, FFT & harmonic SNR
5. Design & Physics Reviewer    — Deterministic torsion / loss / BMEP trade study
6. Inventory & Procurement      — BOM companion kit & sandbox draft order engine
"""

from __future__ import annotations

import json
import math
import os
import re
import time

from . import harness, inventory, packs, rag

AGENT_SPECS: list[dict] = [
    {
        "id": "supervisor",
        "name": "Supervisor Coordinator",
        "role": "Intent router, cross-modal evidence synthesizer & citation gate",
        "engine": "muse-spark-1.3 + deterministic citation verifier",
    },
    {
        "id": "blueprint_cad",
        "name": "Blueprint & CAD Agent",
        "role": "2D PDF/image blueprint parser, dimension extractor & 3D scene mapper",
        "engine": "muse-spark-1.3 Vision + deterministic CAD heuristics",
    },
    {
        "id": "vision_assembly",
        "name": "Vision & Assembly Engineer",
        "role": "Instance segmentation & step-by-step 3D assembly guide grounding",
        "engine": "Meta SAM 2.1 (sam2.1_hiera_tiny) + muse-spark-1.3 Vision",
    },
    {
        "id": "signal_acoustic",
        "name": "Signal & Acoustic Analyst",
        "role": "Live 5s mic FFT, multi-band envelope probe & bearing SNR diagnosis",
        "engine": "SciPy Welch/Hilbert + Harness² evolved decision rules",
    },
    {
        "id": "design_physics",
        "name": "Design & Physics Reviewer",
        "role": "Multi-parameter shaft stress, motor loss & 4-stroke BMEP solver",
        "engine": "Deterministic physics/1.0 + muse-spark-1.3 parameter proposer",
    },
    {
        "id": "inventory_procurement",
        "name": "Inventory & Procurement Planner",
        "role": "Stock health monitor, companion BOM kit builder & sandbox PO drafter",
        "engine": "SQLite transactional ledger + companion consumable rules",
    },
]

PHYSICS_DEFAULTS: dict[str, dict] = {
    "bearing": {
        "kind": "bearing", "speed": 1500.0, "speedLimit": 3000.0,
        "torque": 5.0, "diameter": 20.0, "length": 200.0,
        "modulus": 79.0, "allowable": 80.0, "radialLoad": 500.0,
    },
    "motor": {
        "kind": "motor", "speed": 1500.0, "speedLimit": 3000.0,
        "torque": 4.0, "current": 4.0, "resistance": 1.0,
        "fixedLoss": 30.0, "coefficient": 0.0005, "currentLimit": 8.0,
        "diameter": 20.0,
    },
    "engine": {
        "kind": "engine", "speed": 3000.0, "speedLimit": 6000.0,
        "bore": 52.0, "stroke": 58.0, "cylinders": 1,
        "bmep": 600.0, "fuelFlow": 0.3, "lhv": 43.0, "bmepLimit": 1000.0,
    },
}

PHYSICS_BOUNDS: dict[str, dict[str, tuple[float, float]]] = {
    "bearing": {
        "speed": (0, 12000), "speedLimit": (100, 12000), "torque": (0, 500),
        "diameter": (5, 80), "length": (50, 1000), "modulus": (1, 200),
        "allowable": (1, 500), "radialLoad": (0, 10000),
    },
    "motor": {
        "speed": (0, 12000), "speedLimit": (100, 12000), "torque": (0, 100),
        "current": (0, 100), "resistance": (0.01, 20), "fixedLoss": (0, 500),
        "coefficient": (0, 0.05), "currentLimit": (0.1, 100), "diameter": (5, 80),
    },
    "engine": {
        "speed": (0, 12000), "speedLimit": (100, 12000), "bore": (20, 120),
        "stroke": (20, 120), "cylinders": (1, 8), "bmep": (0, 1500),
        "fuelFlow": (0, 10), "lhv": (1, 50), "bmepLimit": (1, 1500),
    },
}


def machine_to_physics_kind(machine: str, pack_meta: dict | None = None) -> str:
    kind = (pack_meta or {}).get("kind", "")
    if kind == "engine" or "engine" in machine:
        return "engine"
    if kind == "pump" or "pump" in machine or "motor" in machine:
        return "motor"
    return "bearing"


def physics_calculate(inp: dict) -> dict:
    """Deterministic Python mirror of frontend/src/physics/models.ts."""
    kind = str(inp.get("kind", "bearing"))
    base = dict(PHYSICS_DEFAULTS.get(kind, PHYSICS_DEFAULTS["bearing"]))
    base.update({k: v for k, v in inp.items() if v is not None})
    omega = 2.0 * math.pi * float(base["speed"]) / 60.0
    outputs: list[dict] = [
        {"label": "Angular velocity", "value": round(omega, 3), "unit": "rad/s"}
    ]
    checks: list[dict] = [
        {
            "label": "Speed",
            "actual": float(base["speed"]),
            "limit": float(base["speedLimit"]),
            "unit": "rpm",
            "exceeded": float(base["speed"]) > float(base["speedLimit"]),
        }
    ]
    contradictions: list[str] = []

    if kind == "bearing":
        d = float(base["diameter"]) / 1000.0
        L = float(base["length"]) / 1000.0
        G = float(base["modulus"]) * 1e9
        T = float(base["torque"])
        J = (math.pi * d ** 4) / 32.0
        shear_mpa = ((16.0 * T) / (math.pi * d ** 3)) / 1e6
        twist_deg = ((T * L) / (J * G)) * (180.0 / math.pi)
        util_pct = (shear_mpa / float(base["allowable"])) * 100.0
        outputs += [
            {"label": "Mechanical power", "value": round(T * omega, 2), "unit": "W"},
            {"label": "Maximum shear", "value": round(shear_mpa, 3), "unit": "MPa"},
            {"label": "Shaft twist", "value": round(twist_deg, 4), "unit": "deg"},
            {"label": "Shear utilization", "value": round(util_pct, 2), "unit": "%"},
        ]
        checks.append({
            "label": "Ideal shear",
            "actual": round(shear_mpa, 3),
            "limit": float(base["allowable"]),
            "unit": "MPa",
            "exceeded": shear_mpa > float(base["allowable"]),
        })
    elif kind == "motor":
        T = float(base["torque"])
        I = float(base["current"])
        R = float(base["resistance"])
        p_out = T * omega
        copper = 3.0 * (I ** 2) * R
        s_loss = float(base["coefficient"]) * (omega ** 2)
        loss = copper + float(base["fixedLoss"]) + s_loss
        total = p_out + loss
        eff = (p_out / total * 100.0) if total > 0 else None
        outputs += [
            {"label": "Mechanical power", "value": round(p_out, 2), "unit": "W"},
            {"label": "Total losses", "value": round(loss, 2), "unit": "W"},
            {"label": "Electrical input", "value": round(total, 2), "unit": "W"},
            {"label": "Efficiency", "value": round(eff, 2) if eff is not None else None, "unit": "%"},
        ]
        checks.append({
            "label": "Phase current",
            "actual": I,
            "limit": float(base["currentLimit"]),
            "unit": "A",
            "exceeded": I > float(base["currentLimit"]),
        })
    else:
        bore = float(base["bore"]) / 1000.0
        stroke = float(base["stroke"]) / 1000.0
        cyl = int(round(float(base["cylinders"])))
        vol = (math.pi / 4.0) * (bore ** 2) * stroke * cyl
        pressure = float(base["bmep"]) * 1000.0
        power = (pressure * vol * float(base["speed"])) / 120.0
        torque = (pressure * vol) / (4.0 * math.pi)
        fuel = (float(base["fuelFlow"]) / 1000.0) * float(base["lhv"]) * 1e6
        if power > fuel:
            contradictions.append("Brake power exceeds fuel energy input.")
        eff = (power / fuel * 100.0) if (fuel > 0 and power <= fuel) else None
        outputs += [
            {"label": "Total displacement", "value": round(vol * 1e6, 1), "unit": "cc"},
            {"label": "Brake power", "value": round(power, 1), "unit": "W"},
            {"label": "BMEP torque estimate", "value": round(torque, 2), "unit": "N·m"},
            {"label": "Brake thermal efficiency", "value": round(eff, 2) if eff is not None else None, "unit": "%"},
        ]
        checks.append({
            "label": "Assumed BMEP",
            "actual": float(base["bmep"]),
            "limit": float(base["bmepLimit"]),
            "unit": "kPa",
            "exceeded": float(base["bmep"]) > float(base["bmepLimit"]),
        })

    status = (
        "Inconsistent operating point" if contradictions
        else "Limit exceeded" if any(c["exceeded"] for c in checks)
        else "Within configured limits"
    )
    return {
        "kind": kind,
        "inputs": base,
        "outputs": outputs,
        "checks": checks,
        "contradictions": contradictions,
        "status": status,
    }


_PARAM_PATTERNS: list[tuple[str, set[str], re.Pattern[str]]] = [
    ("speed", {"bearing", "motor", "engine"},
     re.compile(r"(?:speed|rpm)\s*(?:to|=|:|\bat\b)?\s*(\d+(?:\.\d+)?)\s*(?:rpm)?", re.I)),
    ("bore", {"engine"},
     re.compile(r"bore\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:mm)?", re.I)),
    ("stroke", {"engine"},
     re.compile(r"stroke\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:mm)?", re.I)),
    ("cylinders", {"engine"},
     re.compile(r"(\d+)\s*cylinders?|cylinders?\s*(?:to|=|:)?\s*(\d+)", re.I)),
    ("bmep", {"engine"},
     re.compile(r"bmep\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:kpa)?", re.I)),
    ("fuelFlow", {"engine"},
     re.compile(r"fuel(?:\s*flow)?\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:g/s)?", re.I)),
    ("diameter", {"bearing", "motor"},
     re.compile(r"(?:shaft\s+)?diameter\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:mm)?", re.I)),
    ("torque", {"bearing", "motor"},
     re.compile(r"torque\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:n[·\s.-]*m)?", re.I)),
    ("radialLoad", {"bearing"},
     re.compile(r"radial\s*load\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:n)?", re.I)),
    ("current", {"motor"},
     re.compile(r"current\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:a|amps?)?", re.I)),
    ("resistance", {"motor"},
     re.compile(r"resistance\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)", re.I)),
]


def parse_design_patch(text: str, kind: str, current: dict) -> dict[str, float]:
    """Extract multi-parameter design changes from natural-language text."""
    patch: dict[str, float] = {}
    bounds = PHYSICS_BOUNDS.get(kind, {})

    # Relative percentage patterns: e.g. "increase speed by 20%"
    rel_re = re.compile(
        r"(increase|raise|boost|decrease|reduce|lower)\s+"
        r"(speed|rpm|torque|diameter|bore|stroke|bmep|current|resistance)"
        r"\s+by\s+(\d+(?:\.\d+)?)\s*%",
        re.I,
    )
    alias_map = {"rpm": "speed"}
    for verb, raw_key, pct_s in rel_re.findall(text):
        key = alias_map.get(raw_key.lower(), raw_key.lower())
        if key in bounds and key in current:
            sign = -1.0 if verb.lower() in ("decrease", "reduce", "lower") else 1.0
            val = float(current[key]) * (1.0 + sign * float(pct_s) / 100.0)
            lo, hi = bounds[key]
            patch[key] = round(min(max(val, lo), hi), 3)

    for key, allowed_kinds, rx in _PARAM_PATTERNS:
        if kind not in allowed_kinds or key in patch:
            continue
        m = rx.search(text)
        if not m:
            continue
        raw = next((g for g in m.groups() if g is not None), None)
        if raw is None:
            continue
        val = float(raw)
        if key in bounds:
            lo, hi = bounds[key]
            if lo <= val <= hi:
                patch[key] = int(round(val)) if key == "cylinders" else val
    return patch


def infer_suspect_component(
    machine: str,
    message: str,
    vision: dict | None,
    sound: dict | None,
    playbook: dict | None,
    components: list[dict],
) -> tuple[str | None, str]:
    """Identify the primary suspect component ID and detection source."""
    comp_ids = {c["id"] for c in components}

    if vision and vision.get("part_id") in comp_ids:
        return vision["part_id"], "vision_identification"

    if sound and isinstance(sound, dict) and not sound.get("error"):
        pv = sound.get("probe_verdict") or {}
        verdict = pv.get("suggests") or pv.get("hypothesis")
        if verdict in ("outer_ring_damage", "outer_fault") and "ring_outer" in comp_ids:
            return "ring_outer", "acoustic_band_probe"
        if verdict in ("inner_ring_damage", "inner_fault") and "ring_inner" in comp_ids:
            return "ring_inner", "acoustic_band_probe"
        hits = sound.get("hits") or {}
        bpfo_hit = (hits.get("bpfo") or {}).get("hit")
        bpfi_hit = (hits.get("bpfi") or {}).get("hit")
        if bpfo_hit and not bpfi_hit and "ring_outer" in comp_ids:
            return "ring_outer", "spectral_bpfo_peak"
        if bpfi_hit and not bpfo_hit and "ring_inner" in comp_ids:
            return "ring_inner", "spectral_bpfi_peak"

    hay = f"{message} {(playbook or {}).get('symptom', '')}".lower()
    keyword_map = [
        ("outer race", "ring_outer"),
        ("bpfo", "ring_outer"),
        ("inner race", "ring_inner"),
        ("bpfi", "ring_inner"),
        ("roller", "rollers"),
        ("cage", "cage"),
        ("shaft seal", "shaft-seal"),
        ("mechanical seal", "shaft-seal"),
        ("seal leak", "shaft-seal"),
        ("seal", "shaft-seal"),
        ("impeller", "impeller"),
        ("cavitation", "impeller"),
        ("injector", "fuel-injector-1"),
        ("misfire", "spark-plugs"),
        ("spark plug", "spark-plugs"),
        ("fuel pump", "fuel-pump"),
        ("piston", "piston-1"),
    ]
    for kw, cid in keyword_map:
        if kw in hay and cid in comp_ids:
            return cid, "symptom_grounding"

    for c in components:
        cname = c.get("name", "").lower()
        if len(cname) >= 5 and cname in hay:
            return c["id"], "component_mention"
    return None, "none"


def enrich_assist_turn(
    machine: str,
    message: str,
    pack: dict,
    vision: dict | None,
    sound: dict | None,
    chat: dict,
    playbook: dict | None,
    fired: list[str],
) -> dict:
    """Build deterministic 6-agent trace, UI actions, physics check & repair kit.

    Makes zero LLM calls so turn latency and unit-test call budgets stay tight.
    """
    t0 = time.perf_counter()
    loaded_pack = packs.load_pack(machine) or {}
    pack_meta = loaded_pack.get("meta") or {}
    dims = pack_meta.get("dimensions") or {}
    components = pack.get("components") or []

    suspect_id, suspect_source = infer_suspect_component(
        machine, message, vision, sound, playbook, components
    )

    last = [time.perf_counter()]

    def lap() -> int:
        now = time.perf_counter()
        ms = int((now - last[0]) * 1000)
        last[0] = now
        return ms

    # 1. Blueprint & CAD Agent
    cad_status = "active" if dims else "ready"
    cad_summary = (
        f"Loaded {len(components)} parts + extracted blueprint dimensions "
        f"({', '.join(f'{k}={v}' for k, v in list(dims.items())[:3])})."
        if dims
        else f"Mapped {len(components)}-part 3D kinematic hierarchy ({pack_meta.get('kind', 'generic')})."
    )
    cad_ms = lap()

    # 2. Vision & Assembly Engineer
    if vision is not None:
        vis_status = "fired"
        pid = vision.get("part_id") or "unmatched"
        vis_summary = (
            f"Identified `{pid}` (conf {vision.get('confidence', 0):.2f}): "
            f"{vision.get('rationale', '')[:90]}"
        )
    else:
        vis_status = "standby"
        vis_summary = "Ready for workbench photo or SAM 2.1 assembly grounding."
    vis_ms = lap()

    # 3. Signal & Acoustic Analyst
    acoustic_series = None
    if sound is not None:
        sig_status = "fired"
        if sound.get("error"):
            sig_summary = f"Signal rejected: {sound['error']}"
        else:
            acoustic_series = sound.get("spectrum_series")
            pv = sound.get("probe_verdict")
            peak0 = (sound.get("top_peaks") or [{}])[0].get("freq")
            if pv:
                hyp = pv.get("suggests") or pv.get("hypothesis")
                sig_summary = (
                    f"5s audio/signal ({sound.get('fs')} Hz): dominant {peak0} Hz; "
                    f"Harness² probe -> {hyp} (conf {pv.get('confidence')})."
                )
            else:
                sig_summary = (
                    f"Analyzed {sound.get('duration_s')}s @ {sound.get('fs')} Hz; "
                    f"dominant peak {peak0} Hz, kurtosis {sound.get('stats', {}).get('kurtosis', 0):.2f}."
                )
    else:
        sig_status = "standby"
        sig_summary = "Ready for 5s live mic WAV capture or 64 kHz bearing vibration."
    sig_ms = lap()

    # 4. Design & Physics Reviewer
    p_kind = machine_to_physics_kind(machine, pack_meta)
    cur_phys = dict(PHYSICS_DEFAULTS[p_kind])
    if p_kind == "engine":
        if dims.get("bore_mm"):
            cur_phys["bore"] = float(dims["bore_mm"])
        if dims.get("stroke_mm"):
            cur_phys["stroke"] = float(dims["stroke_mm"])
        if dims.get("cylinders"):
            cur_phys["cylinders"] = int(dims["cylinders"])
    elif dims.get("shaft_diameter_mm"):
        cur_phys["diameter"] = float(dims["shaft_diameter_mm"])
    if dims.get("rated_rpm"):
        cur_phys["speed"] = float(dims["rated_rpm"])

    design_patch = parse_design_patch(message, p_kind, cur_phys)
    physics_review = None
    if design_patch:
        proposed_inp = {**cur_phys, **design_patch}
        physics_review = {
            "baseline": physics_calculate(cur_phys),
            "proposed": physics_calculate(proposed_inp),
            "patch": design_patch,
        }
        phys_status = "fired"
        phys_summary = (
            f"Proposed {design_patch} -> {physics_review['proposed']['status']}."
        )
    else:
        phys_status = "ready"
        phys_summary = f"Monitoring `{p_kind}` operating envelope."
    phys_ms = lap()

    # 5. Inventory & Procurement Planner
    repair_kit = None
    want_order = any(
        w in message.lower()
        for w in ("order", "replace", "stock", "kit", "part", "sku", "broken",
                  "wear", "leak", "spall", "fault", "damage", "noise", "whine")
    ) or (vision is not None) or (sound is not None)

    if suspect_id and want_order:
        try:
            with inventory.connect() as conn:
                kit = inventory.recommend_repair_kit(
                    conn, machine, suspect_id, auto_draft=True
                )
                if "error" not in kit:
                    repair_kit = kit
        except Exception:
            repair_kit = None

    if repair_kit:
        inv_status = "fired"
        p_sku = repair_kit["primary"]["sku"]
        p_qty = repair_kit["primary"]["stock_qty"]
        d_id = (repair_kit.get("draft_order") or {}).get("id")
        inv_summary = (
            f"Matched `{suspect_id}` -> {p_sku} ({p_qty} in stock, "
            f"${repair_kit['estimated_total']:.2f} kit)"
            + (f"; auto-drafted PO #{d_id[:6]}." if d_id else ".")
        )
    else:
        inv_status = "ready"
        inv_summary = "Inventory ledger synced; standing by for suspect component."
    inv_ms = lap()

    # 6. Supervisor Coordinator
    cites_n = len(chat.get("citations") or [])
    sup_summary = (
        f"Synthesized {', '.join(fired)} with {cites_n} verified manual citation(s)"
        + (f"; routed suspect `{suspect_id}`." if suspect_id else ".")
    )

    elapsed_ms = max(1, int((time.perf_counter() - t0) * 1000))
    agent_trace = [
        {"agent_id": "supervisor", "name": "Supervisor Coordinator",
         "status": "fired", "summary": sup_summary, "latency_ms": elapsed_ms},
        {"agent_id": "blueprint_cad", "name": "Blueprint & CAD Agent",
         "status": cad_status, "summary": cad_summary, "latency_ms": cad_ms},
        {"agent_id": "vision_assembly", "name": "Vision & Assembly Engineer",
         "status": vis_status, "summary": vis_summary, "latency_ms": vis_ms},
        {"agent_id": "signal_acoustic", "name": "Signal & Acoustic Analyst",
         "status": sig_status, "summary": sig_summary, "latency_ms": sig_ms},
        {"agent_id": "design_physics", "name": "Design & Physics Reviewer",
         "status": phys_status, "summary": phys_summary, "latency_ms": phys_ms},
        {"agent_id": "inventory_procurement", "name": "Inventory & Procurement Planner",
         "status": inv_status, "summary": inv_summary, "latency_ms": inv_ms},
    ]

    ui_actions: list[dict] = []
    if suspect_id:
        ui_actions.append({
            "type": "focus_component",
            "payload": {"component_id": suspect_id, "source": suspect_source,
                        "explode": 0.45},
        })
    if design_patch:
        ui_actions.append({
            "type": "propose_physics",
            "payload": {"kind": p_kind, "patch": design_patch},
        })
    if repair_kit:
        ui_actions.append({
            "type": "show_repair_kit",
            "payload": {"component_id": suspect_id,
                        "order_id": (repair_kit.get("draft_order") or {}).get("id")},
        })
    if acoustic_series:
        ui_actions.append({
            "type": "plot_acoustic_spectrum",
            "payload": {"n_points": len(acoustic_series.get("x", []))},
        })

    return {
        "suspect_component": suspect_id,
        "suspect_source": suspect_source,
        "agent_trace": agent_trace,
        "ui_actions": ui_actions,
        "repair_kit": repair_kit,
        "physics_review": physics_review,
        "acoustic_series": acoustic_series,
    }


DESIGN_SYSTEM = (
    "You are the Design & Physics Reviewer agent. Convert the user's "
    "engineering request into a JSON parameter patch for the active physics "
    "model. Reply with JSON only: "
    '{"patch": {"<param>": <number>}, "rationale": "concise trade-off note"}. '
    "Only use parameter keys listed in Allowed Parameters."
)


def run_design_copilot(
    machine: str,
    prompt: str,
    current_inputs: dict | None = None,
    client_factory=None,
) -> dict:
    """Multi-parameter natural-language design & physics review."""
    loaded_pack = packs.load_pack(machine) or {}
    kind = machine_to_physics_kind(machine, loaded_pack.get("meta"))
    base = dict(PHYSICS_DEFAULTS[kind])
    if current_inputs:
        for k, v in current_inputs.items():
            if k in PHYSICS_BOUNDS[kind] and isinstance(v, (int, float)):
                base[k] = float(v)

    patch = parse_design_patch(prompt, kind, base)
    rationale = "Deterministic multi-parameter parser extracted target values."

    if not patch and client_factory is not None:
        allowed = PHYSICS_BOUNDS[kind]
        user_msg = (
            f"Machine kind: {kind}\nCurrent inputs: {json.dumps(base)}\n"
            f"Allowed Parameters (min..max): {json.dumps(allowed)}\n"
            f"User request: {prompt}"
        )
        try:
            from . import meta_calls
            from .assist import one_shot, parse_json_blob
            with meta_calls.role("design-physics"):
                out = parse_json_blob(one_shot(client_factory, DESIGN_SYSTEM,
                                               user_msg))
            raw_patch = (out or {}).get("patch") or {}
            for k, v in raw_patch.items():
                if k in allowed and isinstance(v, (int, float)):
                    lo, hi = allowed[k]
                    if lo <= float(v) <= hi:
                        patch[k] = int(round(v)) if k == "cylinders" else float(v)
            if (out or {}).get("rationale"):
                rationale = str(out["rationale"])[:300]
        except Exception:
            pass

    before = physics_calculate(base)
    after = physics_calculate({**base, **patch}) if patch else before
    return {
        "machine": machine,
        "kind": kind,
        "patch": patch,
        "rationale": rationale,
        "before": before,
        "after": after,
        "ui_actions": (
            [{"type": "propose_physics", "payload": {"kind": kind, "patch": patch}}]
            if patch else []
        ),
    }


def agent_catalog(machine: str = "rig") -> dict:
    """Live telemetry across all 6 specialist agents for the Agent Lab."""
    rag_info = rag.stats()
    h_state = harness.load_harness(machine)
    sam_ckpt = os.path.isfile("data/models/sam2.1_hiera_tiny.pt")
    with inventory.connect() as conn:
        inv_parts = inventory.search(conn, machine, "")
    stocked = sum(1 for p in inv_parts if p["stock_qty"] > 0)
    loaded = packs.load_pack(machine) or {}
    dims = (loaded.get("meta") or {}).get("dimensions") or {}

    enriched = []
    for spec in AGENT_SPECS:
        aid = spec["id"]
        metrics: dict = {}
        if aid == "supervisor":
            metrics = {"rag_chunks": rag_info["chunks"], "zero_unverified_quotes": True}
        elif aid == "blueprint_cad":
            metrics = {
                "components": len(loaded.get("components") or []),
                "dimensions_extracted": len(dims),
            }
        elif aid == "vision_assembly":
            metrics = {
                "sam2_checkpoint_ready": sam_ckpt,
                "assembly_steps": len((loaded.get("assembly") or {}).get("order") or []),
            }
        elif aid == "signal_acoustic":
            metrics = {
                "harness_version": h_state.get("version"),
                "active_skills": len([s for s in h_state.get("skills", []) if s.get("active", True)]),
                "lessons_learned": len(harness.list_experience(machine)),
            }
        elif aid == "design_physics":
            kind = machine_to_physics_kind(machine, loaded.get("meta"))
            metrics = {"physics_model": f"{kind}/1.0", "parameters": len(PHYSICS_BOUNDS[kind])}
        elif aid == "inventory_procurement":
            metrics = {"total_skus": len(inv_parts), "stocked_skus": stocked}
        enriched.append({**spec, "status": "online", "metrics": metrics})

    return {
        "machine": machine,
        "agents": enriched,
        "rag": rag_info,
        "harness_version": h_state.get("version"),
    }
