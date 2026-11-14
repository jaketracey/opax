"""Bill sponsors get the person id the people export would give them.

    python3 -m unittest scripts/test_export_bills_sponsors.py
"""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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


class RetainedDatedSponsorParties(unittest.TestCase):
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

    def test_evidence_and_explicit_records_share_mutation_and_hold_contract(self):
        original = {**bill("SAMPLE, Sen Robin", introduced="2021-05-12", pid="99992"),
                    "sponsor_party": "Rex Patrick Team"}
        results = []
        for mode in ("positional", "keyword", "records"):
            b = dict(original)
            if mode == "positional":
                held = eb.fill_sponsor_parties([b], None, self.evidence())
            elif mode == "keyword":
                held = eb.fill_sponsor_parties([b], evidence=self.evidence())
            else:
                held = eb.fill_sponsor_parties([b], records=eb.SponsorPartyRecords(self.evidence()))
            results.append((b, held))
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[0], results[2])
        self.assertEqual(results[0][1], [{"key": "k", "sponsor": "SAMPLE, Sen Robin",
                                        "date": "2021-05-12", "source_party": "Rex Patrick Team",
                                        "dated_party": "Independent"}])
        with self.assertRaisesRegex(ValueError, "Supply evidence or records, not both"):
            eb.fill_sponsor_parties([], evidence=self.evidence(), records=eb.SponsorPartyRecords(self.evidence()))

    def test_registered_cosponsor_hold_does_not_require_a_unique_person_id(self):
        evidence = v.Evidence([v.entry(
            "service", "senate", ("name", "robin sample"), ["Robin Sample"],
            "Independent", "2020-01-01", "2022-07-01", pids=["99992", "99993"])])
        for pid in ("99993", None):
            with self.subTest(pid=pid):
                b = {**bill("FIXTURE, Sen Avery", introduced="2021-05-12", pid="99991"),
                     "sponsor_party": "Liberal", "sponsors": [
                         {"name": "FIXTURE, Sen Avery", "person_id": "99991", "party": "Liberal"},
                         {"name": "SAMPLE, Sen Robin", "person_id": pid, "party": "Rex Patrick Team"}]}
                held = eb.fill_sponsor_parties([b], evidence=evidence)
                self.assertEqual(b["sponsor_party"], "Liberal")
                self.assertEqual(b["sponsors"][1]["party"], "Rex Patrick Team")
                self.assertEqual(held, [{"key": "k", "sponsor": "SAMPLE, Sen Robin",
                                         "date": "2021-05-12", "source_party": "Rex Patrick Team",
                                         "dated_party": "Independent"}])

    def test_manual_refresh_exits_zero_and_keeps_published_labels_on_loader_outage(self):
        for loader in ("release_evidence", "handbook_evidence"):
            with self.subTest(loader=loader), tempfile.TemporaryDirectory() as scratch:
                directory = Path(scratch)
                b = {**bill("SAMPLE, Sen Robin", introduced="2021-05-12", pid="99992"),
                     "sponsor_party": "Rex Patrick Team"}
                (directory / "k.json").write_text(json.dumps(b))
                index = {"generated_at": "2024-07-01", "bills": [{"key": "k", "sponsor_party": "Rex Patrick Team"}]}
                (directory / "index.json").write_text(json.dumps(index))
                before = {p.name: p.read_bytes() for p in directory.iterdir()}
                aliases = directory / "party-page.js"
                aliases.write_bytes((Path(__file__).resolve().parents[1] / "portal/public/party-page.js").read_bytes())
                with patch.object(v, loader, side_effect=OSError("fixture outage")), \
                        patch.object(eb.sqlite3, "connect", side_effect=AssertionError("manual refresh opened a database")), \
                        patch.object(sys, "argv", ["export_bills.py", "--refresh-sponsor-parties", str(directory),
                                                   "--party-aliases", str(aliases)]):
                    self.assertEqual(eb.main(), 0)
                self.assertEqual({name: (directory / name).read_bytes() for name in before}, before)

    def test_retained_refresh_keeps_published_parties_when_evidence_is_unavailable(self):
        for house, name, pid, evidence in [
                ("representatives", "FIXTURE, Avery, MP", "99991",
                 v.Evidence(self.evidence(), check_labels=False)),
                ("senate", "SAMPLE, Sen Robin", "99992",
                 v.Evidence(self.evidence(), frozen={("federal", "senate")}))]:
            with self.subTest(house=house), tempfile.TemporaryDirectory() as scratch:
                directory = Path(scratch)
                b = {**bill(name, house=house, introduced="2024-06-03", pid=pid),
                     "sponsor_party": "Liberal"}
                index = {"generated_at": "2024-07-01", "bills": [{"key": "k", "sponsor_party": "Liberal"}]}
                (directory / "k.json").write_text(json.dumps(b))
                (directory / "index.json").write_text(json.dumps(index))
                before = {p.name: p.read_bytes() for p in directory.iterdir()}
                self.assertEqual(eb.refresh_sponsor_parties(directory, evidence), (0, []))
                self.assertEqual({p.name: p.read_bytes() for p in directory.iterdir()}, before)



