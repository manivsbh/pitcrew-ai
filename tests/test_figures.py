"""Figure pipeline spec extractor + job API tests.

No model calls. Subprocess gates run through a stubbed _run_cmd; real
node/Chrome behavior is proven by manual E2E (rig + cr-pump figures).
"""

import json
import os

import pytest
from fastapi.testclient import TestClient

from backend.app import figures
import backend.app.main as main
from backend.app.figures import (build_spec, check_segment_rules,
                                 extract_dimensions, ink_coverage,
                                 parse_capture_output, parse_lines_output,
                                 run_code_gates, run_eval_gate, vision_verdict,
                                 write_spec)
from backend.app.main import app

client = TestClient(app)

SAMPLE = """
> Source: CR Service Manual, Torque table, manual pp. 1.
Coupling Guard Screw ............. 2 Nm
Strap Bolt ...................... 15 Nm
Bearing bore 23.52 mm; gap 22.02 mm at 40 C room.
Eight balls per bearing; 6 vanes per impeller.
All have eight rolling elements.
"""


def test_extract_dimensions_finds_values_with_refs():
    dims = extract_dimensions(
        [{"file": "excerpts/svc-torque-table.md", "text": SAMPLE}])
    by_unit = {}
    for d in dims:
        by_unit.setdefault(d["unit"], []).append(d["value"])
        assert d["ref"] == "excerpts/svc-torque-table.md"
        assert d["context"]
    assert 2 in by_unit["Nm"] and 15 in by_unit["Nm"]
    assert 23.52 in by_unit["mm"] and 22.02 in by_unit["mm"]


def test_extract_dimensions_finds_counts():
    dims = extract_dimensions(
        [{"file": "excerpts/x.md", "text": SAMPLE}])
    counts = {(d["value"], d["unit"]) for d in dims
              if d["kind"] == "count"}
    assert (8, "balls") in counts
    assert (6, "vanes") in counts
    assert (8, "elements") in counts


def test_build_spec_cr_pump_grounded():
    spec = build_spec("cr-pump")
    assert spec["machine"] == "cr-pump"
    assert len(spec["parts"]) == 58
    assert len(spec["dimensions"]) > 0
    # 100% traceability: every number carries its excerpt ref.
    assert all(d["ref"].startswith("excerpts/") for d in spec["dimensions"])
    assert all(d["ref"].startswith("excerpts/") for d in spec["counts"])
    part_ids = {p["id"] for p in spec["parts"]}
    assert len(part_ids) == len(spec["parts"])


def test_build_spec_follows_docs_pack_sources():
    spec = build_spec("rig")
    refs = {d["ref"] for d in spec["dimensions"] + spec["counts"]}
    assert refs == {"docs-pack/excerpts/test-rig-6203-geometry.md"}
    values = {(d["value"], d["unit"]) for d in spec["dimensions"]}
    assert (24.0, "mm") in values
    assert (33.1, "mm") in values
    assert (28.55, "mm") in values
    assert (6.75, "mm") in values


def test_build_spec_unknown_machine():
    assert build_spec("no-such-machine") is None
    assert build_spec("../escape") is None


def test_build_spec_refuses_tiny_packs(tmp_path):
    packs = tmp_path / "packs"
    (packs / "mini").mkdir(parents=True)
    (packs / "mini" / "pack.json").write_text(json.dumps(
        {"machine": "mini", "name": "Mini", "kind": "generic"}))
    (packs / "mini" / "components.json").write_text(json.dumps(
        [{"id": "a", "name": "Ahu", "parent": None}]))
    assert build_spec("mini", packs_dir=str(packs)) is None


