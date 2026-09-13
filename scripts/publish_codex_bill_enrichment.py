#!/usr/bin/env python3
"""Validate session-authored bill enrichment and patch metadata without processing.

No generation, source creation, summary field or text field writes are supported.
Unpublished versions remain in the reviewed input for a later explicit run.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest.bill_texts import version_document
from parli.arag import AragConfig, AragError, KbClient, load_dotenv
from arag_enrich import TOPICS

TOPIC_SLUGS = {slug for slug, _, _ in TOPICS}


def validate_entry(entry, source):
    if not source['complete'] or entry.get('bill_key') != source['bill_key'] or entry.get('version_id') != source['version']['id'] or entry.get('source_sha256') != source['version']['sha256']:
        raise ValueError('Source identity or checksum mismatch')
    topics = entry.get('topics')
    if not isinstance(topics, list) or len(topics) > 4 or any(not isinstance(t, str) or t not in TOPIC_SLUGS for t in topics) or len(set(topics)) != len(topics):
        raise ValueError('Invalid topics')
    brief = entry.get('brief')
    if not isinstance(brief, str) or not 12 <= len(brief.split()) <= 70 or len(brief) > 1000:
        raise ValueError('Brief must contain 12-70 words and at most 1000 characters')
    if any(filler in brief.lower() for filler in ('would propose changes associated with', 'adjust the relevant legal framework', 'institutional or administrative arrangements')):
        raise ValueError('Generic template brief is not enrichment')
    if entry.get('review_scope') != 'selected-provisions' or entry.get('model') not in ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-6-astra') or entry.get('confidence') not in ('high', 'medium', 'low'):
        raise ValueError('Invalid provenance')
    sections = {s['id']: s['text'] for s in source['sections']}
    evidence = entry.get('evidence')
    if not isinstance(evidence, list) or not 1 <= len(evidence) <= 12:
        raise ValueError('Missing or excessive evidence')
    supported = set()
    for item in evidence:
        quote, topic = item.get('quote'), item.get('topic')
        if not isinstance(quote, str) or not 30 <= len(quote) <= 220 or quote not in sections.get(item.get('section_id'), ''):
            raise ValueError('Evidence is not an exact passage in this version and section')
        if topic is not None and topic not in topics:
            raise ValueError('Evidence refers to an unassigned topic')
        supported.add(topic)
    if not set(topics).issubset(supported):
        raise ValueError('Topic without source evidence')
    return {k: copy.deepcopy(entry[k]) for k in ('bill_key', 'version_id', 'source_sha256', 'topics', 'brief', 'evidence', 'review_scope', 'model', 'confidence')}


def metadata_patch(resource, entry):
    meta = resource.get('extra', {}).get('metadata', {})
    stage = entry['version_id'].split('-', 1)[1]
    slug = f"bill-text-{entry['bill_key']}-{stage}"
    labels = resource.get('usermetadata', {}).get('classifications', [])
    if resource.get('slug') != slug or meta.get('bill_key') != entry['bill_key'] or meta.get('version_id') != entry['version_id'] or meta.get('source_text_sha256') != entry['source_sha256'] or meta.get('complete') is not True or not any(x.get('labelset') == 'kind' and x.get('label') == 'bill_text' for x in labels):
        raise ValueError('Live resource identity does not match reviewed source')
    fields = resource.get('data', {}).get('texts', {})
    names = sorted((n for n in fields if n == 'body' or n.startswith('body-')), key=lambda n: (n != 'body', n))
    if not names:
        names = sorted(n for n in fields if n == 't-body' or n.startswith('t-body-'))
    text = ''.join(fields[n].get('value', {}).get('body', '') for n in names)
    if hashlib.sha256(text.encode()).hexdigest() != entry['source_sha256']:
        raise ValueError('Live original text checksum mismatch')
    usermetadata = copy.deepcopy(resource.get('usermetadata') or {})
    usermetadata['classifications'] = [x for x in labels if x.get('labelset') != 'topic'] + [{'labelset': 'topic', 'label': t, 'cancelled_by_user': False} for t in entry['topics']]
    extra = copy.deepcopy(resource.get('extra') or {})
    extra.setdefault('metadata', {})['codex_enrichment'] = entry
    return {'usermetadata': usermetadata, 'extra': extra}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['validate', 'publish'])
    p.add_argument('--input', nargs='+', required=True)
    p.add_argument('--snapshot', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--env')
    p.add_argument('--apply', action='store_true')
    p.add_argument('--limit', type=int, default=0)
    args = p.parse_args()
    entries = [e for name in args.input for e in json.loads(Path(name).read_text())]
    ids = [(e['bill_key'], e['version_id']) for e in entries]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate versions')
    db = sqlite3.connect(f'file:{args.snapshot}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    entries = [validate_entry(e, version_document(db, e['bill_key'], e['version_id'].replace('-', '_', 1))) for e in entries]
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if args.command == 'validate':
        out.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'validated': len(entries), 'bills': len({e['bill_key'] for e in entries})}))
        return
    if args.env:
        load_dotenv(args.env)
    kb = KbClient(AragConfig.from_env())
    tasks = kb.list_tasks()
    if tasks.get('running') or any(x.get('enabled') for x in tasks.get('configs', [])):
        raise ValueError('Automatic tasks must remain absent; refusing writes')
    results = []
    for entry in entries[:args.limit or None]:
        slug = f"bill-text-{entry['bill_key']}-{entry['version_id'].split('-', 1)[1]}"
        if entry['confidence'] == 'low':
            results.append({'slug': slug, 'status': 'needs-review'})
            out.write_text(json.dumps(results, indent=2) + '\n')
            continue
        try:
            resource = kb.get_resource_by_slug(slug, show='basic&show=extra&show=values')
        except AragError as error:
            if error.status != 404:
                raise
            results.append({'slug': slug, 'status': 'unpublished'})
            out.write_text(json.dumps(results, indent=2) + '\n')
            continue
        patch = metadata_patch(resource, entry)
        result = {'slug': slug, 'status': 'planned'}
        if resource.get('extra', {}).get('metadata', {}).get('codex_enrichment') == entry and resource.get('usermetadata') == patch['usermetadata']:
            result['status'] = 'unchanged'
        elif args.apply:
            backup = out.parent / 'before' / f'{slug}.json'
            backup.parent.mkdir(exist_ok=True)
            if not backup.exists():
                backup.write_text(json.dumps({'usermetadata': resource.get('usermetadata'), 'extra': resource.get('extra')}, ensure_ascii=False))
            response = kb.patch_resource_by_slug(slug, patch)
            if not isinstance(response, dict) or response.get('seqid') is not None:
                raise ValueError('Unexpected processing sequence; stopping immediately')
            verified = kb.get_resource_by_slug(slug, show='basic&show=extra&show=values')
            if metadata_patch(verified, entry) != patch or verified.get('extra', {}).get('metadata', {}).get('codex_enrichment') != entry or verified.get('usermetadata') != patch['usermetadata']:
                raise ValueError('Metadata readback failed')
            result.update(status='published', processing_seqid=response.get('seqid'))
        results.append(result)
        out.write_text(json.dumps(results, indent=2) + '\n')
        print(json.dumps(result), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(f'Bill enrichment stopped: {type(error).__name__}: {error}' if isinstance(error, ValueError) else f'Bill enrichment stopped: {type(error).__name__}; credentials and remote response withheld')
