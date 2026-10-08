"""Read-only export contracts and honest, bounded recorded-vote coverage."""

import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


D = load("export_division_pages")
V = load("export_votes")


class DivisionExportTests(unittest.TestCase):
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
         vote TEXT, jurisdiction TEXT);
        """)
        for i in range(1, 13):
            db.execute("INSERT INTO ext_divisions VALUES (?,?,?,?,?,?,?,?,?,?)", (
                f"federal-senate-{i}", f"Procedural division {i}", "That the amendment be agreed to",
                "2026-09-01", "senate", "federal", 1, 1, "negative", f"https://example.test/{i}"))
            for name, pid, vote in [("Alex Example", "123", "no"), ("Zoë O’Name", "124", "aye")]:
                db.execute("INSERT INTO ext_votes VALUES (?,?,?,?,?,?)", (
                    f"federal-senate-{i}", pid, name, name, vote, "federal"))
        return db

    def test_db_projection_has_named_raw_votes_with_matching_tally(self):
        with self.fixture() as db:
            data = D.database_projection(db, {})["federal-senate-12"]
        self.assertEqual(data["_meta"]["member_coverage"], "recorded")
        self.assertEqual([m["vote"] for m in data["members"]], ["no", "aye"])
        self.assertEqual(data["members"][1]["person_slug"], "zoe-oname")

    def test_recent_votes_are_actual_procedural_votes_bounded_to_ten(self):
        out = {"123": {"name": "Alex Example", "jurisdiction": "federal", "for": [], "against": []}}
        with self.fixture() as db:
            V.export_recent(db, out)
        recent = out["123"]["recent"]
        self.assertEqual(len(recent), 10)
        self.assertEqual([r["division_id"] for r in recent], [f"federal-senate-{i}" for i in range(12, 2, -1)])
        self.assertTrue(all(r["vote"] == "no" for r in recent))
        self.assertEqual(recent[0]["division_slug"], "division-federal-senate-12")
        self.assertEqual(recent[0]["source_url"], "https://example.test/12")
        self.assertEqual(out["123"]["for"], [])

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

    def test_partial_recent_sample_is_ten_actual_votes_and_declares_coverage(self):
        data = json.loads((ROOT / "portal/public/votes.json").read_text())
        recent = data["10007"]["recent"]
        self.assertEqual(len(recent), 10)
        self.assertEqual(len({r["source_url"] for r in recent}), 10)
        self.assertEqual([r["date"] for r in recent], sorted((r["date"] for r in recent), reverse=True))
        self.assertTrue(all(r["vote"] in ("aye", "no") for r in recent))
        self.assertEqual(recent[0]["vote"], "aye")
        self.assertEqual(recent[1]["vote"], "no")
        self.assertEqual(data["_meta"]["partial_recent_coverage"]["person_ids"], ["10007"])


if __name__ == "__main__":
    unittest.main()
