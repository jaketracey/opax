#!/usr/bin/env python3
"""Prepare or export state electorate observations without any database or network writes.

Prepare parses retained official source bodies outside the repository. Export is
fully offline and uses the versioned observations and held Wikidata bindings.
Use fetch for a single official list or its linked resource; refusals pause a site.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.electorates import canonical_json, export_bundle, stable_id
from parli.ingest.state_members import (
    STATES, fetch_page, join_state_members, parse_act, parse_sa, parse_tas,
    source_observation, wikidata_observations,
    name_key,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/state-members'


def prepare(evidence: Path) -> dict:
    records = json.loads((evidence / 'acquisition.json').read_text())

    def record(state, label):
        hits = [r for r in records if r['state'] == state and f'-{label}-' in r.get('path', '') and r['status'] == 200]
        if len(hits) != 1:
            raise ValueError(f'Expected one retained source for {state}/{label}')
        r = hits[0]
        raw = (evidence / r['path']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != r['sha256']:
            raise ValueError('Retained source digest mismatch')
        return r, raw

    observations = []
    r, raw = record('act', 'members')
    observations.append(dict(source_observation(r, 'ACT Legislative Assembly current members'),
                             chamber='act_la', members=parse_act(raw)))
    for chamber, label in [('sa_ha', 'assembly-api'), ('sa_lc', 'council-api')]:
        r, raw = record('sa', label)
        members = parse_sa(raw, statewide='South Australia' if chamber == 'sa_lc' else None)
        observations.append(dict(source_observation(r, 'South Australian Parliament current members: ' + chamber),
                                 chamber=chamber, members=members))
    for chamber, label, directory_label in [('tas_ha', 'assembly-xlsx', 'assembly-current'),
                                           ('tas_lc', 'council-xlsx', 'council-current')]:
        r, raw = record('tas', label)
        directory_record, directory = record('tas', directory_label)
        observation = source_observation(r, 'Tasmanian Parliament current members: ' + chamber)
        observation['sources'] += source_observation(directory_record, 'Tasmanian Parliament member directory')['sources']
        observations.append(dict(observation, chamber=chamber, members=parse_tas(raw, directory, chamber)))
    # These are already-held official observations, not requests around a refusal.
    held = json.loads((ROOT / 'scripts/roster_state_evidence.json').read_text())['snapshots']
    for state, chamber, on in [('qld', 'qld_la', '2026-06-02'), ('nsw', 'nsw_lc', '2026-09-25')]:
        snapshot = next(s for s in held if (s['jurisdiction'], s['chamber'], s['as_of']) == (state, chamber, on))
        digest = snapshot.get('sha256') or hashlib.sha256(canonical_json(snapshot).encode()).hexdigest()
        sid = stable_id('source', f'held-official-state-list:{state}:{chamber}:{on}:{digest}')
        source = dict(source_id=sid, label=f'OPAX held official {chamber} member list, {on}',
                      url=snapshot['source_url'], fetched_at=on, sha256=digest,
                      checksum_scope='Retained source digest' if snapshot.get('sha256') else 'OPAX held transcription, not the raw PDF')
        members = [dict(name=m['name'], aliases=m.get('aliases', []), party=m.get('party'),
                        electorate=m['electorate'], source_key=f'held:{state}:{chamber}:{m["name"]}')
                   for m in snapshot['members']]
        observations.append(dict(jurisdiction=state, chamber=chamber, as_of=on,
                                 basis='official_current_list', sources=[source], members=members))
    # Carry already-reviewed cross-jurisdiction print aliases into the state
    # observation. This keeps an existing initials profile's canonical address
    # when its official list prints the full name. Never infer an initials match.
    identity_path = ROOT / 'scripts/person_identity.json'
    identity = json.loads(identity_path.read_text())['same_person']
    manifest = json.loads((ROOT / 'portal/public/electorates/manifest.json').read_text())
    reference = json.loads((ROOT / 'portal/public' / manifest['reference_url'].lstrip('/')).read_text())
    by_legacy = {str(p['legacy_person_id']): p for p in reference['people'] if p.get('legacy_person_id')}
    catalog = json.loads((ROOT / 'portal/public/parliamentarians.json').read_text())['people']
    reviewed = {name_key(n): v['key'] for n, v in identity.items()}
    digest = hashlib.sha256(identity_path.read_bytes()).hexdigest()
    sid = stable_id('source', 'opax:reviewed-person-identity:' + digest)
    for observation in observations:
        added = False
        for person in catalog:
            key = reviewed.get(name_key(person['name']))
            known = by_legacy.get(str(key))
            if (not known or observation['jurisdiction'] not in person.get('states', [])
                    or observation['chamber'] not in person.get('chambers', [])):
                continue
            known_names = {name_key(n) for n in [known['name'], *known.get('aliases', [])]}
            for member in observation['members']:
                if known_names & {name_key(n) for n in [member['name'], *member.get('aliases', [])]}:
                    if person['name'] not in [member['name'], *member.get('aliases', [])]:
                        member['aliases'] = [*member.get('aliases', []), person['name']]
                        added = True
        if added:
            observation['sources'].append(dict(source_id=sid, label='OPAX reviewed person identity mapping',
                url='https://github.com/jaketracey/opax/blob/00150690c7c7b8b8f1888a29c805c0090d6cbcce/scripts/person_identity.json',
                sha256=digest, checksum_scope='Retained OPAX reviewed identity configuration'))
    return dict(schema_version=1, observations=observations)


def export(directory: Path, generated: str, log: Path):
    manifest = json.loads((directory / 'manifest.json').read_text())
    release = directory / 'releases' / manifest['release_id']
    bundle = json.loads((release / 'reference.json').read_text())
    index = json.loads((release / 'index.json').read_text())
    protected = {e['electorate_id']: json.loads((release / (e['electorate_id'] + '.json')).read_text())
                 for e in index['electorates'] if e['jurisdiction'] in ('vic', 'federal')}
    held = json.loads((DATA / 'held-wikidata.json').read_text())
    official = json.loads((DATA / 'official-lists.json').read_text())['observations']
    catalog = json.loads((ROOT / 'portal/public/parliamentarians.json').read_text())['people']
    out, issues = join_state_members(bundle, [*wikidata_observations(held), *official], catalog=catalog)
    new = export_bundle(out, directory, generated=generated, preserved_details=protected)
    log.write_text(json.dumps(dict(before_release=manifest['release_id'], after_release=new['release_id'],
                                   issues=issues, issue_counts=dict(Counter(i['reason'] for i in issues))), indent=2) + '\n')
    print(json.dumps(dict(release_id=new['release_id'], issues=len(issues), protected_details=len(protected))))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('fetch')
    p.add_argument('--evidence', type=Path, required=True)
    p.add_argument('--state', choices=sorted(STATES), required=True)
    p.add_argument('--url', required=True)
    p.add_argument('--label', required=True)
    p = sub.add_parser('prepare')
    p.add_argument('--evidence', type=Path, required=True)
    p.add_argument('--out', type=Path, default=DATA / 'official-lists.json')
    p = sub.add_parser('export')
    p.add_argument('--directory', type=Path, default=ROOT / 'portal/public/electorates')
    p.add_argument('--generated', required=True)
    p.add_argument('--log', type=Path, required=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    if args.command == 'fetch':
        path = fetch_page(args.evidence, args.state, args.url, args.label)
        if path is None:
            raise SystemExit(3)
        print(path)
    elif args.command == 'prepare':
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(prepare(args.evidence), ensure_ascii=False, indent=2) + '\n')
    else:
        export(args.directory, args.generated, args.log)


if __name__ == '__main__':
    main()
