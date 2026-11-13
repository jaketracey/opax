"""Bill sponsors get the person id the people export would give them.

    python3 -m unittest scripts/test_export_bills_sponsors.py
"""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_bills as eb  # noqa: E402
import roster_identity  # noqa: E402
import vote_parties as v  # noqa: E402

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
    def evidence(self):
        return v.Evidence([
            v.entry("service", "representatives", ("name", "avery fixture"), ["Avery Fixture"],
                    "Nationals", "2022-05-21", "2023-02-01", pids=["99991"]),
            v.entry("service", "representatives", ("name", "avery fixture"), ["Avery Fixture"],
                    "Independent", "2023-02-01", "2025-05-03", pids=["99991"]),
            v.entry("service", "senate", ("name", "robin sample"), ["Robin Sample"],
                    "Independent", "2020-01-01", "2022-07-01", pids=["99992"]),
        ])

    def test_recognised_party_is_checked_on_introduction_day_for_every_sponsor(self):
        bills = [{**bill("FIXTURE, Avery, MP", house="representatives", introduced=day, pid="99991"),
                  "sponsor_party": "Nationals", "sponsors": [
                      {"name": "FIXTURE, Avery, MP", "person_id": "99991", "party": "Nationals"},
                      {"name": "FIXTURE, Avery, MP", "person_id": "99991", "party": "Nationals"}]}
                 for day in ["2023-01-31", "2023-02-01", "2024-06-03"]]
        eb.fill_sponsor_parties(bills, evidence=self.evidence())
        self.assertEqual([b["sponsor_party"] for b in bills], ["Nationals", "Independent", "Independent"])
        self.assertEqual([[s["party"] for s in b["sponsors"]] for b in bills],
                         [["Nationals"] * 2, ["Independent"] * 2, ["Independent"] * 2])

    def test_missing_dates_conflicts_and_frozen_records_do_not_replace_a_source_label(self):
        for day, evidence in [(None, self.evidence()), ("2026-01-01", self.evidence()),
                              ("2024-01-01", v.Evidence(self.evidence(), check_labels=False))]:
            b = {**bill("FIXTURE, Avery, MP", house="representatives", introduced=day, pid="99991"),
                 "sponsor_party": "Nationals"}
            eb.fill_sponsor_parties([b], evidence=evidence)
            self.assertEqual(b["sponsor_party"], "Nationals")
        evidence = self.evidence()
        evidence.append(v.entry("service", "representatives", ("name", "avery fixture"), ["Avery Fixture"],
                                "Labor", "2024-01-01", "2025-01-01", pids=["99991"]))
        b = {**bill("FIXTURE, Avery, MP", house="representatives", introduced="2024-06-01", pid="99991"),
             "sponsor_party": "Nationals"}
        eb.fill_sponsor_parties([b], evidence=evidence)
        self.assertEqual(b["sponsor_party"], "Nationals")

    def test_registered_party_and_group_disagreement_is_returned_for_review(self):
        b = {**bill("SAMPLE, Sen Robin", introduced="2021-05-12", pid="99992"),
             "sponsor_party": "Rex Patrick Team", "sponsors": [
                 {"name": "SAMPLE, Sen Robin", "person_id": "99992", "party": "Rex Patrick Team"}]}
        held = eb.fill_sponsor_parties([b], evidence=self.evidence())
        self.assertEqual(b["sponsor_party"], "Rex Patrick Team")
        self.assertEqual(b["sponsors"][0]["party"], "Rex Patrick Team")
        self.assertEqual(held, [{"key": "k", "sponsor": "SAMPLE, Sen Robin", "date": "2021-05-12",
                                 "source_party": "Rex Patrick Team", "dated_party": "Independent"}])

    def test_retained_refresh_updates_detail_and_index_without_changing_the_snapshot_date(self):
        with tempfile.TemporaryDirectory() as scratch:
            directory = Path(scratch)
            b = {**bill("FIXTURE, Avery, MP", house="representatives", introduced="2024-06-03", pid="99991"),
                 "sponsor_party": "Nationals", "sponsors": [
                     {"name": "FIXTURE, Avery, MP", "person_id": "99991", "party": "Nationals"}]}
            index = {"generated_at": "2024-07-01", "bills": [{"key": "k", "sponsor_party": "Nationals"}]}
            (directory / "k.json").write_text(json.dumps(b))
            (directory / "index.json").write_text(json.dumps(index))
            self.assertEqual(eb.refresh_sponsor_parties(directory, self.evidence()), (1, []))
            detail = json.loads((directory / "k.json").read_text())
            repaired = json.loads((directory / "index.json").read_text())
            self.assertEqual(detail["sponsor_party"], "Independent")
            self.assertEqual(detail["sponsors"][0]["party"], "Independent")
            self.assertEqual(repaired["bills"][0]["sponsor_party"], "Independent")
            self.assertEqual(repaired["generated_at"], index["generated_at"])
            self.assertEqual(eb.refresh_sponsor_parties(directory, self.evidence()), (0, []))


if __name__ == "__main__":
    unittest.main()
