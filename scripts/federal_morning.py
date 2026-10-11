#!/usr/bin/env python3
"""Federal-only XML pickup and schema 1 export; scheduling is opt-in."""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.ingest import openaustralia_xml as X, speeches as S
from parli.ingest.tvfy_bill_links import project
from scripts import export_votes as E
from scripts.vm.bills_guard import cadence
from scripts.vm.mobile_votes_contract import validate_votes


def run(args):
    today = datetime.fromisoformat(args.date).date()
    if cadence(args.date) != 'after-sitting':
        print('Federal morning pickup: calendar skip')
        return
    args.start = (today-timedelta(days=7)).isoformat()
    args.end = (today-timedelta(days=1)).isoformat()
    args.modern_dir = str(Path(args.stage)/'morning-modern')
    args.tvfy_list_cache = '~/.cache/autoresearch/tvfy/list'
    args.load_divisions = True
    with X.read_only(args.db) as db:
        divisions, votes, report = X.fetch(args, db)
    # The whole acquisition and identity/count validation precede any writer.
    saved = S.MODERN_DIR
    try:
        S.MODERN_DIR = Path(args.modern_dir)
        reconciliation = []
        with sqlite3.connect(str(Path(args.db).expanduser()), timeout=60) as db:
            added = S.load_modern_jsonl(db, set(), args.start, report=reconciliation, until=args.end)
            X.apply_divisions(db, divisions, votes)
            links = project(db, args.start)
    finally:
        S.MODERN_DIR = saved
    with X.read_only(args.db) as db:
        out, names, newest = {}, {}, {}
        E.export_federal(db, out, names, newest)
        E.export_state(db, out, names, newest)
    latest = {}
    for key, day in newest.items():
        E.note_latest(latest, out[key]['jurisdiction'], day)
    out['_names'] = names
    out['_meta'] = {'content_changed_at':None, 'latest_division_date':max(latest.values(), default=None),
                    'latest_division_date_by_jurisdiction':dict(sorted(latest.items())), 'schema':1}
    out['_meta']['content_changed_at'] = E.carried_stamp(out, args.output) or datetime.now(timezone.utc).strftime(E.STAMP_FORMAT)
    validate_votes(out)
    X.atomic(Path(args.output), E.dump(out))
    receipt = {'start':args.start, 'end':args.end, 'speeches_added':added, 'bill_links_added':links,
               'days':report['days'], 'reconciliation':reconciliation, 'schema':1, 'output':str(args.output)}
    X.atomic(Path(args.stage)/'morning-receipt.json', json.dumps(receipt, indent=2))
    print(f'Federal morning pickup: {added} speeches, {len(divisions)} divisions; schema 1 validated')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', required=True, help='Refresh-box DB; use a scratch copy for tests')
    ap.add_argument('--stage', required=True)
    ap.add_argument('--output', required=True, help='Explicit local votes output; no push or deploy')
    ap.add_argument('--date', default=datetime.now(ZoneInfo('Australia/Sydney')).date().isoformat())
    ap.add_argument('--offline', action='store_true')
    run(ap.parse_args())


if __name__ == '__main__':
    main()
