#!/usr/bin/env python3
"""Offline roster interval inventory and comparison with pinned own-house corpus bounds.

Observation dates and attribution-coverage windows are reported separately from service.
No network or database writes. The corpus snapshot records exact local speech/vote ids;
it is a lower-bound check, not an election-date source.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HOUSES = ('representatives', 'senate', 'act_la', 'nsw_la', 'nsw_lc', 'nt_la',
          'qld_la', 'sa_ha', 'sa_lc', 'tas_ha', 'tas_lc', 'vic_la', 'vic_lc', 'wa_la', 'wa_lc')


def read(root, path):
    return json.loads((Path(root) / path).read_text())


def name_key(value):
    value = re.sub(r'^(?:(?:the|hon|rt|mr|mrs|ms|dr|sir|senator)\.?\s+)+', '', str(value or ''), flags=re.I)
    return re.sub(r'[^\w]+', ' ', value.casefold().replace('’', "'")).strip()


def inventory(root=ROOT):
    """All published/accepted service and party intervals, with source-local stable keys."""
    roster = read(root, 'portal/public/parliamentarians.json')
    accept = read(root, 'scripts/roster_accept.json')
    reviewed = read(root, 'scripts/roster_service.json')
    handbook = read(root, 'scripts/handbook_party_service.json')
    manifest = read(root, 'portal/public/electorates/manifest.json')
    bundle = read(root, 'portal/public' + manifest['reference_url'])
    catalog_people = {p['person_id']: p for p in bundle['people']}
    seats = {s['electorate_id']: s for s in bundle['electorates']}
    sources = {s['source_id']: s for s in bundle['sources']}
    periods, observations, coverage = [], [], []
    identities = {}

    def identity(name, house, pid=None, aliases=()):
        actor = 'pid:' + str(pid) if pid else 'name:' + name_key(name)
        item = identities.setdefault((actor, house), dict(actor=actor, name=name, chamber=house, names=set()))
        item['names'].update(name_key(n) for n in [name, *aliases] if n)
        return actor

    # Source aliases and verified ids establish which exact prints may join a corpus record.
    by_name = {}
    for p in roster['people']:
        for house in p.get('chambers', []):
            actor = identity(p['name'], house, p.get('pid'), [p.get('full'), *p.get('aliases', []), *p.get('prints', [])])
            by_name[(name_key(p['name']), house)] = actor

    def add(name, row, kind, key, *, actor=None, url=None, **extra):
        house = row['chamber']
        actor = actor or by_name.get((name_key(name), house)) or identity(name, house)
        item = dict(key=key, kind=kind, actor=actor, name=name, chamber=house,
                    start=row.get('start'), end=row.get('end'),
                    source_url=url or row.get('source_url'), **extra)
        if row.get('as_of') and row.get('start') == row.get('end') == row['as_of']:
            observations.append(item)
        else:
            periods.append(item)

    for p in roster['people']:
        for field in ('affiliations', 'identity_evidence'):
            for i, row in enumerate(p.get(field, [])):
                add(p['name'], row, field, f'roster/{p["name"]}/{field}/{i}')
    for name, entry in accept['new'].items():
        add(name, entry['service'], 'accepted-service', 'accepted/' + name,
            url=entry.get('term_start', {}).get('url') or entry['url'])
    for field in ('service', 'history'):
        for i, row in enumerate(reviewed.get(field, [])):
            add(row['name'], row, 'reviewed-' + field, f'reviewed/{field}/{i}')
    for name, entry in reviewed.get('same_person', {}).items():
        for i, row in enumerate(entry.get('service', [])):
            add(entry['name'], row, 'reviewed-career', f'reviewed/career/{name}/{i}')
    for p in handbook['people']:
        actor = identity(p['name'], 'senate', p['pid'], p.get('names', []))
        for i, row in enumerate(p['periods']):
            add(p['name'], dict(row, chamber='senate'), 'handbook-party', f'handbook/{p["pid"]}/{i}',
                actor=actor, url=handbook['url'], observed_through=row.get('through'))
    for term in bundle['terms']:
        p, seat = catalog_people[term['person_id']], seats[term['electorate_id']]
        actor = identity(p['name'], seat['chamber'], p.get('legacy_person_id'), p.get('aliases', []))
        url = next((sources[s]['url'] for s in term.get('sources', []) if s in sources), None)
        row = dict(term, chamber=seat['chamber'])
        add(p['name'], row, 'catalog-term', 'catalog/' + term['representation_id'], actor=actor, url=url)
        for i, party in enumerate(term.get('party_periods', [])):
            add(p['name'], dict(party, chamber=seat['chamber']), 'catalog-party',
                f'catalog/{term["representation_id"]}/party/{i}', actor=actor, url=url)
    for p in read(root, 'scripts/roster_witness_service.json')['services']:
        for i, row in enumerate(p['intervals']):
            coverage.append(dict(row, name=p['name'], chamber=p['chamber'], key=f'coverage/{p["print"]}/{i}'))
    # Point-in-time official rosters establish membership on that day, not term endpoints.
    for snap in read(root, 'scripts/roster_state_evidence.json')['snapshots']:
        observations.extend(dict(name=m['name'], chamber=snap['chamber'], start=m.get('as_of', snap['as_of']),
                                 end=m.get('as_of', snap['as_of']), kind='official-list', source_url=snap['source_url'])
                            for m in snap['members'])
    return dict(periods=periods, observations=observations, coverage=coverage,
                identities=[dict(v, names=sorted(v['names'])) for v in identities.values()])


def corpus_bounds(raw, identities):
    """Join full source names and reviewed prints in the same house; never trust a bare corpus id."""
    names = defaultdict(set)
    for person in identities:
        for name in person['names']:
            names[(person['chamber'], name)].add(person['actor'])
    # Parliament's full-name record identifies this exact initial print. Its stored pid is Dennis Hood's.
    names[('sa_lc', name_key('B.R. Hood'))] = {'name:' + name_key('Benjamin Hood')}
    bounds, unmatched = {}, Counter()
    for kind, rows in raw['groups'].items():
        for row in rows:
            house = row['chamber']
            candidates = names.get((house, name_key(row.get('speaker_name'))), set())
            if not candidates:
                candidates = names.get((house, name_key(row.get('speaker_name_clean'))), set())
            if len(candidates) != 1:
                unmatched[(house, 'ambiguous' if candidates else 'unmatched')] += 1
                continue
            actor, = candidates
            if actor.startswith('pid:'):
                printed_id = str(row.get('person_id') or '').removeprefix('tvfy_')
                # A surname can also be an earlier namesake. It needs the same verified id;
                # a conflicting numeric id also defeats a full-name/clean-name match.
                weak = len(name_key(row.get('speaker_name')).split()) < 2
                if ((printed_id.isdigit() and printed_id != actor[4:])
                        or (weak and printed_id != actor[4:])):
                    unmatched[(house, 'conflicting-or-unverified-id')] += 1
                    continue
            key = (actor, house)
            record = dict(actor=actor, chamber=house, date=row['date'], kind=kind,
                          record_id=row['record_id'], printed_name=row.get('speaker_name'),
                          source=row.get('source'), stored_person_id=row.get('person_id'))
            if key not in bounds or record['date'] < bounds[key]['date']:
                bounds[key] = record
    return sorted(bounds.values(), key=lambda b: (b['chamber'], b['actor'])), [
        dict(chamber=h, reason=r, groups=n) for (h, r), n in sorted(unmatched.items())]


def late_starts(periods, bounds):
    by = {(b['actor'], b['chamber']): b for b in bounds}
    return [dict(p, earliest=by[(p['actor'], p['chamber'])]) for p in periods
            if (p['actor'], p['chamber']) in by and p.get('start')
            and p['start'] > by[(p['actor'], p['chamber'])]['date']]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus-raw', type=Path, help='read-only local corpus aggregate to resolve into own-house bounds')
    args = parser.parse_args()
    data = inventory()
    if args.corpus_raw:
        raw = json.loads(args.corpus_raw.read_text())
        bounds, unmatched = corpus_bounds(raw, data['identities'])
        print(json.dumps(dict(database=raw['database'], database_mtime=raw['database_mtime'],
                              extracted_at=raw['extracted_at'], note=raw['note'],
                              bounds=bounds, unmatched_groups=unmatched), indent=2))
    else:
        bounds = read(ROOT, 'scripts/roster_corpus_bounds.json')['bounds']
        print(json.dumps(dict(counts={h: sum(p['chamber'] == h for p in data['periods']) for h in HOUSES},
                              late_starts=late_starts(data['periods'], bounds)), indent=2))


if __name__ == '__main__':
    main()
