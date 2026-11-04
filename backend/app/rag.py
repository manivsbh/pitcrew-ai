"""Component-graph hybrid RAG over machine documentation (SQLite FTS5).

No vector service, no network. Every pack's documentation is chunked with
provenance (source file, page, chunk id) and linked to the components it
mentions. Retrieval = FTS5 BM25 ranking + 1-hop component-graph expansion
(the named part, its parent, its children), so asking about a shaft seal
also surfaces the housing torque and the O-rings replaced with it.

Sources per pack (all local or committed; vendor PDFs never leave data/):
- packs/<m>/excerpts/*.md and committed markdown named in pack.json sources
- component cards (name, position, role, failure modes) and playbooks
- data/rag_sources/<m>.json: page texts kept from PDF onboarding

Quotes are verified verbatim against the stored source text, so a citation
either exists in the documentation or is dropped.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3

from .packs import PACKS_DIR

DB_PATH = "data/rag.db"
SOURCES_DIR = "data/rag_sources"
CHUNK_CHARS = 900
CHUNK_OVERLAP = 150
_WS = re.compile(r"\s+")
_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-]{2,}")
_STOP = {
    "the", "and", "for", "with", "what", "how", "does", "this", "that",
    "from", "are", "was", "which", "when", "where", "why", "can", "should",
    "into", "about", "there", "their", "have", "has", "had", "will", "would",
    "your", "you", "our", "its", "any", "all", "not", "but", "out", "off",
    "use", "used", "using", "tell", "show", "need", "needs", "machine",
}
_POS_REF = re.compile(r"\bpos\.?\s*(\d+[a-z]?)\b", re.IGNORECASE)

SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
  chunk_id UNINDEXED, machine UNINDEXED, source UNINDEXED, page UNINDEXED,
  kind UNINDEXED, components UNINDEXED, text,
  tokenize = 'porter unicode61');
CREATE TABLE IF NOT EXISTS sources (
  machine TEXT NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL,
  PRIMARY KEY (machine, source));
"""


def norm(s: str) -> str:
    return _WS.sub(" ", s).strip().lower()


def connect(path: str | None = None) -> sqlite3.Connection:
    path = path or DB_PATH
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


# ---------------------------------------------------------------- chunking

