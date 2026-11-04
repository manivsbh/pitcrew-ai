"""Manual -> machine-pack ingestion (expansion Phase 2).

Commands:
  extract <config.json>   PDF sections -> packs/<machine>/excerpts/*.md
  draft-pos <pdf> <pages> position-number mentions -> components draft
  validate <packdir>      enforce packs/SCHEMA.md + pack leakage gate

Raw PDFs stay in data/manuals/ (git-ignored). Only excerpts and curated
JSON are committed.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pypdf import PdfReader  # noqa: E402

# Pack leakage gate: packs have no eval labels, so troubleshooting vocabulary
# is allowed. Only Paderborn bearing IDs and eval verdict phrases are banned.
_PACK_ID_RE = re.compile(r"\bK[AIB]?\d+\b")
_PACK_VERDICT_RE = re.compile(
    r"\b(inner[\s_-]?ring[\s_-]?damage|outer[\s_-]?ring[\s_-]?damage|"
    r"healthy[\s_-]?reference)\b",
    re.IGNORECASE,
)


def read_pages(pdf: Path, start: int, end: int) -> list[tuple[int, str]]:
    """1-based inclusive PDF page range -> [(pageno, text)]."""
    rdr = PdfReader(str(pdf))
    return [(i, rdr.pages[i - 1].extract_text() or "")
            for i in range(start, min(end, len(rdr.pages)) + 1)]


def clean(text: str) -> str:
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text)  # dehyphenate
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def cmd_extract(cfg_path: str) -> None:
    cfg = json.loads(Path(cfg_path).read_text(encoding="utf-8"))
    pdf = ROOT / cfg["pdf"]
    outdir = ROOT / cfg["out"]
    outdir.mkdir(parents=True, exist_ok=True)
    for sec in cfg["sections"]:
        pages = read_pages(pdf, sec["pdf_start"], sec["pdf_end"])
        body = clean("\n".join(t for _, t in pages))
        header = (f"# {sec['title']}\n\n> Source: {cfg['short_title']}, "
                  f"section {sec['section']}, manual pp. {sec['man_pages']}.\n"
                  f"> (File: {cfg['pdf']}, PDF pp. {sec['pdf_start']}-"
                  f"{sec['pdf_end']}.)\n\n")
        (outdir / sec["file"]).write_text(header + body + "\n", encoding="utf-8")
        print(f"wrote {sec['file']} ({len(body)} chars)")


_POS_RE = re.compile(r"\(?\bPos\.?\s+(\d+[a-z]*(?:/[a-z]+)?)\)?", re.IGNORECASE)


def cmd_draft_pos(pdf: str, pages: str) -> None:
    start, end = (int(x) for x in pages.split(":"))
    mentions: dict[str, dict] = {}
    for pageno, text in read_pages(ROOT / pdf, start, end):
        flat = re.sub(r"\s+", " ", text)
        for m in _POS_RE.finditer(flat):
            pos = m.group(1)
            ctx = flat[max(0, m.start() - 90):m.end() + 60].strip()
            d = mentions.setdefault(pos, {"pos": pos, "count": 0,
                                          "contexts": []})
            d["count"] += 1
            if len(d["contexts"]) < 3:
                d["contexts"].append(f"p{pageno}: {ctx}")
    print(json.dumps(sorted(mentions.values(),
                            key=lambda d: (int(re.match(r"\d+",
                                                        d["pos"]).group()),
                                           d["pos"])), indent=1))


def cmd_validate(packdir: str) -> int:
    pack = ROOT / packdir
    errors: list[str] = []
    try:
        meta = json.loads((pack / "pack.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return _fail([f"pack.json unreadable: {e}"])
    for key in ("machine", "name", "kind", "sources"):
        if key not in meta:
            errors.append(f"pack.json missing key: {key}")
    for src in meta.get("sources", []):
        f = ROOT / src.get("file", "")
        if not f.exists():
            errors.append(f"source file missing locally: {src.get('file')}")

    excerpts = sorted((pack / "excerpts").glob("*.md"))
    if not excerpts:
        errors.append("no excerpts/*.md files")
    for ex in excerpts:
        text = ex.read_text(encoding="utf-8")
        if not text.startswith("# "):
            errors.append(f"{ex.name}: must start with '# ' title")
        if "> Source:" not in "\n".join(text.splitlines()[:6]):
            errors.append(f"{ex.name}: missing '> Source:' header line")
        for rx, what in ((_PACK_ID_RE, "bearing ID"),
                         (_PACK_VERDICT_RE, "eval verdict phrase")):
            m = rx.search(text)
            if m:
                errors.append(f"{ex.name}: pack-gate hit ({what}): {m.group(0)!r}")

    try:
        comps = json.loads((pack / "components.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return _fail(errors + [f"components.json unreadable: {e}"])
    ids = set()
    for c in comps:
        for key in ("id", "name", "role", "role_source", "service_ref"):
            if not c.get(key):
                errors.append(f"component {c.get('id', '?')}: missing {key}")
        if c.get("role_source") not in ("manual", "standard"):
            errors.append(f"component {c.get('id')}: bad role_source")
        if c["id"] in ids:
            errors.append(f"duplicate component id: {c['id']}")
        ids.add(c["id"])
    for c in comps:
        p = c.get("parent")
        if p is not None and p not in ids:
            errors.append(f"component {c['id']}: dangling parent {p!r}")

    try:
        playbooks = json.loads((pack / "playbooks.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return _fail(errors + [f"playbooks.json unreadable: {e}"])
    for pb in playbooks:
        if not pb.get("checks"):
            errors.append(f"playbook {pb.get('id')}: no checks")
        for ch in pb.get("checks", []):
            for key in ("id", "ask", "if_ok", "if_bad"):
                if not ch.get(key):
                    errors.append(f"playbook {pb.get('id')}: check "
                                  f"{ch.get('id', '?')} missing {key}")
    return _fail(errors)


def _fail(errors: list[str]) -> int:
    if errors:
        print("INVALID:")
        for e in errors:
            print(" -", e)
        return 1
    print("pack valid")
    return 0


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    if cmd == "extract":
        cmd_extract(*args)
    elif cmd == "draft-pos":
        cmd_draft_pos(*args)
    elif cmd == "validate":
        sys.exit(cmd_validate(*args))
    else:
        sys.exit(f"unknown command: {cmd}")
