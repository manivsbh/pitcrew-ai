"""Guided verification tests: 10 scripted scenarios over pump playbooks."""

import pytest
from fastapi.testclient import TestClient

import backend.app.guide as guide_mod
import backend.app.main as main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _tmp_guides(tmp_path, monkeypatch):
    monkeypatch.setattr(guide_mod, "GUIDES_DIR", str(tmp_path))


def walk(pb_id, script):
    """script: list of (result, action). Returns final view + start view."""
    g = guide_mod.start("cr-pump", pb_id)
    assert "error" not in g, g
    for result, action in script:
        g = guide_mod.answer(g["id"], result, action=action)
        assert "error" not in g, g
    return g


def test_1_all_ok_no_run_follows_next_refs():
    g = walk("pump-no-run", [("ok", "continue")] * 8)
    assert g["done"] is True
    assert [p["check"] for p in g["path"]] == [
        "power", "fuses", "overload", "starter-coil", "controls", "motor",
        "capacitor", "seized"]
    assert "exhausted" in g["outcome"]


def test_2_bad_first_check_stop_shows_remedy():
    g = walk("pump-no-run", [("bad", "stop")])
    assert g["done"] is True
    assert "Reset tripped circuits" in g["outcome"]


def test_3_bad_retry_then_ok():
    g = guide_mod.start("cr-pump", "pump-no-run")
    mid = guide_mod.answer(g["id"], "bad")
    assert mid["done"] is False
    assert mid["current"]["id"] == "power"  # stayed
    assert "remedy" in mid and "Reset tripped" in mid["remedy"]
    assert mid["severe"] is True
    end = guide_mod.answer(g["id"], "ok")
    assert end["current"]["id"] == "fuses"
    assert [p["result"] for p in end["path"]] == ["bad", "ok"]


def test_4_bad_skip_advances():
    g = guide_mod.start("cr-pump", "pump-no-run")
    nxt = guide_mod.answer(g["id"], "bad", action="skip")
    assert nxt["current"]["id"] == "fuses"
    assert nxt["done"] is False


def test_5_bad_last_check_skip_ends_unresolved():
    g = walk("pump-no-run", [("ok", "continue")] * 7 + [("bad", "skip")])
    assert g["done"] is True
    assert "unresolved" in g["outcome"]


def test_6_all_ok_low_performance_nine_checks():
    g = walk("pump-low-performance", [("ok", "continue")] * 9)
    assert g["done"] is True
    assert len(g["path"]) == 9
    assert g["path"][-1]["check"] == "coupling"


def test_7_mixed_cycles_path():
    g = walk("pump-cycles", [("ok", "continue"), ("ok", "continue"),
                             ("bad", "skip"), ("ok", "continue"),
                             ("ok", "continue")])
    assert g["done"] is True
    assert [p["result"] for p in g["path"]] == ["ok", "ok", "bad", "ok", "ok"]


def test_8_bad_trips_protection_middle_then_stop():
    g = walk("pump-trips-protection",
             [("ok", "continue")] * 3 + [("bad", "stop")])
    assert g["done"] is True
    assert "remove the motor" in g["outcome"]


def test_9_invalid_inputs_rejected():
    assert "error" in guide_mod.start("cr-pump", "nope")
    assert "error" in guide_mod.start("nope", "pump-no-run")
    assert "error" in guide_mod.answer("nope", "ok")
    g = guide_mod.start("cr-pump", "pump-cycles")
    assert "error" in guide_mod.answer(g["id"], "maybe")


def test_10_answer_after_done_rejected_and_notes_kept():
    g = walk("pump-cycles", [("ok", "continue")] * 5)
    assert g["done"] is True
    assert "error" in guide_mod.answer(g["id"], "ok")
    g2 = guide_mod.start("cr-pump", "pump-cycles")
    g2 = guide_mod.answer(g2["id"], "ok", note="Switch reads 0V closed.")
    assert g2["path"][0]["note"] == "Switch reads 0V closed."


def test_guide_endpoints():
    pb = client.get("/api/packs/cr-pump/playbooks/pump-no-run").json()
    assert len(pb["checks"]) == 8
    assert "error" in client.get("/api/packs/cr-pump/playbooks/nope").json()
    g = client.post("/api/guide/start", json={"machine": "cr-pump",
                                              "playbook_id": "pump-cycles"}).json()
    assert g["current"]["id"] == "pressure-switch"
    # guides dir is tmp-redirected by the autouse fixture: no cleanup needed
    g2 = client.post(f"/api/guide/{g['id']}/answer",
                     json={"result": "ok"}).json()
    assert g2["current"]["id"] == "level-control"
