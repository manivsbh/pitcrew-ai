"""On-demand photo segmentation (SAM 2, local). Showcase + triage aid.

Regions are unsupervised: they outline coherent image areas but are NOT
part IDs. Only the vision specialist (registry-grounded) names parts.
"""

from __future__ import annotations

import base64
import io
import os
import time

import cv2
import numpy as np
from PIL import Image

CKPT_PATH = "data/models/sam2.1_hiera_tiny.pt"
CKPT_URL = ("https://dl.fbaipublicfiles.com/segment_anything_2/092824/"
            "sam2.1_hiera_tiny.pt")
CONFIG = "configs/sam2.1/sam2.1_hiera_t.yaml"
MAX_DIM = 1024
MAX_MASKS = 12

_model = None
_device = None


def device() -> str:
    # Measured 2026-10-27 on this machine (758px auto-masks, hiera-tiny):
    # CPU ~14 s, MPS ~223 s (per-op fallback overhead). CPU wins.
    return "cpu"


def get_model():
    """Lazy-load singleton. Downloads the tiny checkpoint on first use."""
    global _model, _device
    if _model is not None:
        return _model, _device
    if not os.path.exists(CKPT_PATH):
        import urllib.request
        os.makedirs(os.path.dirname(CKPT_PATH), exist_ok=True)
        urllib.request.urlretrieve(CKPT_URL, CKPT_PATH)
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    from sam2.build_sam import build_sam2
    _device = device()
    try:
        sam = build_sam2(CONFIG, CKPT_PATH, device=_device)
    except Exception:
        _device = "cpu"
        sam = build_sam2(CONFIG, CKPT_PATH, device="cpu")
    _model = SAM2AutomaticMaskGenerator(sam, points_per_side=16)
    return _model, _device


def decode_photo(data: bytes) -> np.ndarray:
    img = np.array(Image.open(io.BytesIO(data)).convert("RGB"))
    h, w = img.shape[:2]
    scale = min(1.0, MAX_DIM / max(h, w))
    if scale < 1.0:
        img = np.array(Image.fromarray(img).resize(
            (int(w * scale), int(h * scale))))
    return img


def masks_to_regions(masks: list[dict]) -> list[dict]:
    """SAM masks -> simplified polygon regions (pure; model-free)."""
    regions = []
    for i, m in enumerate(sorted(masks, key=lambda m: -m["area"])
                          [:MAX_MASKS]):
        mask = (m["segmentation"] > 0).astype("uint8") * 255
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        big = max(contours, key=cv2.contourArea)
        eps = 0.008 * cv2.arcLength(big, True)
        poly = cv2.approxPolyDP(big, eps, True).reshape(-1, 2)
        x, y, w, h = (round(float(v), 1) for v in m["bbox"])
        regions.append({"id": i, "bbox": [x, y, w, h],
                        "area": int(m["area"]),
                        "iou": round(float(m["predicted_iou"]), 3),
                        "polygon": [[int(px), int(py)] for px, py in poly
                                    [:200]]})
    return regions


