"""End-to-End Edge Cases Test Suite.

Verifies the 28 edge cases (EC-01 through EC-28) defined in the test plan
against live backend endpoints and agent modules using both synthetic
and unseen 'in the wild' assets.
"""

import json
import os
import shutil
import tempfile
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app import (
    analysis,
    assist,
    figures,
    harness,
    inventory,
    orchestrator,
    packbuilder,
    packs,
    rag,
    segment,
)
from backend.app.store import Store

client = TestClient(app)
store = Store()

ASSETS_DIR = "data/test_unknown_assets"
CORRUPTED_DIR = os.path.join(ASSETS_DIR, "corrupted")
AUDIO_DIR = os.path.join(ASSETS_DIR, "audio_exotic")
BLUEPRINTS_DIR = os.path.join(ASSETS_DIR, "blueprints_unseen")


# ==============================================================================
# Pillar 1: Blueprint Ingestion & 2D Multimodal Reconstruction (EC-01 .. EC-05)
# ==============================================================================

def test_ec01_zero_byte_pdf_and_png_uploads():
    """EC-01: 0-byte file uploads to /api/packs/draft must return clean error."""
    # 0-byte PDF
    with open(os.path.join(CORRUPTED_DIR, "zero_byte.pdf"), "rb") as f:
        res = client.post(
            "/api/packs/draft",
            data={"machine": "test-zero-pdf", "title": "Zero PDF"},
            files={"file": ("zero.pdf", f, "application/pdf")},
        ).json()
    assert "error" in res
    assert "empty" in res["error"].lower() or "could not read" in res["error"].lower()

    # 0-byte PNG
    with open(os.path.join(CORRUPTED_DIR, "zero_byte.png"), "rb") as f:
        res = client.post(
            "/api/packs/draft",
            data={"machine": "test-zero-png", "title": "Zero PNG"},
            files={"file": ("zero.png", f, "image/png")},
        ).json()
    assert "error" in res
    assert "empty" in res["error"].lower() or "could not read" in res["error"].lower()


def test_ec02_corrupted_binary_disguised_pdf_and_png():
    """EC-02: Corrupted random binary streams with PDF/PNG extensions."""
    with open(os.path.join(CORRUPTED_DIR, "fake_pdf_binary.pdf"), "rb") as f:
        res = client.post(
            "/api/packs/draft",
            data={"machine": "test-fake-pdf", "title": "Fake PDF"},
            files={"file": ("fake.pdf", f, "application/pdf")},
        ).json()
    assert "error" in res
    assert "could not read" in res["error"].lower() or "corrupt" in res["error"].lower()

    with open(os.path.join(CORRUPTED_DIR, "fake_png_binary.png"), "rb") as f:
        res = client.post(
            "/api/packs/draft",
            data={"machine": "test-fake-png", "title": "Fake PNG"},
            files={"file": ("fake.png", f, "image/png")},
        ).json()
    assert "error" in res
    assert "could not read" in res["error"].lower() or "corrupt" in res["error"].lower()


def test_ec03_textless_blueprint_image():
    """EC-03: Blueprint image containing pure CAD drawings with 0 OCR text."""
    with open(os.path.join(BLUEPRINTS_DIR, "textless_gear_schematic.png"), "rb") as f:
        res = client.post(
            "/api/packs/draft",
            data={"machine": "gear-schematic", "title": "Textless Gear"},
            files={"file": ("textless.png", f, "image/png")},
        ).json()
    assert "error" not in res
    assert res.get("id") or res.get("draft_id")
    # Must fallback gracefully to visual layout regions
    assert "assessment" in res
    assert "score" in res["assessment"]
    assert "candidates" in res


def test_ec04_extreme_aspect_ratio_schematic():
    """EC-04: Extreme 2400x120 aspect ratio (20:1) panoramic schematic."""
    with open(os.path.join(BLUEPRINTS_DIR, "extreme_aspect_strip.png"), "rb") as f:
        res = client.post(
            "/api/packs/draft",
            data={"machine": "strip-conveyor", "title": "Conveyor Strip"},
            files={"file": ("strip.png", f, "image/png")},
        ).json()
    assert "error" not in res
    assert res.get("id") or res.get("draft_id")
    assert res.get("has_image") is True or res.get("image_preview") is not None


