"""Project TVFY's exact official bill references into bill_links; no title joins."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sqlite3
from urllib.parse import unquote, urlsplit, parse_qs


def official_ref(value: str | None) -> str | None:
    value = unquote(value or "").strip().lower()
    if re.fullmatch(r"[rs]\d+", value):
        return value
    if re.fullmatch(r"legislation/billhome/[rs]\d+", value):
        return value.rsplit("/", 1)[-1]
    parsed = urlsplit(value)
    if parsed.hostname not in ("parlinfo.aph.gov.au", "www.aph.gov.au", "aph.gov.au"):
        return None
    if parsed.hostname == "parlinfo.aph.gov.au":
        query = parse_qs(parsed.query.replace(";query=", "&query="))
        tokens = query.get("query", [])
        if ";query=" in parsed.path:
            tokens.append(parsed.path.split(";query=", 1)[1])
        for token in tokens:
            match = re.fullmatch(r"id:legislation/billhome/([rs]\d+)", token)
            if match:
                return match[1]
    else:
        for token in parse_qs(parsed.query).get("bid", []):
            if re.fullmatch(r"[rs]\d+", token):
                return token
    return None


def plan_links(db: sqlite3.Connection, since: str | None = None) -> list[tuple[str, str, dict]]:
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not {"bills_v2", "division_bills", "divisions"} <= tables:
        return []
    registry = {}
    for key, source in db.execute("SELECT bill_key,source_id FROM bills_v2 WHERE jurisdiction='federal'"):
        ref = official_ref(source)
        if ref:
            registry.setdefault(ref, set()).add(key)
    if "bill_sources" in tables:
        for key, source, url in db.execute("SELECT bill_key,source_id,url FROM bill_sources WHERE kind='billhome' "
                                          "AND bill_key IN (SELECT bill_key FROM bills_v2 WHERE jurisdiction='federal')"):
            for ref in {official_ref(source), official_ref(url)} - {None}:
                registry.setdefault(ref, set()).add(key)
    links = {}
    for did, house, day, bid, official, url in db.execute(
        "SELECT d.division_id,d.house,d.date,b.bill_id,b.official_id,b.url "
        "FROM division_bills b JOIN divisions d ON d.division_id=b.division_id "
        "WHERE COALESCE(d.state,'federal')='federal' AND (? IS NULL OR d.date>=?)", (since, since)):
        refs = {official_ref(official), official_ref(url)} - {None}
        # Conflicting IDs or ambiguous registry rows are not exact evidence.
        if len(refs) != 1:
            continue
        ref = next(iter(refs)); keys = registry.get(ref, set())
        if len(keys) != 1:
            continue
        key = next(iter(keys)); target = f"federal-{house}-{did}"
        links[(key, target)] = {"tvfy_division_id": did, "tvfy_bill_id": bid,
                               "official_id": ref, "source_url": url}
    return [(key, target, evidence) for (key, target), evidence in sorted(links.items())]


def project(db: sqlite3.Connection, since: str | None = None) -> int:
    links = plan_links(db, since)
    if not links:
        return 0
    db.execute("""CREATE TABLE IF NOT EXISTS bill_links (
        bill_key TEXT NOT NULL, kind TEXT NOT NULL, target_key TEXT NOT NULL,
        rule TEXT, confidence REAL, evidence_json TEXT, audited TEXT DEFAULT '',
        PRIMARY KEY (bill_key,kind,target_key))""")
    published = {r[0] for r in db.execute("SELECT id FROM ext_divisions WHERE jurisdiction='federal'")}
    count = 0
    for key, target, evidence in links:
        if target not in published:
            continue
        count += db.execute("INSERT OR IGNORE INTO bill_links "
                            "(bill_key,kind,target_key,rule,confidence,evidence_json) VALUES (?,'division',?,'tvfy-official-id',1,?)",
                            (key, target, json.dumps(evidence, sort_keys=True))).rowcount
    return count


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default=os.environ.get("OPAX_DB", "~/.cache/autoresearch/parli.db"))
    ap.add_argument("--since")
    args = ap.parse_args()
    with sqlite3.connect(str(Path(args.db).expanduser())) as db:
        count = project(db, args.since)
    print(f"TVFY exact bill links: {count} added")


if __name__ == "__main__":
    main()
