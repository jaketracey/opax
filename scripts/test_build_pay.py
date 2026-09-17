"""The pay rules, on a Handbook small enough to check by hand.

    python3 -m unittest scripts/test_build_pay.py

The registry is the real one (scripts/pay_registry): these tests are about how
a day's salary follows from it, so the expected figures are worked from the
registry's own base salary rather than typed in.
"""
import math
import sys
import unittest
from argparse import Namespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_pay as bp  # noqa: E402

AS_OF = "2026-09-01"
BASE = 239270        # from 1 July 2025
BASE_2011 = 140910   # from 1 July 2011, before shadow ministers were paid


def person(phid, given, family, party="Australian Labor Party", terms=()):
    return {"PHID": phid, "GivenName": given, "PreferredName": "", "FamilyName": family.upper(), "DisplayName": f"{family.upper()}, {given}",
            "Party": party, "PartyParliamentaryService": [
                {"DateStart": a, "DateEnd": b, "SecondaryService": [{"Value": p, "DateStart": a, "DateEnd": b}]} for a, b, p in terms]}


def service(phid, start, end="1900-01-01", chamber="Member"):
    return {"PHID": phid, "DateStart1": start, "DateEnd1": end, "MpOrSenator": chamber}


def ministry(phid, role, start, end="", entity="", mid=75):
    return {"PHID": phid, "Role": role, "Prep": "for" if entity else "", "Entity": entity, "RDateStart": start, "RDateEnd": end, "MDateEnd": "", "MID": mid}


def shadow(phid, role, start, end="", prep="", entity=""):
    return {"PHID": phid, "Role": role, "Prep": prep, "Entity": entity, "RDateStart": start, "RDateEnd": end, "MDateEnd": ""}


def position(phid, value, start, end="1900-01-01"):
    return {"PHID": phid, "Value1": value, "DateStart1": start, "DateEnd1": end}


def party_position(phid, role, where, start, end="1900-01-01", prep="in the"):
    return {"PHID": phid, "Value1": role, "Value2": prep, "Value3": where, "DateStart1": start, "DateEnd1": end}


GREENS = [person(f"G{i}", f"Green{i}", "Senator", "Australian Greens", [("2022-07-01", "", "Australian Greens")]) for i in range(11)]
RAW = {
    "individuals": [
        person("PM1", "Pat", "Premier"), person("CAB", "Cam", "Cabinet"), person("OUT", "Olive", "Outer"),
        person("SEC", "Sam", "Secretary"), person("WHIP", "Wes", "Whip"), person("SHAD", "Shay", "Shadow", "Liberal Party of Australia"),
        person("SHLO", "Lee", "Leader", "Liberal Party of Australia"), person("NAT", "Nat", "Country", "The Nationals"),
        person("BACK", "Bo", "Bench"), person("GONE", "Gil", "Gone"), *GREENS,
    ],
    "service": [service(p, "2022-05-21") for p in ("PM1", "CAB", "OUT", "SEC", "SHAD", "SHLO", "NAT", "BACK")]
    + [service("WHIP", "2022-07-01", chamber="Senator"), service("GONE", "2010-08-21", "2013-09-07")]
    + [service(g["PHID"], "2022-07-01", chamber="Senator") for g in GREENS],
    "ministryrecords": [
        ministry("PM1", "Prime Minister", "2022-05-23"), ministry("PM1", "Cabinet Minister", "2022-05-23"),
        ministry("CAB", "Cabinet Minister", "2022-06-01"), ministry("CAB", "Minister", "2022-06-01", entity="Health"),
        ministry("OUT", "Minister", "2022-06-01", entity="Sport"),
        ministry("SEC", "Assistant Minister", "2022-06-01", entity="Trade"),
        ministry("GONE", "Assistant Minister", "2013-09-18", "2015-09-21", entity="Defence", mid=69),
    ],
    "shadowministryrecords": [
        shadow("SHAD", "Shadow Cabinet Minister", "2022-06-05"), shadow("SHAD", "Shadow Minister", "2022-06-05", prep="for", entity="Health"),
        shadow("SHAD", "Deputy Leader of the Opposition", "2022-06-05", prep="in the", entity="Senate"),
        shadow("SHLO", "Leader", "2022-05-30", prep="of the", entity="Opposition"), shadow("SHLO", "Shadow Cabinet Minister", "2022-06-05"),
        shadow("GONE", "Shadow Cabinet Minister", "2010-09-14", "2013-09-07"),
    ],
    "positions": [position("WHIP", "Temporary Chair of Committees", "2022-07-26")],
    "partypositions": [
        party_position("WHIP", "Government Deputy Whip", "Senate", "2022-07-26"),
        party_position("NAT", "Leader", "Federal Parliamentary Nationals", "2022-05-30", prep="of the"),
        party_position("G0", "Leader", "Federal Parliamentary Australian Greens", "2022-07-01", prep="of the"),
    ],
}
# GONE sat 2010-2013 only, so the Abbott-era row above never pays; it is there
# to show an office outside a person's service is not paid.


