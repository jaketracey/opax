#!/usr/bin/env python3
"""Read-only speaker audit. Never calls Ask, generation, or a KB mutation.

Run with the corpus environment's Python (pyarrow and BeautifulSoup installed).
Artifacts go to --output, never to the source database or corpus directories.
Commands: catalog, prepare, texts, review, oa, size, roles, summary, selfcheck.
Example: --output /path/to/audit-evidence prepare --desktop-sample.
The live counts and the desktop sample deliberately have different coverage.
"""
from __future__ import annotations

import argparse
from bisect import bisect_right
import csv
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import html
from io import BytesIO
import json
from pathlib import Path
import re
import sqlite3
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from parli.arag import AragConfig, KbClient, load_dotenv

PEOPLE = [
    ('Melissa McIntosh', '10932'), ('Milton Dick', '10880'),
    ('Tony Smith', '10592'), ('Sharon Claydon', '10805'),
    ("Llew O'Brien", '10892'), ('Andrew Wilkie', '10727'),
    ('Adam Bandt', '10734'), ('Bob Katter', '10352'),
    ('Penny Wong', '10678'), ('Sarah Hanson-Young', '10711'),
    ('David Fawcett', '10215'),
]


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def read_db(path):
    # The audit uses archived snapshots with empty WAL files. immutable=1 also
    # prevents SQLite from touching the source's shared-memory files.
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro&immutable=1', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    return db


def norm(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', html.unescape(value)).casefold()
                   if c.isalnum())


def labels(resource):
    return {x['labelset']: x['label'] for x in resource.get('usermetadata', {}).get('classifications', [])}


def relabel_status(resources, blast, roles):
    """Metadata-only repair status, independent of unchanged mixed words."""
    mixed_ids = {r['resource_id'] for r in blast['documents']}
    role_rows = {r['resource_id']:r for r in roles['documents']}
    flagged, unflagged, missing_roles = [], [], []
    from parli.ingest.speaker_roles import chair_role
    for resource in resources:
        rid = resource['id']
        active = {(c['labelset'],c['label']) for c in resource.get('usermetadata',{}).get('classifications',[])
                  if not c.get('cancelled_by_user')}
        if rid in mixed_ids:
            safe = (('speaker_type','multi_speaker') in active
                    and resource.get('extra',{}).get('metadata',{}).get('person_id') is None
                    and resource.get('origin',{}).get('collaborators',[]) == [])
            (flagged if safe else unflagged).append(resource['slug'])
        if rid in role_rows and ('chair_role',chair_role(role_rows[rid]['party'])) not in active:
            missing_roles.append(resource['slug'])
    return {'confirmed_mixed_documents':len(mixed_ids),'flagged_mixed_documents':len(flagged),
            'unflagged_mixed_documents':len(unflagged),'missing_chair_role_documents':len(missing_roles),
            'unflagged_mixed_slugs':sorted(unflagged),'missing_chair_role_slugs':sorted(missing_roles)}


def metadata(resource):
    return resource.get('extra', {}).get('metadata', {})


def catalog(kb, clauses, page_size=200):
    body = {'filter_expression': {'resource': {'and': clauses}},
            'show': ['basic', 'origin', 'extra'], 'page_size': page_size}
    first = kb.catalog_post(body)
    ft = first['fulltext']
    size, total = ft['page_size'], ft['total']
    rows = dict(first.get('resources', {}))
    for page in range(1, (total + size - 1) // size):
        result = kb.catalog_post(dict(body, page_number=page))
        if result['fulltext']['total'] != total:
            raise RuntimeError('Catalog changed while paging; rerun the read-only snapshot')
        rows.update(result.get('resources', {}))
    if len(rows) != total:
        raise RuntimeError(f'Incomplete catalog: {len(rows)} of {total}')
    return {'at': datetime.now(timezone.utc).isoformat(), 'total': total,
            'resources': sorted(rows.values(), key=lambda r: r['slug'])}


def collect(args):
    load_dotenv(str(args.env))
    kb = KbClient(AragConfig.from_env())
    speech = {'prop': 'label', 'labelset': 'kind', 'label': 'speech'}

    def one(person):
        name, pid = person
        result = catalog(kb, [speech, {'prop': 'origin_collaborator', 'collaborator': name}])
        dump(args.output / (pid + '-catalog.json'), result)
        print(name, result['total'], dict(Counter(labels(r).get('source') for r in result['resources'])), flush=True)

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(one, PEOPLE))
    if args.global_oa:
        result = catalog(kb, [speech, {'prop': 'label', 'labelset': 'source', 'label': 'openaustralia'}])
        dump(args.output / 'openaustralia-catalog.json', result)
        print('Global OA', result['total'], flush=True)


