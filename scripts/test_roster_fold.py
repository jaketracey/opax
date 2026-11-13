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


def fold(people, registry=(), same=None):
    """roster_fold.fold on a copy; the hand-checked identity list is empty unless a test gives one."""
    return roster_fold.fold(copy.deepcopy(people), registry, {} if same is None else same)


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


class TwinTests(unittest.TestCase):
    """members-electorates-011: a state print that differs only in case or apostrophe is the same person."""
    SEAT = [{"jurisdiction": "nsw", "chamber": "nsw_la", "electorate": "Prospect"}]

    def test_a_state_case_twin_folds_into_the_spelling_with_more_speeches(self):
        people = [row("Hugh McDermott", None, ["nsw"], ["nsw_la"], 2015, 2026, 956, representation=self.SEAT),
                  row("Hugh Mcdermott", None, ["nsw"], ["nsw_la"], 2015, 2016, 13, representation=self.SEAT)]
        out, folded, _ = fold(people)
        self.assertEqual(folded, [("Hugh Mcdermott", "Hugh McDermott")])
        self.assertEqual(len(out), 1)
        self.assertEqual((out[0]["speeches"], out[0]["prints"]), (969, ["Hugh Mcdermott"]))
        self.assertEqual(refusals(people, out), [])

    def test_an_apostrophe_twin_brings_its_register_name_and_keeps_the_partys_absence_neutral(self):
        people = [row("D’Ambrosio", None, ["vic"], ["vic_la"], 2018, 2022, 243),
                  row("D'Ambrosio", None, ["vic"], ["vic_la"], 2018, 2019, 12, full="Lily D'Ambrosio"),
                  row("M O’Brien", "Liberal", ["vic"], ["vic_la"], 2018, 2022, 272),
                  row("M O'Brien", None, ["vic"], ["vic_la"], 2018, 2019, 14)]
        out, folded, _ = fold(people)
        self.assertEqual(sorted(folded), [("D'Ambrosio", "D’Ambrosio"), ("M O'Brien", "M O’Brien")])
        by = {p["name"]: p for p in out}
        self.assertEqual(by["D’Ambrosio"]["full"], "Lily D'Ambrosio")
        self.assertEqual(by["M O’Brien"]["party"], "Liberal")

    def test_anything_that_separates_two_spellings_leaves_both(self):
        base = row("Ann Example", "Labor", ["nsw"], ["nsw_la"], 2010, 2020, 500, representation=self.SEAT)
        cases = {
            "another seat": dict(representation=[{"jurisdiction": "nsw", "chamber": "nsw_la", "electorate": "Other"}]),
            "another party": dict(party="Liberal"),
            "another chamber": dict(chambers=["nsw_lc"]),
            "years outside": dict(first=2000, last=2004),
            "another parliament": dict(states=["vic"], chambers=["vic_la"]),
            "a reviewed split": dict(speech_scope={"state": "nsw", "chamber": "nsw_la"}),
            "witness rows": dict(witness_rows=3),
        }
        for why, change in cases.items():
            with self.subTest(why):
                twin = {**row("Ann EXAMPLE", "Labor", ["nsw"], ["nsw_la"], 2012, 2014, 9, representation=self.SEAT), **change}
                out, folded, _ = fold([base, twin])
                self.assertEqual(len(out), 2, why)
        # Federal twins carry ids: they are not state twins, and fold through their verified id instead
        # (fold_ids, portal audit F2; IdFoldTests).
        fed = [row("Kim O'Dell", "Labor", ["federal"], ["representatives"], 1998, 2013, 700, pid="1"),
               row("Kim O’Dell", "Labor", ["federal"], ["representatives"], 1998, 2013, 300, pid="1")]
        self.assertEqual(roster_fold.fold_twins(copy.deepcopy(fed))[1], [])
        self.assertEqual(fold(fed)[1], [("Kim O’Dell", "Kim O'Dell")])

    def test_the_published_roster_folds_only_the_six_reviewed_state_twins(self):
        # 10 Nov 2026 roster: exactly these six; once installed, none remain to fold.
        doc = json.loads((ROOT / "portal/public/parliamentarians.json").read_text())
        _, twins = roster_fold.fold_twins(copy.deepcopy(doc["people"]))
        self.assertLessEqual(set(twins), set([("D O'Brien", "D O’Brien"), ("M O'Brien", "M O’Brien"),
            ("Hugh Mcdermott", "Hugh McDermott"), ("Jodi Mckay", "Jodi McKay"), ("D'Ambrosio", "D’Ambrosio"),
            ("Scot Macdonald", "Scot MacDonald")]))


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


