"""Inventory copilot (P6). SQLite, sandbox-only: no real vendor calls.

Flow: search parts -> draft order (stock + budget validated) -> human
confirm -> simulated submit. Every mutation is audit-logged. All seed data
is clearly marked simulated.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid

DB_PATH = "data/inventory.db"
SANDBOX_NOTE = "sandbox: simulated vendor, no real order is placed"

SCHEMA = """
CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY, machine TEXT NOT NULL, component_id TEXT NOT NULL,
  name TEXT NOT NULL, pos TEXT, sku TEXT NOT NULL, vendor TEXT NOT NULL,
  unit_price REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
  stock_qty INTEGER NOT NULL DEFAULT 0, lead_days INTEGER NOT NULL DEFAULT 7,
  simulated INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, machine TEXT NOT NULL, status TEXT NOT NULL,
  budget_cap REAL, total REAL NOT NULL DEFAULT 0,
  confirmation TEXT, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS order_lines (
  order_id TEXT NOT NULL, part_id TEXT NOT NULL, qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  PRIMARY KEY (order_id, part_id));
CREATE TABLE IF NOT EXISTS audit (
  ts REAL NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  detail TEXT NOT NULL);
"""


def connect(path: str | None = None) -> sqlite3.Connection:
    path = path or DB_PATH
    fresh = not os.path.exists(path)
    if fresh:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    if fresh:
        seed(conn)
    return conn


def _audit(conn: sqlite3.Connection, actor: str, action: str,
           detail: dict) -> None:
    conn.execute("INSERT INTO audit VALUES (?, ?, ?, ?)",
                 (time.time(), actor, action, json.dumps(detail)))


# generator-based seed: wear parts derived from the pack registry so the
# catalog always matches modelled components. Prices/vendors simulated.
SEED_MARKUP = [
    ("shaft-seal", "Seal kit (cartridge + O-rings)", 189.0, 14, 3),
    ("sleeve-oring", "Sleeve O-ring set", 24.5, 30, 2),
    ("base-oring", "Base O-ring", 9.8, 40, 2),
    ("discharge-oring", "Discharge O-ring", 9.8, 40, 2),
    ("disk-oring", "Disk plate O-ring set", 12.0, 25, 2),
    ("impeller-wear-ring", "Impeller wear ring", 58.0, 10, 5),
    ("neck-ring", "Neck (seal) ring", 64.0, 10, 5),
    ("bearing-ring", "Bearing ring", 72.0, 8, 5),
    ("disk-bushing", "Disk plate bushing", 34.0, 12, 4),
    ("impeller", "Stage impeller", 210.0, 4, 10),
    ("chamber-bearing", "Chamber with bearing", 245.0, 3, 10),
    ("compression-spring", "PTFE compression spring set", 18.5, 20, 3),
    ("shaft-lock-nut", "Shaft lock nut", 11.0, 25, 2),
    ("lock-washer", "Lock washer set", 7.5, 25, 2),
    ("coupling-half", "Coupling half (matched pair)", 132.0, 6, 7),
]


def seed(conn: sqlite3.Connection) -> int:
    from .packs import PACKS_DIR
    reg_path = os.path.join(PACKS_DIR, "cr-pump", "components.json")
    names = {}
    if os.path.exists(reg_path):
        with open(reg_path) as f:
            for c in json.load(f):
                names[c["id"]] = (c["name"], c.get("pos"))
    n = 0
    for cid, label, price, stock, lead in SEED_MARKUP:
        if cid not in names:
            continue
        name, pos = names[cid]
        conn.execute(
            "INSERT OR IGNORE INTO parts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (f"cr-pump:{cid}", "cr-pump", cid, f"{name} — {label}", pos,
             f"SIM-{cid.upper()[:12]}", "Demo Supply (simulated)", price,
             "USD", stock, lead, 1))
        n += 1
    _audit(conn, "system", "seed", {"parts": n})
    conn.commit()
    return n


def search(conn: sqlite3.Connection, machine: str, q: str) -> list[dict]:
    like = f"%{q.lower()}%"
    rows = conn.execute(
        "SELECT * FROM parts WHERE machine = ? AND "
        "(LOWER(name) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(component_id) LIKE ?)",
        (machine, like, like, like)).fetchall()
    return [dict(r) for r in rows]


def sync_from_pack(conn: sqlite3.Connection, machine: str,
                   components: list[dict]) -> int:
    """Ensure one catalog row per pack component (unstocked by default).

    INSERT OR IGNORE: never overwrites curated rows (price/stock/vendor).
    New machines are introducible by PDF alone; stocking stays explicit.
    """
    n = 0
    for c in components:
        cid = c.get("id", "")
        if not cid:
            continue
        cur = conn.execute(
            "INSERT OR IGNORE INTO parts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (f"{machine}:{cid}", machine, cid, c.get("name", cid),
             c.get("pos"), f"SIM-{cid.upper()[:12]}",
             "Pack-derived (unstocked)", 0.0, "USD", 0, 7, 1))
        n += cur.rowcount or 0
    if n:
        _audit(conn, "system", "pack_sync", {"machine": machine, "added": n})
        conn.commit()
    return n


def part_for_component(conn: sqlite3.Connection, machine: str,
                       component_id: str) -> dict | None:
    row = conn.execute(
        "SELECT * FROM parts WHERE machine = ? AND component_id = ?",
        (machine, component_id)).fetchone()
    return dict(row) if row else None


def create_draft(conn: sqlite3.Connection, machine: str,
                 lines: list[dict], budget_cap: float | None) -> dict:
    if not lines:
        return {"error": "draft needs at least one line"}
    total = 0.0
    checked = []
    for ln in lines:
        qty = int(ln.get("qty", 0))
        if qty <= 0:
            return {"error": f"bad qty for {ln.get('part_id')}"}
        row = conn.execute("SELECT * FROM parts WHERE id = ?",
                           (ln.get("part_id"),)).fetchone()
        if row is None or row["machine"] != machine:
            return {"error": f"unknown part {ln.get('part_id')}"}
        if qty > row["stock_qty"]:
            return {"error": f"only {row['stock_qty']}x {row['sku']} in stock"}
        total += qty * row["unit_price"]
        checked.append((row["id"], qty, row["unit_price"]))
    if budget_cap is not None and total > budget_cap:
        return {"error": f"total {total:.2f} exceeds budget cap {budget_cap:.2f}"}
    oid = uuid.uuid4().hex[:12]
    conn.execute("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?)",
                 (oid, machine, "draft", budget_cap, round(total, 2), None,
                  time.time()))
    conn.executemany("INSERT INTO order_lines VALUES (?, ?, ?, ?)",
                     [(oid, pid, qty, price) for pid, qty, price in checked])
    _audit(conn, "user", "draft_created",
           {"order": oid, "lines": len(checked), "total": round(total, 2)})
    conn.commit()
    return get_order(conn, oid)


def get_order(conn: sqlite3.Connection, order_id: str) -> dict:
    row = conn.execute("SELECT * FROM orders WHERE id = ?",
                       (order_id,)).fetchone()
    if row is None:
        return {"error": f"unknown order {order_id}"}
    lines = conn.execute(
        "SELECT l.part_id, l.qty, l.unit_price, p.name, p.sku "
        "FROM order_lines l JOIN parts p ON p.id = l.part_id "
        "WHERE l.order_id = ?", (order_id,)).fetchall()
    out = dict(row)
    out["lines"] = [dict(r) for r in lines]
    out["sandbox"] = True
    out["note"] = SANDBOX_NOTE
    return out


def confirm(conn: sqlite3.Connection, order_id: str) -> dict:
    row = conn.execute("SELECT * FROM orders WHERE id = ?",
                       (order_id,)).fetchone()
    if row is None:
        return {"error": f"unknown order {order_id}"}
    if row["status"] != "draft":
        return {"error": f"order is {row['status']}, not draft"}
    conn.execute("UPDATE orders SET status = 'confirmed' WHERE id = ?",
                 (order_id,))
    _audit(conn, "user", "confirmed", {"order": order_id})
    conn.commit()
    return get_order(conn, order_id)


def submit(conn: sqlite3.Connection, order_id: str) -> dict:
    row = conn.execute("SELECT * FROM orders WHERE id = ?",
                       (order_id,)).fetchone()
    if row is None:
        return {"error": f"unknown order {order_id}"}
    if row["status"] != "confirmed":
        return {"error": "order must be confirmed before submit"}
    lines = conn.execute("SELECT * FROM order_lines WHERE order_id = ?",
                         (order_id,)).fetchall()
    for ln in lines:  # re-check stock at submit time
        stock = conn.execute("SELECT stock_qty FROM parts WHERE id = ?",
                             (ln["part_id"],)).fetchone()["stock_qty"]
        if ln["qty"] > stock:
            return {"error": f"stock changed: only {stock}x {ln['part_id']}"}
    for ln in lines:
        conn.execute("UPDATE parts SET stock_qty = stock_qty - ? WHERE id = ?",
                     (ln["qty"], ln["part_id"]))
    conf = "SIM-" + uuid.uuid4().hex[:8].upper()
    conn.execute("UPDATE orders SET status = 'submitted', confirmation = ? "
                 "WHERE id = ?", (conf, order_id))
    _audit(conn, "user", "submitted",
           {"order": order_id, "confirmation": conf})
    conn.commit()
    return get_order(conn, order_id)


def cancel(conn: sqlite3.Connection, order_id: str) -> dict:
    row = conn.execute("SELECT * FROM orders WHERE id = ?",
                       (order_id,)).fetchone()
    if row is None:
        return {"error": f"unknown order {order_id}"}
    if row["status"] == "submitted":
        return {"error": "submitted orders cannot be cancelled (sandbox)"}
    conn.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?",
                 (order_id,))
    _audit(conn, "user", "cancelled", {"order": order_id})
    conn.commit()
    return get_order(conn, order_id)


def audit_trail(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    rows = conn.execute("SELECT * FROM audit ORDER BY ts DESC LIMIT ?",
                        (limit,)).fetchall()
    return [dict(r) for r in rows]
