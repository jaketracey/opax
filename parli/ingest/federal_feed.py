"""Nightly XML first; API fallback only on an outage, never after a refusal."""
import argparse
from datetime import date, timedelta
import json
import os
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlencode
import xml.etree.ElementTree as ET

from .honest_http import HonestHTTP, Refused, Unavailable
from .openaustralia_xml import DEFAULT_STAGE, atomic, fetch, read_only


def apply_api_projection(db, since):
    """Preserve keys first published from XML when TVFY later assigns an ID."""
    from .openaustralia_xml import apply_divisions
    from .votes_ingest import read_legacy
    db.row_factory = sqlite3.Row
    divisions, votes = read_legacy(db, since, None)
    keys = {(r['house'], r['date'], r['number']): r['id'] for r in db.execute(
        "SELECT id,house,date,number FROM ext_divisions WHERE jurisdiction='federal'")}
    aliases = {}
    for d in divisions:
        existing = keys.get((d.house, d.date, d.number))
        if existing:
            aliases[d.id] = existing
            d.id = existing
    for v in votes:
        v.division_id = aliases.get(v.division_id, v.division_id)
    apply_divisions(db, divisions, votes)


def api_hansard(args):
    # Import the established HTML parser only if the API is actually needed.
    from .hansard_html import parse_debate_html
    from bs4 import BeautifulSoup
    http = HonestHTTP()
    key = os.environ.get('OPENAUSTRALIA_API_KEY')
    if not key:
        raise Unavailable('XML unavailable; OpenAustralia API fallback key absent')
    pending = []
    day = date.fromisoformat(args.start)
    while day.isoformat() <= args.end:
        for house in ('representatives', 'senate'):
            url = 'https://www.openaustralia.org.au/api/getDebates?' + urlencode(
                {'key': key, 'type': house, 'date': day.isoformat(), 'output': 'json'})
            body = http.get(url)
            try:
                debates = json.loads(body or b'null')
            except ValueError:
                raise Unavailable('API fallback did not answer with JSON') from None
            if not isinstance(debates, list):
                raise Unavailable('API fallback did not answer with a debate list')
            rows, seen = [], set()
            for section in debates:
                topic = BeautifulSoup(section.get('entry', {}).get('body', ''), 'html.parser').get_text(strip=True)
                for sub in section.get('subs', []):
                    link = sub.get('listurl', '')
                    if not link or link in seen:
                        continue
                    if not re.match(r'^/(?:debates|senate)/', link):
                        raise Unavailable('API fallback supplied an unexpected debate path')
                    seen.add(link)
                    page = http.get('https://www.openaustralia.org.au' + link)
                    if not page:
                        raise Unavailable('API fallback debate page unavailable')
                    parsed = parse_debate_html(page.decode())
                    if not parsed:
                        raise Unavailable('API fallback debate page had no speeches')
                    rows.extend(dict(s, date=day.isoformat(), chamber=house, topic=topic) for s in parsed)
            if rows:
                pending.append((Path(args.modern_dir).expanduser() / f'{day}_{house}.jsonl', rows))
        day += timedelta(days=1)
    # No empty files and no partial fallback after a challenge/error.
    for path, rows in pending:
        atomic(path, ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
    print('Federal Hansard: honest OpenAustralia API fallback completed')


def main():
    from .openaustralia_xml import apply_divisions
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', default=os.environ.get('OPAX_DB', '~/.cache/autoresearch/parli.db'))
    ap.add_argument('--start', required=True)
    ap.add_argument('--end', default=date.today().isoformat())
    ap.add_argument('--stage', default=str(DEFAULT_STAGE))
    ap.add_argument('--modern-dir')
    ap.add_argument('--load-divisions', action='store_true')
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--tvfy-list-cache', default='~/.cache/autoresearch/tvfy/list')
    args = ap.parse_args()
    try:
        try:
            with read_only(args.db) as db:
                divisions, votes, report = fetch(args, db)
        except Unavailable:
            if args.offline:
                raise
            if args.load_divisions:
                from . import tvfy_refresh as t
                # Probe before opening a writer. Refusals stop immediately.
                probe = t.get('divisions.json', {'house': 'senate', 'start_date': args.end, 'end_date': args.end})
                if not isinstance(probe, list):
                    raise Unavailable('TVFY fallback did not answer with a division list')
                with t.connect(Path(args.db).expanduser()) as db:
                    failed = t.phase_list(db, date.fromisoformat(args.start), True)
                    failed += t.phase_detail(db, None, strict=True)
                    if not failed:
                        apply_api_projection(db, args.start)
                if failed:
                    raise Unavailable('TVFY API fallback incomplete')
                print('Federal divisions: honest TVFY API fallback completed')
            else:
                api_hansard(args)
            return
        if report['issues']:
            raise ValueError(f"XML identity/count checks failed ({len(report['issues'])}); see dry-run.json")
        if args.load_divisions:
            with sqlite3.connect(str(Path(args.db).expanduser())) as db:
                apply_divisions(db, divisions, votes)
        print(f"Federal XML: {len(report['days'])} chamber-days, {len(divisions)} divisions, {len(votes)} votes")
    except (Refused, Unavailable, ValueError, ET.ParseError) as exc:
        raise SystemExit(str(exc)) from None


if __name__ == '__main__':
    main()
