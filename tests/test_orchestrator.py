"""Tests for 6-Agent Orchestrator, 2D Blueprint PNG onboarding, SAM 2 Assembly
Guide grounding, and Closed-Loop Repair Kit Inventory."""

import io
import json
import os
import shutil

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from scipy.io import wavfile

import backend.app.assist as assist_mod
import backend.app.inventory as inv
from backend.app import orchestrator
from backend.app.main import app

client = TestClient(app)


def _sample_blueprint_png() -> bytes:
    im = Image.new("RGB", (480, 320), (16, 32, 48))
    dr = ImageDraw.Draw(im)
    dr.rectangle([40, 80, 180, 220], fill=(90, 130, 110), outline=(220, 240, 255), width=2)
    dr.ellipse([240, 90, 390, 240], fill=(195, 205, 215), outline=(245, 250, 255), width=2)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def test_agents_catalog_and_design_copilot():
    cat = client.get("/api/agents/catalog?machine=v6-engine").json()
    assert len(cat["agents"]) == 6
    ids = {a["id"] for a in cat["agents"]}
    assert {"supervisor", "blueprint_cad", "vision_assembly",
            "signal_acoustic", "design_physics", "inventory_procurement"} == ids

    res = client.post(
        "/api/orchestrate/design",
        json={"machine": "v6-engine", "prompt": "bore 88 mm and speed 4500 rpm"},
    ).json()
    assert res["kind"] == "engine"
    assert res["patch"] == {"bore": 88.0, "speed": 4500.0}
    assert res["ui_actions"][0]["type"] == "propose_physics"


def test_blueprint_png_upload_and_vision_merge():
    png = _sample_blueprint_png()
    r = client.post(
        "/api/packs/draft",
        data={"machine": "bp-png-test", "title": "PNG Blueprint"},
        files={"file": ("spindle.png", png, "image/png")},
    )
    body = r.json()
    assert "error" not in body, body
    assert body["source_kind"] == "blueprint_image"
    assert body["has_image"] is True
    draft_id = body["id"]
    if os.path.exists(f"data/pack_drafts/{draft_id}.json"):
        os.remove(f"data/pack_drafts/{draft_id}.json")


def test_inventory_restock_and_repair_kit(tmp_path, monkeypatch):
    monkeypatch.setattr(inv, "DB_PATH", str(tmp_path / "inv.db"))
    # Multi-machine seed stocks rig, v6-engine, demo-pump while keeping cr-pump = 15
    pump_parts = client.get("/api/inventory/search?machine=cr-pump&q=").json()["parts"]
    assert len(pump_parts) == 15
    rig_parts = client.get("/api/inventory/search?machine=rig&q=").json()["parts"]
    assert len(rig_parts) == 7

    kit = client.post(
        "/api/inventory/repair-kit",
        json={"machine": "rig", "component_id": "ring_outer", "auto_draft": True},
    ).json()
    assert kit["primary"]["component_id"] == "ring_outer"
    assert len(kit["companions"]) >= 1
    assert kit["draft_order"]["status"] == "draft"


def test_closed_loop_wav_assist_triggers_suspect_and_po(tmp_path, monkeypatch):
    monkeypatch.setattr(inv, "DB_PATH", str(tmp_path / "inv.db"))
    monkeypatch.setattr(assist_mod, "SESSIONS_DIR", str(tmp_path / "sess"))

    # Synthesize outer-race spall WAV @ 1500 rpm
    fs = 16000
    t = np.arange(fs * 2) / fs
    bpfo = 3.05 * 25.0
    imp = np.zeros_like(t)
    step = int(fs / bpfo)
    tau = np.arange(int(0.02 * fs)) / fs
    burst = np.exp(-450 * tau) * np.sin(2 * np.pi * 2200.0 * tau)
    for idx in range(0, t.size - burst.size, step):
        imp[idx: idx + burst.size] += burst
    buf = io.BytesIO()
    wavfile.write(buf, fs, (imp / np.max(np.abs(imp)) * 30000).astype("int16"))
    x, fs2 = assist_mod.parse_wav(buf.getvalue())

    class _StubC:
        class responses:
            @staticmethod
            def create(**kw):
                class O:
                    output_text = json.dumps({
                        "answer": "Outer race spall detected.",
                        "citations": [],
                        "reply": "Outer race fault confirmed; repair kit drafted.",
                        "next_checks": ["Inspect housing bore"],
                        "needs": [],
                    })
                return O()

    out = assist_mod.assist_turn(
        "rig",
        "Check this bearing noise and draft replacement kit",
        lambda: _StubC(),
        signal=(x, fs2),
        rpm=1500.0,
    )
    assert out["suspect_component"] == "ring_outer"
    assert len(out["agent_trace"]) == 6
    assert out["repair_kit"] is not None
    assert out["repair_kit"]["draft_order"]["status"] == "draft"
    assert out["acoustic_series"]["x"]


def test_assembly_guide_endpoint_offline_fallback(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    from backend.app.segment import ground_assembly_guide

    fake_seg = {
        "regions": [
            {"id": 1, "bbox": [10, 10, 100, 100], "area": 8000, "iou": 0.95},
            {"id": 2, "bbox": [120, 10, 220, 100], "area": 7500, "iou": 0.93},
            {"id": 3, "bbox": [240, 10, 340, 100], "area": 7000, "iou": 0.91},
        ],
        "overlay_b64": "aGVsbG8=",
        "image_size": [480, 320],
        "device": "cpu",
        "elapsed_ms": 12,
        "note": "stub",
    }
    res = ground_assembly_guide(_sample_blueprint_png(), "rig", None, seg_fn=lambda _: fake_seg)
    assert res["machine"] == "rig"
    assert len(res["grounded_regions"]) == 3
    assert len(res["steps"]) >= 3
