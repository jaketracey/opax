#!/usr/bin/env python3
"""Offline, read-only plenary coverage census and previous-night regression check.

Only aggregate SQL touches the corpus. State and report JSON live in the refresh
state directory, never in git. Expected dates are evidence, never weekdays.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from contextlib import closing
import csv
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import statistics
import sys
import time
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CHAMBERS = ('representatives', 'senate', 'federation', 'nsw_la', 'nsw_lc',
            'vic_la', 'vic_lc', 'sa_ha', 'sa_lc', 'qld_la', 'act_la',
            'wa_la', 'wa_lc', 'tas_ha', 'tas_lc', 'nt_la')
INDEX = 'idx_speeches_coverage'
REPAIR_MANIFESTS = {
    'senate.json': ('im/senate-backfill', {'senate': range(2014, 2020)}),
    'nsw.json': ('im/nsw-hansard-gap', {'nsw_la': range(2023, 2026), 'nsw_lc': range(2023, 2026)}),
}
SQL = f"""SELECT chamber, date, COUNT(*) FROM speeches INDEXED BY {INDEX}
WHERE chamber IN ({','.join('?' for _ in CHAMBERS)})
AND (hearing_type IS NULL OR hearing_type='') AND date < ?
GROUP BY chamber, date"""


def completed_day(now):
    """The nightly checks completed Sydney dates, even on a UTC host."""
    if now.tzinfo is None:
        raise ValueError('now must have a timezone')
    return now.astimezone(ZoneInfo('Australia/Sydney')).date() - timedelta(days=1)


def census(path, through, budget=40):
    started = time.monotonic()
    counts = defaultdict(Counter)
    # No schema initialisation, extension loading, writes or fallback table scan.
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=2)) as db:
        db.execute('PRAGMA query_only=ON')
        db.set_progress_handler(lambda: int(time.monotonic() - started > budget), 10000)
        params = (*CHAMBERS, (through + timedelta(days=1)).isoformat())
        plan = [r[3] for r in db.execute('EXPLAIN QUERY PLAN ' + SQL, params)]
        if not any('COVERING INDEX ' + INDEX in step for step in plan):
            raise ValueError(f'coverage needs covering index {INDEX}; run normal index setup first')
        for ch, stamp, n in db.execute(SQL, params):
            day = date.fromisoformat(stamp[:10]).isoformat()
            counts[ch][day] += n
    return counts, {'seconds': round(time.monotonic() - started, 4), 'query_plan': plan}


def load_allowlist(path):
    data = json.loads(Path(path).read_text())
    if data['schema_version'] != 1:
        raise ValueError('unsupported allowlist version')
    seen = set()
    for entry in data['entries']:
        if entry['id'] in seen or entry['kind'] not in {
                'non_sitting', 'not_held', 'known_being_filled', 'accepted_regression'}:
            raise ValueError('duplicate or invalid allowlist entry')
        seen.add(entry['id'])
        if (date.fromisoformat(entry['start']) > date.fromisoformat(entry['end'])
                or not set(entry['chambers']) <= set(CHAMBERS) or not entry['reason'] or not entry['evidence']):
            raise ValueError('invalid allowlist bounds, chamber or reason')
        if entry['kind'] in {'known_being_filled', 'accepted_regression'} and not entry['lane']:
            raise ValueError('coverage exception needs its repair lane')
        if entry['kind'] == 'known_being_filled':
            date.fromisoformat(entry['review_by'])
        if entry['kind'] == 'accepted_regression':
            if (len(entry['chambers']) != 1 or type(entry['year']) is not int
                    or not 1901 <= entry['year'] <= 9999
                    or set(entry['counts']) != {'rows', 'speech_days'}
                    or any(type(n) is not int or n < 0 for n in entry['counts'].values())
                    or (entry['counts']['rows'] == 0) != (entry['counts']['speech_days'] == 0)):
                raise ValueError('accepted regression needs one chamber, year and post-removal counts')
    return data['entries']


def expected_days(calendar, cache_root, extra, through, manifest_dir=None):
    expected = defaultdict(set)
    bases = defaultdict(set)
    notes = []

    def add(ch, stamp, basis):
        day = date.fromisoformat(stamp[:10]).isoformat()
        if ch in CHAMBERS and day <= through.isoformat():
            expected[ch].add(day)
            bases[(ch, day[:4])].add(basis)

    cal = json.loads(Path(calendar).read_text())
    for row in cal['days']:
        for key, ch in [('house', 'representatives'), ('senate', 'senate')]:
            if row[key]:
                add(ch, row['date'], 'published_calendar')
    if through.isoformat() > cal['expires']:
        notes.append(f"federal calendar expired {cal['expires']}; later expected dates unknown")
    hist = Path(cache_root) / 'hansard/hansard-xml/all-sitting-days.csv'
    inventories = list(extra)
    if hist.exists():
        inventories.append(hist)
    else:
        notes.append('historical federal inventory absent; historical expected dates unknown')
    for path in inventories:
        with Path(path).open() as f:
            for row in csv.DictReader(f):
                ch = row.get('chamber', row.get('house'))
                add('representatives' if ch == 'hofreps' else ch, row['date'], 'cached_inventory')
    nsw_files = sorted((Path(cache_root) / 'votes_state/nsw').glob('year_*.json'))
    if not nsw_files:
        notes.append('NSW calendar cache absent; NSW expected dates unknown')
    for path in nsw_files:
        for row in json.loads(path.read_text()):
            for event in row.get('Events', []):
                ch = {'Legislative Assembly': 'nsw_la', 'Legislative Council': 'nsw_lc'}[event['Chamber']]
                add(ch, row['date'], 'cached_calendar')
    if manifest_dir is not None:
        for name, (lane, chambers) in REPAIR_MANIFESTS.items():
            path = Path(manifest_dir) / name
            if not path.exists():
                notes.append(f'repair sitting-day manifest absent: {lane}; expected {path.name}')
                continue
            if path.stat().st_size > 1_048_576:
                raise ValueError(f'repair sitting-day manifest too large: {name}')
            data = json.loads(path.read_text())
            generated = datetime.fromisoformat(data['generated_at'].replace('Z', '+00:00'))
            if (data['schema_version'] != 1 or data['lane'] != lane or generated.tzinfo is None
                    or not data['evidence'] or set(data['chambers']) != set(chambers)):
                raise ValueError(f'invalid repair sitting-day manifest: {name}')
            for ch, years in chambers.items():
                inventory = data['chambers'][ch]
                if set(inventory) != {str(year) for year in years}:
                    raise ValueError(f'incomplete repair manifest years: {name}/{ch}')
                for year, days in inventory.items():
                    if not isinstance(days, list) or len(days) != len(set(days)) or len(days) > 366:
                        raise ValueError(f'invalid repair dates: {name}/{ch}/{year}')
                    for day in days:
                        if date.fromisoformat(day).isoformat() != day or not day.startswith(year + '-'):
                            raise ValueError(f'invalid repair date: {name}/{ch}/{year}')
                        add(ch, day, 'repair_sitting_manifest')
    return expected, bases, notes


def zero_runs(days, held):
    """Consecutive expected dates, crossing weekends, as in the gap audit."""
    run = []
    for day in sorted(days):
        if held.get(day, 0):
            if run:
                yield run
            run = []
        else:
            run.append(day)
    if run:
        yield run


def analyse(counts, expected, bases, entries, through, previous=None, drop_fraction=0.5, history=None):
    stamp = through.isoformat()
    alerts, reports = [], []
    history = history if history is not None else previous or {}
    resolved = set(history.get('resolved_known', []))
    annual, chambers, floors = {}, {}, {}
    seen_runs = {}

    def applies(e, ch, day):
        return ch in e['chambers'] and e['start'] <= day <= e['end']

    # Resolve only on actual expected-day evidence. Positive rows alone cannot
    # certify a multi-year hole is filled. Remember resolution so later loss pages.
    for e in entries:
        if e['kind'] != 'known_being_filled' or e['id'] in resolved:
            continue
        complete = True
        for ch in e['chambers']:
            for year in range(int(e['start'][:4]), int(e['end'][:4]) + 1):
                days = [d for d in expected[ch] if d.startswith(str(year)) and applies(e, ch, d)]
                if not days or any(not counts[ch].get(d) for d in days):
                    complete = False
        if complete:
            resolved.add(e['id'])
        else:
            message = (f"known, being filled: {','.join(e['chambers'])} {e['start']} to {e['end']}; "
                       f"lane {e['lane']}; review by {e['review_by']}; {e['reason']}")
            (alerts if stamp > e['review_by'] else reports).append(message)

    non_sitting = [e for e in entries if e['kind'] == 'non_sitting']
    known = [e for e in entries if e['kind'] == 'known_being_filled' and e['id'] not in resolved]
    for ch in CHAMBERS:
        held = counts[ch]
        days = sorted(d for d in expected[ch] if not any(applies(e, ch, d) for e in non_sitting))
        median = statistics.median(held.values()) if held else 0
        thin = [d for d, n in sorted(held.items()) if 0 < n < median * 0.1]
        if thin:
            reports.append(f"thin days: {ch} {len(thin)} below 10% of median {median:g}; sample {','.join(thin[:10])}")
        chambers[ch] = {'rows': sum(held.values()), 'speech_days': len(held), 'median_rows': median,
                        'thin_days': thin, 'known_expected_days': len(days),
                        'longest_zero_run': max((len(r) for r in zero_runs(days, held)), default=0)
                        if days else None}
        years = {int(d[:4]) for d in [*held, *days]}
        years.update(int(k.split('/')[1]) for k in (previous or {}).get('annual', {}) if k.startswith(ch + '/'))
        for e in known:
            if ch in e['chambers']:
                years.update(range(int(e['start'][:4]), min(through.year, int(e['end'][:4])) + 1))
        if years:
            years.update(range(min(years), through.year + 1))
        for year in sorted(years):
            key = f'{ch}/{year}'
            occupied = {d: n for d, n in held.items() if d.startswith(str(year))}
            year_days = [d for d in days if d.startswith(str(year))]
            annual[key] = {'rows': sum(occupied.values()), 'speech_days': len(occupied),
                           'expected_days': len(year_days) if year_days else None,
                           'expected_basis': sorted(bases.get((ch, str(year)), [])),
                           'known_holes': [e['id'] for e in known if ch in e['chambers']
                                           and int(e['start'][:4]) <= year <= int(e['end'][:4])],
                           'longest_zero_run': max((len(r) for r in zero_runs(year_days, held)), default=0)
                           if year_days else None}
        # Recess dates are removed from the expectation. Known missing dates
        # break the paging sequence, so new gaps outside the bounds stay visible.
        exceptions = known + [e for e in entries if e['kind'] == 'not_held'
                              and not held and stamp <= e['end']]
        paging_days = {d: (held.get(d, 0) or int(any(applies(e, ch, d) for e in exceptions))) for d in days}
        for run in zero_runs(days, paging_days):
            if len(run) >= 5:
                # Compare actual date sets: shifted/merged runs with new missing
                # dates page, unchanged or shortened runs remain report-only.
                # Use the prior night so a same-day retry cannot clear a new alarm.
                prior_runs = (previous or {}).get('zero_runs', {}).get(ch, [])
                unchanged = any(set(run) <= set(old) for old in prior_runs)
                message = f"zero expected-day run: {ch} {run[0]} to {run[-1]} ({len(run)} days)"
                (reports if unchanged else alerts).append(message)
                seen_runs.setdefault(ch, []).append(run)
        for e in entries:
            if e['kind'] == 'not_held' and ch in e['chambers'] and not held:
                message = f"not held: {ch}; review by {e['end']}; {e['reason']}"
                (alerts if stamp > e['end'] else reports).append(message)

    # Acknowledgements approve one explicit transition, never a whole date
    # window. Persist consumption so the same entry cannot hide a later drop.
    accepted = dict(history.get('accepted_regressions', {}))
    acknowledgements = []
    for e in entries:
        if e['kind'] != 'accepted_regression' or previous is None:
            continue
        record = accepted.get(e['id'])
        if record is None:
            if not e['start'] <= stamp <= e['end']:
                reports.append(f"accepted regression inactive: {e['id']}; expires {e['end']}")
                continue
            key = f"{e['chambers'][0]}/{e['year']}"
            if any(annual.get(key, {}).get(m) != n for m, n in e['counts'].items()):
                reports.append(f"accepted regression counts do not match: {e['id']}; lane {e['lane']}")
                continue
            loss = {}
            for metric, after in e['counts'].items():
                floor = previous.get('regression_floors', {}).get(f'chamber-year:{key}:{metric}', 0)
                before = previous['annual'].get(key, {}).get(metric, 0)
                loss[metric] = max(0, max(before, floor / (1 - drop_fraction)) - after)
            if not any(loss.values()):
                continue
            record = {'through': stamp, 'baseline': previous['through'], 'key': key,
                      'counts': e['counts'], 'loss': loss}
            accepted[e['id']] = record
        # Same-day retries must still compare the approved transition with the
        # prior night, but use the approved counts as that transition's baseline.
        if record['through'] == stamp and record['baseline'] == previous['through']:
            acknowledgements.append(record)
            reports.append(f"accepted regression: {e['id']}; {e['reason']}; lane {e['lane']}; expires {e['end']}")

    # Never let a recess or known backfill hide loss of already held data.
    if previous is not None:
        for key, values in annual.items():
            ch, year = key.split('/')
            not_held = any(e['kind'] == 'not_held' and ch in e['chambers'] and stamp <= e['end']
                           for e in entries) and not chambers[ch]['rows']
            covered = all(any(applies(e, ch, d) for e in known) for d in expected[ch]
                          if d.startswith(year) and not any(applies(e, ch, d) for e in non_sitting))
            if (key not in previous['annual'] and values['rows'] == 0 and values['expected_days']
                    and not covered and not not_held):
                alerts.append(f'new zero chamber-year: {ch}/{year} has expected dates but no speech rows')
    for scope, current, prior in [('chamber', chambers, (previous or {}).get('chambers', {})),
                                   ('chamber-year', annual, (previous or {}).get('annual', {}))]:
        for key in sorted(set(current) | set(prior)):
            for metric in ('rows', 'speech_days'):
                before = prior.get(key, {}).get(metric, 0)
                after = current.get(key, {}).get(metric, 0)
                floor_key = f'{scope}:{key}:{metric}'
                floor = (previous or {}).get('regression_floors', {}).get(floor_key, 0)
                for ack in acknowledgements:
                    if scope == 'chamber-year' and ack['key'] == key:
                        before = min(before, ack['counts'][metric])
                        floor = 0
                    elif scope == 'chamber' and ack['key'].split('/')[0] == key:
                        immediate_loss = max(0, previous['annual'].get(ack['key'], {}).get(metric, 0)
                                             - ack['counts'][metric])
                        before = max(0, before - immediate_loss)
                        floor = max(0, floor - ack['loss'][metric] * (1 - drop_fraction))
                if before > 0 and (after == 0 or after < before * (1 - drop_fraction)):
                    floor = max(floor, before * (1 - drop_fraction))
                if floor and after < floor:
                    floors[floor_key] = floor
                    alerts.append(f"coverage regression: {scope} {key} {metric} {before} -> {after}; recovery floor {floor:g}")
    snapshot = {'schema_version': 1, 'through': stamp, 'annual': annual,
                'chambers': {ch: {k: v for k, v in values.items() if k != 'thin_days'}
                             for ch, values in chambers.items()},
                'resolved_known': sorted(resolved), 'regression_floors': floors,
                'zero_runs': seen_runs, 'accepted_regressions': accepted}
    return snapshot, {'through': stamp, 'baseline_only': previous is None,
                      'alerts': alerts if previous is not None else [], 'reports': reports,
                      'annual': annual, 'chambers': chambers}


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n')
    tmp.replace(path)


def run(args, now=None):
    now = now or datetime.now(timezone.utc)
    through = date.fromisoformat(args.through) if args.through else completed_day(now)
    state_path = Path(args.state_dir) / 'coverage-snapshot-v1.json'
    report_path = Path(args.state_dir) / 'coverage-report-v1.json'
    started = time.monotonic()
    try:
        previous, latest = None, None
        if state_path.exists():
            state = json.loads(state_path.read_text())
            latest = state['current']
            if (latest['schema_version'] != 1 or latest['through'] > through.isoformat()
                    or not isinstance(latest['annual'], dict) or not isinstance(latest['chambers'], dict)):
                raise ValueError('invalid or future coverage baseline')
            # A same-day retry compares with the prior night, never with itself.
            previous = state['previous'] if latest['through'] == through.isoformat() else latest
        counts, timing = census(args.db, through)
        expected, bases, notes = expected_days(args.calendar, args.cache_root, args.expected_days, through,
                                             getattr(args, 'sitting_day_manifest_dir', None)
                                             or Path(args.state_dir) / 'coverage-sitting-days')
        entries = load_allowlist(args.allowlist)
        snapshot, report = analyse(counts, expected, bases, entries, through, previous, args.drop_fraction, latest)
        if previous is None:
            report['reports'].append('coverage baseline recorded; comparisons start on the next night')
        elif previous['through'] != (through - timedelta(days=1)).isoformat():
            report['reports'].append(f"previous successful coverage snapshot is {previous['through']}; "
                                     'intervening nightly snapshots are missing')
        report['reports'].extend(notes)
        report['timing'] = timing
        report['seconds'] = round(time.monotonic() - started, 4)
        # A failed census leaves the last good baseline in place.
        atomic_json(report_path, report)
        atomic_json(state_path, {'current': snapshot, 'previous': previous})
    except Exception as error:
        report = {'through': through.isoformat(), 'alerts': [f'coverage check failed: {error}'],
                  'reports': [], 'error': True}
        atomic_json(report_path, report)
    for label in ('alerts', 'reports'):
        for item in report[label]:
            print(f'coverage {label}: {item}')
    print(f"coverage through {through}: {len(report['alerts'])} alerts; report {report_path}")
    return int(bool(report['alerts']))


def status_messages(state_dir, now=None):
    """Read the local receipt for nightly's existing fail/warn arrays."""
    report_path = Path(state_dir) / 'coverage-report-v1.json'
    if not report_path.exists() and not (Path(state_dir) / 'coverage-snapshot-v1.json').exists():
        # The first night before any check has run: nothing to compare, nothing to page.
        return [('report', 'coverage: no receipt or baseline yet; the first check records a baseline only')]
    try:
        report = json.loads(report_path.read_text())
        if report['through'] != completed_day(now or datetime.now(timezone.utc)).isoformat():
            raise ValueError('stale coverage receipt')
        if not all(isinstance(report[key], list) for key in ('alerts', 'reports')):
            raise ValueError('invalid coverage receipt findings')
        messages = [('alert', 'coverage: ' + str(item)) for item in report['alerts']]
        messages.extend(('report', 'coverage: ' + str(item)) for item in report['reports'])
        return messages
    except (OSError, ValueError, KeyError, TypeError) as error:
        return [('alert', f'coverage receipt unavailable: {error}')]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', default=str(Path.home() / '.cache/autoresearch/parli.db'))
    ap.add_argument('--state-dir', default=str(Path.home() / '.cache/autoresearch/pipeline'))
    ap.add_argument('--cache-root', default=str(Path.home() / '.cache/autoresearch'))
    ap.add_argument('--calendar', default=str(ROOT / 'portal/public/parliament/sitting-days.json'))
    ap.add_argument('--allowlist', default=str(ROOT / 'scripts/coverage_allowlist.json'))
    ap.add_argument('--expected-days', type=Path, action='append', default=[], help='additional cached chamber,date CSV')
    ap.add_argument('--sitting-day-manifest-dir', type=Path,
                    help='repair lane JSON inventories; default STATE_DIR/coverage-sitting-days')
    ap.add_argument('--through', help='completed Sydney date override for offline replays')
    ap.add_argument('--drop-fraction', type=float, default=0.5)
    ap.add_argument('--status-only', action='store_true', help='emit receipt to nightly fail/warn arrays; no DB access')
    args = ap.parse_args()
    if args.status_only:
        for severity, finding in status_messages(args.state_dir):
            print(severity + '\t' + finding.replace('\n', ' ').replace('\t', ' '))
        return 0
    if not 0 < args.drop_fraction < 1:
        ap.error('--drop-fraction must be between 0 and 1')
    return run(args)


if __name__ == '__main__':
    sys.exit(main())