def test_write_spec_preserves_author_fields(tmp_path):
    spec = build_spec("rig")
    path = write_spec("rig", spec, figures_dir=str(tmp_path))
    assert os.path.isfile(path)
    authored = dict(spec, concept="Test rig", readout="rpm",
                    honesty=["shoulders illustrative"], status="awaiting_author")
    write_spec("rig", authored, figures_dir=str(tmp_path))
    regen = build_spec("rig")
    path2 = write_spec("rig", regen, figures_dir=str(tmp_path))
    assert path2 == path
    kept = json.load(open(path))
    assert kept["concept"] == "Test rig"
    assert kept["readout"] == "rpm"
    assert kept["honesty"] == ["shoulders illustrative"]
    assert kept["status"] == "awaiting_author"
    assert len(kept["dimensions"]) == len(regen["dimensions"])


LINES_PASS = "line ends: 0 of 164 ends on 20 lines float\nshot x.png\nconsole: clean\n"
LINES_FAIL = ("line ends: 1 of 164 ends on 20 lines float\n"
              "  iso-line hi  start  1.32 px from anything\nshot x.png\n")
CAPTURE_PASS = ("clip 1,2 3x4 · readout \"1 rpm\" · scrolls sideways: no\n"
                "console: clean\n")
CAPTURE_SIDEWAYS = "clip 1,2 3x4 · scrolls sideways: yes\nconsole: clean\n"


def test_parse_lines_output():
    ok, detail = parse_lines_output(LINES_PASS)
    assert ok and "0" in detail
    ok, detail = parse_lines_output(LINES_FAIL)
    assert not ok and "1" in detail
    ok, _ = parse_lines_output("garbage")
    assert not ok


def test_parse_capture_output():
    ok, _ = parse_capture_output(CAPTURE_PASS)
    assert ok
    ok, detail = parse_capture_output(CAPTURE_SIDEWAYS)
    assert not ok and "sideways" in detail
    ok, _ = parse_capture_output("console.error: boom\n")
    assert not ok


def _fake_skill(tmp_path):
    scripts = tmp_path / "scripts"
    scripts.mkdir(exist_ok=True)
    (scripts / "lines.mjs").write_text("// fake\n")
    (scripts / "capture.mjs").write_text("// fake\n")


def _fake_figure(tmp_path, machine="mini"):
    _fake_skill(tmp_path)
    d = tmp_path / machine
    d.mkdir()
    (d / "build.mjs").write_text("// fake\n")
    (d / f"{machine}.html").write_text("<html></html>")
    (d / f"{machine}-light.html").write_text("<html></html>")
    write_spec(machine, build_spec("rig"), figures_dir=str(tmp_path))
    return d


def _stub_run(argv, cwd, timeout):
    s = " ".join(argv)
    if "lines.mjs" in s:
        return {"ok": True, "out": LINES_PASS, "ms": 1}
    if "capture.mjs" in s:
        return {"ok": True, "out": CAPTURE_PASS, "ms": 1}
    return {"ok": True, "out": "wrote x.html", "ms": 1}


def test_run_code_gates_stubbed_pass(tmp_path, monkeypatch):
    _fake_figure(tmp_path)
    monkeypatch.setattr(figures, "_run_cmd", _stub_run)
    gates = run_code_gates("mini", figures_dir=str(tmp_path),
                           skill_dir=str(tmp_path))
    assert gates and all(g["pass"] for g in gates)
    names = [g["gate"] for g in gates]
    assert names == ["toolchain", "build", "determinism", "lines-dark",
                     "lines-light", "capture-dark", "capture-light",
                     "capture-phone", "traceability"]


def test_run_code_gates_missing_build(tmp_path, monkeypatch):
    _fake_skill(tmp_path)
    (tmp_path / "mini").mkdir()
    write_spec("mini", build_spec("rig"), figures_dir=str(tmp_path))
    monkeypatch.setattr(figures, "_run_cmd", _stub_run)
    gates = run_code_gates("mini", figures_dir=str(tmp_path),
                           skill_dir=str(tmp_path))
    by_name = {g["gate"]: g for g in gates}
    assert not by_name["build"]["pass"]
    assert "skip" in by_name["determinism"]["detail"]


