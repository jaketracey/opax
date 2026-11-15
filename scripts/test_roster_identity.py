"""roster_identity: a roster row keeps a person id only on evidence; a print holding two people keeps none."""
import json
import unittest
from collections import Counter

from scripts import roster_identity as ri

MEMBERS = {
    "10098": ri.member("10098", ["George Campbell"], "senate", 1997, 2008),
    "10903": ri.member("10903", ["Rex Patrick"], "senate", 2017, 2022),
    "10922": ri.member("10922", ["Pat Conaghan"], "representatives", 2019, None),
    "10964": ri.member("10964", ["Dorinda Cox"], "senate", 2021, None),
    "10473": ri.member("10473", ["John Murphy"], "representatives", 1998, 2013),
    "10007": ri.member("10007", ["Anthony Albanese"], "representatives", 1996, None),
}


def row(name, first, last, chambers=("representatives",), states=("federal",), witness=0):
    r = {"name": name, "first": first, "last": last, "chambers": list(chambers), "states": list(states)}
    if witness:
        r["witness_rows"] = witness
    return r


class VerifyTests(unittest.TestCase):
    def test_portrait_aliases_never_become_roster_person_ids(self):
        same = ri.same_person()
        for name in ["a. koutsantonis", "a. piccolo", "sophie panopoulos", "kathryn sullivan"]:
            self.assertNotIn(name, same)
        self.assertTrue(all(key.isdigit() for key in same.values()))

    def verify(self, r, ids, same=None):
        return ri.verify(r, Counter(ids), MEMBERS, same or {}, 2026)

    def test_a_namesakes_id_is_not_kept(self):
        self.assertEqual(self.verify(row("Graeme Campbell", 1998, 1998), {"10098": 40}), (None, "no member's name agrees"))
        self.assertEqual(self.verify(row("George Campbell", 2006, 2008, ("senate",)), {"10098": 40})[0], "10098")

    def test_the_only_member_of_that_name_in_those_years(self):
        self.assertEqual(self.verify(row("Patrick Conaghan", 2019, 2021), {"10903": 30}),
                         ("10922", "the only member of that name in those years"))
        # outside his years, no one
        self.assertEqual(self.verify(row("Patrick Conaghan", 2001, 2004), {"10903": 30})[0], None)

    def test_a_listed_print_wins(self):
        self.assertEqual(self.verify(row("Robert Baldwin", 2002, 2011), {"10545": 9}, {"robert baldwin": "10026"}),
                         ("10026", "listed as the same person"))

    def test_the_listed_sa_council_print_is_the_former_senator_and_nothing_wider(self):
        # scripts/person_identity.json (#308): SA Hansard prints Robert Simms MLC (from 2021) as 'R.A. Simms'.
        # 10842 is Robert Simms, Senate 2015-2016 (votes.json / pay.json via pinned_members). The entry is
        # the exact print, so a bare or single-initial Simms in the same Council years takes no id from it.
        same = ri.same_person()
        self.assertEqual(same.get("r.a. simms"), "10842")
        self.assertEqual([k for k in same if "simms" in k], ["r.a. simms"])
        pinned = ri.pinned_members()["10842"]
        self.assertEqual((pinned["names"], pinned["chamber"], pinned["start"], pinned["end"]),
                         (["Robert Simms"], "senate", 2015, 2016))
        members = {**MEMBERS, "10842": ri.member("10842", ["Robert Simms"], "senate", 2015, 2016)}
        council = lambda name: row(name, 2021, 2023, ("sa_lc",), ("sa",))  # noqa: E731
        self.assertEqual(ri.verify(council("R.A. Simms"), Counter(), members, same, 2026), ("10842", "listed as the same person"))
        for name in ("Simms", "R. Simms", "R.B. Simms"):
            self.assertIsNone(ri.verify(council(name), Counter(), members, same, 2026)[0], name)

    def test_a_print_of_one_person_keeps_the_id(self):
        self.assertEqual(self.verify(row("Albanese", 2000, 2004), {"10007": 12}), ("10007", "speech id"))

    def test_a_print_of_more_than_one_person_keeps_none(self):
        for r, ids, why in [
            (row("Cox", 2000, 2026, ("senate_committee", "representatives")), {"10964": 50}, "2000-2026 outside 2021-now"),
            (row("Murphy", 2002, 2026, ("representatives",), ("federal", "nsw")), {"10473": 50}, "spans federal+nsw"),
            (row("Murphy", 2002, 2012, witness=3), {"10473": 50}, "includes 3 committee-witness rows"),
            (row("Murphy", 2002, 2012), {"10473": 50, "10007": 2}, "speeches linked to 10007"),
            (row("Cox", 2022, 2026, ("representatives",)), {"10964": 50}, "chamber representatives"),
        ]:
            self.assertEqual(self.verify(r, ids), (None, f"mixed: {why}"), r)


class ReverifyTests(unittest.TestCase):
    def test_the_shipped_file_is_rewritten_by_the_same_rule(self):
        doc = {"meta": {"generated": "2026-10-05"}, "people": [
            {"name": "Dorinda Cox", "pid": "10964", "current": True, "party_now": "Labor"},
            dict(row("David Cox", 1998, 2004), pid="10964", current=True, party_now="Labor"),
            dict(row("Cox", 2000, 2026, ("senate_committee", "representatives")), pid="10964", current=True,
                 party_now="Labor", full="Dorinda Cox"),
            dict(row("Pat Conaghan", 2019, 2026), pid="10922", current=True, party_now="Nationals"),
            dict(row("Patrick Conaghan", 2019, 2021), pid="10903"),
        ]}
        changes = ri.reverify(doc, MEMBERS, {})
        people = {p["name"]: p for p in doc["people"]}
        self.assertEqual(sorted(c[0] for c in changes), ["Cox", "David Cox", "Patrick Conaghan"])
        for name in ("David Cox", "Cox"):
            self.assertFalse({"pid", "current", "party_now", "full"} & people[name].keys(), people[name])
        self.assertEqual({k: people["Patrick Conaghan"].get(k) for k in ("pid", "current", "party_now")},
                         {"pid": "10922", "current": True, "party_now": "Nationals"})


class ShippedRosterTests(unittest.TestCase):
    """The 13 prints that carried someone else's id in October 2026 (docs/PHOTOS.md)."""
    EXPECTED = {
        "Graeme Campbell": None, "Kathy Sullivan": None, "Kathryn Sullivan": None, "Ricky Johnston": None,
        "Bill Taylor": None, "Michael Cobb": None, "Ian McLachlan": None, "David Cox": None,
        # A canonical id sits in person_id, not pid: the apps accept only legacy or roster ids there.
        "Stephen Martin": None,
        "Patrick Conaghan": "10922", "Patrick Farmer": "10212", "Alexander Somlyay": "10600", "Robert Baldwin": "10026",
    }

    def test_each_has_its_own_id_or_none(self):
        people = {p["name"]: p for p in json.loads((ri.PUBLIC / "parliamentarians.json").read_text())["people"]}
        # A print of the person holding the same verified id (scripts/roster_fold.py fold_ids) is read under that person.
        people.update({s: p for p in list(people.values()) for s in p.get("prints") or [] if s not in people})
        for name, pid in self.EXPECTED.items():
            self.assertEqual(people[name].get("pid"), pid, name)
            if pid is None:
                self.assertNotIn("current", people[name], name)
        self.assertEqual(people["Stephen Martin"].get("person_id"), "person_9c02d321caef54b2ba21a1f8")


if __name__ == "__main__":
    unittest.main()
