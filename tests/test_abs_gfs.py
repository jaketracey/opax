"""Small synthetic cells following the official 55120DO002/003 layout."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from types import SimpleNamespace
from contextlib import redirect_stdout, redirect_stderr
from io import StringIO

from scripts.abs_gfs.parse import CC, classification, key, parse_sheet, reconcile, parse_net_debt
from scripts.abs_gfs.stage import projection


def document():
    return {"id": "55120DO003_202425", "title": "Table 231. General government - state - New South Wales",
            "url": "https://www.abs.gov.au/statistics/economy/government/government-finance-statistics-annual/2024-25/55120DO003_202425.xlsx",
            "release": "2024-25", "release_date": "2026-04-21", "status": "cleared", "exceptions": [],
            "dimensions": classification("Table 231. General government - state - New South Wales"),
            "receipt": {"status": 200, "challenge": False, "sha256": "a" * 64, "snapshot": "2026-10-17T00:00:00Z"},
            "licence": {"status": "open", "url": CC, "workbook_reviewed": True}}


def grid():
    return [["Australian Bureau of Statistics"], ["55120DO003_202425"], ["Release"],
            ["Table 1 New South Wales State General Government Operating Statement"],
            [None, "2023-24", "2024-25"], [None, "$m", "$m"], ["GFS Revenue"],
            ["Total GFS revenue", 100, 121], ["Total GFS expenses", 90, 100],
            ["GFS Net operating balance", 10, 20], ["Total net acquisition of non-financial assets", 4, 5],
            ["GFS NET LENDING(+)/BORROWING(-)", 6, 15]]


class GFSTest(unittest.TestCase):
    def test_official_layout_retains_cells_years_original_units(self):
        rows = parse_sheet(grid(), "Table_1", document())
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[0]["cell"], "B8")
        self.assertEqual(rows[0]["value"], 100)
        self.assertEqual(rows[0]["unit"], "AUD million")
        self.assertEqual(rows[0]["reference_year"], "2023-24")
        self.assertEqual(rows[0]["consolidation"], document()["title"])

    def test_consolidation_classification_is_not_inferred_by_addition(self):
        self.assertEqual(classification("Table 239. General government - state - total state")["jurisdiction"], "Australia")
        self.assertEqual(classification("Table 531. General government - state and local - New South Wales")["level_of_government"], "State and local")
        self.assertEqual(classification("Table 449. Non-financial public sector - control n.f.d. - total")["sector"], "Non-financial public sector")
        self.assertIsNone(classification("Table 000. All levels of government by sector"))

    def test_reconcile_with_rounding_and_negative_values(self):
        checks = reconcile(parse_sheet(grid(), "Table_1", document()))
        self.assertEqual(len(checks), 4)
        self.assertTrue(all(c["status"] == "pass" for c in checks))
        self.assertIn(1, [c["delta_million"] for c in checks])

    def test_reconciliation_failure_is_visible(self):
        g = grid(); g[7][2] = 124
        self.assertIn("fail", [c["status"] for c in reconcile(parse_sheet(g, "Table_1", document()))])

    def test_null_not_zero_and_no_false_reconciliation_pass(self):
        g = grid(); g[7][1] = "np"; g[7][2] = 0
        rows = parse_sheet(g, "Table_1", document())
        self.assertIsNone(rows[0]["value"])
        self.assertEqual(rows[0]["source_marker"], "np")
        self.assertEqual(rows[1]["value"], 0)
        self.assertIn("unavailable", [c["status"] for c in reconcile(rows)])

    def test_licence_gates_before_parsing_and_export(self):
        d = document(); rows = parse_sheet(grid(), "Table_1", d)
        for mutate in [lambda d: d.update(status="held"), lambda d: d["licence"].update(status="held"),
                       lambda d: d["licence"].update(workbook_reviewed=False), lambda d: d["receipt"].update(challenge=True)]:
            held = copy.deepcopy(d); mutate(held)
            self.assertEqual(parse_sheet(grid(), "Table_1", held), [])
            self.assertEqual(projection({"snapshot": "2026-10-17", "release": "2024-25", "release_date": "2026-04-21", "workbooks": [held]}, rows)["rows"], [])

    def test_no_cross_level_sums_in_export(self):
        d = document(); rows = parse_sheet(grid(), "Table_1", d)
        invented = {**rows[0], "level_of_government": "All levels of government", "published": False, "value": 999}
        inventory = {"snapshot": "2026-10-17", "release": "2024-25", "release_date": "2026-04-21", "workbooks": [d]}
        output = projection(inventory, [*rows, invented])["rows"]
        self.assertTrue(all(r["level_of_government"] == "State" for r in output))
        self.assertTrue(all(r in rows for r in output))
        invented["published"] = True
        self.assertNotIn(invented, projection(inventory, [*rows, invented])["rows"])

    def test_release_is_part_of_observation_identity(self):
        row = parse_sheet(grid(), "Table_1", document())[0]
        revised = {**row, "release": "2025-26", "value": 103}
        self.assertNotEqual(key(row), key(revised))
        self.assertEqual(len(reconcile([row, revised])), 0)

    def test_unknown_units_and_markers_fail_closed(self):
        g = grid(); g[5][1] = "$bn"
        with self.assertRaises(ValueError): parse_sheet(g, "Table_1", document())
        g = grid(); g[7][1] = "unrecognised"
        with self.assertRaises(ValueError): parse_sheet(g, "Table_1", document())

    def test_net_debt_matrix_retains_national_level_and_one_published_stock_date(self):
        cells = {(4, 1): "Table 15 Matrix of net public sector debt and other liabilities", (15, 1): "Equals L2"}
        headers = ["National general government", "Total state general government", "Total local general government",
                   "All Australia general government", "All Australia non-financial public sector", "All Australia total public sector"]
        for column, header in enumerate(headers, 2):
            cells.update({(5, column): header, (6, column): "As at 30 June 2025", (7, column): "$m",
                          (11, column): 100, (13, column): 10, (14, column): -20, (15, column): 90})
        class Sheet:
            title = "Table_15"
            def cell(self, row, column): return SimpleNamespace(value=cells.get((row, column)))
        d = document(); d.update(id="55120DO094_202425", title="Key Tables", dimensions=None)
        rows, checks = parse_net_debt({"Table_15": Sheet()}, d)
        self.assertEqual(len(rows), 6)
        self.assertEqual(rows[0]["level_of_government"], "National")
        self.assertNotIn("Commonwealth", [r["level_of_government"] for r in rows])
        self.assertTrue(all(r["as_of"] == "2025-06-30" for r in rows))
        self.assertEqual(rows[-1]["cell"], "G15")
        self.assertTrue(all(c["status"] == "pass" for c in checks))

    def test_reviewed_promotion_dry_run_writes_nothing(self):
        from scripts.promote_hub_data import ROOT, INPUTS, promote
        with tempfile.TemporaryDirectory(prefix="opax-gfs-test-") as scratch:
            root = Path(scratch)
            stage = root / "data/staged/abs-gfs"
            shutil.copytree(ROOT / "data/staged/abs-gfs", stage)
            public = root / "portal/public"; public.mkdir(parents=True)
            votes = (ROOT / "portal/public/votes.json").read_bytes()
            (public / "votes.json").write_bytes(votes)
            review = {"status": "approved", "reviewed_commit": "synthetic-review-fixture",
                      "inputs": {p: hashlib.sha256((stage / p).read_bytes()).hexdigest() for p in INPUTS["abs-gfs"]}}
            (stage / "review.json").write_text(json.dumps(review))
            with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
                self.assertEqual(promote(["abs-gfs"], root, dry_run=True), 0)
            self.assertFalse((public / "government-finance").exists())
            self.assertEqual((public / "votes.json").read_bytes(), votes)
            review["status"] = "pending"
            (stage / "review.json").write_text(json.dumps(review))
            with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
                self.assertEqual(promote(["abs-gfs"], root, dry_run=True), 1)

    def test_new_hub_is_opt_in_until_orchestrator_activation(self):
        from scripts.promote_hub_data import ASSETS, DEFAULT_HUBS
        self.assertEqual(ASSETS["abs-gfs"], "government-finance/data.json")
        self.assertNotIn("abs-gfs", DEFAULT_HUBS)


if __name__ == "__main__":
    unittest.main()