def test_figure_job_lifecycle_pass(tmp_path, monkeypatch):
    monkeypatch.setattr(figures, "FIGURES_DIR", str(tmp_path))
    monkeypatch.setattr(main, "model_api_key", lambda: "stub-key")
    monkeypatch.setattr(
        figures, "run_code_gates",
        lambda *a, **k: [{"gate": "toolchain", "pass": True,
                           "detail": "stub", "ms": 1}])
    monkeypatch.setattr(
        figures, "run_eval_gate",
        lambda *a, **k: {"state": "eval_pass",
                          "verdict": {"publish": True, "score": 5,
                                      "reasons": ["stub"], "missing": [],
                                      "artifacts": []},
                          "attempts": 1})
    r = client.post("/api/figures", json={"machine": "cr-pump"})
    assert r.json()["state"] == "awaiting_author"
    job = r.json()["job_id"]
    r = client.post(f"/api/figures/{job}/submit")
    assert r.json()["state"] in ("verifying", "eval", "eval_pass")
    r = client.get(f"/api/figures/{job}")
    assert r.json()["state"] == "eval_pass"
    assert r.json()["gates"][0]["gate"] == "toolchain"
    assert r.json()["verdict"]["score"] == 5
    spec = json.load(open(tmp_path / "cr-pump" / "spec.json"))
    assert spec["status"] == "eval_pass"
    r = client.post(f"/api/figures/{job}/approve")
    assert r.json()["state"] == "published"
    spec = json.load(open(tmp_path / "cr-pump" / "spec.json"))
    assert spec["status"] == "published"


def test_figure_job_lifecycle_fail(tmp_path, monkeypatch):
    monkeypatch.setattr(figures, "FIGURES_DIR", str(tmp_path))
    monkeypatch.setattr(
        figures, "run_code_gates",
        lambda *a, **k: [{"gate": "build", "pass": False,
                           "detail": "boom", "ms": 1}])

    def _no_eval(*a, **k):
        raise AssertionError("eval must not run after code-gate fail")

    monkeypatch.setattr(figures, "run_eval_gate", _no_eval)
    job = client.post("/api/figures", json={"machine": "rig"}).json()["job_id"]
    client.post(f"/api/figures/{job}/submit")
    assert client.get(f"/api/figures/{job}").json()["state"] == "failed"
    spec = json.load(open(tmp_path / "rig" / "spec.json"))
    assert spec["status"] == "awaiting_author"
    assert "error" in client.post(f"/api/figures/{job}/approve").json()


def test_figure_job_eval_fail(tmp_path, monkeypatch):
    monkeypatch.setattr(figures, "FIGURES_DIR", str(tmp_path))
    monkeypatch.setattr(main, "model_api_key", lambda: "stub-key")
    monkeypatch.setattr(
        figures, "run_code_gates",
        lambda *a, **k: [{"gate": "toolchain", "pass": True,
                           "detail": "stub", "ms": 1}])
    monkeypatch.setattr(
        figures, "run_eval_gate",
        lambda *a, **k: {"state": "failed",
                          "verdict": {"publish": False, "score": 2,
                                      "reasons": ["blob"], "missing": [],
                                      "artifacts": []},
                          "attempts": 3})
    job = client.post("/api/figures", json={"machine": "rig"}).json()["job_id"]
    client.post(f"/api/figures/{job}/submit")
    body = client.get(f"/api/figures/{job}").json()
    assert body["state"] == "failed"
    assert body["verdict"]["reasons"] == ["blob"]
    assert "error" in client.post(f"/api/figures/{job}/approve").json()


def test_figure_job_unknown_ids():
    assert "error" in client.post("/api/figures",
                                  json={"machine": "nope"}).json()
    assert "error" in client.post("/api/figures/fg_999/submit").json()
    assert "error" in client.get("/api/figures/fg_999").json()
    assert "error" in client.post("/api/figures/fg_999/approve").json()


