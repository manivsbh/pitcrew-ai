"""Pack-builder agent flow tests. No model calls (stub factory only)."""

import json
import os
import shutil

from fastapi.testclient import TestClient

import backend.app.inventory as inv
from backend.app.main import app
from backend.app.packbuilder import (apply_edits, assess, classify_kind,
                                     extract_candidates, finalize,
                                     merge_vision_candidates,
                                     reason_with_model, select_context)

client = TestClient(app)

SAMPLE = """
Position Number
 7a Coupling Guard Screw .............1.5 ft.-lbs./2 Nm
 9 Coupling Hex Screw
 26b Strap Bolt ......................11 ft.-lbs./15 Nm
Remove the Coupling Bolts (Pos. 9) from the Coupling Halves (Pos. 10a).
Remove shaft pin (Pos. 10). Slide the motor on the Base (Pos. 90).
Exploded view and parts list follow. Step 12 removes the seal.
Bearing bore 23.52 mm; torque 80 Nm; gap 22.02 mm at 40 C room.
"""


def test_extract_candidates():
    cands = extract_candidates(SAMPLE)
    by_pos = {c["pos"]: c["name"] for c in cands if c["pos"]}
    assert by_pos["7a"] == "Coupling Guard Screw"
    assert by_pos["10a"] == "Coupling Halves"
    assert by_pos["90"] == "Base"
    assert len({c["id"] for c in cands}) == len(cands)


PATENT = """FIG. 1 is a longitudinal section through a centrifugal pump.
The pump includes a ‘base mean-s 10, and a case 12 is secured to the base.
A `case wear ring 16 is supported by the case. A front bearing means 100 is
supported between portion 34 and the shaft. An oil seal 66 engages the end
portion 70 of the shaft, and a seal with said retainer 190 is formed."""


def test_extract_candidates_reads_patent_reference_numerals():
    by_pos = {c["pos"]: c["name"] for c in extract_candidates(PATENT)}
    assert by_pos["12"] == "Case"
    assert by_pos["16"] == "Case Wear Ring"
    assert by_pos["100"] == "Front Bearing"
    assert by_pos["66"] == "Oil Seal"
    assert "34" not in by_pos and "70" not in by_pos


def test_select_context_keeps_part_dense_passages_within_budget():
    filler = "General history of pumping in the region. " * 400
    text = filler + PATENT + filler
    ctx = select_context(text, budget=2000)
    assert len(ctx) <= 2100
    assert "case wear ring 16" in ctx
    assert select_context(PATENT) == PATENT


def test_assess_scores_evidence():
    rich = assess(extract_candidates(SAMPLE), SAMPLE)
    assert rich["score"] >= 50
    thin = assess([], "hello world")
    assert thin["score"] < 30
    assert thin["questions"]


class _StubResp:
    output_text = json.dumps({
        "verdict": "enough", "confidence": 0.9, "summary": "Good list.",
        "questions": ["Confirm parents?"], "drop": [],
        "parents": {"base": None}, "roles": {"base": "Holds the pump."}})


class _StubClient:
    class responses:
        @staticmethod
        def create(**kwargs):
            assert kwargs["reasoning"] == {"effort": "low"}
            return _StubResp()


def test_reason_with_model_stub():
    review = reason_with_model(SAMPLE, extract_candidates(SAMPLE),
                               lambda: _StubClient())
    assert review["verdict"] == "enough"
    assert review["roles"]["base"].startswith("Holds")


def test_answers_add_dimensions_and_reach_the_model(monkeypatch):
    monkeypatch.setattr("backend.app.packbuilder.save_draft", lambda d: None)
    draft = {"candidates": extract_candidates(PATENT), "dimensions": {}}
    apply_edits(draft, [], [], "Impeller diameter 250 mm, shaft 45 mm, 1750 rpm.")
    assert draft["dimensions"] == {"impeller_diameter_mm": 250.0,
                                   "shaft_diameter_mm": 45.0,
                                   "rated_rpm": 1750.0}
    seen = {}

    class Client:
        class responses:
            @staticmethod
            def create(**kwargs):
                seen["input"] = kwargs["input"]
                return _StubResp()

    reason_with_model(PATENT, draft["candidates"], lambda: Client(),
                      answers=draft["answers"])
    assert "Impeller diameter 250 mm" in seen["input"]


