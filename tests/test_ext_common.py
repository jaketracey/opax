"""The ext_* writer: OPAX_DB picks the local database, and a replace never deletes for an empty or
far smaller fetch.

    python3 -m unittest discover -s tests -p test_ext_common.py
"""
import argparse
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parli.ingest import ext_common as ec  # noqa: E402
from parli.ingest import replace_guard as rg  # noqa: E402

DDL = "CREATE TABLE IF NOT EXISTS ext_thing (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, name TEXT);"


class ReplaceGuardTests(unittest.TestCase):
    def test_reasons(self):
        self.assertIsNone(rg.replace_guard(0, 0))
        self.assertIsNone(rg.replace_guard(0, 5))
        self.assertIn("no rows", rg.replace_guard(10, 0))
        self.assertIsNone(rg.replace_guard(10, 5))                  # exactly the 0.5 floor
        self.assertIn("below 50%", rg.replace_guard(10, 4))
        self.assertIsNone(rg.replace_guard(10, 4, allow_shrink=True))
        self.assertIsNone(rg.replace_guard(10, 0, allow_shrink=True))
        self.assertIsNotNone(rg.replace_guard(10, 8, min_ratio=0.9))

    def test_reexported_from_ext_common(self):
        self.assertIs(ec.replace_guard, rg.replace_guard)
        self.assertIs(ec.ExtGuardError, rg.ExtGuardError)


class WriterGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "p.sqlite"
        self.w = ec.ExtWriter(db_path=self.db)

    def count(self):
        with sqlite3.connect(self.db) as c:
            return c.execute("SELECT COUNT(*) FROM ext_thing WHERE source='s'").fetchone()[0]

    def load(self, n, **kw):
        return self.w.replace("ext_thing", DDL, ["source", "name"], [["s", f"n{i}"] for i in range(n)], "s", **kw)

    def test_first_load_and_normal_replace(self):
        self.assertEqual(self.load(10)["inserted"], 10)
        r = self.load(12)
        self.assertEqual((r["deleted"], r["inserted"]), (10, 12))
        self.assertEqual(self.count(), 12)

    def test_empty_fetch_never_deletes(self):
        self.load(10)
        with self.assertRaises(ec.ExtGuardError):
            self.load(0)
        self.assertEqual(self.count(), 10)

    def test_far_smaller_fetch_never_deletes(self):
        self.load(10)
        with self.assertRaises(ec.ExtGuardError):
            self.load(4)
        self.assertEqual(self.count(), 10)
        self.assertEqual(self.load(5)["inserted"], 5)               # 50% is the floor, not below it

    def test_override_and_per_call_ratio(self):
        self.load(10)
        self.assertEqual(self.load(1, allow_shrink=True)["inserted"], 1)
        self.load(10, allow_shrink=True)
        self.assertEqual(self.load(4, min_ratio=0.3)["inserted"], 4)
        with mock.patch.dict(os.environ, {"OPAX_ALLOW_SHRINK": "1"}):
            self.assertEqual(ec.ExtWriter(db_path=self.db).replace(
                "ext_thing", DDL, ["source", "name"], [], "s")["inserted"], 0)
        self.assertEqual(self.count(), 0)

    def test_scoped_delete_counts_only_the_scope(self):
        w = self.w
        w.replace("ext_thing", DDL, ["source", "name"], [["s", f"a{i}"] for i in range(10)] + [["t", "x"]], "s",
                  delete_where="source = ? AND name LIKE 'a%'", delete_params=["s"])
        # the guard compares against the 10 'a%' rows of the scope, not the table
        with self.assertRaises(ec.ExtGuardError):
            w.replace("ext_thing", DDL, ["source", "name"], [["s", "a0"]], "s",
                      delete_where="source = ? AND name LIKE 'a%'", delete_params=["s"])
        with sqlite3.connect(self.db) as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM ext_thing").fetchone()[0], 11)

    def test_a_refused_replace_leaves_no_log_row_and_no_open_transaction(self):
        self.load(10)
        with self.assertRaises(ec.ExtGuardError):
            self.load(0)
        with sqlite3.connect(self.db) as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM ext_ingest_log").fetchone()[0], 1)  # the good load only
        self.assertEqual(self.load(10)["inserted"], 10)              # database not left locked

    def test_dry_run_is_untouched_by_the_guard(self):
        w = ec.ExtWriter(db_path=self.db, dry_run=True)
        self.assertTrue(w.replace("ext_thing", DDL, ["source", "name"], [], "s")["dry_run"])


