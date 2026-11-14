#!/usr/bin/env python3
"""Review the 32 recovered Franklin votes through the dated-party rules.

Reads the reviewed vote evidence and, optionally, a read-only database snapshot.
Prints a report; never changes published labels or the database.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import sqlite3

import vote_parties

ROOT = Path(__file__).resolve().parents[1]
VOTES = ROOT / "docs/evidence/franklin-vote-party-review.json"


def review(doc: dict, evidence) -> dict:
    records = [{"key": row["division"], "date": row["date"], "house": "nsw_lc",
                "jurisdiction": "nsw", "members": [deepcopy(row["member"])]}
               for row in doc["recovered"]]
    rows = []
    for outcome in vote_parties.resolve_records(records, evidence, apply=True):
        member, record = outcome["member"], outcome["record"]
        rows.append({"key": record["key"], "date": record["date"], "name": member["name"],
                     "vote": member["vote"], "party": member.get("party"),
                     "reason": outcome["reason"], "rule": outcome["rule"], "source": outcome["source"]})
    return {"reviewed_commit": doc["reviewed_commit"], "votes": len(rows),
            "labelled": sum(bool(row["party"]) for row in rows),
            "outcomes": dict(Counter(row["reason"] for row in rows)), "rows": rows}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--votes", type=Path, default=VOTES)
    parser.add_argument("--db", type=Path, help="Optional local snapshot, opened read-only")
    args = parser.parse_args(argv)
    db = None
    try:
        if args.db:
            db = sqlite3.connect(args.db.resolve().as_uri() + "?mode=ro", uri=True)
            db.execute("PRAGMA query_only=ON")
        result = review(json.loads(args.votes.read_text()), vote_parties.load_evidence(db=db))
        print(json.dumps(result, indent=2))
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    main()
