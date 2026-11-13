"""Dated parties for division rows the source leaves without one (scripts/vote_parties.py).

Every person, seat and source here is invented.
"""

import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import vote_parties as V  # noqa: E402

SPEC = importlib.util.spec_from_file_location("division_pages_for_parties", ROOT / "scripts/export_division_pages.py")
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)

LIST = "https://example.test/official-list"


def official(name, party, as_of, chamber="nsw_lc", aliases=()):
    return V.entry("official-list", chamber, ("name", V.fold(name)), [name, *aliases], party,
                   as_of, as_of, as_of, url=LIST, point=True)


def term(qid, name, party, start, end=None, through="2026-09-21", chamber="nsw_lc"):
    return V.entry("wikidata-term", chamber, ("wikidata", qid), [name], party, start, end,
                   None if end else through, url=f"https://www.wikidata.org/wiki/{qid}")


def service(name, party, start, end, chamber="nsw_lc"):
    return V.entry("service", chamber, ("name", V.fold(name)), [name], party, start, end, url=LIST)


def division(key, date, members, house="nsw_lc", jurisdiction="nsw"):
    return {"key": key, "slug": f"division-{key}", "date": date, "house": house, "jurisdiction": jurisdiction,
            "name": "Fixture motion", "question": "That the fixture be agreed to", "ayes": 0, "noes": 0,
            "result": "affirmative", "source_url": f"https://example.test/{key}", "bills": [],
            "members": [dict(m) for m in members], "_meta": {"schema": 1, "source": "fixture"}}


def row(name, vote="aye", pid=None):
    return {"name": name, "person_id": pid, "person_slug": D.person_slug(name), "vote": vote}


def fill(records, evidence):
    outcomes = list(V.resolve_records(records, evidence, apply=True))
    return {(o["record"]["key"], o["member"]["name"]): (o["party"], o["reason"]) for o in outcomes}


