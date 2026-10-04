"""Run with: python -m unittest discover -s tests -p test_export_expenses.py

scripts/export_expenses.py states the IPEA datasets' own licence (CC BY 3.0 AU on data.gov.au; the
CC BY 4.0 notice on ipea.gov.au covers the website), taken from the loader's one constant, and the
loader refuses a quarter whose CKAN record says otherwise.
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

    def test_licence_title_matches_data_gov_au(self):
        # package_show on every IPEA quarter: license_id cc-by, license_title as below (checked 2026-10-04)
        self.assertEqual(money_ipea.LICENCE_TITLE, "Creative Commons Attribution 3.0 Australia")

    def test_loader_flags_a_quarter_whose_ckan_licence_differs(self):
        same = {"quarter": "2026q01", "licence_title": "Creative Commons Attribution 3.0 Australia"}
        other = {"quarter": "2026q02", "licence_title": "Creative Commons Attribution 4.0 International"}
        missing = {"quarter": "2026q03", "licence_title": None}
        self.assertEqual(money_ipea.licence_mismatches([same, other, missing]), [other, missing])


if __name__ == "__main__":
    unittest.main()