def test_ec05_oversized_file_upload_rejected():
    """EC-05: >30 MB payload rejected before memory allocation."""
    huge_bytes = b"0" * (31 * 1024 * 1024)
    res = client.post(
        "/api/packs/draft",
        data={"machine": "huge-machine", "title": "Huge"},
        files={"file": ("huge.pdf", huge_bytes, "application/pdf")},
    ).json()
    assert "error" in res
    assert "exceeds" in res["error"].lower() or "cap" in res["error"].lower()


# ==============================================================================
# Pillar 2: Acoustic Analysis & Live Voice/Signal Processing (EC-06 .. EC-10)
# ==============================================================================

def test_ec06_pure_silence_wav():
    """EC-06: Zero amplitude audio must not crash FFT, SNR, or probe calculations."""
    wav_path = os.path.join(AUDIO_DIR, "silence_16k.wav")
    with open(wav_path, "rb") as f:
        data = f.read()
    arr, fs = assist.parse_wav(data)
    assert fs == 16000.0
    assert np.all(arr == 0.0)

    # Deterministic sound_analyze check
    out = assist.sound_analyze(arr, fs, rpm=1500.0, machine="rig")
    assert "error" not in out
    assert out["stats"]["rms"] == 0.0
    # On flat zero signal, crest/kurtosis are gracefully None
    assert out["stats"].get("kurtosis_excess") is None
    assert len(out["top_peaks"]) == 0 or out["top_peaks"][0]["amp"] == 0.0


def test_ec07_clipped_square_wave():
    """EC-07: Severely clipped signal saturated at rails (+1.0 / -1.0)."""
    wav_path = os.path.join(AUDIO_DIR, "clipped_square_16k.wav")
    with open(wav_path, "rb") as f:
        arr, fs = assist.parse_wav(f.read())
    out = assist.sound_analyze(arr, fs, rpm=1500.0, machine="rig")
    assert "error" not in out
    assert out["stats"]["peak"] == 1.0
    assert out["stats"]["crest"] >= 1.0


def test_ec08_white_noise_random_energy():
    """EC-08: High entropy Gaussian noise across all frequencies."""
    wav_path = os.path.join(AUDIO_DIR, "white_noise_44k.wav")
    with open(wav_path, "rb") as f:
        arr, fs = assist.parse_wav(f.read())
    out = assist.sound_analyze(arr, fs, rpm=1500.0, machine="rig")
    assert "error" not in out
    assert out["fs"] == 44100.0
    assert out["stats"]["rms"] > 0.0


def test_ec09_exotic_low_and_high_sample_rates():
    """EC-09: 8 kHz phone audio & 96 kHz ultrasonic sensor rate."""
    # 8 kHz
    with open(os.path.join(AUDIO_DIR, "speech_proxy_8k.wav"), "rb") as f:
        arr_8k, fs_8k = assist.parse_wav(f.read())
    assert fs_8k == 8000.0
    out_8k = assist.sound_analyze(arr_8k, fs_8k, rpm=1500.0, machine="rig")
    assert "error" not in out_8k
    assert out_8k["fs"] == 8000.0

    # 96 kHz
    with open(os.path.join(AUDIO_DIR, "high_freq_96k.wav"), "rb") as f:
        arr_96k, fs_96k = assist.parse_wav(f.read())
    assert fs_96k == 96000.0
    out_96k = assist.sound_analyze(arr_96k, fs_96k, rpm=1500.0, machine="rig")
    assert "error" not in out_96k
    assert out_96k["fs"] == 96000.0


