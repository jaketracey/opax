"""Run with: python -m unittest scripts/test_export_expenses_itemised.py

scripts/export_expenses_itemised.py writes every IPEA line per person and reporting year. Whoever
travelled is a role only: no file may carry a traveller's name, whatever the source rows hold.
"""

import importlib.util
import io
import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_spec = importlib.util.spec_from_file_location("export_expenses_itemised", ROOT / "scripts/export_expenses_itemised.py")
X = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(X)

COLS = ["id", "unique_id", "member_name", "person_id", "reporting_period_id", "reporting_period", "source_url",
        "traveller_name", "from_date", "to_date", "category", "category_high", "category_major", "category_minor",
        "description", "from_location", "to_location", "nights", "nightly_rate", "amount", "trip_sequence",
        "leg_number", "reason", "notes"]
URL_Q2 = "https://data.gov.au/data/dataset/current-and-former-parliamentarians-expenditure-1-april-to-30-june-2026"
URL_Q3 = "https://data.gov.au/data/dataset/current-and-former-parliamentarians-expenditure-1-july-to-30-september-2026"
SECRET = "Zebedee Quillfeather"   # a traveller who is not the member; must never reach a file


def row(n, **kw):
    base = dict(id=n, unique_id=f"{n:020d}", member_name="Ms Jane SMITH MP", person_id="P1",
                reporting_period_id="2026Q02", reporting_period="Apr-Jun 2026", source_url=URL_Q2,
                traveller_name="Jane SMITH", from_date=None, to_date=None, category="Domestic Travel",
                category_high="Scheduled Commercial Transport", category_major="Fares", category_minor=None,
                description="Canberra to Sydney 13 Apr 26", from_location="Canberra", to_location="Sydney",
                nights=None, nightly_rate=None, amount=120.5, trip_sequence="0000000001", leg_number="01",
                reason=None, notes=None)
    base.update(kw)
    return [base[c] for c in COLS]


ROWS = [
    row(1),
    row(2, category_high="Travel Allowance", category_major="Travel Allowance", description="Parliamentary Duties",
        from_date="2026-05-10", to_date="2026-05-12", from_location=None, to_location="Canberra", nights=2,
        nightly_rate=322.0, amount=644.0, trip_sequence=None, leg_number=None),
    row(3, traveller_name="Family Traveller", category_high="Family or Nominee Travel",
        category_major="Scheduled Commercial Transport", amount=310.0),
    row(4, traveller_name=SECRET, category_high="Family or Nominee Travel", category_major="COMCAR",
        description=f"Car for {SECRET}", notes="Quillfeather, airport transfer", amount=88.0),
    row(5, traveller_name=SECRET, category_high="Employee Travel", category_major="Domestic Travel",
        description="Aggregated Total", reason="Official travel", amount=1500.25),
    row(6, amount=-120.5, notes="Refunded."),
    row(7, reporting_period_id="2026Q03", reporting_period="Jul-Sep 2026", source_url=URL_Q3, amount=75.0),
    row(8, reporting_period_id="2025Q04", reporting_period="Oct-Dec 2025", source_url="https://data.gov.au/x", amount=10.0),
    row(9, member_name="The Hon John CITIZEN MP", person_id=None, traveller_name="John CITIZEN", amount=5.0),
    row(10, member_name="Support Unit", person_id=None, traveller_name=None, amount=99.0),
    row(11, amount=None),
]


def run(rows=ROWS):
    """Export `rows` and return ({relative path: parsed file}, {relative path: bytes}, counts)."""
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "parli.db"
        db = sqlite3.connect(path)
        db.execute("CREATE TABLE members (person_id TEXT, full_name TEXT, left_house TEXT)")
        db.executemany("INSERT INTO members VALUES (?, ?, NULL)", [("P1", "Jane Smith"), ("P2", "John Citizen")])
        db.execute(f"CREATE TABLE ext_expenses ({', '.join(COLS)})")
        db.executemany(f"INSERT INTO ext_expenses VALUES ({','.join('?' for _ in COLS)})", rows)
        db.commit()
        out = Path(d) / "tree"
        counts = X.export(db, out)
        db.close()
        raw = {str(f.relative_to(out)): f.read_bytes() for f in sorted(out.rglob("*.json"))}
        return {k: json.loads(v) for k, v in raw.items()}, raw, counts


