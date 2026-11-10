"""Contract lineages: cancelled notices and reviewed values stay listed but out of totals (contracts-grants-001/004)."""

import sqlite3
import unittest

from parli.ingest import contract_suppliers as cs

REVIEW = [{"id": "CN9@9626000000.00", "field": "counted_in_totals", "from": True, "to": False,
           "evidence_url": "https://www.tenders.gov.au/Cn/Show/example",
           "evidence": "AusTender notice CN9-A1 lists a contract value of $9,626,000,000.00.",
           "finding": "contracts-grants-001", "reviewed": "2026-11-10"}]


class ContractLineageTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("""CREATE TABLE ext_contracts (cn_id TEXT, parent_cn TEXT, published TEXT, status TEXT,
            supplier_name TEXT, supplier_abn TEXT, supplier_region TEXT, supplier_country TEXT, agency TEXT,
            agency_abn TEXT, title TEXT, description TEXT, unspsc TEXT, amount REAL, start_date TEXT, end_date TEXT,
            procurement_method TEXT, procurement_method_details TEXT, atm_id TEXT)""")
        self.db.executescript(cs.DDL)

    def notice(self, cn, amount, published, status="active", parent=None, abn="11111111111"):
        self.db.execute("INSERT INTO ext_contracts (cn_id, parent_cn, published, status, supplier_name, supplier_abn, "
                        "agency, amount, start_date) VALUES (?,?,?,?,?,?,?,?,?)",
                        (cn, parent, published, status, "Acme", abn, "Agency", amount, "2025-01-01"))

    def current(self):
        return {r["base_cn"]: dict(r) for r in self.db.execute("SELECT * FROM ext_contracts_current")}

    def test_cancelled_amendment_leaves_the_latest_active_figures(self):
        # CN4206262's shape: the amendment was cancelled, the contract stays live at the original value
        self.notice("CN1", 164701.90, "2025-08-01")
        self.notice("CN1", 0.11, "2025-09-01", status="cancelled")
        cs.build_current(self.db)
        row = self.current()["CN1"]
        self.assertEqual((row["amount"], row["status"], row["notices"]), (164701.90, "active", 2))

    def test_a_lineage_whose_every_notice_is_cancelled_is_kept_as_cancelled(self):
        self.notice("CN2", 500.0, "2025-08-01", status="cancelled")
        self.notice("CN2-A1", 700.0, "2025-09-01", status="cancelled", parent="CN2")
        self.notice("CN3", 10.0, "2025-08-01")
        cs.build_current(self.db)
        rows = self.current()
        self.assertEqual((rows["CN2"]["status"], rows["CN2"]["amount"]), ("cancelled", 700.0))
        counted = self.db.execute(f"SELECT base_cn FROM ext_contracts_current WHERE {cs.COUNTED}").fetchall()
        self.assertEqual([r[0] for r in counted], ["CN3"])

    def test_cancelled_notices_never_make_another_value_suspect(self):
        self.notice("CN4", 6e9, "2025-08-01")
        self.notice("CN5", 1e9, "2025-08-01", status="cancelled")
        cs.build_current(self.db)
        self.assertEqual(self.current()["CN4"]["suspect"], 1)

    def test_review_applies_on_the_exact_amount_and_lapses_when_the_source_changes(self):
        self.notice("CN9", 9626000000.0, "2026-07-03")
        self.notice("CN10", 10.0, "2025-08-01")
        cs.build_current(self.db, REVIEW)
        row = self.current()["CN9"]
        self.assertIn("$9,626,000,000.00", row["review_note"])
        self.assertIn("https://www.tenders.gov.au/Cn/Show/example", row["review_note"])
        self.assertEqual(row["suspect"], 1)
        # a corrected notice no longer matches the reviewed key, so the contract counts again
        self.db.execute("DELETE FROM ext_contracts_current")
        self.notice("CN9", 9626000.0, "2026-08-01")
        cs.build_current(self.db, REVIEW)
        self.assertIsNone(self.current()["CN9"]["review_note"])
        self.assertEqual(cs.apply_review(self.db, REVIEW)["lapsed"], ["CN9@9626000000.00"])

    def test_review_never_matches_a_cancelled_contract(self):
        self.notice("CN9", 9626000000.0, "2026-07-03", status="cancelled")
        cs.build_current(self.db, REVIEW)
        self.assertIsNone(self.current()["CN9"]["review_note"])

    def test_the_committed_review_file_loads(self):
        ids = [e["id"] for e in cs.load_review()]
        self.assertIn("CN3290712@9626000000.00", ids)


if __name__ == "__main__":
    unittest.main()