def test_figure_job_eval_no_key_fails_closed(tmp_path, monkeypatch):
    def _no_key():
        raise RuntimeError("MODEL_API_KEY is not set in the environment")

    monkeypatch.setattr(figures, "FIGURES_DIR", str(tmp_path))
    monkeypatch.setattr(main, "model_api_key", _no_key)
    monkeypatch.setattr(
        figures, "run_code_gates",
        lambda *a, **k: [{"gate": "toolchain", "pass": True,
                           "detail": "stub", "ms": 1}])
    job = client.post("/api/figures", json={"machine": "rig"}).json()["job_id"]
    client.post(f"/api/figures/{job}/submit")
    body = client.get(f"/api/figures/{job}").json()
    assert body["state"] == "failed"
    assert "unavailable" in " ".join(body["verdict"]["reasons"])


def test_figures_index(tmp_path, monkeypatch):
    monkeypatch.setattr(figures, "FIGURES_DIR", str(tmp_path))
    write_spec("rig", build_spec("rig"), figures_dir=str(tmp_path))
    names = [f["machine"] for f in client.get("/api/figures").json()["figures"]]
    assert "rig" in names


def test_figures_static_mount():
    r = client.get("/figures/rig/spec.json")
    assert r.status_code == 200
    assert r.json()["machine"] == "rig"


def _golden(name):
    with open(f"evals/figures-golden/{name}", "rb") as f:
        return f.read()


def test_ink_coverage_golden():
    assert ink_coverage(_golden("pass-rig-dark.png")) >= 0.02
    assert ink_coverage(_golden("pass-rig-light.png")) >= 0.02
    assert ink_coverage(_golden("fail-blank.png")) < 0.02


def test_check_segment_rules():
    ok, reasons = check_segment_rules(
        [{"area": 20}, {"area": 3}], [1000, 1000], 0.10)
    assert ok and reasons == []
    ok, reasons = check_segment_rules(
        [{"area": 1000000}], [1000, 1000], 0.0)
    assert not ok and len(reasons) == 2
    ok, reasons = check_segment_rules(
        [{"area": 730000}], [1000, 1000], 0.27)
    assert not ok and any("largest" in r for r in reasons)


class _VerdictResp:
    def __init__(self, text):
        self.output_text = text


def _stub_factory(text=None, explode=False):
    class _Client:
        class responses:
            @staticmethod
            def create(**kwargs):
                assert "figure" in kwargs["input"][0]["content"][0]["text"].lower()
                if explode:
                    raise RuntimeError("model down")
                return _VerdictResp(text)
    return lambda: _Client()


def _verdict_args():
    pack = {"components": [{"id": "a", "name": "Whirligig", "pos": None}]}
    spec = {"concept": "a figure", "readout": "rpm",
            "honesty": [], "parts": [{"id": "a"}]}
    seg = {"regions": 4, "largest": 0.02, "ink": 0.10}
    return pack, spec, b"png-bytes", seg


def test_vision_verdict_pass():
    text = json.dumps({"publish": True, "score": 4,
                       "reasons": ["reads as a rig"],
                       "missing": [], "artifacts": []})
    ok, verdict = vision_verdict(*_verdict_args(),
                                 _stub_factory(text))
    assert ok and verdict["score"] == 4


def test_vision_verdict_fail_closed():
    pack, spec, png, seg = _verdict_args()
    ok, verdict = vision_verdict(pack, spec, png, seg,
                                 _stub_factory("not json"))
    assert not ok and "parse" in " ".join(verdict["reasons"]).lower()
    text = json.dumps({"publish": False, "score": 2, "reasons": ["blob"],
                       "missing": [], "artifacts": []})
    ok, _ = vision_verdict(pack, spec, png, seg, _stub_factory(text))
    assert not ok
    ok, _ = vision_verdict(pack, spec, png, seg,
                            _stub_factory(explode=True))
    assert not ok


