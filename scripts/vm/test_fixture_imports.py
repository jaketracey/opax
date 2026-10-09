"""Dependency omissions must fail during fixture setup, with useful diagnostics."""

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CHECK = ROOT / "scripts/vm/check_fixture_imports.py"


class FixtureImportTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.fixture = Path(temp.name)

    def write(self, name, content):
        path = self.fixture / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def copy(self, *names):
        for name in names:
            path = self.fixture / name
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, path)

    def check(self, *exporters):
        # Deliberately expose the real checkout; -I must still reject omissions.
        env = {**os.environ, "PYTHONPATH": str(ROOT / "scripts")}
        return subprocess.run([sys.executable, "-I", str(CHECK), str(self.fixture), *exporters],
                              cwd=ROOT, env=env, capture_output=True, text=True)

    def test_bills_missing_identity_is_not_supplied_by_the_real_checkout(self):
        self.copy("scripts/export_bills.py")
        result = self.check("scripts/export_bills.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("FIXTURE IMPORT ERROR: scripts/export_bills.py", result.stderr)
        self.assertIn("roster_identity", result.stderr)
        self.assertIn("Copy the missing dependency", result.stderr)

    def test_bills_missing_transitive_dependency_is_reported(self):
        self.copy("scripts/export_bills.py", "scripts/roster_identity.py",
                  "parli/__init__.py", "parli/ingest/__init__.py")
        result = self.check("scripts/export_bills.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("parli.ingest.speaker_names", result.stderr)

    def test_real_bills_and_people_import_with_their_dependencies(self):
        self.copy("scripts/export_bills.py", "scripts/export_parliamentarians.py",
                  "scripts/roster_identity.py", "scripts/enrich_profile_jurisdictions.py",
                  "scripts/bills_registry/bills_stages.py", "parli/__init__.py", "parli/arag.py",
                  "parli/ingest/__init__.py", "parli/ingest/arag_sync.py",
                  "parli/ingest/speech_hygiene.py", "parli/ingest/speaker_names.py")
        result = self.check("scripts/export_bills.py", "scripts/export_parliamentarians.py")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_incompatible_identity_stub_is_reported(self):
        self.write("scripts/export_people.py", "from scripts.roster_identity import federal_members\n")
        self.write("scripts/roster_identity.py", "def verify(): pass\n")
        result = self.check("scripts/export_people.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("FIXTURE IMPORT ERROR: scripts/export_people.py", result.stderr)
        self.assertIn("federal_members", result.stderr)

    def test_import_does_not_execute_exporter_main(self):
        self.write("scripts/export_fixture.py",
                   "if __name__ == '__main__':\n    raise RuntimeError('must not run exporter')\n")
        result = self.check("scripts/export_fixture.py")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_deferred_import_is_checked_without_running_the_function(self):
        self.write("scripts/export_fixture.py",
                   "def export():\n    import missing_fixture_helper\n"
                   "    raise RuntimeError('must not run exporter')\n")
        result = self.check("scripts/export_fixture.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("missing_fixture_helper", result.stderr)


if __name__ == "__main__":
    unittest.main()
