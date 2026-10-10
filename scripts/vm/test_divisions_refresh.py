"""Federal refresh regressions with JSON fixtures and stubbed acquisition.

No network, real DB, KB, refresh box or production writes. Only operation names
are recorded; process arguments and credentials are never printed.
"""
from copy import deepcopy
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from scripts.vm import bills_guard, divisions_guard as G
from parli.ingest import tvfy_refresh as T
from parli.ingest.votes_ingest import guard_ext_refresh
from parli.ingest.votes_state import Division, Vote

ROOT = Path(__file__).resolve().parents[2]


def mobile():
    return {"1": {"name": "Alex Example", "party": "Labor", "jurisdiction": "federal",
                  "house": "senate", "ayes": 2, "noes": 1, "divisions_total": 3,
                  "years": [2025, 2026], "for": [], "against": []},
            "_names": {"alex example": ["1"]},
            "_meta": {"schema": 1, "content_changed_at": "2026-08-20T00:00:00Z",
                      "latest_division_date": "2026-08-20", "latest_division_date_by_jurisdiction": {"federal": "2026-08-20"}}}


class OfflineTests(unittest.TestCase):
    def test_shared_calendar_for_every_remaining_2026_day_and_sydney_midnight(self):
        from datetime import date, timedelta
        day = date(2026, 10, 10)
        while day.year == 2026:
            self.assertEqual(G.cadence(day.isoformat()), bills_guard.cadence(day.isoformat()))
            day += timedelta(days=1)
        self.assertEqual(G.cadence(datetime.fromisoformat("2026-10-12T14:00:00+00:00")), "after-sitting")
        self.assertEqual(G.cadence("2026-10-10", True), "catch-up")

    def test_catchup_and_slow_source_window_relists_whole_days(self):
        rows = [{"key": "federal-senate-1", "date": "2026-09-17"},
                {"key": "federal-representatives-2", "date": "2026-09-10"}]
        with mock.patch.object(G, "head", return_value={"divisions": rows}):
            self.assertEqual(G.since("2026-10-10", True), "2026-08-20")
            self.assertEqual(G.since("2026-10-13"), "2026-08-14")
            self.assertEqual(G.since("2026-12-13"), "2026-09-10")

    def test_mobile_schema_identity_totals_dates_and_shape_are_protected(self):
        old = mobile()
        for mode in ("schema", "identity", "ayes", "noes", "divisions_total", "date", "shape"):
            new = deepcopy(old)
            if mode == "schema": new["_meta"]["schema"] = 2
            elif mode == "identity": del new["1"]
            elif mode in ("ayes", "noes", "divisions_total"): new["1"][mode] -= 1
            elif mode == "date": new["_meta"]["latest_division_date_by_jurisdiction"]["federal"] = "2026-08-19"
            else: new["1"]["recent"] = []
            with self.subTest(mode=mode), self.assertRaises(ValueError): G.votes_guard(old, new)
        G.votes_guard(old, old)
        new = deepcopy(old); new["1"].update(ayes=3, divisions_total=4)
        G.votes_guard(old, new)

    def test_equal_count_replacement_cannot_vanish_an_existing_division_or_vote(self):
        def division(key):
            return Division(key, "federal", "senate", "2026-09-17", 1, "Question", "Question", None,
                            1, 0, "affirmative", "theyvoteforyou", "https://example.test/1")
        old = [division("federal-senate-1")]
        votes = [Vote(old[0].id, "Alex Example", "Alex Example", "tvfy_1", "aye")]
        replacement = [division("federal-senate-2")]
        with self.assertRaisesRegex(ValueError, "would vanish"): guard_ext_refresh(old, votes, replacement, votes)
        swapped = [Vote(old[0].id, "Alex Example", "Alex Example", "tvfy_1", "no")]
        with self.assertRaisesRegex(ValueError, "would vanish"): guard_ext_refresh(old, votes, old, swapped)
        guard_ext_refresh(old, votes, old + replacement, votes)

    def test_source_errors_and_single_day_cap_are_not_empty_successes(self):
        from datetime import date
        for response in (None, {}, [dict(id=i) for i in range(100)]):
            with mock.patch.object(T, "get", return_value=response), self.assertRaises(T.TvfyError):
                T.fetch_window("senate", date(2026, 9, 17), date(2026, 9, 17), [])

    def test_full_list_windows_split_instead_of_truncating(self):
        from datetime import date
        rows = []
        with mock.patch.object(T, "get", side_effect=[[{}] * 100, [{"id": 1}], [{"id": 2}]]):
            self.assertEqual(T.fetch_window("senate", date(2026, 9, 16), date(2026, 9, 17), rows), 3)
        self.assertEqual(rows, [{"id": 1}, {"id": 2}])

    def test_partial_detail_is_not_complete_even_with_an_http_success(self):
        good = {"id": 1, "house": "senate", "date": "2026-09-17", "aye_votes": 1, "no_votes": 0,
                "votes": [{"member": {"person": {"id": 1}}, "vote": "aye"}]}
        self.assertTrue(T.complete_detail(good, 1))
        for changes in ({"votes": []}, {"id": 2}, {"votes": good["votes"] * 2}, {"no_votes": None}):
            self.assertFalse(T.complete_detail({**good, **changes}, 1))

    def test_strict_missing_detail_is_failed_and_remains_retryable(self):
        db = mock.Mock()
        def execute(sql, *params):
            if sql.startswith("SELECT division_id FROM divisions"): return [(1,)]
            if sql.startswith("SELECT person_id FROM members"): return [("1",)]
            result = mock.Mock(); result.fetchone.return_value = (0,)
            return result
        db.execute.side_effect = execute
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(T, "CACHE", Path(tmp)), \
                mock.patch.object(T, "get", return_value=None), mock.patch.object(T, "commit"), mock.patch.object(T, "log"):
            self.assertEqual(T.phase_detail(db, None, strict=True), 1)
        self.assertFalse(any(call.args[0].startswith("INSERT") for call in db.execute.call_args_list))


