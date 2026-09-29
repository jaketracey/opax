"""Grant program files: the shared rules, without the database host.

    python3 -m unittest scripts/test_export_grants.py

The rules under test are the functions export_grants streams to the DB host
(remote_program sources them verbatim), so what passes here is what the export
runs. build_program_file is fed hand-made grant dicts in the shape the remote
program builds; write_outputs is fed a fake remote payload.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_grants as eg  # noqa: E402

FED_ELECTIONS = eg.ELECTIONS["federal"]
QLD_ELECTIONS = eg.ELECTIONS["qld"]
FED_GOV = eg.GOVERNMENT["federal"]

KENNEDY = [["Bob Katter", "Katter's Australian Party", "1967-02-21", None],
           ["G FRANCIS", "NAT", "1926-01-20", "1929-09-10"]]
MELBOURNE = [["Sarah Witty", "Labor", None, None], ["Adam Bandt", "Greens", "2010-09-29", "2025-03-26"]]
DICKSON = [["Peter Dutton", "Liberal", "2001-11-10", "2025-05-03"], ["Ali France", "Labor", "2025-05-03", None]]
GRAYNDLER = [["Anthony Albanese", "Labor", "1996-03-02", None]]
SEATS = {"Kennedy": KENNEDY, "Melbourne": MELBOURNE, "Dickson": DICKSON, "Grayndler": GRAYNDLER}
BASS = [["Jess Teesdale", "Labor", None, None], ["Ross Hart", "Labor", "2016-09-01", "2026-05-28"],
        ["Bridget Archer", "Liberal", "1907-07-04", "2026-05-26"], ["Andrew Nikolic", "Liberal", "2013-11-13", "2016-05-05"]]
ASTON = [["Mary Doyle", "Labor", "1973-03-06", None], ["Alan Tudge", "Liberal", "2010-10-26", "2023-02-09"]]
SEATS["Bass"] = BASS
SEATS["Aston"] = ASTON
MARGINS = {
    "Kennedy": {"2019": [13.33, "KAP", "safe", "qld", "Bob KATTER"], "2022": [13.1, "KAP", "safe", "qld", "Bob KATTER"]},
    "Dickson": {"2019": [4.64, "Liberal", "fairly_safe", "qld", "Peter DUTTON"], "2022": [1.7, "Liberal", "marginal", "qld", "Peter DUTTON"]},
    "Melbourne": {"2019": [21.83, "Greens", "safe", "vic", "Adam BANDT"], "2022": [10.15, "Greens", "safe", "vic", "Adam BANDT"]},
    "Bass": {"2019": [0.4, "Liberal", "marginal", "tas", "Bridget ARCHER"], "2022": [1.4, "Liberal", "marginal", "tas", "Bridget Kathleen ARCHER"]},
    "Aston": {"2019": [10.1, "Liberal", "safe", "vic", "Alan TUDGE"], "2022": [2.8, "Liberal", "marginal", "vic", "Alan TUDGE"]},
    "Wills": {"2022": [8.6, "A.L.P.", "safe", "vic", "Peter KHALIL"]},
}
CURRENT = {"Melbourne": ["Sarah Witty", "Labor"], "Bass": ["Jess Teesdale", "Labor"], "Dickson": ["Ali France", "Labor"],
           "Aston": ["Mary Doyle", "Labor"]}
RECIPS = {
    "abn:97694995462": {"canonical_name": "The Trustee for the Qantas Foundation Memorial Trust", "kind": "trust", "donor_entity_id": None},
    "abn:1": {"canonical_name": "Donor Pty Ltd", "kind": "company", "donor_entity_id": "e1"},
}


def grant(**kw):
    g = {"id": "GA1", "rid": "abn:97694995462", "v": 100.0, "n": "Title", "ag": "Dept", "pr": "Prog", "go": "GO1",
         "cat": "Cat", "fy": "2018-19", "s": "2019-02-12", "e": None, "adhoc": 0, "sel": None, "el": None, "elst": None,
         "abn": None, "raw": "Raw name", "guid": None, "a": None, "pbs": None}
    g.update(kw)
    return g


def ctx(jur="federal"):
    return {"recips": RECIPS, "seat_members": SEATS, "margins": MARGINS, "current_seats": CURRENT, "blocs": eg.BLOCS,
            "government": eg.GOVERNMENT[jur], "elections": eg.ELECTIONS[jur],
            "agency_label": lambda a: a or "Agency not recorded", "generated": "2026-09-13T00:00:00Z"}


class KeyTests(unittest.TestCase):
    def test_go_id_lowercases(self):
        self.assertEqual(eg.program_key("GO3141"), "go3141")

    def test_fallback_activity_id_slugs(self):
        self.assertEqual(eg.program_key("activity:Some title"), "activity-some-title")
        self.assertEqual(eg.program_key("activity:  Indigenous  Comprehensive Primary Health Care "), "activity-indigenous-comprehensive-primary-health-care")

    def test_qld_program_name_punctuation_and_length(self):
        self.assertEqual(eg.program_key("Surgery Connect - Surge 10,000"), "surgery-connect-surge-10-000")
        long = "A" * 79 + "-" + "B" * 20
        self.assertEqual(eg.program_key(long), "a" * 79)
        self.assertLessEqual(len(eg.program_key("x" * 200)), 80)
        self.assertEqual(eg.program_key(""), "x")


class DateTests(unittest.TestCase):
    def test_iso_day_rejects_junk(self):
        self.assertEqual(eg.iso_day("2019-02-12"), "2019-02-12")
        self.assertEqual(eg.iso_day("2019-02-12T10:00:00"), "2019-02-12")
        self.assertIsNone(eg.iso_day("unknown"))
        self.assertIsNone(eg.iso_day("#" * 30))
        self.assertIsNone(eg.iso_day(None))
        self.assertIsNone(eg.iso_day(""))


class HolderTests(unittest.TestCase):
    def test_open_ended_member_spans_today(self):
        self.assertEqual(eg.holder_at(KENNEDY, "2019-02-12")[0], "Bob Katter")
        self.assertEqual(eg.holder_at(KENNEDY, "2011-01-01")[0], "Bob Katter")

    def test_change_of_member_on_election_day(self):
        self.assertEqual(eg.holder_at(DICKSON, "2025-05-02")[0], "Peter Dutton")
        self.assertEqual(eg.holder_at(DICKSON, "2025-05-03")[0], "Ali France")   # the later entrant wins the shared day
        self.assertEqual(eg.holder_at(DICKSON, "2026-01-01")[0], "Ali France")

    def test_undated_member_only_after_the_dated_ones_left(self):
        self.assertEqual(eg.holder_at(MELBOURNE, "2024-06-01")[0], "Adam Bandt")
        self.assertEqual(eg.holder_at(MELBOURNE, "2025-07-01")[0], "Sarah Witty")

    def test_nobody(self):
        self.assertIsNone(eg.holder_at(KENNEDY, None))
        self.assertIsNone(eg.holder_at(None, "2019-02-12"))
        self.assertIsNone(eg.holder_at([["X", "Labor", "2020-01-01", "2021-01-01"]], "2019-02-12"))
        self.assertIsNone(eg.holder_at([["X", "Labor", None, "unknown"]], "2019-02-12"))


class SeatHolderTests(unittest.TestCase):
    """The layered rule: election winners for the 2019 and 2022 terms, by-elections,
    the current roster after May 2025, service dates before May 2019."""

    def hold(self, seat, day):
        return eg.seat_holder(seat, day, SEATS, MARGINS, CURRENT)

    def test_recorded_winner_beats_bad_roster_dates(self):
        # Bass: the roster has Ross Hart sitting until 2026 and Bridget Archer since 1907
        self.assertEqual(self.hold("Bass", "2020-06-01"), ["Bridget Archer", "Liberal"])   # roster spelling, same person
        self.assertEqual(self.hold("Bass", "2024-06-01"), ["Bridget Archer", "Liberal"])
        self.assertEqual(self.hold("Bass", "2018-06-01"), ["Ross Hart", "Labor"])        # pre-2019: roster dates

    def test_by_election_in_the_term(self):
        self.assertEqual(self.hold("Aston", "2023-03-31"), ["Alan Tudge", "Liberal"])
        self.assertEqual(self.hold("Aston", "2023-04-01"), ["Mary Doyle", "Labor"])
        self.assertEqual(self.hold("Aston", "2025-01-01"), ["Mary Doyle", "Labor"])

    def test_current_roster_after_the_last_election(self):
        self.assertEqual(self.hold("Dickson", "2025-05-03"), ["Ali France", "Labor"])
        self.assertEqual(self.hold("Bass", "2025-08-01"), ["Jess Teesdale", "Labor"])
        self.assertEqual(self.hold("Melbourne", "2025-05-02"), ["Adam Bandt", "Greens"])
        self.assertEqual(eg.seat_holder("Grayndler", "2025-08-01", SEATS, MARGINS, {}), ["Anthony Albanese", "Labor"])   # no current row: roster

    def test_winner_without_a_roster_match_is_prettified_and_party_canonical(self):
        self.assertEqual(self.hold("Wills", "2023-01-01"), ["Peter Khalil", "Labor"])   # A.L.P. -> Labor, no roster rows
        self.assertEqual(eg.pretty_name("Michelle ANANDA-RAJAH"), "Michelle Ananda-Rajah")
        self.assertEqual(eg.pretty_name("Shayne Kenneth NEUMANN"), "Shayne Neumann")
        self.assertEqual(eg.canonical_party("ALP"), "Labor")
        self.assertEqual(eg.canonical_party("Queensland Greens"), "Greens")
        self.assertEqual(eg.canonical_party("Liberal"), "Liberal")
        self.assertIsNone(eg.canonical_party(None))

    def test_roster_where_no_table_has_a_row(self):
        self.assertEqual(self.hold("Kennedy", "2019-02-12"), ["Bob Katter", "Katter's Australian Party"])
        self.assertEqual(self.hold("Kennedy", "2021-02-12"), ["Bob Katter", "Katter's Australian Party"])   # winner "Bob KATTER" = roster
        self.assertEqual(self.hold("Grayndler", "2023-01-01"), ["Anthony Albanese", "Labor"])
        self.assertIsNone(self.hold("Nowhere", "2023-01-01"))
        self.assertIsNone(self.hold("Kennedy", None))


# The electorates release's dated party periods (seat_periods_from_release), as the
# service records write them: a term split where the member changed party.
PERIODS = {
    # Joyce: disqualified 27 Oct 2017, re-elected at the 2 Dec 2017 by-election; Nationals to
    # 27 Nov 2025, independent for eleven days, One Nation from 8 Dec 2025.
    "new england": [["2013-09-07", "2017-10-27", "Barnaby Joyce", "Nationals"], ["2017-12-02", "2025-11-27", "Barnaby Joyce", "Nationals"],
                    ["2025-11-27", "2025-12-08", "Barnaby Joyce", "Independent"], ["2025-12-08", None, "Barnaby Joyce", "One Nation"]],
    # Calare: John Cobb retired at the 2016 dissolution (9 May); Gee from polling day, 2 Jul 2016.
    "calare": [["2007-11-24", "2016-05-09", "John Cobb", "Nationals"], ["2016-07-02", "2022-12-23", "Andrew Gee", "Nationals"],
               ["2022-12-23", None, "Andrew Gee", "Independent"]],
    # Capricornia: the records put the LNP member in the Nationals party room; the roster says LNP.
    "capricornia": [["2013-09-07", None, "Michelle Landry", "Nationals"]],
    # Flinders: the roster's dates for Hunt are wrong (it has his successor from 2019); the records are right.
    "flinders": [["2001-11-10", "2022-04-11", "Gregory Andrew Hunt", "Liberal"], ["2022-05-21", None, "Zoe McKenzie", "Liberal"]],
    # Goodenough: the records end the Liberal period on 31 Dec 2024 and start the independent one on 1 Jan 2025.
    "moore": [["2013-09-07", "2024-12-31", "Ian Goodenough", "Liberal"], ["2025-01-01", "2025-05-03", "Ian Goodenough", "Independent"],
              ["2025-05-03", None, "Tom French", "Labor"]],
    # Dunkley: vacant from Peta Murphy's death on 15 Dec 2023 to the 2 Mar 2024 by-election.
    "dunkley": [["2019-05-18", "2023-12-15", "Peta Jane Murphy", "Labor"], ["2024-03-02", None, "Jodie Belyea", "Labor"]],
    "mcpherson": [["2019-05-18", "2025-05-03", "Karen Andrews", "LNP"], ["2025-05-03", None, "Leon Rebello", "LNP"]],
    # Katter: Nationals from 1993, independent from July 2001, his own party from 2011.
    "kennedy": [["1993-03-13", "2001-07-09", "Robert Carl Katter", "Nats"], ["2001-07-09", "2011-09-27", "Robert Carl Katter", "Independent"],
                ["2011-09-27", None, "Robert Carl Katter", "Katter's Australian Party"]],
}
# The roster as the members table has it: one row per member, today's party.
PARTY_SEATS = dict(SEATS, **{
    "New England": [["Barnaby Joyce", "One Nation", "2017-12-02", None]],
    "Calare": [["Andrew Gee", "Independent", "2016-07-02", None]],
    "Capricornia": [["Michelle Landry", "LNP", "2013-09-07", None]],
    "Flinders": [["Greg Hunt", "Liberal", "2001-11-10", "2019-01-01"], ["Zoe McKenzie", "Liberal", "2019-01-01", None]],
    "Moore": [["Ian Goodenough", "Independent", "2013-09-07", "2025-05-03"], ["Tom French", "Labor", "2025-05-03", None]],
})
PARTY_MARGINS = dict(MARGINS, **{
    "New England": {"2019": [15.7, "NP", "safe", "nsw", "Barnaby JOYCE"], "2022": [16.4, "NP", "safe", "nsw", "Barnaby JOYCE"]},
    "Calare": {"2019": [13.3, "NP", "safe", "nsw", "Andrew GEE"], "2022": [12.3, "NP", "safe", "nsw", "Andrew GEE"]},
    "Moore": {"2019": [11.6, "Liberal", "safe", "wa", "Ian GOODENOUGH"], "2022": [0.7, "Liberal", "marginal", "wa", "Ian GOODENOUGH"]},
})


class PartyOnTheDayTests(unittest.TestCase):
    """A member who changed party is filed under the party they held on the grant date."""

    def hold(self, seat, day, periods=PERIODS):
        return eg.seat_holder(seat, day, PARTY_SEATS, PARTY_MARGINS, CURRENT, periods)

    def bloc(self, seat, day):
        h = self.hold(seat, day)
        return eg.bloc_for(h[1] if h else None, day, eg.BLOCS, FED_GOV) if h else "unknown"

    def test_the_roster_alone_files_joyce_under_one_nation(self):
        # The defect this layer fixes: without the release, the 2019 winner is the roster's member,
        # so the roster's party (today's) is returned for a 2021 grant.
        self.assertEqual(self.hold("New England", "2021-06-01", periods=None), ["Barnaby Joyce", "One Nation"])

    def test_joyce_bbrf_2020_22_is_coalition(self):
        for day in ("2020-11-02", "2021-06-01", "2022-03-25"):
            self.assertEqual(self.hold("New England", day), ["Barnaby Joyce", "Nationals"], day)
            self.assertEqual(self.bloc("New England", day), "gov", day)          # the Coalition governed until 23 May 2022
        self.assertEqual(self.bloc("New England", "2023-06-01"), "opp")           # Nationals under Labor
        self.assertEqual(self.hold("New England", "2025-12-01"), ["Barnaby Joyce", "Independent"])
        self.assertEqual(self.hold("New England", "2026-03-01"), ["Barnaby Joyce", "One Nation"])
        self.assertEqual(self.bloc("New England", "2026-03-01"), "cross")
        self.assertIsNone(self.hold("New England", "2017-11-15"), "disqualified: vacant until the by-election")

    def test_gee_changes_party_on_23_december_2022(self):
        self.assertEqual(self.hold("Calare", "2021-03-01"), ["Andrew Gee", "Nationals"])
        self.assertEqual(self.bloc("Calare", "2021-03-01"), "gov")
        self.assertEqual(self.bloc("Calare", "2022-06-01"), "opp")
        self.assertEqual(self.hold("Calare", "2022-12-22"), ["Andrew Gee", "Nationals"])
        self.assertEqual(self.hold("Calare", "2022-12-23"), ["Andrew Gee", "Independent"])
        self.assertEqual(self.bloc("Calare", "2023-03-01"), "cross")

    def test_goodenough_liberal_until_2025(self):
        self.assertEqual(self.hold("Moore", "2024-02-21"), ["Ian Goodenough", "Liberal"])   # the PCIP Alkimos grant
        self.assertEqual(self.bloc("Moore", "2024-02-21"), "opp")
        self.assertEqual(self.hold("Moore", "2024-12-31"), ["Ian Goodenough", "Liberal"], "a next-day change is not a vacancy")
        self.assertEqual(self.hold("Moore", "2025-02-01"), ["Ian Goodenough", "Independent"])
        self.assertEqual(self.hold("Moore", "2025-06-01"), ["Tom French", "Labor"])

    def test_vacancy_holds_nothing(self):
        self.assertEqual(self.hold("Dunkley", "2023-12-14"), ["Peta Murphy", "Labor"])   # no roster row: prettified
        self.assertIsNone(self.hold("Dunkley", "2024-01-10"))
        self.assertEqual(self.hold("Dunkley", "2024-04-01"), ["Jodie Belyea", "Labor"])

    def test_names_keep_the_roster_spelling_and_parties_are_canonical(self):
        self.assertEqual(self.hold("Kennedy", "2000-06-01"), ["Bob Katter", "Nationals"])     # "Nats"; roster spelling kept
        self.assertEqual(self.hold("Kennedy", "2021-02-12"), ["Bob Katter", "Katter's Australian Party"])
        self.assertEqual(self.hold("Mcpherson", "2021-02-12"), ["Karen Andrews", "LNP"])     # the grants' spelling of McPherson
        self.assertEqual(eg.canonical_party("Nats"), "Nationals")
        self.assertEqual(eg.canonical_party("CA"), "Centre Alliance")

    def test_the_campaign_after_a_dissolution_stays_with_the_last_member(self):
        self.assertEqual(self.hold("Calare", "2016-06-15"), ["John Cobb", "Nationals"])   # retired, but the seat is his until polling day
        self.assertEqual(self.bloc("Calare", "2016-06-15"), "gov")
        self.assertEqual(self.hold("Calare", "2016-07-02"), ["Andrew Gee", "Nationals"])

    def test_same_person_same_bloc_keeps_the_label_the_page_had(self):
        self.assertEqual(self.hold("Capricornia", "2021-01-01"), ["Michelle Landry", "LNP"])
        self.assertEqual(self.hold("New England", "2021-06-01"), ["Barnaby Joyce", "Nationals"])   # One Nation -> Nationals: bloc changes

    def test_a_wrong_roster_member_gives_way_to_the_records_in_the_roster_spelling(self):
        self.assertEqual(self.hold("Flinders", "2019-03-21"), ["Greg Hunt", "Liberal"])

    def test_no_period_for_the_day_falls_back_to_the_older_rules(self):
        self.assertEqual(self.hold("Bass", "2020-06-01"), ["Bridget Archer", "Liberal"])
        self.assertEqual(self.hold("Aston", "2023-04-01"), ["Mary Doyle", "Labor"])

    def test_program_file_files_joyce_bbrf_grants_as_coalition(self):
        c = dict(ctx(), seat_members=PARTY_SEATS, margins=PARTY_MARGINS, seat_periods=PERIODS)
        gs = [grant(id="GA10", v=5000000.0, s="2021-06-01", el="New England", elst="nsw", fy="2020-21"),
              grant(id="GA11", v=2376000.0, s="2022-03-25", el="New England", elst="nsw", fy="2021-22"),
              grant(id="GA12", v=1938911.0, s="2021-12-01", el="Calare", elst="nsw", fy="2021-22"),
              grant(id="GA13", v=100.0, s="2023-03-01", el="Calare", elst="nsw", fy="2022-23")]
        pf = eg.build_program_file("GO4504", "go4504", "federal", gs, c)
        self.assertEqual(pf["seats"], {"gov": [9314911, 3], "opp": [0, 0], "cross": [100, 1], "unknown": [0, 0]})
        ne = next(e for e in pf["electorates"] if e["n"] == "New England")
        self.assertEqual(ne["holders"], [["Barnaby Joyce", "Nationals", 7376000]])
        self.assertEqual((ne["gov"], ne["cross"]), (7376000, 0))
        by_id = {g["id"]: g for g in pf["grants"]}
        self.assertEqual((by_id["GA10"]["holder"], by_id["GA10"]["bloc"]), (["Barnaby Joyce", "Nationals"], "gov"))
        self.assertEqual((by_id["GA13"]["holder"], by_id["GA13"]["bloc"]), (["Andrew Gee", "Independent"], "cross"))
        self.assertEqual(eg.program_index_extras(pf, "federal")["gov"], 9314911)
        old = eg.build_program_file("GO4504", "go4504", "federal", gs, dict(c, seat_periods=None))
        self.assertEqual(old["seats"]["gov"], [0, 0], "without the release every one of these was crossbench")

    def test_seat_periods_from_release(self):
        with tempfile.TemporaryDirectory() as tmp:
            pub = Path(tmp)
            (pub / "electorates" / "r").mkdir(parents=True)
            (pub / "electorates" / "manifest.json").write_text(json.dumps({"index_url": "/electorates/r/index.json"}))
            (pub / "electorates" / "r" / "index.json").write_text(json.dumps({"electorates": [
                {"jurisdiction": "federal", "chamber": "representatives", "detail_url": "/electorates/r/casey.json"},
                {"jurisdiction": "federal", "chamber": "representatives", "detail_url": "/electorates/r/fisher.json"},
                {"jurisdiction": "federal", "chamber": "representatives", "detail_url": "/electorates/r/ne.json"},
                {"jurisdiction": "nsw", "chamber": "assembly", "detail_url": "/electorates/r/state.json"},
                {"jurisdiction": "federal", "chamber": "representatives", "detail_url": "/electorates/r/missing.json"}]}))
            (pub / "electorates" / "r" / "ne.json").write_text(json.dumps({"name": "New England",
                "people": {"p1": {"name": "Barnaby Joyce"}, "p0": {"name": "Ian Sinclair"}},
                "terms": [{"person_id": "p1", "party_periods": [{"party": "One Nation", "start": "2025-12-08", "end": None},
                                                                {"party": "Nationals", "start": "2017-12-02", "end": "2025-11-27"}]},
                          {"person_id": "p0", "party_periods": [{"party": "Nationals", "start": "1963-11-30", "end": "1998-10-03"}]}]}))
            # Speakers: Tony Smith (Liberal before and after the Chair); Peter Slipper, who left the Liberals when he took it.
            (pub / "electorates" / "r" / "casey.json").write_text(json.dumps({"name": "Casey", "people": {"s": {"name": "ANTHONY SMITH"}}, "terms": [
                {"person_id": "s", "start": "2001-11-10", "end": "2015-08-10", "party_periods": [{"party": "Liberal", "start": "2001-11-10", "end": "2015-08-10"}], "source_party_label": "LIB"},
                {"person_id": "s", "start": "2015-08-10", "end": "2021-11-23", "party_periods": [], "source_party_label": "SPK"},
                {"person_id": "s", "start": "2021-11-23", "end": "2022-05-21", "party_periods": [{"party": "Liberal", "start": "2021-11-23", "end": "2022-05-21"}], "source_party_label": "LIB"}]}))
            (pub / "electorates" / "r" / "fisher.json").write_text(json.dumps({"name": "Fisher", "people": {"p": {"name": "Peter Slipper"}}, "terms": [
                {"person_id": "p", "start": "1993-03-13", "end": "2011-11-24", "party_periods": [{"party": "Liberal", "start": "1993-03-13", "end": "2011-11-24"}], "source_party_label": "LIB"},
                {"person_id": "p", "start": "2011-11-24", "end": "2012-10-09", "party_periods": [], "source_party_label": "SPK"},
                {"person_id": "p", "start": "2012-10-09", "end": "2013-09-07", "party_periods": [{"party": "Independent", "start": "2012-10-09", "end": "2013-09-07"}], "source_party_label": "IND"}]}))
            periods = eg.seat_periods_from_release(pub)
            self.assertEqual(periods["casey"], [["2001-11-10", "2015-08-10", "ANTHONY SMITH", "Liberal"], ["2015-08-10", "2021-11-23", "ANTHONY SMITH", "Liberal"],
                                                ["2021-11-23", "2022-05-21", "ANTHONY SMITH", "Liberal"]])
            self.assertEqual(periods["fisher"][1], ["2011-11-24", "2012-10-09", "Peter Slipper", "Independent"])
            self.assertEqual(eg.seat_holder("Casey", "2019-06-01", {}, {}, {}, periods), ["Anthony Smith", "Liberal"], "a Speaker's seat is not vacant")
            del periods["casey"], periods["fisher"]
            self.assertEqual(periods, {"new england": [
                ["2017-12-02", "2025-11-27", "Barnaby Joyce", "Nationals"], ["2025-12-08", None, "Barnaby Joyce", "One Nation"]]})
            self.assertEqual(eg.seat_periods_from_release(pub / "nowhere"), {})
        real = eg.seat_periods_from_release(eg.ROOT / "portal" / "public")
        if real:   # the release is in the repo; guard for a checkout without portal data
            self.assertIn("new england", real)
            self.assertEqual(eg.seat_holder("New England", "2021-06-01", {}, {}, {}, real), ["Barnaby Joyce", "Nationals"])
            self.assertEqual(eg.seat_holder("Calare", "2023-03-01", {}, {}, {}, real)[1], "Independent")
            self.assertEqual(eg.seat_holder("Moore", "2024-02-21", {}, {}, {}, real)[1], "Liberal")
            self.assertEqual(eg.seat_holder("Casey", "2019-06-01", {}, {}, {}, real)[1], "Liberal")      # Speaker Tony Smith
            self.assertEqual(eg.BLOCS[eg.seat_holder("Fisher", "2022-03-01", {}, {}, {}, real)[1]], "Coalition")   # Speaker Andrew Wallace
            self.assertEqual(eg.seat_holder("Oxley", "2024-03-01", {}, {}, {}, real)[1], "Labor")        # Speaker Milton Dick
            self.assertIsNone(eg.seat_holder("Perth", "2018-06-01", {}, {}, {}, real), "vacant: resignation to the by-election")
            self.assertEqual(eg.seat_holder("Calare", "2016-06-15", {}, {}, {}, real)[0:2], ["John Cobb", "Nationals"])


class BlocTests(unittest.TestCase):
    def test_government_of_the_day(self):
        self.assertEqual(eg.bloc_for("Liberal", "2019-02-12", eg.BLOCS, FED_GOV), "gov")
        self.assertEqual(eg.bloc_for("Nationals", "2019-02-12", eg.BLOCS, FED_GOV), "gov")
        self.assertEqual(eg.bloc_for("LNP", "2021-10-06", eg.BLOCS, FED_GOV), "gov")
        self.assertEqual(eg.bloc_for("Labor", "2019-02-12", eg.BLOCS, FED_GOV), "opp")

    def test_flips_at_the_change_of_government(self):
        self.assertEqual(eg.bloc_for("Labor", "2022-05-23", eg.BLOCS, FED_GOV), "gov")
        self.assertEqual(eg.bloc_for("Liberal", "2022-05-23", eg.BLOCS, FED_GOV), "opp")
        self.assertEqual(eg.bloc_for("Labor", "2022-05-22", eg.BLOCS, FED_GOV), "opp")

    def test_crossbench(self):
        self.assertEqual(eg.bloc_for("Greens", "2019-02-12", eg.BLOCS, FED_GOV), "cross")
        self.assertEqual(eg.bloc_for("Katter's Australian Party", "2019-02-12", eg.BLOCS, FED_GOV), "cross")
        self.assertEqual(eg.bloc_for("Independent", "2023-01-01", eg.BLOCS, FED_GOV), "cross")

    def test_unknown(self):
        self.assertEqual(eg.bloc_for(None, "2019-02-12", eg.BLOCS, FED_GOV), "unknown")
        self.assertEqual(eg.bloc_for("Labor", None, eg.BLOCS, FED_GOV), "unknown")
        self.assertEqual(eg.bloc_for("Labor", "2012-01-01", eg.BLOCS, FED_GOV), "unknown")   # before the government table starts


class MarginTests(unittest.TestCase):
    def test_latest_prior_election_with_a_row(self):
        self.assertEqual(eg.margin_type_for(MARGINS["Dickson"], "2019-06-01", FED_ELECTIONS), "fairly_safe")
        self.assertEqual(eg.margin_type_for(MARGINS["Dickson"], "2022-05-21", FED_ELECTIONS), "marginal")
        self.assertEqual(eg.margin_type_for(MARGINS["Dickson"], "2026-01-01", FED_ELECTIONS), "marginal")   # no 2025 row: 2022 stands

    def test_pre_2019_grant_has_no_margin(self):
        self.assertIsNone(eg.margin_type_for(MARGINS["Kennedy"], "2019-02-12", FED_ELECTIONS))
        self.assertIsNone(eg.margin_type_for(MARGINS["Kennedy"], "2019-05-17", FED_ELECTIONS))
        self.assertEqual(eg.margin_type_for(MARGINS["Kennedy"], "2019-05-18", FED_ELECTIONS), "safe")
        self.assertIsNone(eg.margin_type_for(None, "2023-01-01", FED_ELECTIONS))
        self.assertIsNone(eg.margin_type_for(MARGINS["Kennedy"], None, FED_ELECTIONS))


class ElectionTimingTests(unittest.TestCase):
    def test_buckets(self):
        b = lambda d: eg.months_to_election_bucket(d, FED_ELECTIONS)
        self.assertEqual(b("2019-05-18"), "0_3")     # election day
        self.assertEqual(b("2019-03-01"), "0_3")
        self.assertEqual(b("2019-01-01"), "3_6")
        self.assertEqual(b("2018-09-01"), "6_12")
        self.assertEqual(b("2018-01-01"), "12_24")
        self.assertEqual(b("2016-07-03"), "over_24")  # the day after one election, 34 months to the next
        self.assertEqual(b("2012-01-01"), "12_24")    # before the first listed election: 20 months to Sept 2013
        self.assertEqual(b("2011-01-01"), "over_24")

    def test_after_the_last_election_is_unknown(self):
        self.assertEqual(eg.months_to_election_bucket("2025-05-04", FED_ELECTIONS), "unknown")
        self.assertEqual(eg.months_to_election_bucket("2025-05-03", FED_ELECTIONS), "0_3")
        self.assertEqual(eg.months_to_election_bucket(None, FED_ELECTIONS), "unknown")
        self.assertEqual(eg.months_to_election_bucket("2019-02-30", FED_ELECTIONS), "unknown")

    def test_qld_uses_its_own_list(self):
        self.assertEqual(eg.months_to_election_bucket("2024-10-01", QLD_ELECTIONS), "0_3")
        self.assertEqual(eg.months_to_election_bucket("2024-11-01", QLD_ELECTIONS), "unknown")
        self.assertEqual(eg.months_to_election_bucket("2024-11-01", FED_ELECTIONS), "6_12")


class ApprovalTests(unittest.TestCase):
    def test_buckets(self):
        self.assertEqual(eg.approval_bucket("2019-02-12", "2019-02-12"), "0_30")
        self.assertEqual(eg.approval_bucket("2019-03-14", "2019-02-12"), "0_30")
        self.assertEqual(eg.approval_bucket("2019-03-15", "2019-02-12"), "31_90")
        self.assertEqual(eg.approval_bucket("2019-05-13", "2019-02-12"), "31_90")
        self.assertEqual(eg.approval_bucket("2019-05-14", "2019-02-12"), "91_365")
        self.assertEqual(eg.approval_bucket("2020-02-12", "2019-02-12"), "91_365")
        self.assertEqual(eg.approval_bucket("2020-02-13", "2019-02-12"), "over_365")
        self.assertEqual(eg.approval_bucket("2022-02-03", "2021-10-29"), "91_365")

    def test_before_approval_and_missing(self):
        self.assertEqual(eg.approval_bucket("2019-02-11", "2019-02-12"), "before_approval")
        self.assertIsNone(eg.approval_bucket(None, "2019-02-12"))
        self.assertIsNone(eg.approval_bucket("2019-02-12", None))
        self.assertIsNone(eg.approval_bucket("2019-02-30", "2019-02-12"))


class ProgramFileTests(unittest.TestCase):
    def federal_grants(self):
        return [
            grant(id="GA34203", v=11300000.0, s="2019-02-12", a="2019-02-12", sel="Closed Non-Competitive", el="Kennedy", elst="qld",
                  pbs="ITRDCSA 18/19 3.1: Regional Development", guid="abc"),
            grant(id="GA2", v=500.0, s="2022-02-03", a="2021-10-29", sel="Closed Non-Competitive", el="Dickson", elst="qld", rid="abn:1", cat="Sport"),
            grant(id="GA3", v=200.0, s="2023-01-10", a=None, sel="Open Competitive", el="Grayndler", elst="nsw", fy="2022-23"),
            grant(id="GA4", v=50.0, s="2021-06-01", sel=None, el="Melbourne", elst="vic", fy="2020-21", adhoc=1),
            grant(id="GA5", v=25.0, s=None, a=None, el=None, rid=None, raw="Withheld Co", fy="2024-25"),
            grant(id="GA6", v=10.0, s="2025-06-01", a="2025-01-01", el="Melbourne", elst="vic", fy="2024-25"),
        ]

    def test_federal_file(self):
        pf = eg.build_program_file("GO3141", "go3141", "federal", self.federal_grants(), ctx())
        self.assertEqual((pf["id"], pf["key"], pf["jur"], pf["n"]), ("GO3141", "go3141", "federal", "Prog"))
        self.assertEqual((pf["t"], pf["c"], pf["r"], pf["dt"], pf["dr"], pf["adhoc"]), (11300785, 6, 3, 500, 1, 50))
        self.assertEqual((pf["y0"], pf["y1"]), ("2018-19", "2024-25"))
        self.assertEqual(pf["agencies"], [["Dept", 11300785]])
        self.assertEqual(pf["cats"][0], ["Cat", 11300285])
        self.assertEqual(pf["pbs"], [["ITRDCSA 18/19 3.1: Regional Development", 11300000]])
        self.assertEqual(pf["sel"], {"Closed Non-Competitive": [11300500, 2], "Open Competitive": [200, 1]})
        self.assertEqual(pf["sel_known"], [11300700, 3])
        self.assertEqual(pf["by"]["2018-19"], [11300500, 2])
        self.assertEqual(pf["el_known"], [11300760, 5])
        # seats: Kennedy is crossbench (KAP); Dickson 2022-02 Liberal under the Coalition = gov;
        # Grayndler 2023 Labor under Labor = gov; Melbourne 2021 Greens = cross but 2025-06 is Witty (Labor) = gov;
        # the undated grant = unknown
        self.assertEqual(pf["seats"], {"gov": [710, 3], "opp": [0, 0], "cross": [11300050, 2], "unknown": [25, 1]})
        self.assertEqual(sum(v[1] for v in pf["seats"].values()), pf["c"])
        # margins: GA34203 pre-May-2019 -> unknown; Dickson 2022-02 -> 2019 row fairly_safe; Grayndler no row -> unknown;
        # Melbourne 2021 -> 2019 safe, 2025 -> 2022 safe
        self.assertEqual(pf["margins"], {"marginal": [0, 0], "fairly_safe": [500, 1], "safe": [60, 2], "unknown": [11300225, 3]})
        self.assertEqual(pf["timing"]["approval_known"], [11300510, 3])
        self.assertEqual(pf["timing"]["approval_to_start_days"],
                         {"before_approval": [0, 0], "0_30": [11300000, 1], "31_90": [0, 0], "91_365": [510, 2], "over_365": [0, 0]})
        self.assertEqual(pf["timing"]["months_to_election"],
                         {"0_3": [0, 0], "3_6": [11300500, 2], "6_12": [50, 1], "12_24": [0, 0], "over_24": [200, 1], "unknown": [35, 2]})
        self.assertEqual([e["n"] for e in pf["electorates"]], ["Kennedy", "Dickson", "Grayndler", "Melbourne"])
        kennedy = pf["electorates"][0]
        self.assertEqual(kennedy, {"n": "Kennedy", "st": "qld", "t": 11300000, "c": 1, "gov": 0, "opp": 0, "cross": 11300000,
                                   "holders": [["Bob Katter", "Katter's Australian Party", 11300000]]})
        melbourne = pf["electorates"][3]
        self.assertEqual(melbourne["holders"], [["Adam Bandt", "Greens", 50], ["Sarah Witty", "Labor", 10]])
        self.assertEqual(pf["recipients"][0], ["abn:97694995462", "The Trustee for the Qantas Foundation Memorial Trust", "trust", 11300260, 4, False])
        self.assertEqual(pf["recipients"][1], ["abn:1", "Donor Pty Ltd", "company", 500, 1, True])
        self.assertEqual(pf["recipients"][2], [None, "Withheld Co", None, 25, 1, False])
        g0 = pf["grants"][0]
        self.assertEqual(g0, {"id": "GA34203", "v": 11300000, "n": "Title", "rid": "abn:97694995462",
                              "rn": "The Trustee for the Qantas Foundation Memorial Trust", "k": "trust", "fy": "2018-19",
                              "s": "2019-02-12", "a": "2019-02-12", "sel": "Closed Non-Competitive", "el": "Kennedy", "elst": "qld",
                              "holder": ["Bob Katter", "Katter's Australian Party"], "bloc": "cross", "mt": None, "adhoc": 0, "guid": "abc"})
        self.assertNotIn("desc", g0)
        undated = next(g for g in pf["grants"] if g["id"] == "GA5")
        self.assertEqual((undated["s"], undated["a"], undated["el"], undated["holder"], undated["bloc"], undated["mt"]),
                         (None, None, None, None, "unknown", None))
        self.assertEqual((pf["grants_total"], pf["grants_listed"], pf["generated"]), (6, 6, "2026-09-13T00:00:00Z"))
        self.assertEqual(eg.program_index_extras(pf, "federal"),
                         {"key": "go3141", "cnc": 11300500, "selk": 11300700, "gov": 710, "elk": 11300760, "marg": 0})

    def test_electorate_holders_collapse_one_member_with_two_party_spellings(self):
        gs = [grant(id="GA1", v=300.0, s="2020-01-01", el="Bass", elst="tas"),    # winner term: Bridget Archer, Liberal
              grant(id="GA2", v=100.0, s="2018-01-01", el="Bass", elst="tas")]    # roster: Ross Hart, Labor
        pf = eg.build_program_file("GO1", "go1", "federal", gs, ctx())
        self.assertEqual(pf["electorates"][0]["holders"], [["Bridget Archer", "Liberal", 300], ["Ross Hart", "Labor", 100]])
        seats = dict(SEATS)
        seats["Hinkler"] = [["Keith Pitt", "Nationals", "2013-11-14", "2023-03-28"], ["Paul Neville", "Nationals", "1998-03-02", "2026-06-04"]]
        margins = dict(MARGINS)
        margins["Hinkler"] = {"2022": [10.0, "Liberal", "safe", "qld", "Keith PITT"]}
        c = ctx(); c["seat_members"] = seats; c["margins"] = margins
        gs = [grant(id="GA1", v=300.0, s="2022-06-01", el="Hinkler", elst="qld"),   # roster: Pitt (Nationals)
              grant(id="GA2", v=100.0, s="2024-01-01", el="Hinkler", elst="qld")]   # roster: Neville; winner Pitt (Liberal)
        pf = eg.build_program_file("GO1", "go1", "federal", gs, c)
        self.assertEqual([g["holder"] for g in pf["grants"]], [["Keith Pitt", "Nationals"], ["Keith Pitt", "Liberal"]])
        self.assertEqual(pf["electorates"][0]["holders"], [["Keith Pitt", "Nationals", 400]])
        self.assertEqual(pf["seats"]["gov"], [0, 0])      # both after May 2022: a Coalition holder is opposition
        self.assertEqual(pf["seats"]["opp"], [400, 2])

    def test_approval_date_stands_in_for_a_missing_start(self):
        gs = [grant(id="GA1", s=None, a="2019-02-12", el="Kennedy", elst="qld")]
        pf = eg.build_program_file("GO1", "go1", "federal", gs, ctx())
        self.assertEqual(pf["grants"][0]["holder"], ["Bob Katter", "Katter's Australian Party"])
        self.assertEqual(pf["timing"]["months_to_election"]["3_6"], [100, 1])   # 12 Feb to 18 May 2019 is 3.1 months
        self.assertEqual(pf["timing"]["approval_to_start_days"]["0_30"], [0, 0])

    def test_grants_capped_and_sorted(self):
        gs = [grant(id=f"GA{i}", v=float(i)) for i in range(eg.PROGRAM_GRANTS_MAX + 5)]
        pf = eg.build_program_file("GO1", "go1", "federal", gs, ctx())
        self.assertEqual((pf["grants_total"], pf["grants_listed"], len(pf["grants"])),
                         (eg.PROGRAM_GRANTS_MAX + 5, eg.PROGRAM_GRANTS_MAX, eg.PROGRAM_GRANTS_MAX))
        self.assertEqual(pf["grants"][0]["v"], eg.PROGRAM_GRANTS_MAX + 4)

    def test_qld_null_rules(self):
        gs = [grant(id="qld-1", v=1000.0, s="2024-08-01", a=None, sel="Discretionary", el="Kennedy", elst="qld", go=None, pr="Prog",
                    pbs=None, guid=None, desc="A short description", fy="2024-25"),
              grant(id="qld-2", v=10.0, s="#" * 40, a=None, sel=None, el="Dickson", elst="qld", go=None, pr="Prog", fy="2024-25")]
        pf = eg.build_program_file("Prog", "prog", "qld", gs, ctx("qld"))
        self.assertEqual(pf["jur"], "qld")
        for k in ("pbs", "seats", "margins"):
            self.assertIn(k, pf)
            self.assertIsNone(pf[k])
        self.assertIsNone(pf["timing"]["approval_known"])
        self.assertIsNone(pf["timing"]["approval_to_start_days"])
        self.assertEqual(pf["timing"]["months_to_election"]["0_3"], [1000, 1])   # QLD election 2024-10-26
        self.assertEqual(pf["timing"]["months_to_election"]["unknown"], [10, 1])  # the junk date reads as no date
        self.assertEqual(pf["sel"], {"Discretionary": [1000, 1]})
        self.assertEqual(pf["sel_known"], [1000, 1])
        self.assertEqual(pf["electorates"][0], {"n": "Kennedy", "st": "qld", "t": 1000, "c": 1,
                                                "holders": [["Bob Katter", "Katter's Australian Party", 1000]]})
        self.assertNotIn("gov", pf["electorates"][0])
        self.assertEqual(pf["electorates"][1]["holders"], [])   # no date, no holder
        g0 = pf["grants"][0]
        self.assertEqual((g0["a"], g0["bloc"], g0["mt"], g0["guid"]), (None, None, None, None))
        self.assertNotIn("desc", g0, "program rows leave the QLD description to the recipient shard")
        self.assertEqual(g0["holder"], ["Bob Katter", "Katter's Australian Party"])
        self.assertIsNone(pf["grants"][1]["s"])
        self.assertEqual(eg.program_index_extras(pf, "qld"), {"key": "prog", "cnc": 0, "selk": 1000})


class WriteOutputsTests(unittest.TestCase):
    def test_program_files_written_and_stale_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            pdir = out / "grants" / "federal" / "programs"
            pdir.mkdir(parents=True)
            (pdir / "gone.json").write_text("{}")
            (out / "grants" / "federal" / "shard-99.json").write_text("{}")
            data = {"index": {"meta": {"counts": {"program_files": 1}}, "programs": [{"id": "GO1", "key": "go1"}]},
                    "details": {"shard-00": {"abn-1": {"id": "abn:1"}}},
                    "programs": {"go1": {"id": "GO1", "key": "go1", "grants": []}}}
            w = eg.write_outputs(data, out, "federal")
            self.assertEqual((w["program_files"], w["shards"], w["detail_files"], w["removed"]), (1, 1, 1, 2))
            self.assertEqual(sorted(p.name for p in pdir.glob("*.json")), ["go1.json"])
            self.assertEqual(sorted(p.name for p in (out / "grants" / "federal").glob("*.json")), ["shard-00.json"])
            self.assertEqual(json.loads((pdir / "go1.json").read_text())["id"], "GO1")
            self.assertEqual(json.loads((out / "graph" / "grants.federal.json").read_text())["programs"][0]["key"], "go1")


class RemoteProgramTests(unittest.TestCase):
    def test_streamed_program_carries_the_shared_rules_and_compiles(self):
        src = eg.remote_program({"Bass": ["Jess Teesdale", "Labor"]}, {"calare": [["2016-07-02", "2022-12-23", "Andrew Gee", "Nationals"]]})
        compile(src, "remote", "exec")
        compile(eg.remote_program(), "remote", "exec")
        for name in ("def build_program_file(", "def seat_holder(", "ELECTIONS = ", "GOVERNMENT = ", "BY_ELECTIONS = ",
                     "CURRENT_SEATS = {'Bass': ['Jess Teesdale', 'Labor']}",
                     "SEAT_PERIODS = {'calare': [['2016-07-02', '2022-12-23', 'Andrew Gee', 'Nationals']]}",
                     '"seat_periods": SEAT_PERIODS', "programs_out", "go_by_name"):
            self.assertIn(name, src)

    def test_current_seats_from_roster(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "parliamentarians.json"
            path.write_text(json.dumps({"people": [
                {"name": "Amanda Rishworth", "speeches": 900, "current": True, "party_now": "Labor",
                 "representation": [{"jurisdiction": "federal", "chamber": "representatives", "electorate": "Kingston"}]},
                {"name": "Kym Richardson", "speeches": 10, "current": True, "party_now": "Liberal",
                 "representation": [{"jurisdiction": "federal", "chamber": "representatives", "electorate": "Kingston"}]},
                {"name": "Ross Hart", "speeches": 100, "party": "Labor",
                 "representation": [{"jurisdiction": "federal", "chamber": "representatives", "electorate": "Bass"}]},
                {"name": "A Senator", "speeches": 100, "current": True, "party_now": "Labor",
                 "representation": [{"jurisdiction": "federal", "chamber": "senate", "electorate": "NSW"}]},
            ]}))
            self.assertEqual(eg.current_seats_from_roster(path), {"Kingston": ["Amanda Rishworth", "Labor"]})
            self.assertEqual(eg.current_seats_from_roster(Path(tmp) / "missing.json"), {})

    def test_shared_rules_are_plain_ascii(self):
        src = eg.remote_program()
        self.assertTrue(src.startswith("from __future__ import annotations"))
        shared = src[:src.index("JUR = sys.argv[1]")]
        self.assertTrue(shared.isascii())


if __name__ == "__main__":
    unittest.main()


class UnmangleTests(unittest.TestCase):
    def test_utf8_read_as_cp1252_comes_back(self):
        self.assertEqual(eg.unmangle("Australia\xe2\u20ac\u2122s native sorghums"), "Australia\u2019s native sorghums")
        self.assertEqual(eg.unmangle("The \xe2\u20ac\u0153New\xe2\u20ac\x9d Biochemistry"), "The \u201cNew\u201d Biochemistry")
        self.assertEqual(eg.unmangle("Smart\u2013Idler\xc2\xae"), "Smart\u2013Idler\xae")  # real dash kept, mangled sign fixed

    def test_the_byte_the_source_dropped(self):
        self.assertEqual(eg.unmangle("Innovative \xe2\u20ac\u0153Fruit Water\xe2\u20ac? Closed"), "Innovative \u201cFruit Water\u201d Closed")
        self.assertEqual(eg.unmangle("Metro Theatre \xe2\u20ac Revive 2021"), "Metro Theatre \u2013 Revive 2021")
        self.assertEqual(eg.unmangle("KNOWN\xe2\u20aca series of publications"), "KNOWN\u2014a series of publications")

    def test_twice_mangled_text(self):
        self.assertEqual(eg.unmangle("Determination of \xc3\xa2\xe2\u201a\xac\xc5\u201cactionable targets\xc3\xa2\xe2\u201a\xac\xc2\x9d for"),
                         "Determination of \u201cactionable targets\u201d for")

    def test_real_text_is_left_alone(self):
        for s in ("S\xe3o Tom\xe9", "Caf\xe9", "Se\xf1or", "plain ascii", "", None):
            self.assertEqual(eg.unmangle(s), s)


class ProgramNameTests(unittest.TestCase):
    def test_description_sentences_never_become_the_name(self):
        from collections import Counter
        names = Counter({"This is a demand-driven grant program that was announced by the Prime Minister on 3 August 2020.": 5,
                         "Disaster Recovery Funding Arrangements": 2})
        self.assertEqual(eg.program_name(names), "Disaster Recovery Funding Arrangements")
        self.assertEqual(eg.program_name(Counter({"Only a sentence.": 1})), "Only a sentence.")
        self.assertEqual(eg.program_name(Counter()), "")

    def test_a_stray_value_never_outranks_the_title_the_awards_agree_on(self):
        # GO4911: 1,946 awards carry the 103-character IFAM title and one register
        # row (GA184725) has its dollar value where the title belongs.
        from collections import Counter
        title = ("Temporary emergency mechanism to support international airfreight capacity "
                 "as part of COVID-19 response")
        self.assertEqual(eg.program_name(Counter({title: 1946, "$4,672.80": 1})), title)
        # A value never reads as a name, even when nothing else is on offer.
        self.assertEqual(eg.program_name(Counter({"$4,672.80": 5, title: 1})), title)
        self.assertEqual(eg.program_name(Counter({"12,000": 3, "Grant 12": 1})), "Grant 12")
        # A long title still yields to a real name, however rare (GO4117: 550
        # awards titled with a sentence, 11 detail pages naming the program).
        self.assertEqual(eg.program_name(Counter({title: 10, "Freight Assistance": 2})), "Freight Assistance")
        sentence = ("Provide financial support to local councils to deliver priority local road "
                    "and community infrastructure projects.")
        self.assertEqual(eg.program_name(Counter({sentence: 550, "Local Roads and Community Infrastructure Program": 33})),
                         "Local Roads and Community Infrastructure Program")

    def test_a_project_title_never_heads_a_program_of_many(self):
        # GO4286: 539 awards under 535 titles, two of them "Dark Mofo".
        from collections import Counter
        projects = Counter({f"Project {i}": 1 for i in range(537)})
        projects["Dark Mofo"] = 2
        self.assertEqual(eg.program_name(projects), "")
        # One fetched detail page names the program (weight 3) and settles it.
        projects["Restart Investment to Sustain and Expand (RISE) Fund"] = 3
        self.assertEqual(eg.program_name(projects), "Restart Investment to Sustain and Expand (RISE) Fund")
        # A small program keeps its only title.
        self.assertEqual(eg.program_name(Counter({"Regional Arts Fund": 1, "Other": 1})), "Regional Arts Fund")
