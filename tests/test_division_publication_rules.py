"""Division publication rules: reviewed corrections, office codes, labels,
placeholders and TVFY-marked duplicates, in both exporters and the votes guard.

    python3 -m pytest -q tests/test_division_publication_rules.py
"""

import importlib.util
import sqlite3
import sys
import unittest
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts" / "vm"))
import division_rules as rules  # noqa: E402
from corrections.apply import CorrectionError  # noqa: E402


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


D = load("export_division_pages", "scripts/export_division_pages.py")
X = load("export_votes", "scripts/export_votes.py")
G = load("divisions_guard", "scripts/vm/divisions_guard.py")

URL = "https://data.openaustralia.org.au/scrapedxml/representatives_debates/2019-02-12.xml"


def correction(**over):
    base = {"id": "federal-representatives-1", "field": "result", "from": "negative", "to": "affirmative",
            "evidence_url": URL, "evidence": "divisioncount ayes 2, noes 1", "finding": "divisions-votes-002",
            "reviewed": "2026-11-10"}
    base.update(over)
    return base


def record(key="federal-representatives-1", **over):
    base = {"key": key, "slug": f"division-{key}", "name": "Bills — Example Bill 2019; Consideration",
            "question": "That the amendments be agreed to.", "date": "2019-02-12", "house": "representatives",
            "jurisdiction": "federal", "ayes": 2, "noes": 1, "result": "negative",
            "source_url": "https://theyvoteforyou.org.au/divisions/representatives/2019-02-12/1",
            "members": [{"name": "Alex Example", "person_id": "1", "vote": "aye"},
                        {"name": "Bo Sample", "person_id": "2", "vote": "aye"},
                        {"name": "Cy Other", "person_id": "3", "vote": "no"}],
            "_meta": {"member_coverage": "recorded"}}
    base.update(over)
    return base


class RulesTest(unittest.TestCase):
    def test_office_codes_are_never_a_party(self):
        for code in ("PRES", "DPRES", "SPK", "CWM"):
            with self.subTest(code=code):
                member = rules.publishable_member({"name": "A", "party": code, "vote": "aye"})
                self.assertNotIn("party", member)
                self.assertEqual(member["office"], code)
        member = rules.publishable_member({"name": "A", "party": "Australian Labor Party", "vote": "aye"})
        self.assertEqual((member["party"], member.get("office")), ("Australian Labor Party", None))

    def test_one_label_per_party(self):
        self.assertEqual(rules.party_label("JLN"), "Jacqui Lambie Network")
        self.assertEqual(rules.party_label("Pauline Hanson's One Nation Party"), "One Nation")
        self.assertEqual(rules.party_label("Pauline Hanson's One Nation"), "One Nation")
        self.assertEqual(rules.party_label("Australian Greens"), "Australian Greens")
        self.assertIsNone(rules.party_label("  "))

    def test_ingest_maps_the_long_one_nation_label(self):
        sys.path.insert(0, str(ROOT))
        from parli.ingest.tvfy_refresh import PARTY_CANONICAL
        self.assertEqual(PARTY_CANONICAL["pauline hanson's one nation party"], "One Nation")

    def test_person_ids_only_rewritten_for_tvfy_page_members(self):
        self.assertEqual(rules.publishable_member({"person_id": "11007"})["person_id"], "11007")
        self.assertEqual(rules.publishable_member({"person_id": "11007"}, tvfy_page_ids=True)["person_id"], "tvfy_11007")
        self.assertEqual(rules.publishable_member({"person_id": "nsw:x"}, tvfy_page_ids=True)["person_id"], "nsw:x")
        self.assertEqual(rules.canonical_person_id("11007"), rules.canonical_person_id("tvfy_11007"))

    def test_placeholder_questions_are_withheld(self):
        self.assertIsNone(rules.publishable_question("No motion text available"))
        self.assertIsNone(rules.publishable_question("Long debate text truncated."))
        self.assertEqual(rules.publishable_question("That the bill be now read a second time."),
                         "That the bill be now read a second time.")

    def test_duplicates_need_marker_link_and_identical_votes(self):
        link = ("This is a duplicate of [this division](https://theyvoteforyou.org.au/divisions/"
                "representatives/2019-02-12/1).")
        same = rules.vote_set([("1", "aye"), ("2", "no")])
        divisions = {"orig": ("representatives", "2019-02-12", 1, "Bills — X; Third Reading", "Text"),
                     "dup": ("representatives", "2019-02-12", 2, "Bills — X; Third Reading", link),
                     "differs": ("representatives", "2019-02-12", 3, "Bills — X", link),
                     "unlinked": ("representatives", "2019-02-12", 4, "Bills — X - DUPLICATE", "No link here")}
        votes = {"orig": same, "dup": same, "differs": rules.vote_set([("1", "no")]), "unlinked": same}
        self.assertEqual(rules.find_duplicates(divisions, votes), {"dup": "orig"})
        publicwhip = ("This division is a duplicate of https://www.publicwhip.org.au/division.php?"
                      "date=2019-02-12&amp;number=1&amp;house=representatives")
        self.assertEqual(rules.duplicate_link("x", publicwhip), ("representatives", "2019-02-12", 1))
        self.assertIsNone(rules.duplicate_link("Bills — X", "See [this division](https://theyvoteforyou.org.au/"
                                                            "divisions/representatives/2019-02-12/1)"))


