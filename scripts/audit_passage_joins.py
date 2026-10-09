"""Measure display join rules on local exported JSON only; never open a DB."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import random
import re
import time

from passage_text import repair_passage_joins

FIELDS = {'text', 'text_clean', 'snippet', 'excerpt', 'passage', 'body', 'body_text', 'quote', 'summary', 'source_text', 'original_text'}
RULES = ('interjection', 'before_name', 'after_name')


def passages(value, pointer=''):
    if isinstance(value, dict):
        for key, child in value.items():
            at = pointer + '/' + key.replace('~', '~0').replace('/', '~1')
            if key in FIELDS and isinstance(child, str) and child:
                yield at, key, child
            elif isinstance(child, (dict, list)):
                yield from passages(child, at)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from passages(child, pointer + '/' + str(i))


def audit(public, output, additional=Path('docs/operations/data'), seed=20261009):
    started = time.perf_counter()
    output.mkdir(parents=True, exist_ok=True)
    changed_rows, edits, fields, groups, roots = Counter(), Counter(), Counter(), Counter(), Counter()
    evidence_rows = Counter()
    candidates = {rule: [] for rule in RULES}
    vocabulary = Counter()
    file_hash = hashlib.sha256()
    files = rows = changed = evidence_changed = 0
    # Store changed fields, not the corpus; this also permits independent TS parity.
    with (output / 'changed-fields.jsonl').open('w') as differences:
        # The operations data directory also contains a saved bill-enrichment
        # export with source passages; do not quietly omit that local export.
        paths = sorted(set(public.rglob('*.json')) | set(additional.rglob('*.json')))
        for path in paths:
            raw = path.read_bytes()
            file_hash.update(str(path).encode() + b'\0' + raw)
            try:
                data = json.loads(raw)
            except (UnicodeError, json.JSONDecodeError):
                continue
            files += 1
            group = path.relative_to(public).parts[0] if path.is_relative_to(public) else str(additional)
            for pointer, field, before in passages(data):
                rows += 1
                roots[str(public) if path.is_relative_to(public) else str(additional)] += 1
                fields[field] += 1
                vocabulary.update(word for word in re.findall(r'[^\W\d_]+', before) if word.lower().endswith(('interjecting','interjection','interjections')))
                after, counts = repair_passage_joins(before)
                if before == after:
                    continue
                changed += 1
                groups[group] += 1
                # Count canonical evidence text separately from its details.excerpt mirror.
                canonical = group == 'evidence' and field == 'text'
                evidence_changed += int(canonical)
                row = {'file':str(path), 'pointer':pointer, 'before':before, 'after':after, 'counts':counts}
                differences.write(json.dumps(row, ensure_ascii=False) + '\n')
                for rule, count in counts.items():
                    if count:
                        changed_rows[rule] += 1
                        edits[rule] += count
                        evidence_rows[rule] += int(canonical)
                        candidates[rule].append(row)
    samples = {rule:random.Random(seed+i).sample(candidates[rule],min(20,len(candidates[rule]))) for i,rule in enumerate(RULES)}
    (output / 'samples.json').write_text(json.dumps(samples, ensure_ascii=False, indent=2) + '\n')
    with (output / 'samples.md').open('w') as report:
        report.write(f'# Seeded random changed-field samples ({seed})\n\nEach rule has 20 distinct exported-field rows when available. `text` and\n`details.excerpt` mirrors are separate fields; canonical evidence counts are\nreported separately. Before/after below contain the entire exported field.\n')
        for rule, selected in samples.items():
            report.write(f'\n## {rule}: {len(selected)} samples\n')
            for i, row in enumerate(selected,1):
                report.write(f'\n### {i}. {row["file"]} `{row["pointer"]}`\n\nBefore:\n\n```text\n{row["before"]}\n```\n\nAfter:\n\n```text\n{row["after"]}\n```\n')
    result = {'seed':seed, 'exported_json_sha256':file_hash.hexdigest(), 'json_files':files, 'text_fields':rows, 'text_fields_by_root':dict(roots), 'text_fields_by_key':dict(fields),
              'changed_fields':changed, 'changed_fields_per_rule':dict(changed_rows), 'edits_per_rule':dict(edits),
              'canonical_evidence_text_rows_changed':evidence_changed, 'canonical_evidence_rows_per_rule':dict(evidence_rows),
              'changed_fields_by_directory':dict(groups), 'marker_vocabulary':dict(sorted(vocabulary.items())),
              'sample_counts':{k:len(v) for k,v in samples.items()}, 'elapsed_seconds':round(time.perf_counter()-started,3)}
    (output / 'summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', type=Path, default=Path('portal/public'))
    parser.add_argument('--additional', type=Path, default=Path('docs/operations/data'))
    parser.add_argument('--output', type=Path, default=Path('portal/private/passage-text-round1'))
    args = parser.parse_args()
    audit(args.public, args.output, args.additional)
