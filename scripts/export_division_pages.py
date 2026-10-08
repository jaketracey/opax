#!/usr/bin/env python3
"""Publish bounded static division records from the same data as bill/vote pages.

The normal mode reads parli.db with mode=ro and query_only=ON, in one snapshot.
The optional --from-bills mode projects only the already published bill export:
it explicitly labels member coverage unavailable rather than inventing votes.
Both modes use committed bill links, without a title guess, to link each division
back to its bills. One JSON file per slug avoids a runtime scan of the corpus.

Verified existing member snapshots may survive --from-bills only when the
division identity, source URL, date and tally still match exactly. The normal
database export always replaces them with its actual recorded rows.
"""

import argparse
from contextlib import closing
import json
import os
import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = os.environ.get("OPAX_DB") or str(Path.home() / ".cache/autoresearch/parli.db")


def person_slug(name):
    text = unicodedata.normalize("NFKD", str(name or ""))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"['’‘ʼ`.]", "", text)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def publishable_key(key):
    return isinstance(key, str) and bool(re.fullmatch(r"[a-zA-Z0-9_-]{1,180}", key))


def bill_projection(directory):
    """Division facts and exact reverse links already used by the client."""
    divisions, links = {}, {}
    for path in sorted(directory.glob("*.json")):
        if path.name == "index.json":
            continue
        bill = json.loads(path.read_text(encoding="utf-8"))
        if not publishable_key(bill.get("key")):
            continue
        link = {"key": bill["key"], "title": bill["title"], "url": f"/bill/{bill['key']}"}
        for division in bill.get("divisions", []):
            key = division.get("key")
            if not publishable_key(key):
                continue
            if key not in divisions:
                divisions[key] = {
                    "key": key, "slug": f"division-{key}",
                    "name": division.get("question") or "Recorded division",
                    "question": division.get("question"), "date": division.get("date"),
                    "house": division.get("house"), "jurisdiction": bill.get("jurisdiction", "federal"),
                    "ayes": division.get("ayes"), "noes": division.get("noes"),
                    "result": division.get("outcome"), "source_url": division.get("url"),
                    "members": [], "bills": [],
                    "_meta": {"member_coverage": "unavailable", "source": "published-bill-export", "schema": 1},
                }
            if link not in links.setdefault(key, []):
                links[key].append(link)
    for key, division in divisions.items():
        division["bills"] = links[key]
    return divisions


def database_projection(db, published):
    """Every recorded division, with named recorded votes and exact bill links."""
    db.row_factory = sqlite3.Row
    divisions = {}
    for row in db.execute(
            "SELECT id, name, question, date, house, jurisdiction, ayes_count, noes_count, result, source_url "
            "FROM ext_divisions ORDER BY id"):
        key = row["id"]
        if not publishable_key(key):
            continue
        divisions[key] = {
            "key": key, "slug": f"division-{key}", "name": row["name"],
            "question": row["question"] or row["name"], "date": row["date"],
            "house": row["house"], "jurisdiction": row["jurisdiction"],
            "ayes": row["ayes_count"], "noes": row["noes_count"], "result": row["result"],
            "source_url": row["source_url"], "members": [],
            "bills": published.get(key, {}).get("bills", []),
            "_meta": {"member_coverage": "recorded", "source": "parli.db-ext-divisions", "schema": 1},
        }
    seen = {}
    for row in db.execute(
            "SELECT division_id, person_id, person_name, vote FROM ext_votes "
            "ORDER BY division_id, person_name, person_id"):
        division = divisions.get(row["division_id"])
        if not division or not row["person_name"]:
            continue
        member = {"name": row["person_name"], "person_id": row["person_id"],
                  "person_slug": person_slug(row["person_name"]), "vote": row["vote"]}
        identity = (member["name"], member["person_id"])
        if identity not in seen.setdefault(row["division_id"], set()):
            division["members"].append(member)
            seen[row["division_id"]].add(identity)
    for division in divisions.values():
        ayes = sum(m["vote"] == "aye" for m in division["members"])
        noes = sum(m["vote"] == "no" for m in division["members"])
        if not division["members"]:
            division["_meta"]["member_coverage"] = "unavailable"
        elif ayes != division["ayes"] or noes != division["noes"]:
            division["_meta"]["member_coverage"] = "partial"
    return divisions


def carry_verified_members(record, previous):
    """Keep an explicitly sourced snapshot only while its facts still match."""
    fields = ("key", "date", "house", "ayes", "noes", "source_url")
    meta = previous.get("_meta", {})
    members = previous.get("members", [])
    if meta.get("member_coverage") != "recorded" or not meta.get("member_source_url") \
            or any(record.get(field) != previous.get(field) for field in fields):
        return
    if sum(m.get("vote") == "aye" for m in members) != record.get("ayes") \
            or sum(m.get("vote") == "no" for m in members) != record.get("noes"):
        return
    record["members"] = members
    record["_meta"].update({k: v for k, v in meta.items() if k.startswith("member_")})


def write_projection(records, output, carry=False):
    output.mkdir(parents=True, exist_ok=True)
    for record in records.values():
        path = output / f"{record['slug']}.json"
        if carry and path.is_file():
            carry_verified_members(record, json.loads(path.read_text(encoding="utf-8")))
        path.write_text(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    # Contains links and counts only, not the member corpus. It is optional at runtime.
    index = {"schema": 1, "count": len(records), "divisions": [
        {"key": d["key"], "slug": d["slug"], "date": d["date"], "bills": d["bills"],
         "member_coverage": d["_meta"]["member_coverage"]}
        for d in sorted(records.values(), key=lambda d: (d["date"] or "", d["key"]), reverse=True)
    ]}
    (output / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--bills", type=Path, default=ROOT / "portal/public/bills")
    parser.add_argument("--out", type=Path, default=ROOT / "portal/public/divisions")
    parser.add_argument("--from-bills", action="store_true")
    args = parser.parse_args()
    published = bill_projection(args.bills)
    if args.from_bills:
        records = published
    else:
        with closing(sqlite3.connect(f"file:{Path(args.db).resolve()}?mode=ro", uri=True)) as db:
            db.execute("PRAGMA query_only=ON")
            db.execute("BEGIN")
            records = database_projection(db, published)
    write_projection(records, args.out, carry=args.from_bills)
    print(f"Exported {len(records)} divisions; {sum(bool(d['members']) for d in records.values())} with member records.")


if __name__ == "__main__":
    main()
