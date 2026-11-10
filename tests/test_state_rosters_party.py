"""Roster party labels may only name a party the source label states.

    python3 -m pytest tests/test_state_rosters_party.py

Finding state-datasets-003 (10 Nov 2026): Wikidata's "Liberal-National Coalition"
fell through to the bare 'liberal' rule, so resolve() gave Nationals such as Emma
Kealy (Lowan) and Peter Walsh (Murray Plains) the party "Liberal".
"""
import contextlib
import io
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parli.ingest import state_rosters  # noqa: E402


class CanonicalPartyTests(unittest.TestCase):
    def test_coalition_label_names_no_party(self):
        for label in ("Liberal-National Coalition", "Liberal–National Coalition", "Coalition", "liberal national coalition"):
            self.assertIsNone(state_rosters.canonical_party(label), label)

    def test_party_labels_keep_their_party(self):
        cases = {
            "Liberal National Party of Queensland": "LNP",
            "Liberal Party of Australia (South Australian Division)": "Liberal",
            "Victorian Liberal Party": "Liberal",
            "National Party of Australia": "Nationals",
            "Victorian National Party": "Nationals",
            "Victorian Labor Party": "Labor",
            "independent politician": "Independent",
            "Pauline Hanson's One Nation": "One Nation",
            "Country Liberal Party": "Country Liberal Party",
            "Liberal Democratic Party": "Liberal Democratic Party",
            "Dignity Party": "Dignity Party",
        }
        for label, want in cases.items():
            self.assertEqual(state_rosters.canonical_party(label), want, label)
        for label in (None, "", "  "):
            self.assertIsNone(state_rosters.canonical_party(label))


class ResolvePartyTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.db = sqlite3.connect(str(Path(tmp.name) / "p.sqlite"))
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(state_rosters.DDL + """
            CREATE TABLE members (person_id TEXT PRIMARY KEY, full_name TEXT, first_name TEXT, last_name TEXT,
                state TEXT, chamber TEXT, electorate TEXT, party TEXT, party_canonical TEXT, gender TEXT);
            CREATE TABLE speeches (speech_id INTEGER PRIMARY KEY, person_id TEXT, date TEXT, speaker_name TEXT,
                speaker_name_clean TEXT, speaker_type TEXT);""")
        roster = [("Q19664385", "vic", "vic_la", "Emma Kealy", "Emma", "Kealy", "Lowan", "Liberal-National Coalition", "2014-11-29"),
                  ("Q5239965", "vic", "vic_la", "David Southwick", "David", "Southwick", "Caulfield", "Liberal-National Coalition", "2010-11-27"),
                  ("Q1", "vic", "vic_la", "Jane Labor", "Jane", "Labor", "Somewhere", "Victorian Labor Party", "2014-11-29")]
        self.db.executemany("INSERT INTO ext_state_roster VALUES (?,?,?,?,?,?,?,?,?,NULL,'female',NULL,'2026-01-01T00:00:00Z')", roster)
        members = [("vic_kealy", "Kealy", None), ("vic_southwick", "Southwick", "Liberal"), ("vic_labor", "Labor", None)]
        for i, (pid, name, party) in enumerate(members):
            self.db.execute("INSERT INTO members VALUES (?,?,NULL,NULL,'vic','vic_la',NULL,?,?,NULL)", (pid, name, party, party))
            self.db.execute("INSERT INTO speeches VALUES (?,?,'2020-03-01',?,NULL,NULL)", (i + 1, pid, "Ms " + name.upper()))
        self.db.commit()

    def test_coalition_roster_row_leaves_party_empty_and_keeps_a_stated_party(self):
        with contextlib.redirect_stdout(io.StringIO()):
            state_rosters.resolve(self.db, dry_run=False)
        rows = {r["person_id"]: dict(r) for r in self.db.execute("SELECT * FROM members")}
        self.assertEqual(rows["vic_kealy"]["full_name"], "Emma Kealy")
        self.assertIsNone(rows["vic_kealy"]["party"])
        self.assertIsNone(rows["vic_kealy"]["party_canonical"])
        self.assertEqual(rows["vic_southwick"]["party"], "Liberal")   # from the member row, not the coalition label
        self.assertEqual(rows["vic_labor"]["party"], "Labor")


if __name__ == "__main__":
    unittest.main()
