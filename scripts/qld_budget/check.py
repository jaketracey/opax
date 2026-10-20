"""Offline, read-only audit of the held source inventory. This is not promotion."""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path

from scripts.qld_budget.acquire import ROOT, UA, host_stopped


def check(root=ROOT):
    stage = root / 'data/staged/qld-budget'
    inventory = json.loads((stage / 'inventory.json').read_text())
    receipts = json.loads((stage / 'receipts.json').read_text())
    resources = inventory['resources']
    assert len(resources) == len({r['id'] for r in resources}) == 5
    assert len(receipts) == len({r['url'] for r in receipts}) == 13
    assert receipts[0]['kind'] == 'robots' and receipts[0]['status'] == 200
    intervals = []
    for previous, current in zip(receipts, receipts[1:]):
        interval = (datetime.fromisoformat(current['requested_at']) - datetime.fromisoformat(previous['snapshot'])).total_seconds()
        assert interval >= 10, 'Source requests must be sequential with ten-second completion spacing'
        intervals.append(interval)
        assert not host_stopped(previous), 'No request may follow a host refusal'
    for receipt in receipts:
        assert receipt['method'] == 'GET' and receipt['user_agent'] == UA
        assert not receipt['proxy'] and not receipt['automatic_redirects']
        assert len(receipt['sha256']) == 64
        assert receipt['status'] in (200, 302) and not receipt['challenge']
    ledger = {r['url']: r for r in receipts}
    for resource in resources:
        assert resource['status'] == 'held' and resource['row_count'] is None and resource['sha256'] is None
        rights = resource['licence']
        assert rights['dataset_explicit'] and rights['resource_explicit'] and not rights['file_notices_reviewed']
        assert rights['dataset_sha256'] == ledger[resource['dataset_url']]['sha256']
        assert rights['resource_page_sha256'] == ledger[resource['resource_url']]['sha256']
        assert resource['download_receipt'] == ledger[resource['url']]
        assert resource['download_receipt']['status'] == 302 and not resource['download_receipt']['body_retained']
        assert resource['redirect_target_robots_allowed'] in (None, False)
    assert (stage / 'series.jsonl').read_bytes() == b''
    reconciliation = json.loads((stage / 'reconciliation.json').read_text())
    assert reconciliation['status'] == 'not-run' and not reconciliation['checks'] and not reconciliation['internal_sums']
    assert reconciliation['public_computed_totals'] == 0
    # No public asset, page, CSV, search catalogue or MCP code may consume this
    # metadata-only held staging directory. There is intentionally no hub.json.
    assert not (stage / 'hub.json').exists()
    markers = [r['id'].encode() for r in resources] + [b'data/staged/qld-budget']
    for directory in ('portal/src', 'portal/public'):
        for path in (root / directory).rglob('*'):
            if path.is_file() and path.suffix in ('.ts', '.js', '.mjs', '.json', '.csv', '.html'):
                data = path.read_bytes()
                assert not any(marker in data for marker in markers), f'Held input reached a public consumer: {path}'
    return {'status': 'held', 'writes': 0, 'resources': 5, 'rows_staged': 0,
            'reconciliation': 'not-run', 'public_computed_totals': 0,
            'minimum_completion_spacing_seconds': min(intervals),
            'votes_sha256': hashlib.sha256((root / 'portal/public/votes.json').read_bytes()).hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', required=True)
    parser.parse_args()
    print(json.dumps(check()))