def draw_overlay(img: np.ndarray, regions: list[dict]) -> bytes:
    """Colored region overlay + index labels -> PNG bytes."""
    rng = np.random.default_rng(7)
    colors = [tuple(int(v) for v in rng.integers(40, 230, 3))
              for _ in regions]
    out = img.copy()
    for reg, color in zip(regions, colors):
        pts = np.array(reg["polygon"], dtype=np.int32)
        layer = out.copy()
        cv2.fillPoly(layer, [pts], color)
        cv2.addWeighted(layer, 0.45, out, 0.55, 0, out)
        cv2.polylines(out, [pts], True, color, 2)
        x, y = reg["bbox"][0], reg["bbox"][1]
        cv2.putText(out, str(reg["id"]), (int(x) + 4, int(y) + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    ok, buf = cv2.imencode(".png", cv2.cvtColor(out, cv2.COLOR_RGB2BGR))
    if not ok:
        raise ValueError("overlay encode failed")
    return buf.tobytes()


def segment_photo(data: bytes) -> dict:
    """Full pipeline: bytes -> regions + overlay. Runs the local model."""
    t0 = time.time()
    img = decode_photo(data)
    gen, dev = get_model()
    from . import meta_calls
    t_gen = time.time()
    with meta_calls.inflight("sam2.1_hiera_tiny", f"local-{dev}",
                             agent="sam-segmenter"):
        masks = gen.generate(img)
    regions = masks_to_regions(masks)
    meta_calls.record(model="sam2.1_hiera_tiny", host=f"local-{dev}",
                      status="ok", latency_ms=(time.time() - t_gen) * 1000,
                      detail=f"{len(regions)} masks", agent="sam-segmenter")
    overlay = draw_overlay(img, regions)
    ms = int((time.time() - t0) * 1000)
    return {"regions": regions,
            "overlay_b64": base64.b64encode(overlay).decode(),
            "image_size": [int(img.shape[1]), int(img.shape[0])],
            "device": dev, "elapsed_ms": ms,
            "note": "Unsupervised regions for triage; not part IDs. "
                    "Only the vision specialist names registry parts."}


ASSEMBLY_GROUND_SYSTEM = (
    "You are a Vision & Assembly Engineer fusing Meta SAM 2 region masks with "
    "a verified machine component registry. Look at the numbered segmentation "
    "overlay image and match numbered regions (0..N) to registry component IDs "
    "(ONLY use component IDs from the provided registry; omit background "
    "regions). Also flag any visible wear/spalling/damage and produce a clear "
    "step-by-step assembly sequence with torque/check guidance from the manual "
    "excerpts. Reply with JSON only: "
    '{"grounded_regions": [{"region_id": 0, "component_id": "<registry id>", '
    '"confidence": 0.0-1.0, "condition": "healthy" | "suspect_wear", '
    '"visual_note": "short observation"}], '
    '"steps": [{"step": 1, "region_id": 0, "component_id": "<registry id>", '
    '"instruction": "concise assembly action", "torque_or_check": "spec from manual or visual check"}]}'
)


def ground_assembly_guide(data: bytes, machine: str, client_factory=None,
                          seg_fn=None) -> dict:
    """Fuse local Meta SAM 2 masks with Meta muse-spark-1.3 Vision + RAG to
    produce a grounded, step-by-step Image-to-Assembly & Visual Fault Guide."""
    import json
    import re
    from .packs import load_pack

    pack = load_pack(machine)
    if pack is None:
        return {"error": f"unknown machine pack {machine}"}

    run_seg = seg_fn or segment_photo
    seg = run_seg(data)
    regions = seg.get("regions", [])
    comps = pack["components"]
    by_id = {c["id"]: c for c in comps}
    region_ids = {r["id"] for r in regions}

    rag_snippets = ""
    try:
        from . import rag
        hits = rag.retrieve(machine, "assembly install torque sequence dismantle",
                            k=4)
        rag_snippets = "\n".join(
            f"[{h['source']}] {h['text'][:350]}" for h in hits)
    except Exception:
        rag_snippets = ""

    usage = {"input_tokens": 0, "output_tokens": 0}
    parsed = None
    if client_factory is not None and regions:
        try:
            from .config import MODEL_ID, REASONING_EFFORT
            reg_slim = [{"id": c["id"], "name": c["name"], "pos": c.get("pos"),
                         "parent": c.get("parent")} for c in comps[:45]]
            prompt = (
                f"Machine: {pack['meta']['name']} ({machine})\n"
                f"SAM 2 Region IDs available: {sorted(region_ids)}\n"
                f"Component Registry:\n{json.dumps(reg_slim)}\n\n"
                f"Manual Assembly / Torque Context:\n{rag_snippets[:2500]}"
            )
            from . import meta_calls
            with meta_calls.role("assembly-grounder"):
                resp = client_factory().responses.create(
                    model=MODEL_ID,
                    instructions=ASSEMBLY_GROUND_SYSTEM,
                    input=[{"role": "user", "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image",
                         "image_url": f"data:image/png;base64,{seg['overlay_b64']}"},
                    ]}],
                    reasoning={"effort": REASONING_EFFORT},
                )
            u = getattr(resp, "usage", None)
            usage["input_tokens"] = getattr(u, "input_tokens", 0) or 0
            usage["output_tokens"] = getattr(u, "output_tokens", 0) or 0
            out = getattr(resp, "output_text", "") or ""
            m = re.search(r"\{.*\}", out, re.DOTALL)
            if m:
                parsed = json.loads(m.group(0))
        except Exception:
            parsed = None

    grounded_regions: list[dict] = []
    if isinstance(parsed, dict):
        for gr in parsed.get("grounded_regions") or []:
            if not isinstance(gr, dict):
                continue
            rid = gr.get("region_id")
            cid = gr.get("component_id")
            if rid in region_ids and cid in by_id:
                cond = gr.get("condition")
                if cond not in ("healthy", "suspect_wear"):
                    cond = "healthy"
                grounded_regions.append({
                    "region_id": rid,
                    "component_id": cid,
                    "component_name": by_id[cid]["name"],
                    "pos": by_id[cid].get("pos"),
                    "confidence": round(min(max(float(gr.get("confidence", 0.7)
                                                      or 0.7), 0.0), 1.0), 2),
                    "condition": cond,
                    "visual_note": str(gr.get("visual_note", ""))[:220],
                })

    steps: list[dict] = []
    if isinstance(parsed, dict):
        for idx, st in enumerate(parsed.get("steps") or [], 1):
            if not isinstance(st, dict):
                continue
            cid = st.get("component_id")
            if cid not in by_id:
                continue
            rid = st.get("region_id")
            if rid not in region_ids:
                rid = next((g["region_id"] for g in grounded_regions
                            if g["component_id"] == cid), None)
            steps.append({
                "step": idx,
                "region_id": rid,
                "component_id": cid,
                "component_name": by_id[cid]["name"],
                "parts": [cid],
                "instruction": str(st.get("instruction",
                                          f"Install {by_id[cid]['name']}."))[:260],
                "torque_or_check": str(st.get("torque_or_check",
                                              "Verify seating & alignment."))[:180],
            })

    # Deterministic fallback when model is unavailable or returned <2 steps:
    # pair pack's verified assembly.json order with detected SAM 2 regions.
    if not grounded_regions and regions and comps:
        asm_order = (pack.get("assembly") or {}).get("order") or []
        ordered_ids: list[str] = []
        for a_step in asm_order:
            for pid in a_step.get("parts", []):
                if pid in by_id and pid not in ordered_ids:
                    ordered_ids.append(pid)
        for c in comps:
            if c["id"] not in ordered_ids:
                ordered_ids.append(c["id"])
        for r_item, cid in zip(regions, ordered_ids):
            grounded_regions.append({
                "region_id": r_item["id"],
                "component_id": cid,
                "component_name": by_id[cid]["name"],
                "pos": by_id[cid].get("pos"),
                "confidence": 0.55,
                "condition": "healthy",
                "visual_note": "Heuristic region-to-sequence alignment (offline fallback).",
            })

    if not steps:
        asm_order = (pack.get("assembly") or {}).get("order") or []
        reg_by_comp = {g["component_id"]: g["region_id"]
                       for g in grounded_regions}
        for idx, a_step in enumerate(asm_order[:12], 1):
            pts = [pid for pid in a_step.get("parts", []) if pid in by_id]
            if not pts:
                continue
            cid = pts[0]
            steps.append({
                "step": idx,
                "region_id": reg_by_comp.get(cid),
                "component_id": cid,
                "component_name": by_id[cid]["name"],
                "parts": pts,
                "instruction": a_step.get("caption",
                                          f"Install {by_id[cid]['name']}."),
                "torque_or_check": f"Ref: {by_id[cid].get('service_ref', 'manual')}",
            })

    suspects = [g["component_id"] for g in grounded_regions
                if g.get("condition") == "suspect_wear"]
    return {
        "machine": machine,
        "regions": regions,
        "grounded_regions": grounded_regions,
        "steps": steps,
        "suspect_components": suspects,
        "overlay_b64": seg.get("overlay_b64"),
        "image_size": seg.get("image_size", [0, 0]),
        "device": seg.get("device", "cpu"),
        "elapsed_ms": seg.get("elapsed_ms", 0),
        "usage": usage,
    }
