#!/usr/bin/env python3
"""Offline guard: a resolved House speaker must hold a sourced seat on that day.

Missing service evidence is reported separately from a known out-of-term link.
Neither is silently allowed. The raw members table is not tenure evidence.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest.speaker_identity import resolve_attribution  # noqa: E402
from scripts.roster_source_profiles import reference  # noqa: E402


def service_index(bundle):
    seats = {e['electorate_id']: e for e in bundle['electorates']}
    people = {p['person_id']: p for p in bundle['people']}
    index = defaultdict(list)
    for term in bundle['terms']:
        seat, person = seats[term['electorate_id']], people[term['person_id']]
        for pid in {person['person_id'], person.get('legacy_person_id')} - {None}:
            index[pid].append(dict(chamber=seat['chamber'], start=term['start'], end=term.get('end')))
    return index


def service_problem(row, index, exceptions=()):
    row = dict(row)
    for exception in exceptions:
        if (all(row.get(k) == exception.get(k) for k in ('speech_id', 'person_id', 'chamber', 'date'))
                and exception.get('reason') and str(exception.get('source_url', '')).startswith('https://')):
            return None
    terms = index.get(row.get('person_id'), [])
    if not terms:
        return 'missing_service_evidence'
    if not any(t['chamber'] == row['chamber'] and t['start'] <= row['date']
               and (t['end'] is None or row['date'] <= t['end']) for t in terms):
        return 'outside_house_service'
    return None


def audit(db, *, resolved=True):
    index = service_index(reference())
    exceptions = json.loads((ROOT / 'scripts/speech_service_exceptions.json').read_text())['exceptions']
    counts = Counter()
    hits = defaultdict(list)
    used = set()
    # Match the sweep's published House coverage and speaker-type boundary.
    rows = db.execute("SELECT speech_id, person_id, speaker_name, speaker_name_clean, electorate, "
                      "chamber, date, source, state, speaker_type, witness_name FROM speeches "
                      "WHERE chamber='representatives' AND source!='wragge_xml' AND date>='1993-03-13' "
                      "AND person_id IS NOT NULL AND person_id!='' "
                      "AND COALESCE(speaker_type,'') NOT IN ('chair','unknown','witness') "
                      "AND COALESCE(witness_name,'')='' ORDER BY speech_id")
    for raw in rows:
        row = resolve_attribution(raw) if resolved else dict(raw)
        counts['checked'] += 1
        problem = service_problem(row, index, exceptions)
        if problem:
            counts[problem] += 1
            hits[problem].append({k: row[k] for k in ('speech_id', 'person_id', 'chamber', 'date')})
        else:
            counts['passed'] += 1
        for n, e in enumerate(exceptions):
            if all(row.get(k) == e.get(k) for k in ('speech_id', 'person_id', 'chamber', 'date')):
                used.add(n)
    return dict(counts=dict(counts), hits=dict(hits),
                stale_exceptions=[e for n, e in enumerate(exceptions) if n not in used])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--raw', action='store_true', help='show stored attribution before source resolution')
    args = parser.parse_args()
    db = sqlite3.connect(f'file:{args.db}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    report = audit(db, resolved=not args.raw)
    args.out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report['counts'], sort_keys=True))
    return 1 if report['hits'] or report['stale_exceptions'] else 0


if __name__ == '__main__':
    sys.exit(main())