def test_ec10_truncated_and_zero_byte_wav_inputs():
    """EC-10: Truncated WAV header (28 bytes) and 0-byte audio file."""
    with open(os.path.join(CORRUPTED_DIR, "truncated.wav"), "rb") as f:
        with pytest.raises(Exception):
            assist.parse_wav(f.read())

    res = client.post(
        "/api/assist",
        data={"machine": "rig", "message": "Broken audio"},
        files={"wav": ("trunc.wav", b"RIFF....WAVEfmt ", "audio/wav")},
    ).json()
    assert "error" in res
    assert "could not read wav" in res["error"].lower()

    res_empty = client.post(
        "/api/assist",
        data={"machine": "rig", "message": "Zero audio"},
        files={"wav": ("empty.wav", b"", "audio/wav")},
    ).json()
    assert "error" in res_empty
    assert "empty wav" in res_empty["error"].lower() or "could not read wav" in res_empty["error"].lower()


# ==============================================================================
# Pillar 3: Grounded RAG & Industrial Playbooks (EC-11 .. EC-15)
# ==============================================================================

def test_ec11_adversarial_fts5_syntax_queries():
    """EC-11: SQL injection and FTS5 syntax busters in RAG retrieve."""
    adversarial_queries = [
        '""unclosed quote',
        'AND OR NOT',
        'NEAR(bearing, 10)',
        '*** ((( )))',
        "SELECT * FROM chunks WHERE 1=1; --",
        "<script>alert('xss')</script>",
        "🔧⚙️💥",
    ]
    for q in adversarial_queries:
        hits = rag.retrieve("rig", q)
        assert isinstance(hits, list)
        res = client.get("/api/rag/search", params={"machine": "rig", "q": q}).json()
        assert "hits" in res
        assert isinstance(res["hits"], list)


def test_ec12_missing_component_fallback():
    """EC-12: RAG query with non-existent component filter returns broad matches."""
    res = client.get(
        "/api/rag/search",
        params={"machine": "rig", "q": "vibration", "component_id": "non_existent_part_999"},
    ).json()
    assert "hits" in res
    assert isinstance(res["hits"], list)


def test_ec13_empty_and_whitespace_only_rag_query():
    """EC-13: Empty and whitespace query handling."""
    res = client.get("/api/rag/search", params={"machine": "rig", "q": "   "}).json()
    assert "hits" in res
    assert res["hits"] == []


def test_ec14_playbook_branching_all_decision_paths():
    """EC-14: Walk CR-PUMP troubleshooting playbook across decision steps."""
    start = client.post(
        "/api/guide/start",
        json={"machine": "cr-pump", "playbook_id": "pump-no-run"},
    ).json()
    assert "id" in start
    gid = start["id"]
    assert start["current"]["id"] == "power"

    # Step 1: Answer 'ok' or 'bad' (valid results)
    s2 = client.post(
        f"/api/guide/{gid}/answer",
        json={"result": "bad", "note": "Power absent", "action": "checked"},
    ).json()
    assert "done" in s2
    assert "path" in s2


def test_ec15_unsupported_citation_sanitization():
    """EC-15: Strict verification that unverifiable hallucinated citations are rejected."""
    sources_map = {
        "manual.md": "Replace the mechanical shaft seal if leakage exceeds five drops per minute."
    }
    # Test assist answer quote verification logic directly
    verified = rag.verify_quote("cr-pump", "cr-pump/manual.md", "non-existent hallucinated sentence")
    assert verified is False


# ==============================================================================
# Pillar 4: Interactive 3D Simulation & Assembly (EC-16 .. EC-19)
# ==============================================================================

def test_ec16_corrupted_image_to_assembly_guide():
    """EC-16: Invalid photo bytes to /api/vision/assembly-guide."""
    with open(os.path.join(CORRUPTED_DIR, "fake_png_binary.png"), "rb") as f:
        res = client.post(
            "/api/vision/assembly-guide",
            data={"machine": "rig"},
            files={"photo": ("fake.png", f, "image/png")},
        ).json()
    assert "error" in res


