"""scripts/refresh_releases.py: id windows come from what is stored; the KB is only touched with --apply
and only after the no-generation check passes.

    python3 -m unittest discover -s tests -p test_refresh_releases.py
"""
import contextlib
import importlib.util
import io
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("refresh_releases", ROOT / "scripts/refresh_releases.py")
rr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rr)


def make_db(path, rows):
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE ext_press_releases (source TEXT, source_id TEXT, date TEXT, body_text TEXT)")
    con.executemany("INSERT INTO ext_press_releases VALUES (?,?,?,?)", rows)
    con.commit()
    con.close()


class WindowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = str(Path(self.tmp.name) / "p.sqlite")
        make_db(self.db, [("pmtranscripts", "47642", "2026-09-20", "x"), ("pmtranscripts", "9", "2001-01-01", "x"),
                          ("qld", "106095", "2026-09-21", "x"), ("qld", "300", "2020-01-01", "x"),
                          ("vic", "some-slug", "2026-09-19", "x")])

    def test_max_id_is_numeric_not_lexical(self):
        self.assertEqual(rr.max_source_id(self.db, "pmtranscripts", 1), 47642)      # not '9'
        self.assertEqual(rr.max_source_id(self.db, "qld", 1), 106095)
        self.assertEqual(rr.max_source_id(self.db, "treasury", 5), 5)

    def test_missing_db_or_table_falls_back_to_the_defaults(self):
        self.assertEqual(rr.max_source_id("/nonexistent/p.sqlite", "pmtranscripts", 47500), 47500)
        empty = str(Path(self.tmp.name) / "e.sqlite")
        sqlite3.connect(empty).close()
        self.assertEqual(rr.max_source_id(empty, "qld", 106000), 106000)
        self.assertEqual(rr.count_source(empty, "qld"), {"rows": 0, "newest": None})

    def test_fetch_windows(self):
        pm = rr.fetch_argv("py", self.db, "pmtranscripts", "2026-09-15")
        self.assertEqual(pm[pm.index("--ids") + 1], "47592-48042")                   # max-50 .. max+400
        self.assertEqual(pm[pm.index("--since") + 1], "2026-09-15")
        self.assertLess(pm.index("--db"), pm.index("pmtranscripts"))                  # --db is a top-level flag
        qld = rr.fetch_argv("py", self.db, "qld", "2026-09-15")
        self.assertEqual(qld[qld.index("--ids") + 1], "106045-106395")               # max-50 .. max+300
        vic = rr.fetch_argv("py", self.db, "vic", "2026-09-15")
        self.assertIn("--sitemap-pages", vic)
        self.assertEqual(vic[vic.index("--limit") + 1], "400")
        tre = rr.fetch_argv("py", self.db, "treasury", "2026-09-15")
        self.assertEqual(tre[tre.index("--limit") + 1], "300")
        with self.assertRaises(ValueError):
            rr.fetch_argv("py", self.db, "nsw", "2026-09-15")

    def test_publish_argv_only_applies_when_asked(self):
        a = rr.publish_argv("py", self.db, "qld", "2026-09-15", apply=False)
        self.assertNotIn("--apply", a)
        self.assertIn("--full", a)
        self.assertIn("--apply", rr.publish_argv("py", self.db, "qld", "2026-09-15", apply=True))

    def test_plan_prints_and_runs_nothing(self):
        out = io.StringIO()
        with mock.patch.object(rr, "_run", side_effect=AssertionError("ran a command")), contextlib.redirect_stdout(out):
            rc = rr.main(["--db", self.db, "--since", "2026-09-15", "--plan", "--source", "qld"])
        self.assertEqual(rc, 0)
        self.assertEqual(list(json.loads(out.getvalue())["sources"]), ["qld"])


class RunTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = str(Path(self.tmp.name) / "p.sqlite")
        make_db(self.db, [("qld", "106095", "2026-09-21", "x")])
        self.calls = []

    def fake_run(self, argv, timeout, env):
        self.calls.append(argv)
        if "words_sync" in " ".join(argv):
            return 0, json.dumps({"examined": 3, "accepted": 2, "selected": 2, "created": 0, "existing": 0, "failed": 0,
                                  "rejected": {}}), "", 0.1
        return 0, "", "", 0.1

    def go(self, *argv, **patches):
        out = io.StringIO()
        with mock.patch.object(rr, "_run", self.fake_run), contextlib.redirect_stdout(out):
            with mock.patch.object(rr, "check_kb_no_generation", patches.get("check", mock.Mock())) as chk:
                rc = rr.main(["--db", self.db, "--since", "2026-09-15", "--source", "qld", *argv])
        return rc, chk, out.getvalue()

    def test_default_run_is_fetch_then_audit_and_never_checks_or_touches_the_kb(self):
        rc, chk, out = self.go()
        self.assertEqual(rc, 0)
        chk.assert_not_called()
        kinds = ["fetch" if "words_press_releases" in " ".join(c) else "publish" for c in self.calls]
        self.assertEqual(kinds, ["fetch", "publish"])
        self.assertNotIn("--apply", self.calls[1])
        report = json.loads(out[out.index("\n{") + 1:])
        self.assertEqual(report["sources"]["qld"]["publish"]["mode"], "audit")
        self.assertEqual(report["sources"]["qld"]["publish"]["accepted"], 2)

    def test_apply_checks_the_kb_first_and_a_failed_check_publishes_nothing(self):
        rc, chk, out = self.go("--apply", check=mock.Mock(side_effect=ValueError("Automatic enrichment must remain disabled")))
        self.assertEqual(rc, 1)
        chk.assert_called_once()
        self.assertEqual([c for c in self.calls if "words_sync" in " ".join(c)], [])
        self.assertIn("Automatic enrichment must remain disabled", out)

    def test_apply_with_a_passing_check_creates(self):
        rc, chk, _ = self.go("--apply")
        self.assertEqual(rc, 0)
        chk.assert_called_once()
        self.assertIn("--apply", self.calls[-1])

    def test_a_failed_fetch_still_lets_the_others_run_and_fails_the_step(self):
        def flaky(argv, timeout, env):
            self.calls.append(argv)
            if "words_press_releases" in " ".join(argv) and "qld" in argv:
                return 1, "", "boom", 0.1
            return 0, "{}", "", 0.1
        out = io.StringIO()
        with mock.patch.object(rr, "_run", flaky), contextlib.redirect_stdout(out):
            rc = rr.main(["--db", self.db, "--since", "2026-09-15", "--source", "qld", "--source", "vic", "--no-publish"])
        self.assertEqual(rc, 1)
        self.assertEqual(len(self.calls), 2)

    def test_no_fetch_and_no_publish(self):
        rc, _, _ = self.go("--no-fetch")
        self.assertEqual([("words_sync" in " ".join(c)) for c in self.calls], [True])
        self.calls.clear()
        rc, _, _ = self.go("--no-publish")
        self.assertEqual([("words_press_releases" in " ".join(c)) for c in self.calls], [True])


if __name__ == "__main__":
    unittest.main()