class BackendSelectionTests(unittest.TestCase):
    def parse(self, argv, env):
        ap = argparse.ArgumentParser()
        ec.add_writer_args(ap)
        with mock.patch.dict(os.environ, env, clear=False):
            for k in ("OPAX_DB",):
                if k not in env:
                    os.environ.pop(k, None)
            return ec.writer_from_args(ap.parse_args(argv))

    def test_no_env_no_flags_is_the_desktop_ssh_backend(self):
        w = self.parse([], {})
        self.assertIsNone(w.db_path)
        self.assertEqual(w.ssh_host, ec.DEFAULT_DB_HOST)

    def test_opax_db_env_means_local_never_ssh(self):
        w = self.parse([], {"OPAX_DB": "/data/vm/parli.db"})
        self.assertEqual(str(w.db_path), "/data/vm/parli.db")
        self.assertIsNone(w.ssh_host)
        self.assertTrue(w.describe().startswith("sqlite:"))

    def test_explicit_db_beats_env(self):
        w = self.parse(["--db", "/tmp/stage.sqlite"], {"OPAX_DB": "/data/vm/parli.db"})
        self.assertEqual(str(w.db_path), "/tmp/stage.sqlite")

    def test_db_local_flag_uses_env_then_default_path(self):
        w = self.parse(["--db-local"], {"OPAX_DB": "/data/vm/parli.db"})
        self.assertEqual(str(w.db_path), "/data/vm/parli.db")
        w = self.parse(["--local"], {})
        self.assertEqual(str(w.db_path), os.path.expanduser("~/.cache/autoresearch/parli.db"))
        self.assertIsNone(w.ssh_host)

    def test_bare_extwriter_follows_the_env(self):
        with mock.patch.dict(os.environ, {"OPAX_DB": "/data/vm/parli.db"}):
            w = ec.ExtWriter()
        self.assertEqual(str(w.db_path), "/data/vm/parli.db")
        self.assertIsNone(w.ssh_host)
        with mock.patch.dict(os.environ, clear=False):
            os.environ.pop("OPAX_DB", None)
            w = ec.ExtWriter()
        self.assertIsNone(w.db_path)
        self.assertEqual(w.ssh_host, ec.DEFAULT_DB_HOST)

    def test_allow_shrink_flag_reaches_the_writer(self):
        self.assertTrue(self.parse(["--db", "/x.sqlite", "--allow-shrink"], {}).allow_shrink)
        self.assertFalse(self.parse(["--db", "/x.sqlite"], {}).allow_shrink)

    def test_no_ssh_or_scp_is_attempted_for_a_local_writer(self):
        with tempfile.TemporaryDirectory() as d, mock.patch("subprocess.run", side_effect=AssertionError("ssh used")):
            w = ec.ExtWriter(db_path=Path(d) / "p.sqlite")
            w.replace("ext_thing", DDL, ["source", "name"], [["s", "a"]], "s")


class RemoteLoaderGuardTests(unittest.TestCase):
    """The stdlib program streamed to the desktop enforces the same guard (run it locally here)."""

    def run_loader(self, db, rows, existing_rows, **meta_over):
        import gzip
        import json
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            if existing_rows:
                with sqlite3.connect(db) as c:
                    c.executescript(DDL)
                    c.executemany("INSERT INTO ext_thing (source, name) VALUES ('s', ?)", [(f"e{i}",) for i in range(existing_rows)])
            meta = {"db_path": str(db), "table": "ext_thing", "ddl": DDL, "log_ddl": ec.INGEST_LOG_DDL,
                    "columns": ["source", "name"], "delete_where": "source = ?", "delete_params": ["s"], "post_sql": [],
                    "source": "s", "notes": None, "loaded_at": "2026-09-29T00:00:00Z", "min_ratio": 0.5, "allow_shrink": False}
            meta.update(meta_over)
            path = Path(d) / "rows.jsonl.gz"
            with gzip.open(path, "wt") as f:
                f.write(json.dumps(meta) + "\n")
                for r in rows:
                    f.write(json.dumps(r) + "\n")
            return subprocess.run([sys.executable, "-", str(path)], input=ec._REMOTE_LOADER, capture_output=True, text=True)

    def test_remote_program_refuses_empty_and_accepts_normal(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / "r.sqlite"
            p = self.run_loader(db, [], 10)
            self.assertEqual(p.returncode, 3, p.stderr)
            self.assertIn("EXT_GUARD_REFUSED", p.stderr)
            with sqlite3.connect(db) as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM ext_thing").fetchone()[0], 10)
            p = self.run_loader(db, [["s", "n1"], ["s", "n2"], ["s", "n3"], ["s", "n4"], ["s", "n5"], ["s", "n6"]], 0)
            self.assertEqual(p.returncode, 0, p.stderr)
            with sqlite3.connect(db) as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM ext_thing").fetchone()[0], 6)
            p = self.run_loader(db, [], 0, allow_shrink=True)
            self.assertEqual(p.returncode, 0, p.stderr)


if __name__ == "__main__":
    unittest.main()
