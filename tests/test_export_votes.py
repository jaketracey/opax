"""Run with: python -m unittest discover -s tests -p test_export_votes.py

scripts/export_votes.py against a small synthetic parli.db: the `_meta` entry (types, the newest
division actually counted, the empty case), and every other byte of the file exactly as the export
wrote it before `_meta` existed. tests/fixtures/export_votes/pre_meta.json is that earlier output on
the fixture below, written by the script as of 793d5807; if the record shape changes on purpose,
regenerate it from build_fixture() and say so in the commit.
"""

import contextlib
import importlib.util
import io
import json
import re
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "export_votes", Path(__file__).resolve().parents[1] / "scripts/export_votes.py")
X = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(X)

GOLDEN = Path(__file__).parent / "fixtures" / "export_votes" / "pre_meta.json"

DDL = """
CREATE TABLE members (person_id TEXT, full_name TEXT, party_canonical TEXT, party TEXT, chamber TEXT);
CREATE TABLE divisions (division_id TEXT, name TEXT, date TEXT, rebellions INTEGER, summary TEXT, state TEXT);
CREATE TABLE votes (person_id TEXT, division_id TEXT, vote TEXT);
CREATE TABLE ext_divisions (id TEXT, jurisdiction TEXT, name TEXT, question TEXT, bill_ref TEXT, date TEXT, extra TEXT);
CREATE TABLE ext_votes (jurisdiction TEXT, house TEXT, person_key TEXT, person_name TEXT, division_id TEXT,
                        vote TEXT, date TEXT, party TEXT);
"""

# Synthetic people and bills. Dates that must NOT reach latest_division_date: 2026-09-30 (federal: voted
# only by a person with no members row; nsw: a voter with no name), 2026-10-01 (no votes at all),
# 2026-09-29 (a state row in the legacy table), 2026-10-02 (a federal row in ext_votes).
MEMBERS = [
    ("90001", "Alex Example", "Labor", "Labor", "representatives"),
    ("90002", "Zoë Sample", None, "Greens", "senate"),
]
DIVISIONS = [
    ("d1", "Example Reform Bill 2024 - Second Reading - Read a second time", "2024-03-20", 0, "", None),
    ("d2", "Example Reform Bill 2024 - Third Reading - Pass the bill", "2024-03-21", 2, "", "federal"),
    ("d3", "Sample Levy Bill 2025 - Second Reading - Decline a second reading", "2025-06-11", 0, "", None),
    ("d4", "Motions - Example Inquiry - Agree", "2025-08-01", 0, "", None),
    ("d5", "Bills — Sample Amendment Bill 2026; Second Reading", "2026-08-12T10:00:00",
     0, "<p>That the bill be now read a second time.</p>", None),
    ("d6", "Sample Late Bill 2026 - Second Reading - Read a second time", "2026-09-30", 0, "", None),
    ("d7", "Unvoted Bill 2026 - Second Reading - Read a second time", "2026-10-01", 0, "", None),
    ("d8", "12 .... 34", "2026-07-01", 0, "", None),
    ("d9", "Undated Bill 2026 - Second Reading - Read a second time", None, 0, "", None),
    ("d10", "State Row Bill 2026 - Second Reading - Read a second time", "2026-09-29", 0, "", "nsw"),
]
VOTES = [
    ("90001", "d1", "aye"), ("90001", "d2", "aye"), ("90001", "d3", "no"), ("90001", "d4", "aye"),
    ("90001", "d5", "aye"), ("90001", "d8", "no"), ("90001", "d10", "aye"), ("90001", "d7", "abstain"),
    ("90002", "d1", "no"), ("90002", "d3", "aye"), ("90002", "d9", "aye"),
    ("90003", "d6", "aye"),
]
EXT_DIVISIONS = [
    ("nsw-2026-001", "nsw", "Sample Housing Bill 2026", "That this bill be now read a second time.",
     "Sample Housing Bill 2026", "2026-09-17", '{"divided_on": ""}'),
    ("nsw-2026-002", "nsw", "Sample Housing Bill 2026", "That the amendment be agreed to.",
     "Sample Housing Bill 2026", "2026-09-18", '{"divided_on": "amendment"}'),
    ("nsw-2026-003", "nsw", "Example Water Bill 2026", "That the bill be agreed to.",
     "Example Water Bill 2026", "2026-09-25", None),
    ("vic-2026-001", "vic", "Example Transport Bill 2026", "That the bill be agreed to.",
     "Example Transport Bill 2026", "2026-09-02", None),
    ("federal-2026-001", "federal", "Ignored Bill 2026", "That the bill be agreed to.",
     "Ignored Bill 2026", "2026-10-02", None),
]
EXT_VOTES = [
    ("nsw", "nsw_lc", "Casey Placeholder", "Casey Placeholder", "nsw-2026-001", "aye", "2026-09-17", "Labor"),
    ("nsw", "nsw_lc", "Casey Placeholder", "Casey Placeholder", "nsw-2026-002", "no", "2026-09-18", "Labor"),
    ("nsw", "nsw_lc", "Casey Placeholder", "Casey Placeholder", "nsw-2026-003", "paired", "2026-09-25", "Labor"),
    ("nsw", "nsw_la", "Alex Example", "Alex Example", "nsw-2026-003", "aye", "2026-09-25", None),
    ("nsw", "nsw_la", "Ghost Key", None, "nsw-2026-003", "no", "2026-09-30", None),
    ("vic", "vic_la", "Robin Fixture", "Robin Fixture", "vic-2026-001", "no", "2026-09-02", "Liberal"),
    ("vic", "vic_la", None, "No Key", "vic-2026-001", "aye", "2026-09-02", None),
    ("federal", "representatives", "Alex Example", "Alex Example", "federal-2026-001", "aye", "2026-10-02", None),
]


