#!/usr/bin/env python3
"""Build an offline dated-service audit input from held public CSV files.

No fetching and no database writes. OpenAustralia files must match the pinned
release digests. Optional historical Senate files must match their acquisition
receipts. This evidence supplies audit coverage, never permission to relink.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.electorates import stable_id  # noqa: E402
from parli.ingest.electorates import csv_rows, oa_person_count, oa_person_index  # noqa: E402
from scripts.oa_people_ids import rows as people_rows  # noqa: E402
from scripts.roster_source_profiles import reference  # noqa: E402

DIGESTS = dict(representatives='3c9a623c968eb3ce660626d0cc43eb4e503bd41be5ff83831718a36452a200b6',
               people='42e310b1a1e8b63243e6027f0c07303bf068c1ef9db5d9fc9744880d93ed007f')


def catalogue_id(people, legacy, name, source_key):
    matches = [p['person_id'] for p in people if p.get('jurisdiction') == 'federal'
               and ((legacy and p.get('legacy_person_id') == legacy)
                    or (not legacy and p['name'] == name))]
    return matches[0] if len(matches) == 1 else stable_id('person', source_key)


def build(oa_dir, politicians_dir=None):
    raw = {name: (oa_dir / f'{name}.csv').read_bytes() for name in DIGESTS}
    for name, data in raw.items():
        if hashlib.sha256(data).hexdigest() != DIGESTS[name]:
            raise ValueError(f'Pinned OpenAustralia {name} digest changed')
    people = reference()['people']
    oa_people = people_rows(raw['people'].decode('utf-8-sig'))
    index = oa_person_index(oa_people)
    terms = []
    for row in csv_rows(raw['representatives'], 'member count,'):
        if not row.get('name') or row['member count'].startswith('#'):
            continue
        def day(value):
            if not value:
                return None
            d, m, y = value.split('.')
            return f'{int(y):04}-{int(m):02}-{int(d):02}'
        count = oa_person_count(index, row['name'])
        legacy = str(10000 + int(count)) if count is not None else None
        terms.append(dict(person_id=catalogue_id(people, legacy, row['name'], 'oa:' + row['name']),
                          legacy_person_id=legacy, name=row['name'], chamber='representatives',
                          seat=row['Division'], start=day(row['Date of election']),
                          end=day(row['Date ceased to be a Member']),
                          source_member_count=row['member count'], source_sha256=DIGESTS['representatives']))
    if politicians_dir:
        def read(name):
            path = politicians_dir / f'australian_politicians-{name}.csv'
            data = path.read_bytes()
            receipt = json.loads(path.with_suffix('.csv.request.json').read_text())
            if receipt['status'] != 200 or hashlib.sha256(data).hexdigest() != receipt['sha256']:
                raise ValueError(f'Historical Senate source receipt changed: {name}')
            return list(csv.DictReader(data.decode('utf-8-sig').splitlines())), receipt
        members, _ = read('all')
        by_id = {r['uniqueID']: r for r in members}
        phids, _ = read('uniqueID_to_aphID')
        by_phid = {r['uniqueID']: r['aphID'] for r in phids}
        oa_ids = {str(r[1]): str(10000 + int(r[0])) for r in oa_people if r[1]}
        senate, receipt = read('senators-by_state')
        states = dict(NSW='New South Wales', VIC='Victoria', QLD='Queensland', SA='South Australia',
                      WA='Western Australia', TAS='Tasmania', ACT='Australian Capital Territory', NT='Northern Territory')
        for row in senate:
            member = by_id[row['uniqueID']]
            phid = by_phid.get(row['uniqueID'])
            legacy = oa_ids.get(phid)
            name = member['firstName'] + ' ' + member['surname']
            seat = row['senatorsState']
            terms.append(dict(person_id=catalogue_id(people, legacy, name,
                                                     'aph:' + phid if phid else 'australian_politicians:' + row['uniqueID']),
                              legacy_person_id=legacy, name=name, chamber='senate', seat=seat,
                              seat_prints=[seat, states.get(seat, seat)], start=row['senatorFrom'],
                              end=row['senatorTo'] if row['senatorTo'] != 'NA' else None,
                              source_url=receipt['url'], source_sha256=receipt['sha256']))
    return terms


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--openaustralia-dir', type=Path, required=True)
    parser.add_argument('--politicians-dir', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    terms = build(args.openaustralia_dir, args.politicians_dir)
    args.out.write_text(json.dumps(terms, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(terms=len(terms), sha256=hashlib.sha256(args.out.read_bytes()).hexdigest())))


if __name__ == '__main__':
    main()