class DivisionPagesTest(unittest.TestCase):
    def setUp(self):
        self._reviewed = D._REVIEWED

    def tearDown(self):
        D._REVIEWED = self._reviewed

    def review(self, entries):
        D._REVIEWED = {(e["id"], e["field"]): e for e in entries}

    def test_a_reviewed_correction_is_carried_and_accepted_by_the_guard(self):
        entries = [correction()]
        previous = record()
        candidate = record()
        D.publication_rules({candidate["key"]: candidate}, corrections=entries)
        self.assertEqual(candidate["result"], "affirmative")
        self.assertEqual(candidate["_meta"]["corrections"],
                         [{"field": "result", "from": "negative", "to": "affirmative",
                           "finding": "divisions-votes-002", "evidence_url": URL, "reviewed": "2026-11-10"}])
        self.review(entries)
        self.assertIsNone(D.degradation_reason(candidate, previous))
        # The same change without a reviewed entry is still retained.
        self.review([])
        self.assertEqual(D.degradation_reason(candidate, previous), "source-facts-changed")
        # A record that does not carry the correction is not excused by the file alone.
        self.review(entries)
        bare = record(result="affirmative")
        self.assertEqual(D.degradation_reason(bare, previous), "source-facts-changed")

    def test_a_stale_correction_stops_the_export(self):
        with self.assertRaises(CorrectionError):
            D.publication_rules({"federal-representatives-1": record(result="tied")}, corrections=[correction()])
        with self.assertRaises(CorrectionError):
            D.publication_rules({}, corrections=[correction()])

    def test_placeholder_question_is_withheld_and_accepted(self):
        previous = record(question="No motion text available")
        candidate = record(question="No motion text available")
        D.publication_rules({candidate["key"]: candidate}, corrections=[])
        self.assertIsNone(candidate["question"])
        self.review([])
        self.assertIsNone(D.degradation_reason(candidate, previous))
        # Dropping a real question is still a regression.
        self.assertEqual(D.degradation_reason(record(question=None), record()), "source-facts-changed")

    def test_duplicates_are_flagged_and_indexed_not_removed(self):
        link = ("This is a duplicate of [this division](https://theyvoteforyou.org.au/divisions/"
                "representatives/2019-02-12/1).")
        records = {"federal-representatives-1": record(),
                   "federal-representatives-2": record(
                       "federal-representatives-2", question=link,
                       source_url="https://theyvoteforyou.org.au/divisions/representatives/2019-02-12/2")}
        D.publication_rules(records, corrections=[])
        self.assertEqual(records["federal-representatives-2"]["_meta"]["duplicate_of"], "federal-representatives-1")
        self.assertNotIn("duplicate_of", records["federal-representatives-1"]["_meta"])
        index = D.projection_index(D.guard_projection(records, {}))
        self.assertEqual(index["coverage"]["duplicate_count"], 1)
        self.assertEqual({r["key"]: r.get("duplicate_of") for r in index["divisions"]},
                         {"federal-representatives-1": None, "federal-representatives-2": "federal-representatives-1"})

    def test_db_projection_moves_office_codes_and_canonicalises_labels(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript("""
        CREATE TABLE ext_divisions (id TEXT, name TEXT, question TEXT, date TEXT, house TEXT,
         jurisdiction TEXT, ayes_count INT, noes_count INT, result TEXT, source_url TEXT);
        CREATE TABLE ext_votes (division_id TEXT, person_id TEXT, person_name TEXT, person_key TEXT,
         vote TEXT, jurisdiction TEXT, party TEXT);
        INSERT INTO ext_divisions VALUES ('federal-senate-1', 'Motions', 'That the motion be agreed to.',
         '2020-02-04', 'senate', 'federal', 2, 1, 'affirmative', 'https://example.test/1');
        INSERT INTO ext_votes VALUES ('federal-senate-1', 'tvfy_1', 'Alex Example', 'a', 'aye', 'federal', 'PRES');
        INSERT INTO ext_votes VALUES ('federal-senate-1', 'tvfy_2', 'Bo Sample', 'b', 'aye', 'federal', 'JLN');
        INSERT INTO ext_votes VALUES ('federal-senate-1', 'tvfy_3', 'Cy Other', 'c', 'no', 'federal',
         'Pauline Hanson''s One Nation Party');
        """)
        db.row_factory = sqlite3.Row
        data = D.database_projection(db, {})["federal-senate-1"]
        self.assertEqual([(m.get("party"), m.get("office")) for m in data["members"]],
                         [(None, "PRES"), ("Jacqui Lambie Network", None), ("One Nation", None)])
        self.assertEqual([m["person_id"] for m in data["members"]], ["tvfy_1", "tvfy_2", "tvfy_3"])
        parties = {t["party"] for t in D.projection_index(D.guard_projection({"federal-senate-1": data}, {}))
                   ["divisions"][0]["party_tallies"]}
        self.assertNotIn("PRES", parties)

    def test_member_evidence_matches_either_tvfy_id_spelling(self):
        previous = {"members": [{"name": "Alex Example", "person_id": "11007", "vote": "aye"}]}
        candidate = {"members": [{"name": "Alex Example", "person_id": "tvfy_11007", "vote": "aye"}]}
        self.assertTrue(D.has_previous_member_evidence(candidate, previous))
        candidate["members"][0]["person_id"] = "tvfy_11008"
        self.assertFalse(D.has_previous_member_evidence(candidate, previous))

    def test_committed_corrections_match_the_published_shards(self):
        """Every reviewed correction is what its published shard now shows."""
        import json
        for entry in D.load_corrections(D.CORRECTIONS):
            path = ROOT / "portal/public/divisions" / f"division-{entry['id']}.json"
            if not path.exists():
                continue  # published by the next export run
            shard = json.loads(path.read_text())
            carried = shard.get("_meta", {}).get("corrections")
            if carried is None:
                continue  # shard predates the correction; the next export run applies it
            with self.subTest(id=entry["id"], field=entry["field"]):
                self.assertIn({k: entry[k] for k in ("field", "from", "to", "finding", "evidence_url", "reviewed")},
                              carried)


class VotesExportTest(unittest.TestCase):
    def fixture(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        link = ("This is a duplicate of [this division](https://theyvoteforyou.org.au/divisions/"
                "representatives/2019-02-12/1).")
        db.executescript("""
        CREATE TABLE members (person_id TEXT, full_name TEXT, party_canonical TEXT, party TEXT, chamber TEXT);
        CREATE TABLE divisions (division_id TEXT, house TEXT, number INT, name TEXT, date TEXT,
         rebellions INTEGER, summary TEXT, state TEXT);
        CREATE TABLE votes (person_id TEXT, division_id TEXT, vote TEXT);
        INSERT INTO members VALUES ('1', 'Alex Example', 'Labor', 'Labor', 'representatives');
        INSERT INTO members VALUES ('2', 'Bo Sample', 'Liberal', 'Liberal', 'representatives');
        """)
        name = "Example Reform Bill 2019 - Third Reading - Pass the bill"
        for did, number, summary in (("d1", 1, ""), ("d2", 2, link)):
            db.execute("INSERT INTO divisions VALUES (?,?,?,?,?,?,?,?)",
                       (did, "representatives", number, name, "2019-02-12", 0, summary, None))
            db.executemany("INSERT INTO votes VALUES (?,?,?)", [("1", did, "aye"), ("2", did, "no")])
        return db

    def test_a_marked_duplicate_is_left_out_of_totals(self):
        db = self.fixture()
        out, names, newest, stats = {}, {}, {}, {}
        X.export_federal(db, out, names, newest, stats)
        self.assertEqual(stats["excluded_duplicate_divisions"], 1)
        self.assertEqual((out["1"]["ayes"], out["1"]["noes"], out["1"]["divisions_total"]), (1, 0, 1))
        self.assertEqual((out["2"]["ayes"], out["2"]["noes"], out["2"]["divisions_total"]), (0, 1, 1))
        self.assertEqual(X.duplicate_vote_counts(db), {"1": 1, "2": 1})
        # A different vote set is not a duplicate, whatever the text says.
        db.execute("UPDATE votes SET vote='aye' WHERE division_id='d2' AND person_id='2'")
        out, stats = {}, {}
        X.export_federal(db, out, {}, {}, stats)
        self.assertEqual(stats["excluded_duplicate_divisions"], 0)
        self.assertEqual(out["1"]["divisions_total"], 2)
        self.assertEqual(X.duplicate_vote_counts(db), {})

    def test_corrected_state_question_decides_the_side(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.execute("CREATE TABLE ext_divisions (id TEXT, name TEXT, question TEXT)")
        db.execute("INSERT INTO ext_divisions VALUES ('nsw-lc-1', 'Example Bill 2025', 'Example Bill 2025')")
        entry = correction(id="nsw-lc-1", field="question", **{"from": "Example Bill 2025",
                                                                "to": "That this bill be now read a third time."})
        other = correction(id="federal-representatives-1")  # not a question: ignored here
        missing = correction(id="nsw-lc-9", field="question", **{"from": "x", "to": "y"})
        self.assertEqual(X.corrected_questions(db, [entry, other, missing]),
                         {"nsw-lc-1": "That this bill be now read a third time."})
        stale = dict(entry, **{"from": "Something else"})
        with self.assertRaises(CorrectionError):
            X.corrected_questions(db, [stale])

    def test_votes_guard_allows_a_drop_only_up_to_the_persons_duplicate_votes(self):
        person = {"name": "Alex Example", "party": "Labor", "jurisdiction": "federal", "house": "senate",
                  "ayes": 5, "noes": 3, "divisions_total": 8, "years": [2019, 2026], "for": [], "against": []}
        old = {"1": person, "2": dict(person, name="Bo Sample"),
               "_names": {"alex example": ["1"], "bo sample": ["2"]},
               "_meta": {"schema": 1, "content_changed_at": "2026-08-20T00:00:00Z",
                         "latest_division_date": "2026-08-20",
                         "latest_division_date_by_jurisdiction": {"federal": "2026-08-20"}}}
        new = deepcopy(old)
        new["1"].update(ayes=3, divisions_total=6)
        G.votes_guard(old, new, {"1": 2})
        with self.assertRaises(ValueError):  # no allowance, no drop
            G.votes_guard(old, new)
        with self.assertRaises(ValueError):  # another person's allowance does not cover this one
            G.votes_guard(old, new, {"2": 2})
        new["1"].update(ayes=2, divisions_total=5)
        with self.assertRaises(ValueError):  # more than the person's duplicate votes
            G.votes_guard(old, new, {"1": 2})

    def test_guard_allowance_reads_the_database(self):
        self.assertEqual(G.duplicate_allowance("/nonexistent/parli.db"), {})
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "parli.db"
            disk = sqlite3.connect(path)
            source = self.fixture()
            source.commit()
            source.backup(disk)
            disk.close()
            self.assertEqual(G.duplicate_allowance(str(path)), {"1": 1, "2": 1})


if __name__ == "__main__":
    unittest.main()
