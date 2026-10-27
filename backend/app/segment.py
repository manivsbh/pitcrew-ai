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
    masks = gen.generate(img)
    regions = masks_to_regions(masks)
    overlay = draw_overlay(img, regions)
    ms = int((time.time() - t0) * 1000)
    return {"regions": regions,
            "overlay_b64": base64.b64encode(overlay).decode(),
            "image_size": [int(img.shape[1]), int(img.shape[0])],
            "device": dev, "elapsed_ms": ms,
            "note": "Unsupervised regions for triage; not part IDs. "
                    "Only the vision specialist names registry parts."}
