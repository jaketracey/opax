#!/usr/bin/env python3
"""Offline metadata-only speaker plan. No network, credentials, or mutations.

The phase-1 GID membership is retained. Every GID is independently resolved
through cached XML/People before its identity can enter the relabel plan.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.audit.speaker_attribution_check import read_db, match_oa, day_paragraphs
from parli.ingest.openaustralia_xml import People, FOLDERS, parse_speech, plain
from parli.ingest.speaker_roles import chair_role

REQUIRED = [('10932', 'Melissa McIntosh'), ('10880', 'Milton Dick'),
            ('10711', 'Sarah Hanson-Young')]
OWNED_LABELSETS = {'party', 'speaker_type', 'chair_role'}
GAMBLING = re.compile(r'\b(?:gambl\w*|pokies|poker machines?|wager\w*|sports betting|online betting)\b', re.I)
REFORM = re.compile(r'\b(?:reform\w*|regulat\w*|legislation|amendment\w*|bill|ban\w*|restrict\w*|advertis\w*|harm|minimi\w*|protect\w*|policy)\b', re.I)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded(value) + b'\n')


def jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('wb') as stream:
        for row in rows:
            stream.write(encoded(row) + b'\n')


def read_lines(path):
    with path.open() as stream:
        for line in stream:
            yield json.loads(line)


def labels(resource, labelset):
    return [c['label'] for c in resource.get('usermetadata', {}).get('classifications', [])
            if c['labelset'] == labelset and not c.get('cancelled_by_user')]


def metadata_fields(resource):
    return {k: deepcopy(resource.get(k, {})) for k in ('origin', 'usermetadata', 'extra')}


def gambling_reform(text):
    """Reproducible lexical proxy; a gambling and policy term within 100 words."""
    for mention in GAMBLING.finditer(text):
        for policy in REFORM.finditer(text):
            lo, hi = sorted([mention.start(), policy.start()])
            if len(text[lo:hi].split()) <= 100:
                return True
    return False


def turn_record(turn, stage=None):
    source_id = str(turn['person_id']) if turn.get('person_id') else None
    kind, role = turn['speaker_type'], turn.get('chair_role')
    if stage:
        m = stage['extra']['metadata']
        stage_id = m.get('person_id') or m.get('chair_person_id')
        if (str(stage_id) if stage_id else None) != source_id:
            raise ValueError('Staged/XML identity conflict: ' + turn['gid'])
        stage_role = next(iter(labels(stage, 'chair_role')), None)
        # Phase 1 additionally established an office-role from the primary
        # HTML party field. That evidence remains valid for role labels.
        if stage_role:
            kind, role = 'chair', stage_role
    return {'gid': turn['gid'], 'person_id': source_id,
            'name': turn.get('person_name') or turn['speaker'],
            'printed_name': turn['speaker'], 'office_id': turn.get('oa_office_id'),
            'speaker_type': kind, 'chair_role': role, 'talktype': turn['talktype'],
            'word_count': len(turn['text'].split()),
            'text_sha256': hashlib.sha256(turn['text'].encode()).hexdigest(),
            'gambling_reform_lexical_match': gambling_reform(turn['text']),
            'gambling_excerpt': next((turn['text'][max(0,m.start()-100):m.end()+180]
                for m in GAMBLING.finditer(turn['text'])), '')}


def participants(turns):
    grouped = {}
    for turn in turns:
        key = (turn['person_id'], turn['name'], turn['speaker_type'])
        p = grouped.setdefault(key, {'person_id': turn['person_id'], 'name': turn['name'],
            'speaker_type': turn['speaker_type'], 'office_ids': set(), 'turn_gids': [],
            'chair_roles': set()})
        if turn.get('office_id'):
            p['office_ids'].add(turn['office_id'])
        p['turn_gids'].append(turn['gid'])
        if turn.get('chair_role'):
            p['chair_roles'].add(turn['chair_role'])
    return [{**p, 'office_ids': sorted(p['office_ids']), 'chair_roles': sorted(p['chair_roles'])}
            for p in grouped.values()]


def mixed_payload(resource, source_participants):
    payload = metadata_fields(resource)
    payload['origin']['collaborators'] = []
    classifications = payload['usermetadata'].setdefault('classifications', [])
    payload['usermetadata']['classifications'] = [c for c in classifications
        if c['labelset'] not in OWNED_LABELSETS]
    payload['usermetadata']['classifications'].append({'labelset': 'speaker_type', 'label': 'multi_speaker'})
    roles = sorted({role for p in source_participants for role in p['chair_roles']})
    payload['usermetadata']['classifications'] += [{'labelset': 'chair_role', 'label': role} for role in roles]
    m = payload['extra'].setdefault('metadata', {})
    m.setdefault('legacy_speaker_raw', m.get('speaker_raw'))
    m.update({'person_id': None, 'speaker_raw': 'Multiple speakers',
        'speaker_attribution': 'multi_speaker', 'attribution_version': 3,
        'speaker_participants': deepcopy(source_participants),
        'speaker_person_ids': sorted({p['person_id'] for p in source_participants
                                     if p['person_id'] and p['speaker_type'] == 'member'}),
        'participant_person_ids': sorted({p['person_id'] for p in source_participants if p['person_id']}),
        'chair_roles': roles, 'speaker_facet_policy': 'exclude_multi_speaker'})
    m.pop('chair_person_id', None)
    return payload


def chair_payload(resource, role, chair_person_id, source_participants):
    payload = metadata_fields(resource)
    payload['origin']['collaborators'] = []
    classifications = payload['usermetadata'].setdefault('classifications', [])
    payload['usermetadata']['classifications'] = [c for c in classifications
        if c['labelset'] not in OWNED_LABELSETS] + [
        {'labelset': 'speaker_type', 'label': 'chair'}, {'labelset': 'chair_role', 'label': role}]
    m = payload['extra'].setdefault('metadata', {})
    m.setdefault('legacy_speaker_raw', m.get('speaker_raw'))
    m.update({'person_id': None, 'speaker_raw': role, 'chair_person_id': str(chair_person_id),
        'speaker_attribution': 'chair', 'attribution_version': 3, 'chair_roles': [role],
        'speaker_participants': deepcopy(source_participants), 'speaker_person_ids': [],
        'speaker_facet_policy': 'exclude_chair'})
    return payload


def batch_ranges(total):
    start, index = 0, 0
    while start < total:
        size = [200, 1000, 5000][min(index, 2)]
        end = min(total, start + size)
        yield index + 1, start, end
        start, index = end, index + 1


def projected_catalog(resources, plan_rows, completed):
    patches = {p['resource_id']: p['payload'] for p in plan_rows[:completed]}
    return [{**r, **patches[r['id']]} if r['id'] in patches else r for r in resources]


def facet_counts(resources):
    counts = Counter()
    for resource in resources:
        counts.update(set(resource.get('origin', {}).get('collaborators', [])))
    return counts


def compare_person(pid, name, resources, source_docs, applied_ids):
    facet = {r['id'] for r in resources if name in r.get('origin', {}).get('collaborators', [])}
    by_id = {r['id']: r for r in resources}
    correct, uncertain, wrong = set(), set(), set()
    independent_exclusive = set()
    source_memberships = set()
    source_turn_gids = set()
    for row in source_docs:
        member_pids = {p['person_id'] for p in row['source_participants']
                       if p['speaker_type'] == 'member' and p['person_id']}
        if pid in member_pids:
            source_memberships.add(row['resource_id'])
            source_turn_gids.update(g for p in row['source_participants']
                if p['person_id'] == pid and p['speaker_type'] == 'member' for g in p['turn_gids'])
        if member_pids == {pid} and not any(p['speaker_type'] != 'member' for p in row['source_participants']):
            independent_exclusive.add(row['resource_id'])
        if row['resource_id'] not in facet:
            continue
        if row['source_status'] not in {'xml_people_verified', 'audited_party_role'}:
            uncertain.add(row['resource_id'])
        elif row['resource_id'] in independent_exclusive:
            correct.add(row['resource_id'])
        else:
            wrong.add(row['resource_id'])
    # The strong batch assertion is scoped to changed resources; legacy
    # anomalies on deliberately untouched rows must remain visible separately.
    changed_wrong = wrong & applied_ids
    return {'person_id': pid, 'name': name, 'facet_documents': len(facet),
        'source_confirmed_exclusive_documents': len(independent_exclusive),
        'facet_source_confirmed_exclusive': len(correct), 'facet_nonexclusive_or_wrong': len(wrong),
        'facet_source_unresolved': len(uncertain), 'source_membership_documents': len(source_memberships),
        'source_distinct_member_turns': len(source_turn_gids),
        'changed_documents_in_facet': len(facet & applied_ids),
        'changed_nonexclusive_documents_in_facet': len(changed_wrong),
        'unchanged_nonexclusive_slugs': sorted(by_id[r]['slug'] for r in wrong - applied_ids)}


def build(args):
    args.output.mkdir(parents=True, exist_ok=True)
    original = json.loads((args.audit / 'openaustralia-catalog.json').read_text())
    catalog = json.loads(args.catalog.read_text()) if args.catalog else original
    original_ids = {r['id'] for r in original['resources']}
    current = {r['id']: r for r in catalog['resources']}
    if missing := original_ids - current.keys():
        raise ValueError(f'Original catalog has {len(missing)} missing live RIDs')
    resources = [current[r['id']] for r in original['resources']]
    by_rid = {r['id']: r for r in resources}
    manifest = list(read_lines(args.repair / 'repair-manifest.jsonl'))
    by_manifest = {p['resource_id']: p for p in manifest}
    conflicts = json.loads((args.repair / 'identity-conflicts.json').read_text())
    conflict_slugs = {r['old_slug'] for r in conflicts}
    skipped = []
    for p in manifest:
        if p['action'] == 'unresolved-source' or p['old_slug'] in conflict_slugs:
            skipped.append({**p, 'unchanged_reason': 'identity-conflict' if p['old_slug'] in conflict_slugs else 'unresolved-source'})
    dump(args.output / 'unchanged-71-plus-9.json', {'unresolved_source': [p for p in skipped
        if p['unchanged_reason'] == 'unresolved-source'], 'identity_conflicts': [
        {**c, 'resource_ids': [p['resource_id'] for p in manifest if p['old_slug'] == c['old_slug']]}
        for c in conflicts]})
    skipped_ids = {p['resource_id'] for p in skipped}
    audit = json.loads((args.audit / 'oa-source-audit.json').read_text())
    blast = json.loads((args.audit / 'blast-radius.json').read_text())
    audit_rows = {int(r['speech_id']): r for r in audit['rows']}
    audit_rows.update({int(r['speech_id']): r for r in blast['source_evidence']})
    roles = {r['resource_id']: r for r in json.loads((args.audit / 'role-audit.json').read_text())['documents']}
    stage = {}
    for operation in read_lines(args.repair / 'kb-operations.jsonl'):
        doc = operation.get('payload', {})
        m = doc.get('extra', {}).get('metadata', {})
        if m.get('gid'):
            stage[m['gid']] = {'origin': doc['origin'], 'usermetadata': doc['usermetadata'], 'extra': {'metadata': {
                k: m[k] for k in ('gid', 'person_id', 'chair_person_id') if k in m}}}
    gids_by_sid = {}
    rids_by_sid = defaultdict(list)
    for resource in resources:
        sid = int(resource['slug'].removeprefix('speech-'))
        rids_by_sid[sid].append(resource['id'])
        p = by_manifest.get(resource['id'], {})
        gids_by_sid[sid] = p.get('gids') or [t['gid'] for t in audit_rows.get(sid, {}).get('source_turns', [])]
    wanted = {gid for gids in gids_by_sid.values() for gid in gids}
    source_turns = {}
    db = read_db(args.db)
    people = People((args.cache / 'people.xml').read_bytes(), [(args.cache / f).read_bytes()
        for f in ('representatives.xml', 'senators.xml')], db)
    dates = {}
    sids = list(gids_by_sid)
    for offset in range(0, len(sids), 400):
        chunk = sids[offset:offset+400]
        for row in db.execute('SELECT speech_id,date,chamber,person_id,party,speaker_name,text FROM speeches WHERE speech_id IN ('
                + ','.join('?' for _ in chunk) + ')', chunk):
            dates[row['speech_id']] = dict(row)
    receipts = [{'path': str(args.cache / f), 'sha256': hashlib.sha256((args.cache / f).read_bytes()).hexdigest()}
                for f in ('people.xml', 'representatives.xml', 'senators.xml')]
    for count, (house, day) in enumerate(sorted({(r['chamber'], r['date']) for r in dates.values()}), 1):
        path = args.cache / 'raw' / FOLDERS[house] / (day + '.xml')
        if not path.exists():
            path = args.repair / 'sources' / (day + '.xml')
        if not path.exists():
            continue
        raw = path.read_bytes()
        receipts.append({'path': str(path), 'sha256': hashlib.sha256(raw).hexdigest()})
        # The preliminary audit predates the stock-phrase ambiguity guard.
        # Recompute untouched catalog membership rather than treating those
        # preliminary matches as independent proof of an additional speaker.
        independent_day = day_paragraphs(path, people.by_office)
        for sid, row in dates.items():
            if row['chamber'] != house or row['date'] != day:
                continue
            rids = rids_by_sid[sid]
            if any(by_manifest.get(rid, {}).get('gids') for rid in rids):
                continue
            check = match_oa(row, independent_day)
            gids_by_sid[sid] = [t['gid'] for t in check['source_turns']]
            wanted.update(gids_by_sid[sid])
        topic = ''
        for node in ET.fromstring(raw):
            if node.tag == 'major-heading':
                topic = plain(node)
            elif node.tag == 'speech':
                for speech in node.iter('speech'):
                    if speech.get('id') in wanted:
                        t = parse_speech(speech, house, day, people, topic)
                        source_turns[t['gid']] = turn_record(t, stage.get(t['gid']))
        if count % 100 == 0:
            print(f'Independently verified {count} XML chamber-days; {len(source_turns)} required turns', flush=True)
    db.close()
    represented_gids = {gid for gids in gids_by_sid.values() for gid in gids}
    source_turns = {gid: t for gid, t in source_turns.items() if gid in represented_gids}
    plan_rows, source_docs = [], []
    for resource in resources:
        rid, slug = resource['id'], resource['slug']
        sid = int(slug.removeprefix('speech-'))
        m = by_manifest.get(rid)
        gids = gids_by_sid[sid]
        available = [source_turns[g] for g in gids if g in source_turns]
        source_participants = participants(available)
        status = 'xml_people_verified' if gids and len(available) == len(gids) else 'unresolved_source'
        if rid in roles and (not m or m.get('action') == 'chair-label-only'):
            role = chair_role(roles[rid]['party'])
            for p in source_participants:
                p['speaker_type'], p['chair_roles'] = 'chair', [role]
            if not source_participants:
                source_participants = [{'person_id': str(roles[rid]['person_id']),
                    'name': dates[sid]['speaker_name'], 'speaker_type': 'chair',
                    'office_ids': [], 'turn_gids': [], 'chair_roles': [role]}]
                status = 'audited_party_role'
        source_docs.append({'resource_id': rid, 'slug': slug, 'source_status': status,
            'source_participants': source_participants, 'source_gid_count': len(gids),
            'source_unavailable_gids': sorted(set(gids) - source_turns.keys()),
            'source_expanded_gids': m.get('source_expanded_gids', []) if m else [],
            'approved_action': m['action'] if m else 'unchanged',
            'deliberately_unchanged': rid in skipped_ids,
            'before_collaborators': resource.get('origin', {}).get('collaborators', []),
            'before_person_id': resource.get('extra', {}).get('metadata', {}).get('person_id')})
        if not m or rid in skipped_ids:
            continue
        if m['action'] == 'chair-label-only':
            payload = chair_payload(resource, m['role'], roles[rid]['person_id'], source_participants)
            action = 'chair-label-only'
        else:
            if status != 'xml_people_verified':
                raise ValueError('Planned mixed document has unresolved GIDs: ' + slug)
            payload = mixed_payload(resource, source_participants)
            action = 'relabel-multi-speaker'
        plan_rows.append({'resource_id': rid, 'slug': slug, 'action': action, 'method': 'PATCH',
            'payload': payload, 'expected': metadata_fields(resource),
            'before_metadata_sha256': digest(metadata_fields(resource)),
            'owned_labelsets': sorted(OWNED_LABELSETS), 'source_status': status,
            'source_participants': source_participants,
            'source_gid_count': len(gids), 'source_expanded_gids': m.get('source_expanded_gids', []),
            'preserve': ['slug', 'title', 'texts', 'summary', 'topic_labels', 'computedmetadata', 'fieldmetadata']})
    plan_rows.sort(key=lambda p: digest(['opax-speaker-relabel-2026-10-13', p['slug'], p['resource_id']]))
    if len({r['resource_id'] for r in plan_rows}) != len(plan_rows):
        raise ValueError('Duplicate resource in relabel plan')
    before_counts = facet_counts(resources)
    after_resources = projected_catalog(resources, plan_rows, len(plan_rows))
    after_counts = facet_counts(after_resources)
    pid_names = {p['person_id']: p['name'] for d in source_docs for p in d['source_participants'] if p['person_id']}
    batch_projections = []
    for number, start, end in batch_ranges(len(plan_rows)):
        changed = plan_rows[start:end]
        touched_pids = {p['person_id'] for d in changed for p in d['source_participants'] if p['person_id']
                        and p['speaker_type'] == 'member'}
        random = sorted(touched_pids - {pid for pid, _ in REQUIRED},
            key=lambda pid: digest(['opax-speaker-relabel-batch', number, pid]))[:5]
        projected = projected_catalog(resources, plan_rows, end)
        applied_ids = {p['resource_id'] for p in plan_rows[:end]}
        tests = [compare_person(pid, name, projected, source_docs, applied_ids)
                 for pid, name in REQUIRED + [(pid, pid_names[pid]) for pid in random]]
        for test in tests:
            test['baseline_facet_documents'] = before_counts[test['name']]
            test['expected_after'] = test['facet_documents']
            test['applied_delta'] = test['facet_documents'] - test['baseline_facet_documents']
        batch_projections.append({'batch': number, 'size': end-start, 'start': start, 'end': end,
            'resource_ids': [p['resource_id'] for p in changed], 'random_person_ids': random,
            'facet_against_source': tests, 'expected_changed_nonexclusive_facets': 0,
            'expected_resource_total': len(resources), 'expected_new_duplicate_slugs': 0,
            'preexisting_duplicate_slug_count': len(resources)-len({r['slug'] for r in resources})})
    gambling_turns = {gid: t for gid, t in source_turns.items()
                     if t['speaker_type'] == 'member' and t['person_id'] and t['gambling_reform_lexical_match']}
    gambling_counts, gambling_words = Counter(), Counter()
    for turn in gambling_turns.values():
        gambling_counts[turn['person_id']] += 1
        gambling_words[turn['person_id']] += turn['word_count']
    gambling_facet_before = facet_counts([r for r in resources if 'gambling' in labels(r, 'topic')])
    gambling_facet_after = facet_counts([r for r in after_resources if 'gambling' in labels(r, 'topic')])
    gambling = {'method': 'Distinct XML turn GIDs represented by original OA catalog; gambling term and policy term within 100 words. Lexical proxy, not semantic classification.',
        'gambling_regex': GAMBLING.pattern, 'policy_regex': REFORM.pattern,
        'source_turn_count': len(gambling_turns), 'ranking': [{'person_id': pid, 'name': pid_names[pid],
            'source_distinct_turns': n, 'source_turn_words': gambling_words[pid],
            'topic_gambling_facet_before': gambling_facet_before[pid_names[pid]],
            'topic_gambling_facet_after': gambling_facet_after[pid_names[pid]]}
            for pid, n in gambling_counts.most_common()],
        'topic_gambling_documents': sum('gambling' in labels(r, 'topic') for r in resources),
        'topic_gambling_facet_before': dict(gambling_facet_before),
        'topic_gambling_facet_after': dict(gambling_facet_after),
        'facet_limit': 'Speaker facets intentionally omit mixed documents. Existing gambling topic labels are preserved and can cover several speakers; these facets cannot establish the overall source-turn leader.',
        'coverage_limit': 'Original OpenAustralia KB catalog only; no claim about other Hansard sources or unresolvable documents.'}
    jsonl(args.output / 'relabel-plan.jsonl', plan_rows)
    jsonl(args.output / 'source-documents.jsonl', source_docs)
    jsonl(args.output / 'source-turns.jsonl', source_turns.values())
    dump(args.output / 'source-receipts.json', receipts)
    dump(args.output / 'batch-projections.json', batch_projections)
    dump(args.output / 'gambling-reform.json', gambling)
    dump(args.output / 'facet-counts-before-after.json', [{'name': name, 'before': before_counts[name],
        'after': after_counts[name], 'delta': after_counts[name]-before_counts[name]} for name in sorted(before_counts.keys() | after_counts.keys())])
    applied_ids = {p['resource_id'] for p in plan_rows}
    selected = [compare_person(pid, name, after_resources, source_docs, applied_ids) for pid, name in REQUIRED]
    for test in selected:
        test['baseline_facet_documents'] = before_counts[test['name']]
        test['expected_after'] = test['facet_documents']
        test['applied_delta'] = test['facet_documents'] - test['baseline_facet_documents']
    dump(args.output / 'facet-against-source.json', selected)
    summary = {'offline_only': True, 'kb_writes': 0, 'generation_calls': 0,
        'catalog_at': catalog.get('at'), 'original_catalog_at': original.get('at'),
        'original_catalog_documents': len(resources), 'current_catalog_new_rids_out_of_scope': len(current.keys()-original_ids),
        'plan_counts': dict(Counter(p['action'] for p in plan_rows)), 'planned_metadata_patches': len(plan_rows),
        'unchanged_counts': dict(Counter(p['unchanged_reason'] for p in skipped)),
        'payload_bytes': sum(len(encoded(p['payload'])) for p in plan_rows),
        'new_resources': 0, 'new_slugs': 0, 'changed_texts': 0, 'new_summaries': 0,
        'changed_topic_labels': 0, 'enrichment_queue_operations': 0,
        'facet_policy': 'Exclude mixed documents from collaborator/person facets; retain verified participants in extra metadata. This stops sole-first-speaker credit without crediting every participant for all words.',
        'independently_verified_source_turns': len(source_turns),
        'source_turns_resolved_without_staged_unit': len(represented_gids - stage.keys()),
        'phase1_reused_unchanged_turns_resolved_from_xml': len({g for p in manifest
            for g in p.get('gids', [])} - stage.keys()),
        'source_expanded_documents': sum(bool(p['source_expanded_gids']) for p in plan_rows),
        'source_status_counts': dict(Counter(d['source_status'] for d in source_docs)),
        'batches': [{'batch': b['batch'], 'size': b['size']} for b in batch_projections],
        'required_people_facets': selected,
        'known_preexisting_duplicate_slugs': len(resources)-len({r['slug'] for r in resources}),
        'source_membership_limit': 'Phase-1 expanded spans are retained; 3,752 original spans included short surrounding turns or source revisions. Participants are source-span metadata, not proof every XML word still occurs verbatim in the unchanged KB body.',
        'live_precondition': 'Runner must snapshot current metadata and rebase preserved labels from live resource before each patch.'}
    dump(args.output / 'summary.json', summary)
    dump(args.output / 'artifact-checksums.json', {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in args.output.iterdir() if p.is_file() and p.name != 'artifact-checksums.json' and p.suffix != '.log'})
    print(json.dumps(summary, indent=2), flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--catalog', type=Path)
    ap.add_argument('--audit', type=Path, default=Path('/home/jake/opax-work/evidence/speaker-attribution-check-20261012'))
    ap.add_argument('--repair', type=Path, default=Path('/home/jake/opax-work/evidence/speaker-attribution-repair-20261012'))
    ap.add_argument('--cache', type=Path, default=Path('/home/jake/opax-staging/oa-feed'))
    ap.add_argument('--db', type=Path, default=Path.home()/'.cache/autoresearch/parli.db')
    build(ap.parse_args())


if __name__ == '__main__':
    main()