def prepare(args):
    db = read_db(args.db)
    hist = read_db(args.hist_db)
    result = []
    for name, pid in PEOPLE:
        cat = json.loads((args.output / (pid + '-catalog.json')).read_text())
        resources = cat['resources']
        # A fixed simple random sample of indexed documents, independent of
        # their contents. Sorting by SHA256 avoids SQL/RNG version differences.
        ranked = sorted(resources, key=lambda r: hashlib.sha256(
            ('opax-speaker-audit-2026-10-12:' + r['slug']).encode()).hexdigest())
        eligible = []
        unavailable = []
        for resource in ranked:
            sid = int(resource['slug'].removeprefix('speech-'))
            row = db.execute('SELECT * FROM speeches WHERE speech_id=?', (sid,)).fetchone()
            if row is None:
                row = hist.execute('SELECT * FROM speeches WHERE speech_id=?', (sid,)).fetchone()
            if args.desktop_sample and row is None:
                unavailable.append(resource['slug'])
            else:
                eligible.append(resource)
        chosen = eligible[:30]
        samples = []
        for resource in chosen:
            sid = int(resource['slug'].removeprefix('speech-'))
            row = db.execute('SELECT * FROM speeches WHERE speech_id=?', (sid,)).fetchone()
            if row is None:
                row = hist.execute('SELECT * FROM speeches WHERE speech_id=?', (sid,)).fetchone()
            samples.append({'resource': resource, 'row': dict(row) if row else None})
        counts = [dict(r) for r in db.execute(
            'SELECT source,count(*) n,min(date) first,max(date) last FROM speeches '
            'WHERE person_id=? GROUP BY source', (pid,))]
        item = {'name': name, 'person_id': pid, 'source_counts': counts,
                'source_total': sum(r['n'] for r in counts), 'kb_total': cat['total'],
                'kb_sources': dict(Counter(labels(r).get('source') for r in resources)),
                'kb_person_id_counts': dict(Counter(str(metadata(r).get('person_id')) for r in resources)),
                'sample_sources': dict(Counter(labels(x['resource']).get('source') for x in samples)),
                'sampling_population': 'KB documents represented in desktop and historical snapshots' if args.desktop_sample else 'All live KB speech documents for this collaborator',
                'eligible_documents': len(eligible), 'absent_from_desktop': unavailable,
                'samples': samples}
        result.append(item)
        print(name, 'DB', item['source_total'], 'KB', cat['total'], 'sample', item['sample_sources'],
              'missing_local', sum(x['row'] is None for x in samples), flush=True)
    dump(args.output / 'samples.json', result)


def sample_texts(args):
    load_dotenv(str(args.env))
    kb = KbClient(AragConfig.from_env())
    samples = json.loads((args.output / 'samples.json').read_text())
    resources = [s['resource'] for person in samples for s in person['samples']]

    def one(resource):
        path = args.output / (resource['slug'] + '-body.json')
        if not path.exists():
            result = kb.get_resource_text(resource['id'], 'body')
            dump(path, result)
        return resource['slug']

    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, slug in enumerate(pool.map(one, resources), 1):
            if i % 30 == 0:
                print('Read KB text', i, 'of', len(resources), flush=True)


def office_people(path):
    return {office.get('id'): person.get('id').rsplit('/', 1)[-1]
            for person in ET.parse(path).getroot() for office in person.findall('office')}


