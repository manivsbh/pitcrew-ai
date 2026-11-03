"""Tests for Component-Graph + SQLite FTS5 Hybrid RAG."""

from fastapi.testclient import TestClient

import backend.app.rag as rag
from backend.app.main import app

client = TestClient(app)


def test_rag_index_retrieve_and_graph_hop(tmp_path, monkeypatch):
    monkeypatch.setattr(rag, "DB_PATH", str(tmp_path / "rag.db"))
    monkeypatch.setattr(rag, "SOURCES_DIR", str(tmp_path / "sources"))

    n_rig = rag.index_pack("rig")
    n_pump = rag.index_pack("cr-pump")
    assert n_rig["chunks"] >= 7
    assert n_pump["chunks"] >= 50

    st = rag.stats()
    assert st["chunks"] == n_rig["chunks"] + n_pump["chunks"]

    hits = rag.retrieve("cr-pump", "shaft seal leak cartridge", k=5)
    assert hits
    assert any("seal" in h["text"].lower() for h in hits)

    # 1-hop graph boost around ring_outer surfaces neighbors
    g_hits = rag.retrieve("rig", "raceway load", component_id="ring_outer", k=6)
    assert g_hits
    comp_union = {cid for h in g_hits for cid in h.get("components", [])}
    assert comp_union & {"ring_outer", "rollers", "housing"}


def test_rag_verify_quote_strict(tmp_path, monkeypatch):
    monkeypatch.setattr(rag, "DB_PATH", str(tmp_path / "rag.db"))
    rag.index_pack("cr-pump")
    hits = rag.retrieve("cr-pump", "manually rotate pump shaft", k=3)
    assert hits
    real_chunk = hits[0]
    snippet = real_chunk["text"][:45]
    assert rag.verify_quote("cr-pump", real_chunk["source"], snippet)
    assert not rag.verify_quote(
        "cr-pump", real_chunk["source"],
        "Fabricated quantum turbocharger torque 9999 Nm."
    )


def test_rag_api_endpoints(tmp_path, monkeypatch):
    monkeypatch.setattr(rag, "DB_PATH", str(tmp_path / "rag.db"))
    monkeypatch.setattr(rag, "SOURCES_DIR", str(tmp_path / "sources"))
    reidx = client.post("/api/rag/reindex").json()
    assert reidx["stats"]["chunks"] > 100
    res = client.get(
        "/api/rag/search?machine=v6-engine&q=injector+spark+plug&component_id=fuel-injector-1"
    ).json()
    assert res["hits"]
    assert res["machine"] == "v6-engine"