def chunk_text(text: str, max_chars: int = CHUNK_CHARS,
               overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Paragraph-aware chunks with a short character overlap."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    cur = ""
    for p in paras:
        if len(p) > max_chars:  # hard-split very long paragraphs
            if cur:
                chunks.append(cur)
                cur = ""
            step = max_chars - overlap
            for i in range(0, len(p), step):
                chunks.append(p[i:i + max_chars])
            continue
        if len(cur) + len(p) + 2 > max_chars and cur:
            chunks.append(cur)
            cur = cur[-overlap:] + "\n\n" + p if overlap else p
        else:
            cur = f"{cur}\n\n{p}" if cur else p
    if cur:
        chunks.append(cur)
    return chunks


def _name_keys(c: dict) -> list[str]:
    """Match keys for a component: full name, name without parentheses."""
    name = c.get("name", "")
    base = re.sub(r"\(.*?\)", "", name).strip()
    keys = {norm(name), norm(base)}
    return [k for k in keys if len(k) >= 4]


def link_components(text: str, components: list[dict]) -> list[str]:
    """Component ids whose name or position number appears in the text."""
    t = norm(text)
    positions = {m.group(1).lower() for m in _POS_REF.finditer(text)}
    out = []
    for c in components:
        if any(k in t for k in _name_keys(c)):
            out.append(c["id"])
        elif c.get("pos") and str(c["pos"]).lower() in positions:
            out.append(c["id"])
    return out


# ---------------------------------------------------------------- sources

def _pack_json(machine: str, name: str):
    path = os.path.join(PACKS_DIR, machine, name)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _committed_docs(machine: str) -> list[tuple[str, str, int | None]]:
    """(source, text, page) for committed markdown of a pack."""
    out: list[tuple[str, str, int | None]] = []
    exdir = os.path.join(PACKS_DIR, machine, "excerpts")
    if os.path.isdir(exdir):
        for fn in sorted(os.listdir(exdir)):
            if fn.endswith(".md"):
                with open(os.path.join(exdir, fn), encoding="utf-8") as f:
                    out.append((fn, f.read(), None))
    meta = _pack_json(machine, "pack.json") or {}
    repo = os.path.realpath(os.path.join(PACKS_DIR, ".."))
    for src in meta.get("sources", []):
        ref = str(src.get("file", ""))
        if not ref.endswith(".md"):
            continue
        full = os.path.realpath(os.path.join(repo, ref))
        if full.startswith(repo + os.sep) and os.path.isfile(full):
            with open(full, encoding="utf-8") as f:
                out.append((os.path.basename(ref), f.read(), None))
    return out


def save_manual_pages(machine: str, title: str, pages: list[str],
                      sources_dir: str | None = None) -> str:
    """Keep onboarded PDF page texts locally so the pack stays searchable."""
    d = sources_dir or SOURCES_DIR
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f"{machine}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"machine": machine, "title": title, "pages": pages}, f)
    return path


def _manual_pages(machine: str) -> list[tuple[str, str, int | None]]:
    path = os.path.join(SOURCES_DIR, f"{machine}.json")
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    title = data.get("title") or machine
    return [(f"{title} p.{i + 1}", text, i + 1)
            for i, text in enumerate(data.get("pages", [])) if text.strip()]


def _component_cards(components: list[dict]) -> list[tuple[str, str, list[str]]]:
    by_id = {c["id"]: c for c in components}
    cards = []
    for c in components:
        parent = by_id.get(c.get("parent") or "")
        lines = [f"{c['name']}" + (f" (Pos. {c['pos']})" if c.get("pos") else ""),
                 f"Role: {c.get('role', '')}"]
        if parent:
            lines.append(f"Mounted in / child of: {parent['name']}")
        if c.get("failure_modes"):
            lines.append("Documented failure modes: "
                         + "; ".join(c["failure_modes"]))
        cards.append((f"component:{c['id']}", "\n".join(lines), [c["id"]]))
    return cards


def _playbook_docs(playbooks: list[dict]) -> list[tuple[str, str]]:
    out = []
    for pb in playbooks:
        lines = [f"Symptom: {pb.get('symptom', '')}"]
        for ch in pb.get("checks", []):
            lines.append(f"- Check: {ch.get('ask', '')} If bad: "
                         f"{ch.get('if_bad', '')}")
        out.append((f"playbook:{pb.get('id', '')}", "\n".join(lines)))
    return out


# ---------------------------------------------------------------- indexing

def index_pack(machine: str, conn: sqlite3.Connection | None = None) -> dict:
    """(Re)index one pack. Idempotent: the pack's rows are replaced."""
    own = conn is None
    conn = conn or connect()
    components = _pack_json(machine, "components.json") or []
    playbooks = _pack_json(machine, "playbooks.json") or []
    conn.execute("DELETE FROM chunks WHERE machine = ?", (machine,))
    conn.execute("DELETE FROM sources WHERE machine = ?", (machine,))
    n = 0

    def put(source: str, page, kind: str, text: str,
            comps: list[str] | None = None) -> None:
        nonlocal n
        for i, ch in enumerate(chunk_text(text)):
            linked = comps if comps is not None else link_components(
                ch, components)
            conn.execute(
                "INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"{machine}:{source}#{i}", machine, source, page, kind,
                 json.dumps(linked), ch))
            n += 1

    def keep(source: str, text: str) -> None:
        conn.execute("INSERT OR REPLACE INTO sources VALUES (?, ?, ?)",
                     (machine, source, text))

    for source, text, page in _committed_docs(machine):
        keep(source, text)
        put(source, page, "excerpt", text)
    for source, text, page in _manual_pages(machine):
        keep(source, text)
        put(source, page, "manual", text)
    for source, text, comps in _component_cards(components):
        keep(source, text)
        put(source, None, "component", text, comps)
    for source, text in _playbook_docs(playbooks):
        keep(source, text)
        put(source, None, "playbook", text)
    conn.commit()
    if own:
        conn.close()
    return {"machine": machine, "chunks": n}


def index_all(conn: sqlite3.Connection | None = None) -> list[dict]:
    from .packs import list_packs
    own = conn is None
    conn = conn or connect()
    out = [index_pack(p["machine"], conn) for p in list_packs()]
    if own:
        conn.close()
    return out