def day_paragraphs(path, offices):
    indexed = defaultdict(list)
    speeches = []
    for node in ET.parse(path).getroot():
        if node.tag != 'speech':
            continue
        identity = {'pid': offices.get(node.get('speakerid')), 'speaker': node.get('speakername'),
                    'office': node.get('speakerid'), 'gid': node.get('id'),
                    'talktype': node.get('talktype'), 'url': node.get('url')}
        speech_norm = ''
        for p in node.findall('.//p'):
            value = norm(''.join(p.itertext()))
            speech_norm += value
            if len(value) >= 35:
                indexed[value[:100]].append((value, identity))
        speeches.append((speech_norm, identity))
    # Search all speech bodies, including quotations nested inside a paragraph.
    # A phrase repeated in another member's quotation is ambiguous evidence.
    ends, joined, size = [], [], 0
    for value, identity in speeches:
        joined.append(value + '|')
        size += len(value) + 1
        ends.append(size)
    return indexed, speeches, ''.join(joined), ends


def match_oa(row, day):
    indexed, speeches, joined, ends = day
    by_gid = {}
    unmatched = []
    checked = matched = 0
    for para in row['text'].split('\n\n'):
        value = norm(para)
        if len(value) < 35 or value.startswith('viewthepcoawebsite'):
            continue
        checked += 1
        options = []
        position = joined.find(value)
        while position >= 0:
            options.append(speeches[bisect_right(ends, position)][1])
            position = joined.find(value, position + 1)
        # Shared stock phrases do not establish which person spoke them.
        if len({identity['pid'] or identity['speaker'] for identity in options}) > 1:
            options = []
        if options:
            matched += 1
            for identity in options:
                by_gid[identity['gid']] = identity
        else:
            unmatched.append(para[:160])
    identities = list(by_gid.values())
    pids = sorted({i['pid'] for i in identities if i['pid']})
    speakers = sorted({i['speaker'] for i in identities if i['speaker']})
    target = str(row['person_id']) if row['person_id'] else None
    return {'paragraphs_checked': checked, 'paragraphs_matched': matched,
            'unmatched_paragraphs': unmatched, 'source_pids': pids, 'source_speakers': speakers,
            'source_turns': identities, 'mixed_people': len(pids) > 1,
            'target_found': target in pids if target else None,
            'other_people': [pid for pid in pids if target and pid != target]}


