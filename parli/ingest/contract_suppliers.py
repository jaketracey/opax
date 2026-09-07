"""
parli.ingest.contract_suppliers -- who holds the Commonwealth's contracts, resolved to entities.

Reads `ext_contracts` (parli.ingest.austender_full: every AusTender notice with
the supplier's ABN) and, when it exists, `ext_state_contracts` (the state
disclosure registers, parli.ingest.qld_contracts), and writes three tables the
money maps' "public money" layer reads:

  ext_contracts_current   one row per contract: the latest notice in its
                          amendment lineage ("CN1234", "CN1234-A1", "CN1234-A2"
                          are one contract whose value is the last notice's).
                          Summing notices would count a varied contract twice.
  ext_contract_suppliers  one row per supplier: ABN when the feed gave one
                          (nearly always), else the name matched against the
                          ABN Bulk Extract, else the name; the ABR's legal name,
                          type and status; a link to the donor register
                          (`ext_donor_entities`) by ABN, then by exact or
                          rule-normalised name, then by any registered name of
                          the ABN, the same ladder parli.ingest.grant_recipients
                          climbs; lifetime total and count, years, top agencies.
  ext_contract_supplier_keys  (key_type, key_value) -> supplier_id for the
                          exporter to look rows up by ABN or raw name.

    PYTHONPATH=. python3 -m parli.ingest.contract_suppliers --db ~/.cache/autoresearch/parli.db --abr-dir ~/.cache/autoresearch/abr [--report]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest import grant_recipients as gr
from parli.ingest.abr_match import INDEX_NAME, Index, match_entity

SOURCE = "contract_suppliers"
SUSPECT_FLOOR = 5_000_000_000
SUSPECT_RATIO = 10
DEFAULT_DB = "/home/jake/.cache/autoresearch/parli.db"
DEFAULT_ABR = "~/.cache/autoresearch/abr"

DDL = """
DROP TABLE IF EXISTS ext_contracts_current;
CREATE TABLE ext_contracts_current (
    base_cn TEXT PRIMARY KEY, cn_id TEXT, notices INTEGER NOT NULL, published TEXT, first_published TEXT,
    supplier_name TEXT, supplier_abn TEXT, supplier_region TEXT, supplier_country TEXT,
    agency TEXT, agency_abn TEXT, title TEXT, description TEXT, unspsc TEXT, amount REAL,
    original_amount REAL, start_date TEXT, end_date TEXT, procurement_method TEXT,
    procurement_method_details TEXT, atm_id TEXT, suspect INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_ccur_abn ON ext_contracts_current (supplier_abn);
CREATE INDEX ix_ccur_supplier ON ext_contracts_current (supplier_name);
CREATE INDEX ix_ccur_agency ON ext_contracts_current (agency);
CREATE INDEX ix_ccur_start ON ext_contracts_current (start_date);
DROP TABLE IF EXISTS ext_contract_suppliers;
CREATE TABLE ext_contract_suppliers (
    supplier_id TEXT PRIMARY KEY, canonical_name TEXT NOT NULL, kind TEXT, abn TEXT, abn_method TEXT,
    abr_name TEXT, abr_status TEXT, abr_etype TEXT, abr_state TEXT, abr_postcode TEXT,
    donor_entity_id TEXT, donor_method TEXT, donor_confidence REAL, donor_matched_on TEXT,
    total REAL NOT NULL, count INTEGER NOT NULL, federal_total REAL NOT NULL, federal_count INTEGER NOT NULL,
    qld_total REAL NOT NULL, qld_count INTEGER NOT NULL, first_year INTEGER, last_year INTEGER,
    agencies TEXT, alias_count INTEGER, aliases TEXT, source TEXT NOT NULL, ingested_at TEXT NOT NULL
);
CREATE INDEX ix_csup_donor ON ext_contract_suppliers (donor_entity_id);
DROP TABLE IF EXISTS ext_contract_supplier_keys;
CREATE TABLE ext_contract_supplier_keys (
    source TEXT NOT NULL, key_type TEXT NOT NULL, key_value TEXT NOT NULL, supplier_id TEXT NOT NULL,
    rows INTEGER NOT NULL, total REAL NOT NULL, ingested_at TEXT NOT NULL, PRIMARY KEY (source, key_type, key_value)
);
CREATE TABLE IF NOT EXISTS ext_ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, source TEXT NOT NULL,
    rows_loaded INTEGER, rows_deleted INTEGER, loaded_at TEXT NOT NULL, notes TEXT
);
"""


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def norm_name(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


class Sup:
    __slots__ = ("sid", "abn", "abn_method", "abr", "kind", "spellings", "total", "count", "years",
                 "agencies", "donor", "keys", "by_source")

    def __init__(self, sid: str):
        self.sid = sid
        self.abn = None
        self.abn_method = None
        self.abr = None
        self.kind = None
        self.spellings: Counter = Counter()
        self.total = 0.0
        self.count = 0
        self.years: set = set()
        self.agencies: Counter = Counter()
        self.donor = None
        self.keys: list = []
        self.by_source: dict = defaultdict(lambda: [0.0, 0])


def build_current(db: sqlite3.Connection) -> int:
    """One row per contract, carrying the latest notice's figures."""
    rows = db.execute(
        "SELECT COALESCE(parent_cn, cn_id) AS base, cn_id, published, supplier_name, supplier_abn, supplier_region, "
        "supplier_country, agency, agency_abn, title, description, unspsc, amount, start_date, end_date, "
        "procurement_method, procurement_method_details, atm_id FROM ext_contracts "
        "WHERE cn_id IS NOT NULL AND cn_id != '' ORDER BY base, published, cn_id").fetchall()
    out = []
    cur = None
    for r in rows:
        if cur is None or cur["base"] != r["base"]:
            if cur is not None:
                out.append(cur)
            cur = {"base": r["base"], "notices": 0, "first_published": r["published"], "original_amount": r["amount"]}
        cur["notices"] += 1
        cur.update({k: r[k] for k in r.keys() if k not in ("base",)})
    if cur is not None:
        out.append(cur)
    db.executemany(
        "INSERT INTO ext_contracts_current VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
        [(c["base"], c["cn_id"], c["notices"], c["published"], c["first_published"], c["supplier_name"],
          c["supplier_abn"], c["supplier_region"], c["supplier_country"], c["agency"], c["agency_abn"], c["title"],
          c["description"], c["unspsc"], c["amount"], c["original_amount"], c["start_date"], c["end_date"],
          c["procurement_method"], c["procurement_method_details"], c["atm_id"]) for c in out])
    # AusTender carries a few keyed-in values that no contract can be: a $123B
    # recruitment contract, a $121B legal one. A notice of SUSPECT_FLOOR or more
    # that is also SUSPECT_RATIO times everything else its supplier ever held is
    # flagged and left out of the totals and the map, never deleted.
    db.execute("""
        UPDATE ext_contracts_current SET suspect = 1 WHERE amount >= ? AND amount > ? * (
            SELECT COALESCE(SUM(o.amount), 0) FROM ext_contracts_current o
            WHERE COALESCE(o.supplier_abn, o.supplier_name) = COALESCE(ext_contracts_current.supplier_abn, ext_contracts_current.supplier_name)
              AND o.base_cn != ext_contracts_current.base_cn)""", (SUSPECT_FLOOR, SUSPECT_RATIO))
    return len(out)


