"""Meta eyes verification: patch validation, skills schema, round cap. No network."""

import io
import json
from types import SimpleNamespace

import pytest
from PIL import Image

from backend.app import render_verify as RV


def _components():
    return [
        {"id": "front-bearing", "name": "Front Bearing", "pos": "100",
         "layout": {"cx": 0.55, "cy": 0.5, "w": 0.08, "h": 0.1, "axis": "horizontal",
                    "revolved": True, "source": "drawing"}},
        {"id": "lock-nut", "name": "Lock Nut", "pos": "110",
         "layout": {"cx": 0.2, "cy": 0.3, "w": 0.02, "h": 0.02, "axis": "horizontal",
                    "revolved": False, "source": "text-anchor"}},
        {"id": "washer", "name": "Washer", "pos": "38",
         "layout": {"cx": 0.4, "cy": 0.5, "w": 0.06, "h": 0.06, "axis": "horizontal",
                    "revolved": True, "source": "assembly-order"}},
        {"id": "ear", "name": "Ear", "pos": "312",
         "layout": {"cx": 0.6, "cy": 0.6, "w": 0.02, "h": 0.02, "axis": "none",
                    "revolved": False, "source": "drawing"}},
    ]


def test_patch_touches_only_known_callouts_and_clamps_values():
    comps = _components()
    changes = RV.apply_patch(comps, [
        {"pos": "100", "verdict": "move", "cx": 1.7, "cy": -2, "w": 0.1, "h": 0.2,
         "shape": "bearing", "region": 4},
        {"pos": "999", "verdict": "hide"},
        {"pos": "110", "verdict": "attach", "mount": {"on": "100", "as": "shaft_ring"}},
        {"pos": "312", "verdict": "hide"},
        {"pos": "38", "verdict": "keep", "region": None},
        {"pos": "100", "verdict": "explode"},
    ], sam_ran=True)
    by = {c["pos"]: c for c in comps}
    assert by["100"]["layout"]["cx"] == 1.0 and by["100"]["layout"]["cy"] == 0.0
    assert by["100"]["layout"]["source"] == "vision-verified" and by["100"]["layout"]["region"] == 4
    assert by["110"]["layout"]["mount"] == {"on": "100", "as": "shaft_ring"}
    assert "layout" not in by["312"] and by["312"]["hidden_reason"].startswith("vision")
    assert "layout" not in by["38"]
    assert {c["pos"] for c in changes} == {"100", "110", "312", "38"}


def test_attach_rejects_unknown_or_self_targets_and_bad_mounts():
    comps = _components()
    changes = RV.apply_patch(comps, [
        {"pos": "110", "verdict": "attach", "mount": {"on": "555", "as": "shaft_ring"}},
        {"pos": "110", "verdict": "attach", "mount": {"on": "110", "as": "shaft_ring"}},
        {"pos": "110", "verdict": "attach", "mount": {"on": "100", "as": "welded"}},
    ], sam_ran=False)
    assert changes == [] and "mount" not in comps[1]["layout"]


def test_skills_are_schema_checked_deduplicated_and_toggleable(tmp_path):
    path = str(tmp_path / "skills.json")
    added = RV.add_skills([
        {"when": {"name_regex": "lock ?(nut|washer)", "near_shape": "bearing"},
         "then": {"mount_as": "shaft_ring"}, "reason": "Lock hardware sits on the shaft."},
        {"when": {"name_regex": "(unclosed"}, "then": {"shape": "ring"}},
        {"when": {"name_regex": "gear"}, "then": {"shape": "teapot"}},
        {"when": {"name_regex": "gear"}, "then": {"shape": "gear"}},
    ], "resp_1", path)
    assert [s["then"] for s in added] == [{"mount_as": "shaft_ring"}, {"shape": "gear"}]
    assert added[0]["when"]["near_shape"] == "bearing"
    again = RV.add_skills([{"when": {"name_regex": "gear"}, "then": {"shape": "gear"}}],
                          "resp_2", path)
    assert again == []
    assert RV.toggle_skill(added[1]["id"], False, path)["enabled"] is False
    assert [s["enabled"] for s in RV.load_skills(path)] == [True, False]


class _Client:
    def __init__(self, reply):
        self.reply = reply
        self.seen = None

    @property
    def responses(self):
        outer = self

        class R:
            @staticmethod
            def create(**kwargs):
                outer.seen = kwargs
                return SimpleNamespace(id="resp_v1", output_text=json.dumps(outer.reply), usage=None)
        return R


