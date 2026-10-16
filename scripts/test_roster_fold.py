"""scripts/roster_fold.py: a surname-only print folds into the one person it certainly is, and only then.

    python3 -m unittest scripts.test_roster_fold

Shoebridge is public parliamentary data (the 16 Oct roster rows); every other name here is invented.
"""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts import roster_fold  # noqa: E402
from scripts.export_parliamentarians import refusals  # noqa: E402

SHOEBRIDGE = {"name": "Shoebridge", "speeches": 4769, "party": "Greens", "states": ["federal", "nsw"],
              "chambers": ["senate_committee", "joint_committee", "nsw_lc"], "first": 2016, "last": 2026,
              "representation": []}
DAVID = {"name": "David Shoebridge", "speeches": 1649, "party": "Greens", "states": ["nsw", "federal"],
         "chambers": ["nsw_lc", "senate"], "first": 2015, "last": 2026,
         "representation": [{"jurisdiction": "federal", "chamber": "senate", "electorate": "New South Wales", "state": "NSW"}],
         "pid": "11010", "current": True, "party_now": "Greens"}


def row(name, party, states, chambers, first, last, speeches=50, **extra):
    return {"name": name, "speeches": speeches, "party": party, "states": states, "chambers": chambers,
            "first": first, "last": last, **extra}


def fold(people, registry=()):
    return roster_fold.fold(copy.deepcopy(people), registry)


class FoldTests(unittest.TestCase):
    def test_shoebridge_folds_into_david_shoebridge(self):
        people, folded, skipped = fold([SHOEBRIDGE, DAVID, row("Ann Example", "Labor", ["vic"], ["vic_la"], 2018, 2026)])
        self.assertEqual(folded, [("Shoebridge", "David Shoebridge")])
        self.assertEqual(skipped, [])
        self.assertEqual([p["name"] for p in people], ["David Shoebridge", "Ann Example"])
        david = people[0]
        self.assertEqual(david["speeches"], 4769 + 1649)
        self.assertEqual(david["states"], ["nsw", "federal"])
        self.assertEqual(david["chambers"], ["nsw_lc", "senate", "senate_committee", "joint_committee"])
        self.assertEqual((david["first"], david["last"]), (2015, 2026))
        # Identity stays the person's; the print stays reachable for its speeches and its old address.
        self.assertEqual((david["pid"], david["current"], david["party_now"]), ("11010", True, "Greens"))
        self.assertEqual(david["prints"], ["Shoebridge"])
        self.assertEqual(len(david["representation"]), 1)

    def test_a_second_run_changes_nothing(self):
        once, _, _ = fold([SHOEBRIDGE, DAVID])
        twice, folded, _ = fold(once)
        self.assertEqual(folded, [])
        self.assertEqual(twice, once)

    def test_two_people_with_the_surname_leave_the_print_alone(self):
        people = [row("Quellbridge", "Labor", ["federal"], ["senate"], 2019, 2024, 400),
                  row("Ann Quellbridge", "Labor", ["federal"], ["senate"], 2016, 2025),
                  row("Ben Quellbridge", "Labor", ["federal"], ["representatives", "senate"], 2010, 2026)]
        out, folded, skipped = fold(people)
        self.assertEqual(folded, [])
        self.assertEqual(skipped, [("Quellbridge", "several people: Ann Quellbridge, Ben Quellbridge")])
        self.assertEqual(len(out), 3)

    def test_a_different_party_leaves_the_print_alone(self):
        people = [row("Marrowby", "Labor", ["nsw"], ["nsw_la"], 2019, 2023, 300),
                  row("Cass Marrowby", "Liberal", ["nsw"], ["nsw_la"], 2015, 2026)]
        out, folded, skipped = fold(people)
        self.assertEqual(folded, [])
        self.assertIn("party differs", skipped[0][1])
        self.assertEqual(len(out), 2)

    def test_no_party_is_not_the_same_party(self):
        _, folded, skipped = fold([row("Tindle", None, ["vic"], ["vic_la"], 2019, 2023),
                                   row("Ros Tindle", None, ["vic"], ["vic_la"], 2018, 2026)])
        self.assertEqual(folded, [])
        self.assertEqual(skipped[0][1], "no party recorded on the print")

    def test_committee_witness_rows_under_the_surname_leave_the_print_alone(self):
        stub = dict(SHOEBRIDGE, witness_rows=3)
        _, folded, skipped = fold([stub, DAVID])
        self.assertEqual(folded, [])
        self.assertIn("committee-witness rows", skipped[0][1])

    def test_a_print_with_its_own_recorded_seat_is_left_alone(self):
        # Its published roster-profile record would be orphaned by the fold.
        stub = dict(SHOEBRIDGE, representation=[{"jurisdiction": "nsw", "chamber": "nsw_lc", "electorate": "New South Wales"}])
        _, folded, skipped = fold([stub, DAVID])
        self.assertEqual(folded, [])
        self.assertEqual(skipped, [("Shoebridge", "would fold into David Shoebridge, but has its own recorded seat (a roster-profile record)")])

    def test_a_person_printed_by_initials_takes_the_prints_register_name(self):
        people = [row("Varnell", "Liberal", ["sa"], ["sa_ha"], 2019, 2025, 300, full="Vera Varnell"),
                  row("V.K. Varnell", "Liberal", ["sa"], ["sa_ha"], 2014, 2026)]
        out, folded, _ = fold(people)
        self.assertEqual(folded, [("Varnell", "V.K. Varnell")])
        self.assertEqual((out[0]["name"], out[0]["full"]), ("V.K. Varnell", "Vera Varnell"))

    def test_a_reviewed_witness_split_is_left_alone(self):
        stub = dict(SHOEBRIDGE, speech_scope={"state": "nsw", "chamber": "nsw_lc", "service": []})
        self.assertEqual(fold([stub, DAVID])[1], [])

    def test_a_print_outside_the_persons_houses_or_years_is_left_alone(self):
        for change, why in [({"states": ["federal", "nsw", "qld"]}, "jurisdictions outside"),
                            ({"chambers": ["nsw_lc", "nsw_la"]}, "chambers outside"),
                            ({"first": 2005}, "years outside")]:
            _, folded, skipped = fold([dict(SHOEBRIDGE, **change), DAVID])
            self.assertEqual(folded, [], change)
            self.assertIn(why, skipped[0][1], change)

    def test_committee_speeches_need_a_federal_member_with_an_id(self):
        state_only = dict(DAVID, chambers=["nsw_lc", "senate"])
        state_only.pop("pid")
        _, folded, skipped = fold([SHOEBRIDGE, state_only])
        self.assertEqual(folded, [])
        self.assertIn("no verified federal seat", skipped[0][1])

    def test_the_prints_own_id_and_register_name_must_be_the_persons(self):
        self.assertIn("person id differs", fold([dict(SHOEBRIDGE, pid="99999"), DAVID])[2][0][1])
        self.assertIn("members-register name", fold([dict(SHOEBRIDGE, full="Mary Shoebridge"), DAVID])[2][0][1])
        self.assertEqual(fold([dict(SHOEBRIDGE, full="David Shoebridge", pid="11010"), DAVID])[1],
                         [("Shoebridge", "David Shoebridge")])

    def test_another_member_of_the_surname_in_the_register_leaves_the_print_alone(self):
        stub = row("Quillon", "Greens", ["nsw"], ["nsw_lc"], 2016, 2022, 400)
        hal = row("Hal Quillon", "Greens", ["nsw"], ["nsw_lc"], 2012, 2022, pid="nsw_hal_quillon")
        reference = {"people": [{"name": "Ruth Quillon", "aliases": [], "jurisdiction": "nsw", "person_id": "p1"},
                                {"name": "Hal Quillon", "aliases": [], "jurisdiction": "nsw", "person_id": "p2"}],
                     "terms": []}
        _, folded, skipped = fold([stub, hal], roster_fold.registry_from_reference(reference))
        self.assertEqual(folded, [])
        self.assertIn("Ruth Quillon", skipped[0][1])
        # A dated member who left before the print's years is no rival.
        members = roster_fold.registry_from_members([
            {"full_name": "Ruth Quillon", "state": "NSW", "chamber": "nsw_lc", "entered_house": "1990-01-01", "left_house": "2003-03-22"},
            {"full_name": "Hal Quillon", "state": "NSW", "chamber": "nsw_lc", "entered_house": "2012-09-01", "left_house": None}])
        self.assertEqual(fold([stub, hal], members)[1], [("Quillon", "Hal Quillon")])
        # A wragge-only member sat before the corpus starts.
        wragge = {"people": [{"name": "Ruth Quillon", "aliases": [], "jurisdiction": "nsw", "person_id": "p3",
                              "legacy_person_id": "wragge_ruth_quillon"}], "terms": []}
        self.assertEqual(fold([stub, hal], roster_fold.registry_from_reference(wragge))[1], [("Quillon", "Hal Quillon")])

    def test_twin_spellings_are_one_person_and_the_slug_holder_takes_the_print(self):
        people = [row("O’Dell", "Labor", ["federal"], ["representatives"], 2001, 2010, 90),
                  row("Kim O'Dell", "Labor", ["federal"], ["representatives"], 1998, 2013, 700),
                  row("Kim O’Dell", "Labor", ["federal"], ["representatives"], 1998, 2013, 300)]
        out, folded, _ = fold(people)
        self.assertEqual(folded, [("O’Dell", "Kim O'Dell")])
        self.assertEqual(out[0]["speeches"], 790)


