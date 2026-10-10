"""Run the nightly bills shell functions with fixture git data and stub commands.

No production DB, network, APH or KB is used. Stub call records contain operation
names only; failures never print process command lines or arguments.
"""
import copy
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from scripts.vm import bills_guard

ROOT = Path(__file__).resolve().parents[2]
DEGRADED_PAGE = ROOT / "tests/fixtures/bills-nightly/degraded-page.json"
STAGE_CORRECTIONS = ROOT / "tests/fixtures/bills-nightly/stage-corrections.json"
CADENCE_TABLE = (
    ("2026-10-12", "skip"), ("2026-10-13", "after-sitting"), ("2026-10-14", "after-sitting"),
    ("2026-10-15", "after-sitting"), ("2026-10-16", "after-sitting"), ("2026-10-17", "skip"),
    ("2026-10-26", "skip"), ("2026-10-27", "after-sitting"), ("2026-10-28", "after-sitting"),
    ("2026-10-29", "after-sitting"), ("2026-10-30", "after-sitting"), ("2026-10-31", "skip"),
    ("2026-11-16", "skip"), ("2026-11-17", "after-sitting"), ("2026-11-18", "after-sitting"),
    ("2026-11-19", "after-sitting"), ("2026-11-20", "after-sitting"), ("2026-11-21", "skip"),
    ("2026-11-23", "skip"), ("2026-11-24", "after-sitting"), ("2026-11-25", "after-sitting"),
    ("2026-11-26", "after-sitting"), ("2026-11-27", "after-sitting"), ("2026-11-28", "skip"),
    ("2026-10-11", "weekly"), ("2026-10-18", "weekly"), ("2026-11-01", "weekly"),
    ("2026-11-22", "weekly"), ("2026-11-29", "weekly"),
)

STUB = r'''
import json, os
from pathlib import Path
import sys
mode = os.environ.get("BILL_TEST_MODE", "ok")
operation = "fetch" if "bills_fetch" in __file__ else "fill" if "--fill-briefs" in sys.argv else "export"
with open(os.environ["BILL_TEST_CALLS"], "a") as log:
    log.write(operation + "\n")
if operation in ("fetch", "export"):
    assert os.environ["OPAX_SYNC_KB"] == "0"
    assert os.environ["OPAX_DB"] == str(Path.home() / ".cache/autoresearch/parli.db")
if operation == "fetch":
    assert sys.argv[1:] == ["--parliaments", os.environ.get("OPAX_BILL_PARLIAMENT", "48"), "--refresh"]
    if mode == "fetch_fail": sys.exit(1)
    if mode == "timeout":
        import time
        time.sleep(10)
    sys.exit(0)
out = Path("portal/public/bills")
index = json.loads((out / "index.json").read_text())
if operation == "fill":
    if mode == "fill_fail": sys.exit(1)
    for path in out.glob("*.json"):
        if path.name == "index.json": continue
        doc = json.loads(path.read_text())
        for speech in doc.get("speeches", []):
            if mode != "brief_fail": speech["brief"] = "Kept brief"
        path.write_text(json.dumps(doc, indent=1) + "\n")
    sys.exit(0)
assert sys.argv[1:] == ["--out", "portal/public/bills"]
if mode in ("shrink", "vanish", "delete_file"):
    (out / "au-federal-t2.json").unlink()
    if mode != "delete_file": index["bills"].pop()
if mode == "vanish":
    index["bills"].append({"key": "au-federal-t3"})
    (out / "au-federal-t3.json").write_text(json.dumps({"key": "au-federal-t3"}))
if mode == "index_vanish":
    index["bills"].pop()
    index["bills"].append({"key": "au-federal-t3"})
    (out / "au-federal-t3.json").write_text(json.dumps({"key": "au-federal-t3"}))
if mode == "degraded":
    doc = json.loads(Path(os.environ["BILL_TEST_DEGRADED_PAGE"]).read_text())["degraded_export"]
    (out / "au-federal-t1.json").write_text(json.dumps(doc, indent=1) + "\n")
    index["bills"][0].update(status=doc["status"], status_as_of=doc["status_as_of"])
    other = json.loads((out / "au-federal-t2.json").read_text())
    other["sponsor_person_id"] = "456"
    (out / "au-federal-t2.json").write_text(json.dumps(other, indent=1) + "\n")
if mode in ("ok", "brief_fail", "export_fail", "fill_fail"):
    doc = json.loads((out / "au-federal-t1.json").read_text())
    doc["sponsor_person_id"] = "123"
    doc["divisions"][0]["title"] = "Second reading"
    if mode == "brief_fail": doc["speeches"][0]["brief"] = None
    (out / "au-federal-t1.json").write_text(json.dumps(doc, indent=1) + "\n")
    index["bills"].append({"key": "au-federal-t3"})
    (out / "au-federal-t3.json").write_text(json.dumps({"key": "au-federal-t3", "speeches": []}, indent=1) + "\n")
index["generated_at"] = "2026-10-10T03:15:00+11:00"
index["count"] = len(index["bills"])
if mode == "bad_count": index["count"] += 1
(out / "index.json").write_text(json.dumps(index, indent=1) + "\n")
if mode == "export_fail": sys.exit(1)
'''

