"""Licence-gated public projection, prepared locally for later nightly review."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from scripts.budget_registry.parse import permitted


def projection(staged):
    documents = {d['id']: d for d in staged['documents']}
    # Revalidate at projection time. A revoked or blocked document loses all rows.
    def allowed(row):
        d = documents.get(row['document_id'])
        return bool(d and permitted(d) and row.get('sha256') == d.get('receipt', {}).get('sha256') and row.get('sha256') and row.get('licence_url') == d['licence']['url'])
    return {'schema': 1, 'generated_at': staged['generated_at'], 'scope': staged['scope'],
            'releases': staged['releases'], 'documents': [{**d, 'licence':{k:v for k,v in d['licence'].items() if k!='evidence'}} for d in documents.values() if permitted(d)],
            'aggregates': [r for r in staged['aggregates'] if allowed(r)],
            'measure_count': sum(allowed(r) for r in staged['measures']),
            'held_count': len(staged['held']), 'portfolio_indexes': staged['portfolio_indexes'],
            'unreleased': staged['unreleased'],
            'attribution': 'Based on Commonwealth of Australia data. Figures transcribed and charted by OPAX; no Commonwealth endorsement.'}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--stage', type=Path, default=Path('data/staged/budget'))
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    root=Path(__file__).resolve().parents[2]
    if not args.stage.resolve().is_relative_to((root/'data/staged').resolve()):ap.error('Projection writes only within this worktree’s staged data')
    staged = json.loads((args.stage / 'inventory.json').read_text())
    for name in ['aggregates', 'measures']: staged[name] = json.loads((args.stage / (name + '.json')).read_text())
    hub = projection(staged)
    print(json.dumps({'mode': 'dry-run' if args.dry_run else 'stage-only', 'documents': len(hub['documents']), 'aggregates': len(hub['aggregates']), 'measures': hub['measure_count'], 'held': hub['held_count']}))
    if not args.dry_run: (args.stage / 'hub.json').write_text(json.dumps(hub, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__': main()