def source_review(args):
    """Validate every fixed sample against a bylined source, retaining evidence."""
    from bs4 import BeautifulSoup
    import pyarrow.parquet as pq
    from parli.ingest.committee_transcript import HearingMetadata, parse_fragment
    import parli.ingest
    # The independent T1 parser is on its unmerged, read-only data worktree.
    parli.ingest.__path__.append(str(args.parser_checkout / 'parli/ingest'))
    from parli.ingest.hansard_hist import parse_source

    samples = json.loads((args.output / 'samples.json').read_text())
    offices = office_people(args.oa_cache.parent / 'people.xml')
    day_cache, hist_cache, committee_cache = {}, {}, {}
    wanted_zenodo = {}
    for person in samples:
        for sample in person['samples']:
            row = sample['row']
            if row and row['source'] == 'zenodo':
                wanted_zenodo[(row['date'], row['speaker_name'], hashlib.sha256(row['text'].encode()).hexdigest())] = sample
    with zipfile.ZipFile(args.zenodo_zip) as archive:
        name = next(n for n in archive.namelist() if n.endswith('.parquet'))
        parquet = pq.ParquetFile(BytesIO(archive.read(name)))
        for batch in parquet.iter_batches(columns=['date', 'name', 'body', 'interject', 'div_flag', 'uniqueID', 'name.id']):
            for original in batch.to_pylist():
                if not original['name'] or not original['body']:
                    continue
                # Same text transform as the ingestion, compared to the
                # original corpus, without using linked/cleaned names.
                body = re.sub(r'[ \t]+', ' ', re.sub(r'<[^>]+>', '', original['body'])).strip()
                key = (original['date'], original['name'], hashlib.sha256(body.encode()).hexdigest())
                sample = wanted_zenodo.get(key)
                if sample is not None:
                    sample['zenodo_original'] = {k: v for k, v in original.items() if k != 'body'}
    print('Original Zenodo matches', sum('zenodo_original' in s for p in samples for s in p['samples']),
          'of', len(wanted_zenodo), flush=True)

    historic_paths = {}
    with (args.hist_source / 'all-sitting-days.csv').open() as stream:
        for entry in csv.DictReader(stream):
            historic_paths[(('senate' if entry['house'] == 'senate' else 'representatives'), entry['date'])] = (
                args.hist_source / entry['house'] / entry['year'] / entry['file'])

    committee_dates = defaultdict(list)
    for path in args.committee_cache.glob('*.html'):
        with path.open() as stream:
            header = stream.read(30000)
        found = re.search(r'<p class="mdItem">(\d{2})/(\d{2})/(\d{4})</p>', header)
        if found:
            committee_dates[f'{found[3]}-{found[2]}-{found[1]}'].append(path)

    def committee_turns(path, date):
        if path not in committee_cache:
            parts = path.stem.split('-')
            hearing = HearingMetadata('/'.join(parts[:3]), parts[1], date=date)
            turns = parse_fragment(path.read_text(), hearing, parts[3])
            committee_cache[path] = [(norm(t.text), t) for t in turns]
        return committee_cache[path]

    for person in samples:
        for sample in person['samples']:
            resource, row = sample['resource'], sample['row']
            meta = metadata(resource)
            body = json.loads((args.output / (resource['slug'] + '-body.json')).read_text())['value']['body']
            source = labels(resource)['source']
            date = row['date'] if row else meta['date']
            chamber = row['chamber'] if row else labels(resource).get('chamber')
            check = {'source': source, 'date': date, 'kb_text_sha256': hashlib.sha256(body.encode()).hexdigest(),
                     'kb_text_equals_local': None if row is None else norm(body) == norm(row.get('text_clean') or row['text']),
                     'target': person['person_id']}
            if source == 'openaustralia':
                key = (chamber, date)
                folder = 'senate_debates' if chamber == 'senate' else 'representatives_debates'
                path = args.oa_cache / folder / (date + '.xml')
                if path.exists():
                    if key not in day_cache:
                        day_cache[key] = day_paragraphs(path, offices)
                    check.update(match_oa({'person_id': person['person_id'], 'text': body}, day_cache[key]))
                    check['source_path'] = str(path)
            elif source == 'zenodo':
                check['corpus_byline_verified'] = 'zenodo_original' in sample
                path = args.oa_cache / 'representatives_debates' / (date + '.xml')
                if path.exists():
                    key = ('representatives', date)
                    if key not in day_cache:
                        day_cache[key] = day_paragraphs(path, offices)
                    check.update(match_oa({'person_id': person['person_id'], 'text': body}, day_cache[key]))
                    check['source_path'] = str(path)
                else:
                    path = historic_paths.get(('representatives', date))
                    if path and path.exists():
                        if path not in hist_cache:
                            hist_cache[path] = parse_source(path, args.hist_source)[0]
                        value = norm(body)
                        found = [u for u in hist_cache[path] if value[:100] in norm(u['text'])]
                        check['source_units'] = [{k: u[k] for k in ('id','speaker_raw_name','speaker_metadata_name','speaker_raw_id')}
                                                 for u in found]
                        check['source_path'] = str(path)
            elif source == 'hansard_hist':
                path = args.hist_source / row['source_path']
                if path not in hist_cache:
                    hist_cache[path] = parse_source(path, args.hist_source)[0]
                original = next(u for u in hist_cache[path] if u['id'] == row['id'])
                check.update(source_path=str(path), original_byline=original['speaker_raw_name'],
                             original_metadata_name=original['speaker_metadata_name'],
                             original_phid=original['speaker_raw_id'],
                             exact_original_body=original['text'] == body,
                             interjections=original['interjections'])
            elif source.startswith('committee_'):
                # Newer KB rows absent from the desktop DB are checked against
                # the exact cached fragment by their body, not the KB byline.
                paths = committee_dates[date]
                if row and row.get('hearing_id'):
                    exact = args.committee_cache / (row['hearing_id'].replace('/', '-') + '.html')
                    if exact.exists():
                        paths = [exact]
                value = norm(row['text'] if row else body)
                found = []
                for path in paths:
                    for original, turn in committee_turns(path, date):
                        if len(value) >= 30 and (value in original or original in value and len(original) > 60
                                                or len(value) > 200 and value[:100] in original and value[-60:] in original):
                            found.append({'speaker': turn.speaker_name, 'speaker_type': turn.speaker_type,
                                          'phid': turn.handbook_id, 'source_path': str(path),
                                          'exact_normalized_body': value == original,
                                          'source_url': 'https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22' + turn.hearing_id + '%22'})
                check['committee_matches'] = found
            sample['check'] = check
        print(person['name'], 'source reviews ready', flush=True)
    dump(args.output / 'source-reviews.json', samples)


