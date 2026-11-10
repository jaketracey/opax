"""Run with: python -m unittest discover -s tests -p test_export_expenses.py

scripts/export_expenses.py states the IPEA datasets' own licence (CC BY 3.0 AU on data.gov.au; the
CC BY 4.0 notice on ipea.gov.au covers the website), taken from the loader's one constant, and the
loader judges a CKAN record by its licence id and URL, not the title's spelling.
"""

import importlib.util
import io
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parli.ingest import money_ipea  # noqa: E402

_spec = importlib.util.spec_from_file_location("export_expenses", ROOT / "scripts/export_expenses.py")
X = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(X)

COLS = ["member_name", "person_id", "category", "category_major", "category_minor", "description",
        "from_date", "reporting_period", "reporting_period_id", "period_start", "amount", "source_url"]


def export(rows):
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "parli.db"
        db = sqlite3.connect(path)
        db.execute("CREATE TABLE members (person_id TEXT, full_name TEXT, left_house TEXT)")
        db.execute("INSERT INTO members VALUES ('P1', 'Jane Smith', NULL)")
        db.execute(f"CREATE TABLE ext_expenses ({', '.join(COLS)})")
        db.executemany(f"INSERT INTO ext_expenses VALUES ({','.join('?' for _ in COLS)})", rows)
        db.commit()
        db.close()
        out = io.TextIOWrapper(io.BytesIO(), encoding="utf-8")
        with mock.patch.object(X, "DB", f"file:{path}?mode=ro"), mock.patch.object(sys, "stdout", out), \
                mock.patch.object(sys, "stderr", io.StringIO()):
            X.main()
        return json.loads(out.buffer.getvalue())


class LicenceTests(unittest.TestCase):
    URL = "https://data.gov.au/data/dataset/current-and-former-parliamentarians-expenditure-1-april-to-30-june-2026"
    ROW = ["Ms Jane Smith", "P1", "Domestic Travel", "Travel", "Fares", "Canberra", None, "Apr-Jun 2026",
           "2026Q02", "2026-04-01", 120.0, URL]

    def test_meta_states_the_datasets_licence_from_the_loader(self):
        meta = export([self.ROW])["meta"]
        self.assertEqual(meta["licence"], "CC BY 3.0 AU")
        self.assertEqual(meta["licence"], money_ipea.LICENCE)
        self.assertEqual(meta["licence_url"], "https://creativecommons.org/licenses/by/3.0/au/")
        self.assertIn("CC BY 3.0 AU", meta["source"])
        self.assertNotIn("4.0", meta["source"] + meta["licence"] + meta["attribution"])
        # the credit CC BY 3.0 AU asks for: author, work, licence and its URI
        for part in ("Independent Parliamentary Expenses Authority", "Current and Former Parliamentarians’ Expenditure",
                     "CC BY 3.0 AU", money_ipea.LICENCE_URL):
            self.assertIn(part, meta["attribution"])
        self.assertEqual(meta["source_url"], self.URL)

    def test_licence_identity_matches_data_gov_au(self):
        # package_show on every IPEA quarter (checked 2026-10-04): license_id cc-by, license_title as below,
        # license_url http://creativecommons.org/licenses/by/3.0/au/
        self.assertEqual(money_ipea.LICENCE_ID, "cc-by")
        self.assertEqual(money_ipea.LICENCE_TITLE, "Creative Commons Attribution 3.0 Australia")
        live = {"licence": "cc-by", "licence_title": money_ipea.LICENCE_TITLE,
                "licence_url": "http://creativecommons.org/licenses/by/3.0/au/"}
        self.assertIsNone(money_ipea.licence_problem(live))

    def test_loader_compares_the_licence_id_and_url_not_the_title_spelling(self):
        ok = {"licence": "cc-by", "licence_title": "Creative Commons Attribution 3.0 Australia",
              "licence_url": "http://creativecommons.org/licenses/by/3.0/au/"}
        for same in ({"licence_title": "creative commons  attribution 3.0 australia "}, {"licence": " CC-BY"},
                     {"licence_url": "https://www.creativecommons.org/licenses/by/3.0/au"}, {"licence_url": None}):
            self.assertIsNone(money_ipea.licence_problem(dict(ok, **same)), same)
        self.assertFalse(money_ipea.title_differs(dict(ok, licence_title=" creative commons  ATTRIBUTION 3.0 australia")))
        self.assertTrue(money_ipea.title_differs(dict(ok, licence_title="Creative Commons Attribution 4.0 International")))
        for other in ({"licence": "cc-by-4.0"}, {"licence": None},
                      {"licence_url": "https://creativecommons.org/licenses/by/4.0/"}):
            self.assertIsNotNone(money_ipea.licence_problem(dict(ok, **other)), other)


