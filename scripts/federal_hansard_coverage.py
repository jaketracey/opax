"""Read-only chamber/year guard. Recent refresh success cannot clear old gaps."""
import argparse
from collections import Counter
from datetime import date, datetime, timezone
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.ingest import openaustralia_xml as xml

MANIFEST = Path(__file__).resolve().parents[1] / 'data/manifests/senate-backfill-2014-2019.json'


def measure(db, *, through_year=None, sync_state=None):
    through_year = through_year or date.today().year
    expected = list(range(1993, through_year + 1))
    rows = {str(year): 0 for year in expected}
    for year, count in db.execute("SELECT substr(date,1,4),COUNT(*) FROM speeches "
                                  "WHERE chamber='senate' AND date >= '1993-03-13' GROUP BY 1"):
        if year in rows:
            rows[year] = count
    published = dict(rows)
    pending_by_day = Counter()
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    columns = {r[1] for r in db.execute('PRAGMA table_info(speeches)')}
    if 'oa_backfill_owned' in tables and 'gid' in columns:
        state = (sync_state or {}).get('tables', {}).get('speeches', {})
        after, failed = state.get('after', 0), state.get('failed', {})
        for sid, day in db.execute('SELECT o.speech_id,o.date FROM oa_backfill_owned o '
                                   'JOIN speeches s ON s.speech_id=o.speech_id '
                                   "WHERE o.chamber='senate' AND o.gid IS s.gid AND o.date=s.date"):
            if sid > after or f'speech-{sid}' in failed:
                pending_by_day[day] += 1
                year = day[:4]
                if year in published:
                    published[year] -= 1
    day_rows = dict(db.execute("SELECT date,COUNT(*) FROM speeches WHERE chamber='senate' "
                               "AND date BETWEEN '2014-01-01' AND '2019-06-30' GROUP BY date"))
    pending_years = Counter()
    for item in json.loads(MANIFEST.read_text())['days']:
        day = item['date']
        if item['chamber'] == 'senate' and day_rows.get(day, 0) - pending_by_day[day] <= 0:
            pending_years[day[:4]] += 1
    return {'expected_years': expected, 'senate_rows': rows, 'senate_published_rows': published,
            'backfill_pending_days_by_year': dict(sorted(pending_years.items())),
            'empty_senate_years': [int(y) for y, n in rows.items() if n == 0],
            'unpublished_senate_years': [int(y) for y, n in published.items() if n == 0]}


def alerts(coverage):
    return [f'Senate Hansard has zero stored rows for {year}' for year in coverage['empty_senate_years']]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--sync-state', default=str(Path.home() / '.cache/autoresearch/arag_sync_state.json'))
    args = ap.parse_args()
    path = Path(args.sync_state)
    # Missing sync evidence keeps all newly owned rows pending.
    state = json.loads(path.read_text()) if path.exists() else {}
    with xml.read_only(args.db) as db:
        coverage = measure(db, sync_state=state)
    coverage['checked_at'] = datetime.now(timezone.utc).isoformat()
    xml.atomic(Path(args.output), json.dumps(coverage, indent=2) + '\n')
    for message in alerts(coverage):
        print('WARNING: ' + message)
    print(f"Senate coverage: {len(coverage['empty_senate_years'])} empty expected sitting years")


if __name__ == '__main__':
    main()