def oa_scan(args):
    db = read_db(args.db)
    offices = office_people(args.oa_cache.parent / 'people.xml')
    grouped = defaultdict(list)
    for row in db.execute("SELECT speech_id,person_id,speaker_name,date,chamber,text FROM speeches WHERE source='openaustralia'"):
        grouped[(row['chamber'], row['date'])].append(dict(row))
    out = []
    missing = []
    for offset, ((chamber, date), rows) in enumerate(sorted(grouped.items())):
        folder = 'senate_debates' if chamber == 'senate' else 'representatives_debates'
        path = args.oa_cache / folder / (date + '.xml')
        if not path.exists():
            missing.extend(r['speech_id'] for r in rows)
            continue
        day = day_paragraphs(path, offices)
        for row in rows:
            out.append({'speech_id': row['speech_id'], 'person_id': row['person_id'],
                        'speaker_name': row['speaker_name'], 'date': date, 'chamber': chamber,
                        **match_oa(row, day)})
        if offset % 200 == 0:
            print('OA day', offset, 'rows', len(out), flush=True)
    dump(args.output / 'oa-source-audit.json', {'rows': out, 'missing_source_ids': missing})
    print('OA checked', len(out), 'missing_source', len(missing), 'mixed', sum(r['mixed_people'] for r in out), flush=True)


def size_live(args):
    """Conservative count: a unique long paragraph establishes each speaker.

    Rechecks preliminary mixed rows against current live-catalog membership.
    Ambiguous stock phrases are discarded. Counts documents by resource ID,
    including distinct resources which happen to share a slug.
    """
    db = read_db(args.db)
    preliminary = json.loads((args.output / 'oa-source-audit.json').read_text())
    cat = json.loads((args.output / 'openaustralia-catalog.json').read_text())
    resources = cat['resources']
    ids = {int(r['slug'][7:]) for r in resources}
    prior = {r['speech_id']: r for r in preliminary['rows'] if r['speech_id'] in ids}
    candidates = sorted(sid for sid, r in prior.items() if r['mixed_people'])
    grouped = defaultdict(list)
    for offset in range(0, len(candidates), 500):
        chunk = candidates[offset:offset + 500]
        rows = db.execute('SELECT speech_id,person_id,speaker_name,date,chamber,text '
                          'FROM speeches WHERE speech_id IN (' + ','.join('?' * len(chunk)) + ')', chunk)
        for row in rows:
            grouped[(row['chamber'], row['date'])].append(dict(row))
    offices = office_people(args.oa_cache.parent / 'people.xml')
    confirmed = {}
    for offset, ((chamber, date), rows) in enumerate(sorted(grouped.items())):
        folder = 'senate_debates' if chamber == 'senate' else 'representatives_debates'
        day = day_paragraphs(args.oa_cache / folder / (date + '.xml'), offices)
        for row in rows:
            check = match_oa(row, day)
            if check['mixed_people']:
                confirmed[row['speech_id']] = {'speech_id': row['speech_id'], 'date': date,
                    'chamber': chamber, 'person_id': row['person_id'], **check}
        if offset % 100 == 0:
            print('Sizing day', offset, 'confirmed units', len(confirmed), flush=True)
    affected = [{'resource_id': r['id'], 'slug': r['slug'],
                 'collaborators': r.get('origin', {}).get('collaborators', []),
                 'metadata': metadata(r)} for r in resources if int(r['slug'][7:]) in confirmed]
    result = {'catalog_at': cat['at'], 'catalog_documents': len(resources), 'distinct_slugs': len(ids),
              'compared_source_units': len(prior), 'source_unavailable_slugs': sorted(ids - prior.keys()),
              'mixed_source_units': len(confirmed), 'affected_documents': len(affected),
              'by_chamber': dict(Counter(confirmed[int(r['slug'][7:])]['chamber'] for r in affected)),
              'by_collaborator': dict(Counter(n for r in affected for n in r['collaborators'])),
              'documents': affected, 'source_evidence': list(confirmed.values())}
    flags = relabel_status(resources, {'documents': affected}, {'documents': []})
    result.update({k:flags[k] for k in ('flagged_mixed_documents','unflagged_mixed_documents')})
    dump(args.output / 'blast-radius.json', result)
    print('Source-confirmed affected KB documents', len(affected), 'units', len(confirmed), flush=True)


