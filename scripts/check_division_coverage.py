#!/usr/bin/env python3
"""Check coverage exports against a Git base, including every party field.

No DB access. Existing member objects and unrelated metadata must be identical;
new sourced votes must have no party fields. Party tallies and provenance
summaries stay identical. Unknown-party counts may grow by the new vote count.
"""
import argparse
import json
from pathlib import Path
import subprocess

from export_division_pages import ROOT, check_coverage_changes, read_previous_projection


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    args = parser.parse_args()
    base = subprocess.check_output(['git', 'rev-parse', args.base], cwd=ROOT, text=True).strip()
    directory = 'portal/public/divisions'
    paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', base, '--', directory],
                                    cwd=ROOT, text=True).splitlines()
    previous = {}
    with subprocess.Popen(['git', 'cat-file', '--batch'], cwd=ROOT, stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE) as cat:
        for path in paths:
            cat.stdin.write(f'{base}:{path}\n'.encode())
            cat.stdin.flush()
            size = int(cat.stdout.readline().split()[2])
            record = json.loads(cat.stdout.read(size))
            cat.stdout.read(1)
            if Path(path).name == 'index.json':
                old_index = record
            else:
                previous[record['key']] = record
        cat.stdin.close()
        cat.wait()
    current = read_previous_projection(ROOT / directory)
    check_coverage_changes(current, previous)
    index = json.loads((ROOT / directory / 'index.json').read_text())
    if index['parties'] != old_index['parties']:
        raise ValueError('Party list changed')
    old_rows = {d['key']: d for d in old_index['divisions']}
    added = 0
    for row in index['divisions']:
        old = old_rows[row['key']]
        delta = len(current[row['key']]['members']) - len(previous[row['key']]['members'])
        added += delta
        if row['member_count'] != len(current[row['key']]['members']):
            raise ValueError(f"Indexed member count changed for {row['key']}")
        if row['party_tallies'] != old['party_tallies'] or row['unknown_party_count'] != old['unknown_party_count'] + delta:
            raise ValueError(f"Party tally changed for {row['key']}")
    for field in ('party_filled_count', 'party_corrected_count', 'party_withheld_count'):
        if index['coverage'][field] != old_index['coverage'][field]:
            raise ValueError(f'Party provenance summary changed: {field}')
    if index['coverage']['unknown_party_count'] != old_index['coverage']['unknown_party_count'] + added:
        raise ValueError('Unknown-party total does not match the added sourced votes')
    print(json.dumps(dict(base=base, divisions=len(current), existing_member_party_fields_changed=0,
                          party_tallies_changed=0, added_sourced_votes_without_party=added,
                          before=old_index['coverage']['member_coverage_counts'],
                          after=index['coverage']['member_coverage_counts']), indent=2))


if __name__ == '__main__':
    main()