def build_fixture(path, empty=False):
    db = sqlite3.connect(path)
    db.executescript(DDL)
    if not empty:
        for table, rows in (("members", MEMBERS), ("divisions", DIVISIONS), ("votes", VOTES),
                            ("ext_divisions", EXT_DIVISIONS), ("ext_votes", EXT_VOTES)):
            db.executemany(f"INSERT INTO {table} VALUES ({','.join('?' * len(rows[0]))})", rows)
    db.commit()
    db.close()


def run_export(path):
    """main() against the fixture: (stdout, stderr) exactly as the nightly would capture them."""
    X.DB = "file:" + str(path) + "?mode=ro"
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        X.main()
    return out.getvalue(), err.getvalue()


def without_meta(raw, meta):
    """The file as it was before _meta: _meta is the last key, so drop exactly its bytes."""
    tail = ',"_meta":' + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + "}\n"
    assert raw.endswith(tail), "the _meta entry is not the last key, serialised as the rest of the file"
    return raw[: -len(tail)] + "}\n"


class ExportVotesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "parli.db"
        self._db = X.DB
        self.addCleanup(setattr, X, "DB", self._db)

    def export(self, empty=False):
        build_fixture(self.db, empty=empty)
        before = datetime.now(timezone.utc).replace(microsecond=0)
        raw, err = run_export(self.db)
        after = datetime.now(timezone.utc)
        return raw, err, json.loads(raw), (before, after)

    def test_meta_shape_and_types(self):
        _, _, data, (before, after) = self.export()
        meta = data["_meta"]
        self.assertEqual(list(meta), ["exported_at", "latest_division_date",
                                      "latest_division_date_by_jurisdiction", "schema"])
        self.assertRegex(meta["exported_at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        stamp = datetime.strptime(meta["exported_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        self.assertTrue(before <= stamp <= after + timedelta(seconds=1), (before, stamp, after))
        self.assertIsInstance(meta["schema"], int)
        self.assertNotIsInstance(meta["schema"], bool)
        self.assertEqual(meta["schema"], 1)
        self.assertIsInstance(meta["latest_division_date"], str)
        self.assertRegex(meta["latest_division_date"], r"^\d{4}-\d\d-\d\d$")
        self.assertIsInstance(meta["latest_division_date_by_jurisdiction"], dict)

    def test_latest_division_date_counts_only_exported_votes(self):
        _, _, data, _ = self.export()
        meta = data["_meta"]
        # federal: d5 (time suffix trimmed); not d6 (voter has no members row), d7 (no ayes/noes),
        # d10 (a state row in the legacy table), nor the federal row in ext_votes.
        # nsw: nsw-2026-003 via Alex Example; not the nameless 2026-09-30 voter.
        self.assertEqual(meta["latest_division_date_by_jurisdiction"],
                         {"federal": "2026-08-12", "nsw": "2026-09-25", "vic": "2026-09-02"})
        self.assertEqual(meta["latest_division_date"], "2026-09-25")
        newest_year = max(e["years"][1] for k, e in data.items() if not k.startswith("_") and "years" in e)
        self.assertEqual(int(meta["latest_division_date"][:4]), newest_year)

    def test_rest_of_file_is_byte_for_byte_the_previous_export(self):
        raw, _, data, _ = self.export()
        self.assertEqual(list(data)[-2:], ["_names", "_meta"])
        self.assertEqual(without_meta(raw, data["_meta"]), GOLDEN.read_text(encoding="utf-8"))

    def test_empty_database(self):
        raw, err, data, _ = self.export(empty=True)
        self.assertEqual(set(data), {"_names", "_meta"})
        self.assertEqual(data["_names"], {})
        meta = data["_meta"]
        self.assertIsNone(meta["latest_division_date"])
        self.assertEqual(meta["latest_division_date_by_jurisdiction"], {})
        self.assertEqual(meta["schema"], 1)
        self.assertRegex(meta["exported_at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        self.assertEqual(without_meta(raw, meta), '{"_names":{}}\n')  # what the export wrote before _meta
        self.assertIn("people 0 ", err)
        self.assertIn("latest division None", err)

    def test_summary_line_skips_meta(self):
        _, err, _, _ = self.export()
        self.assertTrue(err.startswith("people 5 ({'federal': 2, 'nsw': 2, 'vic': 1}), with listed bills 5,"), err)
        self.assertTrue(err.rstrip().endswith("names indexed 4, latest division 2026-09-25"), err)

    def test_meta_is_invisible_to_record_readers(self):
        """The web's readers: home-data.js keeps values with a `name`; app.js looks records up by key,
        never by "_meta"."""
        _, _, data, _ = self.export()
        self.assertNotIn("name", data["_meta"])
        pool = [v for v in data.values() if isinstance(v, dict) and v.get("name")]
        self.assertEqual(sorted(v["name"] for v in pool),
                         ["Alex Example", "Alex Example", "Casey Placeholder", "Robin Fixture", "Zoë Sample"])
        self.assertNotIn("_meta", {k for keys in data["_names"].values() for k in keys})


if __name__ == "__main__":
    unittest.main()