def refine_samples(args):
    people = json.loads((args.output / 'source-reviews.json').read_text())
    offices = office_people(args.oa_cache.parent / 'people.xml')
    days = {}
    for person in people:
        for sample in person['samples']:
            check = sample['check']
            path = Path(check.get('source_path', ''))
            if check['source'] in ('zenodo', 'openaustralia') and path.suffix == '.xml' and path.parent.name in ('representatives_debates', 'senate_debates'):
                if path not in days:
                    days[path] = day_paragraphs(path, offices)
                body = json.loads((args.output / (sample['resource']['slug'] + '-body.json')).read_text())['value']['body']
                check.update(match_oa({'person_id': person['person_id'], 'text': body}, days[path]))
        print(person['name'], 'refined', flush=True)
    dump(args.output / 'source-reviews.json', people)


def role_scan(args):
    db = read_db(args.db)
    cat = json.loads((args.output / 'openaustralia-catalog.json').read_text())
    ids = sorted({int(r['slug'][7:]) for r in cat['resources']})
    roles = {}
    role_names = {'speaker', 'deputy speaker', 'president', 'deputy president', 'chair', 'chairman'}
    for offset in range(0, len(ids), 500):
        chunk = ids[offset:offset + 500]
        for row in db.execute('SELECT speech_id,person_id,party,speaker_type FROM speeches WHERE speech_id IN ('
                              + ','.join('?' * len(chunk)) + ')', chunk):
            if (row['party'] or '').strip().lower() in role_names:
                roles[row['speech_id']] = dict(row)
    rows = []
    for resource in cat['resources']:
        sid = int(resource['slug'][7:])
        from parli.ingest.speaker_roles import chair_role
        active_roles = {c['label'] for c in resource.get('usermetadata',{}).get('classifications',[])
                        if c['labelset']=='chair_role' and not c.get('cancelled_by_user')}
        if sid in roles and chair_role(roles[sid]['party']) not in active_roles:
            rows.append({'resource_id': resource['id'], 'slug': resource['slug'],
                         'collaborators': resource.get('origin', {}).get('collaborators', []),
                         **roles[sid]})
    blast = json.loads((args.output / 'blast-radius.json').read_text())
    mixed_ids = {r['resource_id'] for r in blast['documents']}
    role_ids = {r['resource_id'] for r in rows}
    result = {'role_documents': len(rows), 'overlap_with_mixed': len(role_ids & mixed_ids),
              'role_only_documents': len(role_ids - mixed_ids),
              'union_affected_documents': len(role_ids | mixed_ids),
              'by_collaborator': dict(Counter(n for r in rows for n in r['collaborators'])),
              'documents': rows}
    dump(args.output / 'role-audit.json', result)
    print({k: v for k, v in result.items() if k != 'documents'}, flush=True)


