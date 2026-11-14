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
from parli.ingest.speaker_identity import EVIDENCE, resolve_attribution  # noqa: E402
from scripts.roster_source_profiles import reference  # noqa: E402


def service_index(bundle, extra=()):
    seats = {e['electorate_id']: e for e in bundle['electorates']}
    people = {p['person_id']: p for p in bundle['people']}
    index = defaultdict(list)
    for term in bundle['terms']:
        seat, person = seats[term['electorate_id']], people[term['person_id']]
        for pid in {person['person_id'], person.get('legacy_person_id')} - {None}:
            index[pid].append(dict(chamber=seat['chamber'], seat=seat['name'],
                                   start=term['start'], end=term.get('end')))
    for term in [*EVIDENCE.get('service_terms', []), *extra]:
        for pid in {term['person_id'], term.get('legacy_person_id')} - {None}:
            index[pid].append(term)
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
    house = [t for t in terms if t['chamber'] == row['chamber']]
    if not house:
        return 'chamber_mismatch'
    dated = [t for t in house if t['start'] <= row['date']
             and (t['end'] is None or row['date'] <= t['end'])]
    if not dated:
        return 'outside_house_service'
    if row.get('electorate') and not any(row['electorate'].strip().casefold() in
                                         [s.casefold() for s in t.get('seat_prints', [t['seat']])]
                                         for t in dated):
        return 'seat_mismatch'
    return None


def audit(db, *, resolved=True, person_ids=(), all_federal=False, extra_service=()):
    index = service_index(reference(), extra_service)
    exceptions = json.loads((ROOT / 'scripts/speech_service_exceptions.json').read_text())['exceptions']
    counts = Counter()
    hits = defaultdict(list)
    used = set()
    pairs = Counter()
    # Match the sweep's published House coverage and speaker-type boundary.
    scope = ("chamber IN ('representatives','senate') AND COALESCE(state,'federal')='federal'"
             if all_federal else "chamber='representatives' AND source!='wragge_xml' AND date>='1993-03-13'")
    params = []
    if person_ids:
        scope += ' AND person_id IN (' + ','.join('?' for _ in person_ids) + ')'
        params.extend(person_ids)
    rows = db.execute("SELECT speech_id, person_id, speaker_name, speaker_name_clean, electorate, "
                      "chamber, date, source, state, speaker_type, witness_name FROM speeches "
                      "WHERE " + scope + " "
                      "AND person_id IS NOT NULL AND person_id!='' "
                      "AND COALESCE(speaker_type,'') NOT IN ('chair','unknown','witness') "
                      "AND COALESCE(witness_name,'')='' ORDER BY speech_id", params)
    for raw in rows:
        row = resolve_attribution(raw) if resolved else dict(raw)
        counts['checked'] += 1
        problem = service_problem(row, index, exceptions)
        if problem:
            counts[problem] += 1
            proposed = resolve_attribution(raw)
            correct = (proposed['person_id'] if proposed['person_id'] != raw['person_id']
                       and service_problem(proposed, index) is None else None)
            hits[problem].append({k: row[k] for k in ('speech_id', 'person_id', 'chamber', 'date',
                                                     'electorate', 'source', 'speaker_name')}
                                 | dict(correct_person_id=correct))
            pairs[(raw['person_id'], correct, problem, raw['source'])] += 1
        else:
            counts['passed'] += 1
        for n, e in enumerate(exceptions):
            if all(row.get(k) == e.get(k) for k in ('speech_id', 'person_id', 'chamber', 'date')):
                used.add(n)
    return dict(counts=dict(counts), hits=dict(hits),
                pairs=[dict(current=k[0], correct=k[1], reason=k[2], source=k[3], count=n)
                       for k, n in sorted(pairs.items(), key=lambda item: str(item[0]))],
                stale_exceptions=[e for n, e in enumerate(exceptions) if n not in used])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--raw', action='store_true', help='show stored attribution before source resolution')
    parser.add_argument('--person-id', action='append', default=[], help='restrict to an original stored id; repeatable')
    parser.add_argument('--all-federal', action='store_true', help='include Senate, Wragge and all dates, without a length floor')
    parser.add_argument('--service-evidence', type=Path, help='additional independently sourced service terms as a JSON list')
    args = parser.parse_args()
    db = sqlite3.connect(f'file:{args.db}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    extra = json.loads(args.service_evidence.read_text()) if args.service_evidence else []
    report = audit(db, resolved=not args.raw, person_ids=args.person_id,
                   all_federal=args.all_federal, extra_service=extra)
    args.out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report['counts'], sort_keys=True))
    return 1 if report['hits'] or report['stale_exceptions'] else 0


if __name__ == '__main__':
    sys.exit(main())
