"""Re-acquire incomplete receipts serially in an empty cache; update staged provenance."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from urllib.parse import urljoin
from scripts.budget_registry.acquire import ROOT, ReceiptHTTP, dump, now, pdf_rights, sha, soup
from scripts.budget_registry.stage import projection


def refresh_provenance(value, receipts):
    if isinstance(value, list):
        return [refresh_provenance(v, receipts) for v in value]
    if not isinstance(value, dict):
        return value
    if value.get('url') in receipts and 'status' in value and 'snapshot' in value and 'sha256' in value:
        return receipts[value['url']]
    result = {k: refresh_provenance(v, receipts) for k, v in value.items()}
    receipt = receipts.get(value.get('source_url'))
    if receipt and value.get('sha256') == receipt['sha256'] and 'snapshot' in value:
        result['snapshot'] = receipt['snapshot']
    return result


def refresh(stage, cache):
    if cache.exists() and any(cache.iterdir()):
        raise ValueError('Receipt repair requires a fresh empty cache')
    ledger = json.loads((stage / 'receipts.json').read_text())
    incomplete = [r for r in ledger if not r.get('user_agent_policy')]
    inventory = json.loads((stage / 'inventory.json').read_text())
    documents = {d['url']: d for d in inventory['documents']}
    client = ReceiptHTTP(cache)
    fresh, evidence = {}, []
    # A robots request is made and recorded before each origin's first source GET.
    for old in incomplete:
        url = old['url']
        body = client.get(url)
        receipt = client.receipt(url)
        if receipt['status'] != old['status']:
            raise ValueError(f'Source status changed; retain fresh receipt for review: {url}')
        rights = None
        if url in documents:
            rights = pdf_rights(body)
            original = documents[url]['licence']
            if rights['status'] != 'open' or rights['url'] != original['url']:
                raise ValueError(f'Document rights changed; hold fresh body for review: {url}')
            if sha(body) != old['sha256']:
                raise ValueError(f'Document bytes changed; re-ingest after rights review: {url}')
        # Discovery pages may change. Only move index provenance when all staged
        # file links from that page are still present in the freshly acquired HTML.
        indexed = [d for d in inventory['documents'] if d.get('index_url') == url]
        if indexed:
            links = {urljoin(url, a['href']) for a in soup(body).select('a[href]')}
            if any(d['url'] not in links for d in indexed):
                raise ValueError(f'Publisher index links changed; retain receipt for review: {url}')
        fresh[url] = receipt
        evidence.append({'url': url, 'previous_snapshot': old['snapshot'],
                         'previous_sha256': old['sha256'], 'receipt': receipt,
                         'bytes_unchanged': receipt['sha256'] == old['sha256'],
                         'licence_recheck': rights})
        print(receipt['status'], url, flush=True)
    # Include fresh robots receipts, replacing the older origin-policy checks.
    for origin in client.robots:
        url = origin + '/robots.txt'
        fresh[url] = client.receipt(url)
    previous_robots = [r for r in ledger if r['url'] in fresh and r['url'].endswith('/robots.txt')]
    inventory = refresh_provenance(inventory, fresh)
    inventory['generated_at'] = now()
    aggregates = refresh_provenance(json.loads((stage / 'aggregates.json').read_text()), fresh)
    measures = refresh_provenance(json.loads((stage / 'measures.json').read_text()), fresh)
    ledger = sorted({**{r['url']: r for r in ledger}, **fresh}.values(), key=lambda r: r['url'])
    for name, value in [('inventory', inventory), ('aggregates', aggregates), ('measures', measures), ('receipts', ledger)]:
        dump(stage / (name + '.json'), value)
    dump(stage / 'hub.json', projection({**inventory, 'aggregates': aggregates, 'measures': measures}))
    dump(stage / 'receipt-repair.json', {'generated_at': inventory['generated_at'],
         'cache': str(cache.relative_to(ROOT)), 'reacquired': len(incomplete),
         'missing_identity_before': len(incomplete),
         'missing_identity_after': sum(not r.get('user_agent_policy') for r in ledger),
         'sources': evidence, 'robots': [fresh[o + '/robots.txt'] for o in client.robots],
         'previous_robots': previous_robots})
    print(f'Re-acquired {len(incomplete)} source receipts; staged provenance updated', flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--stage', type=Path, default=ROOT / 'data/staged/budget')
    ap.add_argument('--cache', type=Path, required=True)
    args = ap.parse_args()
    if not args.stage.resolve().is_relative_to((ROOT / 'data/staged').resolve()):
        ap.error('Receipt repair output must stay under this worktree’s data/staged directory')
    refresh(args.stage.resolve(), args.cache.resolve())
