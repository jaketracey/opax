"""OPAX_DB moves every exporter and loader that used to hard-code the desktop's parli.db.

    python3 -m unittest discover -s tests -p test_opax_db_override.py

Each listed file's module-level database constant is evaluated (only that assignment, in an
empty namespace with `os`) with OPAX_DB set and unset: set, the path follows it; unset, it is
the same ~/.cache/autoresearch/parli.db the desktop always used. No /home/jake literal may be
left in any of them, and export_grants --local must run its program in-process, not over ssh.
"""
import ast
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

# file -> the module-level constant that names the database
CONSTANTS = {
    "scripts/export_access.py": "DB_PATH", "scripts/export_expenses.py": "DB", "scripts/export_interests.py": "DB",
    "scripts/export_fits.py": "DB_PATH", "scripts/export_discovery.py": "DEFAULT_DB",
    "scripts/export_money_graph.py": "DB_PATH", "scripts/export_aec_extras.py": "DB_PATH",
    "scripts/export_state_money.py": "DB_PATH", "scripts/export_suppliers.py": "DB_PATH",
    "scripts/export_speakers.py": "DB", "scripts/report_stats.py": "DB", "scripts/export_parliamentarians.py": "DB",
    "scripts/grantconnect_details.py": "DB",
    "parli/ingest/donor_entities.py": "DEFAULT_DB", "parli/ingest/contract_suppliers.py": "DEFAULT_DB",
    "parli/ingest/grant_recipients.py": "DEFAULT_DB", "parli/ingest/words_common.py": "DB_PATH",
    "parli/ingest/votes_ingest.py": "DB_PATH", "parli/ingest/tvfy_refresh.py": "DB_PATH",
    "parli/ingest/arag_sync.py": "DB_PATH", "parli/ingest/photos.py": "DB_PATH",
    "parli/ingest/conduct_interests_federal.py": "DEFAULT_DB", "parli/schema.py": "DEFAULT_DB_PATH",
}
DEFAULT = os.path.expanduser("~/.cache/autoresearch/parli.db")


