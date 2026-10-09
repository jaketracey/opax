"""Run the nightly bills shell functions with fixture git data and stub commands.

No production DB, network, APH or KB is used. Stub call records contain operation
names only; failures never print process command lines or arguments.
"""
from datetime import date, timedelta
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from scripts.vm import bills_guard

ROOT = Path(__file__).resolve().parents[2]

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
    def test_every_supplied_sitting_date_and_its_boundaries(self):
        for start, end in bills_guard.SITTING_RANGES:
            day, last = date.fromisoformat(start), date.fromisoformat(end)
            while day <= last:
                self.assertEqual(bills_guard.cadence(day.isoformat()), "sitting")
                day += timedelta(days=1)
            self.assertEqual(bills_guard.cadence(day.isoformat()), "skip")
            self.assertEqual(bills_guard.cadence((date.fromisoformat(start) - timedelta(days=1)).isoformat()), "weekly")

    def test_sunday_otherwise_and_unknown_year(self):
        for day in ("2026-10-11", "2026-12-27", "2027-01-03"):
            self.assertEqual(bills_guard.cadence(day), "weekly")
        self.assertEqual(bills_guard.cadence("2026-10-10"), "skip")
        self.assertEqual(bills_guard.cadence("2026-10-10", True), "catch-up")


class BillStepTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.repo = Path(temp.name) / "repo"
        self.repo.mkdir()
        self.env = {k: v for k, v in os.environ.items() if not k.startswith(("OPAX_", "GIT_", "BILL_TEST_"))}
        self.env.update(HOME=str(Path(temp.name) / "home"), OPAX_TODAY="2026-10-10",
                        OPAX_SYNC_KB="1", OPAX_DB="must-not-use-inherited-db",
                        BILL_TEST_PYTHON=sys.executable, BILL_TEST_CALLS=str(Path(temp.name) / "calls"),
                        GIT_AUTHOR_NAME="test", GIT_COMMITTER_NAME="test",
                        GIT_AUTHOR_EMAIL="test@example.test", GIT_COMMITTER_EMAIL="test@example.test")
        Path(self.env["HOME"]).mkdir()
        for name in ("scripts/vm/bills_refresh.sh", "scripts/vm/bills_guard.py",
                     "scripts/vm/keep_if_unchanged.py", "scripts/refresh_bills.sh", "scripts/verify_bill_briefs.py"):
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
        for day, reason in (("2026-10-12", "sitting"), ("2026-10-18", "weekly")):
            with self.subTest(day=day):
                rc, output = self.run_step("quiet", OPAX_TODAY=day, OPAX_BILL_PARLIAMENT="49")
                self.assertEqual(rc, 0)
                self.assertIn(f"({reason}, parliament 49)", output)
        rc, output = self.run_step("quiet", OPAX_TODAY="2026-10-16")
        self.assertEqual(rc, 0)
        self.assertIn("non-sitting", output)
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


if __name__ == "__main__":
    unittest.main()