def test_run_eval_gate_stubbed(tmp_path, monkeypatch):
    d = tmp_path / "rig"
    (d / "shots").mkdir(parents=True)
    (d / "shots" / "gate-desktop-dark.png").write_bytes(
        _golden("pass-rig-dark.png"))
    write_spec("rig", build_spec("rig"), figures_dir=str(tmp_path))
    monkeypatch.setattr(
        figures, "segment_photo",
        lambda data: {"regions": [{"area": 20, "bbox": [1, 2, 3, 4]}],
                      "overlay_b64": "eA==",
                      "image_size": [1000, 1000]})
    text = json.dumps({"publish": True, "score": 5, "reasons": ["ok"],
                       "missing": [], "artifacts": []})
    out = run_eval_gate("rig", _stub_factory(text),
                        figures_dir=str(tmp_path))
    assert out["state"] == "eval_pass"
    assert out["attempts"] == 1
    assert out["verdict"]["score"] == 5
    assert "overlay" in out and out["overlay"].startswith("shots/eval-overlay")


def test_run_eval_gate_segment_fail_skips_vision(tmp_path, monkeypatch):
    d = tmp_path / "rig"
    (d / "shots").mkdir(parents=True)
    (d / "shots" / "gate-desktop-dark.png").write_bytes(
        _golden("fail-blob.png"))
    write_spec("rig", build_spec("rig"), figures_dir=str(tmp_path))
    monkeypatch.setattr(
        figures, "segment_photo",
        lambda data: {"regions": [{"area": 730000, "bbox": [0, 0, 1, 1]}],
                      "overlay_b64": "eA==",
                      "image_size": [1000, 1000]})

    def _no_vision(*a, **k):
        raise AssertionError("vision must not run after segment fail")

    out = run_eval_gate("rig", _no_vision, figures_dir=str(tmp_path))
    assert out["state"] == "failed"
    assert out["attempts"] == 0


def test_run_eval_gate_retries_vision(tmp_path, monkeypatch):
    d = tmp_path / "rig"
    (d / "shots").mkdir(parents=True)
    (d / "shots" / "gate-desktop-dark.png").write_bytes(
        _golden("pass-rig-dark.png"))
    write_spec("rig", build_spec("rig"), figures_dir=str(tmp_path))
    monkeypatch.setattr(
        figures, "segment_photo",
        lambda data: {"regions": [{"area": 20, "bbox": [1, 2, 3, 4]}],
                      "overlay_b64": "eA==",
                      "image_size": [1000, 1000]})
    calls = []
    text = json.dumps({"publish": True, "score": 4, "reasons": ["ok"],
                       "missing": [], "artifacts": []})

    class _Flaky:
        class responses:
            @staticmethod
            def create(**kwargs):
                calls.append(1)
                if len(calls) < 3:
                    raise RuntimeError("flaky")
                return _VerdictResp(text)

    out = run_eval_gate("rig", lambda: _Flaky(), figures_dir=str(tmp_path))
    assert out["state"] == "eval_pass"
    assert out["attempts"] == 3


def test_figures_index_carries_resumable_job(tmp_path, monkeypatch):
    monkeypatch.setattr(figures, "FIGURES_DIR", str(tmp_path))
    write_spec("rig", build_spec("rig"), figures_dir=str(tmp_path))
    write_spec("cr-pump", build_spec("cr-pump"), figures_dir=str(tmp_path))
    monkeypatch.setattr(main, "figure_jobs", {
        "fg_0001": {"state": "failed", "machine": "cr-pump", "gates": []},
        "fg_0002": {"state": "eval_pass", "machine": "cr-pump",
                    "gates": [], "verdict": {"publish": True}},
        "fg_0003": {"state": "awaiting_author", "machine": "rig",
                    "gates": []},
    })
    entries = {f["machine"]: f
               for f in client.get("/api/figures").json()["figures"]}
    assert entries["cr-pump"]["job_id"] == "fg_0002"
    assert entries["cr-pump"]["job_state"] == "eval_pass"
    assert entries["rig"]["job_id"] == "fg_0003"
    assert entries["rig"]["job_state"] == "awaiting_author"
