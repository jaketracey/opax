"""Read-only export contracts and honest, bounded recorded-vote coverage."""

import importlib.util
import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


D = load("export_division_pages")


class DivisionExportTests(unittest.TestCase):
    def test_published_parties_follow_a_mid_term_switch_and_refresh_idempotently(self):
        v = D.vote_parties
        evidence = v.Evidence([
            v.entry("service", "representatives", ("name", "avery fixture"), ["Avery Fixture"],
                    "Labor", "2022-05-21", "2024-02-01", url="https://example.test/service"),
            v.entry("service", "representatives", ("name", "avery fixture"), ["Avery Fixture"],
                    "Independent", "2024-02-01", "2025-05-03", url="https://example.test/service"),
        ])
        records = {}
        for i, day in enumerate(["2024-01-31", "2024-02-01"]):
            key = f"federal-representatives-fixture-{i}"
            records[key] = {"key": key, "slug": f"division-{key}", "house": "representatives",
                            "jurisdiction": "federal", "date": day, "name": "Fixture motion",
                            "question": "That the motion be agreed to", "ayes": 1, "noes": 0,
                            "members": [{"name": "Avery Fixture", "vote": "aye", "party": "Independent"}],
                            "_meta": {"member_coverage": "recorded"}}
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            D.write_projection(records, out)
            # A retained source-fact hold belongs to the original observation.
            path = out / f"{records[next(iter(records))]['slug']}.json"
            held = json.loads(path.read_text())
            held["_meta"].update(refresh_retained=True, refresh_retained_reason="source-facts-changed")
            path.write_text(json.dumps(held))
            with patch("sys.argv", ["export_division_pages.py", "--refresh-parties", "--out", str(out)]), \
                    patch.object(D.vote_parties, "load_evidence", return_value=evidence), \
                    patch.object(D.sqlite3, "connect", side_effect=AssertionError("offline refresh opened a DB")):
                D.main()
            refreshed = D.read_previous_projection(out)
            members = [r["members"][0] for r in refreshed.values()]
            self.assertEqual([m["party"] for m in members], ["Labor", "Independent"])
            self.assertEqual(members[0]["party_source"]["source_party"], "Independent")
            index = json.loads((out / "index.json").read_text())
            self.assertEqual(index["coverage"]["party_corrected_count"], 1)
            self.assertEqual(index["coverage"]["retained_by_reason"], {"source-facts-changed": 1})
            self.assertEqual({r["date"]: r["party_tallies"][0]["party"] for r in index["divisions"]},
                             {"2024-01-31": "Labor", "2024-02-01": "Independent"})
            before = {p.name: p.read_bytes() for p in out.glob("*.json")}
            D.write_projection(D.read_previous_projection(out), out, party_evidence=evidence, party_refresh=True)
            self.assertEqual({p.name: p.read_bytes() for p in out.glob("*.json")}, before)
            # A refresh without the dated files keeps the complete published
            # result, including provenance and the coverage explanation.
            D.write_projection(D.read_previous_projection(out), out, party_refresh=True)
            self.assertEqual({p.name: p.read_bytes() for p in out.glob("*.json")}, before)

    def test_published_bill_projection_retains_facts_and_exact_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            (directory / "example.json").write_text(json.dumps({
                "key": "example-bill", "title": "Example Bill", "jurisdiction": "federal",
                "divisions": [{"key": "federal-senate-1", "date": "2026-09-01", "house": "senate",
                               "question": "That the amendment be agreed to", "ayes": 20, "noes": 30,
                               "outcome": "negative", "url": "https://example.test/original"}]}))
            data = D.bill_projection(directory)["federal-senate-1"]
            self.assertEqual(data["slug"], "division-federal-senate-1")
            self.assertEqual((data["ayes"], data["noes"], data["result"]), (20, 30, "negative"))
            self.assertEqual(data["bills"][0]["url"], "/bill/example-bill")
            self.assertEqual(data["members"], [])
            self.assertEqual(data["_meta"]["member_coverage"], "unavailable")

    def fixture(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript("""
        CREATE TABLE ext_divisions (id TEXT, name TEXT, question TEXT, date TEXT, house TEXT,
         jurisdiction TEXT, ayes_count INT, noes_count INT, result TEXT, source_url TEXT);
        CREATE TABLE ext_votes (division_id TEXT, person_id TEXT, person_name TEXT, person_key TEXT,
         vote TEXT, jurisdiction TEXT, party TEXT);
        """)
        for i in range(1, 13):
            db.execute("INSERT INTO ext_divisions VALUES (?,?,?,?,?,?,?,?,?,?)", (
                f"federal-senate-{i}", f"Procedural division {i}", "That the amendment be agreed to",
                "2026-09-01", "senate", "federal", 1, 1, "negative", f"https://example.test/{i}"))
            for name, pid, vote in [("Alex Example", "123", "no"), ("Zoë O’Name", "124", "aye")]:
                db.execute("INSERT INTO ext_votes VALUES (?,?,?,?,?,?,?)", (
                    f"federal-senate-{i}", pid, name, name, vote, "federal", "Example Party"))
        return db

    def test_db_projection_has_named_raw_votes_with_matching_tally(self):
        with self.fixture() as db:
            data = D.database_projection(db, {})["federal-senate-12"]
        self.assertEqual(data["_meta"]["member_coverage"], "recorded")
        self.assertEqual([m["vote"] for m in data["members"]], ["no", "aye"])
        self.assertEqual(data["members"][1]["person_slug"], "zoe-oname")
        self.assertEqual(data["members"][1]["party"], "Example Party")

    def test_index_carries_dated_party_splits_without_member_names(self):
        with self.fixture() as db:
            records = D.database_projection(db, {})
        row = D.projection_index(D.guard_projection(records, {}))["divisions"][0]
        self.assertEqual(row["party_tallies"], [{"party": "Example Party", "votes": {"no": 1, "aye": 1}}])
        self.assertEqual((row["recorded_ayes"], row["recorded_noes"], row["unknown_party_count"]), (1, 1, 0))
        self.assertNotIn("members", row)

    def test_verified_source_snapshot_dropped_when_tally_changes(self):
        original = {"key": "example", "date": "2026-09-01", "house": "senate", "ayes": 1,
                    "noes": 0, "source_url": "https://example.test/source", "members": [{"name": "Alex", "vote": "aye"}],
                    "_meta": {"member_coverage": "recorded", "member_source_url": "https://example.test/source"}}
        matching = {**original, "members": [], "_meta": {"member_coverage": "unavailable"}}
        D.carry_verified_members(matching, original)
        self.assertEqual(matching["members"], original["members"])
        changed = {**original, "ayes": 2, "members": [], "_meta": {"member_coverage": "unavailable"}}
        D.carry_verified_members(changed, original)
        self.assertEqual(changed["members"], [])

    def test_missing_database_readonly_does_not_create_a_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "missing.db"
            with self.assertRaises(sqlite3.OperationalError):
                sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            self.assertFalse(db.exists())

    def test_committed_verified_division_has_actual_members_and_matching_tally(self):
        data = json.loads((ROOT / "portal/public/divisions/division-federal-senate-10701.json").read_text())
        self.assertEqual(data["_meta"]["member_coverage"], "recorded")
        self.assertEqual(data["_meta"]["member_source_url"], data["source_url"])
        members = {m["name"]: m["vote"] for m in data["members"]}
        self.assertEqual(len(members), 76)
        self.assertEqual(members["David Pocock"], "aye")
        self.assertEqual(members["Michelle Ananda-Rajah"], "no")
        self.assertEqual(sum(v == "aye" for v in members.values()), data["ayes"])
        self.assertEqual(sum(v == "no" for v in members.values()), data["noes"])



if __name__ == "__main__":
    unittest.main()
