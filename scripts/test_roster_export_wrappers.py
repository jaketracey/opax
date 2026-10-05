"""The roster safety net through the real weekly path: scripts/vm/export_step.sh json ... bash
scripts/vm/export_people.sh, which runs export_parliamentarians.py (production SQL, unpatched) against a
database whose members table knows no federal member, so every person id and seat would vanish. Whatever the
baseline, the shipped parliamentarians.json must survive unless OPAX_ROSTER_ACCEPT=1 (docs/PHOTOS.md,
"Nightly safety net").

    python3 -m unittest scripts.test_roster_export_wrappers     # needs git and the sqlite3 CLI
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COPIED = ["scripts/vm/export_step.sh", "scripts/vm/export_people.sh", "scripts/vm/keep_if_unchanged.py",
          "scripts/export_parliamentarians.py", "scripts/roster_identity.py", "scripts/enrich_profile_jurisdictions.py",
          "scripts/person_identity.json", "portal/public/research/mlci.json"]
ROSTER = "portal/public/parliamentarians.json"
SITTING = [("Anthony Albanese", "10007"), ("Pat Conaghan", "10922")]


def shipped_roster():
    rows = [{"name": n, "speeches": 6, "party": "Labor", "states": ["federal"], "chambers": ["representatives"],
             "first": 2025, "last": 2025, "pid": pid, "current": True, "party_now": "Labor", "representation": []}
            for n, pid in SITTING]
    return json.dumps({"meta": {"generated": "2026-10-05", "people": len(rows)}, "people": rows},
                      separators=(",", ":")).encode() + b"\n"


@unittest.skipUnless(shutil.which("git") and shutil.which("sqlite3"), "needs git and the sqlite3 CLI")
class RealWrapperTests(unittest.TestCase):
    def sandbox(self, baseline):
        """A git checkout holding the export scripts and `baseline` as the committed roster (None: no file)."""
        box = Path(tempfile.mkdtemp(prefix="roster-wrappers-"))
        self.addCleanup(shutil.rmtree, box, True)
        for rel in COPIED:
            (box / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, box / rel)
        (box / "parli").symlink_to(ROOT / "parli")
        if baseline is not None:
            (box / ROSTER).write_bytes(baseline)
        git = lambda *a: subprocess.run(["git", *a], cwd=box, check=True, capture_output=True)  # noqa: E731
        git("init", "-q")
        git("add", "-A")
        git("-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline")
        # The production schema, its later columns, and no federal member in the members table.
        sys.path.insert(0, str(ROOT))
        from parli.schema import SCHEMA_SQL
        db = sqlite3.connect(box / "parli.db")
        db.executescript(SCHEMA_SQL)
        db.execute("PRAGMA foreign_keys=OFF")  # the point: speeches whose person ids the members table lost
        db.executescript("ALTER TABLE speeches ADD COLUMN witness_name TEXT;"
                         "ALTER TABLE members ADD COLUMN state TEXT; ALTER TABLE members ADD COLUMN party_canonical TEXT;")
        db.execute("INSERT INTO members (person_id, full_name, first_name, last_name, state, chamber) "
                   "VALUES ('qld_fixture', 'Fixture Member', 'Fixture', 'Member', 'qld', 'qld_la')")
        for name, pid in SITTING:
            for i in range(6):
                db.execute("INSERT INTO speeches (person_id, speaker_name, party, party_canonical, state, chamber, date, "
                           "text, source) VALUES (?,?,?,?,?,?,?,?,?)",
                           (pid, name, "ALP", "ALP", "federal", "representatives", "2025-03-0%d" % (i + 1),
                            f"Fixture speech {name} {i}. " + "The member spoke on the bill before the House. " * 8,
                            "test_fixture"))
        db.commit()
        db.close()
        return box

    def export(self, box, accept=False):
        env = {**os.environ, "PY": sys.executable, "OPAX_DB": str(box / "parli.db"), "PYTHONDONTWRITEBYTECODE": "1"}
        env.pop("OPAX_ROSTER_PREVIOUS", None)
        env["OPAX_ROSTER_ACCEPT"] = "1" if accept else ""
        r = subprocess.run(["bash", "scripts/vm/export_step.sh", "json", ROSTER, "bash", "scripts/vm/export_people.sh"],
                           cwd=box, env=env, capture_output=True, text=True, timeout=120)
        path = box / ROSTER
        return r.returncode, r.stderr, path.read_bytes() if path.exists() else None

    def test_a_good_baseline_holds_a_roster_that_lost_every_sitting_id(self):
        box = self.sandbox(shipped_roster())
        code, err, shipped = self.export(box)
        self.assertEqual(code, 3, err)
        self.assertIn("ROSTER HELD: 2 sitting member row(s) lose their id or seat", err)
        self.assertEqual(shipped, shipped_roster(), "the shipped roster is kept byte for byte")

    def test_no_usable_baseline_holds_too(self):
        for case, baseline, why in [("missing", None, "no shipped roster at"),
                                    ("malformed JSON", b"{", "cannot be read (JSONDecodeError"),
                                    ("people null", b'{"people":null}\n', "has no people to compare with")]:
            with self.subTest(case):
                box = self.sandbox(baseline)
                code, err, shipped = self.export(box)
                self.assertEqual(code, 3, err)
                self.assertIn("ROSTER HELD:", err)
                self.assertIn(why, err)
                self.assertEqual(shipped, baseline, "nothing is installed")

    def test_the_reviewed_override_installs_the_export(self):
        box = self.sandbox(b"{")
        code, err, shipped = self.export(box, accept=True)
        self.assertEqual(code, 0, err)
        rows = json.loads(shipped)["people"]
        self.assertEqual({r["name"] for r in rows}, {n for n, _ in SITTING})
        self.assertFalse(any(r.get("pid") for r in rows), "the override ships exactly what the export said")


if __name__ == "__main__":
    unittest.main()