class ItemisedExportTests(unittest.TestCase):
    def test_one_file_per_person_and_reporting_year(self):
        docs, _, counts = run()
        self.assertEqual(sorted(docs), ["P1/2025.json", "P1/2026.json", "P2/2026.json"])
        self.assertEqual(counts["files"], 3)
        self.assertEqual(counts["lines"], 9)            # 11 rows less the unlinked unit and the amountless line
        self.assertEqual(counts["skipped_lines"], 1)
        self.assertEqual(docs["P2/2026.json"]["meta"]["name"], "John Citizen")   # resolved by name, as expenses.json does

    def test_lines_keep_ipeas_order_fields_and_amounts(self):
        doc = run()[0]["P1/2026.json"]
        self.assertEqual(doc["columns"], X.COLUMNS)
        lines = [dict(zip(doc["columns"], line)) for line in doc["lines"]]
        self.assertEqual([l["amount"] for l in lines], [120.5, 644.0, 310.0, 88.0, 1500.25, -120.5, 75.0])
        fare, allowance = lines[0], lines[1]
        self.assertEqual((fare["quarter"], fare["from_location"], fare["to_location"], fare["trip"], fare["leg"]),
                         ("2026Q02", "Canberra", "Sydney", "0000000001", "01"))
        self.assertEqual((allowance["from_date"], allowance["to_date"], allowance["nights"], allowance["nightly_rate"]),
                         ("2026-05-10", "2026-05-12", 2, 322.0))
        self.assertEqual((fare["category_high"], fare["category_major"]), ("Scheduled Commercial Transport", "Fares"))
        meta = doc["meta"]
        self.assertEqual(meta["lines"], 7)
        self.assertEqual(meta["total"], 2617.25)
        self.assertEqual(meta["quarters"], [{"id": "2026Q02", "label": "Apr-Jun 2026", "source_url": URL_Q2},
                                            {"id": "2026Q03", "label": "Jul-Sep 2026", "source_url": URL_Q3}])
        self.assertEqual(meta["licence"], "CC BY 3.0 AU")
        self.assertIn("Independent Parliamentary Expenses Authority", meta["attribution"])

    def test_traveller_is_a_role_only(self):
        doc = run()[0]["P1/2026.json"]
        roles = [dict(zip(doc["columns"], line))["traveller"] for line in doc["lines"]]
        self.assertEqual(roles, ["Member", "Member", "Family member", "Family member", "Staff", "Member", "Member"])
        self.assertTrue(set(roles) <= set(X.ROLES))

    def test_no_traveller_name_is_ever_written(self):
        docs, raw, _ = run()
        for path, blob in raw.items():
            text = blob.decode("utf-8").lower()
            for needle in (SECRET.lower(), "zebedee", "quillfeather", "family traveller", "traveller_name"):
                self.assertNotIn(needle, text, f"{path} carries {needle!r}")
        for doc in docs.values():
            # the only traveller field is the role column, and it holds nothing but the three roles
            self.assertEqual([c for c in doc["columns"] if "travel" in c.lower() or "user" in c.lower()], ["traveller"])
            at = doc["columns"].index("traveller")
            self.assertTrue(all(line[at] in X.ROLES for line in doc["lines"]))
            self.assertNotIn("traveller_name", json.dumps(doc["meta"]))
        # the family line whose free text named the traveller lost that text, not its amount
        line = dict(zip(docs["P1/2026.json"]["columns"], docs["P1/2026.json"]["lines"][3]))
        self.assertEqual((line["description"], line["notes"], line["amount"]), (None, None, 88.0))

    def test_a_members_own_name_in_their_own_line_is_kept(self):
        # some quarters publish the member's first name differently in the traveller column
        docs, _, _ = run([row(1, traveller_name="Janey SMITH", description="Office of Jane Smith, printing")])
        line = dict(zip(X.COLUMNS, docs["P1/2026.json"]["lines"][0]))
        self.assertEqual((line["traveller"], line["description"]), ("Member", "Office of Jane Smith, printing"))

    def test_unchanged_data_writes_identical_bytes(self):
        self.assertEqual(run()[1], run()[1])
        for blob in run()[1].values():
            self.assertNotIn(b"generated", blob)

    def test_an_empty_table_keeps_the_last_tree(self):
        with tempfile.TemporaryDirectory() as d:
            db = sqlite3.connect(Path(d) / "parli.db")
            db.execute("CREATE TABLE members (person_id TEXT, full_name TEXT, left_house TEXT)")
            db.execute(f"CREATE TABLE ext_expenses ({', '.join(COLS)})")
            out = Path(d) / "tree"
            (out / "P1").mkdir(parents=True)
            (out / "P1/2026.json").write_text("{}")
            with self.assertRaises(SystemExit), redirect_stderr(io.StringIO()):
                X.export(db, out)
            db.close()
            self.assertTrue((out / "P1/2026.json").exists())

    def test_an_unsafe_person_id_is_refused(self):
        with self.assertRaises(SystemExit), redirect_stderr(io.StringIO()):
            X.safe_id("../etc")
        self.assertEqual(X.safe_id("person_0a1b"), "person_0a1b")


if __name__ == "__main__":
    unittest.main()
