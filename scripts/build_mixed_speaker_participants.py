#!/usr/bin/env python3
"""Read-only participant export from the reviewed XML/People relabel evidence.

Print a dry-run artifact; never opens a KB client or writes the source database.
The source span is the relabel's reviewed span, including recorded XML revisions.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sqlite3


def gid_order(gid):
    return tuple(int(n) for n in re.findall(r'\d+', gid))


def participants(source, turns):
    ordered = []
    excluded = 0
    for participant in source:
        for gid in participant['turn_gids']:
            turn = turns[gid]
            if str(turn.get('person_id')) != str(participant.get('person_id')):
                raise ValueError('Source identity disagreement: ' + gid)
            if turn['speaker_type'] not in ('member', 'chair') or not str(turn.get('person_id', '')).isdigit():
                excluded += 1
                continue
            role = turn.get('chair_role') or (', '.join(participant.get('chair_roles', [])) or 'Chair' if participant['speaker_type'] == 'chair' else None)
            ordered.append((gid_order(gid), {'name': turn['name'], 'person_id': str(turn['person_id']),
                                           **({'role': role} if role else {})}))
    ordered.sort(key=lambda pair: pair[0])
    result, seen = [], set()
    for _, p in ordered:
        key = (p['person_id'], p.get('role'))
        if key not in seen:
            seen.add(key)
            result.append(p)
    return result, excluded


def build(database, plan):
    db = sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True)
    db.execute('PRAGMA query_only=ON')
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    columns = [r[1] for r in db.execute('PRAGMA table_info(speeches)')]
    turns = {r['gid']: r for r in map(json.loads, (plan / 'source-turns.jsonl').open())}
    resources, supplementary, stats = {}, {}, Counter()
    held_ids = []
    published_ids = {str(r[0]) for r in db.execute('SELECT person_id FROM members')}
    missing_ids = set()
    for row in map(json.loads, (plan / 'source-documents.jsonl').open()):
        if row['approved_action'] not in ('split', 'relabel-multi-speaker'):
            continue
        ps, excluded = participants(row['source_participants'], turns)
        speech_id = int(row['slug'].removeprefix('speech-'))
        topic = db.execute('SELECT topic FROM speeches WHERE speech_id=?', (speech_id,)).fetchone()
        entry = {'participants': ps, 'debate': topic[0] if topic and topic[0] else 'Parliamentary debate'}
        destination = resources if row['approved_action'] == 'split' else supplementary
        if row['resource_id'] in destination:
            raise ValueError('Duplicate resource ID')
        destination[row['resource_id']] = entry
        if row['deliberately_unchanged']:
            held_ids.append(row['resource_id'])
        stats['excluded_unresolved_turns'] += excluded
        stats['participant_memberships'] += len(ps)
        stats['chair_memberships'] += sum('role' in p for p in ps)
        stats['covered_resources'] += bool(ps)
        stats['source_expanded_resources'] += bool(row.get('source_expanded_gids'))
        stats['withheld_identity_conflicts'] += bool(row['deliberately_unchanged'])
        stats['debates_from_database'] += bool(topic and topic[0])
        missing_ids.update(p['person_id'] for p in ps if p['person_id'] not in published_ids)
    db.close()
    checks = {name: hashlib.sha256((plan / name).read_bytes()).hexdigest()
              for name in ('source-documents.jsonl', 'source-turns.jsonl')}
    return {'schema': 1, 'resources': resources, 'supplementary': supplementary, 'report': {
        'original_mixed_resources': len(resources), 'supplementary_reviewed_resources': len(supplementary),
        'original_covered': sum(bool(r['participants']) for r in resources.values()),
        'original_empty': sum(not r['participants'] for r in resources.values()),
        'original_participant_memberships': sum(len(r['participants']) for r in resources.values()),
        'original_chair_memberships': sum('role' in p for r in resources.values() for p in r['participants']),
        'withheld_resource_ids': sorted(held_ids),
        'resolved_people': len({p['person_id'] for r in [*resources.values(), *supplementary.values()] for p in r['participants']}),
        'xml_resolved_people_absent_from_legacy_members': sorted(missing_ids),
        **stats, 'database_schema': {'oa_speech_provenance_present': 'oa_speech_provenance' in tables, 'speeches_columns': columns},
        'source_checksums': checks, 'database_writes': 0, 'kb_writes': 0,
        'scope_note': 'Original 16512 source spans plus five later reviewed short motions; nine identity-conflict resources were held out of the relabel. XML/People is authoritative for turn identities; legacy members are a cross-check.',
        'source_limit': 'Participants describe the reviewed source span. Expanded/revised XML turns may not occur verbatim in the preserved KB body. They confer no collaborator/person credit.'}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True)
    parser.add_argument('--plan', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.database, args.plan), ensure_ascii=False, separators=(',', ':')))
