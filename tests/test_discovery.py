"""Run with: python -m unittest discover -s tests -p test_discovery.py."""

import sqlite3
import unittest
import importlib.util
from pathlib import Path

from parli.analysis.discovery import build_discoveries

_export_spec = importlib.util.spec_from_file_location(
    "export_discovery", Path(__file__).resolve().parents[1] / "scripts/export_discovery.py")
_export_module = importlib.util.module_from_spec(_export_spec)
_export_spec.loader.exec_module(_export_module)


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE donations (donation_id INTEGER PRIMARY KEY, donor_name TEXT,
                                    recipient TEXT, amount REAL);
            CREATE TABLE contracts (contract_id TEXT PRIMARY KEY, supplier_name TEXT,
                                    agency TEXT, amount REAL);
        """)

    def tearDown(self):
        self.db.close()

    def seed(self):
        self.db.executemany("INSERT INTO donations VALUES (?, ?, ?, ?)", [
            (1, "Acme", "Party A", 60), (2, " acme ", "Party A", 30),
            (3, "Other", "Party A", 10), (4, "Acme Holdings", "Party B", 100),
            (5, "Acme", "Party A", -400), (6, "", "Party A", 10000),
            (7, "Unknown", "Party A", None),
        ])
        self.db.executemany("INSERT INTO contracts VALUES (?, ?, ?, ?)", [
            ("CN1", "ACME", "Agency A", 1000), ("CN2", " Acme ", "Agency A", 2000),
            ("CN3", "Another", "Agency A", 1000),
        ])

    def test_exact_match_and_independent_aggregation(self):
        self.seed()
        result = build_discoveries(self.db)
        overlaps = [s for s in result["signals"] if s["category"] == "donor_contract_overlap"]
        self.assertEqual(len(overlaps), 1)  # Does not fuzzily include Acme Holdings.
        values = {m["label"]: m["value"] for m in overlaps[0]["metrics"]}
        self.assertEqual(values["Recorded donations"], 90)
        self.assertEqual(values["Recorded contract value"], 3000)
        self.assertEqual(values["Donation records"], 2)
        self.assertEqual(values["Contract records"], 2)
        self.assertEqual({e["record_id"] for e in overlaps[0]["evidence"]}, {"1", "CN1"})
        self.assertEqual(result["coverage"]["donations"], 7)

    def test_concentration_denominator_and_exclusions(self):
        self.seed()
        cards = {s["category"]: s for s in build_discoveries(self.db)["signals"]}
        donor = {m["label"]: m["value"] for m in cards["recipient_concentration"]["metrics"]}
        self.assertEqual(donor["Largest donor share"], 90)
        self.assertEqual(donor["Total recorded value"], 100)
        self.assertEqual(donor["Distinct donors"], 2)
        supplier = {m["label"]: m["value"] for m in cards["procurement_concentration"]["metrics"]}
        self.assertEqual(supplier["Largest supplier share"], 75)
        self.assertEqual(supplier["Total recorded value"], 4000)

    def test_missing_table_is_reported_without_hiding_other_families(self):
        self.seed()
        self.db.execute("DROP TABLE contracts")
        result = build_discoveries(self.db)
        self.assertEqual(result["coverage"]["available_categories"], ["recipient_concentration"])
        self.assertEqual(result["coverage"]["unavailable_categories"],
                         ["donor_contract_overlap", "procurement_concentration"])
        self.assertEqual(len(result["signals"]), 1)

    def test_empty_dataset_is_not_missing_dataset(self):
        result = build_discoveries(self.db)
        self.assertEqual(result["signals"], [])
        self.assertEqual(len(result["coverage"]["available_categories"]), 3)
        self.assertEqual(result["coverage"]["unavailable_categories"], [])

    def test_balance_and_stable_unique_ids_across_recipient_groups(self):
        self.seed()
        self.db.executemany("INSERT INTO donations VALUES (?, ?, ?, ?)", [
            (8, "Acme", "Party C", 50), (9, "Acme", "Party C", 50),
        ])
        result = build_discoveries(self.db)
        self.assertEqual(len(result["signals"]), len({s["id"] for s in result["signals"]}))
        limited = build_discoveries(self.db, limit=3)
        self.assertEqual(len({s["category"] for s in limited["signals"]}), 3)
        self.assertEqual(limited, build_discoveries(self.db, limit=3))

    def test_evidence_queries_treat_names_as_parameters(self):
        self.db.execute("INSERT INTO donations VALUES (1, ?, 'Party', 10)", ("O'Reilly",))
        self.db.execute("INSERT INTO contracts VALUES ('CN1', ?, 'Agency', 20)", ("O'Reilly",))
        result = build_discoveries(self.db)
        self.assertEqual(len(result["signals"]), 1)
        self.assertEqual(len(result["signals"][0]["evidence"]), 2)

    def test_tied_leaders_choose_one_deterministically(self):
        self.db.executemany("INSERT INTO donations VALUES (?, ?, ?, ?)", [
            (1, "Zed", "Party", 50), (2, "Alpha", "Party", 50),
        ])
        result = build_discoveries(self.db)
        self.assertEqual(len(result["signals"]), 1)
        self.assertEqual(result["signals"][0]["entity"], "Alpha")

    def test_evidence_labels_dates_and_safe_source_links(self):
        self.seed()
        self.db.executescript("""
            ALTER TABLE donations ADD COLUMN financial_year TEXT;
            ALTER TABLE donations ADD COLUMN source_url TEXT;
            ALTER TABLE contracts ADD COLUMN start_date TEXT;
            ALTER TABLE contracts ADD COLUMN url TEXT;
            UPDATE donations SET financial_year = '2024-25', source_url = 'javascript:alert(1)';
            UPDATE contracts SET start_date = '2025-01-02', url = 'https://example.org/record/CN1';
        """)
        result = build_discoveries(self.db)
        overlap = next(s for s in result["signals"] if s["category"] == "donor_contract_overlap")
        donation, contract = overlap["evidence"]
        self.assertIn("Acme → Party A: $60.00", donation["label"])
        self.assertIn("FY 2024-25", donation["label"])
        self.assertIsNone(donation["url"])
        self.assertIn("Agency A → ACME: $1,000.00", contract["label"])
        self.assertIn("starts 2025-01-02", contract["label"])
        self.assertEqual(contract["url"], "https://example.org/record/CN1")

    def test_evidence_is_batched_and_only_for_selected_cards(self):
        self.seed()
        queries = []
        self.db.set_trace_callback(queries.append)
        build_discoveries(self.db, limit=1)
        evidence_queries = [q for q in queries if "AS record_id, amount," in q]
        self.assertEqual(len(evidence_queries), 2)
        self.assertTrue(all(" IN (" in q for q in evidence_queries))


class ProductionExportTests(unittest.TestCase):
    def test_filters_receipts_and_preserves_source_data(self):
        db = sqlite3.connect(":memory:")
        db.executescript("""
            CREATE TABLE donations (donation_id INTEGER PRIMARY KEY, donor_name TEXT,
                recipient TEXT, recipient_canonical TEXT, amount REAL, financial_year TEXT,
                industry TEXT, source TEXT, donation_type TEXT);
            CREATE TABLE contracts (contract_id TEXT PRIMARY KEY, supplier_name TEXT,
                agency TEXT, amount REAL, start_date TEXT, source TEXT);
            CREATE TABLE ext_donor_aliases (alias_raw TEXT, entity_id TEXT);
            CREATE TABLE ext_donor_entities (entity_id TEXT, canonical_name TEXT, kind TEXT);
            INSERT INTO ext_donor_entities VALUES ('acme', 'Acme Limited', 'company');
            INSERT INTO ext_donor_aliases VALUES ('ACME LTD', 'acme');
            INSERT INTO ext_donor_entities VALUES ('dept', 'Public Department', 'government');
            INSERT INTO ext_donor_aliases VALUES ('Dept Finance', 'dept');
            INSERT INTO contracts VALUES ('CN1', 'Acme Limited', 'Agency', 300, '2024-10-01', 'austender');
        """)
        rows = [
            (1, 'ACME LTD', 'Branch A', 'Party A', 90, '2024-25', 'retail', 'aec_annual', 'direct'),
            (2, 'Other', 'Branch A', 'Party A', 10, '2024-25', 'other', 'aec_annual', 'direct'),
            (3, 'ACME LTD', 'Foundation', None, 999999, '2024-25', 'retail', 'aec_annual', 'direct'),
            (4, 'ACME LTD', 'Branch A', 'Party A', 999999, '2024-25', 'retail', 'aec_annual', 'flagged_review'),
            (5, 'ACME LTD', 'Branch A', 'Party A', 999999, '2024-25', 'retail', 'qld_ecq', 'direct'),
            (6, 'ACME LTD', 'Branch A', 'Party A', 999999, '2024-25', 'retail', 'aec_election', 'direct'),
            (7, 'Dept Finance', 'Branch A', 'Party A', 999999, '2024-25', 'individual', 'aec_annual', 'direct'),
            (8, 'Electoral Commission', 'Branch A', 'Party A', 999999, '2024-25', 'other', 'aec_annual', 'direct'),
            (9, 'Party Vehicle', 'Branch A', 'Party A', 999999, '2024-25', 'party_internal', 'aec_annual', 'direct'),
            (10, 'ACME LTD', 'Branch A', 'Party A', 999999, '2024-25', 'retail', 'aec_annual', 'employer_payment'),
        ]
        db.executemany('INSERT INTO donations VALUES (?,?,?,?,?,?,?,?,?)', rows)
        db.commit()
        before = db.total_changes
        result = _export_module.export_discovery(db)
        self.assertEqual(db.total_changes, before)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM donations').fetchone()[0], 10)
        self.assertEqual(result['coverage']['donations'], 2)
        self.assertEqual(result['coverage']['excluded_before_name_checks'], 5)
        self.assertEqual(sum(result['coverage']['excluded_receipt_rows'].values()), 3)
        overlap = next(s for s in result['signals'] if s['category'] == 'donor_contract_overlap')
        self.assertEqual(overlap['entity'], 'Acme Limited')
        self.assertIsNone(overlap['entity_url'])  # Resolved does not imply a published profile.
        self.assertEqual(overlap['metrics'][0]['value'], 90)
        self.assertEqual(overlap['metrics'][0]['label'], 'Recorded party receipts')
        self.assertIn('ACME LTD → Branch A: $90.00', overlap['evidence'][0]['label'])
        self.assertEqual(overlap['evidence'][0]['link_scope'], 'source_register')
        with self.assertRaises(sqlite3.OperationalError):
            db.execute('DELETE FROM donations')
        db.close()


if __name__ == "__main__":
    unittest.main()
