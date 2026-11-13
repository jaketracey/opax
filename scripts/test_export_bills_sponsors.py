"""Bill sponsors get the person id the people export would give them.

    python3 -m unittest scripts/test_export_bills_sponsors.py
"""
import json
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_bills as eb  # noqa: E402
import roster_identity  # noqa: E402

MEMBERS = [
    # person_id, full_name, first_name, last_name, chamber, entered_house, left_house
    ("10722", "Christopher Back", "Christopher", "Back", "senate", "2009-05-13", "2017-05-01"),
    ("10912", "Mehreen Faruqi", "Mehreen", "Faruqi", "senate", "2018-08-15", None),
    ("10352", "Robert Carl Katter", "Bob", "Katter", "representatives", "1993-03-13", None),
    ("10351", "Robert Cummin Katter", "Bob", "Katter", "representatives", "1966-11-26", "1990-02-19"),
    ("10850", "Zhenya Wang", "Zhenya", "Wang", "senate", "2014-07-01", "2016-05-09"),
    # Two senators of one name in the same years: neither may be chosen.
    ("90001", "Sam Example", "Sam", "Example", "senate", "2010-07-01", None),
    ("90002", "Sam Example", "Sam", "Example", "senate", "2012-07-01", None),
    ("aph_1", "Not Numeric", "Not", "Numeric", "senate", "2010-07-01", None),
]


def members():
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE members (person_id TEXT, full_name TEXT, first_name TEXT, last_name TEXT, "
               "chamber TEXT, entered_house TEXT, left_house TEXT)")
    db.executemany("INSERT INTO members VALUES (?,?,?,?,?,?,?)", MEMBERS)
    return roster_identity.federal_members(db)


def bill(sponsor=None, portfolio=None, house="senate", introduced="2015-02-11", pid=None):
    return {"key": "k", "sponsor": sponsor, "portfolio": portfolio, "originating_house": house,
            "introduced": introduced, "sponsor_person_id": pid}


class SponsorPrint(unittest.TestCase):
    def test_registry_and_portfolio_prints(self):
        for b, name in [
            (bill("BACK, Sen Chris"), "Chris BACK"),
            (bill("XENOPHON, Senator Nick"), "Nick XENOPHON"),
            (bill("KATTER, Bob Jnr"), "Bob KATTER"),
            (bill("O&#39;NEILL, Sen Deborah"), "Deborah O'NEILL"),
            (bill(portfolio="(s) KATTER, Bob, Jnr, MP"), "Bob KATTER"),
            (bill(portfolio="(s) WILKIE, Andrew, MP"), "Andrew WILKIE"),
            # Several members, or a ministerial portfolio: no single sponsor.
            (bill(portfolio="(s) BANDT, Adam, MPWILKIE, Andrew, MP"), None),
            (bill(portfolio="Finance"), None),
            (bill(), None),
        ]:
            self.assertEqual(eb.sponsor_print(b), name, b)