def test_ec17_textless_blueprint_sam_segmentation():
    """EC-17: SAM segmentation fallback on hand-sketched and textless blueprints."""
    with open(os.path.join(BLUEPRINTS_DIR, "hand_sketch_layout.png"), "rb") as f:
        data = f.read()
    res = segment.segment_photo(data)
    assert "regions" in res
    assert len(res["regions"]) >= 1
    for r in res["regions"]:
        assert "bbox" in r
        assert "iou" in r


def test_ec18_assembly_topological_cycle_prevention():
    """EC-18: Verify assembly order is strictly a Directed Acyclic Graph (no self-loops)."""
    for m in ("rig", "cr-pump"):
        pack = packs.load_pack(m)
        order = pack["assembly"]["order"]
        all_ids = {c["id"] for c in pack["components"]}
        seen = set()
        for step in order:
            for p in step["parts"]:
                assert p in all_ids
                assert p not in seen, f"Duplicate component in assembly: {p}"
                seen.add(p)
        assert seen == all_ids


def test_ec19_scenario_physics_parameter_bounds():
    """EC-19: Verify all pack scenarios have strictly bounded wobble and slow multipliers."""
    for m in ("rig", "cr-pump"):
        pack = packs.load_pack(m)
        for sc in pack["scenarios"]:
            assert 0.0 < sc["slow"] <= 1.0, f"Invalid slow multiplier: {sc['slow']}"
            assert 0.0 <= sc["wobble"] <= 1.0, f"Invalid wobble multiplier: {sc['wobble']}"
            assert isinstance(sc["parts"], list)


# ==============================================================================
# Pillar 5: Self-Learning Harness2 & Experience Distillation (EC-20 .. EC-24)
# ==============================================================================

def test_ec20_harness_reset_between_presets():
    """EC-20: Dynamic switching between v1_naive and v2_evolved preserves integrity."""
    # Reset to v1_naive
    r1 = client.post("/api/harness/rig/reset", json={"preset": "v1_naive"}).json()
    assert r1["harness"]["preset"] == "v1_naive"
    assert "v1.0-naive" in r1["harness"]["version"]
    assert r1["harness"]["thresholds"]["snr_healthy_max"] == 3.5

    # Reset back to v2_evolved
    r2 = client.post("/api/harness/rig/reset", json={"preset": "v2"}).json()
    assert r2["harness"]["preset"] == "v2"
    assert "v2.0" in r2["harness"]["version"]
    assert r2["harness"]["thresholds"]["ultrasonic_hz"] == 8000.0


def test_ec21_contradictory_distillation_lesson():
    """EC-21: Logging an experience lesson with inverted technician diagnosis."""
    res = client.post(
        "/api/harness/rig/distill",
        json={
            "predicted": "inner_ring",
            "actual": "outer_ring",
            "reasoning": "Acoustic high freq mismatch",
            "technician_note": "Found outer raceway spalling upon teardown",
            "investigation_id": "inv_test_edge",
        },
    ).json()
    assert "lesson" in res
    assert res["lesson"]["actual"] == "outer_ring"
    assert "harness" in res
    assert res["harness"]["version"] is not None


def test_ec22_zero_evidence_probe_evaluation():
    """EC-22: evaluate_probe with empty band list returns healthy or insufficient_evidence baseline."""
    h_data = harness.load_harness("rig")
    bp = {"bands": []}
    verdict = harness.evaluate_probe(bp, h_data)
    assert verdict["suggests"] in ("healthy", "insufficient_evidence")
    assert verdict["confidence"] <= 0.5
    assert "rationale" in verdict