def make_summary(args):
    people = json.loads((args.output / 'source-reviews.json').read_text())
    blast = json.loads((args.output / 'blast-radius.json').read_text())
    roles = json.loads((args.output / 'role-audit.json').read_text())
    summary = []
    ledger = []
    for person in people:
        counts = Counter()
        for sample in person['samples']:
            row, check, resource = sample['row'], sample['check'], sample['resource']
            mixed = bool(check.get('mixed_people'))
            chair = (row['party'] or '').lower() in {'speaker', 'president'}
            witness = labels(resource).get('speaker_type') == 'witness'
            if mixed:
                counts['unmarked_mixed'] += 1
            elif chair:
                counts['chair_only'] += 1
            elif witness:
                counts['witness_name_collision'] += 1
            else:
                counts['correct_primary_speaker_or_author'] += 1
            raw = row['text']
            if re.match(r'^(?:Mr \w+ to move:|To move[—-])', raw):
                counts['written_notice'] += 1
            if re.match(r'^Mr \w+ asked .*?in writing', raw):
                counts['written_question'] += 1
            if sample.get('zenodo_original', {}).get('interject') == '1':
                counts['corpus_interjection_flag'] += 1
            if check.get('interjections'):
                counts['explicitly_marked_historic_embedded_turns'] += 1
            proof = bool(check.get('corpus_byline_verified') or check.get('source_speakers')
                         or check.get('committee_matches') or check.get('exact_original_body'))
            if not proof:
                raise RuntimeError('No primary-source evidence for ' + resource['slug'])
            ledger.append({'mp': person['name'], 'person_id': person['person_id'],
                'slug': resource['slug'], 'date': row['date'], 'source': check['source'],
                'mixed_other_speakers': mixed, 'chair_role': chair, 'witness': witness,
                'original_corpus': sample.get('zenodo_original'),
                'source_path': check.get('source_path'), 'source_speakers': check.get('source_speakers'),
                'committee_byline': check.get('committee_matches'),
                'historical_byline': check.get('original_byline'),
                'historical_metadata_name': check.get('original_metadata_name'),
                'historical_phid': check.get('original_phid'),
                'marked_historical_embedded_turns': check.get('interjections'),
                'source_units': check.get('source_units')})
        item = {k: person[k] for k in ('name','person_id','source_total','source_counts','kb_total',
                                      'kb_sources','kb_person_id_counts','sample_sources',
                                      'sampling_population','eligible_documents')}
        item.update(sample_size=len(person['samples']), categories=dict(counts),
                    mixed_sample_rate=counts['unmarked_mixed'] / len(person['samples']),
                    confirmed_mixed_live_documents=blast['by_collaborator'].get(person['name'], 0),
                    confirmed_missing_chair_role_live_documents=roles['by_collaborator'].get(person['name'], 0))
        summary.append(item)
    result = {'at': datetime.now(timezone.utc).isoformat(), 'kb_catalog_at': blast['catalog_at'],
              'sample_method': 'Lowest SHA256(opax-speaker-audit-2026-10-12:slug), 30 per name; live KB documents present in desktop/historical snapshots.',
              'people': summary,
              'blast_radius': {k: blast[k] for k in ('catalog_documents','distinct_slugs',
                  'compared_source_units','mixed_source_units','affected_documents','by_chamber','source_unavailable_slugs')},
              'role_repairs': {k: roles[k] for k in ('role_documents','overlap_with_mixed','role_only_documents','union_affected_documents')},
              'verification': {'reviewed_documents': len(ledger), 'source_verified_documents': len(ledger)},
              'limits': ['Live catalog counts are not current production DB row counts; desktop DB is an archived snapshot.',
                         'Newer committee records absent from the desktop are excluded from the 30-row sample, not from live catalog totals.',
                         'Affected-document counts are source-confirmed minima for the OA fault; unmarked other speakers need unique paragraphs of at least 35 normalized characters.',
                         'Quoted stock phrases occurring under multiple speakers are discarded.',
                         'The 72 OA slugs without a cached source comparison and unsampled sources do not receive an assumed clean result.']}
    dump(args.output / 'summary.json', result)
    dump(args.output / 'sample-ledger.json', ledger)
    for item in summary:
        print(item['name'], item['source_total'], item['kb_total'], item['categories'], flush=True)