class FillSponsorIds(unittest.TestCase):
    def test_index_retains_the_detail_records_identity_evidence(self):
        path = Path(__file__).resolve().parents[1] / "portal/public/bills/au-federal-s1471.json"
        detail = json.loads(path.read_text())
        row = eb.index_row(detail)
        self.assertEqual(row["sponsor"], "POCOCK, Sen David")
        self.assertEqual(row["sponsor_person_id"], "11009")
        self.assertEqual(row["sponsor_person_id"], detail["sponsor_person_id"])
        self.assertIsNone(eb.index_row({**detail, "sponsor_person_id": None})["sponsor_person_id"])

    def test_fills_only_one_agreeing_member_in_term(self):
        m = members()
        bills = [
            bill("BACK, Sen Chris"),                                         # short form -> 10722
            bill("WANG, Sen Zhenya", introduced="2015-10-13"),               # -> 10850
            bill(portfolio="(s) KATTER, Bob, Jnr, MP", house="representatives", introduced="2013-02-11"),
            bill("FARUQI, Sen Mehreen", introduced="2026-09-07"),            # -> 10912
            bill("EXAMPLE, Sen Sam", introduced="2015-01-01"),               # two of them: empty
            bill("BACK, Sen Chris", introduced="2019-01-01"),                # out of term: empty
            bill("BACK, Sen Chris", house="representatives"),                # wrong house: empty
            bill("BACK, Sen C"),                                             # initials print: empty
            bill("NOBODY, Sen Anyone"),                                      # no member: empty
            bill("BACK, Sen Chris", pid="10001"),                            # the registry's id stays
            bill("BACK, Sen Chris", introduced=None),                        # no date: empty
        ]
        self.assertEqual(eb.fill_sponsor_ids(bills, m), 4)
        self.assertEqual([b["sponsor_person_id"] for b in bills],
                         ["10722", "10850", "10352", "10912", None, None, None, None, None, "10001", None])

    def test_katter_senior_is_not_chosen_for_his_era(self):
        # 1980: only Bob Katter Snr sat; the print cannot tell them apart by name, the term does.
        b = bill(portfolio="(s) KATTER, Bob, MP", house="representatives", introduced="1980-03-01")
        eb.fill_sponsor_ids([b], members())
        self.assertEqual(b["sponsor_person_id"], "10351")

    def test_non_numeric_ids_are_not_members(self):
        self.assertNotIn("aph_1", members())


class DatedSponsorParties(unittest.TestCase):
    def published_bill(self, key):
        path = Path(__file__).resolve().parents[1] / f"portal/public/bills/{key}.json"
        b = json.loads(path.read_text())
        # Exercise both fields written by a fresh registry export.
        b["sponsors"] = [{"name": b["sponsor"], "person_id": b["sponsor_person_id"],
                          "party": b["sponsor_party"]}]
        return b

    def test_gee_r7202_uses_independent_on_introduction(self):
        b = self.published_bill("au-federal-r7202")
        eb.fill_sponsor_parties([b], eb.PartyTimeline({}, {}))
        self.assertEqual(b["sponsor_party"], "Independent")
        self.assertEqual(b["sponsors"][0]["party"], "Independent")

    def test_van_s1415_uses_independent_on_introduction(self):
        b = self.published_bill("au-federal-s1415")
        eb.fill_sponsor_parties([b], eb.PartyTimeline({}, {}))
        self.assertEqual(b["sponsor_party"], "Independent")
        self.assertEqual(b["sponsors"][0]["party"], "Independent")


