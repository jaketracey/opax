#!/usr/bin/env python3
"""Publish complete collected bill versions without automatic LLM generation.

Requires the KB's summary model to use the schema's `none` provider and no
enabled/running DA tasks. Existing resources are never overwritten. Source
versions with a different live checksum are held for review. Run against a
SQLite backup of the crawler state, not its changing working database.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'scripts'))
from parli.arag import AragConfig, AragError, KbClient, load_dotenv, _request
from parli.ingest.bill_texts import resource_body, version_document
from publish_bills import RateLimiter
from publish_codex_bill_enrichment import validate_entry


def assert_no_generation(config, schema, tasks):
    providers = {x['value']: x.get('provider') for x in schema['summary_model']['options']}
    if providers.get(config.get('summary_model')) != 'none':
        raise ValueError('Automatic summaries must use the no-generation provider')
    if tasks.get('running') or any(x.get('enabled') for x in tasks.get('configs', [])):
        raise ValueError('Automatic enrichment must remain disabled')


def existing_outcome(resource, body):
    old = resource.get('extra', {}).get('metadata', {})
    new = body['extra']['metadata']
    if (resource.get('slug') == body['slug'] and old.get('complete') is True
            and all(old.get(k) == new[k] for k in ('bill_key', 'version_id', 'source_text_sha256'))):
        return 'existing'
    return 'held-source-mismatch'


def verify_original(resource, body):
    texts = resource.get('data', {}).get('texts', {})
    names = sorted(n for n in texts if n == 'body' or n.startswith('body-'))
    original = ''.join(texts[n].get('value', {}).get('body', '') for n in names)
    return (existing_outcome(resource, body) == 'existing'
            and hashlib.sha256(original.encode()).hexdigest() == body['extra']['metadata']['source_text_sha256'])


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--snapshot', required=True)
    p.add_argument('--env', required=True)
    p.add_argument('--receipt', required=True)
    p.add_argument('--enrichment', help='Previously reviewed, source-verified Codex notes')
    p.add_argument('--keys', help='Comma-separated bill keys to publish from the snapshot')
    p.add_argument('--apply', action='store_true')
    p.add_argument('--limit', type=int, default=0)
    p.add_argument('--workers', type=int, default=4)
    p.add_argument('--rate', type=float, default=4)
    args = p.parse_args()
    db = sqlite3.connect(f'file:{Path(args.snapshot).resolve()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    entries = json.loads(Path(args.enrichment).read_text()) if args.enrichment else []
    notes = {(e['bill_key'], e['version_id']): e for e in entries}
    rows = db.execute("SELECT v.bill_key,v.source_version,b.doc_json FROM bill_text_versions v JOIN bill_text_bills b USING(bill_key) WHERE v.status='complete' ORDER BY b.bill_key,v.source_version").fetchall()
    if args.keys:
        keys = {key.strip() for key in args.keys.split(',') if key.strip()}
        if not keys:
            raise ValueError('At least one bill key is required')
        rows = [row for row in rows if row['bill_key'] in keys]
    load_dotenv(args.env)
    kb = KbClient(AragConfig.from_env())
    schema = _request('GET', kb._rag('/schema'), kb._headers)

    def gate():
        assert_no_generation(_request('GET', kb._rag('/configuration'), kb._headers), schema, kb.list_tasks())

    gate()
    limiter = RateLimiter(args.rate)
    receipt = Path(args.receipt)
    receipt.parent.mkdir(parents=True, exist_ok=True)
    counts = Counter()

    def publish(body):
        limiter.acquire()
        try:
            try:
                resource = kb.get_resource_by_slug(body['slug'], show='basic&show=extra')
                return {'slug': body['slug'], 'status': existing_outcome(resource, body)}
            except AragError as error:
                if error.status != 404:
                    raise
            if not args.apply:
                return {'slug': body['slug'], 'status': 'planned'}
            try:
                kb.create_resource(body)
            except AragError as error:
                if error.status != 409:
                    raise
                # A concurrent publisher owns the existing resource; do not patch it.
                resource = kb.get_resource_by_slug(body['slug'], show='basic&show=extra&show=values')
                return {'slug': body['slug'], 'status': existing_outcome(resource, body)}
            resource = kb.get_resource_by_slug(body['slug'], show='basic&show=extra&show=values')
            if not verify_original(resource, body):
                raise ValueError('Created source readback failed')
            return {'slug': body['slug'], 'status': 'created-verified',
                    'source_sha256': body['extra']['metadata']['source_text_sha256'],
                    'codex_note': 'codex_enrichment' in body['extra']['metadata']}
        except Exception as error:
            # API response bodies can contain credentials. Record only the type/status.
            return {'slug': body['slug'], 'status': 'failed', 'error': type(error).__name__,
                    'http_status': getattr(error, 'status', None)}

    with receipt.open('w') as out, ThreadPoolExecutor(max_workers=args.workers) as pool:
        selected = rows[:args.limit or None]
        for start in range(0, len(selected), 40):
            gate()
            bodies = []
            for row in selected[start:start + 40]:
                doc = version_document(db, row['bill_key'], row['source_version'])
                body = resource_body(doc, json.loads(row['doc_json']))
                note = notes.get((doc['bill_key'], doc['version']['id']))
                if note and note.get('confidence') in ('high', 'medium'):
                    note = validate_entry(note, doc)
                    body['extra']['metadata']['codex_enrichment'] = note
                    body['usermetadata']['classifications'].extend(
                        {'labelset': 'topic', 'label': topic} for topic in note['topics'])
                bodies.append(body)
            for result in pool.map(publish, bodies):
                counts[result['status']] += 1
                out.write(json.dumps(result) + '\n')
                out.flush()
            print(json.dumps({'processed': sum(counts.values()), 'total': len(selected), 'results': counts}), flush=True)
            if counts['failed']:
                raise ValueError('Publication stopped after failed read/write; inspect the receipt')
    gate()


if __name__ == '__main__':
    main()