def test_verify_round_writes_patch_log_and_skills(tmp_path, monkeypatch):
    pack = tmp_path / "pumpy"
    pack.mkdir()
    (pack / "pack.json").write_text(json.dumps(
        {"machine": "pumpy", "name": "Pumpy", "kind": "pump",
         "drawing": {"view": "section", "main_axis": "horizontal", "image": "drawing.jpg"}}),
        encoding="utf-8")
    (pack / "components.json").write_text(json.dumps(_components()), encoding="utf-8")
    (pack / "drawing.jpg").write_bytes(b"fake-jpeg")
    monkeypatch.setattr(RV, "PACKS_DIR", str(tmp_path))
    client = _Client({"score": 3, "issues": ["Ear floats above the casing"],
                      "parts": [{"pos": "312", "verdict": "hide"}],
                      "skills": [{"when": {"name_regex": "\\bear\\b"}, "then": {"hide": True}}]})
    seg = lambda b: {"regions": [{"id": 0, "bbox": [0, 0, 5, 5]}], "overlay_b64": "b3ZlcmxheQ=="}
    out = RV.verify("pumpy", "data:image/png;base64,cmVuZGVy", lambda: client, 1,
                    seg_fn=seg, skills_path=str(tmp_path / "skills.json"))
    assert out["score"] == 3 and out["again"] is True and out["sam_regions"] == 1
    assert [c["pos"] for c in out["changes"]] == ["312"]
    content = client.seen["input"][0]["content"]
    assert [c["type"] for c in content] == ["input_text", "input_image", "input_image"]
    log = json.loads((pack / "verification.json").read_text(encoding="utf-8"))
    assert log["rounds"][0]["response_id"] == "resp_v1"
    saved = json.loads((pack / "components.json").read_text(encoding="utf-8"))
    assert "layout" not in next(c for c in saved if c["pos"] == "312")
    assert RV.verify("pumpy", b"x", lambda: client, 3)["error"].startswith("at most")


def test_round_that_lowers_the_score_restores_the_previous_layout(tmp_path, monkeypatch):
    pack = tmp_path / "pumpy"
    pack.mkdir()
    (pack / "pack.json").write_text(json.dumps({"machine": "pumpy", "name": "P"}), encoding="utf-8")
    (pack / "components.json").write_text(json.dumps(_components()), encoding="utf-8")
    monkeypatch.setattr(RV, "PACKS_DIR", str(tmp_path))
    skills = str(tmp_path / "skills.json")
    first = _Client({"score": 3, "parts": [{"pos": "312", "verdict": "hide"}]})
    assert RV.verify("pumpy", b"x", lambda: first, 1, skills_path=skills)["again"] is True
    worse = _Client({"score": 1, "parts": [{"pos": "100", "verdict": "hide"}]})
    out = RV.verify("pumpy", b"x", lambda: worse, 2, skills_path=skills)
    assert out["reverted"] is True and out["changes"] == [] and out["again"] is False
    saved = json.loads((pack / "components.json").read_text(encoding="utf-8"))
    assert saved == _components()


def test_upright_image_uses_the_same_turn_as_the_layout():
    im = Image.new("RGB", (64, 32), "white")
    for x in range(16):
        for y in range(16):
            im.putpixel((x, y), (255, 0, 0))
    raw = io.BytesIO()
    im.save(raw, format="PNG")
    same = RV.upright_image(raw.getvalue(), None)
    assert same == raw.getvalue()
    turned = Image.open(io.BytesIO(RV.upright_image(raw.getvalue(), "cw")))
    assert turned.size == (32, 64)
    assert turned.getpixel((28, 4))[0] > 200 and turned.getpixel((28, 4))[1] < 40
    assert turned.getpixel((2, 4))[1] > 200


def test_parse_reply_keeps_a_score_cut_off_mid_part():
    text = ('{"score": 3, "issues": ["ear floats"], "parts": '
            '[{"pos": "312", "verdict": "hide"}, '
            '{"pos": "110", "verdict": "move", "cx": 0.2')
    data = RV.parse_reply(text)
    assert data["score"] == 3
    assert data["parts"] == [{"pos": "312", "verdict": "hide"}]


def test_verify_rejects_path_tricks():
    with pytest.raises(ValueError):
        RV.verify("../etc", b"x", lambda: None)
