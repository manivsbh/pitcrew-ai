"""Inventory copilot tests: sandbox draft->confirm->submit + audit."""

import pytest
from fastapi.testclient import TestClient

import backend.app.inventory as inv
import backend.app.main as main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _tmp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(inv, "DB_PATH", str(tmp_path / "inv.db"))


def test_seed_search_and_lookup():
    parts = client.get("/api/inventory/search",
                       params={"machine": "cr-pump", "q": ""}).json()["parts"]
    assert len(parts) == 15
    assert all(p["simulated"] == 1 for p in parts)
    seals = client.get("/api/inventory/search",
                       params={"machine": "cr-pump", "q": "seal"}).json()["parts"]
    assert seals and all("seal" in p["name"].lower() for p in seals)
    part = client.get("/api/inventory/by-component/cr-pump/shaft-seal").json()
    assert part["sku"].startswith("SIM-") and part["sandbox"] is True
    assert "error" in client.get("/api/inventory/by-component/cr-pump/motor").json()


def test_draft_confirm_submit_flow():
    draft = client.post("/api/inventory/orders", json={
        "machine": "cr-pump",
        "lines": [{"part_id": "cr-pump:shaft-seal", "qty": 1},
                  {"part_id": "cr-pump:base-oring", "qty": 2}],
        "budget_cap": 500}).json()
    assert draft["status"] == "draft", draft
    assert draft["total"] == pytest.approx(189.0 + 2 * 9.8)
    assert draft["sandbox"] is True
    oid = draft["id"]
    assert "error" in client.post(f"/api/inventory/orders/{oid}/submit").json()
    assert client.post(f"/api/inventory/orders/{oid}/confirm").json()["status"] == "confirmed"
    sub = client.post(f"/api/inventory/orders/{oid}/submit").json()
    assert sub["status"] == "submitted"
    assert sub["confirmation"].startswith("SIM-")
    assert "error" in client.post(f"/api/inventory/orders/{oid}/submit").json()
    after = client.get("/api/inventory/by-component/cr-pump/shaft-seal").json()
    assert after["stock_qty"] == 13  # 14 - 1


def test_draft_validation():
    over = client.post("/api/inventory/orders", json={
        "machine": "cr-pump",
        "lines": [{"part_id": "cr-pump:impeller", "qty": 99}]}).json()
    assert "in stock" in over["error"]
    poor = client.post("/api/inventory/orders", json={
        "machine": "cr-pump", "budget_cap": 10,
        "lines": [{"part_id": "cr-pump:impeller", "qty": 1}]}).json()
    assert "budget cap" in poor["error"]
    bad = client.post("/api/inventory/orders", json={
        "machine": "cr-pump",
        "lines": [{"part_id": "cr-pump:impeller", "qty": 0}]}).json()
    assert "error" in bad
    unknown = client.post("/api/inventory/orders", json={
        "machine": "cr-pump",
        "lines": [{"part_id": "cr-pump:ghost", "qty": 1}]}).json()
    assert "error" in unknown


def test_cancel_and_audit_trail():
    draft = client.post("/api/inventory/orders", json={
        "machine": "cr-pump",
        "lines": [{"part_id": "cr-pump:disk-oring", "qty": 1}]}).json()
    oid = draft["id"]
    assert client.post(f"/api/inventory/orders/{oid}/cancel").json()["status"] == "cancelled"
    assert "error" in client.post(f"/api/inventory/orders/{oid}/confirm").json()
    d2 = client.post("/api/inventory/orders", json={
        "machine": "cr-pump",
        "lines": [{"part_id": "cr-pump:disk-oring", "qty": 1}]}).json()
    client.post(f"/api/inventory/orders/{d2['id']}/confirm")
    client.post(f"/api/inventory/orders/{d2['id']}/submit")
    assert "error" in client.post(f"/api/inventory/orders/{d2['id']}/cancel").json()
    actions = [a["action"] for a in client.get("/api/inventory/audit").json()["audit"]]
    for expected in ("seed", "draft_created", "cancelled", "confirmed", "submitted"):
        assert expected in actions
