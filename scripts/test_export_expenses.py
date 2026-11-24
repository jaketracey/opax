"""The expenses export publishes only person ids every shipped app can read.

    python3 -m pytest -q scripts/test_export_expenses.py

On 23 Nov 2026 a new senator still on a provisional roster id ('aph_25813') was published as a
`people` key; the apps key that map on an all-digit id and refused the whole of it.
"""
import contextlib
import io
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts import export_expenses as ee  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
ROW = ("Domestic Travel", "Travel", "Fares", "Flight", "2026-08-01", "Jul-Sep 2026", "2026Q03", "2026-07-01")


def export(members, expenses):
    """Run the real export over a throwaway database; (published file, what it printed)."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "parli.db"
        db = sqlite3.connect(path)
        db.execute("CREATE TABLE members (person_id TEXT, full_name TEXT, left_house TEXT)")
        db.execute("CREATE TABLE ext_expenses (member_name TEXT, person_id TEXT, category TEXT, category_major TEXT, "
                   "category_minor TEXT, description TEXT, from_date TEXT, reporting_period TEXT, "
                   "reporting_period_id TEXT, period_start TEXT, amount REAL, source_url TEXT)")
        db.executemany("INSERT INTO members VALUES (?,?,NULL)", members)
        db.executemany("INSERT INTO ext_expenses VALUES (?,?,?,?,?,?,?,?,?,?,?,'https://data.gov.au/x')",
                       [(name, pid, *ROW, amount) for name, pid, amount in expenses])
        db.commit()
        db.close()

        class Out(io.StringIO):
            buffer = io.BytesIO()
        out, err, was = Out(), io.StringIO(), (ee.DB, sys.stdout)
        ee.DB = f"file:{path}?mode=ro"
        sys.stdout = out
        try:
            with contextlib.redirect_stderr(err):
                ee.main()
        finally:
            ee.DB, sys.stdout = was
        return json.loads(out.buffer.getvalue()), err.getvalue()


MEMBERS = [("10007", "Anthony Albanese"), ("aph_25813", "Vanessa Bleyer"), ("aph_99999", "New Member")]
EXPENSES = [("Anthony Albanese", "10007", 100.0), ("Senator Vanessa Bleyer", "aph_25813", 40.0),
            ("New Member MP", "aph_99999", 7.0)]


class AppReadableIds(unittest.TestCase):
    def test_a_reviewed_provisional_id_files_under_the_persons_numeric_id(self):
        doc, _ = export(MEMBERS, EXPENSES)
        self.assertEqual(doc["people"]["11065"]["name"], "Vanessa Bleyer")
        self.assertEqual(doc["people"]["11065"]["total"], 40)
        self.assertEqual(doc["names"]["vanessa bleyer"], "11065")
        self.assertNotIn("aph_25813", doc["people"])

    def test_both_ids_of_one_person_are_one_entry(self):
        doc, _ = export(MEMBERS + [("11065", "Vanessa Bleyer")],
                        EXPENSES + [("Senator Vanessa Bleyer", "11065", 2.0)])
        self.assertEqual((doc["people"]["11065"]["total"], doc["people"]["11065"]["lines"]), (42, 2))

    def test_any_other_non_numeric_id_is_held_out_and_said_so_not_published_and_not_a_crash(self):
        doc, printed = export(MEMBERS, EXPENSES)
        self.assertEqual(sorted(doc["people"]), ["10007", "11065"])
        self.assertTrue(all(pid.isdigit() for pid in doc["names"].values()), doc["names"])
        self.assertNotIn("new member", doc["names"])
        self.assertEqual(doc["meta"]["people"], 2)
        self.assertEqual(doc["meta"]["rows"], 3)  # the source rows read, held or not
        self.assertIn("HELD 1 people without an all-digit person id, left out of expenses.json ($7 in total): "
                      "aph_99999 New Member", printed)

    def test_nothing_is_held_when_every_id_is_numeric(self):
        doc, printed = export(MEMBERS[:1], EXPENSES[:1])
        self.assertEqual(list(doc["people"]), ["10007"])
        self.assertNotIn("HELD", printed)

    def test_hold_keeps_everything_else_as_it_was(self):
        people = {"10007": {"name": "A", "total": 1}, "aph_1": {"name": "B", "total": 2}, "n-x": {"name": "C", "total": 3}}
        names = {"a": "10007", "b": "aph_1", "c": "n-x"}
        kept, kept_names, held = ee.hold_unreadable_ids(people, names)
        self.assertEqual((kept, kept_names, sorted(held)), ({"10007": people["10007"]}, {"a": "10007"}, ["aph_1", "n-x"]))


class PublishedFile(unittest.TestCase):
    def test_the_committed_file_has_only_ids_the_apps_read(self):
        doc = json.loads((ROOT / "portal/public/expenses.json").read_text(encoding="utf-8"))
        self.assertEqual([k for k in doc["people"] if not k.isdigit()], [])
        self.assertEqual({k: v for k, v in doc["names"].items() if not str(v).isdigit()}, {})
        self.assertLessEqual(set(doc["names"].values()), set(doc["people"]))
        self.assertEqual(doc["meta"]["people"], len(doc["people"]))


if __name__ == "__main__":
    unittest.main()