class SafetyNetTests(unittest.TestCase):
    def test_a_fold_is_not_a_dropped_row_and_a_folded_sitting_print_is_not_lost(self):
        previous = [dict(SHOEBRIDGE), dict(DAVID),
                    row("Faruqi", "Greens", ["federal"], ["senate_committee"], 2025, 2026, pid="10912", current=True),
                    row("Mehreen Faruqi", "Greens", ["nsw", "federal"], ["nsw_lc", "senate"], 2015, 2026, pid="10912", current=True)]
        new, folded, _ = fold(previous)
        self.assertEqual(len(folded), 2)
        self.assertEqual(refusals(previous, new), [])
        # A real drop still holds the export.
        self.assertTrue(any("row count drops" in r for r in refusals(previous, new[:-1])))


class CliTests(unittest.TestCase):
    def test_the_cli_rewrites_the_directory_and_reports(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory, report = Path(tmp) / "people.json", Path(tmp) / "report.json"
            directory.write_text(json.dumps({"meta": {"people": 2}, "people": [SHOEBRIDGE, DAVID]}))
            subprocess.run([sys.executable, str(ROOT / "scripts/roster_fold.py"), "--directory", str(directory),
                            "--report", str(report)], check=True, capture_output=True)
            doc = json.loads(directory.read_text())
            self.assertEqual(doc["meta"]["people"], 1)
            self.assertEqual(doc["meta"]["prints_folded"], 1)
            self.assertEqual(json.loads(report.read_text())["folded"], [["Shoebridge", "David Shoebridge"]])


if __name__ == "__main__":
    unittest.main()
