"""Pack-builder agent flow tests. No model calls (stub factory only)."""

import json
import os
import shutil

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.packbuilder import (apply_edits, assess, extract_candidates,
                                     finalize, reason_with_model)

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


def test_draft_upload_answer_finalize_roundtrip():
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
    comps = json.load(open(tmp_path / "m" / "components.json"))
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