def test_vision_names_replace_ocr_names_at_the_same_callout():
    draft = {"candidates": [{"id": "rods", "name": "Rods", "pos": "236",
                             "mentions": 2}], "text": PATENT}
    merge_vision_candidates(draft, {"extracted_components": [
        {"name": "Push Rod", "pos": "236"},
        {"name": "Elongated Shaft", "pos": "72"}]})
    by_pos = {c["pos"]: c for c in draft["candidates"]}
    assert len(draft["candidates"]) == 2
    assert by_pos["236"]["name"] == "Push Rod" and by_pos["236"]["id"] == "rods"
    assert by_pos["72"]["name"] == "Elongated Shaft"


def test_reason_retries_once_on_unparseable_reply():
    replies = iter(["Here you go: {verdict: enough, oops",
                    'Sure.\n```json\n{"verdict": "enough", "confidence": 0.9}\n```\nDone {x}'])
    calls = []

    class Client:
        class responses:
            @staticmethod
            def create(**kwargs):
                calls.append(1)
                return type("R", (), {"output_text": next(replies), "usage": None})()

    review = reason_with_model(PATENT, [], lambda: Client())
    assert len(calls) == 2
    assert review["verdict"] == "enough" and review["confidence"] == 0.9


def test_layout_from_drawing_attaches_by_callout_and_gaps_fill_from_assembly():
    from backend.app.packbuilder import (_clean_layout, fill_layout_from_assembly,
                                         fill_layout_from_text)
    layout = _clean_layout([
        {"pos": "138", "cx": -0.2, "cy": 0.6, "w": 0.1, "h": 0.4, "axis": "horizontal",
         "revolved": True, "shape": "impeller", "mount": None},
        {"pos": "76", "cx": 0.9, "cy": 0.5, "w": 0.05, "h": 2, "shape": "teapot",
         "mount": {"on": "", "as": "bolt_circle"}},
        {"pos": "100", "x": 0.55, "len": 0.08, "d": 0.3, "axial": True},
        {"pos": "10", "cx": "bad", "cy": 0.5},
        {"cx": 0.5, "cy": 0.5}])
    assert [e["pos"] for e in layout] == ["138", "76", "100"]
    assert layout[0]["cx"] == 0.0 and layout[0]["shape"] == "impeller"
    assert layout[1]["h"] == 1.0 and "shape" not in layout[1] and "mount" not in layout[1]
    assert layout[2]["cx"] == 0.55 and layout[2]["axis"] == "horizontal"
    draft = {"candidates": [{"id": "impeller", "name": "Impeller", "pos": "138"},
                            {"id": "rear-bearing", "name": "Rear Bearing", "pos": "76"},
                            {"id": "case", "name": "Case", "pos": "12"}],
             "text": PATENT}
    merge_vision_candidates(draft, {"layout": layout,
                                    "drawing": {"view": "section", "main_axis": "horizontal"}})
    by_id = {c["id"]: c for c in draft["candidates"]}
    assert by_id["impeller"]["layout"]["source"] == "drawing"
    assert draft["drawing"]["main_axis"] == "horizontal"
    assert "layout" not in by_id["case"]
    comps = [dict(c) for c in draft["candidates"]]
    fill_layout_from_assembly(comps, [{"caption": "a", "parts": ["case"]},
                                      {"caption": "b", "parts": ["rear-bearing"]}],
                              "vertical")
    case = next(c for c in comps if c["id"] == "case")
    assert case["layout"]["source"] == "assembly-order"
    assert case["layout"]["axis"] == "vertical" and case["layout"]["cx"] == 0.5
    assert next(c for c in comps if c["id"] == "rear-bearing")["layout"]["cx"] == 0.9

    hw = [{"id": "front-bearing", "name": "Front Bearing", "pos": "100",
           "layout": {"cx": 0.55, "cy": 0.5, "w": 0.08, "h": 0.1, "axis": "horizontal",
                      "revolved": True}},
          {"id": "lock-nut", "name": "Lock Nut", "pos": "110"}]
    fill_layout_from_text(hw, "A lock nut 110 maintains the bearing means 100 in place.")
    assert hw[1]["layout"]["mount"] == {"on": "100", "as": "shaft_ring"}
    assert hw[1]["layout"]["source"] == "text-anchor"


