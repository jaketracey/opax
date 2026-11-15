"""scripts/roster_reverify.py: people are matched on the OpenAustralia id, and only real differences are listed.

    python3 -m unittest scripts.test_roster_reverify
"""
import tempfile
import unittest
from pathlib import Path

from scripts import roster_reverify as rv

PEOPLE = """<people>
 <person id="uk.org.publicwhip/person/90001" latestname="Alex Example"><office id="uk.org.publicwhip/member/1"/></person>
 <person id="uk.org.publicwhip/person/90002" latestname="Sam Fixture"><office id="uk.org.publicwhip/lord/100001"/>
  <office id="uk.org.publicwhip/lord/100002"/></person>
 <person id="uk.org.publicwhip/person/90003" latestname="Jo Sample"><office id="uk.org.publicwhip/lord/100003"/></person>
 <person id="uk.org.publicwhip/person/90004" latestname="Kim Chair"><office id="uk.org.publicwhip/member/2"/></person>
 <person id="uk.org.publicwhip/person/90005" latestname="Lee Room"><office id="uk.org.publicwhip/member/3"/></person>
 <person id="uk.org.publicwhip/person/90006" latestname="Pat Gone"><office id="uk.org.publicwhip/member/4"/></person>
</people>"""
REPS = """<members>
 <member division="Testville" firstname="Alex" fromdate="2025-05-03" house="representatives" id="uk.org.publicwhip/member/1" lastname="Example" party="Australian Labor Party" todate="9999-12-31"/>
 <member division="Oxley" firstname="Kim" fromdate="2022-07-26" house="representatives" id="uk.org.publicwhip/member/2" lastname="Chair" party="SPK" todate="9999-12-31"/>
 <member division="Maranoa" firstname="Lee" fromdate="2016-07-02" house="representatives" id="uk.org.publicwhip/member/3" lastname="Room" party="National Party" todate="9999-12-31"/>
 <member division="Farrer" firstname="Pat" fromdate="2001-11-10" house="representatives" id="uk.org.publicwhip/member/4" lastname="Gone" party="Liberal Party" todate="2026-02-27"/>
</members>"""
SENATE = """<members>
 <member division="Tasmania" firstname="Sam" fromdate="2019-07-01" house="senate" id="uk.org.publicwhip/lord/100001" lastname="Fixture" party="Liberal Party" todate="2025-06-30"/>
 <member division="Tasmania" firstname="Sam" fromdate="2025-07-01" house="senate" id="uk.org.publicwhip/lord/100002" lastname="Fixture" party="Liberal Party" todate="9999-12-31"/>
 <member division="WA" firstname="Jo" fromdate="2026-08-20" house="senate" id="uk.org.publicwhip/lord/100003" lastname="Sample" party="Australian Greens" todate="9999-12-31"/>
</members>"""


def source():
    with tempfile.TemporaryDirectory() as tmp:
        for name, text in (("people.xml", PEOPLE), ("representatives.xml", REPS), ("senators.xml", SENATE)):
            (Path(tmp) / name).write_text(text, encoding="utf-8")
        return rv.read_source(tmp)


def seat(chamber, electorate, state):
    return {"jurisdiction": "federal", "chamber": chamber, "electorate": electorate, "state": state}


class Reverify(unittest.TestCase):
    def test_source_lists_who_is_in_office_and_its_last_change(self):
        members, facts = source()
        self.assertEqual(sorted(members), ["90001", "90002", "90003", "90004", "90005"])
        self.assertEqual(facts["houses"], {"representatives": 3, "senate": 2})
        self.assertEqual(facts["last_change"], "2026-08-20")
        self.assertEqual(members["90003"]["seat"], "Western Australia")
        self.assertEqual(members["90001"]["party"], "Labor")

    def test_only_a_sitting_federal_row_is_compared(self):
        sitting = {"current": True, "states": ["federal"], "representation": [seat("senate", "Tasmania", "TASMANIA")]}
        self.assertEqual(len(rv.federal_now(sitting)), 1)
        self.assertEqual(rv.federal_now({**sitting, "representation": []}), [])
        self.assertIsNone(rv.federal_now({**sitting, "current": False}))
        self.assertIsNone(rv.federal_now({**sitting, "states": ["sa"]}))
        # a sitting state member whose dated federal service ended
        self.assertIsNone(rv.federal_now({**sitting, "states": ["federal", "sa"], "affiliations": [
            {"jurisdiction": "federal", "end": "2020-01-20"}, {"jurisdiction": "sa", "end": None}]}))

    def test_matches_on_id_and_lists_real_differences_apart_from_labels(self):
        members, _ = source()
        rows = [
            ({"name": "Alex Example", "pid": "90001", "chambers": ["representatives"], "party_now": "Labor"},
             [seat("representatives", "Testville", "NSW")]),
            # a surname print with no seat: a difference, under its full name
            ({"name": "Fixture", "full": "Sam Fixture", "pid": "90002", "chambers": ["senate_committee"], "party_now": "Liberal"}, []),
            # the same name under another id is not a match
            ({"name": "Jo Sample", "pid": "aph_1", "chambers": ["senate"], "party_now": "Greens"},
             [seat("senate", "Western Australia", "WA")]),
            ({"name": "Kim Chair", "pid": "90004", "chambers": ["representatives"], "party_now": "Labor"},
             [seat("representatives", "Oxley", "QLD")]),
            ({"name": "Lee Room", "pid": "90005", "chambers": ["representatives"], "party_now": "LNP"},
             [seat("representatives", "Maranoa", "QLD")]),
            ({"name": "Pat Gone", "pid": "90006", "chambers": ["representatives"], "party_now": "Liberal"},
             [seat("representatives", "Farrer", "NSW")]),
        ]
        out = rv.compare(rv.roster_list(rows), members, "test")
        self.assertEqual(out["matched_by_id"], 4)
        self.assertEqual([(n["id"], n["source_id"]) for n in out["name_only"]], [("aph_1", "90003")])
        self.assertEqual([p["name"] for p in out["opax_not_in_source"]], ["Pat Gone"])
        self.assertEqual(out["source_not_in_opax"], [])
        self.assertEqual([(d["name"], d["field"], d["opax"], d["source"]) for d in out["differs"]],
                         [("Sam Fixture", "house", None, "senate"), ("Sam Fixture", "seat", None, "Tasmania")])
        self.assertEqual(sorted((d["name"], d["source"]) for d in out["party_labels"]), [("Kim Chair", "SPK"), ("Lee Room", "Nationals")])

    def test_a_change_of_party_or_state_is_a_difference(self):
        members, _ = source()
        rows = [({"name": "Alex Example", "pid": "90001", "chambers": ["representatives"], "party_now": "Independent"},
                 [seat("representatives", "Testville", "NSW")]),
                ({"name": "Jo Sample", "pid": "90003", "chambers": ["senate"], "party_now": "Greens"},
                 [seat("senate", "Western Australia", "TASMANIA")])]
        out = rv.compare(rv.roster_list(rows), {k: members[k] for k in ("90001", "90003")}, "test")
        self.assertEqual([(d["name"], d["field"]) for d in out["differs"]], [("Alex Example", "party"), ("Jo Sample", "state")])
        self.assertEqual(out["party_labels"], [])


if __name__ == "__main__":
    unittest.main()
