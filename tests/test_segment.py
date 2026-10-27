"""Segmentation tests. Model-free: synthetic masks + stubbed pipeline."""

import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

import backend.app.main as main
from backend.app.segment import (decode_photo, draw_overlay, masks_to_regions,
                                 segment_photo)

client = TestClient(main.app)


def square_mask(size=100, x0=20, y0=30, w=40, h=25):
    seg = np.zeros((size, size), dtype=bool)
    seg[y0:y0 + h, x0:x0 + w] = True
    return {"segmentation": seg, "area": int(seg.sum()),
            "bbox": [x0, y0, w, h], "predicted_iou": 0.95}


def test_masks_to_regions_square():
    regions = masks_to_regions([square_mask()])
    assert len(regions) == 1
    r = regions[0]
    assert r["bbox"] == [20.0, 30.0, 40.0, 25.0]
    assert r["area"] == 1000
    assert 4 <= len(r["polygon"]) <= 12  # simplified quad-ish


def test_masks_capped_and_sorted():
    masks = [square_mask(x0=i * 5, y0=10, w=10, h=10) for i in range(15)]
    regions = masks_to_regions(masks)
    assert len(regions) == 12
    assert regions[0]["id"] == 0


def test_draw_overlay_is_png():
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    png = draw_overlay(img, masks_to_regions([square_mask()]))
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_decode_downscales():
    big = Image.new("RGB", (3000, 2000), "red")
    buf = io.BytesIO()
    big.save(buf, format="JPEG")
    img = decode_photo(buf.getvalue())
    assert max(img.shape[:2]) <= 1024


def test_segment_endpoint_stubbed(monkeypatch):
    def fake(data: bytes):
        assert data == b"img-bytes"
        return {"regions": [{"id": 0}], "overlay_b64": "e30=",
                "device": "cpu", "elapsed_ms": 5, "note": "n"}
    monkeypatch.setattr(main, "segment_photo", fake)
    r = client.post("/api/vision/segment",
                    files={"photo": ("p.jpg", b"img-bytes", "image/jpeg")})
    assert r.json()["regions"] == [{"id": 0}]
    r2 = client.post("/api/vision/segment",
                     files={"photo": ("p.jpg", b"", "image/jpeg")})
    assert "error" in r2.json()


def test_segment_endpoint_bad_bytes_without_model():
    r = client.post("/api/vision/segment",
                    files={"photo": ("p.jpg", b"not-an-image",
                                     "image/jpeg")})
    assert "segmentation failed" in r.json()["error"]


def test_segment_photo_wires_helpers(monkeypatch):
    calls = {}
    class FakeGen:
        def generate(self, img):
            calls["shape"] = img.shape
            return [square_mask()]
    monkeypatch.setattr("backend.app.segment.get_model",
                        lambda: (FakeGen(), "cpu"))
    img = Image.new("RGB", (100, 100), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    out = segment_photo(buf.getvalue())
    assert len(out["regions"]) == 1
    assert out["device"] == "cpu" and out["elapsed_ms"] >= 0
    assert "not part IDs" in out["note"]
