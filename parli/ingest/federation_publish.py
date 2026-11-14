"""Explicit, bounded publication of approved Federation metadata.

Default is an offline manifest inspection. This never creates a resource or
submits text, resets sync cursors, or queues enrichment. It patches existing
slugs only and retains existing summaries, topics and other resource metadata.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
from pathlib import Path
import re
import time

from .federation_relabel import file_digest, load_guard


def active_label_pairs(labels):
    """Compare labels by meaning, ignoring native response bookkeeping."""
    return frozenset((c['labelset'], c['label']) for c in labels
                     if not c.get('cancelled_by_user', False))


def metadata_patch(live, staged):
    """One logical chamber label; preserve all unrelated labels and metadata."""
    labels = live.get('usermetadata', {}).get('classifications', [])
    active = active_label_pairs(labels)
    if not {('kind', 'speech'), ('source', 'zenodo')} <= active:
        raise ValueError('Live resource lacks the approved Zenodo speech provenance')
    current = (live.get('extra') or {}).get('metadata') or {}
    expected = staged['extra']['metadata']
    if (str(current.get('speech_id')) != str(expected['speech_id'])
            or current.get('date') != expected['date']
            or live.get('slug', staged['slug']) != staged['slug']):
        raise ValueError('Live citation identity or date conflicts with the approved manifest')
    chambers = {label for labelset, label in active if labelset == 'chamber'}
    if not chambers or chambers - {'representatives', 'federation'}:
        raise ValueError('Live chamber conflicts with the approved House transfer')
    user = copy.deepcopy(live.get('usermetadata') or {})
    incoming = staged['usermetadata']['classifications']
    user['classifications'] = [c for c in labels if c['labelset'] not in ('chamber', 'party')]
    user['classifications'] += [c for c in incoming if c['labelset'] in ('chamber', 'party')
                                and not c.get('cancelled_by_user', False)]
    extra = copy.deepcopy(live.get('extra') or {})
    meta = extra.setdefault('metadata', {})
    proposed = staged['extra']['metadata']
    for key in ('person_id', 'fedchamb_flag', 'source_input_id', 'source_row_number'):
        if key in proposed:
            meta[key] = proposed[key]
    # Only classifications can change within usermetadata. A server response may
    # add cancelled_by_user=False, reorder labels or retain cancellation records.
    if active_label_pairs(user['classifications']) == active and extra == live.get('extra'):
        return None
    return dict(usermetadata=user, extra=extra)


def run(args, client=None):
    path = Path(args.payloads)
    rows = [json.loads(line) for line in path.read_text().splitlines() if line]
    slugs = [r.get('slug', '') for r in rows]
    if len(set(slugs)) != len(slugs) or any(not re.fullmatch(r'speech-\d+', s) for s in slugs):
        raise ValueError('Manifest must contain unique existing speech citation slugs')
    for row in rows:
        labels = active_label_pairs(row.get('usermetadata', {}).get('classifications', []))
        if not {('chamber', 'federation'), ('source', 'zenodo')} <= labels:
            raise ValueError('Only reviewed Zenodo Federation payloads are supported')
    sha = file_digest(path)
    report = dict(documents=len(rows), payload_sha256=sha, apply=args.apply, patched=0,
                  unchanged=0, resources_created=0, text_writes=0, enrichment_queued=0)
    if not args.apply:
        return report
    if os.environ.get('OPAX_PUBLISH_FEDERATION') != '1':
        raise ValueError('Publication is OFF: Jake must approve OPAX_PUBLISH_FEDERATION=1')
    if args.approved_sha256 != sha:
        raise ValueError('Approval digest does not match the exact payload manifest')
    if not args.max_documents or len(rows) > args.max_documents:
        raise ValueError('Manifest exceeds the explicit --max-documents budget')
    if client is None:
        from parli.arag import AragConfig, rag_base
        import requests
        config = AragConfig.from_env()
        if not config.kb_configured:
            raise ValueError('KB credentials unavailable')
        # One request per second, no redirects or retries, stop on ANY refusal.
        class ApprovedClient:
            last = 0.0

            def request(self, method, slug, body=None):
                load_guard()
                time.sleep(max(0, 1.01 - (time.monotonic() - self.last)))
                self.last = time.monotonic()
                response = requests.request(method,
                    f'{rag_base(config.zone)}/kb/{config.kb_id}/slug/{slug}' +
                    ('?show=basic&show=extra' if method == 'GET' else ''),
                    headers={'User-Agent': 'opax-improve-audit',
                             'x-nuclia-serviceaccount': f'Bearer {config.kb_token}'},
                    json=body, timeout=120, allow_redirects=False)
                if not 200 <= response.status_code < 300:
                    raise RuntimeError(f'Publication stopped on HTTP {response.status_code}')
                return response.json() if response.content else None

            def get(self, slug):
                return self.request('GET', slug)

            def patch(self, slug, body):
                return self.request('PATCH', slug, body)
        client = ApprovedClient()
    for row in rows:
        live = client.get(row['slug'])
        patch = metadata_patch(live, row)
        if patch:
            client.patch(row['slug'], patch)
            report['patched'] += 1
        else:
            report['unchanged'] += 1
    # A stopped run can be replayed safely: GET checks the applied metadata.
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--payloads', required=True)
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--max-documents', type=int)
    ap.add_argument('--approved-sha256')
    print(json.dumps(run(ap.parse_args(argv)), indent=2))


if __name__ == '__main__':
    main()