def backfill_manual_sources(drafts_dir: str = "data/pack_drafts") -> list[str]:
    """Recover page texts for packs finalized before RAG existed."""
    done = []
    if not os.path.isdir(drafts_dir):
        return done
    for fn in sorted(os.listdir(drafts_dir)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(drafts_dir, fn), encoding="utf-8") as f:
            d = json.load(f)
        m = d.get("machine", "")
        if (d.get("status") != "finalized" or not m
                or not os.path.isdir(os.path.join(PACKS_DIR, m))):
            continue
        save_manual_pages(m, d.get("title") or m,
                          (d.get("text") or "").split(chr(12)))
        done.append(m)
    return done


# ---------------------------------------------------------------- retrieval

def _fts_query(q: str) -> str:
    toks = [t.lower() for t in _TOKEN.findall(q)]
    toks = [t for t in toks if t not in _STOP]
    seen: list[str] = []
    for t in toks:
        if t not in seen:
            seen.append(t)
    return " OR ".join(f'"{t}"' for t in seen[:16])


def neighborhood(components: list[dict], ids: list[str]) -> set[str]:
    """Named components plus their parents and children (1 hop)."""
    by_id = {c["id"]: c for c in components}
    out = set()
    for cid in ids:
        if cid not in by_id:
            continue
        out.add(cid)
        p = by_id[cid].get("parent")
        if p:
            out.add(p)
        out.update(c["id"] for c in components if c.get("parent") == cid)
    return out


def retrieve(machine: str, query: str, component_id: str | None = None,
             k: int = 6, conn: sqlite3.Connection | None = None) -> list[dict]:
    """Hybrid retrieval: BM25 hits, boosted and expanded by the part graph."""
    own = conn is None
    conn = conn or connect()
    components = _pack_json(machine, "components.json") or []
    focus = link_components(query, components)
    if component_id:
        focus = [component_id] + [c for c in focus if c != component_id]
    hood = neighborhood(components, focus)
    scored: dict[str, dict] = {}

    fq = _fts_query(query)
    if fq:
        rows = conn.execute(
            "SELECT chunk_id, source, page, kind, components, text, "
            "bm25(chunks) AS s FROM chunks WHERE chunks MATCH ? AND "
            "machine = ? ORDER BY s LIMIT 40", (fq, machine)).fetchall()
        for r in rows:
            comps = json.loads(r["components"])
            boost = 1.5 if hood & set(comps) else 0.0
            scored[r["chunk_id"]] = {
                "chunk_id": r["chunk_id"], "source": r["source"],
                "page": r["page"], "kind": r["kind"], "components": comps,
                "text": r["text"], "score": round(-r["s"] + boost, 4),
                "via": "bm25+graph" if boost else "bm25"}
    if hood:  # graph expansion: chunks linked to the neighborhood
        rows = conn.execute(
            "SELECT chunk_id, source, page, kind, components, text FROM chunks "
            "WHERE machine = ?", (machine,)).fetchall()
        for r in rows:
            if r["chunk_id"] in scored:
                continue
            comps = json.loads(r["components"])
            overlap = hood & set(comps)
            if not overlap:
                continue
            direct = 1.0 if set(focus) & overlap else 0.5
            scored[r["chunk_id"]] = {
                "chunk_id": r["chunk_id"], "source": r["source"],
                "page": r["page"], "kind": r["kind"], "components": comps,
                "text": r["text"], "score": direct, "via": "graph"}
    if own:
        conn.close()
    hits = sorted(scored.values(), key=lambda h: -h["score"])
    return hits[:k]


def verify_quote(machine: str, source: str, quote: str,
                 conn: sqlite3.Connection | None = None,
                 min_len: int = 20) -> bool:
    """True only when the quote appears verbatim (whitespace-normalized)."""
    if len(quote.strip()) < min_len:
        return False
    own = conn is None
    conn = conn or connect()
    row = conn.execute("SELECT text FROM sources WHERE machine = ? AND "
                       "source = ?", (machine, source)).fetchone()
    if own:
        conn.close()
    return bool(row) and norm(quote) in norm(row["text"])


def stats(machine: str | None = None,
          conn: sqlite3.Connection | None = None) -> dict:
    own = conn is None
    conn = conn or connect()
    if machine:
        rows = conn.execute("SELECT kind, COUNT(*) AS n FROM chunks WHERE "
                            "machine = ? GROUP BY kind", (machine,)).fetchall()
    else:
        rows = conn.execute("SELECT kind, COUNT(*) AS n FROM chunks "
                            "GROUP BY kind").fetchall()
    if own:
        conn.close()
    by_kind = {r["kind"]: r["n"] for r in rows}
    return {"machine": machine, "chunks": sum(by_kind.values()),
            "by_kind": by_kind}
