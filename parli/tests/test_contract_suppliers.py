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


def group(name, abn=None):
    return {"supplier_name": name, "supplier_abn": abn}


class ReportedSpellingTests(unittest.TestCase):
    """contracts-grants-010: a no-ABN notice joins an ABN supplier only on that supplier's own spelling."""

    def setUp(self):
        self.index = cs.SpellingIndex([
            group("VMware International Unlimited Company", "81427693656"),
            group("Rapisarda Nominees Pty Ltd", "83010027068"),
            group("GUROBI OPTIMIZATION, LLC", "83134771821"),
            group("PROQUEST LLC", "98331366081"),
            group("ProQuest LLC", "41102833483"),
            group("ADAM SMITH INTERNATIONAL PTY LTD", "58155763410"),
            group("THE UNIVERSITY OF THE SOUTH PACIFIC", "94908793523"),
            group("Jane Citizen", "11111111111"),
            group("Some Name Unkeyed"),
        ])

    def test_the_same_spelling_and_legal_form_matches(self):
        self.assertEqual(self.index.match("VMWARE INTERNATIONAL UNLIMITED COMPANY"), ("81427693656", "exact"))
        self.assertEqual(self.index.match("RAPISARDA NOMINEES P/L"), ("83010027068", "legal_form"))
        self.assertEqual(self.index.match("Llc Gurobi Optimization"), ("83134771821", "legal_form"))
        self.assertEqual(self.index.match("University of the South Pacific"), ("94908793523", "legal_form"))

    def test_a_name_cut_at_35_characters_matches_one_spelling_it_begins(self):
        self.assertEqual(len("VMware International Unlimited Comp"), 35)
        self.assertEqual(self.index.match("VMware International Unlimited Comp"), ("81427693656", "truncated"))
        self.assertIsNone(self.index.match("VMware International Unlimited"))  # short of the limit: not a cut

    def test_a_different_legal_form_stays_separate(self):
        # parent and subsidiary: Adam Smith International Ltd is not its Australian Pty Ltd
        self.assertIsNone(self.index.match("Adam Smith International Ltd"))
        self.assertIsNone(self.index.match("Rapisarda Nominees Inc"))

    def test_a_spelling_two_abns_report_stays_unmatched(self):
        self.assertIsNone(self.index.match("ProQuest LLC"))

    def test_people_are_never_matched_by_name(self):
        self.assertIsNone(self.index.match("Jane Citizen"))  # the ABN holder's own name, person-shaped
        self.assertIsNone(self.index.match("Jane Citizen Pty Ltd"))  # a sole trader never takes a company
        self.assertIsNone(self.index.match("Some Name Unkeyed"))  # spellings without an ABN are not indexed

    def test_legal_form_key(self):
        self.assertEqual(cs.spelling_key("RAPISARDA NOMINEES P/L"), ("rapisarda nominees", "pty"))
        self.assertEqual(cs.spelling_key("Pluralsight, LLC"), ("pluralsight", "llc"))
        self.assertEqual(cs.spelling_key("Llc Pluralsight"), ("pluralsight", "llc"))
        self.assertEqual(cs.spelling_key("VMware International Ltd"), cs.spelling_key("VMWARE INTERNATIONAL LIMITED"))

    def test_a_spelling_the_abr_does_not_register_for_the_abn_never_takes_notices(self):
        registered = {"68706814312": ["DEPARTMENT OF DEFENCE"], "39008488373": ["GHD PTY LTD"]}.get
        index = cs.SpellingIndex([group("AIR7000 P8 POSEIDON", "68706814312"), group("DEPT OF DEFENCE", "68706814312"),
                                  group("GHD", "39008488373")], lambda abn: registered(abn, []))
        self.assertIsNone(index.match("AIR7000 P8 POSEIDON"))
        self.assertEqual(index.match("Dept of Defence"), ("68706814312", "exact"))
        self.assertEqual(index.match("GHD Pty Ltd"), ("39008488373", "legal_form"))
        self.assertEqual(index.skipped_unregistered, 1)

    def test_an_overseas_affiliate_filed_under_the_australian_abn_stays_separate(self):
        registered = {"51609939817": ["SPLUNK SERVICES AUSTRALIA PTY. LTD."],
                      "81427693656": ["VMWARE INTERNATIONAL UNLIMITED COMPANY"]}.get
        index = cs.SpellingIndex([group("Splunk Services Singapore Pte Ltd", "51609939817"),
                                  group("VMware International Unlimited Comp", "81427693656")],
                                 lambda abn: registered(abn, []))
        self.assertIsNone(index.match("SPLUNK SERVICES SINGAPORE PTE. LTD."))
        hootsuite = cs.SpellingIndex([group("Hootsuite Inc.", "11111111112")],
                                     lambda abn: ["HOOTSUITE MEDIA AUS PTY LIMITED"])
        self.assertIsNone(hootsuite.match("Hootsuite Inc."))  # Inc. is not the registered Pty Ltd
        dataminr = cs.SpellingIndex([group("DataMinr", "16636009866")], lambda abn: ["DATAMINR AUSTRALIA PTY LIMITED"])
        self.assertIsNone(dataminr.match("Dataminr, Inc."))
        self.assertEqual(dataminr.match("Dataminr Pty Ltd"), ("16636009866", "legal_form"))
        self.assertEqual(index.match("VMWARE INTERNATIONAL UNLIMITED COMP"), ("81427693656", "exact"))