def build():
    return bp.build(Namespace(refresh=False, as_of=AS_OF), raw=RAW, oa={}, roster=[])


def up10(amount):
    return int(math.ceil(amount / 10) * 10)


class PayRules(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = build()
        cls.now = {p["name"]: p["now"] for p in cls.out["people"].values() if p["now"]}

    def test_registry_base_salary(self):
        self.assertEqual(self.out["base"][-1], {"from": "2025-07-01", "amount": BASE, "source": self.out["base"][-1]["source"], "url": self.out["base"][-1]["url"]})
        self.assertEqual([step["amount"] for step in self.out["base"] if step["from"].startswith("2011")], [BASE_2011])

    def test_a_minister_is_paid_one_exact_rate(self):
        self.assertEqual(self.now["Pat Premier"]["salary"], round(BASE * 2.6))
        self.assertEqual(self.now["Pat Premier"]["post"], "Prime Minister")
        self.assertEqual((self.now["Cam Cabinet"]["pct"], self.now["Cam Cabinet"]["salary"]), (72.5, round(BASE * 1.725)))
        self.assertEqual(self.now["Cam Cabinet"]["post"], "Minister for Health (Cabinet)")
        self.assertEqual(self.now["Olive Outer"]["salary"], round(BASE * 1.575))
        self.assertEqual((self.now["Sam Secretary"]["pct"], self.now["Sam Secretary"]["post"]), (25.0, "Assistant Minister for Trade"))

    def test_office_holders_add_up_and_round_up_to_ten(self):
        whip = self.now["Wes Whip"]
        self.assertEqual(whip["pct"], 8.0)  # deputy whip 5% + temporary chair 3%
        self.assertEqual(whip["salary"], BASE + up10(BASE * 0.08))
        self.assertEqual(whip["post"], "Government Deputy Whip in the Senate + Temporary Chair of Committees")

    def test_a_shadow_minister_is_paid_a_flat_rate_instead_and_marked_assumed(self):
        shad = self.now["Shay Shadow"]
        # 25% flat, not 25% + the 20% of the Senate deputy leadership.
        self.assertEqual((shad["pct"], shad["salary"], shad.get("assumed")), (25.0, BASE + up10(BASE * 0.25), True))
        self.assertEqual(shad["post"], "Shadow Minister for Health (Shadow Cabinet)")
        # An office worth more than the flat rate wins, and is not an assumption.
        leader = self.now["Lee Leader"]
        self.assertEqual((leader["pct"], leader["post"], leader.get("assumed")), (85.0, "Leader of the Opposition", None))

    def test_shadow_ministers_were_unpaid_before_15_march_2012(self):
        gone = next(p for p in self.out["people"].values() if p["name"] == "Gil Gone")
        rates = {(spell[0], spell[3]) for spell in gone["spells"]}
        self.assertIn(("2010-08-21", 0.0), rates)
        self.assertIn(("2012-03-15", 25.0), rates)
        self.assertEqual(gone["to"], "2013-09-07")
        self.assertIsNone(gone["now"])
        self.assertFalse(any("Defence" in spell[2] for spell in gone["spells"]))

    def test_party_leaders(self):
        self.assertEqual((self.now["Nat Country"]["pct"], self.now["Nat Country"]["post"]), (45.0, "Leader of the Nationals"))
        # Eleven Greens: a minority party of more than ten.
        self.assertEqual((self.now["Green0 Senator"]["pct"], self.now["Green0 Senator"]["post"]), (45.0, "Leader of the Australian Greens"))

    def test_a_backbencher_is_on_the_base_salary(self):
        self.assertEqual(self.now["Bo Bench"], {"post": "Member of Parliament", "pct": 0.0, "salary": BASE, "since": "2022-05-21"})

    def test_years_add_up_and_the_ranking_is_sorted(self):
        bench = next(p for p in self.out["people"].values() if p["name"] == "Bo Bench")
        self.assertEqual(bench["total"], sum(amount for _, amount in bench["by_year"]))
        full = dict(bench["by_year"])[2025]  # 1 July 2025 to 30 June 2026, one base salary throughout
        self.assertEqual(full, BASE)
        salaries = [row["salary"] for row in self.out["current"]]
        self.assertEqual(salaries, sorted(salaries, reverse=True))
        self.assertEqual(self.out["current"][0]["name"], "Pat Premier")
        self.assertEqual(self.out["names"]["pat premier"], "PM1")


if __name__ == "__main__":
    unittest.main()
