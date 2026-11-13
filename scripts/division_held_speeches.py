#!/usr/bin/env python3
"""Measure NSW roll calls held in speeches.text; never acquire source data.

A candidate needs exact chamber, day, topic and official side counts, a full
printed list and every already held named vote. Exactly one held list must
match. Each additional surname also needs a unique dated roster identity and
an independently held official seat observation. This is not a counts-only or
another-division inference.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
COUNTS = re.compile(r'\bAyes\s*(\d+)\s+Noes\s*(\d+)\s+(?:Majority\s*\d+\s+)?AYES\s+(.*?)\s+NOES\s+', re.S)


def fold(value):
    return unicodedata.normalize('NFKC', str(value or '')).casefold().replace('’', "'").strip()


def topic(value):
    return re.sub(r'[^a-z0-9]+', ' ', fold(value)).strip()


class StateIdentities:
    def __init__(self, db, root=ROOT):
        old_factory = db.row_factory
        db.row_factory = sqlite3.Row
        self.roster = [dict(r) for r in db.execute('SELECT * FROM ext_state_roster')]
        db.row_factory = old_factory
        self.snapshots = json.loads((root / 'scripts/roster_state_evidence.json').read_text())['snapshots']

    def resolve(self, printed, record):
        possible = {r['qid'] or r['full_name'] for r in self.roster
                    if r['state'] == record['jurisdiction'] and r['chamber'] == record['house']
                    and fold(r['family_name']) == fold(printed)
                    and (not r['term_start'] or r['term_start'] <= record['date'])
                    and (not r['term_end'] or record['date'] <= r['term_end'])}
        if len(possible) != 1:
            return None  # missing seat/date corroboration cannot exclude a namesake
        candidates = {}
        for r in self.roster:
            if not r['qid'] or r['state'] != record['jurisdiction'] or r['chamber'] != record['house'] \
                    or fold(r['family_name']) != fold(printed) or not r['term_start']:
                continue
            observations = [(s, m) for s in self.snapshots
                            if s['chamber'] == r['chamber'] and s['jurisdiction'] == r['state']
                            and r['term_start'] <= s['as_of'] <= (r['term_end'] or '9999-12-31')
                            for m in s['members'] if fold(m['name']) == fold(r['full_name'])]
            seats = {m['electorate'] for _, m in observations if m.get('electorate')}
            seat = r['district'] or ('New South Wales' if r['chamber'] == 'nsw_lc' else None)
            # An open term is observed only through a held roster/list date,
            # never projected into later sittings. The official 25 Sep list
            # corroborates the same open service observed in the DB on 21 Sep.
            through = r['term_end'] or max([r['fetched_at'][:10], *[s['as_of'] for s, _ in observations]])
            if not seat or seats != {seat} or not r['term_start'] <= record['date'] <= through:
                continue
            candidates[r['qid']] = dict(name=r['full_name'], qid=r['qid'], chamber=r['chamber'], seat=seat,
                                        service_from=r['term_start'], service_through=through,
                                        identity_url='https://www.wikidata.org/wiki/' + r['qid'],
                                        seat_source_url=max(observations, key=lambda o: o[0]['as_of'])[0]['source_url'])
        return next(iter(candidates.values())) if len(candidates) == 1 else None


def held_speech_tables(db, records, root=ROOT):
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not {'speeches', 'speeches_fts', 'ext_state_roster'} <= tables:
        return {}
    identities = StateIdentities(db, root)
    by_day = {}
    for key, d in records.items():
        if d.get('house') == 'nsw_lc' and d.get('jurisdiction') == 'nsw' and d.get('members'):
            by_day.setdefault(d['date'], []).append((key, d))
    candidates = {}
    for row in db.execute("SELECT s.speech_id,s.date,s.chamber,s.topic,s.text FROM speeches_fts f "
                          "JOIN speeches s ON s.speech_id=f.rowid WHERE speeches_fts MATCH '\"AYES\" \"NOES\"' "
                          "AND s.chamber='nsw_lc'"):
        sid, day, chamber, title, text = row
        for key, d in by_day.get(day, []):
            if topic(title) != topic(d.get('name')):
                continue
            members = [m for m in d['members'] if m['vote'] in ('aye', 'no')]
            known = {(fold(m['name']).split()[-1], m['vote']) for m in members}
            if len({family for family, _ in known}) != len(members):
                continue  # a surname cannot distinguish two held people
            for match in COUNTS.finditer(text):
                a, n = map(int, match.group(1, 2))
                if [a, n] != [d.get('ayes'), d.get('noes')]:
                    continue
                ayes = re.sub(r'\s*\(teller\)', '', match.group(3), flags=re.I).split()
                noes = re.sub(r'\s*\(teller\)', '', text[match.end():], flags=re.I).split()[:n]
                votes = {(fold(s), 'aye') for s in ayes} | {(fold(s), 'no') for s in noes}
                if len(ayes) != a or len(noes) != n or len(votes) != a + n or not known <= votes:
                    continue
                additions = []
                for family, vote in sorted(votes - known):
                    person = identities.resolve(family, d)
                    if person is None:
                        break
                    additions.append(dict(printed=family, vote=vote, identity=person))
                else:
                    if additions:
                        candidates.setdefault(key, []).append(dict(
                            id=key, speech_id=sid, date=day, chamber=chamber, topic=title,
                            source_url=d['source_url'], sha256=hashlib.sha256(text.encode()).hexdigest(),
                            counts=[a, n], table_names={'aye': ayes, 'no': noes, 'paired': []}, additions=additions))
    return {key: entries[0] for key, entries in candidates.items() if len(entries) == 1}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=Path.home() / '.cache/autoresearch/parli.db')
    parser.add_argument('--baseline', default='275d5852b')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    baseline = json.loads((ROOT / 'docs/evidence/division-coverage-baseline.json').read_text())
    records = {}
    for r in baseline['rows']:
        if r['chamber'] == 'nsw_lc':
            raw = subprocess.check_output(['git', 'show', args.baseline + ':portal/public/divisions/division-' + r['key'] + '.json'], cwd=ROOT)
            records[r['key']] = json.loads(raw)
    with sqlite3.connect(f'file:{args.db.resolve()}?mode=ro', uri=True) as db:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        result = held_speech_tables(db, records)
    args.out.write_text(json.dumps(dict(baseline=args.baseline, count=len(result), records=result), indent=2) + '\n')
    print(json.dumps({'matched_divisions': len(result), 'new_beyond_name_tables': sum(
        r['classification'] == 'd' and r['key'] in result for r in baseline['rows'])}))


if __name__ == '__main__':
    main()