HARNESS = r'''
set -uo pipefail
PY="$BILL_TEST_PYTHON"
PIPE="$HOME/.cache/autoresearch/pipeline"
mkdir -p "$PIPE"
FAILURES=()
RESULT_SUMMARY=""
log() { printf '%s\n' "$*"; }
run() { "$@"; }
fail() { FAILURES+=("$*"); log "FAIL: $*"; }
warn() { log "WARN: $*"; }
revert() {
  BILLS_REFRESH_OK=0
  git checkout -q HEAD -- "$@"
  git clean -fdq -- "$@"
}
. scripts/vm/bills_refresh.sh
bills_refresh || true
bills_fill_and_verify || true
if [ "${BILL_TEST_ROLLBACK:-0}" = 1 ]; then revert portal/public/bills; fi
bills_summary || exit 1
if [ "${BILL_TEST_COMMIT_FAIL:-0}" = 1 ]; then exit 1; fi
git add -A -- portal/public/bills
if ! git diff --cached --quiet; then git commit -q -m "$BILLS_SUMMARY" || exit 1; fi
bills_refresh_complete
[ "${#FAILURES[@]}" = 0 ]
'''


class CadenceTests(unittest.TestCase):
    def test_every_refresh_date_and_boundary_at_0315_sydney(self):
        for day, expected in CADENCE_TABLE:
            with self.subTest(day=day):
                self.assertEqual(bills_guard.cadence(day), expected)
                local = datetime.fromisoformat(day + "T03:15:00+11:00")
                self.assertEqual(bills_guard.cadence(local.astimezone(bills_guard.ZoneInfo("UTC"))), expected)

    def test_sydney_dates_across_both_daylight_saving_transitions(self):
        cases = (
            ("2026-04-03T16:15:00+00:00", "2026-04-04T03:15:00+11:00", "skip"),
            ("2026-04-04T17:15:00+00:00", "2026-04-05T03:15:00+10:00", "weekly"),
            ("2026-10-02T17:15:00+00:00", "2026-10-03T03:15:00+10:00", "skip"),
            ("2026-10-03T16:15:00+00:00", "2026-10-04T03:15:00+11:00", "weekly"),
            ("2026-10-04T16:15:00+00:00", "2026-10-05T03:15:00+11:00", "skip"),
        )
        for utc, local, expected in cases:
            with self.subTest(utc=utc):
                instant = datetime.fromisoformat(utc)
                self.assertEqual(instant.astimezone(bills_guard.SYDNEY).isoformat(), local)
                self.assertEqual(bills_guard.cadence(instant), expected)

    def test_sunday_otherwise_and_unknown_year(self):
        for day in ("2026-10-11", "2026-12-27", "2027-01-03"):
            self.assertEqual(bills_guard.cadence(day), "weekly")
        self.assertEqual(bills_guard.cadence("2026-10-10"), "skip")
        self.assertEqual(bills_guard.cadence("2026-10-10", True), "catch-up")