class SurnameRule(unittest.TestCase):
    def test_unique_surname_in_the_chamber_on_the_date_gets_a_party(self):
        evidence = [service("Quill Marbleton", "Example Labour", "2023-03-25", "2027-03-27"),
                    service("Ada Fernhill", "Example Greens", "2023-03-25", "2027-03-27")]
        records = [division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Marbleton"), row("Ada Fernhill", "no")])]
        got = fill(records, evidence)
        self.assertEqual(got[("nsw-lc-2026-05-01-1", "Marbleton")], ("Example Labour", "filled"))
        self.assertEqual(records[0]["members"][0]["party"], "Example Labour")
        self.assertEqual(records[0]["members"][0]["party_source"], {"basis": "service", "url": LIST})
        self.assertEqual(records[0]["_meta"]["party_fill"]["filled"], 2)

    def test_two_sitting_members_with_that_surname_stay_unknown(self):
        evidence = [service("Quill Marbleton", "Example Labour", "2023-03-25", "2027-03-27"),
                    service("Rosa Marbleton", "Example Liberal", "2023-03-25", "2027-03-27")]
        records = [division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Marbleton")])]
        self.assertEqual(fill(records, evidence)[("nsw-lc-2026-05-01-1", "Marbleton")], (None, "ambiguous-surname"))
        self.assertNotIn("party", records[0]["members"][0])

    def test_another_name_voting_that_day_with_the_surname_keeps_it_unknown(self):
        # The roster knows one Marbleton, but the chamber's own lists that day name two.
        evidence = [service("Quill Marbleton", "Example Labour", "2023-03-25", "2027-03-27")]
        records = [division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Marbleton")]),
                   division("nsw-lc-2026-05-01-2", "2026-05-01", [row("Tess Marbleton")])]
        self.assertEqual(fill(records, evidence)[("nsw-lc-2026-05-01-1", "Marbleton")], (None, "ambiguous-surname"))

    def test_a_namesake_in_another_chamber_does_not_count(self):
        evidence = [service("Quill Marbleton", "Example Labour", "2023-03-25", "2027-03-27"),
                    service("Rosa Marbleton", "Example Liberal", "2023-03-25", "2027-03-27", chamber="nsw_la")]
        records = [division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Marbleton")])]
        self.assertEqual(fill(records, evidence)[("nsw-lc-2026-05-01-1", "Marbleton")][0], "Example Labour")


class DatedParty(unittest.TestCase):
    def test_a_member_who_changed_party_gets_the_right_party_on_each_date(self):
        evidence = [service("Ivo Quarrington", "Example Labour", "2019-03-23", "2024-02-01"),
                    service("Ivo Quarrington", "Example Independents", "2024-02-01", "2027-03-27")]
        records = [division("nsw-lc-2023-06-01-1", "2023-06-01", [row("Ivo Quarrington")]),
                   division("nsw-lc-2024-01-31-1", "2024-01-31", [row("Ivo Quarrington")]),
                   division("nsw-lc-2024-02-01-1", "2024-02-01", [row("Ivo Quarrington")]),
                   division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington")])]
        fill(records, evidence)
        self.assertEqual([r["members"][0].get("party") for r in records],
                         ["Example Labour", "Example Labour", "Example Independents", "Example Independents"])

    def test_nothing_carries_forward_past_the_latest_evidence(self):
        evidence = [official("Ivo Quarrington", "Example Labour", "2026-09-25")]
        records = [division("nsw-lc-2026-11-11-1", "2026-11-11", [row("Ivo Quarrington")])]
        self.assertEqual(fill(records, evidence)[("nsw-lc-2026-11-11-1", "Ivo Quarrington")],
                         (None, "evidence-ends-before-date"))

    def test_an_official_list_names_the_party_only_on_its_own_date(self):
        evidence = [official("Ivo Quarrington", "Example Labour", "2026-09-25")]
        records = [division("nsw-lc-2026-09-25-1", "2026-09-25", [row("Ivo Quarrington")]),
                   division("nsw-lc-2026-06-01-1", "2026-06-01", [row("Ivo Quarrington")])]
        got = fill(records, evidence)
        self.assertEqual(got[("nsw-lc-2026-09-25-1", "Ivo Quarrington")], ("Example Labour", "filled"))
        self.assertEqual(got[("nsw-lc-2026-06-01-1", "Ivo Quarrington")], (None, "no-dated-party"))

    def test_two_agreeing_lists_bracket_the_date_but_disagreeing_ones_do_not(self):
        evidence = [official("Ivo Quarrington", "Example Labour", "2023-04-01"),
                    official("Ivo Quarrington", "Example Labour", "2026-09-25"),
                    official("Una Blackwood", "Example Labour", "2023-04-01"),
                    official("Una Blackwood", "Example Independents", "2026-09-25")]
        records = [division("nsw-lc-2025-06-01-1", "2025-06-01", [row("Ivo Quarrington"), row("Una Blackwood")])]
        got = fill(records, evidence)
        self.assertEqual(got[("nsw-lc-2025-06-01-1", "Ivo Quarrington")], ("Example Labour", "filled"))
        self.assertEqual(got[("nsw-lc-2025-06-01-1", "Una Blackwood")], (None, "conflicting"))

    def test_a_wikidata_term_needs_a_later_official_list_in_the_same_term(self):
        records = [division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington")])]
        alone = [term("Q900001", "Ivo Quarrington", "Example Labour", "2023-03-25")]
        self.assertEqual(fill(records, alone)[("nsw-lc-2026-05-01-1", "Ivo Quarrington")],
                         (None, "wikidata-unconfirmed"))
        confirmed = alone + [official("Ivo Quarrington", "Example Labour", "2026-09-25")]
        records = [division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington")])]
        self.assertEqual(fill(records, confirmed)[("nsw-lc-2026-05-01-1", "Ivo Quarrington")],
                         ("Example Labour", "filled"))

    def test_a_stale_wikidata_group_that_an_official_list_contradicts_gives_nothing(self):
        # The member left the party mid-term; Wikidata still has the old group.
        evidence = [term("Q900002", "Una Blackwood", "Example Liberal", "2022-11-26"),
                    official("Una Blackwood", "Example Independents", "2026-09-09", chamber="vic_lc")]
        evidence[0]["chamber"] = "vic_lc"
        records = [division("vic-lc-2026-08-01-1", "2026-08-01", [row("Una Blackwood")], "vic_lc", "vic")]
        self.assertEqual(fill(records, evidence)[("vic-lc-2026-08-01-1", "Una Blackwood")][0], None)

    def test_two_people_with_one_full_name_sitting_that_day_stay_unknown(self):
        evidence = [term("Q900003", "Ivo Quarrington", "Example Labour", "2023-03-25"),
                    term("Q900004", "Ivo Quarrington", "Example Labour", "2023-03-25"),
                    official("Ivo Quarrington", "Example Labour", "2026-09-25")]
        records = [division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington")])]
        self.assertEqual(fill(records, evidence)[("nsw-lc-2026-05-01-1", "Ivo Quarrington")],
                         (None, "ambiguous-identity"))

    def test_person_id_match_and_office_codes(self):
        speaker = V.entry("release-term", "representatives", ("release", "p1"), ["Hal Westbury"], "SPK",
                          "2022-07-26", None, "2026-09-09", pids=["99001"])
        before = V.entry("release-term", "representatives", ("release", "p1"), ["Hal Westbury"], "Nats",
                         "2016-07-02", "2022-07-26", None, pids=["99001"])
        records = [division("federal-representatives-1", "2020-02-01", [row("H. Westbury", pid="tvfy_99001")],
                            "representatives", "federal"),
                   division("federal-representatives-2", "2024-02-01", [row("H. Westbury", pid="tvfy_99001")],
                            "representatives", "federal")]
        got = fill(records, [speaker, before])
        # Matched by person id despite the initial print; the release's short code reads as the pages spell it.
        self.assertEqual(got[("federal-representatives-1", "H. Westbury")], ("Nationals", "filled"))
        # A Speaker period is an office, not a party: no party is invented for it.
        self.assertEqual(got[("federal-representatives-2", "H. Westbury")][0], None)
        self.assertEqual(V.label("Nats"), "Nationals")
        self.assertIsNone(V.label("SPK"))

    def test_a_source_party_without_dated_evidence_stays_and_fills_are_recomputed(self):
        evidence = [service("Ivo Quarrington", "Example Labour", "2023-03-25", "2027-03-27")]
        record = division("nsw-lc-2026-05-01-1", "2026-05-01",
                          [row("Ivo Quarrington"), dict(row("Una Blackwood"), party="Source Party")])
        V.fill_dated_parties([record], evidence)
        self.assertEqual([m.get("party") for m in record["members"]], ["Example Labour", "Source Party"])
        # The evidence is withdrawn: the next run removes the fill, not the source party.
        V.fill_dated_parties([record], [])
        self.assertEqual([m.get("party") for m in record["members"]], [None, "Source Party"])
        self.assertNotIn("party_source", record["members"][0])
        self.assertNotIn("party_fill", record["_meta"])


def release_term(name, party, start, end=None, through="2026-09-09", pid="99100", chamber="representatives"):
    return V.entry("release-term", chamber, ("release", f"p{pid}"), [name], party, start, end,
                   None if end else through, pids=[pid])


def federal(key, date, members, house="representatives"):
    return division(key, date, members, house, "federal")


def labelled(name, party, pid="tvfy_99100", vote="aye"):
    return dict(row(name, vote, pid), party=party)


class SourceLabels(unittest.TestCase):
    """Source labels given for every date (today's party) checked against dated records."""

    def test_a_member_who_changed_party_shows_the_old_party_on_old_dates_and_the_new_one_after(self):
        evidence = [release_term("Corin Ashdale", "Nationals", "2013-09-07", "2025-12-15"),
                    release_term("Corin Ashdale", "One Nation", "2025-12-15")]
        # The source labels every row with the party Corin Ashdale holds today.
        records = [federal("federal-representatives-1", "2014-03-20", [labelled("Corin Ashdale", "One Nation")]),
                   federal("federal-representatives-2", "2025-12-14", [labelled("Corin Ashdale", "One Nation")]),
                   federal("federal-representatives-3", "2026-02-05", [labelled("Corin Ashdale", "One Nation")])]
        got = fill(records, evidence)
        self.assertEqual([r["members"][0]["party"] for r in records], ["Nationals", "Nationals", "One Nation"])
        self.assertEqual(got[("federal-representatives-1", "Corin Ashdale")], ("Nationals", "label-corrected"))
        self.assertEqual(got[("federal-representatives-3", "Corin Ashdale")], ("One Nation", "label-agrees"))
        member = records[0]["members"][0]
        self.assertEqual(member["party_source"], {"basis": "release-term", "url": None, "source_party": "One Nation"})
        self.assertEqual(records[0]["_meta"]["party_check"]["corrected"], 1)
        self.assertNotIn("party_source", records[2]["members"][0])

    def test_a_naming_variant_is_never_rewritten(self):
        evidence = [release_term("Tamsin Okoro", "Liberal", "2016-07-02", pid="99101"),
                    release_term("Wynn Halloran", "Nick Xenophon Team", "2016-07-02", pid="99102"),
                    release_term("Pell Varga", "ALP", "2016-07-02", pid="99103"),
                    release_term("Odile Brack", "Nationals", "2016-07-02", pid="99104")]
        records = [federal("federal-representatives-1", "2017-05-10", [
            labelled("Tamsin Okoro", "LNP", "tvfy_99101"),               # Queensland LNP, filed Liberal
            labelled("Wynn Halloran", "Centre Alliance", "tvfy_99102"),  # the same party, renamed
            labelled("Pell Varga", "Labor", "tvfy_99103"),
            labelled("Odile Brack", "Liberal National Party", "tvfy_99104")])]
        got = fill(records, evidence)
        self.assertEqual([m["party"] for m in records[0]["members"]],
                         ["LNP", "Centre Alliance", "Labor", "Liberal National Party"])
        self.assertTrue(all(reason in ("label-kept-variant", "label-agrees") for _, reason in got.values()))
        self.assertFalse(any("party_source" in m for m in records[0]["members"]))
        self.assertNotIn("party_check", records[0]["_meta"])

    def test_liberal_and_nationals_are_still_two_parties(self):
        evidence = [release_term("Tamsin Okoro", "Nationals", "2016-07-02", pid="99101")]
        records = [federal("federal-representatives-1", "2017-05-10", [labelled("Tamsin Okoro", "Liberal", "tvfy_99101")])]
        self.assertEqual(fill(records, evidence)[("federal-representatives-1", "Tamsin Okoro")],
                         ("Nationals", "label-corrected"))

    def test_ambiguous_evidence_holds_the_label_back(self):
        # A dated list inside the term contradicts it: the record is unclear for that date.
        term_ = release_term("Corin Ashdale", "Liberal", "2016-07-02")
        listed = V.entry("release-roster", "representatives", ("release", "p99100"), ["Corin Ashdale"], "Independent",
                         "2018-03-01", "2018-03-01", "2018-03-01", pids=["99100"], point=True)
        records = [federal("federal-representatives-1", "2018-03-01", [labelled("Corin Ashdale", "Independent")]),
                   federal("federal-representatives-2", "2018-03-02", [labelled("Corin Ashdale", "Independent")])]
        got = fill(records, [term_, listed])
        self.assertEqual(got[("federal-representatives-1", "Corin Ashdale")], (None, "label-withheld-conflicting"))
        member = records[0]["members"][0]
        self.assertNotIn("party", member)
        self.assertEqual(member["party_withheld"], {"source_party": "Independent", "reason": "conflicting"})
        self.assertEqual(records[0]["_meta"]["party_check"]["withheld"], 1)
        # Two lists either side naming different parties are unclear too.
        lists = [official("Una Blackwood", "Example Labour", "2023-04-01"),
                 official("Una Blackwood", "Example Independents", "2026-09-25")]
        record = division("nsw-lc-2025-06-01-1", "2025-06-01", [dict(row("Una Blackwood"), party="Example Labour")])
        self.assertEqual(fill([record], lists)[("nsw-lc-2025-06-01-1", "Una Blackwood")],
                         (None, "label-withheld-conflicting"))

    def test_no_covering_evidence_or_an_ambiguous_identity_keeps_the_source_label(self):
        evidence = [release_term("Corin Ashdale", "Nationals", "2013-09-07", "2016-05-09")]
        records = [federal("federal-representatives-1", "2020-02-01", [labelled("Corin Ashdale", "One Nation")])]
        self.assertEqual(fill(records, evidence)[("federal-representatives-1", "Corin Ashdale")],
                         ("One Nation", "label-kept-evidence-ends-before-date"))
        self.assertEqual(records[0]["members"][0]["party"], "One Nation")
        twins = [release_term("Rhea Tolland", "Labor", "2016-07-02", pid="99105"),
                 release_term("Rhea Tolland", "Greens", "2016-07-02", pid="99106")]
        record = federal("federal-representatives-2", "2017-05-10", [labelled("Rhea Tolland", "Labor", None)])
        self.assertEqual(fill([record], twins)[("federal-representatives-2", "Rhea Tolland")],
                         ("Labor", "label-kept-ambiguous-identity"))

    def test_senate_rows_are_untouched_without_dated_senate_evidence(self):
        # House periods say nothing about the same person's Senate votes.
        evidence = [release_term("Corin Ashdale", "Nationals", "2013-09-07")]
        records = [federal("federal-senate-1", "2010-06-01", [labelled("Corin Ashdale", "One Nation")], "senate"),
                   federal("federal-senate-2", "2010-06-01", [row("Ivo Quarrington", pid="tvfy_99200")], "senate")]
        before = json.loads(json.dumps(records))
        got = fill(records, evidence)
        self.assertEqual(records, before)
        self.assertEqual(got[("federal-senate-1", "Corin Ashdale")], ("One Nation", "label-kept-no-match"))

    def test_corrections_and_holds_are_recomputed_from_the_source_label(self):
        evidence = [release_term("Corin Ashdale", "Nationals", "2013-09-07", "2025-12-15")]
        record = federal("federal-representatives-1", "2014-03-20", [labelled("Corin Ashdale", "One Nation")])
        V.fill_dated_parties([record], evidence)
        self.assertEqual(record["members"][0]["party"], "Nationals")
        # Rerun on the published record: stable.
        V.fill_dated_parties([record], evidence)
        self.assertEqual(record["members"][0]["party"], "Nationals")
        self.assertEqual(record["members"][0]["party_source"]["source_party"], "One Nation")
        # The evidence is withdrawn: the source label comes back, with no trace of the correction.
        V.fill_dated_parties([record], [])
        self.assertEqual(record["members"][0], labelled("Corin Ashdale", "One Nation"))
        self.assertNotIn("party_check", record["_meta"])
        # A held label comes back the same way.
        held = federal("federal-representatives-2", "2014-03-20", [dict(row("Corin Ashdale", pid="tvfy_99100"),
                       party_withheld={"source_party": "One Nation", "reason": "conflicting"})])
        V.fill_dated_parties([held], [])
        self.assertEqual(held["members"][0], labelled("Corin Ashdale", "One Nation"))

    def test_without_the_dated_release_no_label_is_checked_or_changed(self):
        # A previous run corrected this row; tonight the release is missing.
        evidence = [release_term("Corin Ashdale", "Nationals", "2013-09-07", "2025-12-15"),
                    service("Corin Ashdale", "Nationals", "2013-09-07", "2025-12-15", chamber="representatives")]
        record = federal("federal-representatives-1", "2014-03-20", [labelled("Corin Ashdale", "One Nation")])
        V.fill_dated_parties([record], evidence)
        self.assertEqual(record["members"][0]["party"], "Nationals")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts/roster_service.json").write_text(json.dumps({"service": [
                {"name": "Corin Ashdale", "chamber": "representatives", "party": "Nationals",
                 "start": "2013-09-07", "end": "2025-12-15"}]}))
            missing = V.load_evidence(root, None)
        self.assertFalse(missing.check_labels)
        self.assertTrue(len(missing))  # other sources still load and still fill gaps
        outcomes = V.fill_dated_parties([record], missing)
        self.assertEqual(record["members"][0], labelled("Corin Ashdale", "One Nation"))
        self.assertEqual(outcomes, {})
        self.assertTrue(V.load_evidence(ROOT).check_labels)

    def test_same_party(self):
        self.assertTrue(V.same_party("ALP", "Labor"))
        self.assertTrue(V.same_party("LNP", "Nationals"))
        self.assertTrue(V.same_party("Liberal National Party of Queensland", "Liberal"))
        self.assertTrue(V.same_party("CLP", "Liberal"))
        self.assertTrue(V.same_party("Palmer United Party", "United Australia Party"))
        self.assertTrue(V.same_party("Pauline Hanson's One Nation Party", "One Nation"))
        self.assertFalse(V.same_party("Liberal", "Nationals"))
        self.assertFalse(V.same_party("Independent", "Liberal"))
        self.assertFalse(V.same_party("SPK", "SPK"))

class OneParliament(unittest.TestCase):
    """Dated evidence never reaches across a general election (scripts/general_elections.json)."""

    def test_a_wikidata_term_spanning_parliaments_is_confirmed_only_inside_the_list_s_parliament(self):
        # Wikidata holds one open "term" from 1992; the official list is from 2026.
        evidence = [term("Q900020", "Ivo Quarrington", "LNP", "1992-09-19", chamber="qld_la"),
                    official("Ivo Quarrington", "LNP", "2026-06-02", chamber="qld_la")]
        records = [division("qld-la-2005-05-01-1", "2005-05-01", [row("Ivo Quarrington")], "qld_la", "qld"),
                   division("qld-la-2023-05-01-1", "2023-05-01", [row("Ivo Quarrington")], "qld_la", "qld"),
                   division("qld-la-2025-05-01-1", "2025-05-01", [row("Ivo Quarrington")], "qld_la", "qld")]
        got = fill(records, evidence)
        self.assertEqual(got[("qld-la-2005-05-01-1", "Ivo Quarrington")], (None, "wikidata-unconfirmed"))
        # 2023 is before the 26 Oct 2024 election; the 2026 list says nothing of it.
        self.assertEqual(got[("qld-la-2023-05-01-1", "Ivo Quarrington")], (None, "wikidata-unconfirmed"))
        self.assertEqual(got[("qld-la-2025-05-01-1", "Ivo Quarrington")], ("LNP", "filled"))

    def test_a_mid_term_switch_already_in_wikidata_does_not_relabel_earlier_rows(self):
        # Wikidata was updated in place to the new party; a list early in the
        # same parliament shows the old one, a later list the new one.
        evidence = [term("Q900021", "Una Blackwood", "Example Independents", "2023-03-25"),
                    official("Una Blackwood", "Example Labour", "2023-04-01"),
                    official("Una Blackwood", "Example Independents", "2026-09-25")]
        records = [division("nsw-lc-2024-03-01-1", "2024-03-01", [row("Una Blackwood")]),
                   division("nsw-lc-2026-09-25-1", "2026-09-25", [row("Una Blackwood")])]
        got = fill(records, evidence)
        self.assertNotEqual(got[("nsw-lc-2024-03-01-1", "Una Blackwood")][0], "Example Independents")
        self.assertIsNone(got[("nsw-lc-2024-03-01-1", "Una Blackwood")][0])
        # On the later list's own date the new party is the list's.
        self.assertEqual(got[("nsw-lc-2026-09-25-1", "Una Blackwood")][0], "Example Independents")

    def test_a_bracket_never_spans_a_general_election(self):
        evidence = [official("Ivo Quarrington", "Example Labour", "2022-12-01", chamber="vic_la"),
                    official("Ivo Quarrington", "Example Labour", "2026-09-09", chamber="vic_la"),
                    official("Una Blackwood", "Example Labour", "2021-06-01", chamber="vic_la"),
                    official("Una Blackwood", "Example Labour", "2023-06-01", chamber="vic_la")]
        records = [division("vic-la-2025-06-01-1", "2025-06-01", [row("Ivo Quarrington")], "vic_la", "vic"),
                   division("vic-la-2022-06-01-1", "2022-06-01", [row("Una Blackwood")], "vic_la", "vic")]
        got = fill(records, evidence)
        self.assertEqual(got[("vic-la-2025-06-01-1", "Ivo Quarrington")], ("Example Labour", "filled"))
        # 2021 and 2023 straddle the 26 Nov 2022 election.
        self.assertIsNone(got[("vic-la-2022-06-01-1", "Una Blackwood")][0])

    def test_without_election_dates_bracket_and_wikidata_fail_closed(self):
        evidence = V.Evidence([official("Ivo Quarrington", "Example Labour", "2023-04-01"),
                               official("Ivo Quarrington", "Example Labour", "2026-09-25"),
                               term("Q900022", "Ivo Quarrington", "Example Labour", "2023-03-25")], elections={})
        records = [division("nsw-lc-2025-06-01-1", "2025-06-01", [row("Ivo Quarrington")])]
        self.assertIsNone(fill(records, evidence)[("nsw-lc-2025-06-01-1", "Ivo Quarrington")][0])
        # Before the first listed election is unknown territory too.
        self.assertFalse(V.same_parliament(V.load_elections(), "nsw_lc", "1999-06-01", "2000-06-01"))


class Loaders(unittest.TestCase):
    def test_missing_sources_are_skipped_not_fatal(self):
        with tempfile.TemporaryDirectory() as tmp:
            evidence = V.load_evidence(Path(tmp), None)
            db = sqlite3.connect(":memory:")
            db.execute("CREATE TABLE ext_state_roster (qid TEXT)")  # wrong shape: skipped, not fatal
            self.assertEqual(list(V.load_evidence(Path(tmp), db)), [])
        self.assertEqual(list(evidence), [])
        self.assertEqual(evidence.elections, {})
        records = [division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington")])]
        self.assertEqual(V.fill_dated_parties(records, evidence), {"no-match": 1})


    def test_wikidata_terms_from_ext_state_roster(self):
        db = sqlite3.connect(":memory:")
        db.execute("CREATE TABLE ext_state_roster (qid TEXT, state TEXT, chamber TEXT, full_name TEXT, given_name TEXT,"
                   " family_name TEXT, district TEXT, party TEXT, term_start TEXT, term_end TEXT, gender TEXT,"
                   " born TEXT, fetched_at TEXT)")
        db.executemany("INSERT INTO ext_state_roster VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [
            ("Q900010", "nsw", "nsw_la", "Ivo Quarrington", "Ivo", "Quarrington", "Fixture", "Australian Labor Party (New South Wales Branch)",
             "2023-03-25T00:00:00Z", None, None, None, "2026-09-21T12:00:00Z"),
            ("Q900011", "nsw", "nsw_la", "Una Blackwood", "Una", "Blackwood", "Fixture", "Liberal-National Coalition",
             "2023-03-25T00:00:00Z", None, None, None, "2026-09-21T12:00:00Z")])
        got = {e["ident"][1]: e for e in V.wikidata_evidence(db)}
        self.assertEqual((got["Q900010"]["party"], got["Q900010"]["start"], got["Q900010"]["through"]),
                         ("Labor", "2023-03-25", "2026-09-21"))
        # A coalition names no single party.
        self.assertIsNone(got["Q900011"]["party"])
        self.assertEqual(V.wikidata_evidence(sqlite3.connect(":memory:")), [])

    def test_repo_evidence_loads(self):
        evidence = V.load_evidence(ROOT)
        sources = {e["source"] for e in evidence}
        self.assertTrue({"release-term", "release-roster", "official-list"} <= sources)
        self.assertTrue(all(e["start"] for e in evidence if e["source"] != "wikidata-term"))


class ExportIntegration(unittest.TestCase):
    def test_write_projection_fills_and_indexes_dated_parties(self):
        evidence = [service("Ivo Quarrington", "Example Labour", "2023-03-25", "2027-03-27")]
        record = division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington"), row("Una Blackwood", "no")])
        record.update(ayes=1, noes=1)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "divisions"
            D.write_projection({record["key"]: record}, out, party_evidence=evidence)
            shard = json.loads((out / "division-nsw-lc-2026-05-01-1.json").read_text())
            index = json.loads((out / "index.json").read_text())
            # A second run from the same source is byte-stable.
            before = (out / "index.json").read_bytes()
            fresh = division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington"), row("Una Blackwood", "no")])
            fresh.update(ayes=1, noes=1)
            D.write_projection({fresh["key"]: fresh}, out, party_evidence=evidence)
            self.assertEqual((out / "index.json").read_bytes(), before)
        self.assertEqual([m.get("party") for m in shard["members"]], ["Example Labour", None])
        tally = index["divisions"][0]
        self.assertEqual(tally["party_tallies"], [{"party": "Example Labour", "votes": {"aye": 1}}])
        # The unknown row is a count, never an "Unknown" party.
        self.assertEqual(tally["unknown_party_count"], 1)
        self.assertNotIn("Unknown", json.dumps(tally["party_tallies"]))
        self.assertEqual((index["coverage"]["party_filled_count"], index["coverage"]["unknown_party_count"]), (1, 1))

    def test_write_projection_corrects_a_label_from_another_period_and_tallies_follow(self):
        evidence = [release_term("Corin Ashdale", "Nationals", "2013-09-07", "2025-12-15")]
        def fresh():
            record = federal("federal-representatives-1", "2014-03-20", [
                labelled("Corin Ashdale", "One Nation"), labelled("Lark Penhallow", "Nationals", "tvfy_99300", "no")])
            record.update(ayes=1, noes=1)
            return {record["key"]: record}
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "divisions"
            D.write_projection(fresh(), out, party_evidence=evidence)
            before = {p.name: p.read_bytes() for p in out.iterdir()}
            # The nightly reads the source labels afresh: byte-stable.
            D.write_projection(fresh(), out, party_evidence=evidence)
            self.assertEqual({p.name: p.read_bytes() for p in out.iterdir()}, before)
            index = json.loads((out / "index.json").read_text())
            # Withdrawn evidence clears the correction on the next run.
            D.write_projection(fresh(), out, party_evidence=[])
            cleared = json.loads((out / "index.json").read_text())
        tally = index["divisions"][0]["party_tallies"]
        self.assertEqual(tally, [{"party": "Nationals", "votes": {"aye": 1, "no": 1}}])
        self.assertEqual(index["parties"], ["Nationals"])
        self.assertEqual((index["coverage"]["party_corrected_count"], index["coverage"]["party_filled_count"],
                          index["coverage"]["party_withheld_count"]), (1, 0, 0))
        self.assertEqual(cleared["divisions"][0]["party_tallies"][0]["party"], "Nationals")
        self.assertIn("One Nation", cleared["parties"])
        self.assertEqual(cleared["coverage"]["party_corrected_count"], 0)

    def previous_with_fill(self, out):
        evidence = [service("Ivo Quarrington", "Example Labour", "2023-03-25", "2027-03-27")]
        record = division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington"), row("Una Blackwood", "no")])
        record.update(ayes=1, noes=1)
        D.write_projection({record["key"]: record}, out, party_evidence=evidence)
        return evidence

    def test_a_newly_published_source_party_wins_over_last_run_s_fill(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            evidence = self.previous_with_fill(out)
            # The new candidate loses a member (so the previous record is kept)
            # but now publishes the source party for the filled one.
            candidate = division("nsw-lc-2026-05-01-1", "2026-05-01", [dict(row("Ivo Quarrington"), party="Source Party")])
            candidate.update(ayes=1, noes=1)
            guarded = D.write_projection({candidate["key"]: candidate}, out, party_evidence=evidence)
        record = guarded["nsw-lc-2026-05-01-1"]
        self.assertTrue(record["_meta"]["refresh_retained"])
        ivo = next(m for m in record["members"] if m["name"] == "Ivo Quarrington")
        # Last run's fill is gone: the row now starts from the source party, which
        # is then checked like any source label. The dated record covering the
        # date names another party, so it is corrected, keeping the source label.
        self.assertEqual(ivo["party"], "Example Labour")
        self.assertEqual(ivo["party_source"], {"basis": "service", "url": LIST, "source_party": "Source Party"})
        self.assertNotIn("party_fill", record["_meta"])
        self.assertEqual(record["_meta"]["party_check"]["corrected"], 1)

    def test_a_bills_only_run_keeps_previous_fills(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            self.previous_with_fill(out)
            bills_only = division("nsw-lc-2026-05-01-1", "2026-05-01", [])
            bills_only.update(ayes=1, noes=1)
            bills_only["_meta"]["member_coverage"] = "unavailable"
            guarded = D.write_projection({bills_only["key"]: bills_only}, out, carry=True, party_evidence=None)
        ivo = next(m for m in guarded["nsw-lc-2026-05-01-1"]["members"] if m["name"] == "Ivo Quarrington")
        self.assertEqual((ivo["party"], ivo["party_source"]["basis"]), ("Example Labour", "service"))

    def test_a_missing_release_keeps_published_corrections_and_fills_as_they_are(self):
        evidence = V.Evidence([release_term("Corin Ashdale", "Nationals", "2013-09-07", "2025-12-15"),
                               release_term("Lark Penhallow", "Labor", "2013-09-07", pid="99300")], elections={})
        def fresh(ashdale="One Nation"):
            record = federal("federal-representatives-1", "2014-03-20", [
                labelled("Corin Ashdale", ashdale), row("Lark Penhallow", "no", "tvfy_99300")])
            record.update(ayes=1, noes=1)
            return {record["key"]: record}
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "divisions"
            D.write_projection(fresh(), out, party_evidence=evidence)
            published = {p.name: p.read_bytes() for p in out.iterdir()}
            shard = json.loads((out / "division-federal-representatives-1.json").read_text())
            self.assertEqual([m.get("party") for m in shard["members"]], ["Nationals", "Labor"])
            # Tonight the release does not load: nothing may be undone.
            missing = V.Evidence([], elections={}, check_labels=False)
            D.write_projection(fresh(), out, party_evidence=missing)
            self.assertEqual({p.name: p.read_bytes() for p in out.iterdir()}, published)
            # A source label that changed meanwhile is not given the old correction.
            D.write_projection(fresh("Nationals"), out, party_evidence=missing)
            shard = json.loads((out / "division-federal-representatives-1.json").read_text())
        ashdale, penhallow = shard["members"]
        self.assertEqual((ashdale["party"], "party_source" in ashdale), ("Nationals", False))
        self.assertEqual((penhallow["party"], penhallow["party_source"]["basis"]), ("Labor", "release-term"))

    def test_without_evidence_rows_are_unchanged(self):
        record = division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington")])
        with tempfile.TemporaryDirectory() as tmp:
            D.write_projection({record["key"]: record}, Path(tmp))
            shard = json.loads((Path(tmp) / "division-nsw-lc-2026-05-01-1.json").read_text())
        self.assertNotIn("party", shard["members"][0])


class RosterListFile(unittest.TestCase):
    def test_committed_roster_list_parties_match_the_evidence(self):
        result = subprocess.run([sys.executable, str(ROOT / "scripts/export_roster_list_parties.py"), "--check"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_single_name_observations_are_never_written(self):
        sys.path.insert(0, str(ROOT))
        spec = importlib.util.spec_from_file_location("roster_list", ROOT / "scripts/export_roster_list_parties.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts/roster_state_evidence.json").write_text(json.dumps({"snapshots": [
                {"jurisdiction": "nsw", "chamber": "nsw_lc", "as_of": "2026-09-25", "source_url": LIST, "members": [
                    {"name": "Ivo Quarrington", "aliases": [], "electorate": "New South Wales", "party": "Labor"},
                    {"name": "Blackwood", "aliases": [], "electorate": "New South Wales", "party": "Labor"},
                    {"name": "Una Fernhill", "aliases": [], "electorate": "New South Wales"}]}]}))
            (root / "scripts/roster_service.json").write_text(json.dumps({"service": [], "history": []}))
            got = module.observations(root)
        self.assertEqual([(o["name"], o["party"], o["as_of"]) for o in got], [("Ivo Quarrington", "Labor", "2026-09-25")])


if __name__ == "__main__":
    unittest.main()


# ---- dated Senate party records (Parliamentary Handbook) and reviewed per-record periods --------

from contextlib import redirect_stderr  # noqa: E402
import io  # noqa: E402
import os  # noqa: E402
from unittest import mock  # noqa: E402
import urllib.error  # noqa: E402

sys.path.insert(0, str(ROOT))
import build_handbook_parties as H  # noqa: E402
from parli.ingest import http as source_http  # noqa: E402


def handbook_file(root, people, fetched="2026-11-13"):
    path = Path(root) / "scripts/handbook_party_service.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(H.dump({"source": "fixture", "url": "https://example.test/handbook", "fetched": fetched,
                            "chamber": "senate", "from": "2006-01-01", "note": "fixture", "people": people}))
    return path


def senator(phid, name, pid, periods):
    return {"phid": phid, "pid": pid, "name": name, "names": [name], "current": False, "match": "fixture",
            "service_end": None, "periods": [dict(zip(("party", "start", "end", "through"), p)) for p in periods]}


# Invented: Quinn Harrowgate sat as a Liberal, left for a new party, then sat as an independent.
HARROWGATE = senator("ZZ1", "Quinn Harrowgate", "99500", [
    ("Liberal", "2006-05-04", "2017-02-07", None), ("Example Conservatives", "2017-02-07", "2019-06-25", None),
    ("Independent", "2019-06-25", None, "2020-01-20")])
# Invented: Avery Pellingham's party was renamed while the senator sat; Morwenna Tisdall has two periods with a gap.
PELLINGHAM = senator("ZZ2", "Avery Pellingham", "99501", [
    ("Independent", "2008-07-01", "2013-07-01", None), ("Nick Xenophon Team", "2013-07-01", None, "2017-10-31")])
TISDALL = senator("ZZ3", "Morwenna Tisdall", "99502", [
    ("Palmer United Party", "2014-07-01", "2014-11-24", None), ("Example Network", "2015-05-14", None, "2026-11-13")])


def senate(key, date, members):
    record = federal(key, date, members, "senate")
    record.update(ayes=sum(m["vote"] == "aye" for m in members), noes=sum(m["vote"] == "no" for m in members))
    return record


def evidence_from(root, release=()):
    """load_evidence over a fixture root, with a fixture release in place of the real one."""
    with mock.patch.object(V, "release_evidence", lambda public: list(release)):
        return V.load_evidence(Path(root), None)


class SenatePartyRecords(unittest.TestCase):
    def test_a_senate_switch_shows_the_party_held_on_each_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            handbook_file(tmp, [HARROWGATE])
            evidence = evidence_from(tmp)
        records = [senate("federal-senate-1", "2007-02-06", [labelled("Quinn Harrowgate", "Example Conservatives", "tvfy_99500")]),
                   senate("federal-senate-2", "2018-03-01", [labelled("Quinn Harrowgate", "Example Conservatives", "tvfy_99500")]),
                   senate("federal-senate-3", "2019-09-10", [labelled("Quinn Harrowgate", "Example Conservatives", "tvfy_99500")]),
                   senate("federal-senate-4", "2017-02-07", [labelled("Quinn Harrowgate", "Example Conservatives", "tvfy_99500")])]
        got = fill(records, evidence)
        self.assertEqual([r["members"][0]["party"] for r in records],
                         ["Liberal", "Example Conservatives", "Independent", "Example Conservatives"])
        self.assertEqual(got[("federal-senate-1", "Quinn Harrowgate")], ("Liberal", "label-corrected"))
        self.assertEqual(got[("federal-senate-2", "Quinn Harrowgate")][1], "label-agrees")
        member = records[0]["members"][0]
        self.assertEqual((member["party_source"]["basis"], member["party_source"]["source_party"]),
                         ("handbook-term", "Example Conservatives"))
        # Inside the dated range the record says its labels were checked.
        self.assertEqual(records[0]["_meta"]["party_dated"]["record"], "handbook")
        # The same person's House rows are never read from Senate records.
        house = federal("federal-representatives-1", "2007-02-06", [labelled("Quinn Harrowgate", "Example Conservatives", "tvfy_99500")])
        self.assertEqual(fill([house], evidence)[("federal-representatives-1", "Quinn Harrowgate")][1], "label-kept-no-match")
        self.assertNotIn("party_dated", house["_meta"])

    def test_a_rename_is_not_a_switch(self):
        with tempfile.TemporaryDirectory() as tmp:
            handbook_file(tmp, [PELLINGHAM])
            evidence = evidence_from(tmp)
        # The source gives the party's later name on every date.
        records = [senate("federal-senate-1", "2010-03-01", [labelled("Avery Pellingham", "Centre Alliance", "tvfy_99501")]),
                   senate("federal-senate-2", "2015-03-01", [labelled("Avery Pellingham", "Centre Alliance", "tvfy_99501")])]
        got = fill(records, evidence)
        self.assertEqual(got[("federal-senate-1", "Avery Pellingham")], ("Independent", "label-corrected"))
        self.assertEqual(got[("federal-senate-2", "Avery Pellingham")], ("Centre Alliance", "label-kept-variant"))
        self.assertEqual(records[1]["members"][0], labelled("Avery Pellingham", "Centre Alliance", "tvfy_99501"))

    def test_a_gap_with_no_dated_period_keeps_the_source_label(self):
        undated = senator("ZZ4", "Lowen Brasher", "99503", [])  # the Handbook gives one undated party only
        with tempfile.TemporaryDirectory() as tmp:
            handbook_file(tmp, [TISDALL, undated])
            evidence = evidence_from(tmp)
        records = [senate("federal-senate-1", "2015-02-10", [labelled("Morwenna Tisdall", "Example Network", "tvfy_99502"),
                                                             labelled("Lowen Brasher", "Later Party", "tvfy_99503", "no")]),
                   senate("federal-senate-2", "2014-08-01", [labelled("Morwenna Tisdall", "Example Network", "tvfy_99502")])]
        got = fill(records, evidence)
        self.assertEqual(got[("federal-senate-1", "Morwenna Tisdall")], ("Example Network", "label-kept-evidence-ends-before-date"))
        self.assertEqual(got[("federal-senate-1", "Lowen Brasher")][0], "Later Party")
        self.assertEqual([m["party"] for m in records[0]["members"]], ["Example Network", "Later Party"])
        self.assertEqual(records[1]["members"][0]["party"], "Palmer United Party")
        # A division after the fetch date is outside the dated range: no mark, so the page keeps its caveat.
        later = senate("federal-senate-3", "2026-11-20", [labelled("Morwenna Tisdall", "Example Network", "tvfy_99502")])
        fill([later], evidence)
        self.assertNotIn("party_dated", later["_meta"])

    def test_a_night_without_the_senate_records_keeps_the_published_senate_labels(self):
        release = [release_term("Corin Ashdale", "Nationals", "2013-09-07", "2025-12-15")]
        def fresh(ashdale="Nationals"):
            records = [senate("federal-senate-1", "2007-02-06", [labelled("Quinn Harrowgate", "Example Conservatives", "tvfy_99500"),
                                                                 row("Ivo Quarrington", "no", "tvfy_99504")]),
                       federal("federal-representatives-1", "2014-03-20", [labelled("Corin Ashdale", ashdale)])]
            records[1].update(ayes=1, noes=0)
            return {r["key"]: r for r in records}
        quarrington = senator("ZZ5", "Ivo Quarrington", "99504", [("Example Labour", "2005-07-01", None, "2011-06-30")])
        with tempfile.TemporaryDirectory() as tmp:
            handbook_file(tmp, [HARROWGATE, quarrington])
            evidence = evidence_from(tmp)
            self.assertEqual(evidence.frozen, frozenset())
            out = Path(tmp) / "divisions"
            D.write_projection(fresh("One Nation"), out, party_evidence=evidence)
            senate_page = (out / "division-federal-senate-1.json").read_bytes()
            shard = json.loads(senate_page)
            self.assertEqual([m.get("party") for m in shard["members"]], ["Liberal", "Example Labour"])
            self.assertIn("party_dated", shard["_meta"])
            # Tonight the Handbook file is missing: one WARNING, and the Senate is not recomputed.
            (Path(tmp) / "scripts/handbook_party_service.json").unlink()
            err = io.StringIO()
            with redirect_stderr(err):
                missing = evidence_from(tmp, release)
            warnings = [line for line in err.getvalue().splitlines() if "WARNING" in line]
            self.assertEqual(len(warnings), 1, err.getvalue())
            self.assertIn("Senate", warnings[0])
            self.assertEqual(missing.frozen, frozenset({("federal", "senate")}))
            self.assertTrue(missing.check_labels)
            D.write_projection(fresh(), out, party_evidence=missing)
            self.assertEqual((out / "division-federal-senate-1.json").read_bytes(), senate_page)
            # The House is still recomputed from its own dated record.
            house = json.loads((out / "division-federal-representatives-1.json").read_text())
            self.assertEqual((house["members"][0]["party"], "party_source" in house["members"][0]), ("Nationals", False))
            # The Senate file is back: recomputed again, the same result.
            handbook_file(tmp, [HARROWGATE, quarrington])
            D.write_projection(fresh(), out, party_evidence=evidence_from(tmp, release))
            self.assertEqual((out / "division-federal-senate-1.json").read_bytes(), senate_page)

    def test_a_malformed_senate_file_is_a_missing_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "scripts").mkdir()
            (Path(tmp) / "scripts/handbook_party_service.json").write_text('{"chamber": "senate"}')
            err = io.StringIO()
            with redirect_stderr(err):
                evidence = evidence_from(tmp)
        self.assertEqual(evidence.frozen, frozenset({("federal", "senate")}))
        self.assertEqual(sum("WARNING" in line for line in err.getvalue().splitlines()), 1)


class ReviewedPartyPeriods(unittest.TestCase):
    # Invented: the release gives Ellery Voss one party for the whole term; a reviewed record splits it.
    ACCEPT = {"name": "Ellery Voss", "chamber": "representatives", "pid": "99600", "url": "https://example.test/record",
              "replaces": [{"party": "Independent", "start": "1993-03-13", "end": "2007-10-17"}],
              "periods": [{"party": "Labor", "start": "1993-03-13", "end": "2007-08-20"},
                          {"party": "Independent", "start": "2007-08-20", "end": "2007-10-17"}]}

    def records(self):
        return [federal("federal-representatives-1", "2007-02-01", [labelled("Ellery Voss", "Independent", "tvfy_99600")]),
                federal("federal-representatives-2", "2007-09-19", [labelled("Ellery Voss", "Independent", "tvfy_99600")])]

    def test_a_reviewed_record_replaces_the_release_periods_it_names(self):
        release = [release_term("Ellery Voss", "Independent", "1993-03-13", "2007-10-17", pid="99600")]
        evidence = V.Evidence(V.apply_accepts(release, [self.ACCEPT]), elections={})
        self.assertEqual({e["source"] for e in evidence}, {"accepted-record"})
        records = self.records()
        got = fill(records, evidence)
        self.assertEqual(got[("federal-representatives-1", "Ellery Voss")], ("Labor", "label-corrected"))
        self.assertEqual(got[("federal-representatives-2", "Ellery Voss")][1], "label-agrees")
        self.assertEqual(records[0]["members"][0]["party_source"]["basis"], "accepted-record")

    def test_a_record_whose_release_periods_moved_is_held(self):
        release = [release_term("Ellery Voss", "Independent", "1993-03-13", "2007-10-18", pid="99600")]
        err = io.StringIO()
        with redirect_stderr(err):
            evidence = V.apply_accepts(release, [self.ACCEPT, {"name": "Broken", "chamber": "senate"}])
        self.assertEqual(evidence, release)
        self.assertIn("Ellery Voss held", err.getvalue())
        self.assertIn("accepted party record held (KeyError", err.getvalue())

    def test_the_committed_reviewed_records_all_apply(self):
        err = io.StringIO()
        with redirect_stderr(err):
            evidence = V.load_evidence(ROOT)
        self.assertNotIn("held", err.getvalue())
        accepted = {(e["chamber"], next(iter(e["pids"])), e["party"], e["start"], e["end"])
                    for e in evidence if e["source"] == "accepted-record"}
        self.assertIn(("representatives", "10525", "Labor", "1993-03-13", "2007-08-20"), accepted)  # Harry Quick
        self.assertIn(("representatives", "10342", "Independent", "2010-05-21", "2010-08-21"), accepted)  # Michael Johnson
        self.assertIn(("senate", "10350", "Nationals", "2005-07-01", "2013-08-09"), accepted)  # Barnaby Joyce
        self.assertFalse([e for e in evidence if e["source"] == "release-term" and "10525" in e["pids"]])
        self.assertEqual(evidence.frozen, frozenset())
        self.assertEqual(evidence.dated[("federal", "senate")]["from"], "2006-01-01")


class HandbookBuild(unittest.TestCase):
    def raw(self):
        ind = lambda phid, family, given, start, end, current="False": {
            "PHID": phid, "FamilyName": family, "GivenName": given, "PreferredName": "", "DisplayName": f"{family}, {given}",
            "MPorSenator": ["Senator"], "SenateState": "SA", "State": "South Australia", "StateAbbrev": "SA",
            "InCurrentParliament": current, "ServiceHistory_Start": start, "ServiceHistory_End": end}
        rec = lambda phid, party, start, end: {"PHID": phid, "OBY": 20, "ROSTypeID": 11, "Value1": party,
                                               "DateStart1": start, "DateEnd1": end}
        return {"fetched": "2026-11-13T05:00:00+00:00", "individuals": [
                    ind("ZZ1", "HARROWGATE", "Quinn", "2014-07-01", "2026-11-13", "True"),
                    ind("ZZ2", "BRASHER", "Lowen", "2022-07-01", "2025-06-30"),
                    ind("ZZ3", "OLDHAM", "Piers", "1990-07-01", "2002-06-30")],
                "party_records": [
                    rec("ZZ1", "Palmer United Party", "1900-01-01", "2014-11-24"),
                    rec("ZZ1", "United Australia Party [2018]", "2014-11-24", "1900-01-01"),
                    rec("ZZ1", "", "2014-11-24", "2015-01-01"),
                    rec("ZZ2", "Australian Labor Party", "1900-01-01", "1900-01-01")]}

    def test_build_reads_undated_starts_open_ends_and_leaves_undated_records_out(self):
        members = [{"person_id": "99700", "first_name": "Quinn", "last_name": "Harrowgate", "full_name": "Quinn Harrowgate",
                    "chamber": "senate", "electorate": "SA"}]
        doc, unmatched, unlabelled = H.build(self.raw(), members)
        people = {p["phid"]: p for p in doc["people"]}
        self.assertEqual(set(people), {"ZZ1", "ZZ2"})  # service before 2006 is left out
        self.assertEqual(people["ZZ1"]["pid"], "99700")
        self.assertEqual([(p["party"], p["start"], p["end"], p["through"]) for p in people["ZZ1"]["periods"]],
                         [("Palmer United Party", "2014-07-01", "2014-11-24", None),
                          ("United Australia Party", "2014-11-24", None, "2026-11-13")])
        self.assertEqual(people["ZZ2"]["periods"], [])  # one undated party: no dated period
        self.assertEqual(len(unmatched), 1)
        self.assertEqual(unlabelled, [])
        self.assertEqual(json.loads(H.dump(doc)), doc)

    def test_a_refused_or_rate_limited_request_stops_without_a_retry(self):
        calls = []
        def refuse(code):
            def opener(req, timeout=None):
                calls.append(req.full_url)
                raise urllib.error.HTTPError(req.full_url, code, "refused", {}, io.BytesIO(b""))
            return opener
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
                os.environ, {"OPAX_SOURCE_STATUS_FILE": str(Path(tmp) / "status.json")}), \
                redirect_stderr(io.StringIO()), mock.patch("builtins.print"):
            for code in (403, 429):
                calls.clear()
                with mock.patch.object(H._opener, "open", refuse(code)), mock.patch.object(H.time, "sleep"):
                    with self.assertRaises(source_http.SourceRefused):
                        H.fetch(Path(tmp) / "cache", refresh=True, say=lambda *a: None)
                self.assertEqual(len(calls), 1)
                self.assertTrue(calls[0].startswith("https://handbookapi.aph.gov.au/api/"))
            self.assertFalse((Path(tmp) / "cache").exists())  # nothing cached from a refused run
