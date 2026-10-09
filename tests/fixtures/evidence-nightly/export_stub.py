"""Exporter fault injection: operation names only, fixture files only."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import time

parser = argparse.ArgumentParser()
for name in ('source', 'evidence', 'places', 'decisions', 'additional', 'output'):
    parser.add_argument('--' + name, type=Path, required=True)
args = parser.parse_args()
assert os.environ['OPAX_SYNC_KB'] == '0'
mode = os.environ.get('EVIDENCE_TEST_MODE', 'stamps')
with (Path(os.environ['HOME']) / 'evidence.calls').open('a') as f:
    f.write('export\n')
assert not args.output.exists()
shutil.copytree('portal/public/evidence', args.output)
if mode == 'timeout':
    time.sleep(10)
if mode == 'export_fail':
    sys.exit(1)
index = json.loads((args.output / 'index.json').read_text())
index['meta']['generated_at'] = '2026-10-10T00:00:00+00:00' if mode == 'stamps' else 'new'
path = args.output / 'aa.json'
doc = json.loads(path.read_text())
identity, entry = next(iter(doc['entries'].items()))
excerpt = entry['excerpts'][0]
if mode in ('ok', 'audit_fail', 'partial_failure'):
    excerpt['text'] = excerpt['text'].replace('membersinterjecting', 'members interjecting').replace('&amp;', '&')
elif mode == 'budget':
    excerpt['text'] += 'x' * 4096
elif mode == 'excerpt_vanish':
    entry['excerpts'] = []
elif mode == 'entity_vanish':
    replacement = identity[:-1] + '1'
    entry['id'] = replacement
    doc['entries'] = {replacement: entry}
    index['entities'][0]['id'] = replacement
    lookup = args.output / 'lookup/aa.json'
    lookup.write_text(json.dumps({'fixture 1': [replacement]}))
elif mode in ('record_shrink', 'at_threshold'):
    entry['records'] = 95 if mode == 'record_shrink' else 96
    entry['years']['2026'] = entry['records']
    entry['source_kinds']['Parliamentary record'] = entry['records']
    index['entities'][0]['records'] = entry['records']
    index['meta']['published_record_matches'] = entry['records'] + 100
elif mode == 'shard_shrink':
    (args.output / 'lookup/bb.json').unlink()
elif mode == 'incomplete':
    index['meta']['complete'] = False
if entry['excerpts']:
    excerpt['details']['excerpt'] = excerpt['text']
path.write_text(json.dumps(doc, ensure_ascii=False))
(args.output / 'index.json').write_text(json.dumps(index))
(args.output / 'stats.json').write_text(json.dumps(index['meta']))
if mode == 'malformed':
    path.write_text('{broken')
if mode == 'partial_failure':
    # Simulate partial installation as well as an untracked leftover.
    shutil.copyfile(path, 'portal/public/evidence/aa.json')
    Path('portal/public/evidence/cc.json').write_text('{}')
    sys.exit(1)