class RegressionTests(unittest.TestCase):
    def test_reviewer_stage_label_and_date_corrections_are_accepted(self):
        for case in json.loads(STAGE_CORRECTIONS.read_text()):
            with self.subTest(correction=case["name"]):
                self.assertEqual(bills_guard.regressions(case["before"], case["after"]), [])

    def test_earlier_event_correction_preserving_latest_date_and_lifecycle_is_accepted(self):
        old = json.loads(DEGRADED_PAGE.read_text())["head"]
        corrected = copy.deepcopy(old)
        corrected["key_dates"][0]["date"] = "2026-09-30"
        self.assertEqual(bills_guard.regressions(old, corrected), [])

    def test_event_count_drop_is_held_even_when_latest_date_and_lifecycle_are_preserved(self):
        old = json.loads(DEGRADED_PAGE.read_text())["head"]
        dropped = copy.deepcopy(old)
        dropped["key_dates"].pop(0)
        self.assertEqual(bills_guard.regressions(old, dropped), ["1 recorded stages removed"])

    def test_division_key_loss_or_count_drop_is_held(self):
        old = {"divisions": [{"key": "division-1"}, {"key": "division-2"}]}
        replaced = {"divisions": [{"key": "division-1"}, {"key": "division-3"}]}
        self.assertEqual(bills_guard.regressions(old, replaced), ["1 divisions removed"])
        dropped = {"divisions": [{"key": "division-1"}]}
        self.assertIn("division count decreased (2 -> 1)", bills_guard.regressions(old, dropped))
        self.assertIn("1 divisions removed", bills_guard.regressions(old, dropped))
        duplicated = {"divisions": [{"key": "division-1"}, {"key": "division-1"}]}
        self.assertEqual(bills_guard.regressions(duplicated, dropped), ["division count decreased (2 -> 1)"])

    def test_degraded_page_reproduction_keeps_events_but_regresses_status(self):
        # Execute the real parser/upsert/export row read on an in-memory fixture DB.
        sys.path.insert(0, str(ROOT / "scripts/bills_registry"))
        import bills_fetch
        import bills_schema
        from scripts import export_bills
        fixture = json.loads(DEGRADED_PAGE.read_text())
        with sqlite3.connect(":memory:") as db:
            db.row_factory = sqlite3.Row
            for ddl in bills_schema.DDL:
                db.execute(ddl)
            def load(html):
                bills_fetch.upsert(db, bills_fetch.parse_billhome(html, "t1"), fixture["listing"], "fixture")
                return export_bills.load_v2_bills(db)[0]
            previous = load(fixture["last_good_html"])
            degraded = load(fixture["degraded_html"])
        self.assertEqual(export_bills.BILL_STAGE_ORDER, bills_guard.BILL_STAGE_ORDER)
        self.assertEqual(previous["status"], "passed")
        self.assertEqual(previous["status_as_of"], "2026-10-09")
        self.assertEqual(degraded["status"], "before_parliament")
        self.assertEqual(degraded["status_as_of"], "2026-10-01")
        self.assertEqual(previous["key_dates"], degraded["key_dates"])
        reasons = bills_guard.regressions(previous, degraded)
        self.assertTrue(any("status_as_of went backwards" in reason for reason in reasons))
        self.assertTrue(any("status went backwards" in reason for reason in reasons))

    def test_every_lifecycle_step_refuses_a_backwards_status(self):
        statuses = ("before_parliament", "introduced", "passed_one_house", "passed_both", "royal_assent")
        for old, new in zip(statuses[1:], statuses):
            with self.subTest(old=old, new=new):
                self.assertIn("bill lifecycle went backwards", bills_guard.regressions({"status": old}, {"status": new}))
        for status in ("assented", "lapsed", "rejected", "withdrawn"):
            with self.subTest(terminal=status):
                self.assertTrue(bills_guard.regressions({"status": status}, {"status": "before_parliament"}))

    def test_stage_dates_and_removed_history_hold_but_second_house_progress_passes(self):
        old = {"status": "introduced", "key_dates": [{"stage": "introduced", "date": "2026-10-01", "house": "representatives"},
            {"stage": "third_reading", "date": "2026-10-09", "house": "representatives"}], "divisions": [{"key": "division-1"}]}
        earlier = copy.deepcopy(old)
        earlier["key_dates"][-1]["date"] = "2026-10-08"
        self.assertTrue(any("latest stage date went backwards" in r for r in bills_guard.regressions(old, earlier)))
        removed = copy.deepcopy(old)
        removed["key_dates"].pop(); removed["divisions"] = []
        self.assertIn("1 recorded stages removed", bills_guard.regressions(old, removed))
        self.assertIn("1 divisions removed", bills_guard.regressions(old, removed))
        forward = copy.deepcopy(old)
        forward["key_dates"].append({"stage": "second_reading", "date": "2026-10-10", "house": "senate"})
        self.assertEqual(bills_guard.regressions(old, forward), [])
        duplicate = copy.deepcopy(old)
        duplicate["key_dates"].append(copy.deepcopy(old["key_dates"][-1]))
        self.assertEqual(bills_guard.regressions(duplicate, old), ["1 recorded stages removed"])


class BillStepTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.repo = Path(temp.name) / "repo"
        self.repo.mkdir()
        self.env = {k: v for k, v in os.environ.items() if not k.startswith(("OPAX_", "GIT_", "BILL_TEST_"))}
        self.env.update(HOME=str(Path(temp.name) / "home"), OPAX_TODAY="2026-10-10",
                        OPAX_SYNC_KB="1", OPAX_DB="must-not-use-inherited-db",
                        PYTHONDONTWRITEBYTECODE="1",
                        BILL_TEST_PYTHON=sys.executable, BILL_TEST_CALLS=str(Path(temp.name) / "calls"),
                        BILL_TEST_DEGRADED_PAGE=str(DEGRADED_PAGE),
                        GIT_AUTHOR_NAME="test", GIT_COMMITTER_NAME="test",
                        GIT_AUTHOR_EMAIL="test@example.test", GIT_COMMITTER_EMAIL="test@example.test")
        Path(self.env["HOME"]).mkdir()
        for name in ("scripts/hubs/sitting-2026.json", "scripts/vm/bills_refresh.sh", "scripts/vm/bills_guard.py",
                     "scripts/vm/keep_if_unchanged.py", "scripts/refresh_bills.sh", "scripts/verify_bill_briefs.py",
                     "scripts/bills_registry/bills_stages.py"):
            dest = self.repo / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, dest)
        for name in ("scripts/export_bills.py", "scripts/bills_registry/bills_fetch.py"):
            dest = self.repo / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(STUB)
        self.bills = self.repo / bills_guard.BILLS
        self.bills.mkdir(parents=True)
        for n in (1, 2):
            doc = {"key": f"au-federal-t{n}", "speeches": [{"slug": f"s{n}", "brief": "Kept brief"}],
                   "divisions": [{"key": f"division-{n}"}], "sponsor_person_id": None}
            (self.bills / f"au-federal-t{n}.json").write_text(json.dumps(doc, indent=1) + "\n")
        (self.bills / "index.json").write_text(json.dumps({"count": 2, "generated_at": "old",
            "bills": [{"key": f"au-federal-t{n}"} for n in (1, 2)]}, indent=1) + "\n")
        self.votes = self.repo / "portal/public/votes.json"
        self.votes.write_text('{"fixture": "votes stay byte-identical"}\n')
        self.git("init", "-q")
        self.git("add", ".")
        self.git("commit", "-qm", "fixture")

    def git(self, *args):
        result = subprocess.run(["git", *args], cwd=self.repo, env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, "fixture git operation failed")
        return result.stdout

    @property
    def pipe(self):
        return Path(self.env["HOME"]) / ".cache/autoresearch/pipeline"

    @property
    def pending(self):
        return self.pipe / "bills-refresh-v1.pending"

    def initialized(self):
        self.pipe.mkdir(parents=True, exist_ok=True)
        (self.pipe / "bills-refresh-v1.initialized").touch()

    def run_step(self, mode="ok", **overrides):
        env = {**self.env, "BILL_TEST_MODE": mode, **overrides}
        result = subprocess.run(["bash", "-c", HARNESS], cwd=self.repo, env=env, capture_output=True, text=True)
        self.assertEqual(self.votes.read_text(), '{"fixture": "votes stay byte-identical"}\n')
        # Preserve output only for assertions; unittest never prints command lines.
        return result.returncode, result.stdout + result.stderr

    def calls(self):
        path = Path(self.env["BILL_TEST_CALLS"])
        return path.read_text().splitlines() if path.exists() else []

    def test_catch_up_exports_on_saturday_once_and_logs_retained_deltas(self):
        rc, output = self.run_step()
        self.assertEqual(rc, 0)
        self.assertEqual(self.calls(), ["fetch", "export", "fill"])
        self.assertIn("catch-up", output)
        summary = "bills: 1 new, 1 changed, 1 titles filled, 1 sponsor IDs filled"
        self.assertIn(summary, output)
        self.assertEqual(self.git("log", "-1", "--format=%s").strip(), summary)
        self.assertFalse(self.pending.exists())
        self.assertTrue((self.pipe / "bills-refresh-v1.initialized").exists())
        rc, output = self.run_step("quiet")
        self.assertEqual(rc, 0)
        self.assertEqual(self.calls(), ["fetch", "export", "fill", "fill"])
        self.assertIn("0 new, 0 changed, 0 titles filled, 0 sponsor IDs filled", output)

    def test_calendar_runs_sitting_days_and_sundays_but_skips_other_days(self):
        self.initialized()
        for day, reason in (("2026-10-13", "after-sitting"), ("2026-10-18", "weekly")):
            with self.subTest(day=day):
                rc, output = self.run_step("quiet", OPAX_TODAY=day, OPAX_BILL_PARLIAMENT="49")
                self.assertEqual(rc, 0)
                self.assertIn(f"({reason}, parliament 49)", output)
        rc, output = self.run_step("quiet", OPAX_TODAY="2026-10-12")
        self.assertEqual(rc, 0)
        self.assertIn("yesterday was not a sitting day", output)
        self.assertEqual(self.calls(), ["fetch", "export", "fill", "fetch", "export", "fill", "fill"])

    def test_keep_if_unchanged_preserves_head_bytes(self):
        before = (self.bills / "index.json").read_bytes()
        rc, output = self.run_step("quiet")
        self.assertEqual(rc, 0)
        self.assertEqual((self.bills / "index.json").read_bytes(), before)
        self.assertEqual(self.git("status", "--porcelain"), "")
        self.assertFalse(self.pending.exists())

    def test_guards_revert_shrink_vanish_missing_file_and_verify_failure(self):
        for mode in ("shrink", "vanish", "index_vanish", "delete_file", "bad_count", "brief_fail", "export_fail", "fetch_fail"):
            with self.subTest(mode=mode):
                rc, output = self.run_step(mode)
                self.assertEqual(rc, 1)
                self.assertIn("reverted to HEAD", output)
                self.assertEqual(self.git("status", "--porcelain", "--", bills_guard.BILLS), "")
                self.assertFalse((self.bills / "au-federal-t3.json").exists())
                self.assertTrue(self.pending.exists())
                self.assertIn("0 new, 0 changed, 0 titles filled, 0 sponsor IDs filled", output)
        rc, _ = self.run_step()
        self.assertEqual(rc, 0)
        self.assertFalse(self.pending.exists())

    def test_timeout_reverts_and_keeps_catch_up(self):
        rc, output = self.run_step("timeout", OPAX_BILLS_TIMEOUT="0.1s")
        self.assertEqual(rc, 1)
        self.assertIn("timed out", output)
        self.assertEqual(self.calls(), ["fetch", "fill"])
        self.assertTrue(self.pending.exists())

    def test_skip_refresh_retains_pending_then_retries(self):
        self.initialized()
        self.pending.touch()
        rc, _ = self.run_step("quiet", OPAX_NIGHTLY_SKIP_REFRESH="1")
        self.assertEqual(rc, 0)
        self.assertEqual(self.calls(), ["fill"])
        self.assertTrue(self.pending.exists())
        rc, output = self.run_step()
        self.assertEqual(rc, 0)
        self.assertIn("catch-up", output)
        self.assertFalse(self.pending.exists())

    def test_failed_data_gate_and_commit_retain_catch_up(self):
        rc, output = self.run_step(BILL_TEST_ROLLBACK="1")
        self.assertEqual(rc, 0)
        self.assertIn("0 new, 0 changed", output)
        self.assertTrue(self.pending.exists())
        rc, _ = self.run_step(BILL_TEST_COMMIT_FAIL="1")
        self.assertEqual(rc, 1)
        self.assertTrue(self.pending.exists())

    def test_fill_error_can_publish_when_verify_and_guards_pass(self):
        rc, output = self.run_step("fill_fail")
        self.assertEqual(rc, 0)
        self.assertIn("fill-briefs exited non-zero", output)
        self.assertFalse(self.pending.exists())

    def test_corrections_publish_and_log_without_holds_or_repeat_after_commit(self):
        cases = json.loads(STAGE_CORRECTIONS.read_text())
        index = json.loads((self.bills / "index.json").read_text())
        for case, row in zip(cases, index["bills"]):
            path = self.bills / f"{case['before']['key']}.json"
            doc = {**json.loads(path.read_text()), **case["before"]}
            path.write_text(json.dumps(doc, indent=1) + "\n")
            row.update(status=doc["status"], status_as_of=doc["status_as_of"])
        (self.bills / "index.json").write_text(json.dumps(index, indent=1) + "\n")
        self.git("add", bills_guard.BILLS)
        self.git("commit", "-qm", "review correction baseline")
        for case, row in zip(cases, index["bills"]):
            path = self.bills / f"{case['after']['key']}.json"
            doc = {**json.loads(path.read_text()), **case["after"]}
            path.write_text(json.dumps(doc, indent=1) + "\n")
            row.update(status_as_of=doc["status_as_of"])
        (self.bills / "index.json").write_text(json.dumps(index, indent=1) + "\n")
        # Both bills change: neither correction may count toward the 2% limit.
        rc, output = self.run_step("quiet")
        self.assertEqual(rc, 0)
        self.assertNotIn("HELD bill", output)
        self.assertNotIn("HOLD ALL BILLS", output)
        self.assertEqual(json.loads((self.pipe / "bills-held.json").read_text()), {})
        for case in cases:
            key = case["after"]["key"]
            self.assertIn(f"bill {key}: stage event corrected:", output)
            doc = json.loads((self.bills / f"{key}.json").read_text())
            for field, expected in case["after"].items():
                self.assertEqual(doc[field], expected)
        self.assertIn("second_reading", output)
        self.assertIn("committee", output)
        self.assertIn("2026-10-01", output)
        self.assertIn("2026-10-02", output)
        self.assertIn("0 new, 2 changed", output)
        self.assertFalse(self.pending.exists())
        self.assertEqual(self.git("status", "--porcelain"), "")
        rows = {row["key"]: row for row in json.loads((self.bills / "index.json").read_text())["bills"]}
        self.assertEqual(rows["au-federal-t2"]["status_as_of"], "2026-10-02")
        rc, output = self.run_step("quiet")
        self.assertEqual(rc, 0)
        self.assertNotIn("stage event corrected:", output)
        self.assertIn("0 new, 0 changed", output)

    def test_event_addition_reordering_and_enrichment_do_not_log_corrections(self):
        self.seed_regression_fixture(count=2, regressed=0)
        path = self.bills / "au-federal-t1.json"
        doc = json.loads(path.read_text())
        doc["key_dates"].reverse()
        doc["key_dates"][0]["url"] = "https://fixture.invalid/enriched"
        doc["key_dates"].append({"stage": "royal_assent", "date": "2026-10-10", "house": None})
        path.write_text(json.dumps(doc, indent=1) + "\n")
        rc, output = self.run_step("quiet")
        self.assertEqual(rc, 0)
        self.assertNotIn("stage event corrected:", output)
        self.assertNotIn("HELD bill", output)

    def seed_regression_fixture(self, count=50, regressed=1):
        fixture = json.loads(DEGRADED_PAGE.read_text())
        index = {"count": count, "bills": []}
        for n in range(1, count + 1):
            key = f"au-federal-t{n}"
            doc = {**fixture["head"], "key": key}
            (self.bills / f"{key}.json").write_text(json.dumps(doc, indent=1) + "\n")
            index["bills"].append({"key": key, "status": doc["status"], "status_as_of": doc["status_as_of"]})
        (self.bills / "index.json").write_text(json.dumps(index, indent=1) + "\n")
        self.git("add", bills_guard.BILLS)
        if self.git("diff", "--cached", "--name-only").strip():
            self.git("commit", "-qm", "review fixture baseline")
        for n in range(1, regressed + 1):
            key = f"au-federal-t{n}"
            doc = {**fixture["degraded_export"], "key": key}
            (self.bills / f"{key}.json").write_text(json.dumps(doc, indent=1) + "\n")
            index["bills"][n - 1].update(status=doc["status"], status_as_of=doc["status_as_of"])
        (self.bills / "index.json").write_text(json.dumps(index, indent=1) + "\n")

    def test_isolated_degraded_bill_and_index_row_are_held_while_good_bills_publish(self):
        self.seed_regression_fixture(regressed=0)
        old_doc = (self.bills / "au-federal-t1.json").read_bytes()
        old_row = json.loads((self.bills / "index.json").read_text())["bills"][0]
        rc, output = self.run_step("degraded")
        self.assertEqual(rc, 0)
        self.assertIn("HELD bill au-federal-t1", output)
        self.assertIn("status_as_of went backwards (2026-10-09 -> 2026-10-01)", output)
        self.assertEqual((self.bills / "au-federal-t1.json").read_bytes(), old_doc)
        rows = {r["key"]: r for r in json.loads((self.bills / "index.json").read_text())["bills"]}
        self.assertEqual(rows["au-federal-t1"], old_row)
        self.assertEqual(json.loads((self.bills / "au-federal-t2.json").read_text())["sponsor_person_id"], "456")
        self.assertIn("0 new, 1 changed, 0 titles filled, 1 sponsor IDs filled", output)
        self.assertFalse(self.pending.exists())

    def test_thresholds_allow_exact_limits_and_refuse_above_either(self):
        for count, held, accepted in ((50, 1, True), (50, 2, False), (300, 5, True), (300, 6, False)):
            with self.subTest(count=count, held=held):
                self.seed_regression_fixture(count, held)
                result = subprocess.run([sys.executable, "scripts/vm/bills_guard.py", "--apply-holds"],
                    cwd=self.repo, env=self.env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0 if accepted else 1)
                for n in range(1, held + 1):
                    self.assertIn(f"HELD bill au-federal-t{n}:", result.stderr)
                if accepted:
                    self.assertEqual(self.git("diff", "--name-only", "--", bills_guard.BILLS).strip(), "portal/public/bills/index.json")
                else:
                    self.assertIn("WARNING: HOLD ALL BILLS", result.stderr)
                self.git("checkout", "--", bills_guard.BILLS)

    def test_degraded_source_threshold_reverts_every_bill_and_retains_catch_up(self):
        # One regression among two exceeds 2%, even though it is below five.
        self.seed_regression_fixture(count=2, regressed=0)
        rc, output = self.run_step("degraded")
        self.assertEqual(rc, 1)
        self.assertIn("WARNING: HOLD ALL BILLS", output)
        self.assertEqual(self.git("status", "--porcelain", "--", bills_guard.BILLS), "")
        self.assertTrue(self.pending.exists())


if __name__ == "__main__":
    unittest.main()