def selfcheck(args):
    """Meaningful checks for quoted-phrase ambiguity and the parser failure."""
    from tempfile import TemporaryDirectory
    from parli.ingest.hansard_html import parse_debate_html
    quote = 'We should protect the independence of the public institutions in this country.'
    text = 'I propose a law to improve transparent public accountability for all elected officials.'
    xml = ('<debates><speech id="one" speakerid="a" speakername="Alex Example"><p>'
           + text + '</p><p><quote>' + quote + '</quote></p></speech>'
           + '<speech id="two" speakerid="b" speakername="Morgan Example"><p>' + quote
           + '</p><p>I oppose the proposed legislation and favour a different policy for public accountability.</p></speech></debates>')
    with TemporaryDirectory(dir=args.output) as scratch:
        path = Path(scratch) / 'day.xml'
        path.write_text(xml)
        day = day_paragraphs(path, {'a':'1','b':'2'})
        check = match_oa({'person_id':'1','text':text + '\n\n' + quote}, day)
        assert check['target_found'] and not check['mixed_people'], check
        check = match_oa({'person_id':'1','text':text + '\n\nI oppose the proposed legislation and favour a different policy for public accountability.'}, day)
        assert check['mixed_people'] and check['other_people'] == ['2'], check
    malformed = ('<div class="main"><p class="speaker"><strong>Alex Example</strong>'
                 '<small>(Example, Fictional Party)</small><p>' + text + '</p>'
                 '<p class="speaker"><strong>Morgan Example</strong><p>' + quote + '</p></div>')
    parsed = parse_debate_html(malformed)
    assert len(parsed) == 2 and parsed[0]['speaker'] == 'Alex Example' and parsed[0]['text'] == text
    assert parsed[1]['speaker'] == 'Morgan Example' and parsed[1]['text'] == quote
    print('Passed: repeated quotation is not misattribution; unique second turn is detected; legacy unclosed paragraphs retain separate speakers.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['catalog', 'prepare', 'oa', 'texts', 'review', 'size', 'refine', 'roles', 'summary', 'selfcheck'])
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--db', type=Path, default=Path.home() / '.cache/autoresearch/parli.db')
    parser.add_argument('--hist-db', type=Path, default=Path('/home/jake/opax-staging/federation/parli_hist.db'))
    parser.add_argument('--oa-cache', type=Path, default=Path('/home/jake/opax-staging/oa-feed/raw'))
    parser.add_argument('--env', type=Path, default=Path.home() / 'opax/.env')
    parser.add_argument('--global-oa', action='store_true')
    parser.add_argument('--desktop-sample', action='store_true', help='Sample only documents represented in the local snapshots; retain an explicit exclusion ledger')
    parser.add_argument('--zenodo-zip', type=Path, default=Path.home() / '.cache/autoresearch/hansard/hansard-corpus.zip')
    parser.add_argument('--hist-source', type=Path, default=Path('/home/jake/opax-staging/federation/raw/wragge_hansard_xml'))
    parser.add_argument('--committee-cache', type=Path, default=Path.home() / '.cache/autoresearch/committee_attendance')
    parser.add_argument('--parser-checkout', type=Path, default=Path('/home/jake/opax-work/wt/fed-parse'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    {'catalog': collect, 'prepare': prepare, 'oa': oa_scan, 'texts': sample_texts,
     'review': source_review, 'size': size_live, 'refine': refine_samples,
     'roles': role_scan, 'summary': make_summary, 'selfcheck': selfcheck}[args.command](args)


if __name__ == '__main__':
    main()