class SponsorPartyPeriods(unittest.TestCase):
    def records(self, *periods):
        evidence = eb.vote_parties.Evidence([
            eb.vote_parties.entry("release-term", "senate", ("release", "example"),
                                  ["Taylor Example"], party, start, end, through,
                                  pids=["99001"])
            for party, start, end, through in periods], elections={})
        return eb.SponsorPartyRecords(evidence)

    def bill(self, party="Liberal", day="2024-05-15"):
        return {"key": "fixture", "sponsor": "EXAMPLE, Sen Taylor", "sponsor_person_id": "99001",
                "sponsor_party": party, "introduced": day, "originating_house": "senate"}

    def apply(self, b, records):
        # A current member or a later speech must not override a source label in a gap.
        eb.fill_sponsor_parties([b], eb.PartyTimeline({"99001": (["2025-01-01"], ["Greens"])},
                                                   {"99001": "Labor"}), records)
        return b["sponsor_party"]

    def test_lnp_alias_is_preserved(self):
        records = self.records(("Nationals", "2020-01-01", "2025-01-01", None))
        self.assertEqual(self.apply(self.bill("LNP"), records), "LNP")

    def test_no_dated_record_keeps_source(self):
        self.assertEqual(self.apply(self.bill(), self.records()), "Liberal")

    def test_gap_and_period_boundaries(self):
        records = self.records(("Liberal", "2020-01-01", "2023-06-19", None),
                               ("Independent", "2023-06-19", "2025-01-01", None))
        for day, expected in [("2019-12-31", "Liberal"), ("2023-06-18", "Liberal"),
                              ("2023-06-19", "Independent"), ("2024-05-15", "Independent"),
                              ("2025-01-01", "Liberal")]:
            with self.subTest(day=day):
                self.assertEqual(self.apply(self.bill(day=day), records), expected)

    def test_open_period_stops_at_observed_through(self):
        records = self.records(("Independent", "2023-06-19", None, "2024-05-15"))
        self.assertEqual(self.apply(self.bill(), records), "Independent")
        self.assertEqual(self.apply(self.bill(day="2024-05-16"), records), "Liberal")

    def test_internal_gap_keeps_source(self):
        records = self.records(("Greens", "2020-01-01", "2024-05-01", None),
                               ("Independent", "2024-06-01", "2025-01-01", None))
        self.assertEqual(self.apply(self.bill(), records), "Liberal")

    def test_conflicting_periods_keep_source(self):
        records = self.records(("Independent", "2020-01-01", "2025-01-01", None),
                               ("Greens", "2020-01-01", "2025-01-01", None))
        self.assertEqual(self.apply(self.bill(), records), "Liberal")

    def test_no_date_and_wrong_house_keep_source(self):
        records = self.records(("Independent", "2020-01-01", "2025-01-01", None))
        self.assertEqual(self.apply(self.bill(day=None), records), "Liberal")
        b = self.bill()
        b["originating_house"] = "representatives"
        self.assertEqual(self.apply(b, records), "Liberal")

    def test_each_cosponsor_is_checked(self):
        b = self.bill()
        b["sponsors"] = [{"name": b["sponsor"], "person_id": "99001", "party": "Liberal"},
                         {"name": "OTHER, Sen Morgan", "person_id": "99002", "party": "Liberal"}]
        records = self.records(("Independent", "2020-01-01", "2025-01-01", None))
        evidence = [*records.evidence, eb.vote_parties.entry(
            "handbook-term", "senate", ("handbook", "other"), ["Morgan Other"], "Greens",
            "2020-01-01", "2025-01-01", pids=["99002"])]
        records = eb.SponsorPartyRecords(eb.vote_parties.Evidence(evidence, elections={}))
        self.apply(b, records)
        self.assertEqual(b["sponsor_party"], "Independent")
        self.assertEqual([s["party"] for s in b["sponsors"]], ["Independent", "Greens"])

    def test_missing_source_prefers_bounded_record_to_timeline(self):
        records = self.records(("Independent", "2020-01-01", "2025-01-01", None))
        self.assertEqual(self.apply(self.bill(None), records), "Independent")

    def test_contextual_conventions_do_not_become_global_aliases(self):
        for source, dated in [("Rex Patrick Team", "Independent"), ("Liberal", "Nationals")]:
            with self.subTest(source=source):
                records = self.records((dated, "2020-01-01", "2025-01-01", None))
                convention = (("99001", "senate", "2020-01-01", "2024-06-01", source, dated),)
                with patch.object(eb, "SPONSOR_PARTY_CONVENTIONS", convention):
                    self.assertEqual(self.apply(self.bill(source), records), source)
                    by_name = self.bill(source)
                    by_name["sponsor_person_id"] = None
                    self.assertEqual(self.apply(by_name, records), source)
                    self.assertEqual(self.apply(self.bill(source, "2024-07-01"), records), dated)
                self.assertEqual(self.apply(self.bill(source), records), dated)
                self.assertFalse(eb.vote_parties.same_party(source, dated))

    def test_missing_records_freeze_source_labels(self):
        records = self.records(("Independent", "2020-01-01", "2025-01-01", None))
        records.evidence.frozen = frozenset({("federal", "senate")})
        self.assertEqual(self.apply(self.bill(), records), "Liberal")
        records.evidence.frozen = frozenset()
        records.evidence.check_labels = False
        self.assertEqual(self.apply(self.bill(), records), "Liberal")

    def test_new_dated_party_is_an_allowed_published_token(self):
        records = self.records(("Australian Conservatives", "2020-01-01", "2025-01-01", None))
        party = self.apply(self.bill("Independent"), records)
        self.assertEqual(party, "Australian Conservatives")
        self.assertIn(party, eb.PUBLISHED_PARTIES)


if __name__ == "__main__":
    unittest.main()
