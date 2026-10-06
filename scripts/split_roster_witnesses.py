#!/usr/bin/env python3
"""Offline, scoped restoration from a pinned aggregate, without a desktop DB.

The aggregate proves how many rows are witnesses, but not the scope of every
remaining row. Own counts are pending until a SQL refresh. Identity
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
    resolved = profiles.split_identity(own, reference, reviewed, peers)
    if not resolved:
        return None
    service, scope, evidence, _ = resolved
    latest = max(evidence, key=lambda r: r['start'])
    if not latest.get('party'):
        return None
    profiles.guard_print(own, force=True)
    own.update(full=latest['name'], party=profiles.split_party(service, min(f"{row['last']}-12-31", scope['service'][-1]['end'])),
               speech_scope=scope,
               speech_count_basis='pending own-house, in-service SQL export',
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
    own.pop('speeches', None)  # Optional to iOS readers; JSON null rejects the whole roster.
    if service.get('party_periods'):
        own['parties'] = [own['party'], *dict.fromkeys(p['party'] for p in service['party_periods'] if p['party'] != own['party'])]
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
    doc['meta']['speeches'] = sum(p.get('speeches') or 0 for p in doc['people'])
    doc['meta']['witness_speeches_separated'] = sum(p.get('separated_witnesses', {}).get('speeches', 0) for p in doc['people'])
    doc['meta'].pop('speech_counts_include_upper_bounds', None)
    doc['meta']['speech_counts_pending'] = sum(p.get('speeches') is None for p in doc['people'])
    if 'representation' in doc['meta']:
        doc['meta']['representation']['matched'] = sum(bool(p.get('representation')) for p in doc['people'])
        doc['meta']['representation']['method'] = profiles.REPRESENTATION_METHOD
    return changed


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=profiles.PUBLIC / 'parliamentarians.json')
    args = parser.parse_args()
    doc = json.loads(args.directory.read_text())
    changed = split_pinned(doc, profiles.pinned_reference(), json.loads(profiles.REVIEWED.read_text()))
    args.directory.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(changed)} scoped restorations: {", ".join(changed)}')
