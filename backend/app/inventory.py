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
    else:
        _upgrade_hero_stock(conn)
    return conn


def _upgrade_hero_stock(conn: sqlite3.Connection) -> None:
    """Ensure curated hero packs (rig, v6-engine, demo-pump) have seeded stock
    even on databases created before multi-machine seeding landed."""
    for machine, items in MULTI_MACHINE_SEED.items():
        for cid, label, price, stock, lead in items:
            pid = f"{machine}:{cid}"
            row = conn.execute("SELECT vendor, stock_qty FROM parts WHERE id = ?",
                               (pid,)).fetchone()
            if row is None:
                conn.execute(
                    "INSERT OR IGNORE INTO parts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (pid, machine, cid, f"{cid.replace('-', ' ').title()} — {label}",
                     None, f"SIM-{cid.upper()[:12]}", "Demo Supply (simulated)",
                     price, "USD", stock, lead, 1))
            elif row["vendor"] == "Pack-derived (unstocked)" and row["stock_qty"] == 0:
                conn.execute(
                    "UPDATE parts SET unit_price = ?, stock_qty = ?, "
                    "lead_days = ?, vendor = ? WHERE id = ?",
                    (price, stock, lead, "Demo Supply (simulated)", pid))
    conn.commit()


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

# Multi-machine demo catalog for rig, v6-engine, and demo-pump so every hero
# machine has realistic stocked service parts out of the box (cr-pump stays 15
# rows to preserve exact unit-test expectations).
MULTI_MACHINE_SEED: dict[str, list[tuple[str, str, float, int, int]]] = {
    "rig": [
        ("ring_outer", "FAG 6203 outer raceway / bearing unit", 48.0, 6, 3),
        ("ring_inner", "FAG 6203 inner raceway / bearing unit", 48.0, 5, 3),
        ("rollers", "6203 chrome-steel ball set (8x 6.75 mm)", 19.5, 12, 2),
        ("cage", "6203 stamped brass/steel ribbon cage", 14.0, 10, 2),
        ("shaft", "Precision ground test-rig drive shaft (20 mm)", 165.0, 2, 7),
        ("housing", "Test bearing plummer housing assembly", 220.0, 2, 10),
        ("motor", "Drive motor 3-phase replacement unit", 540.0, 1, 14),
    ],
    "v6-engine": [
        ("fuel-injector-1", "Direct fuel injector + O-ring clip", 84.0, 8, 3),
        ("fuel-injector-2", "Direct fuel injector + O-ring clip", 84.0, 8, 3),
        ("fuel-injector-3", "Direct fuel injector + O-ring clip", 84.0, 6, 3),
        ("fuel-injector-4", "Direct fuel injector + O-ring clip", 84.0, 6, 3),
        ("fuel-injector-5", "Direct fuel injector + O-ring clip", 84.0, 6, 3),
        ("fuel-injector-6", "Direct fuel injector + O-ring clip", 84.0, 6, 3),
        ("spark-plugs", "Iridium spark plug set (0.5 mm gap)", 54.0, 12, 2),
        ("fuel-pump", "High-pressure rail feed pump", 195.0, 3, 5),
        ("fuel-rail-l", "Left bank fuel rail + seal kit", 118.0, 4, 5),
        ("fuel-rail-r", "Right bank fuel rail + seal kit", 118.0, 4, 5),
        ("piston-1", "Forged 86 mm piston + ring pack", 142.0, 6, 7),
        ("connecting-rods", "Balanced connecting rod set", 310.0, 2, 10),
        ("crankshaft", "Forged V6 crankshaft (86 mm stroke)", 680.0, 1, 14),
        ("oil-pan", "Sump pan + perimeter gasket", 96.0, 4, 4),
    ],
    "demo-pump": [
        ("shaft-seal", "Cartridge mechanical seal kit", 175.0, 8, 3),
        ("impeller", "Stainless stage impeller", 198.0, 4, 7),
        ("sleeve-o-ring", "Fluoroelastomer sleeve O-ring", 22.0, 20, 2),
        ("base-o-ring", "Base flange O-ring", 11.5, 24, 2),
        ("coupling-halves", "Split shaft coupling pair", 128.0, 5, 6),
    ],
}


def _heuristic_pricing(name: str) -> tuple[float, int, int]:
    """(unit_price, stock_qty, lead_days) from component name keywords."""
    low = name.lower()
    if any(k in low for k in ("o-ring", "oring", "gasket", "washer", "clip",
                              "nut", "screw", "bolt", "plug")):
        return 16.5, 20, 2
    if any(k in low for k in ("seal", "cage", "bushing", "ring", "spring")):
        return 64.0, 10, 3
    if any(k in low for k in ("bearing", "injector", "impeller", "valve",
                              "sensor")):
        return 115.0, 6, 4
    if any(k in low for k in ("shaft", "piston", "camshaft", "rail", "pump",
                              "coupling", "chamber", "diffuser")):
        return 185.0, 3, 7
    return 290.0, 2, 10