def eval_constant(rel: str, name: str) -> str:
    tree = ast.parse((ROOT / rel).read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            code = compile(ast.Expression(node.value), rel, "eval")
            from pathlib import Path as P
            return str(eval(code, {"os": os, "Path": P}))  # noqa: S307 - our own source, one expression
    raise AssertionError(f"{rel}: no module-level {name}")


class DbConstantTests(unittest.TestCase):
    def test_follows_opax_db_and_defaults_unchanged(self):
        for rel, name in CONSTANTS.items():
            with self.subTest(file=rel):
                with mock.patch.dict(os.environ, {"OPAX_DB": "/srv/vm/parli.db"}):
                    got = eval_constant(rel, name)
                self.assertIn("/srv/vm/parli.db", got, rel)
                self.assertNotIn(".cache/autoresearch", got, rel)
                with mock.patch.dict(os.environ, clear=False):
                    os.environ.pop("OPAX_DB", None)
                    got = eval_constant(rel, name)
                self.assertIn(DEFAULT, got, rel)

    def test_readonly_uris_stay_readonly(self):
        for rel, name in CONSTANTS.items():
            src = (ROOT / rel).read_text()
            if re.search(rf"^{name} = \"file:\"", src, re.M):
                with mock.patch.dict(os.environ, {"OPAX_DB": "/srv/vm/parli.db"}):
                    self.assertEqual(eval_constant(rel, name), "file:/srv/vm/parli.db?mode=ro", rel)

    def test_no_hardcoded_desktop_path_is_left(self):
        for rel in list(CONSTANTS) + ["scripts/export_grants.py", "parli/ingest/abr_match.py", "parli/ingest/votes_state.py"]:
            src = (ROOT / rel).read_text()
            for i, line in enumerate(src.splitlines(), 1):
                if "/home/jake/.cache/autoresearch/parli.db" in line:
                    # the one legitimate literal: the REMOTE db path on the desktop (an ssh loader argument)
                    self.assertIn("--remote-db", line, f"{rel}:{i} still hard-codes the desktop path: {line.strip()}")

    def test_parliamentarians_and_report_stats_use_this_checkout(self):
        for rel in ("scripts/export_parliamentarians.py", "scripts/report_stats.py"):
            src = (ROOT / rel).read_text()
            self.assertRegex(src, r"sys\.path\.insert\(0, os\.path\.dirname\(os\.path\.dirname\(os\.path\.abspath\(__file__\)\)\)\)")
            self.assertLess(src.index('"/tmp/arag_mig"'), src.index("os.path.abspath(__file__)"))  # checkout inserted last => first on the path


class ExportGrantsLocalTests(unittest.TestCase):
    def setUp(self):
        import export_grants
        self.eg = export_grants

    def test_local_runs_python_in_process_not_ssh(self):
        captured = {}

        def fake_run(cmd, **kw):
            captured["cmd"], captured["env"], captured["input"] = cmd, kw.get("env"), kw.get("input")
            return subprocess.CompletedProcess(cmd, 0, stdout="{}", stderr="")

        with mock.patch("subprocess.run", fake_run):
            out = self.eg.run_remote(None, "federal", 10, 20, [], 5, local_db="/srv/vm/parli.db")
        self.assertEqual(out, {})
        self.assertEqual(captured["cmd"][0], sys.executable)
        self.assertNotIn("ssh", captured["cmd"])
        self.assertEqual(captured["env"]["OPAX_DB"], "/srv/vm/parli.db")
        self.assertIn('DB = os.environ.get("OPAX_DB")', captured["input"])
        self.assertIn("import json, os,", captured["input"])

    def test_host_still_means_ssh(self):
        captured = {}

        def fake_run(cmd, **kw):
            captured["cmd"], captured["env"] = cmd, kw.get("env")
            return subprocess.CompletedProcess(cmd, 0, stdout="{}", stderr="")

        with mock.patch("subprocess.run", fake_run):
            self.eg.run_remote("desktop", "federal", 10, 20, [], 5)
        self.assertEqual(captured["cmd"][:4], ["ssh", "desktop", "python3", "-"])
        self.assertIsNone(captured["env"])

    def test_the_streamed_program_compiles_and_reads_the_env(self):
        prog = self.eg.remote_program({})
        compile(prog, "remote_program", "exec")
        self.assertIn("OPAX_DB", prog)
        self.assertNotIn("/home/jake", prog)

    def test_main_goes_local_when_opax_db_is_set(self):
        seen = {}

        def fake_remote(host, jur, top, cap, force, programs, local_db=None, force_programs=None):
            seen["host"], seen["local_db"] = host, local_db
            return None            # main returns 1 without writing files

        with mock.patch.object(self.eg, "run_remote", fake_remote), \
                mock.patch.dict(os.environ, {"OPAX_DB": "/srv/vm/parli.db"}), \
                mock.patch.object(sys, "argv", ["export_grants.py", "federal", "--out-dir", "/nonexistent-out"]):
            self.assertEqual(self.eg.main(), 1)
        self.assertIsNone(seen["host"])
        with mock.patch.object(self.eg, "run_remote", fake_remote), \
                mock.patch.dict(os.environ, clear=False), \
                mock.patch.object(sys, "argv", ["export_grants.py", "federal", "--out-dir", "/nonexistent-out"]):
            os.environ.pop("OPAX_DB", None)
            self.eg.main()
        self.assertEqual(seen["host"], self.eg.DB_HOST)               # unchanged desktop behaviour
        with mock.patch.object(self.eg, "run_remote", fake_remote), \
                mock.patch.dict(os.environ, clear=False), \
                mock.patch.object(sys, "argv", ["export_grants.py", "federal", "--local", "--db", "/tmp/x.db", "--out-dir", "/nonexistent-out"]):
            os.environ.pop("OPAX_DB", None)
            self.eg.main()
        self.assertIsNone(seen["host"])
        self.assertEqual(seen["local_db"], "/tmp/x.db")


if __name__ == "__main__":
    unittest.main()