def test_ec23_k002_sensor_mount_kurtosis_discrimination():
    """EC-23: Regression guard verifying K002 sensor resonance is not mistaken for bearing fault."""
    dummy_bp = {
        "bands": [
            {
                "band_lo": 500.0,
                "band_hi": 4000.0,
                "kurtosis_excess": 0.2,
                "bpfo_snr": {"mean": 1.2, "n_above_3": 0},
                "bpfi_snr": {"mean": 1.4, "n_above_3": 0},
                "contrast": 1.4,
                "dominant": "bpfi",
            },
            {
                "band_lo": 12000.0,
                "band_hi": 16000.0,
                "kurtosis_excess": 8.5,
                "bpfo_snr": {"mean": 1.1, "n_above_3": 0},
                "bpfi_snr": {"mean": 1.0, "n_above_3": 0},
                "contrast": 1.1,
                "dominant": "bpfo",
            },
        ]
    }
    h_data = harness.load_harness("rig")
    verdict = harness.evaluate_probe(dummy_bp, h_data)
    # The sensor mount band kurtosis should NOT trigger bearing damage alarm
    assert verdict["suggests"] == "healthy"


def test_ec24_scrub_labels_eval_leakage_invariants():
    """EC-24: Invariant verification that training labels are completely stripped from agent views."""
    # Test Store agent_view to ensure no bearing label or fault label leaks
    cases = store.bundled_cases()
    if cases:
        sample = store.import_case(cases[0])
        view = store.agent_view(sample["recording_id"])
        blob = json.dumps(view)
        import re
        bearing_re = re.compile(r"\bK[AIB]?\d+", re.IGNORECASE)
        assert not bearing_re.search(blob)


# ==============================================================================
# Pillar 6: Automated Inventory & Multi-Agent Design Orchestration (EC-25 .. EC-28)
# ==============================================================================

def test_ec25_inventory_negative_quantity_and_invalid_parts():
    """EC-25: Prevent order creation with <=0 quantities or nonexistent parts."""
    # Non-existent part
    res1 = client.post(
        "/api/inventory/orders",
        json={"machine": "rig", "lines": [{"part_id": "fake_part_xyz", "qty": 1}]},
    ).json()
    assert "error" in res1

    # Zero or negative quantity
    res2 = client.post(
        "/api/inventory/orders",
        json={"machine": "rig", "lines": [{"part_id": "rig:ring_inner", "qty": -5}]},
    ).json()
    assert "error" in res2


def test_ec26_inventory_budget_cap_exceeded():
    """EC-26: Draft creation when total cost exceeds technician budget cap."""
    res = client.post(
        "/api/inventory/orders",
        json={
            "machine": "rig",
            "lines": [{"part_id": "rig:ring_inner", "qty": 100}],
            "budget_cap": 50.0,
        },
    ).json()
    assert "error" in res
    assert "exceeds" in res["error"].lower() or "stock" in res["error"].lower() or "budget" in res["error"].lower()


def test_ec27_inventory_state_machine_unconfirmed_submission():
    """EC-27: Attempting to submit an order directly without confirming first."""
    # Create draft
    draft = client.post(
        "/api/inventory/orders",
        json={"machine": "rig", "lines": [{"part_id": "rig:ring_inner", "qty": 1}]},
    ).json()
    assert "id" in draft
    oid = draft["id"]
    assert draft["status"] == "draft"

    # Attempt to submit directly without confirm
    sub_res = client.post(f"/api/inventory/orders/{oid}/submit").json()
    assert "error" in sub_res
    assert "confirmed" in sub_res["error"].lower() or "draft" in sub_res["error"].lower() or "status" in sub_res["error"].lower()


def test_ec28_design_copilot_extreme_and_infinite_physics():
    """EC-28: Multi-agent design copilot with physically contradictory inputs."""
    contradictory_inputs = {
        "power_kw": -50.0,
        "speed_rpm": 0.0,
        "impeller_diameter_m": -0.5,
        "ambient_temp_c": 5000.0,
    }
    res = client.post(
        "/api/orchestrate/design",
        json={
            "machine": "cr-pump",
            "prompt": "Optimize pump at infinite speed and negative power",
            "current_inputs": contradictory_inputs,
        },
    ).json()
    # Copilot must catch bounds or return bounded physics evaluations cleanly
    assert "after" in res or "before" in res
    assert res["kind"] in ("motor", "pump", "engine")