def seed(conn: sqlite3.Connection) -> int:
    from .packs import PACKS_DIR
    reg_path = os.path.join(PACKS_DIR, "cr-pump", "components.json")
    names = {}
    if os.path.exists(reg_path):
        with open(reg_path, encoding="utf-8") as f:
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
    for machine, items in MULTI_MACHINE_SEED.items():
        m_path = os.path.join(PACKS_DIR, machine, "components.json")
        m_names = {}
        if os.path.exists(m_path):
            with open(m_path, encoding="utf-8") as f:
                for c in json.load(f):
                    m_names[c["id"]] = (c["name"], c.get("pos"))
        for cid, label, price, stock, lead in items:
            base_name, pos = m_names.get(cid, (cid.replace("-", " ").title(), None))
            conn.execute(
                "INSERT OR IGNORE INTO parts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"{machine}:{cid}", machine, cid, f"{base_name} — {label}", pos,
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


def restock_machine(conn: sqlite3.Connection, machine: str,
                    part_id: str | None = None,
                    qty_add: int | None = None) -> dict:
    """Populate realistic sandbox pricing/stock for unstocked pack parts or
    top up a specific part."""
    if part_id:
        row = conn.execute("SELECT * FROM parts WHERE id = ? AND machine = ?",
                           (part_id, machine)).fetchone()
        if row is None:
            return {"error": f"unknown part {part_id} for {machine}"}
        price, def_qty, lead = _heuristic_pricing(row["name"])
        new_price = row["unit_price"] if row["unit_price"] > 0 else price
        add = qty_add if (qty_add is not None and qty_add > 0) else def_qty
        conn.execute(
            "UPDATE parts SET stock_qty = stock_qty + ?, unit_price = ?, "
            "lead_days = ?, vendor = ? WHERE id = ?",
            (add, new_price, lead, "Demo Supply (simulated)", part_id),
        )
        _audit(conn, "inventory_planner", "restock_part",
               {"part_id": part_id, "added": add, "unit_price": new_price})
        conn.commit()
        updated = conn.execute("SELECT * FROM parts WHERE id = ?",
                               (part_id,)).fetchone()
        return {"updated": 1, "part": dict(updated), "sandbox": True}

    rows = conn.execute(
        "SELECT * FROM parts WHERE machine = ? AND stock_qty <= 0",
        (machine,),
    ).fetchall()
    n = 0
    for r in rows:
        price, stock, lead = _heuristic_pricing(r["name"])
        conn.execute(
            "UPDATE parts SET stock_qty = ?, unit_price = ?, lead_days = ?, "
            "vendor = ? WHERE id = ?",
            (qty_add if (qty_add and qty_add > 0) else stock,
             r["unit_price"] if r["unit_price"] > 0 else price,
             lead, "Demo Supply (simulated)", r["id"]),
        )
        n += 1
    if n:
        _audit(conn, "inventory_planner", "restock_machine",
               {"machine": machine, "updated": n})
        conn.commit()
    return {"machine": machine, "updated": n, "sandbox": True}


# Companion consumables pulled automatically when a primary component fails.
COMPANION_RULES: list[tuple[str, str, str]] = [
    ("ring_", "rollers|cage", "Replace rolling elements/cage with raceway service"),
    ("seal", "oring|o-ring|lock-washer", "Mandatory elastomer replacement on teardown"),
    ("impeller", "wear-ring|neck-ring|oring|o-ring", "Renew clearance rings & stage O-rings"),
    ("chamber", "oring|o-ring|bearing-ring", "Stage overhaul seal & bearing ring kit"),
    ("injector", "spark-plug|fuel-rail", "Verify ignition plug & rail clip seal"),
    ("piston", "connecting-rod|oil-pan", "Bottom-end gasket & rod fastener check"),
]


def recommend_repair_kit(conn: sqlite3.Connection, machine: str,
                         component_id: str,
                         auto_draft: bool = False) -> dict:
    """Build a BOM repair recommendation (primary part + manual consumables)
    and optionally create a sandbox draft order."""
    import re as _re

    all_parts = [dict(r) for r in conn.execute(
        "SELECT * FROM parts WHERE machine = ?", (machine,)
    ).fetchall()]
    if not all_parts:
        return {"error": f"no inventory catalog for {machine}"}

    by_comp = {p["component_id"]: p for p in all_parts}
    primary = by_comp.get(component_id)
    if primary is None:
        # Fuzzy fallback on component_id substring
        for p in all_parts:
            if (component_id in p["component_id"]
                    or p["component_id"] in component_id):
                primary = p
                break
    if primary is None:
        return {"error": f"no catalog match for component {component_id}"}

    companions: list[dict] = []
    reasons: list[str] = []
    target_key = f"{primary['component_id']} {primary['name']}".lower()
    for trigger, pat, why in COMPANION_RULES:
        if trigger in target_key:
            rx = _re.compile(pat, _re.IGNORECASE)
            for p in all_parts:
                if p["id"] == primary["id"]:
                    continue
                if rx.search(p["component_id"]) or rx.search(p["name"]):
                    if all(x["id"] != p["id"] for x in companions):
                        companions.append(p)
                        if why not in reasons:
                            reasons.append(why)
                if len(companions) >= 2:
                    break

    kit = [primary] + companions[:2]
    alerts = []
    orderable_lines = []
    for p in kit:
        if p["stock_qty"] <= 0:
            alerts.append(f"{p['name']} ({p['sku']}) is OUT OF STOCK "
                          f"({p['lead_days']}d lead) — restock required.")
        elif p["stock_qty"] <= 2:
            alerts.append(f"Low stock alert: only {p['stock_qty']}x "
                          f"{p['name']} remaining ({p['lead_days']}d lead).")
        if p["stock_qty"] > 0:
            orderable_lines.append({"part_id": p["id"], "qty": 1})

    draft_order = None
    if auto_draft and orderable_lines:
        draft_order = create_draft(conn, machine, orderable_lines, None)
        if "error" in draft_order:
            draft_order = None

    est_total = round(sum(p["unit_price"] for p in kit), 2)
    return {
        "machine": machine,
        "suspect_component": component_id,
        "primary": primary,
        "companions": companions[:2],
        "reasons": reasons,
        "alerts": alerts,
        "estimated_total": est_total,
        "max_lead_days": max((p["lead_days"] for p in kit), default=0),
        "draft_order": draft_order,
        "sandbox": True,
        "note": SANDBOX_NOTE,
    }
