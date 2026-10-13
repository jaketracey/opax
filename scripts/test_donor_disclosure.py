"""Disclosure spelling and identity evidence through the persistent exporter."""
import sqlite3
import unittest
from scripts.donor_disclosure import attach_donor_disclosures


class DonorDisclosures(unittest.TestCase):
    def graph(self):
        return {"meta": {"sourceShort": "AEC annual return"}, "nodes": [
            {"id": "donor:fixture", "label": "Alex Example", "kind": "donor", "aliases": [], "total": 120, "firstYear": 2024}
        ], "edges": []}

    def database(self, evidence=True):
        db=sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript("CREATE TABLE donations(donor_name,amount,financial_year,source,donation_id,donation_type,recipient_canonical);"
                         "INSERT INTO donations VALUES ('EXAMPLE, ALEX',120,'2024-25','aec_annual',7,'gift','Labor');")
        if evidence:
            db.executescript("CREATE TABLE ext_donor_aliases(alias_raw,entity_id,confidence,method);"
                             "CREATE TABLE ext_donor_entities(entity_id,canonical_name,kind);"
                             "INSERT INTO ext_donor_entities VALUES ('fixture','Alex Example','person');")
        return db

    def test_source_spelling_reference_and_totals_survive_both_match_outcomes(self):
        for confidence, method in [(0.9,"rule"),(1,"exact"),(1,"curated")]:
            with self.subTest(method=method):
                db=self.database()
                db.execute("INSERT INTO ext_donor_aliases VALUES (?,?,?,?)",("EXAMPLE, ALEX","fixture",confidence,method))
                graph=attach_donor_disclosures(db,self.graph(),"federal")
                donor=graph["nodes"][0]
                self.assertEqual(donor["label"],"EXAMPLE, ALEX")
                self.assertEqual(donor["total"],120)
                self.assertEqual(donor["returnReferences"][0]["year"],"2024-25")
                self.assertEqual(donor["returnReferences"][0]["return_type"],"AEC annual return")
                self.assertEqual(donor["returnReferences"][0]["url"],"https://transparency.aec.gov.au/")
                self.assertEqual(donor["match"]["href"],"/subject/donor/Alex%20Example" if confidence==1 else None)
                self.assertNotIn("return_id",donor["returnReferences"][0],"A local row id is not a commission return id")

    def test_missing_resolver_evidence_publishes_the_source_name_without_an_identity_link(self):
        graph=self.graph()
        graph["nodes"][0]["label"]="EXAMPLE, ALEX"
        donor=attach_donor_disclosures(self.database(False),graph,"federal")["nodes"][0]
        self.assertEqual(donor["source_name"],"EXAMPLE, ALEX")
        self.assertIsNone(donor["match"]["href"])
        self.assertEqual(donor["returnReferences"][0]["year"],"2024-25")

    def test_referenced_donors_outside_the_map_join_real_returns_and_keep_non_donor_references_unlinked(self):
        from scripts.export_donor_disclosures import disclosure_catalog
        db=self.database()
        db.execute("INSERT INTO ext_donor_aliases VALUES (?,?,?,?)",("EXAMPLE, ALEX","fixture",1,"exact"))
        db.execute("CREATE TABLE ext_donations(donor_name,amount,financial_year,source,source_record_id,source_url,disclosure_type,jurisdiction,recipient_party)")
        reference={"return_type":"GrantConnect source record", "year":"2024-25", "transaction_id":"GA-FIXTURE", "url":"https://example.test/grant/7"}
        candidates=[{"id":"donor:fixture","entity_id":"fixture","label":"Alex Example","kind":"donor","aliases":[],"references":[]},
                    {"id":"donor:source-only","label":"Source Example","kind":"donor","aliases":[],"references":[reference]}]
        catalog=disclosure_catalog(db,candidates)
        self.assertEqual(len(catalog["donors"]),1)
        donor=catalog["donors"][0]
        self.assertEqual(donor["source_name"],"EXAMPLE, ALEX")
        self.assertEqual(donor["total"],120)
        self.assertEqual(donor["match"]["href"],"/subject/donor/Alex%20Example")
        self.assertEqual(catalog["references"][0]["kind"],"reference")
        self.assertNotIn("total",catalog["references"][0])
        self.assertIsNone(catalog["references"][0]["match"]["href"])
        self.assertEqual(catalog["references"][0]["returnReferences"][0]["transaction_id"],"GA-FIXTURE")