class ReportingYearTests(unittest.TestCase):
    def test_financial_year_uses_reporting_quarters_and_keeps_adjustments(self):
        rows = []
        # Transaction dates deliberately fall in a different reporting year.
        for period, start, amount in [
                ("2024Q02", "2024-04-01", 99.0),
                ("2024Q03", "2024-07-01", 100.4),
                ("2024Q04", "2024-10-01", 200.4),
                ("2025Q01", "2025-01-01", -20.0),
                ("2025Q02", "2025-04-01", 300.4),
                ("2025Q03", "2025-07-01", 400.0)]:
            rows.append(["Ms Jane Smith", "P1", "Fares", "Travel", "Fares", "Fixture",
                         "2023-01-01", period, period, start, amount, LicenceTests.URL])
        result = export(rows)
        person = result["people"]["P1"]
        self.assertEqual(person["by_year"], [[2024, 400], [2025, 680]])
        # Round the raw line sum once, rather than summing rounded quarters.
        self.assertEqual(person["by_financial_year"], [["2023-24", 99], ["2024-25", 581], ["2025-26", 400]])
        self.assertEqual(result["meta"]["reporting_periods"], [row[8] for row in rows])

    def test_period_inventory_does_not_fill_a_missing_quarter(self):
        rows = [LicenceTests.ROW.copy(), LicenceTests.ROW.copy()]
        rows[0][8:10] = ["2025Q04", "2025-10-01"]
        result = export(rows)
        self.assertEqual(result["meta"]["reporting_periods"], ["2025Q04", "2026Q02"])


class NetAdjustmentTests(unittest.TestCase):
    """registers-002: categories that net below zero are summed beside by_category, not drawn in it."""

    def row(self, category, amount, period="2026Q02", start="2026-04-01"):
        return ["Ms Jane Smith", "P1", category, "Travel", "Fares", "Fixture", None, period, period, start,
                amount, LicenceTests.URL]

    def test_negative_net_categories_reconcile_through_net_adjustments(self):
        person = export([self.row("Office", 1000.4), self.row("Travel", 200.0),
                         self.row("Parliamentary Duties", 50.0), self.row("Parliamentary Duties", -9356.0)])["people"]["P1"]
        self.assertEqual(person["by_category"], [["Office", 1000], ["Travel", 200]])
        self.assertEqual(person["net_adjustments"], -9306)
        self.assertEqual(person["total"], 1000 + 200 - 9306)
        self.assertLessEqual(abs(sum(v for _, v in person["by_category"]) + person["net_adjustments"] - person["total"]),
                             len(person["by_category"]) + 1)

    def test_repayment_only_person_and_meta_note(self):
        # a member who left before April 2017 appears only through a later repayment (Joe Hockey, 2017Q02)
        result = export([self.row("Employee Costs", -645.26, "2017Q02", "2017-04-01")])
        person = result["people"]["P1"]
        self.assertEqual((person["total"], person["by_category"], person["net_adjustments"]), (-645, [], -645))
        self.assertIn("net_adjustments", result["meta"]["notes"][0])

    def test_no_field_when_nothing_nets_below_zero(self):
        person = export([self.row("Office", 100.0), self.row("Office", -20.0)])["people"]["P1"]
        self.assertNotIn("net_adjustments", person)
        self.assertEqual(person["by_category"], [["Office", 80]])


if __name__ == "__main__":
    unittest.main()