STUB = r'''
import json, os, sys, time
from pathlib import Path
operation = "fetch" if "tvfy_refresh" in __file__ else "map" if "votes_ingest" in __file__ else "links" if "tvfy_bill_links" in __file__ else "export"
with open(os.environ["DIVISION_TEST_CALLS"], "a") as out: out.write(operation + "\n")
assert os.environ["OPAX_SYNC_KB"] == "0"
assert os.environ["OPAX_DB"] == str(Path.home() / ".cache/autoresearch/parli.db")
if operation == "fetch":
    assert "--relist" in sys.argv and "--strict" in sys.argv
    assert sys.argv[sys.argv.index("--since") + 1] == "2026-08-20"
if operation == "map":
    assert "--load-ext-only" in sys.argv and "--strict-ext" in sys.argv
    assert "--limit" not in sys.argv and "--days" not in sys.argv
mode = os.environ.get("DIVISION_TEST_MODE", "ok")
if mode == operation + "_fail": sys.exit(1)
if mode == "timeout" and operation == "fetch": time.sleep(10)
if operation != "export": sys.exit(0)
d = json.loads(Path("portal/public/votes.json").read_text())
if mode != "unchanged":
    d["1"]["ayes"] += 1; d["1"]["divisions_total"] += 1
d["_meta"]["content_changed_at"] = "2026-10-10T00:00:00Z"
if mode == "shrink": d["1"]["noes"] = 0
if mode == "schema": d["_meta"]["schema"] = 2
if mode == "missing_names": del d["_names"]
if mode == "dangling_seo":
    Path("portal/public/seo/recent-votes.json").write_text(json.dumps({
        "people": {"1": {"recent": [{"division_slug": "division-federal-senate-2"}]}}}))
print(json.dumps(d))
'''

HARNESS = r'''
set -uo pipefail
PY="$DIVISION_TEST_PYTHON"
PIPE="$HOME/.cache/autoresearch/pipeline"
mkdir -p "$PIPE"
log(){ printf '%s\n' "$*"; }
run(){ "$@"; }
fail(){ printf 'FAIL: %s\n' "$*"; }
revert(){ DIVISIONS_REFRESH_OK=0; git checkout -q HEAD -- "$@"; git clean -fdq -- "$@"; }
. scripts/vm/divisions_refresh.sh
divisions_refresh
divisions_verify
if [ "${DIVISION_TEST_COMPLETE:-1}" = 1 ]; then divisions_refresh_complete; fi
'''


class WrapperTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.home = self.root / "home"; self.home.mkdir()
        self.calls = self.root / "calls"
        for name in ("scripts/refresh_divisions.sh", "scripts/vm/divisions_refresh.sh", "scripts/vm/divisions_guard.py",
                     "scripts/vm/bills_guard.py", "scripts/vm/mobile_votes_contract.py", "scripts/vm/keep_if_unchanged.py", "scripts/bills_registry/bills_stages.py"):
            dest = self.root / name; dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, dest)
        for name in ("parli/ingest/tvfy_refresh.py", "parli/ingest/votes_ingest.py", "parli/ingest/tvfy_bill_links.py", "scripts/export_votes.py"):
            dest = self.root / name; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_text(STUB)
        public = self.root / "portal/public"; (public / "divisions").mkdir(parents=True); (public / "seo").mkdir()
        (public / "votes.json").write_text(json.dumps(mobile()))
        (public / "divisions/index.json").write_text(json.dumps({"count": 1, "divisions": [
            {"key": "federal-senate-1", "slug": "division-federal-senate-1", "date": "2026-08-20"}]}))
        (public / "divisions/division-federal-senate-1.json").write_text('{}')
        (public / "seo/recent-votes.json").write_text('{}')
        for args in (["init", "-q"], ["add", "."], ["-c", "user.name=test", "-c", "user.email=test@example.test", "commit", "-qm", "fixture"]):
            result = subprocess.run(["git", *args], cwd=self.root, capture_output=True)
            self.assertEqual(result.returncode, 0, "fixture setup failed")

    def run_refresh(self, mode="ok", complete=True):
        env = {**os.environ, "HOME": str(self.home), "DIVISION_TEST_CALLS": str(self.calls),
               "DIVISION_TEST_PYTHON": sys.executable, "DIVISION_TEST_MODE": mode,
               "DIVISION_TEST_COMPLETE": str(int(complete)), "OPAX_TODAY": "2026-10-10",
               "OPAX_DIVISIONS_TIMEOUT": "0.1s" if mode == "timeout" else "10s"}
        result = subprocess.run(["bash"], input=HARNESS, cwd=self.root, env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, "refresh harness failed")
        return result.stdout

    def pending(self):
        return (self.home / ".cache/autoresearch/pipeline/divisions-refresh-v1.pending").exists()

    def test_acquisition_mapping_and_mobile_export_run_in_order(self):
        output = self.run_refresh()
        self.assertEqual(self.calls.read_text().splitlines(), ["fetch", "map", "links", "export"])
        self.assertFalse(self.pending())
        self.assertNotIn("FAIL:", output)
        self.assertEqual(json.loads((self.root / "portal/public/votes.json").read_text())["_meta"]["schema"], 1)

    def test_failure_timeout_and_regression_restore_bytes_and_retry(self):
        path = self.root / "portal/public/votes.json"; original = path.read_bytes()
        for mode in ("fetch_fail", "map_fail", "links_fail", "export_fail", "shrink", "schema", "missing_names", "dangling_seo", "timeout"):
            with self.subTest(mode=mode):
                self.assertIn("FAIL:", self.run_refresh(mode))
                self.assertEqual(path.read_bytes(), original)
                self.assertEqual((self.root / "portal/public/seo/recent-votes.json").read_text(), '{}')
                self.assertTrue(self.pending())

    def test_timestamp_only_run_keeps_original_bytes(self):
        path = self.root / "portal/public/votes.json"; original = path.read_bytes()
        self.run_refresh("unchanged")
        self.assertEqual(path.read_bytes(), original)

    def test_interrupted_commit_keeps_pending(self):
        self.run_refresh(complete=False)
        self.assertTrue(self.pending())


if __name__ == "__main__":
    unittest.main()
