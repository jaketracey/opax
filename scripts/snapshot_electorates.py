#!/usr/bin/env python3
"""Read-only electorate bootstrap from an already reconciled OPAX database.

The operator must supply the date on which the federal current roster was
verified against APH. Running this script does not itself verify that roster.
"""
import argparse
import json
import sqlite3
from datetime import date
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--federal-roster-verified-as-of', type=date.fromisoformat, required=True)
    args = p.parse_args()
    with sqlite3.connect(args.db.resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        snapshot = {name: [dict(row) for row in db.execute(f'SELECT * FROM {name}')] for name in ('members', 'electorate_demographics')}
    snapshot['federal_roster_verified_as_of'] = args.federal_roster_verified_as_of.isoformat()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(snapshot, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
