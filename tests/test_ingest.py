"""Pack ingestion validation tests (expansion Phase 2)."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run_validate(packdir: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "scripts/ingest_manual.py", "validate", str(packdir)],
        capture_output=True, text=True, cwd=ROOT)


def make_pack(tmp_path: Path) -> Path:
    """Minimal valid pack fixture."""
    pack = tmp_path / "pack"
    (pack / "excerpts").mkdir(parents=True)
    src = tmp_path / "manual.pdf"
    src.write_bytes(b"%PDF-1.4 fake")
    (pack / "pack.json").write_text(json.dumps({
        "machine": "t", "name": "T", "kind": "pump",
        "sources": [{"title": "M", "file": str(src.relative_to(ROOT))
                     if src.is_relative_to(ROOT) else str(src)}]}), encoding="utf-8")
    (pack / "excerpts" / "a.md").write_text(
        "# T\n\n> Source: M, section 1, manual pp. 1.\n\nBody with worn pump.\n", encoding="utf-8")
    (pack / "components.json").write_text(json.dumps([
        {"id": "root", "name": "R", "parent": None, "role": "Base part.",
         "role_source": "manual", "service_ref": "M p. 1"},
        {"id": "leaf", "name": "L", "parent": "root", "role": "Child part.",
         "role_source": "standard", "service_ref": "M p. 2"}]), encoding="utf-8")
    (pack / "playbooks.json").write_text(json.dumps([
        {"id": "pb", "symptom": "S", "source": "M",
         "checks": [{"id": "c", "ask": "Q?", "if_ok": "done", "if_bad": "fix"}]}]), encoding="utf-8")
    return pack


def test_fixture_pack_valid(tmp_path):
    assert run_validate(make_pack(tmp_path)).returncode == 0


def test_dangling_parent_rejected(tmp_path):
    pack = make_pack(tmp_path)
    comps = json.loads((pack / "components.json").read_text(encoding="utf-8"))
    comps[1]["parent"] = "ghost"
    (pack / "components.json").write_text(json.dumps(comps), encoding="utf-8")
    assert run_validate(pack).returncode == 1


def test_missing_branch_rejected(tmp_path):
    pack = make_pack(tmp_path)
    pbs = json.loads((pack / "playbooks.json").read_text(encoding="utf-8"))
    del pbs[0]["checks"][0]["if_ok"]
    (pack / "playbooks.json").write_text(json.dumps(pbs), encoding="utf-8")
    assert run_validate(pack).returncode == 1


def test_bearing_id_rejected_but_worn_allowed(tmp_path):
    pack = make_pack(tmp_path)
    ex = pack / "excerpts" / "a.md"
    ex.write_text(ex.read_text(encoding="utf-8") + "Bearing KA04 failed.\n", encoding="utf-8")
    assert run_validate(pack).returncode == 1
    ex.write_text(ex.read_text(encoding="utf-8").replace("Bearing KA04 failed.",
                                         "Worn impeller replaced."), encoding="utf-8")
    assert run_validate(pack).returncode == 0


def test_eval_verdict_phrase_rejected(tmp_path):
    pack = make_pack(tmp_path)
    ex = pack / "excerpts" / "a.md"
    ex.write_text(ex.read_text(encoding="utf-8") + "Conclusion: outer-ring damage.\n", encoding="utf-8")
    assert run_validate(pack).returncode == 1


def test_real_cr_pack_content(tmp_path):
    """Curated cr-pump content validates (sources repointed to a stub file)."""
    pack = tmp_path / "cr-pump"
    shutil.copytree(ROOT / "packs" / "cr-pump", pack,
                    ignore=shutil.ignore_patterns("ingest-*.json"))
    stub = tmp_path / "stub.pdf"
    stub.write_bytes(b"%PDF-1.4 stub")
    meta = json.loads((pack / "pack.json").read_text(encoding="utf-8"))
    for src in meta["sources"]:
        src["file"] = str(stub)
    (pack / "pack.json").write_text(json.dumps(meta), encoding="utf-8")
    result = run_validate(pack)
    assert result.returncode == 0, result.stdout
    comps = json.loads((pack / "components.json").read_text(encoding="utf-8"))
    assert len(comps) >= 50
    assert sum(1 for c in comps if c["parent"] is None) == 1
    pbs = json.loads((pack / "playbooks.json").read_text(encoding="utf-8"))
    assert sum(len(pb["checks"]) for pb in pbs) == 30