def build(db_path: str, abr_dir: Path, report_only: bool) -> dict:
    t0 = time.time()
    db = sqlite3.connect(db_path, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.row_factory = sqlite3.Row
    stats: Counter = Counter()
    cur = db.cursor()
    cur.execute("BEGIN")
    cur.executescript(DDL)   # executescript commits; fine, the tables are rebuilt whole
    n_current = build_current(db)
    db.commit()
    stats["contracts"] = n_current
    log(f"  {n_current:,} contracts from the notices ({time.time() - t0:.0f}s)")

    idx = Index(abr_dir / INDEX_NAME)
    donors = gr.DonorIndex(db)
    sups: dict[str, Sup] = {}

    def sup_for(sid: str) -> Sup:
        s = sups.get(sid)
        if s is None:
            s = sups[sid] = Sup(sid)
        return s

    # Federal notices, then the state disclosure registers (parli.ingest.qld_contracts),
    # each group tagged with its source so the exporters can read one register at a time.
    stats["suspect_notices"] = db.execute("SELECT COUNT(*) FROM ext_contracts_current WHERE suspect = 1").fetchone()[0]
    groups = [dict(r, source="austender") for r in db.execute(
        "SELECT supplier_abn, supplier_name, COUNT(*) n, SUM(amount) total, MIN(substr(start_date,1,4)) y0, "
        "MAX(substr(start_date,1,4)) y1 FROM ext_contracts_current WHERE suspect = 0 GROUP BY 1, 2")]
    agency_rows = [dict(r, source="austender") for r in db.execute(
        "SELECT supplier_abn, supplier_name, agency, SUM(amount) total FROM ext_contracts_current WHERE suspect = 0 GROUP BY 1, 2, 3")]
    has_state = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ext_state_contracts_current'").fetchone()
    if has_state:
        groups += [dict(r, source=r["jurisdiction"]) for r in db.execute(
            "SELECT jurisdiction, supplier_abn, supplier_name, COUNT(*) n, SUM(amount) total, MIN(substr(award_date,1,4)) y0, "
            "MAX(substr(award_date,1,4)) y1 FROM ext_state_contracts_current GROUP BY 1, 2, 3")]
        agency_rows += [dict(r, source=r["jurisdiction"]) for r in db.execute(
            "SELECT jurisdiction, supplier_abn, supplier_name, agency, SUM(amount) total FROM ext_state_contracts_current GROUP BY 1, 2, 3, 4")]
    agencies_by = defaultdict(Counter)
    for r in agency_rows:
        agencies_by[(r["source"], r["supplier_abn"], r["supplier_name"])][r["agency"] or ""] += r["total"] or 0

    matched = 0
    for g in groups:
        raw = (g["supplier_name"] or "").strip()
        abn = re.sub(r"\D", "", g["supplier_abn"] or "")
        if len(abn) != 11:
            abn = ""
        method = "source" if abn else None
        if not abn:
            if gr.is_placeholder(raw) or not raw:
                sid = "undisclosed:federal"
            elif gr.looks_like_person(raw):
                sid = f"person:{gr.norm_person(raw)}"
            else:
                m = match_entity(idx, raw, [])
                if m and m.get("abn"):
                    abn, method = m["abn"], "abr_" + m["method"]
                    matched += 1
                    sid = f"abn:{abn}"
                    s = sup_for(sid)
                    if not s.abr:
                        s.abr = m
                else:
                    sid = f"name:{gr.norm_rule(raw)}"
        else:
            sid = f"abn:{abn}"
        s = sup_for(sid)
        if abn and not s.abn:
            s.abn, s.abn_method = abn, method
        n = g["n"] or 0
        total = float(g["total"] or 0)
        s.spellings[raw] += n
        s.total += total
        s.count += n
        s.by_source[g["source"]][0] += total
        s.by_source[g["source"]][1] += n
        for y in (g["y0"], g["y1"]):
            if y and str(y).isdigit():
                s.years.add(int(y))
        s.agencies.update(agencies_by[(g["source"], g["supplier_abn"], g["supplier_name"])])
        if g["supplier_abn"]:
            s.keys.append((g["source"], "abn", abn or g["supplier_abn"], n, total))
        s.keys.append((g["source"], "name", raw, n, total))
        stats["groups_" + g["source"]] += 1
    log(f"  {len(sups):,} suppliers; ABR matched {matched:,} unkeyed names ({time.time() - t0:.0f}s)")

    for s in sups.values():
        if s.abn and not s.abr:
            row = idx.db.execute("SELECT * FROM names WHERE abn = ? AND ntype = 'MN' LIMIT 1", (s.abn,)).fetchone()
            if row:
                s.abr = {"abn": s.abn, "name": row["name"], "status": row["status"], "entity_type": row["etype"],
                         "state": row["state"], "postcode": row["postcode"], "method": "abn_lookup"}
    for sid, s in sups.items():
        if sid.startswith("undisclosed:"):
            s.kind = "undisclosed"
        elif sid.startswith("person:"):
            s.kind = "individual"
        else:
            top = s.spellings.most_common(1)[0][0]
            s.kind = gr.kind_of(top, (s.abr or {}).get("entity_type"), None)
        stats["kind:" + s.kind] += 1

    for sid, s in sups.items():
        if s.kind in ("individual", "undisclosed", "government"):
            continue
        eid = donors.by_abn_unique(s.abn)
        if eid:
            s.donor = (eid, "abn", 1.0, s.abn)
        else:
            spellings = [x for x, _ in s.spellings.most_common()]
            if s.abr and s.abr.get("name"):
                spellings.append(s.abr["name"])
            hit = donors.by_name(spellings)
            if hit:
                eid, method, on = hit
                s.donor = (eid, method, 0.95 if method == "name_exact" else 0.85, on)
            elif s.abn:
                regs = [row["name"] for row in idx.db.execute(
                    "SELECT DISTINCT name FROM names WHERE abn = ? AND ntype IN ('MN','BN','TRD','OTN')", (s.abn,))]
                hit = donors.by_name([x for x in regs if x not in spellings])
                if hit:
                    eid, method, on = hit
                    s.donor = (eid, "abr_name", 0.8, on)
        if s.donor:
            stats["donor:" + s.donor[1]] += 1
    stats["suppliers"] = len(sups)
    stats["with_abn"] = sum(1 for s in sups.values() if s.abn)
    stats["donor_linked"] = sum(1 for s in sups.values() if s.donor)
    stats["donor_linked_dollars"] = round(sum(s.total for s in sups.values() if s.donor))
    stats["contract_dollars"] = round(sum(s.total for s in sups.values()))
    log(f"  donor-linked: {stats['donor_linked']:,} suppliers holding ${stats['donor_linked_dollars']/1e9:.1f}B "
        f"of ${stats['contract_dollars']/1e9:.1f}B ({time.time() - t0:.0f}s)")
    if report_only:
        return dict(stats)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    key_map: dict[tuple, list] = {}
    for sid, s in sups.items():
        abr = s.abr or {}
        years = sorted(s.years)
        name = ("Not disclosed" if s.kind == "undisclosed" else gr.display_name(s.spellings, abr.get("name")))
        aliases = [x for x, _ in s.spellings.most_common(12) if x != name]
        top_agencies = [[a, round(v)] for a, v in s.agencies.most_common(5) if a]
        rows.append((
            sid, name, s.kind, s.abn, s.abn_method, abr.get("name"), abr.get("status"), abr.get("entity_type"),
            abr.get("state"), abr.get("postcode"),
            s.donor[0] if s.donor else None, s.donor[1] if s.donor else None,
            s.donor[2] if s.donor else None, s.donor[3] if s.donor else None,
            round(s.total, 2), s.count,
            round(s.by_source["austender"][0], 2), s.by_source["austender"][1],
            round(s.by_source["qld"][0], 2), s.by_source["qld"][1],
            years[0] if years else None, years[-1] if years else None,
            json.dumps(top_agencies, ensure_ascii=False), len(s.spellings),
            json.dumps(aliases, ensure_ascii=False), SOURCE, stamp))
        for src, kt, kv, n, total in s.keys:
            k = (src, kt, kv)
            have = key_map.get(k)
            if have is None:
                key_map[k] = [sid, n, total]
            elif have[0] == sid:
                have[1] += n
                have[2] += total
            else:
                stats["key_clash"] += 1
                if n > have[1]:
                    key_map[k] = [sid, n, total]
    cur = db.cursor()
    cur.execute("BEGIN")
    cur.executemany("INSERT INTO ext_contract_suppliers VALUES (" + ",".join("?" * 27) + ")", rows)
    cur.executemany("INSERT INTO ext_contract_supplier_keys VALUES (?,?,?,?,?,?,?)",
                    [(src, kt, kv, sid, n, round(total, 2), stamp) for (src, kt, kv), (sid, n, total) in key_map.items()])
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("ext_contract_suppliers", SOURCE, len(rows), 0, stamp, ", ".join(f"{k}={v}" for k, v in sorted(stats.items()))))
    cur.execute("COMMIT")
    log(f"  wrote {len(rows):,} suppliers, {len(key_map):,} keys, {n_current:,} current contracts ({time.time() - t0:.0f}s)")
    return dict(stats)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--abr-dir", default=DEFAULT_ABR)
    ap.add_argument("--report", action="store_true", help="build and print counts; write nothing")
    args = ap.parse_args()
    stats = build(args.db, Path(os.path.expanduser(args.abr_dir)), args.report)
    log("  " + ", ".join(f"{k}={v:,}" if isinstance(v, int) else f"{k}={v}" for k, v in sorted(stats.items())))


if __name__ == "__main__":
    main()
