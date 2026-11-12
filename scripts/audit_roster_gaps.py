#!/usr/bin/env python3
"""Audit roster references offline. The optional SQLite snapshot is read-only.

--snapshot-dir holds local aggregate rows, including unpublished names: never commit it.
The report contains counts and missing identifiers only. Exact identifier gaps are
reported separately from identities addressable by an explicit name in another namespace.
No fuzzy name, surname-only or portrait join establishes an identity.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.roster_fold import name_key  # noqa: E402
from scripts.roster_source_profiles import reference  # noqa: E402
from parli.ingest.speaker_names import normalize_speaker  # noqa: E402

QUERIES = {
    'members': 'select person_id,full_name from members',
    'speech_names': "select person_id,coalesce(nullif(speaker_name_clean,''),speaker_name),chamber,state,count(*) from speeches group by 1,2,3,4",
    'votes': 'select person_id,count(*) from votes group by person_id',
    'state_votes': 'select person_id,person_name,count(*) from ext_votes group by person_id,person_name',
    'interests': 'select person_id,count(*) from mp_interests group by person_id',
    'interests_register': 'select person_id,member_name,count(*) from ext_interests group by person_id,member_name',
    'interests_documents': 'select person_id,member_name,count(*) from ext_interests_documents group by person_id,member_name',
    'committee': 'select kind,name,count(*) from ext_committee_attendance group by kind,name',
    'donation_recipients': 'select recipient,count(*) from donations group by recipient',
    'state_donation_recipients': 'select recipient,recipient_type,count(*) from ext_donations group by recipient,recipient_type',
}


def snapshot(db, directory):
    directory.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(f'{db.resolve().as_uri()}?mode=ro', uri=True) as conn:
        for name, query in QUERIES.items():
            rows = list(conn.execute(query))
            (directory / f'{name}.json').write_text(json.dumps(rows))
            print(f'Snapshotted {name}: {len(rows)} groups', file=sys.stderr, flush=True)


def key(name):
    return name_key(normalize_speaker(str(name or '')) or name)


def names(p):
    return {key(n) for n in [p['name'], p.get('full', ''), *p.get('aliases', []), *p.get('prints', [])] if n}


class Index:
    def __init__(self, roster, bundle):
        self.people = roster['people']
        self.ids = defaultdict(set)
        self.names = defaultdict(set)
        self.exact = defaultdict(set)
        for i, p in enumerate(self.people):
            self.exact[key(p['name'])].add(i)
            if p.get('pid'):
                self.ids[str(p['pid'])].add(i)
            for n in names(p):
                self.names[n].add(i)
        self.catalog = {p['person_id']: p for p in bundle['people']}

    def one_identity(self, found):
        identities = {str(self.people[i].get('pid') or f'row:{i}') for i in found}
        return max(found, key=lambda i: self.people[i].get('speeches') or 0) if len(identities) == 1 else None

    def by_name(self, name):
        found = self.exact.get(key(name)) or self.names.get(key(name), set())
        return self.one_identity(found)

    def resolve(self, pid, name):
        found = self.ids.get(str(pid), set()) if pid else set()
        if found:
            return self.one_identity(found)
        p = self.catalog.get(pid)
        if p:
            found = self.ids.get(str(p.get('legacy_person_id')), set())
            if found:
                return self.one_identity(found)
            found = {i for n in names(p) if (i := self.by_name(n)) is not None}
            return self.one_identity(found)
        return self.by_name(name)


def audit(roster, bundle, local, public):
    index = Index(roster, bundle)
    refs = defaultdict(list)
    members = dict(local['members'])
    for pid, name, chamber, _state, count in local['speech_names']:
        refs['speeches'].append((pid, name, count))
        if 'committee' in (chamber or ''):
            refs['committees'].append((pid, name, count))
    for pid, count in local['votes']:
        refs['divisions_votes'].append((pid, members.get(pid), count))
    for pid, name, count in local['state_votes']:
        refs['divisions_votes'].append((pid, name, count))
    for pid, p in public['votes'].items():
        if not pid.startswith('_') and isinstance(p, dict):
            refs['divisions_votes'].append((pid, p['name'], p.get('divisions_total', 0)))
    for pid, count in local['interests']:
        refs['interests'].append((pid, members.get(pid), count))
    for table in ['interests_register', 'interests_documents']:
        refs['interests'].extend(local[table])
    # n-* files are name keys, not person identifiers.
    for name, pid in public['interests'].get('_by_name', {}).items():
        refs['interests'].append((pid if str(pid).isdigit() else None, name, 1))
    candidates = [c for contest in bundle['contests'] for c in contest['candidates']]
    refs['candidacies'] = [(c.get('person_id'), c['name'], 1) for c in candidates]
    # Only recorded ministers may have directory profiles. Officials are not MPs.
    for kind, name, count in local['committee']:
        if kind == 'minister':
            refs['committees'].append((None, name, count))
    refs['donation_recipients'] = [(None, name, count) for name, count in local['donation_recipients']]
    refs['donation_recipients'] += [(None, name, count) for name, kind, count in local['state_donation_recipients'] if kind == 'candidate']
    service_ids = {t['person_id'] for t in bundle['terms']}
    refs['service_records'] = [(p['person_id'], n, 1) for p in bundle['people'] if p['person_id'] in service_ids
                               for n in [p['name'], *p.get('aliases', [])]]
    sections, all_missing, variants = {}, set(), set()
    for category, rows in refs.items():
        ids, missing, unresolved, failed_names = set(), set(), set(), set()
        addressable_names, unmatched_names = set(), set()
        for pid, name, count in rows:
            if pid:
                ids.add(pid)
                # Catalog ids resolve through their own verified legacy id, never by their spelling.
                target = index.catalog.get(pid)
                exact = target.get('legacy_person_id') if target else pid
                if str(exact) not in index.ids:
                    missing.add(pid)
                owner = index.resolve(pid, name)
                if owner is None:
                    unresolved.add(pid)
                elif name and key(name) not in names(index.people[owner]):
                    failed_names.add((pid, key(name)))
            elif name:
                if index.by_name(name) is not None:
                    addressable_names.add(key(name))
                else:
                    unmatched_names.add(key(name))
        sections[category] = dict(referenced_ids=len(ids), missing_exact_ids=len(missing),
                                  missing_profile_ids=len(unresolved), unresolved_name_variants=len(failed_names),
                                  idless_names_addressable=len(addressable_names), idless_names_unmatched=len(unmatched_names),
                                  missing_ids=sorted(missing), missing_profile_identifiers=sorted(unresolved))
        all_missing.update(missing)
        variants.update(failed_names)
    holders = {t['person_id'] for t in bundle['terms']}
    service = [p for p in bundle['people'] if p['person_id'] in holders]
    return dict(scope='All cached SQLite references (including pre-1993 speeches), plus published votes, interests and current electorate reference; unique ids and (id, normalised name) pairs, not record sums.',
                roster_people=len(roster['people']), categories=sections,
                total_distinct_missing_exact_ids=len(all_missing), total_unresolved_name_variants=len(variants),
                service_people_without_directory=sum(index.resolve(p['person_id'], p['name']) is None for p in service),
                service_people_without_legacy_id=sum(not p.get('legacy_person_id') for p in service),
                unlinked_candidacies=sum(not c.get('person_id') for c in candidates),
                elected_candidacies_unlinked=sum(c.get('elected') and not c.get('person_id') for c in candidates),
                notes=['Donation recipients and committee attendance carry names, not person ids; unmatched names include parties, unelected candidates and officials and are not evidence of missing MPs.',
                       'A missing exact id can be an alternative namespace, a pre-1993 member, a parser stub, a witness or an incorrect attribution; it is not automatically a missing person.',
                       'Name-variant failures include conflicting attributions. They must not automatically become aliases.'])


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db', type=Path, help='Create a fresh local aggregate snapshot from this read-only SQLite database')
    p.add_argument('--snapshot-dir', type=Path, required=True)
    p.add_argument('--roster', type=Path, default=ROOT / 'portal/public/parliamentarians.json')
    p.add_argument('--reference', type=Path)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    if a.db:
        snapshot(a.db, a.snapshot_dir)
    local = {name: json.loads((a.snapshot_dir / f'{name}.json').read_text()) for name in QUERIES}
    public = {k: json.loads((ROOT / 'portal/public' / f).read_text()) for k, f in [('votes', 'votes.json'), ('interests', 'interests/index.json')]}
    bundle = json.loads(a.reference.read_text()) if a.reference else reference()
    result = audit(json.loads(a.roster.read_text()), bundle, local, public)
    a.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in ('categories', 'notes')}))


if __name__ == '__main__':
    main()
