"""Offline request-size scenarios; no resource reads, patches or model calls.

Run from the repository with a configured Python environment:
  python docs/reports/2026-11-14-fedchamb/estimate-patch-bytes.py PAYLOADS.jsonl
"""
import copy
import json
import math
from pathlib import Path
import statistics
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from parli.ingest.federation_publish import metadata_patch
from parli.ingest.federation_relabel import file_digest, load_guard


def size(value):
    return len(json.dumps(value, allow_nan=False).encode('utf-8'))


def stats(values):
    values = sorted(values)
    return dict(documents=len(values), minimum_bytes=values[0],
                mean_bytes=statistics.mean(values), median_bytes=statistics.median(values),
                p95_bytes=values[math.ceil(.95 * len(values)) - 1], maximum_bytes=values[-1],
                total_bytes=sum(values), total_decimal_mb=sum(values) / 1e6)


def estimate(path):
    base, enriched, provenance = [], [], []
    with path.open() as source:
        for i, line in enumerate(source):
            if i % 1000 == 0:
                load_guard()
            row = json.loads(line)
            live = {key: copy.deepcopy(row[key]) for key in ('usermetadata', 'extra')}
            for label in live['usermetadata']['classifications']:
                if label['labelset'] == 'chamber':
                    label['label'] = 'representatives'
                label['cancelled_by_user'] = False
            for key in ('fedchamb_flag', 'source_input_id', 'source_row_number'):
                live['extra']['metadata'].pop(key, None)
            patch = metadata_patch(live, row)
            base.append(size(patch))
            provenance.append(size(patch['extra']) - size(live['extra']))
            live['extra']['metadata']['summary'] = 'x' * 1024
            live['usermetadata']['classifications'] += [
                dict(labelset='topic', label=str(j).zfill(32), cancelled_by_user=False)
                for j in range(5)]
            enriched.append(size(metadata_patch(live, row)))
    return dict(
        as_of='2026-11-14', payload_sha256=file_digest(path), network_requests=0, kb_writes=0,
        serialisation='Python json.dumps(patch, allow_nan=False).encode(utf-8), matching requests JSON encoding; excludes HTTP headers, TLS and GET responses.',
        baseline_assumptions='Synthetic live usermetadata and extra copied from each staged payload. Chamber set to representatives, native cancelled_by_user=false on all labels, new provenance keys removed. Same dated party and person assumed. metadata_patch computes the real request shape. Existing live enrichment and other unknown metadata excluded. No live resource read or patch.',
        manifest_metadata_only=stats(base),
        illustrative_enriched=dict(assumptions='Baseline plus a 1,024-byte ASCII summary in extra.metadata.summary and five native topic labels of 32 ASCII bytes each. A sensitivity scenario, not a measured live enrichment distribution.', **stats(enriched)),
        added_provenance_extra_json_bytes=stats(provenance),
        limitations='Estimates request transfer, not index_size or processing tokens. Unknown existing summaries/topics, relations and other live metadata must be added; this is not a wire-byte cap. JSON escaping can enlarge non-ASCII text. Real current party/person differences are unknown.')


if __name__ == '__main__':
    print(json.dumps(estimate(Path(sys.argv[1])), indent=2))
