"""Offline coverage regression, calendar and alert-path tests."""
from argparse import Namespace
from collections import Counter, defaultdict
from contextlib import closing, redirect_stdout
from datetime import date, datetime, timedelta, timezone
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from scripts import coverage_watchdog as wd
from scripts.refresh_watchdog import evaluate

ROOT = Path(__file__).resolve().parents[1]


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
                    reason='Fixture reviewed exception', lane='im/fixture', evidence='fixture', **extra)

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
        self.expected['senate'] = {'2026-02-05', '2026-02-06', '2026-02-09', '2026-02-10', '2026-02-11'}
        previous, _ = self.analyse()
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
        self.expected['senate'] = {f'2026-02-{i:02}' for i in range(5, 16)}
        known = self.entry('known_being_filled')
        known['end'] = '2026-02-09'
        previous, _ = self.analyse()
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
                                    'reports': ['known, being filled: NSW; lane im/hansard-gaps']}))
        messages = wd.status_messages(self.root, now)
        status = {'finished': now.isoformat(), 'status': 'failed',
                  'failures': [m for s, m in messages if s == 'alert'],
                  'warnings': [m for s, m in messages if s == 'report']}
        corpus = {'refresh': {'checked_at': now.isoformat()}}
        problems, _, warnings = evaluate(corpus, status, now)
        self.assertTrue(any('lost senate/2018' in p for p in problems))
        self.assertTrue(any('known, being filled: NSW' in w for w in warnings))
        status.update(status='ok', failures=[])
        self.assertFalse(evaluate(corpus, status, now)[0])
        path.unlink()
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
        self.assertEqual(len(entries), 7)
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
        self.assertIn('alert) fail "$finding"', nightly)
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
        consume = '  while IFS=' + nightly.split('  while IFS=', 1)[1].split('\nfi\n', 1)[0]
        driver = '''
set -euo pipefail
PY=$1; REPO=$2; PIPE=$3; DB=$4
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
        self.assertIn('ALERT coverage: coverage regression: chamber-year senate/2026 rows 300 -> 0', result.stdout)


if __name__ == '__main__':
    unittest.main()