class PublishedDatedSponsorParties(unittest.TestCase):
    def published_bill(self, key, source_party):
        path = Path(__file__).resolve().parents[1] / f"portal/public/bills/{key}.json"
        b = json.loads(path.read_text())
        # The registry's stale source label must survive a published refresh
        # in the test input, so reverting the check still fails afterwards.
        b["sponsor_party"] = source_party
        # Exercise both fields written by a fresh registry export.
        b["sponsors"] = [{"name": b["sponsor"], "person_id": b["sponsor_person_id"],
                          "party": b["sponsor_party"]}]
        return b

    def test_gee_r7202_uses_independent_on_introduction(self):
        b = self.published_bill("au-federal-r7202", "Nationals")
        eb.fill_sponsor_parties([b], eb.PartyTimeline({}, {}))
        self.assertEqual(b["sponsor_party"], "Independent")
        self.assertEqual(b["sponsors"][0]["party"], "Independent")

    def test_van_s1415_uses_independent_on_introduction(self):
        b = self.published_bill("au-federal-s1415", "Liberal")
        eb.fill_sponsor_parties([b], eb.PartyTimeline({}, {}))
        self.assertEqual(b["sponsor_party"], "Independent")
        self.assertEqual(b["sponsors"][0]["party"], "Independent")

    def test_source_fixtures_survive_an_already_refreshed_publication(self):
        for key, source in [("au-federal-r7202", "Nationals"), ("au-federal-s1415", "Liberal")]:
            refreshed = self.published_bill(key, "Independent")
            refreshed["sponsor_party"] = "Independent"
            refreshed["sponsors"][0]["party"] = "Independent"
            with patch.object(Path, "read_text", return_value=json.dumps(refreshed)):
                b = self.published_bill(key, source)
            self.assertEqual(b["sponsor_party"], source)
            self.assertEqual(b["sponsors"][0]["party"], source)

    def test_mcmahon_uses_registered_country_liberal_party(self):
        b = self.published_bill("au-federal-s1309", "Liberal")
        eb.fill_sponsor_parties([b], eb.PartyTimeline({}, {}))
        self.assertEqual(b["sponsor_party"], "Country Liberal Party")
        self.assertEqual(b["sponsors"][0]["party"], "Country Liberal Party")

    def test_s1127_uses_reviewed_centre_alliance_rename(self):
        b = self.published_bill("au-federal-s1127", "Nick Xenophon Team")
        eb.fill_sponsor_parties([b], eb.PartyTimeline({}, {}))
        self.assertEqual(b["sponsor_party"], "Centre Alliance")
        self.assertEqual(b["sponsors"][0]["party"], "Centre Alliance")

    def test_patrick_keeps_own_registered_team_without_an_invented_start(self):
        b = self.published_bill("au-federal-s1297", "Rex Patrick Team")
        eb.fill_sponsor_parties([b], eb.PartyTimeline({}, {}))
        self.assertEqual(b["sponsor_party"], "Rex Patrick Team")

    def test_anning_does_not_own_katters_party(self):
        b = self.published_bill("au-federal-s1153", "Katter's Australian Party")
        eb.fill_sponsor_parties([b], eb.PartyTimeline({}, {}))
        self.assertEqual(b["sponsor_party"], "Independent")


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
                                                   {"99001": "Labor"}), records=records)
        return b["sponsor_party"]

    def test_lnp_alias_is_preserved(self):
        records = self.records(("Nationals", "2020-01-01", "2025-01-01", None))
        self.assertEqual(self.apply(self.bill("LNP"), records), "LNP")

    def test_source_label_bracket_is_restored_without_filling_blanks_or_crossing_elections(self):
        points = [v.entry("official-list", "senate", ("name", "taylor example"),
                          ["Taylor Example"], "Independent", day, day, day,
                          pids=["99001"], point=True) for day in ("2023-01-01", "2024-12-01")]
        records = eb.SponsorPartyRecords(v.Evidence(points, elections={"senate": ["2022-05-21"]}))
        self.assertEqual(records.check(self.bill())["basis"], "bracket")
        self.assertEqual(self.apply(self.bill(), records), "Independent")
        self.assertIsNone(records.check(self.bill(None))["party"])
        records.evidence.elections["senate"].append("2024-01-01")
        records.resolver = v.Resolver(records.evidence)
        self.assertEqual(self.apply(self.bill(), records), "Liberal")

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

    def test_own_registered_party_beats_independent_on_either_side(self):
        for personal in ("Rex Patrick Team", "Nick Xenophon Team", "Jacqui Lambie Network",
                         "Australian Conservatives", "Katter's Australian Party"):
            for source, dated in [(personal, "Independent"), ("Independent", personal)]:
                with self.subTest(source=source, dated=dated), patch.object(
                        eb, "PERSONAL_SPONSOR_PARTIES", {personal: "99001"}):
                    records = self.records((dated, "2000-01-01", "2025-01-01", None))
                    self.assertEqual(self.apply(self.bill(source, "2001-01-01"), records), personal)
                    self.assertFalse(eb.vote_parties.same_party(personal, "Independent"))

    def test_someone_elses_registered_party_does_not_override_independent(self):
        records = self.records(("Independent", "2020-01-01", "2025-01-01", None))
        self.assertEqual(self.apply(self.bill("Katter's Australian Party"), records), "Independent")

    def test_liberal_and_nationals_are_not_an_independent_naming_convention(self):
        records = self.records(("Independent", "2020-01-01", "2025-01-01", None))
        for source in ("Liberal", "Nationals"):
            self.assertEqual(self.apply(self.bill(source), records), "Independent")

    def test_missing_records_abort_instead_of_reverting_publications(self):
        records = self.records(("Independent", "2020-01-01", "2025-01-01", None))
        records.evidence.frozen = frozenset({("federal", "senate")})
        with self.assertRaisesRegex(RuntimeError, "Bill export aborted: Senate Handbook unavailable"):
            self.apply(self.bill(), records)
        records.evidence.frozen = frozenset()
        records.evidence.check_labels = False
        with self.assertRaisesRegex(RuntimeError, "Bill export aborted: electorate release unavailable"):
            self.apply(self.bill(), records)

    def test_loader_outages_abort_build_before_publication(self):
        for loader, message in [("release_evidence", "electorate release"),
                                ("handbook_evidence", "Senate Handbook")]:
            with self.subTest(loader=loader), patch.object(eb.vote_parties, loader, side_effect=OSError("fixture outage")), \
                    patch.object(eb.PartyTimeline, "load", return_value=eb.PartyTimeline({}, {})), \
                    patch.object(eb, "load_v2_bills", return_value=[self.bill()]), \
                    patch.object(eb, "load_suppressed", return_value=[]), \
                    patch.object(eb, "has_table", return_value=False):
                with sqlite3.connect(":memory:") as db:
                    with self.assertRaisesRegex(RuntimeError, "Bill export aborted: " + message):
                        eb.build(db, False)

    def test_pid_cannot_correct_a_different_printed_surname(self):
        records = self.records(("Independent", "2020-01-01", "2025-01-01", None))
        b = self.bill()
        b["sponsor"] = "OTHER, Sen Morgan"
        self.assertEqual(self.apply(b, records), "Liberal")
        b["sponsor_party"] = None
        self.assertEqual(self.apply(b, records), "Independent")

    def test_reviewed_rename_boundary_is_inclusive(self):
        records = self.records(("Centre Alliance", "2010-01-01", "2025-01-01", None))
        records.evidence.renames = [[(None, "Nick Xenophon Team"), ("2018-04-10", "Centre Alliance")]]
        for day, expected in [("2018-04-09", "Nick Xenophon Team"), ("2018-04-10", "Centre Alliance")]:
            self.assertEqual(self.apply(self.bill("Nick Xenophon Team", day), records), expected)

    def test_new_dated_party_is_an_allowed_published_token(self):
        records = self.records(("Australian Conservatives", "2020-01-01", "2025-01-01", None))
        party = self.apply(self.bill("Independent"), records)
        self.assertEqual(party, "Australian Conservatives")
        self.assertIn(party, eb.PUBLISHED_PARTIES)


if __name__ == "__main__":
    unittest.main()