class IdFoldTests(unittest.TestCase):
    """Portal audit F2: rows printed under several names with one verified id are one person (invented names)."""
    SEAT = [{"jurisdiction": "federal", "chamber": "representatives", "electorate": "Marlow", "state": "VIC"}]

    def rows(self):
        return [row("Kim Darrowby", "Labor", ["federal"], ["representatives"], 2008, 2026, 800, pid="19001",
                    current=True, party_now="Labor", representation=self.SEAT, aliases=["Kim Anne Darrowby"]),
                row("Kim Anne Darrowby", "Labor", ["federal"], ["representatives"], 2021, 2022, 25, pid="19001",
                    current=True, party_now="Labor", representation=[], aliases=["Kim Darrowby"]),
                row("Ann Example", "Labor", ["vic"], ["vic_la"], 2018, 2026)]

    def test_two_name_prints_under_one_id_are_one_row(self):
        out, folded, skipped = fold(self.rows())
        self.assertEqual((folded, skipped), ([("Kim Anne Darrowby", "Kim Darrowby")], []))
        self.assertEqual([p["name"] for p in out], ["Kim Darrowby", "Ann Example"])
        kim = out[0]
        self.assertEqual((kim["speeches"], kim["first"], kim["last"]), (825, 2008, 2026))
        self.assertEqual(kim["prints"], ["Kim Anne Darrowby"])
        self.assertEqual(kim["aliases"], ["Kim Anne Darrowby"])
        self.assertEqual((kim["pid"], kim["current"], kim["party_now"], kim["representation"]), ("19001", True, "Labor", self.SEAT))
        # The nightly safety net finds the folded print under its person, so the fold is no lost sitting member.
        self.assertEqual(refusals(self.rows(), out), [])
        # A second run changes nothing.
        again, folded, _ = fold(copy.deepcopy(out))
        self.assertEqual((again, folded), (out, []))

    def tarrant(self):
        # A formal print with more speeches ("Robin") and the public name ("Bob") holding the seat.
        return [row("Robin Tarrant", "Liberal", ["federal"], ["representatives"], 2002, 2011, 600, pid="19002", representation=[]),
                row("Bob Tarrant", "Liberal", ["federal"], ["representatives"], 1998, 2016, 400, pid="19002",
                    representation=self.SEAT, aliases=["Robin Carl Tarrant"])]

    @staticmethod
    def release(name, aliases):
        return roster_fold.registry_from_reference({"people": [{"name": name, "aliases": aliases,
            "jurisdiction": "federal", "person_id": "p2", "legacy_person_id": "19002"}], "terms": []})

    def test_the_release_public_name_keeps_the_name_and_slug_over_a_formal_print_with_more_speeches(self):
        people = self.tarrant()
        # The published source person for the id: the electorate release's primary name, and its aliases.
        registry = self.release("Bob Tarrant", ["Robin Carl Tarrant"])
        self.assertEqual(fold(people)[1], [], "nothing says Bob is Robin")
        out, folded, _ = fold(people, registry)
        self.assertEqual(folded, [("Robin Tarrant", "Bob Tarrant")])
        bob = out[0]
        # The public name stays the person's name, so its slug (bob-tarrant) stays the address; the formal print is a
        # print and alias, whose old address forwards to it (portal/src/person-slug.ts formerSlugs).
        self.assertEqual((bob["name"], bob["prints"]), ("Bob Tarrant", ["Robin Tarrant"]))
        self.assertEqual(bob["aliases"], ["Robin Tarrant", "Robin Carl Tarrant"])
        self.assertEqual((bob["speeches"], bob["first"], bob["last"], bob["pid"]), (1000, 1998, 2016, "19002"))
        self.assertEqual(bob["representation"], self.SEAT)
        self.assertEqual(refusals(self.tarrant(), out), [])
        again, folded, _ = fold(copy.deepcopy(out), registry)
        self.assertEqual((again, folded), (out, []))

    def test_without_a_row_under_the_release_name_the_most_speeches_holds_it_and_a_seat_on_the_other_row_joins_it(self):
        # The release names the id "Rob Tarrant", which no row prints: the current rule decides.
        out, folded, _ = fold(self.tarrant(), self.release("Rob Tarrant", ["Bob Tarrant", "Robin Carl Tarrant"]))
        self.assertEqual(folded, [("Bob Tarrant", "Robin Tarrant")])
        self.assertEqual((out[0]["speeches"], out[0]["first"], out[0]["last"]), (1000, 1998, 2016))
        self.assertEqual(out[0]["representation"], self.SEAT)
        self.assertEqual(out[0]["aliases"], ["Bob Tarrant", "Robin Carl Tarrant"])

    def test_a_tie_goes_to_the_sitting_member_and_a_surname_print_never_holds_the_name(self):
        tie = [row("Lee Quorn", "Greens", ["federal"], ["senate"], 2019, 2022, 50, pid="19003"),
               row("Leigh Quorn", "Greens", ["federal"], ["senate"], 2022, 2026, 50, pid="19003", current=True)]
        self.assertEqual(fold(tie, same={"lee quorn": "19003"})[1], [("Lee Quorn", "Leigh Quorn")])
        tail = [row("Nara Quorn", "Greens", ["federal"], ["senate_committee"], 2025, 2026, 300, pid="19004"),
                row("Tali Nara Quorn", "Greens", ["federal"], ["senate"], 2022, 2026, 200, pid="19004")]
        self.assertEqual(fold(tail)[1], [("Nara Quorn", "Tali Nara Quorn")])

    def test_party_labels_join_and_identity_stays_the_persons(self):
        people = [row("Dana Vell", "Liberal", ["federal"], ["senate"], 2023, 2025, 30, pid="19005"),
                  row("Vell", "Independent", ["federal"], ["senate_committee"], 2025, 2025, 20, pid="19005")]
        out, folded, _ = fold(people)
        self.assertEqual(folded, [("Vell", "Dana Vell")])
        self.assertEqual((out[0]["party"], out[0]["parties"]), ("Liberal", ["Liberal", "Independent"]))
        self.assertNotIn("aliases", out[0], "a surname print is no alias")

    def test_spelling_twins_with_one_id_fold(self):
        people = [row("Kim O'Dell", "Labor", ["federal"], ["representatives"], 1998, 2013, 700, pid="1", representation=self.SEAT),
                  row("Kim O’Dell", "Labor", ["federal"], ["representatives"], 1998, 2013, 300, pid="1", representation=self.SEAT)]
        out, folded, _ = fold(people)
        self.assertEqual(folded, [("Kim O’Dell", "Kim O'Dell")])
        self.assertEqual((len(out), out[0]["prints"], out[0]["representation"]), (1, ["Kim O’Dell"], self.SEAT))
        self.assertNotIn("aliases", out[0], "a spelling twin is the person's own name")

    def test_anything_that_separates_the_rows_leaves_them_for_review(self):
        other = [{"jurisdiction": "federal", "chamber": "representatives", "electorate": "Elsewhere", "state": "VIC"}]
        cases = {
            "names that do not agree": ({"name": "Pat Darrowby"}, "is not a name of"),
            "no shared parliament": ({"states": ["nsw"], "chambers": ["nsw_la"]}, "shares no parliament"),
            "another seat in the same years": ({"representation": other}, "different seats in one house"),
            "a reviewed witness split": ({"speech_scope": {"state": "federal", "chamber": "representatives"}}, "speech_scope"),
            "committee-witness rows": ({"witness_rows": 4}, "witness_rows"),
            "a pending count": ({"speeches": None}, "no speech count"),
        }
        for case, (change, why) in cases.items():
            with self.subTest(case):
                people = self.rows()
                people[1].update(change)
                out, folded, skipped = fold(people)
                self.assertEqual(folded, [], case)
                self.assertEqual(len(out), 3, case)
                self.assertIn(why, skipped[-1][1], case)
        # A hand-checked entry in scripts/person_identity.json vouches for a name that does not agree.
        people = self.rows()
        people[1]["name"] = "Pat Darrowby"
        self.assertEqual(fold(people, same={"pat darrowby": "19001"})[1], [("Pat Darrowby", "Kim Darrowby")])

    def test_years_outside_the_ids_dated_house_service_leave_the_rows_apart(self):
        reference = {"people": [{"name": "Kim Darrowby", "aliases": [], "jurisdiction": "federal", "person_id": "p9",
                                 "legacy_person_id": "19001"}],
                     "terms": [{"person_id": "p9", "start": "2007-11-24", "end": None}]}
        registry = roster_fold.registry_from_reference(reference)
        self.assertEqual(len(fold(self.rows(), registry)[1]), 1)
        early = self.rows()
        early[1].update(first=1990, last=1991)
        _, folded, skipped = fold(early, registry)
        self.assertEqual(folded, [])
        self.assertIn("outside the dated service", skipped[-1][1])
        # Senate service is not dated in the release, so a senator's later rows are not held to House terms.
        senate = self.rows()
        senate[1].update(first=2023, last=2025, chambers=["senate"])
        senate[1]["name"] = "Kim Anne Darrowby"
        self.assertEqual(len(fold(senate, registry)[1]), 1)

    def test_the_merge_reads_each_field_alone(self):
        # So the accept list's [baseline merge, installed merge] pairs move only the fields their groups name.
        a, b = self.rows()[:2]
        grown = dict(a, speeches=900)
        x = roster_fold.merge_ids(copy.deepcopy(a), [copy.deepcopy(b)])
        y = roster_fold.merge_ids(copy.deepcopy(grown), [copy.deepcopy(b)])
        self.assertEqual({k for k in x.keys() | y.keys() if x.get(k) != y.get(k)}, {"speeches"})
