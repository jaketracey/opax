"""scripts/generate_years.py: an unlabelled voice's party is filled only from a reviewed row or a dated affiliation.

    python3 scripts/test_generate_years.py

Nothing here reads the published roster: the roster refreshes weekly, and these checks must not move with it.
The roster rows are pinned in this file. The names in the unit cases are invented; the committed-files cases
read the year files and the accept list, which are public parliamentary data.
"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts import generate_years as gy  # noqa: E402

# One undated label over a whole record: not proof of the party in any year (a senator who changed party in
# an era of unlabelled speeches reads the same way).
ONE = {"name": "Alex Fixture", "party": "Labor", "party_now": "Labor", "states": ["federal"], "first": 2019, "last": 2026}
MOVED = {"name": "Casey Example", "party": "Nationals", "party_now": "One Nation", "states": ["federal"],
         "first": 2006, "last": 2026}
LISTED = {"name": "Riley Sample", "party": "Independent", "party_now": "Independent",
          "parties": ["Independent", "Greens"], "states": ["federal"], "first": 2020, "last": 2026}
DATED = {"name": "Jordan Invented", "party": "Independent", "party_now": "Independent",
         "parties": ["Independent", "One Nation"], "states": ["nsw", "federal"], "first": 1998, "last": 2026,
         "affiliations": [
             {"jurisdiction": "federal", "chamber": "representatives", "party": "Labor",
              "start": "1994-01-29", "end": "2005-01-21"},
             {"jurisdiction": "nsw", "chamber": "nsw_lc", "party": "One Nation",
              "start": "2019-03-23", "end": "2023-03-02"},
             {"jurisdiction": "nsw", "chamber": "nsw_lc", "party": "One Nation",
              "start": "2023-03-25", "end": "2023-08-21"},
             {"jurisdiction": "nsw", "chamber": "nsw_lc", "party": "Independent",
              "start": "2023-08-22", "end": None}]}
# Dated in one parliament, but the row also records another: a namesake may be folded in.
NAMESAKE = {"name": "Pat Namesake", "party": "Liberal", "states": ["federal", "nsw"], "first": 2006, "last": 2019,
            "affiliations": [{"jurisdiction": "federal", "chamber": "senate", "party": "Liberal",
                              "start": "2002-07-01", "end": "2019-06-30"}]}
STUB = {"name": "Surname", "party": "Labor", "states": ["federal"], "first": 2019, "last": 2026,
        "affiliations": [{"jurisdiction": "federal", "party": "Labor", "start": "2019-01-01", "end": None}]}
PEOPLE = [ONE, MOVED, LISTED, DATED, NAMESAKE, STUB]


class RosterParty(unittest.TestCase):
    def test_an_undated_label_is_never_the_answer_however_consistent(self):
        for name in ("Alex Fixture", "Casey Example", "Riley Sample"):
            for year in (2012, 2020, 2022, 2026):
                self.assertIsNone(gy.roster_party(name, year, PEOPLE), (name, year))

    def test_a_dated_affiliation_answers_for_its_years_only(self):
        self.assertEqual(gy.roster_party("Jordan Invented", 2019, PEOPLE), "One Nation")
        self.assertEqual(gy.roster_party(" Jordan Invented ", 2001, PEOPLE), "Labor")
        self.assertEqual(gy.roster_party("Jordan Invented", 2025, PEOPLE), "Independent")
        # Two parties in the year, and years no affiliation covers.
        self.assertIsNone(gy.roster_party("Jordan Invented", 2023, PEOPLE))
        self.assertIsNone(gy.roster_party("Jordan Invented", 2010, PEOPLE))

    def test_dates_must_speak_for_every_parliament_the_row_records(self):
        self.assertIsNone(gy.roster_party("Pat Namesake", 2012, PEOPLE))
        own = dict(NAMESAKE, states=["federal"])
        self.assertEqual(gy.roster_party("Pat Namesake", 2012, [own]), "Liberal")

    def test_a_surname_stub_no_row_twin_rows_or_a_year_outside_the_record_fill_nothing(self):
        self.assertIsNone(gy.roster_party("Surname", 2024, PEOPLE))
        self.assertIsNone(gy.roster_party("Nobody Here", 2024, PEOPLE))
        self.assertIsNone(gy.roster_party("Jordan Invented", 2019, PEOPLE + [dict(DATED)]))
        self.assertIsNone(gy.roster_party("Jordan Invented", 2019, [dict(DATED, first=2020)]))

    def test_fill_takes_a_reviewed_row_then_a_dated_one_and_keeps_a_speech_label(self):
        voices = {"speakers": [
            {"name": "Alex Fixture", "party": None, "speeches": 3},
            {"name": "Jordan Invented", "party": None, "speeches": 3},
            {"name": "Casey Example", "party": None, "speeches": 3},
            {"name": "Riley Sample", "party": "Greens", "speeches": 2},
        ]}
        accepted = {(2019, "Alex Fixture"): "Labor", (2018, "Casey Example"): "Nationals",
                    (2019, "Riley Sample"): "Independent"}
        self.assertEqual(gy.fill_parties(voices, 2019, PEOPLE, accepted), 2)
        self.assertEqual(voices["speakers"], [
            {"name": "Alex Fixture", "party": "Labor", "speeches": 3, "party_basis": "roster"},
            {"name": "Jordan Invented", "party": "One Nation", "speeches": 3, "party_basis": "roster"},
            {"name": "Casey Example", "party": None, "speeches": 3},
            {"name": "Riley Sample", "party": "Greens", "speeches": 2},
        ])


class CommittedYears(unittest.TestCase):
    # The one committed fill that comes from the roster's dated record, not the accept list: a member of the
    # NSW Legislative Council for One Nation from 23 March 2019. The roster's undated label says otherwise.
    DATED_FILLS = {(2019, "Mark Latham"): "One Nation"}

    def filled(self):
        rows = {}
        for year in range(gy.YEAR_MIN, gy.YEAR_MAX + 1):
            for s in json.loads((gy.OUT_DIR / f"{year}.json").read_text())["voices"]["speakers"]:
                if s.get("party_basis"):
                    self.assertEqual(s["party_basis"], "roster")
                    rows[(year, s["name"])] = s["party"]
        return rows

    def test_every_filled_row_is_a_reviewed_row_or_the_pinned_dated_one_and_nothing_else(self):
        accepted = gy.accepted_parties()
        self.assertEqual(len(accepted), 33)
        self.assertEqual(self.filled(), {**accepted, **self.DATED_FILLS})
        self.assertEqual(accepted[(2026, "Katy Gallagher")], "Labor")

    def test_the_accept_list_is_full_names_with_one_row_each(self):
        rows = json.loads(gy.ACCEPT.read_text())["rows"]
        self.assertEqual(len({(r["year"], r["name"]) for r in rows}), len(rows))
        for r in rows:
            self.assertIn(" ", r["name"].strip())
            self.assertTrue(r["party"].strip())

    def test_the_apps_carry_the_same_reviewed_rows(self):
        app = ROOT / "mobile" / "src" / "features" / "explore" / "voice-party-accepted.json"
        if not app.exists():
            self.skipTest("the app's copy lands with the app change")
        self.assertEqual(json.loads(app.read_text())["rows"], json.loads(gy.ACCEPT.read_text())["rows"])


if __name__ == "__main__":
    unittest.main()
