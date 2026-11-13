#!/usr/bin/env python3
"""Offline measurement of published partial divisions, without modifying parli.db.

The optional existing OA archive supplies independent teller evidence. It is
never downloaded by this script. Legacy votes and ext_ name tables are checked
as possible held recovery sources. Deltas are named minus published official.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def measure(db, directory, archive=None):
    index = json.loads((directory / 'index.json').read_text())
    records = [json.loads((directory / (r['slug'] + '.json')).read_text())
               for r in index['divisions'] if r['member_coverage'] == 'partial']
    ext = {r['id']: dict(r) for r in db.execute('SELECT * FROM ext_divisions')}
    legacy = {r['division_id']: dict(r) for r in db.execute('SELECT * FROM divisions')}
    legacy_votes = defaultdict(set)
    for row in db.execute('SELECT division_id,person_id,vote FROM votes'):
        if row['vote'] in ('aye', 'no'):
            legacy_votes[row['division_id']].add((str(row['person_id']), row['vote']))
    offices = {}
    if archive:
        for person in ET.parse(archive / 'people.xml').getroot():
            for office in person.findall('office'):
                offices[office.get('id')] = person.get('id').rsplit('/', 1)[-1]
    xml_days = {}
    roster = [dict(r) for r in db.execute('SELECT * FROM ext_state_roster')]
    output = []
    for record in records:
        key = record['key']
        held = {(str(m.get('person_id') or '').removeprefix('tvfy_'), m['vote'])
                for m in record['members'] if m['vote'] in ('aye', 'no')}
        named = [sum(m['vote'] == v for m in record['members']) for v in ('aye', 'no')]
        official = [record['ayes'], record['noes']]
        delta = [a - b for a, b in zip(named, official)]
        source = ext.get(key)
        lid = int(key.rsplit('-', 1)[-1]) if key.startswith('federal-') and key.rsplit('-', 1)[-1].isdigit() else None
        old = legacy.get(lid)
        matched = old and old['house'] == record['house'] and old['date'] == record['date']
        additional = sorted(legacy_votes[lid] - held) if matched else []
        row = dict(key=key, date=record['date'], chamber=record['house'],
                   source=source['source'] if source else 'published snapshot (absent from DB)',
                   source_url=record['source_url'],
                   member_sha256=hashlib.sha256(json.dumps(sorted(
                       (str(m.get('person_id') or '').removeprefix('tvfy_'), m['name'], m['vote'])
                       for m in record['members'] if m['vote'] in ('aye', 'no')),
                       ensure_ascii=False, separators=(',', ':')).encode()).hexdigest(),
                   named=named, official=official, delta=delta,
                   legacy_additional=additional, classification='d', reason='unresolved source disagreement')
        if source:
            extra = json.loads(source['extra'] or '{}')
            row['held_name_tables'] = {k: len(v) for k, v in extra.get('table_names', {}).items()}
            missing = []
            for vote in ('aye', 'no'):
                for printed in extra.get('table_names', {}).get(vote, []):
                    family = re.sub(r'\s*\(teller\)\s*', '', printed, flags=re.I).strip()
                    if any(m['vote'] == vote and m['name'].casefold().endswith(family.casefold()) for m in record['members']):
                        continue
                    candidates = {r['qid']: r for r in roster if r['state'] == record['jurisdiction']
                                  and r['chamber'] == record['house'] and (r['family_name'] or '').casefold() == family.casefold()
                                  and r['term_start'] and r['term_start'] <= record['date']
                                  <= (r['term_end'] or r['fetched_at'][:10])}
                    missing.append(dict(vote=vote, printed=printed,
                                        candidates=[r['full_name'] for r in candidates.values()]))
            row['table_missing'] = missing
            if missing and all(len(m['candidates']) == 1 for m in missing):
                row.update(classification='b', reason='name held in source table; unique dated chamber roster identity')
        number = source['number'] if source else old['number'] if matched else None
        if archive and record['jurisdiction'] == 'federal' and number is not None:
            slot = (record['house'], record['date'])
            path = archive / 'raw' / (record['house'] + '_debates') / (record['date'] + '.xml')
            if slot not in xml_days:
                if path.exists():
                    raw = path.read_bytes()
                    xml_days[slot] = ({int(n.get('divnumber')): n for n in ET.fromstring(raw).findall('division')},
                                      hashlib.sha256(raw).hexdigest())
                else:
                    xml_days[slot] = ({}, None)
            nodes, digest = xml_days[slot]
            node = nodes.get(number)
            if node is not None:
                count = node.find('divisioncount')
                xml_votes = [(offices.get(m.get('id')), m.get('vote'), m.get('teller') == 'yes')
                             for ml in node.findall('memberlist') for m in ml.findall('member')
                             if m.get('vote') in ('aye', 'no')]
                xml_set = {(pid, v) for pid, v, _ in xml_votes}
                tellers = [sum(v == vote and teller for _, v, teller in xml_votes) for vote in ('aye', 'no')]
                printed = [int(count.get(v)) for v in ('ayes', 'noes')]
                row['xml'] = dict(url='https://data.openaustralia.org.au/scrapedxml/' + str(path.relative_to(archive / 'raw')),
                                  sha256=digest, gid=node.get('id'), counts=printed, tellers=tellers,
                                  same_votes=xml_set == held and len(xml_set) == len(xml_votes),
                                  additional=sorted(xml_set - held, key=str))
                if row['xml']['same_votes'] and printed == named and tellers == delta and any(tellers):
                    row.update(classification='a', reason='published totals exclude explicitly marked XML tellers')
        if additional:
            row.update(classification='b', reason='additional named votes held in legacy votes (identity review required)')
        if any(d < 0 for d in delta) and row['classification'] == 'd':
            row['reason'] = 'named shortfall; no additional legacy votes; source convention or omitted name unproved'
        output.append(row)
    return dict(schema=1, baseline_divisions=index['count'], baseline_partial=len(records),
                classes=dict(Counter(r['classification'] for r in output)),
                rows=sorted(output, key=lambda r: r['key']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=Path.home() / '.cache/autoresearch/parli.db')
    parser.add_argument('--divisions', type=Path, default=ROOT / 'portal/public/divisions')
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    with sqlite3.connect(f'file:{args.db.resolve()}?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        result = measure(db, args.divisions, args.archive)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'rows'}))


if __name__ == '__main__':
    main()
