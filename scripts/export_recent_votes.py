#!/usr/bin/env python3
"""Export Worker-only recent votes from OPAX's unified parli.db snapshot.

Never changes the schema-1 mobile votes.json. Uses that published file only to
resolve identities; dates, questions and raw votes come from ext_divisions and
ext_votes. No network calls or reconstruction from bill for/against samples.
"""

import argparse
from contextlib import closing
import json
import os
import re
import sqlite3
from pathlib import Path

from export_votes import slugify

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = os.environ.get("OPAX_DB") or str(Path.home() / ".cache/autoresearch/parli.db")
LIMIT = 10


def vote_order(row):
    return row["date"], re.sub(r"\d+", lambda m: m[0].zfill(20), row["division_id"])


def projection(db, identities):
    division_columns = {r[1] for r in db.execute("PRAGMA table_info(ext_divisions)")}
    vote_columns = {r[1] for r in db.execute("PRAGMA table_info(ext_votes)")}
    if not {"id", "name", "question", "date", "source_url", "jurisdiction"} <= division_columns \
            or not {"person_id", "person_key", "person_name", "division_id", "vote", "jurisdiction"} <= vote_columns:
        raise ValueError("Unified recorded-vote tables unavailable; prior SEO export kept")
    people = {k: p for k, p in identities.items() if not k.startswith("_") and isinstance(p, dict) and p.get("name")}
    by_name = {}
    for key, person in people.items():
        by_name.setdefault((person["jurisdiction"], person["name"].casefold()), []).append(key)
    divisions = {r[0]: r for r in db.execute(
        "SELECT id, name, question, date, source_url, jurisdiction FROM ext_divisions")}
    recent, conflicts = {}, set()
    for jur, pid, pkey, name, did, vote in db.execute(
            "SELECT jurisdiction, person_id, person_key, person_name, division_id, vote FROM ext_votes "
            "WHERE vote IN ('aye','no','paired','abstain','abstention')"):
        division = divisions.get(did)
        if not division or not re.fullmatch(r"[a-zA-Z0-9_-]{1,180}", did or "") \
                or jur != division[5] or not re.fullmatch(r"\d{4}-\d\d-\d\d", (division[3] or "")[:10]) \
                or not re.match(r"https?://", division[4] or ""):
            continue
        key = str(pid) if jur == "federal" and pid is not None else f"{jur}:{slugify(pkey)}"
        person = people.get(key)
        if not person or person["jurisdiction"] != jur or person["name"].casefold() != (name or "").casefold():
            candidates = by_name.get((jur, (name or "").casefold()), [])
            key = candidates[0] if len(candidates) == 1 else None
        if key is None:
            continue
        row = {"division_id": did, "division_slug": f"division-{did}",
               "title": division[1] or division[2] or "Recorded division", "date": division[3][:10],
               "vote": vote, "jur": jur, "source_url": division[4]}
        previous = recent.setdefault(key, {}).get(did)
        if previous and previous != row:
            conflicts.add((key, did))
        recent[key][did] = row
    out = {}
    for key, rows in sorted(recent.items()):
        votes = sorted((r for did, r in rows.items() if (key, did) not in conflicts), key=vote_order, reverse=True)[:LIMIT]
        if votes:
            out[key] = {"name": people[key]["name"], "jurisdiction": people[key]["jurisdiction"], "recent": votes}
    return {"_meta": {"schema": 1, "source": "opax-parli-db", "coverage": "recorded" if out else "unavailable",
                      "person_count": len(out), "limit": LIMIT}, "people": out}


def write_projection(data, output):
    # Refuse a truncated DB or lost identities rather than wipe a previous export.
    if output.exists():
        previous = json.loads(output.read_text(encoding="utf-8"))
        for key, person in previous.get("people", {}).items():
            current = data["people"].get(key)
            rows = current["recent"] if current else []
            cutoff = min(map(vote_order, rows)) if rows else None
            # Old events may leave only through the bottom of a legitimately
            # newer rolling window; equal-count, same-day loss is still loss.
            if not rows or len(rows) < len(person["recent"]) \
                    or max(map(vote_order, rows)) < max(map(vote_order, person["recent"])) \
                    or any(row not in rows for row in person["recent"] if vote_order(row) >= cutoff):
                raise ValueError("Recorded-vote coverage regressed; prior SEO export kept")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    os.replace(temporary, output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--votes", type=Path, default=ROOT / "portal/public/votes.json")
    parser.add_argument("--out", type=Path, default=ROOT / "portal/public/seo/recent-votes.json")
    args = parser.parse_args()
    identities = json.loads(args.votes.read_text(encoding="utf-8"))
    with closing(sqlite3.connect(f"file:{Path(args.db).resolve()}?mode=ro", uri=True)) as db:
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        data = projection(db, identities)
    write_projection(data, args.out)
    print(f"SEO recent votes: {data['_meta']['person_count']} people; coverage={data['_meta']['coverage']}")


if __name__ == "__main__":
    main()
