"""scripts/generate_years.py: an unlabelled voice takes the roster's party only where it was certainly theirs that year.

    python3 -m unittest scripts.test_generate_years

The names in the unit cases are invented. The last two cases read the committed year files and roster,
which are public parliamentary data.
"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts import generate_years as gy  # noqa: E402

ONE = {"name": "Alex Fixture", "party": "Labor", "party_now": "Labor", "first": 2019, "last": 2026}
MOVED = {"name": "Casey Example", "party": "Nationals", "party_now": "One Nation", "first": 2006, "last": 2026}
LISTED = {"name": "Riley Sample", "party": "Independent", "parties": ["Independent", "Greens"], "first": 2020, "last": 2026}
DATED = {"name": "Jordan Invented", "party": "Independent", "first": 1998, "last": 2026,
         "affiliations": [{"party": "Labor", "start": "1994-01-29", "end": "2005-01-21"},
                          {"party": "Independent", "start": "2023-08-22", "end": None}]}
BLANK = {"name": "Sam Unlabelled", "first": 2022, "last": 2026}
PEOPLE = [ONE, MOVED, LISTED, DATED, BLANK]


class RosterParty(unittest.TestCase):
    def test_a_single_recorded_party_is_the_party_at_the_time(self):
        self.assertEqual(gy.roster_party("Alex Fixture", 2026, PEOPLE), "Labor")
        self.assertEqual(gy.roster_party(" Alex Fixture ", 2019, PEOPLE), "Labor")

    def test_anyone_with_more_than_one_recorded_party_stays_as_recorded(self):
        for name in ("Casey Example", "Riley Sample", "Jordan Invented"):
            for year in (2012, 2019, 2026):
                self.assertIsNone(gy.roster_party(name, year, PEOPLE), (name, year))

    def test_no_party_no_row_twin_rows_or_a_year_outside_the_record_fill_nothing(self):
        self.assertIsNone(gy.roster_party("Sam Unlabelled", 2024, PEOPLE))
        self.assertIsNone(gy.roster_party("Nobody Here", 2024, PEOPLE))
        self.assertIsNone(gy.roster_party("Alex Fixture", 2024, PEOPLE + [dict(ONE)]))
        self.assertIsNone(gy.roster_party("Alex Fixture", 2018, PEOPLE))

    def test_fill_keeps_a_speech_label_and_marks_what_it_fills(self):
        voices = {"speakers": [
            {"name": "Alex Fixture", "party": None, "speeches": 3},
            {"name": "Casey Example", "party": None, "speeches": 3},
            {"name": "Riley Sample", "party": "Greens", "speeches": 2},
        ]}
        self.assertEqual(gy.fill_parties(voices, 2026, PEOPLE), 1)
        self.assertEqual(voices["speakers"], [
            {"name": "Alex Fixture", "party": "Labor", "speeches": 3, "party_basis": "roster"},
            {"name": "Casey Example", "party": None, "speeches": 3},
            {"name": "Riley Sample", "party": "Greens", "speeches": 2},
        ])


class CommittedYears(unittest.TestCase):
    def speakers(self, year):
        return json.loads((gy.OUT_DIR / f"{year}.json").read_text())["voices"]["speakers"]

    def test_the_committed_files_are_filled_and_a_changed_party_is_not_guessed(self):
        row = {s["name"]: s for s in self.speakers(2026)}["Katy Gallagher"]
        self.assertEqual((row["party"], row.get("party_basis")), ("Labor", "roster"))
        latham = {s["name"]: s for s in self.speakers(2019)}["Mark Latham"]
        self.assertIsNone(latham["party"])
        self.assertNotIn("party_basis", latham)

    def test_every_roster_filled_row_is_what_the_roster_proves_and_none_is_left_fillable(self):
        people = gy.roster_people()
        filled = 0
        for year in range(gy.YEAR_MIN, gy.YEAR_MAX + 1):
            for s in self.speakers(year):
                proven = gy.roster_party(s["name"], year, people)
                if s.get("party_basis") == "roster":
                    filled += 1
                    self.assertEqual(s["party"], proven, (year, s["name"]))
                elif not s["party"]:
                    self.assertIsNone(proven, (year, s["name"]))
        self.assertGreaterEqual(filled, 30)


if __name__ == "__main__":
    unittest.main()