def test_reason_fallback_never_raises():
    def boom():
        raise RuntimeError("no network")
    review = reason_with_model(SAMPLE, [], boom)
    assert review["verdict"] == "needs_info"
    assert review["confidence"] == 0.0


def make_pdf(lines: list[str]) -> bytes:
    """Minimal one-page PDF with the given text lines."""
    esc = [ln.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
           for ln in lines]
    ops = "BT /F1 12 Tf 72 720 Td " + " 0 -14 Td ".join(f"({ln}) Tj" for ln in esc) + " ET"
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(ops)).encode() + b" >>\nstream\n"
        + ops.encode() + b"\nendstream",
    ]
    out = [b"%PDF-1.4\n"]
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(sum(len(x) for x in out))
        out.append(f"{i} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = sum(len(x) for x in out)
    out.append(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.append(f"{off:010d} 00000 n \n".encode())
    out.append(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\n"
               f"startxref\n{xref}\n%%EOF\n".encode())
    return b"".join(out)


PDF_LINES = [
    "7a Coupling Guard Screw .............2 Nm",
    "9 Coupling Hex Screw ................13 Nm",
    "Remove the Coupling Bolts (Pos. 9) from the Coupling Halves (Pos. 10a).",
    "Remove shaft pin (Pos. 10). Slide parts on the Base (Pos. 90).",
    "Fit the Outer Sleeve (Pos. 55) over the stack.",
    "Exploded view and parts list. Step 12 removes the seal.",
]


def test_draft_upload_answer_finalize_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(inv, "DB_PATH", str(tmp_path / "inv.db"))
    pdf = make_pdf(PDF_LINES)
    r = client.post("/api/packs/draft",
                    data={"machine": "test-m", "title": "Test Manual"},
                    files={"file": ("m.pdf", pdf, "application/pdf")})
    assert "error" not in r.json(), r.json()
    draft_id = r.json()["id"]
    assert r.json()["assessment"]["n_candidates"] >= 5
    try:
        cands = r.json()["candidates"]
        drop_id = cands[0]["id"]
        keep_id = cands[1]["id"]
        r2 = client.post(f"/api/packs/draft/{draft_id}/answer",
                         json={"edits": [{"id": drop_id, "drop": True},
                                         {"id": keep_id, "parent": None}],
                               "new_components": [{"name": "Extra Gasket"}]})
        ids = {c["id"] for c in r2.json()["candidates"]}
        assert drop_id not in ids and "extra-gasket" in ids
        r3 = client.post(f"/api/packs/draft/{draft_id}/finalize")
        assert r3.json()["machine"] == "test-m", r3.json()
        assert r3.json()["inventory_added"] == r3.json()["components"]
        part = client.get(
            f"/api/inventory/by-component/test-m/{keep_id}").json()
        assert part["stock_qty"] == 0 and "unstocked" in part["vendor"].lower()
        pack = client.get("/api/packs/test-m").json()
        assert len(pack["components"]) == r3.json()["components"]
        r4 = client.post(f"/api/packs/draft/{draft_id}/finalize")
        assert "error" in r4.json()
    finally:
        shutil.rmtree("packs/test-m", ignore_errors=True)
        if os.path.exists(f"data/pack_drafts/{draft_id}.json"):
            os.remove(f"data/pack_drafts/{draft_id}.json")


def test_draft_errors():
    assert "error" in client.get("/api/packs/draft/nope").json()
    r = client.post("/api/packs/draft", data={"machine": "x", "title": "y"},
                    files={"file": ("m.txt", b"nope", "text/plain")})
    assert "error" in r.json()


def test_finalize_unit_validates(tmp_path):
    draft = {"id": "u1", "machine": "m", "title": "T", "status": "draft",
             "candidates": [{"id": "a", "name": "A", "pos": None}],
             "review": None, "edits": []}
    try:
        finalize(draft, packs_dir=str(tmp_path))
    except ValueError as e:
        assert "at least 3" in str(e)
    else:
        raise AssertionError("expected ValueError")
    draft["candidates"] += [{"id": "b", "name": "B", "pos": "2"},
                            {"id": "c", "name": "C", "pos": None,
                             "parent": "zz"}]
    out = finalize(draft, packs_dir=str(tmp_path))
    assert out["components"] == 3
    comps = json.load(open(tmp_path / "m" / "components.json", encoding="utf-8"))
    assert all(c["role"] for c in comps)
    assert [c for c in comps if c["id"] == "c"][0]["parent"] is None


def test_apply_edits_drops_and_reparents(tmp_path):
    draft = {"id": "e1", "machine": "m", "title": "T", "status": "draft",
             "text": "", "candidates": [
                 {"id": "a", "name": "A", "pos": None},
                 {"id": "b", "name": "B", "pos": "2"}],
             "assessment": {}, "review": None, "edits": []}
    import backend.app.packbuilder as pb
    old = pb.DRAFTS_DIR
    pb.DRAFTS_DIR = str(tmp_path)
    try:
        out = apply_edits(draft, [{"id": "a", "drop": True},
                                  {"id": "b", "name": "B2",
                                   "parent": None}], [])
        assert [c["id"] for c in out["candidates"]] == ["b"]
        assert out["candidates"][0]["name"] == "B2"
    finally:
        pb.DRAFTS_DIR = old


def test_classify_kind():
    pump = [{"id": "a", "name": "Stage Impeller"}, {"id": "b", "name": "Pump Shaft"}]
    assert classify_kind(pump) == "pump"
    eng = [{"id": "a", "name": "Piston"}, {"id": "b", "name": "Crankshaft"}]
    assert classify_kind(eng) == "engine"
    rig = [{"id": "a", "name": "Test Bearing Inner Ring"},
           {"id": "b", "name": "Load Motor"}]
    assert classify_kind(rig) == "bearing-rig"
    assert classify_kind([{"id": "a", "name": "Widget Bracket"}]) == "generic"
    assert classify_kind([]) == "generic"


def test_finalize_writes_kind_and_override(tmp_path):
    base = {"id": "k1", "machine": "m", "title": "T", "status": "draft",
            "candidates": [{"id": "impeller", "name": "Impeller", "pos": "1"},
                           {"id": "shaft", "name": "Shaft", "pos": "2"},
                           {"id": "seal", "name": "Seal", "pos": "3"}],
            "edits": []}
    d1 = dict(base, review=None)
    out = finalize(d1, packs_dir=str(tmp_path))
    assert out["kind"] == "pump"
    pack = json.load(open(tmp_path / "m" / "pack.json", encoding="utf-8"))
    assert pack["kind"] == "pump"
    d2 = dict(base, id="k2", machine="m2", review={"kind": "engine"})
    out2 = finalize(d2, packs_dir=str(tmp_path))
    assert out2["kind"] == "engine"
    d3 = dict(base, id="k3", machine="m3", review={"kind": "bogus"})
    assert finalize(d3, packs_dir=str(tmp_path))["kind"] == "pump"


def test_inventory_backfill(tmp_path, monkeypatch):
    monkeypatch.setattr(inv, "DB_PATH", str(tmp_path / "inv.db"))
    r = client.post("/api/inventory/backfill").json()
    assert r["added"] > 100, r
    assert set(r["per_machine"]) >= {"rig", "cr-pump", "v6-engine"}
    r2 = client.post("/api/inventory/backfill").json()
    assert r2["added"] == 0
    part = client.get("/api/inventory/by-component/rig/shaft").json()
    assert part["machine"] == "rig"


def test_derive_assembly_orders_roots_first():
    from backend.app.packbuilder import derive_assembly, derive_scenarios
    comps = [{"id": "base", "name": "Base", "pos": "90", "parent": None},
             {"id": "seal", "name": "Shaft Seal", "pos": "5", "parent": "base"},
             {"id": "bolt", "name": "Bolt", "pos": "1", "parent": "seal"}]
    asm = derive_assembly(comps)
    assert [s["parts"] for s in asm["order"]] == [["base"], ["seal"], ["bolt"]]
    assert "Pos. 90" in asm["order"][0]["caption"]
    scn = derive_scenarios(comps, "pump", "T")
    assert scn[0]["id"] == "healthy"
    leak = [s for s in scn if s["id"] == "seal-leak"][0]
    assert leak["parts"] == ["seal"] and leak["illustrative"] is True
    assert all("Illustrative" in s["note"] for s in scn)
    assert derive_scenarios(comps, "bogus-kind", "T")[1]["id"] == "wear"


def test_extract_strips_detach_verbs():
    cands = extract_candidates("Unclip Fuel Rail L (Pos. 12) then seat it.")
    assert [(c["id"], c["name"]) for c in cands] == [
        ("fuel-rail-l", "Fuel Rail L")]


def test_answer_kind_override():
    pdf = make_pdf(PDF_LINES)
    r = client.post("/api/packs/draft",
                    data={"machine": "kind-m", "title": "K"},
                    files={"file": ("m.pdf", pdf, "application/pdf")})
    draft_id = r.json()["id"]
    try:
        bad = client.post(f"/api/packs/draft/{draft_id}/answer",
                          json={"edits": [], "kind": "bogus"})
        assert "error" in bad.json()
        good = client.post(f"/api/packs/draft/{draft_id}/answer",
                           json={"edits": [], "kind": "engine"})
        assert good.json()["review"]["kind"] == "engine"
    finally:
        if os.path.exists(f"data/pack_drafts/{draft_id}.json"):
            os.remove(f"data/pack_drafts/{draft_id}.json")


def test_end_on_parts_keep_depth_axis_through_upright():
    from backend.app import layout as L
    e = L.clean_entry({"cx": 0.2, "cy": 0.4, "w": 0.1, "h": 0.1, "axis": "depth",
                       "revolved": True, "shape": "gear"})
    comps = [{"name": "Gear", "layout": e}]
    drawing = {"up": "left", "main_axis": "depth"}
    assert L.upright(comps, drawing) == "cw"
    assert comps[0]["layout"]["axis"] == "depth" and drawing["main_axis"] == "depth"


def test_review_records_model_version_and_usage():
    from backend.app.packbuilder import REVIEW_PROMPT_VERSION, reason_with_model
    from backend.app.config import MODEL_ID
    good = reason_with_model("t", [{"id": "a", "name": "A", "pos": "1"}],
                             lambda: _StubClient())
    assert good["model_id"] == MODEL_ID
    assert good["prompt_version"] == REVIEW_PROMPT_VERSION
    assert good["usage"] == {"input_tokens": 0, "output_tokens": 0}

    def boom():
        raise RuntimeError("nope")
    bad = reason_with_model("t", [], boom)
    assert bad["verdict"] == "needs_info"
    assert bad["prompt_version"] == REVIEW_PROMPT_VERSION
