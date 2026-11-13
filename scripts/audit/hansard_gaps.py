#!/usr/bin/env python3
"""Offline Hansard coverage audit. No acquisition, corpus writes, or credentials.

Run with nice -n 10. Expected dates are evidence, never weekdays or recess guesses.
The public candidate counts apply the sync's gates before exact-body deduplication;
they are deliberately not described as live KB or profile counts.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import statistics
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from parli.ingest.arag_sync import JUNK_PREDICATES  # noqa: E402

PLENARY = {'representatives', 'senate', 'federation', 'nsw_la', 'nsw_lc',
           'vic_la', 'vic_lc', 'sa_ha', 'sa_lc', 'qld_la', 'act_la'}
SOURCE_WINDOWS = {'wragge_xml': ('1901-01-01', '2005-12-31'),
                  'zenodo': ('1998-01-01', '2022-12-31'),
                  'openaustralia': ('2006-01-01', '9999-12-31')}


def guard_load():
    if os.getloadavg()[1] >= 40:
        raise SystemExit('load5 >= 40; resume the audit when load is lower')


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def csv_out(path, rows, fields):
    with path.open('w') as f:
        writer = csv.DictWriter(f, fields, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def json_out(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def runs(days, occupied, minimum=5):
    """Consecutive dates in the supplied evidence sequence, not calendar days."""
    run = []
    for day in sorted(days):
        if not occupied.get(day, 0):
            run.append(day)
        else:
            if len(run) >= minimum:
                yield run
            run = []
    if len(run) >= minimum:
        yield run


def diagnosis(ch, source, first, covered, total):
    if ch == 'federation':
        return 'fedchamb_flag_not_retained', 'F', 'M'
    if covered == total:
        return 'covered_by_other_source', 'O', 'S'
    if first < '2006-01-01':
        if ch == 'representatives':
            return 'SGML_parser_failure_in_sample', 'H', 'L'
        return 'incomplete_ingest_and_SGML_failures_in_sample', 'W', 'L'
    if source == 'zenodo':
        return 'finite_source_ends_2022_09_08', 'A', 'M'
    if ch == 'representatives' and covered:
        return 'source_overlap_plus_uningested_tail', 'A', 'M'
    return 'not_ingested_in_local_snapshot', 'A', 'M'


def snapshot(path):
    s = path.stat()
    return {'bytes': s.st_size, 'mtime_utc': datetime.fromtimestamp(s.st_mtime, timezone.utc).isoformat(),
            'mtime_ns': s.st_mtime_ns}


def extract(db_path):
    guard_load()
    with sqlite3.connect(db_path.resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.execute('PRAGMA query_only=ON')
        db.execute('PRAGMA threads=1')
        db.execute('PRAGMA cache_size=-32000')
        # Cancel rather than contribute to a machine whose five-minute load is 40+.
        def progress():
            return int(os.getloadavg()[1] >= 40)
        db.set_progress_handler(progress, 100_000)
        group = 'state,chamber,substr(date,1,10),source,hearing_type'
        raw = [list(r) for r in db.execute(f'SELECT {group},COUNT(*) FROM speeches GROUP BY {group}')]
        zenodo_dates = sorted({r[2] for r in raw if r[3] == 'zenodo'})
        # Read-only JSON table avoids creating even temporary database tables.
        gate = ("date >= '1993-03-13' AND LENGTH(text)>=200 AND source!='wragge_xml' "
                "AND NOT (source='openaustralia' AND chamber='representatives' "
                'AND date IN (SELECT value FROM json_each(?))) ' + JUNK_PREDICATES)
        eligible = [list(r) for r in db.execute(
            f'SELECT {group},COUNT(*) FROM speeches WHERE {gate} GROUP BY {group}',
            (json.dumps(zenodo_dates),))]
        divisions = [list(r) for r in db.execute('SELECT state,house,substr(date,1,10),COUNT(*) '
                    'FROM divisions GROUP BY state,house,substr(date,1,10)')]
        ext = [list(r) for r in db.execute('SELECT jurisdiction,house,substr(date,1,10),source,COUNT(*) '
               'FROM ext_divisions GROUP BY jurisdiction,house,substr(date,1,10),source')]
        vic = [list(r) for r in db.execute('SELECT sitting_date,chamber,speeches_count FROM vic_hansard_progress')]
    return {'speeches': raw, 'eligible_before_exact_dedupe': eligible,
            'divisions': divisions, 'ext_divisions': ext, 'vic_progress': vic}


def zenodo_days(path):
    """The cached ZIP is intact; the separate extracted parquet is truncated."""
    csv.field_size_limit(20_000_000)
    counts = defaultdict(Counter)
    with zipfile.ZipFile(path) as z:
        name = 'hansard-corpus/hansard_corpus_1998_to_2022.csv'
        with z.open(name) as f:
            for i, row in enumerate(csv.DictReader(io.TextIOWrapper(f))):
                if i % 5_000 == 0:
                    guard_load()
                key = (row['date'], row['fedchamb_flag'])
                body = re.sub(r'<[^>]+>', '', row['body'])
                body = re.sub(r'[ \t]+', ' ', body).strip()
                counts[key]['raw_rows'] += 1
                counts[key]['chars_50'] += len(body) >= 50
                counts[key]['chars_200'] += len(body) >= 200
    return [dict(date=d, fedchamb_flag=flag, **v) for (d, flag), v in sorted(counts.items())]


def analyze(data, cache, public, as_of, out, db_meta, reuse_zenodo=None):
    expected = defaultdict(lambda: defaultdict(set))
    raw, candidate = defaultdict(Counter), defaultdict(Counter)
    states, sources = {}, defaultdict(set)
    evidence_inputs = []

    def expect(ch, day, evidence):
        if ch in PLENARY and day <= as_of:
            date.fromisoformat(day)
            expected[ch][day].add(evidence)

    for rows, target in [(data['speeches'], raw), (data['eligible_before_exact_dedupe'], candidate)]:
        for state, ch, day, source, hearing, n in rows:
            if ch not in PLENARY or hearing or day > as_of:
                continue
            states[ch] = state
            sources[ch].add(source)
            target[(ch, source)][day] += n
            target[(ch, 'all')][day] += n
            if target is raw:
                expect(ch, day, 'stored_transcript')

    hist = cache / 'hansard/hansard-xml/all-sitting-days.csv'
    evidence_inputs.append({'path': 'hansard/hansard-xml/all-sitting-days.csv', 'sha256': digest(hist)})
    for name in ['README.md', 'missing.csv']:
        path = hist.parent / name
        evidence_inputs.append({'path': f'hansard/hansard-xml/{name}', 'sha256': digest(path)})
    for row in csv.DictReader(hist.open()):
        expect('representatives' if row['house'] == 'hofreps' else row['house'], row['date'], 'historical_inventory')
    # missing.csv is already a subset of all-sitting-days.csv; do not count twice.
    calendar_path = public / 'parliament/sitting-days.json'
    cal = json.loads(calendar_path.read_text())
    evidence_inputs.append({'path': 'portal/public/parliament/sitting-days.json', 'sha256': digest(calendar_path)})
    for row in cal['days']:
        for key, ch in [('house', 'representatives'), ('senate', 'senate')]:
            if row[key]:
                expect(ch, row['date'], 'published_calendar')

    # Division days prove sittings; a date with no division proves nothing.
    for row in data['divisions']:
        expect(row[1], row[2], 'division_db')
    for row in data['ext_divisions']:
        expect(row[1], row[2], 'division_db')
    tvfy_paths = sorted((cache / 'tvfy/list').glob('*.json'))
    tvfy_hash = hashlib.sha256()
    for path in tvfy_paths:
        body = path.read_bytes()
        tvfy_hash.update(path.name.encode() + b'\0' + body)
        for row in json.loads(body):
            expect(row['house'], row['date'], 'tvfy_cached_division')
    evidence_inputs.append({'path': 'tvfy/list/*.json', 'files': len(tvfy_paths), 'sha256_name_nul_body': tvfy_hash.hexdigest()})
    nsw_path = cache / 'votes_state/nsw/year_2026.json'
    evidence_inputs.append({'path': 'votes_state/nsw/year_2026.json', 'sha256': digest(nsw_path)})
    for row in json.loads(nsw_path.read_text()):
        for event in row.get('Events', []):
            ch = {'Legislative Assembly': 'nsw_la', 'Legislative Council': 'nsw_lc'}[event['Chamber']]
            expect(ch, row['date'], 'nsw_cached_calendar')
    for day, ch, n in data['vic_progress']:
        if n > 0:  # an empty attempted ingest is not proof the chamber sat
            expect(ch, day, 'vic_ingest_receipt')

    zpath = cache / 'hansard/hansard-corpus.zip'
    guard_load()
    if reuse_zenodo:
        zdays = list(csv.DictReader(reuse_zenodo.open()))
        for row in zdays:
            for key in ['raw_rows', 'chars_50', 'chars_200']:
                row[key] = int(row[key])
    else:
        zdays = zenodo_days(zpath)
    csv_out(out / 'zenodo-days.csv', zdays, ['date', 'fedchamb_flag', 'raw_rows', 'chars_50', 'chars_200'])
    for row in zdays:
        expect('federation' if row['fedchamb_flag'] == '1' else 'representatives', row['date'], 'zenodo_input')
    sources['federation'].add('zenodo')
    states['federation'] = 'federal'
    # ACT is held on main, but not in this snapshot. No guessed sitting dates.
    states['act_la'] = 'act'
    sources['act_la'].add('act_hansard')

    e_rows = [dict(chamber=ch, date=d, evidence=';'.join(sorted(ev)))
              for ch in sorted(expected) for d, ev in sorted(expected[ch].items())]
    csv_out(out / 'expected-days.csv', e_rows, ['chamber', 'date', 'evidence'])
    day_rows = []
    for (ch, source), days in sorted(raw.items()):
        if source == 'all':
            continue
        for day, n in sorted(days.items()):
            day_rows.append(dict(state=states[ch], chamber=ch, source=source, date=day, rows=n,
                                 public_candidate_rows=candidate[(ch, source)][day]))
    csv_out(out / 'speech-days.csv', day_rows,
            ['state', 'chamber', 'source', 'date', 'rows', 'public_candidate_rows'])

    annual, gaps, thin, summaries, unknown = [], [], [], [], []
    for ch in sorted(PLENARY):
        observed = raw[(ch, 'all')]
        days = sorted(expected[ch])
        first = min(observed, default=(days[0] if days else '2024-01-01'))
        # Federation's input establishes its first held logical year, not a DB chamber.
        first_year = int(first[:4])
        median = statistics.median(observed.values()) if observed else None
        summaries.append(dict(chamber=ch, first=min(observed, default=None), last=max(observed, default=None),
                              rows=sum(observed.values()), held_days=len(observed), median_rows=median))
        for source in ['all'] + sorted(sources[ch]):
            occupied = raw[(ch, source)]
            public_rows = candidate[(ch, source)]
            start, end = SOURCE_WINDOWS.get(source, (f'{first_year}-01-01', as_of)) if source != 'all' else (f'{first_year}-01-01', as_of)
            scoped_days = [d for d in days if start <= d <= min(end, as_of)]
            for year in range(max(first_year, int(start[:4])), int(min(end, as_of)[:4]) + 1):
                yd = [d for d in scoped_days if int(d[:4]) == year]
                held = [d for d in occupied if int(d[:4]) == year]
                complete = ch in {'representatives', 'senate'} and (year <= 2005 or year == 2026)
                calendar_days = [d for d in yd if expected[ch][d] & {'historical_inventory', 'published_calendar'}]
                annual.append(dict(chamber=ch, source=source, year=year,
                    expected_days=len(calendar_days) if complete else '', known_expected_days=len(yd),
                    expected_basis='calendar/inventory' if complete else 'lower_bound_only',
                    held_days=len(held), held_calendar_days=sum(occupied[d] > 0 for d in calendar_days),
                    zero_days_on_known_dates=sum(not occupied[d] for d in yd),
                    rows=sum(occupied[d] for d in held), public_candidate_rows=sum(public_rows[d] for d in held),
                    public_candidate_days=sum(public_rows[d] > 0 for d in held),
                    thin_days=sum(0 < occupied[d] < median * .1 for d in held) if median else 0))
            for run in runs(scoped_days, occupied):
                held_other = sum(observed[d] > 0 for d in run)
                ev = set.union(*(expected[ch][d] for d in run))
                cause, plan, size = diagnosis(ch, source, run[0], held_other, len(run))
                gaps.append(dict(chamber=ch, source=source, **{'from': run[0], 'to': run[-1]},
                    known_expected_days=len(run), held_days=0, held_days_any_source=held_other,
                    evidence=';'.join(sorted(ev)),
                    qualification=('classification_gap' if ch == 'federation' else
                                   'overlap_covered' if held_other == len(run) else
                                   'calendar/inventory' if ev <= {'historical_inventory', 'published_calendar'} else
                                   'lower_bound_sequence'),
                    row_estimate=round((len(run) - held_other) * median) if median else '',
                    estimate_basis='net_known_days_times_all_year_stored_chamber_median; rough triage only',
                    cause=cause, plan=plan, size=size))
        for metric, counts in [('stored', observed), ('public_candidate', candidate[(ch, 'all')])]:
            nonzero = [n for n in counts.values() if n > 0]
            med = statistics.median(nonzero) if nonzero else None
            if med:
                thin.extend(dict(chamber=ch, date=d, metric=metric, rows=n, median_rows=med,
                                 ratio=round(n / med, 6), evidence=';'.join(sorted(expected[ch][d])))
                            for d, n in sorted(counts.items()) if 0 < n < med * .1)
        # Suspect calendar intervals remain visible even when no local calendar can count them.
        # 120 days is a triage threshold, not a declaration that the chamber sat.
        held = sorted(observed)
        for before, after in zip(held, held[1:] + [as_of]):
            if (date.fromisoformat(after) - date.fromisoformat(before)).days < 120:
                continue
            lo = (date.fromisoformat(before) + timedelta(days=1)).isoformat()
            hi = (date.fromisoformat(after) - timedelta(days=1)).isoformat() if after in observed else after
            known = sum(lo <= d <= hi for d in expected[ch])
            unknown.append(dict(chamber=ch, **{'from': lo, 'to': hi}, held_days=0,
                                known_expected_days=known, expected_days='unknown outside available calendar',
                                status='candidate_interval; recesses not adjudicated'))

    csv_out(out / 'annual.csv', annual, list(annual[0]))
    csv_out(out / 'gaps.csv', gaps, list(gaps[0]))
    csv_out(out / 'thin-days.csv', thin, ['chamber', 'date', 'metric', 'rows', 'median_rows', 'ratio', 'evidence'])
    csv_out(out / 'calendar-unknown-intervals.csv', unknown, list(unknown[0]))
    filtered = [dict(chamber=ch, date=d, source=source, stored_rows=n,
                     cause='wragge_source_exclusion' if source == 'wragge_xml' else 'length_or_P1_P7_or_House_overlap')
                for (ch, source), counts in sorted(raw.items()) if source != 'all'
                for d, n in sorted(counts.items()) if d >= '1993-03-13' and not candidate[(ch, source)][d]]
    csv_out(out / 'filtered-days.csv', filtered, ['chamber', 'date', 'source', 'stored_rows', 'cause'])
    corpus = json.loads((public / 'corpus.json').read_text())
    people = json.loads((public / 'parliamentarians.json').read_text())
    cross = dict(corpus_version=corpus['version'], collected_speeches=corpus['collected_speeches'],
                 main_commit=subprocess.check_output(['git', 'merge-base', 'HEAD', 'origin/main'], cwd=ROOT, text=True).strip(),
                 export_sha256={name: digest(public / name) for name in
                                ['corpus.json', 'parliamentarians.json', 'speakers.json']},
                 main_latest_source_dates=corpus['refresh']['latest_source_dates'],
                 main_sources=corpus['sources'][:11], person_index_meta=people['meta'],
                 person_examples=[p for p in people['people'] if p['name'] in
                    {'Penny Wong', 'Sarah Hanson-Young', 'David Fawcett', 'David Shoebridge'}],
                 note='Aggregate indexes have no per-day completeness proof; these are different snapshots and grains.')
    json_out(out / 'main-cross-check.json', cross)
    focus_days = [d for d in expected['senate'] if '2018-02-09' <= d <= '2019-06-30']
    json_out(out / 'focus-2018-senate.json', dict(
        **{'from': '2018-02-09', 'to': '2019-06-30'},
        stored_rows=sum(raw[('senate', 'all')][d] for d in focus_days),
        known_expected_days=len(focus_days), expected_days=None,
        dates=sorted(focus_days), note='Division dates are a lower bound; source probe is separately recorded.'))
    json_out(out / 'measurement.json', dict(as_of=as_of, snapshot=db_meta,
        raw_speech_rows_including_committees=sum(r[-1] for r in data['speeches']),
        public_candidate_note='Sync date/length/P1-P7/source-overlap gates before exact-body dedupe and profile identity gates.',
        chambers=summaries, gap_runs=len(gaps), thin_flags=len(thin), evidence_inputs=evidence_inputs,
        zenodo_rows=sum(r['raw_rows'] for r in zdays),
        federation_input_rows=sum(r['raw_rows'] for r in zdays if r['fedchamb_flag'] == '1'),
        federation_input_chars_50=sum(r['chars_50'] for r in zdays if r['fedchamb_flag'] == '1'),
        federation_input_chars_200=sum(r['chars_200'] for r in zdays if r['fedchamb_flag'] == '1'),
        limitations=['No complete expected-day inventory for federal 2006-2025 or any state chamber.',
          'Sequences over lower-bound evidence can hide intervening unknown sitting days; not certified exhaustive.',
          'Federation Chamber labels are absent in SQLite; source fedchamb_flag proves a classification defect.',
          'ACT is held in main exports but absent in this local snapshot.',
          'No network is performed by this script.']))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', type=Path, default=Path.home() / '.cache/autoresearch/parli.db')
    ap.add_argument('--cache-root', type=Path, default=Path.home() / '.cache/autoresearch')
    ap.add_argument('--public', type=Path, default=ROOT / 'portal/public')
    ap.add_argument('--as-of', default='2026-11-14', type=lambda x: date.fromisoformat(x).isoformat())
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--reuse-extract', type=Path, help='Previously measured JSON; skips database scan')
    ap.add_argument('--reuse-zenodo-days', type=Path, help='Previously measured Zenodo day CSV; skips ZIP scan')
    args = ap.parse_args()
    guard_load()
    if os.getpriority(os.PRIO_PROCESS, 0) < 10:
        os.nice(10 - os.getpriority(os.PRIO_PROCESS, 0))
    before = snapshot(args.db)
    args.out.mkdir(parents=True, exist_ok=True)
    data = json.loads(args.reuse_extract.read_text()) if args.reuse_extract else extract(args.db)
    analyze(data, args.cache_root, args.public, args.as_of, args.out, before, args.reuse_zenodo_days)
    if snapshot(args.db) != before:
        raise SystemExit('database changed during measurement; discard these results')
    print(f'Wrote offline measurements to {args.out}; source database unchanged')


if __name__ == '__main__':
    main()
