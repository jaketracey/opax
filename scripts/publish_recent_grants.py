#!/usr/bin/env python3
"""Index verified GrantConnect award rows; awards are never described as payments."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'scripts'))
from parli.arag import AragConfig, AragError, KbClient, load_dotenv, _request
from publish_collected_bill_texts import assert_no_generation
from publish_bills import RateLimiter


def resource_body(row):
    if row.get('source') != 'grantconnect' or not re.fullmatch(r'GA\d+(?:-V\d+)?', row['ga_id']):
        raise ValueError('Expected a GrantConnect award identity')
    if date.fromisoformat(row['publish_date']) > date.today():
        raise ValueError('Future publication date')
    value = row['value']
    if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError('Invalid award value')
    source_url = 'https://www.grants.gov.au/Ga/ListResult?Type=Ga&GaId=' + row['ga_id']
    slug = 'grantconnect-award-' + row['ga_id'].lower()
    title = row['activity'] + ' — ' + row['ga_id']
    text = (f"{row['activity']}\n\nGrantConnect award {row['ga_id']}, published {row['publish_date']}. "
            f"Awarding agency: {row['agency']}. Recipient as disclosed: {row['recipient_name']}. "
            f"Published award value: AUD {value:,.2f}. "
            f"Recorded grant period: {row.get('start_date') or 'not stated'} to {row.get('end_date') or 'not stated'}. "
            f"Category: {row.get('category') or 'not stated'}. Grant opportunity: {row.get('go_id') or 'not stated'}. "
            "This is an award notice, not evidence that money has been paid or a project completed. "
            "A recipient name alone does not establish the delivery location or electorate.")
    if row.get('aggregate'):
        text += ' This is an aggregate award: it may represent multiple grants or recipients.'
    metadata = {'record_id': row['ga_id'], 'stage': 'award', 'value_aud': value,
                'source_fields': row, 'source_url': source_url, 'link_scope': 'award_id_lookup',
                'licence': 'CC BY 3.0 AU (GrantConnect, Department of Finance)',
                'page': '/doc/' + slug, 'content_hash': hashlib.sha256(text.encode()).hexdigest()}
    return {'slug': slug, 'title': title, 'texts': {'body': {'body': text, 'format': 'PLAIN'}},
            'origin': {'source_id': 'opax-grantconnect-awards', 'url': source_url, 'created': row['publish_date'] + 'T00:00:00Z'},
            'usermetadata': {'classifications': [{'labelset': 'kind', 'label': 'grant_award'}, {'labelset': 'state', 'label': 'federal'}, {'labelset': 'source', 'label': 'grantconnect'}]},
            'extra': {'metadata': metadata}}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', required=True)
    p.add_argument('--env', required=True)
    p.add_argument('--receipt', required=True)
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    rows = json.loads(Path(args.input).read_text())
    # MLCI's reviewed source records already provide these award identities.
    mlci = json.loads((ROOT / 'portal/public/research/mlci.json').read_text())
    existing_ids = {r['ga_id'] for r in mlci['awards']}
    bodies = [resource_body(r) for r in rows if r['ga_id'] not in existing_ids]
    assert len({b['slug'] for b in bodies}) == len(bodies), 'Duplicate award identities'
    load_dotenv(args.env)
    kb = KbClient(AragConfig.from_env())
    assert_no_generation(_request('GET', kb._rag('/configuration'), kb._headers),
                         _request('GET', kb._rag('/schema'), kb._headers), kb.list_tasks())
    limiter = RateLimiter(4)

    def publish(body):
        limiter.acquire()
        try:
            try:
                old = kb.get_resource_by_slug(body['slug'], show='basic&show=extra')
                unchanged = old.get('extra', {}).get('metadata', {}).get('content_hash') == body['extra']['metadata']['content_hash']
                return {'slug': body['slug'], 'status': 'existing' if unchanged else 'held-amendment'}
            except AragError as error:
                if error.status != 404:
                    raise
            if not args.apply:
                return {'slug': body['slug'], 'status': 'planned'}
            kb.create_resource(body)
            readback = kb.get_resource_by_slug(body['slug'], show='basic&show=extra&show=values')
            assert readback['data']['texts']['body']['value']['body'] == body['texts']['body']['body']
            return {'slug': body['slug'], 'status': 'created-verified'}
        except Exception as error:
            return {'slug': body['slug'], 'status': 'failed', 'error': type(error).__name__}

    results = []
    with Path(args.receipt).open('w') as out, ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(publish, bodies):
            results.append(result)
            out.write(json.dumps(result) + '\n'); out.flush()
    from collections import Counter
    counts = Counter(r['status'] for r in results)
    print(json.dumps({'results': counts, 'already_in_mlci': len(rows) - len(bodies)}))
    if counts['failed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
