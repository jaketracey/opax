"""Dated parties for division rows the source leaves without one (scripts/vote_parties.py).

Every person, seat and source here is invented.
"""

import importlib.util
import json
from pathlib import Path
import sqlite3
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

    def test_rows_with_a_source_party_are_never_touched_and_fills_are_recomputed(self):
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


class Loaders(unittest.TestCase):
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

    def test_without_evidence_rows_are_unchanged(self):
        record = division("nsw-lc-2026-05-01-1", "2026-05-01", [row("Ivo Quarrington")])
        with tempfile.TemporaryDirectory() as tmp:
            D.write_projection({record["key"]: record}, Path(tmp))
            shard = json.loads((Path(tmp) / "division-nsw-lc-2026-05-01-1.json").read_text())
        self.assertNotIn("party", shard["members"][0])


if __name__ == "__main__":
    unittest.main()
