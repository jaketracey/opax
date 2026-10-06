#!/usr/bin/env python3
"""Offline, scoped restoration from a pinned aggregate, without a desktop DB.

The aggregate proves how many rows are witnesses, but not the scope of every
remaining row. Counts are therefore upper bounds until a SQL refresh. Identity
is restricted to the one actual state house, enforced by the portal per row.
Federal committees cannot establish or contradict a *state-house-only* scope.
No multi-state or federal-house aggregate can use this offline shortcut.
"""
import argparse
import copy
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts import enrich_profile_jurisdictions as profiles


def restored_scope(row, reference, reviewed, peers=()):
    if not profiles.witness_dominated(row) or not profiles.weak(row['name']):
        return None
    houses = set(row.get('chambers', [])) - profiles.COMMITTEES
    # Pinned P2 evidence is Queensland-specific. Other scopes need the SQL split.
    if houses != {'qld_la'} or set(row.get('states', [])) != {'qld', 'federal'}:
        return None
    own = dict(row, states=['qld'], chambers=['qld_la'],
               speeches=row['speeches'] - row.get('witness_rows', 0))
    own.pop('witness_rows', None)
    if own['speeches'] < 5:
        return None
    evidence = profiles.print_identity(own, profiles.dated_records(reference, reviewed), reference, peers)
    if not evidence or any(not r.get('source_url') or not r.get('start') for r in evidence):
        return None
    if len({profiles.key(r['name']) for r in evidence}) != 1:
        return None
    latest = max(evidence, key=lambda r: r['start'])
    if not latest.get('party'):
        return None
    profiles.guard_print(own, force=True)
    own.update(full=latest['name'], party=latest['party'],
               speech_scope={'state': 'qld', 'chamber': 'qld_la'},
               speech_count_basis='non-witness upper bound; exact house count requires SQL refresh',
               transcript={k: copy.deepcopy(row[k]) for k in
                           ('speeches', 'states', 'chambers', 'first', 'last', 'witness_rows') if k in row},
               separated_witnesses={'name': row['name'], 'speaker_type': 'witness',
                                    'speeches': row['witness_rows']},
               identity_evidence=[{k: r.get(k) for k in
                                  ('name', 'jurisdiction', 'chamber', 'electorate', 'as_of', 'start', 'end', 'source_url')}
                                  for r in evidence],
               representation=list({(r['jurisdiction'], r['chamber'], r['electorate']): profiles.representation(r)
                                    for r in evidence}.values()))
    own.pop('recorded_parties', None)
    return own


def split_pinned(doc, reference, reviewed):
    before = copy.deepcopy(doc['people'])
    changed = []
    for row in doc['people']:
        if row.get('speech_scope'):
            continue
        peers = [p for p in before if profiles.usable_alias(p['name']) and profiles.agrees(row['name'], p['name'])]
        own = restored_scope(row, reference, reviewed, peers)
        if own:
            row.clear()
            row.update(own)
            changed.append(row['name'])
    doc['meta']['speeches'] = sum(p['speeches'] for p in doc['people'])
    doc['meta']['witness_speeches_separated'] = sum(p.get('separated_witnesses', {}).get('speeches', 0) for p in doc['people'])
    doc['meta']['speech_counts_include_upper_bounds'] = True
    if 'representation' in doc['meta']:
        doc['meta']['representation']['matched'] = sum(bool(p.get('representation')) for p in doc['people'])
        doc['meta']['representation']['method'] = 'Evidence-gated corrections only; clean records pass through intact. Scoped witness splits use dated Queensland Assembly identities, exclude testimony and require an own-house retrieval filter. Legacy aggregates are preserved under transcript; non-witness counts are upper bounds until the SQL refresh.'
    return changed


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=profiles.PUBLIC / 'parliamentarians.json')
    args = parser.parse_args()
    doc = json.loads(args.directory.read_text())
    changed = split_pinned(doc, profiles.pinned_reference(), json.loads(profiles.REVIEWED.read_text()))
    args.directory.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(changed)} scoped restorations: {", ".join(changed)}')
