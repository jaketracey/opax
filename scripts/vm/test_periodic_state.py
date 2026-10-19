"""Offline cadence, interruption and publication receipts for periodic refresh."""
from datetime import date, datetime
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("periodic_state.py")
spec = importlib.util.spec_from_file_location("periodic_state", SCRIPT)
state = importlib.util.module_from_spec(spec)
spec.loader.exec_module(state)
COMMIT = "a" * 40


class PeriodicStateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "pipeline/periodic-refresh-v1.json"

    def plan(self, day, forced=""):
        day = date.fromisoformat(day)
        current = state.read_state(self.path, day)
        selected = state.plan(current, day, forced)
        state.write_state(self.path, current)
        return selected

    def complete(self, day, selected):
        day = date.fromisoformat(day)
        current = state.read_state(self.path, day)
        state.complete(current, day, selected, COMMIT)
        state.write_state(self.path, current)

    def attempt(self, day, selected):
        day = date.fromisoformat(day)
        current = state.read_state(self.path, day)
        state.attempt(current, day, selected)
        state.write_state(self.path, current)

    def test_first_run_preserves_existing_calendar(self):
        for day, expected in (("2026-10-19", []), ("2026-10-18", ["weekly"]),
                              ("2026-11-01", ["weekly", "monthly"]),
                              ("2026-10-22", ["frl"])):
            with self.subTest(day=day):
                self.path.unlink(missing_ok=True)
                self.assertEqual(self.plan(day), expected)

    def test_missed_days_include_each_overdue_cadence(self):
        self.assertEqual(self.plan("2026-10-16"), [])
        self.assertEqual(self.plan("2026-11-02"), ["weekly", "monthly"])
        pending = json.loads(self.path.read_text())["groups"]
        self.assertEqual(pending["weekly"]["due"], "2026-11-01")
        self.assertEqual(pending["monthly"]["due"], "2026-11-01")
        self.assertEqual(pending["frl"]["due"], "2026-10-29")
        self.complete("2026-11-02", "weekly monthly")
        self.assertEqual(self.plan("2026-11-03"), ["frl"])

    def test_interruption_retries_next_day_and_restart(self):
        self.plan("2026-10-18")  # persisted before a cancelled/failed attempt
        self.assertEqual(self.plan("2026-10-19"), ["weekly"])
        self.assertEqual(self.plan("2026-10-20"), ["weekly"])
        self.assertEqual(json.loads(self.path.read_text())["groups"]["weekly"]["pending_since"], "2026-10-18")

    def test_success_records_commit_and_clears_only_selected_debt(self):
        self.plan("2026-11-01")
        self.complete("2026-11-02", "weekly")
        self.assertEqual(self.plan("2026-11-02"), ["monthly"])
        row = state.snapshot(self.path, date(2026, 11, 2))["groups"]["weekly"]
        self.assertEqual(row, {"last_success": "2026-11-02", "commit": COMMIT})
        self.complete("2026-11-02", "monthly")
        self.assertEqual(self.plan("2026-11-03"), [])
        self.assertEqual(self.plan("2026-11-08"), ["weekly"])
        self.assertIn("due", json.loads(self.path.read_text())["groups"]["frl"])

    def test_successful_quiet_rerun_does_not_repeat_calendar_work(self):
        self.plan("2026-10-18")
        self.complete("2026-10-18", "weekly")
        self.assertEqual(self.plan("2026-10-18"), [])
        self.assertEqual(self.plan("2026-10-19"), [])

    def test_force_overrides_selection_without_losing_scheduled_debt(self):
        self.assertEqual(self.plan("2026-11-01", "frl"), ["frl"])
        self.complete("2026-11-01", "frl")
        self.assertEqual(self.plan("2026-11-02"), ["weekly", "monthly"])

    def test_persistent_weekly_hold_cannot_starve_frl(self):
        self.plan("2026-10-17")
        self.assertEqual(self.plan("2026-10-18"), ["weekly"])
        self.attempt("2026-10-18", "weekly")
        self.assertEqual(self.plan("2026-10-22"), ["frl"])
        self.attempt("2026-10-22", "frl")  # both families keep failing/holding
        self.assertEqual(self.plan("2026-10-23"), ["weekly"])
        self.attempt("2026-10-23", "weekly")
        self.assertEqual(self.plan("2026-10-24"), ["frl"])
        self.attempt("2026-10-24", "frl")
        self.assertEqual(self.plan("2026-10-25"), ["weekly"])

    def test_skipped_plan_does_not_change_attempt_fairness(self):
        self.plan("2026-10-16")
        self.assertEqual(self.plan("2026-10-23"), ["weekly"])
        self.assertEqual(self.plan("2026-10-24"), ["weekly"])
        self.attempt("2026-10-24", "weekly")
        self.assertEqual(self.plan("2026-10-25"), ["frl"])

    def test_forced_rehearsal_is_pending_until_confirmed(self):
        self.assertEqual(self.plan("2026-10-19", "monthly weekly"), ["monthly", "weekly"])
        self.assertEqual(self.plan("2026-10-20"), ["weekly", "monthly"])
        self.complete("2026-10-20", "weekly monthly")
        self.assertEqual(self.plan("2026-10-21"), [])

    def test_sydney_date_across_utc_midnight_and_dst_boundaries(self):
        for instant, expected in (("2026-10-03T15:30:00+00:00", "2026-10-04"),
                                  ("2026-10-04T13:30:00+00:00", "2026-10-05"),
                                  ("2026-04-04T15:30:00+00:00", "2026-04-05"),
                                  ("2026-04-05T13:30:00+00:00", "2026-04-05")):
            with self.subTest(instant=instant):
                self.assertEqual(state.sydney_day(datetime.fromisoformat(instant)).isoformat(), expected)

    def test_monthly_first_sunday_year_and_leap_boundaries(self):
        for day, expected in (("2027-01-01", "2026-12-06"), ("2027-01-03", "2027-01-03"),
                              ("2028-02-29", "2028-02-06"), ("2026-03-01", "2026-03-01")):
            self.assertEqual(state.due_dates(date.fromisoformat(day))["monthly"].isoformat(), expected)

    def test_frl_day_override(self):
        day = date(2026, 10, 19)
        self.assertEqual(state.due_dates(day, 1)["frl"], day)
        with self.assertRaises(ValueError):
            state.due_dates(day, 8)

    def test_corrupt_state_fails_without_replacement(self):
        self.path.parent.mkdir(parents=True)
        for raw in ("{unfinished", "[]", '{"schema":2,"groups":{}}',
                    '{"schema":1,"groups":["weekly","monthly","frl"]}'):
            self.path.write_text(raw)
            result = subprocess.run([sys.executable, str(SCRIPT), "plan", "--state", str(self.path),
                                     "--date", "2026-10-19"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(self.path.read_text(), raw)

    def test_invalid_force_and_unconfirmed_completion_do_not_write(self):
        self.plan("2026-10-19", "weekly")
        original = self.path.read_bytes()
        for action, extra in (("plan", ["--force", "weekly unknown"]),
                              ("complete", ["--groups", "weekly", "--commit", "not-confirmed"]),
                              ("complete", ["--groups", "monthly", "--commit", COMMIT])):
            result = subprocess.run([sys.executable, str(SCRIPT), action, "--state", str(self.path),
                                     "--date", "2026-10-19", *extra], capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(self.path.read_bytes(), original)

    def test_backwards_test_clock_does_not_erase_pending_or_watermark(self):
        self.plan("2026-10-22")
        self.assertEqual(self.plan("2026-10-20"), ["frl"])
        current = state.read_state(self.path, date(2026, 10, 20))
        self.assertEqual(current["observed_through"], "2026-10-22")
        with self.assertRaises(ValueError):
            state.complete(current, date(2026, 10, 20), "frl", COMMIT)

    def test_snapshot_excludes_unknown_fields(self):
        self.plan("2026-10-18")
        current = json.loads(self.path.read_text())
        current["unexpected"] = "excluded"
        current["groups"]["weekly"]["unexpected"] = "excluded"
        state.write_state(self.path, current)
        self.assertNotIn("excluded", json.dumps(state.snapshot(self.path, date(2026, 10, 18))))
        self.assertEqual(list(self.path.parent.glob("*.tmp.*")), [])


if __name__ == "__main__":
    unittest.main()
