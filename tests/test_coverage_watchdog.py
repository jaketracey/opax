"""Offline coverage regression, calendar and alert-path tests."""
from argparse import Namespace
from collections import Counter, defaultdict
from contextlib import closing, redirect_stdout
from datetime import date, datetime, timedelta, timezone
import io
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from scripts import coverage_watchdog as wd
from scripts.refresh_watchdog import evaluate
from scripts.vm import periodic_state

ROOT = Path(__file__).resolve().parents[1]


def shell_function(name):
    source = (ROOT / 'scripts/vm/nightly.sh').read_text()
    one_line = re.search(r'^' + name + r'\(\) \{[^\n]*\}\n', source, re.M)
    return (one_line or re.search(r'^' + name + r'\(\) \{\n.*?^\}\n', source, re.M | re.S))[0]


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.db = self.root / 'speeches.sqlite'
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute('CREATE TABLE speeches(chamber TEXT, date TEXT, hearing_type TEXT, text TEXT)')
            db.execute(f'CREATE INDEX {wd.INDEX} ON speeches(chamber,date,hearing_type)')
            db.executemany('INSERT INTO speeches VALUES(?,?,?,?)',
                           [('senate', '2026-02-02', None, 'fixture')] * 100 +
                           [('senate', '2026-02-03', None, 'fixture')] * 100 +
                           [('senate', '2026-02-04', None, 'fixture')] * 100)
        self.counts, _ = wd.census(self.db, date(2026, 2, 4))
        self.expected = defaultdict(set)
        self.bases = defaultdict(set)
        self.through = date(2026, 2, 28)

    def analyse(self, counts=None, previous=None, entries=()):
        return wd.analyse(self.counts if counts is None else counts, self.expected, self.bases,
                          entries, self.through, previous)

    def entry(self, kind='non_sitting', **extra):
        return dict(id='fixture', kind=kind, chambers=['senate'], start='2026-02-01', end='2026-02-28',
                    reason='Fixture reviewed exception', lane='im/fixture', evidence='fixture',
                    review_by='2026-02-28', **extra)

    def test_zero_year_and_chamber_regression_alert_and_recovery(self):
        previous, _ = self.analyse()
        empty = defaultdict(Counter)
        snapshot, result = self.analyse(empty, previous)
        self.assertTrue(any('chamber-year senate/2026 rows 300 -> 0' in s for s in result['alerts']))
        self.assertTrue(any('chamber senate speech_days 3 -> 0' in s for s in result['alerts']))
        # A second unchanged empty night must not make a historical loss healthy.
        snapshot, result = self.analyse(empty, snapshot)
        self.assertTrue(result['alerts'])
        recovered, result = self.analyse(previous=snapshot)
        self.assertFalse(result['alerts'])
        self.assertFalse(recovered['regression_floors'])

    def test_a_missing_year_survives_a_healthy_chamber_total(self):
        self.counts['senate']['2025-02-04'] = 100
        previous, _ = self.analyse()
        del self.counts['senate']['2025-02-04']
        self.counts['senate']['2026-02-04'] += 100
        _, report = self.analyse(previous=previous)
        self.assertTrue(any('chamber-year senate/2025' in a for a in report['alerts']))
        self.assertFalse(any('chamber senate' in a for a in report['alerts']))

    def test_strict_half_threshold_for_rows_and_days(self):
        previous, _ = self.analyse()
        self.counts['senate'] = Counter({'2026-02-02': 75, '2026-02-03': 75})
        self.assertFalse(self.analyse(previous=previous)[1]['alerts'])
        self.counts['senate']['2026-02-02'] = 74
        self.assertTrue(self.analyse(previous=previous)[1]['alerts'])
        self.counts['senate'] = Counter({'2026-02-02': 300})
        self.assertTrue(any('speech_days' in a for a in self.analyse(previous=previous)[1]['alerts']))

    def test_five_expected_days_cross_weekend_and_recess_breaks_run(self):
        previous, _ = self.analyse()
        self.expected['senate'] = {'2026-02-05', '2026-02-06', '2026-02-09', '2026-02-10', '2026-02-11'}
        self.assertEqual(len(self.analyse(previous=previous)[1]['alerts']), 1)
        self.assertFalse(self.analyse(previous=previous, entries=[self.entry()])[1]['alerts'])
        self.expected['senate'].remove('2026-02-11')
        self.assertFalse(self.analyse(previous=previous)[1]['alerts'])

    def test_allowlisted_recess_never_hides_loss_of_held_rows(self):
        previous, _ = self.analyse()
        self.assertTrue(self.analyse(defaultdict(Counter), previous, [self.entry()])[1]['alerts'])

    def test_known_hole_reports_resolves_and_reopens_as_alert(self):
        self.expected['senate'] = {f'2026-02-{i:02}' for i in range(5, 10)}
        known = self.entry('known_being_filled')
        previous, _ = self.analyse()
        snapshot, report = self.analyse(previous=previous, entries=[known])
        self.assertFalse(report['alerts'])
        self.assertTrue(any('known, being filled' in s and 'im/fixture' in s for s in report['reports']))
        for d in self.expected['senate']:
            self.counts['senate'][d] = 100
        filled, report = self.analyse(previous=snapshot, entries=[known])
        self.assertEqual(filled['resolved_known'], ['fixture'])
        self.assertFalse(any('known, being filled' in s for s in report['reports']))
        for d in self.expected['senate']:
            del self.counts['senate'][d]
        self.assertTrue(self.analyse(previous=filled, entries=[known])[1]['alerts'])

    def test_known_hole_does_not_hide_new_dates_outside_its_bounds(self):
        previous, _ = self.analyse()
        self.expected['senate'] = {f'2026-02-{i:02}' for i in range(5, 16)}
        known = self.entry('known_being_filled')
        known['end'] = '2026-02-09'
        _, result = self.analyse(previous=previous, entries=[known])
        self.assertEqual(len(result['alerts']), 1)
        self.assertIn('2026-02-10 to 2026-02-15 (6 days)', result['alerts'][0])

    def test_first_night_records_only_even_with_gaps(self):
        self.expected['senate'] = {f'2026-02-{i:02}' for i in range(5, 11)}
        _, result = self.analyse()
        self.assertTrue(result['baseline_only'])
        self.assertFalse(result['alerts'])
        self.assertEqual(result['annual']['senate/2026']['longest_zero_run'], 6)

    def test_new_zero_chamber_year_alerts_even_before_five_expected_days(self):
        previous, _ = self.analyse()
        self.expected['nsw_la'].add('2026-02-05')
        _, result = self.analyse(previous=previous)
        self.assertTrue(any('new zero chamber-year: nsw_la/2026' in a for a in result['alerts']))

    def test_thin_days_report_only_strictly_under_ten_percent(self):
        self.counts['senate']['2026-02-05'] = 9
        self.counts['senate']['2026-02-06'] = 10
        previous, _ = self.analyse()
        _, result = self.analyse(previous=previous)
        self.assertFalse(result['alerts'])
        self.assertEqual(result['chambers']['senate']['thin_days'], ['2026-02-05'])

    def test_sydney_midnight_aedt_utc_and_dst(self):
        for instant, expected in [('2026-11-13T12:59:59+00:00', '2026-11-12'),
                                  ('2026-11-13T13:00:00+00:00', '2026-11-13'),
                                  ('2026-01-01T00:30:00+11:00', '2025-12-31'),
                                  ('2026-07-01T14:00:00+00:00', '2026-07-01')]:
            self.assertEqual(wd.completed_day(datetime.fromisoformat(instant)).isoformat(), expected)

    def test_read_only_covering_census_excludes_committee_and_future_rows(self):
        with closing(sqlite3.connect(self.db)) as db, db:
            db.executemany('INSERT INTO speeches VALUES(?,?,?,?)',
                           [('senate', '2026-02-02', 'estimates', 'x'),
                            ('senate_committee', '2026-02-02', None, 'x'),
                            ('senate', '2026-02-03T14:00:00', '', 'x'),
                            ('senate', '2026-02-05', None, 'x')])
        before = self.db.read_bytes()
        counts, timing = wd.census(self.db, date(2026, 2, 4))
        self.assertEqual(self.db.read_bytes(), before)
        self.assertEqual(sum(counts['senate'].values()), 301)
        self.assertEqual(counts['senate']['2026-02-03'], 101)
        self.assertTrue(any('COVERING INDEX' in p for p in timing['query_plan']))
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(f'DROP INDEX {wd.INDEX}')
        with self.assertRaises(sqlite3.OperationalError):
            wd.census(self.db, date(2026, 2, 4))

    def args(self):
        calendar = self.root / 'calendar.json'
        calendar.write_text(json.dumps({'expires': '2026-12-31', 'days': []}))
        return Namespace(db=self.db, through='2026-02-04', state_dir=self.root,
                         calendar=calendar, cache_root=self.root, expected_days=[],
                         allowlist=ROOT / 'scripts/coverage_allowlist.json', drop_fraction=0.5)

    def test_persisted_previous_night_same_day_retry_and_failed_census(self):
        args = self.args()
        with redirect_stdout(io.StringIO()):
            self.assertEqual(wd.run(args), 0)
            args.through = '2026-02-05'
            with closing(sqlite3.connect(self.db)) as db, db:
                db.execute('DELETE FROM speeches')
            self.assertEqual(wd.run(args), 1)
            self.assertEqual(wd.run(args), 1)
            path = self.root / 'coverage-snapshot-v1.json'
            before = path.read_bytes()
            with closing(sqlite3.connect(self.db)) as db, db:
                db.execute(f'DROP INDEX {wd.INDEX}')
            self.assertEqual(wd.run(args), 1)
            self.assertEqual(path.read_bytes(), before)

    def test_alert_and_report_reach_existing_refresh_watchdog(self):
        now = datetime(2026, 11, 14, 0, tzinfo=timezone.utc)
        path = self.root / 'coverage-report-v1.json'
        path.write_text(json.dumps({'through': '2026-11-13', 'alerts': ['lost senate/2018'],
                                    'reports': ['known, being filled: NSW; lane im/nsw-hansard-gap']}))
        messages = wd.status_messages(self.root, now)
        # The refresh itself succeeded: coverage alerts page on their own field.
        status = {'finished': now.isoformat(), 'status': 'ok', 'failures': [],
                  'coverage_alerts': [m for s, m in messages if s == 'alert'],
                  'warnings': [m for s, m in messages if s == 'report']}
        corpus = {'refresh': {'checked_at': now.isoformat()}}
        problems, _, warnings = evaluate(corpus, status, now)
        self.assertTrue(any('lost senate/2018' in p for p in problems))
        self.assertTrue(any('known, being filled: NSW' in w for w in warnings))
        status.update(coverage_alerts=[])
        self.assertFalse(evaluate(corpus, status, now)[0])
        path.unlink()
        # First night: no receipt and no baseline records only.
        self.assertEqual(wd.status_messages(self.root, now),
                         [('report', 'coverage: no receipt or baseline yet; the first check records a baseline only')])
        # Once a baseline exists, a missing receipt means tonight's check never finished.
        (self.root / 'coverage-snapshot-v1.json').write_text('{}')
        self.assertEqual(wd.status_messages(self.root, now)[0][0], 'alert')

    def test_future_baseline_and_corruption_alert_without_resetting_state(self):
        args = self.args()
        path = self.root / 'coverage-snapshot-v1.json'
        with redirect_stdout(io.StringIO()):
            wd.run(args)
            for content in (path.read_text().replace('2026-02-04', '2027-02-04'), '{bad json'):
                path.write_text(content)
                self.assertEqual(wd.run(args), 1)
                self.assertEqual(path.read_text(), content)

    def test_stale_or_malformed_status_receipt_pages(self):
        now = datetime(2026, 11, 14, 0, tzinfo=timezone.utc)
        for value in ({'through': '2026-11-12', 'alerts': [], 'reports': []},
                      {'through': '2026-11-13', 'alerts': 'bad', 'reports': []}):
            (self.root / 'coverage-report-v1.json').write_text(json.dumps(value))
            self.assertEqual(wd.status_messages(self.root, now)[0][0], 'alert')

    def test_committed_allowlist_is_bounded_and_expired_not_held_pages(self):
        entries = wd.load_allowlist(ROOT / 'scripts/coverage_allowlist.json')
        self.assertEqual(len(entries), 8)
        self.expected['wa_la'] = {f'2026-02-{i:02}' for i in range(5, 11)}
        previous, _ = self.analyse(entries=entries)
        self.assertFalse(self.analyse(previous=previous, entries=entries)[1]['alerts'])
        self.through = date(2027, 2, 1)
        previous, _ = self.analyse(entries=entries)
        _, result = self.analyse(previous=previous, entries=entries)
        self.assertTrue(any('not held: wa_la' in a for a in result['alerts']))

    def test_calendar_and_cache_inventory_no_weekday_guessing(self):
        args = self.args()
        args.calendar.write_text(json.dumps({'expires': '2026-12-31', 'days': [
            {'date': '2026-02-02', 'house': True, 'senate': False},
            {'date': '2026-02-06', 'house': True, 'senate': True}]}))
        hist = self.root / 'hansard/hansard-xml/all-sitting-days.csv'
        hist.parent.mkdir(parents=True)
        hist.write_text('house,date\nhofreps,1994-02-02\nsenate,1994-02-03\n')
        nsw = self.root / 'votes_state/nsw/year_2023.json'
        nsw.parent.mkdir(parents=True)
        nsw.write_text(json.dumps([{'date': '2023-05-09', 'Events': [{'Chamber': 'Legislative Council'}]}]))
        days, _, notes = wd.expected_days(args.calendar, self.root, [], date(2026, 2, 4))
        self.assertEqual(days['senate'], {'1994-02-03'})
        self.assertEqual(days['representatives'], {'1994-02-02', '2026-02-02'})
        self.assertEqual(days['nsw_lc'], {'2023-05-09'})
        self.assertFalse(notes)

    def test_shell_wiring_is_soft_and_feeds_fail_warn(self):
        daily = (ROOT / 'scripts/daily_refresh.sh').read_text()
        nightly = (ROOT / 'scripts/vm/nightly.sh').read_text()
        block = daily.split('# Read-only coverage after the normal refresh.')[1].split('log "Paused sources:')[0]
        self.assertIn('--db "$DB" --state-dir "$PIPE"', block)
        self.assertNotIn('FAILED_STEPS+=', block)
        self.assertIn('alert) coverage_fail "$finding"', nightly)
        self.assertIn('report) warn "$finding"', nightly)
        for script in ('scripts/daily_refresh.sh', 'scripts/vm/nightly.sh'):
            subprocess.run(['bash', '-n', str(ROOT / script)], check=True)

    def test_real_daily_block_continues_and_nightly_consumes_alert_receipt(self):
        args = self.args()
        args.through = (wd.completed_day(datetime.now(timezone.utc)) - timedelta(days=1)).isoformat()
        with redirect_stdout(io.StringIO()):
            wd.run(args)
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute('DELETE FROM speeches')
        daily = (ROOT / 'scripts/daily_refresh.sh').read_text()
        block = daily.split('# Read-only coverage after the normal refresh.')[1].split('log "Paused sources:')[0]
        nightly = (ROOT / 'scripts/vm/nightly.sh').read_text()
        consume = ''.join(shell_function(name) for name in ('coverage_fail', 'coverage_status')) + '\ncoverage_status\n'
        driver = '''
set -euo pipefail
PY=$1; REPO=$2; PIPE=$3; DB=$4
COVERAGE_FAILURES=()
cd "$REPO"
step_selected() { return 0; }
log() { echo "$*"; }
# Unit harness executes the command directly; the real shell has GNU timeout.
timeout() { shift 2; "$@"; }
fail() { echo "ALERT $*"; }
warn() { echo "REPORT $*"; }
'''
        result = subprocess.run(['bash', '-c', driver + '#' + block + '\necho REFRESH_COMPLETED\n' + consume,
                                 '_', sys.executable, str(ROOT), str(self.root), str(self.db)],
                                text=True, capture_output=True, check=True)
        self.assertIn('REFRESH_COMPLETED', result.stdout)
        self.assertIn('COVERAGE ALERT: coverage: coverage regression: chamber-year senate/2026 rows 300 -> 0', result.stdout)

    def test_same_day_retry_uses_prior_night_counts_without_a_recovery_floor(self):
        args = self.args()
        path = self.root / 'coverage-snapshot-v1.json'
        with redirect_stdout(io.StringIO()):
            wd.run(args)
            args.through = '2026-02-05'
            with closing(sqlite3.connect(self.db)) as db, db:
                db.execute("DELETE FROM speeches WHERE date='2026-02-04'")
            wd.run(args)  # First run today is healthy and has no persistent floors.
            self.assertEqual(json.loads(path.read_text())['current']['annual']['senate/2026']['rows'], 200)
            self.assertFalse(json.loads(path.read_text())['current']['regression_floors'])
            with closing(sqlite3.connect(self.db)) as db, db:
                db.execute('DELETE FROM speeches WHERE rowid NOT IN (SELECT rowid FROM speeches LIMIT 120)')
            self.assertEqual(wd.run(args), 1)
        report = json.loads((self.root / 'coverage-report-v1.json').read_text())
        self.assertTrue(any('senate/2026 rows 300 -> 120' in a for a in report['alerts']))
        self.assertEqual(json.loads(path.read_text())['previous']['annual']['senate/2026']['rows'], 300)

    def test_zero_runs_only_page_when_new_or_longer(self):
        previous, _ = self.analyse()
        self.expected['senate'] = {f'2026-02-{i:02}' for i in range(5, 10)}
        seen, result = self.analyse(previous=previous)
        self.assertTrue(any('zero expected-day run' in a for a in result['alerts']))
        same, result = self.analyse(previous=seen)
        self.assertFalse(result['alerts'])
        self.assertTrue(any('zero expected-day run' in r for r in result['reports']))
        self.expected['senate'].add('2026-02-10')
        longer, result = self.analyse(previous=same)
        self.assertTrue(any('(6 days)' in a for a in result['alerts']))
        self.assertFalse(self.analyse(previous=longer)[1]['alerts'])

    def test_new_zero_run_stays_alerting_on_same_day_reruns(self):
        args = self.args()
        report_path = self.root / 'coverage-report-v1.json'
        with redirect_stdout(io.StringIO()):
            self.assertEqual(wd.run(args), 0)
            args.through = '2026-02-05'
            days = ['2026-01-19', '2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23']
            for extra in ([], ['2026-01-26']):
                days.extend(extra)
                args.calendar.write_text(json.dumps({'expires': '2026-12-31', 'days': [
                    {'date': day, 'house': False, 'senate': True} for day in days]}))
                for attempt in range(2):
                    with self.subTest(days=len(days), attempt=attempt):
                        self.assertEqual(wd.run(args), 1)
                        report = json.loads(report_path.read_text())
                        self.assertTrue(any('zero expected-day run:' in a for a in report['alerts']))
            args.through = '2026-02-06'
            self.assertEqual(wd.run(args), 0)
        report = json.loads(report_path.read_text())
        self.assertTrue(any('zero expected-day run:' in r for r in report['reports']))

    def test_known_hole_review_deadline_pages_until_filled(self):
        known = self.entry('known_being_filled')
        known['review_by'] = '2026-02-27'
        self.expected['senate'] = {'2026-02-05'}
        previous, _ = self.analyse(entries=[known])
        _, result = self.analyse(previous=previous, entries=[known])
        self.assertTrue(any('review by 2026-02-27' in a for a in result['alerts']))
        self.counts['senate']['2026-02-05'] = 100
        _, result = self.analyse(previous=previous, entries=[known])
        self.assertFalse(result['alerts'])

    def test_resolved_old_hole_ids_do_not_hide_extended_intervals(self):
        previous, _ = self.analyse()
        previous['resolved_known'] = ['senate-2014-2018', 'nsw-2023-oct2024']
        entries = wd.load_allowlist(ROOT / 'scripts/coverage_allowlist.json')
        _, report = self.analyse(previous=previous, entries=entries)
        self.assertEqual(len([r for r in report['reports'] if r.startswith('known, being filled')]), 3)

    def test_committed_repair_bounds_and_lanes_match_review(self):
        entries = wd.load_allowlist(ROOT / 'scripts/coverage_allowlist.json')
        holes = {e['chambers'][0]: e for e in entries if e['kind'] == 'known_being_filled'}
        # Review dates: projected publication finish (Sundays skipped) plus 14 days.
        for ch, end, review_by, finish in [('senate', '2019-04-03', '2027-01-02', '19 December 2026'),
                                           ('nsw_la', '2024-11-21', '2027-01-23', '9 January 2027'),
                                           ('nsw_lc', '2025-02-10', '2027-01-23', '9 January 2027')]:
            self.assertEqual(holes[ch]['end'], end)
            self.assertEqual(holes[ch]['lane'], 'im/backfill-joint')
            self.assertEqual(holes[ch]['review_by'], review_by)
            self.assertEqual(holes[ch]['review_reason'],
                             f'backfill enabled; projected publication finish {finish} (Sundays skipped) plus 14 days')

    def test_accepted_regression_allowlist_validation(self):
        path = self.root / 'allowlist.json'
        entry = self.accepted_entry()
        path.write_text(json.dumps({'schema_version': 1, 'entries': [entry]}))
        self.assertEqual(wd.load_allowlist(path)[0]['year'], 2026)
        for field in ('year', 'counts', 'reason', 'lane', 'end'):
            invalid = {k: v for k, v in entry.items() if k != field}
            path.write_text(json.dumps({'schema_version': 1, 'entries': [invalid]}))
            with self.assertRaises((ValueError, KeyError)):
                wd.load_allowlist(path)

    def accepted_entry(self, **changes):
        entry = self.entry('accepted_regression', year=2026, counts={'rows': 100, 'speech_days': 1})
        entry.update(changes)
        return entry

    def test_accepted_regression_clears_only_approved_loss_and_cannot_be_reused(self):
        previous, _ = self.analyse()
        self.counts['senate'] = Counter({'2026-02-02': 100})
        dropped, _ = self.analyse(previous=previous)
        ack = self.accepted_entry()
        accepted, result = self.analyse(previous=dropped, entries=[ack])
        self.assertFalse(result['alerts'])
        self.assertFalse(accepted['regression_floors'])
        self.assertTrue(any('accepted regression:' in r for r in result['reports']))
        # Even while the entry is active, consumption cannot cover a later drop.
        self.through += timedelta(days=1)
        ack['end'] = '2026-03-10'
        self.counts['senate']['2026-02-02'] = 40
        self.assertTrue(self.analyse(previous=accepted, entries=[ack])[1]['alerts'])

    def test_consumed_acceptance_cannot_acknowledge_the_same_counts_after_recovery(self):
        previous, _ = self.analyse()
        self.counts['senate'] = Counter({'2026-02-02': 100})
        ack = self.accepted_entry(end='2026-03-10')
        accepted, result = self.analyse(previous=previous, entries=[ack])
        self.assertFalse(result['alerts'])
        self.through += timedelta(days=1)
        self.counts['senate'] = Counter({f'2026-02-{d:02}': 100 for d in (2, 3, 4)})
        recovered, _ = self.analyse(previous=accepted, entries=[ack])
        self.through += timedelta(days=1)
        self.counts['senate'] = Counter({'2026-02-02': 100})
        self.assertTrue(self.analyse(previous=recovered, entries=[ack])[1]['alerts'])

    def test_expired_or_mismatched_acknowledgement_does_not_hide_drop(self):
        previous, _ = self.analyse()
        self.counts['senate'] = Counter({'2026-02-02': 40})
        self.assertTrue(self.analyse(previous=previous, entries=[self.accepted_entry()])[1]['alerts'])
        self.counts['senate']['2026-02-02'] = 100
        ack = self.accepted_entry(end='2026-02-27')
        self.assertTrue(self.analyse(previous=previous, entries=[ack])[1]['alerts'])

    def test_acceptance_does_not_hide_another_year_and_survives_same_day_retry(self):
        self.counts['senate']['2025-02-02'] = 300
        previous, _ = self.analyse()
        self.counts['senate'] = Counter({'2026-02-02': 100})
        ack = self.accepted_entry()
        accepted, result = self.analyse(previous=previous, entries=[ack])
        self.assertTrue(any('senate/2025' in a for a in result['alerts']))
        self.assertFalse(any('senate/2026' in a for a in result['alerts']))
        _, retried = wd.analyse(self.counts, self.expected, self.bases, [ack], self.through,
                                previous, history=accepted)
        self.assertEqual(result['alerts'], retried['alerts'])

    def manifest(self, name):
        lane, chambers = wd.REPAIR_MANIFESTS[name]
        return {'schema_version': 1, 'lane': lane, 'generated_at': '2026-11-14T00:00:00Z',
                'evidence': 'fixture source-day discovery inventory, including dates not yet loaded',
                'chambers': {ch: {str(y): [f'{y}-02-02'] for y in years} for ch, years in chambers.items()}}

    def test_nightly_manifest_input_retires_known_holes_when_all_days_fill(self):
        args = self.args()
        args.through = '2026-11-13'
        manifests = self.root / 'coverage-sitting-days'
        manifests.mkdir()
        records = []
        for name in wd.REPAIR_MANIFESTS:
            manifest = self.manifest(name)
            (manifests / name).write_text(json.dumps(manifest))
            for ch, years in manifest['chambers'].items():
                for days in years.values():
                    records.extend((ch, day, None, 'fixture') for day in days)
        with redirect_stdout(io.StringIO()):
            wd.run(args)
            report = json.loads((self.root / 'coverage-report-v1.json').read_text())
            self.assertEqual(len([r for r in report['reports'] if r.startswith('known, being filled')]), 3)
            with closing(sqlite3.connect(self.db)) as db, db:
                db.executemany('INSERT INTO speeches VALUES(?,?,?,?)', records)
            wd.run(args)
        report = json.loads((self.root / 'coverage-report-v1.json').read_text())
        self.assertFalse(any('known, being filled' in r for r in report['reports']))
        self.assertIn('repair_sitting_manifest', report['annual']['senate/2014']['expected_basis'])
        state = json.loads((self.root / 'coverage-snapshot-v1.json').read_text())
        self.assertEqual(len(state['current']['resolved_known']), 3)

    def test_malformed_or_incomplete_repair_manifest_alerts_and_keeps_baseline(self):
        args = self.args()
        manifests = self.root / 'coverage-sitting-days'
        manifests.mkdir()
        manifest = self.manifest('senate.json')
        path = manifests / 'senate.json'
        with redirect_stdout(io.StringIO()):
            wd.run(args)
            state_path = self.root / 'coverage-snapshot-v1.json'
            baseline = state_path.read_bytes()
            manifest['chambers']['senate'].pop('2019')
            path.write_text(json.dumps(manifest))
            self.assertEqual(wd.run(args), 1)
            self.assertEqual(state_path.read_bytes(), baseline)

    def test_coverage_alerts_do_not_leave_periodic_groups_due_or_fail_the_refresh(self):
        today = wd.completed_day(datetime.now(timezone.utc)) + timedelta(days=1)
        functions = ''.join(shell_function(name) for name in (
            'fail', 'coverage_fail', 'warn', 'coverage_status', 'periodic_refresh_complete',
            'write_status', 'finish', 'nightly_exit'))
        for ordinary_failure in (False, True):
            state_path = self.root / 'periodic-refresh-v1.json'
            state = periodic_state.read_state(state_path, today)
            periodic_state.plan(state, today, 'weekly monthly frl')
            periodic_state.attempt(state, today, 'weekly monthly frl')
            periodic_state.write_state(state_path, state)
            report = {'through': (today - timedelta(days=1)).isoformat(),
                      'alerts': ['lasting coverage hold'], 'reports': []}
            (self.root / 'coverage-report-v1.json').write_text(json.dumps(report))
            driver = '''
set -uo pipefail
PY=$1; REPO=$2; PIPE=$3; TODAY=$4
cd "$REPO"
FAILURES=(); COVERAGE_FAILURES=(); WARNINGS=()
log() { echo "$*"; }
publish_status() { echo STATUS_PUBLISHED; }
MARK="$PIPE/mark"; LASTFILE="$PIPE/nightly-last.json"
STARTED_AT=2026-11-14T00:00:00Z; COMMIT_SHA=abcdef0123456789
DEPLOY=published; RESULT_SUMMARY=""
PERIODIC_ACCEPTED=1; PERIODIC_DATE=$TODAY
PERIODIC_STATE="$PIPE/periodic-refresh-v1.json"; groups="weekly monthly frl"
'''
            driver += functions + '\ntrap nightly_exit EXIT\ncoverage_status\n'
            driver += 'fail "export failed"\n' if ordinary_failure else ''
            driver += 'periodic_refresh_complete\nfinish\n'
            result = subprocess.run(['bash', '-c', driver, '_', sys.executable, str(ROOT),
                                     str(self.root), today.isoformat()], text=True, capture_output=True)
            self.assertEqual(result.returncode, int(ordinary_failure), result.stderr)
            pending = periodic_state.read_state(state_path, today)
            self.assertEqual(any('due' in r for r in pending['groups'].values()), ordinary_failure)
            if not ordinary_failure:
                self.assertTrue(all('last_success' in r for r in pending['groups'].values()))
            published = json.loads((self.root / 'nightly-last.json').read_text())
            self.assertEqual(published['status'], 'failed' if ordinary_failure else 'ok')
            self.assertEqual(published['failures'], ['export failed'] if ordinary_failure else [])
            self.assertEqual(published['coverage_alerts'], ['coverage: lasting coverage hold'])
            self.assertFalse(any('died unexpectedly' in r for r in published['failures']))
            self.assertIn('STATUS_PUBLISHED', result.stdout)

    def test_status_reader_crash_becomes_a_coverage_failure(self):
        functions = shell_function('coverage_fail') + shell_function('coverage_status')
        for reader in ('exit 9', 'echo "partial output"; exit 9'):
            fake = self.root / 'crash-reader'
            fake.write_text('#!/bin/bash\n' + reader + '\n')
            fake.chmod(0o755)
            driver = 'set -euo pipefail\nPY=$1; PIPE=$2; COVERAGE_FAILURES=()\nlog() { echo "$*"; }\n'
            driver += functions + '\ncoverage_status\ntest "${#COVERAGE_FAILURES[@]}" -eq 1\n'
            result = subprocess.run(['bash', '-c', driver, '_', str(fake), str(self.root)],
                                     text=True, capture_output=True, check=True)
            self.assertIn('coverage status reader failed', result.stdout)


if __name__ == '__main__':
    unittest.main()
