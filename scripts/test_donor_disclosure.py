"""Disclosure spelling and identity evidence through the persistent exporter."""
import sqlite3
import unittest
from scripts.donor_disclosure import attach_donor_disclosures


def recipient_fixture(db, rows):
    """Explicit recipient rows, separate from the legacy declaration fixtures."""
    from parli.ingest.aec_receipts import FILES
    if 'recipient' not in {r[1] for r in db.execute('PRAGMA table_info(donations)')}:
        db.execute('ALTER TABLE donations ADD COLUMN recipient TEXT')
    db.execute('UPDATE donations SET recipient=recipient_canonical WHERE recipient IS NULL')
    db.executescript('CREATE TABLE aec_receipt_files(archive,source_file);'
                     'CREATE TABLE aec_receipt_records(donor_name,recipient,amount,financial_year,receipt_type,recipient_kind,record_side);')
    db.executemany('INSERT INTO aec_receipt_files VALUES (?,?)', [(a,n) for a,names in FILES.items() for n in names])
    db.executemany("INSERT INTO aec_receipt_records VALUES (?,?,?,?,?,'political_party','recipient')", rows)


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
        recipient_fixture(db, [("EXAMPLE, ALEX", "Labor", 120, "2024-25", "Donation Received")])
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


class DonorsLeavingTheMap(unittest.TestCase):
    """A donor ranked just past the cap after a refresh keeps its index entry and page (invented names)."""

    def test_an_indexed_donor_the_maps_no_longer_draw_is_summed_from_its_returns(self):
        import json, tempfile
        from pathlib import Path
        from scripts.export_donor_disclosures import disclosure_catalog, published_references
        public = Path(tempfile.mkdtemp())
        (public / "graph").mkdir()
        # Last week's index: both donors were drawn. This week's map draws only the first;
        # the second is rank 251.
        index = {"version": 2, "donors": [
            {"jurisdiction": "federal", "id": "donor:still drawn", "label": "Still Drawn Pty Ltd", "match": {"entity_id": "still-drawn"}},
            {"jurisdiction": "federal", "id": "donor:past cap", "label": "Past Cap Example Pty Ltd", "source_name": "PAST CAP EXAMPLE PTY LTD",
             "lookup_names": ["Past Cap Example Pty Ltd"], "match": {"entity_id": "past-cap"}},
            {"jurisdiction": "federal", "id": "donor:ref", "label": "Only A Reference", "kind": "reference", "match": {}}]}
        (public / "graph/donor-index.json").write_text(json.dumps(index))
        (public / "graph/money.json").write_text(json.dumps({"meta": {}, "nodes": [
            {"id": "donor:still drawn", "kind": "donor", "label": "Still Drawn Pty Ltd"}], "edges": []}))
        candidates = published_references(public)
        self.assertEqual([c["label"] for c in candidates], ["Past Cap Example Pty Ltd"], "only the donor the maps no longer draw")
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript("CREATE TABLE donations(donor_name,amount,financial_year,source,donation_id,donation_type,recipient_canonical);"
                         "INSERT INTO donations VALUES ('PAST CAP EXAMPLE PTY LTD',650000,'2014-15','aec_annual',1,'gift','Liberal');"
                         "INSERT INTO donations VALUES ('Past Cap Example Pty Ltd',21000,'2015-16','aec_annual',2,'gift','Labor');"
                         "CREATE TABLE ext_donations(donor_name,amount,financial_year,source,source_record_id,source_url,disclosure_type,jurisdiction,recipient_party)")
        recipient_fixture(db, [("PAST CAP EXAMPLE PTY LTD", "Liberal", 650000, "2014-15", "Donation Received"), ("Past Cap Example Pty Ltd", "Labor", 21000, "2015-16", "Donation Received")])
        catalog = disclosure_catalog(db, candidates)
        [donor] = catalog["donors"]
        self.assertEqual((donor["jurisdiction"], donor["total"], donor["count"], donor["firstYear"], donor["lastYear"]), ("federal", 671000, 2, 2014, 2015))
        self.assertEqual(donor["returnReferences"][0]["return_type"], "AEC annual return")
        self.assertEqual(catalog["references"], [])


    def test_canonical_entity_is_not_overwritten_by_a_separately_resolved_case_variant(self):
        from scripts.export_donor_disclosures import attach_selected_federal_receipts
        db = DonorDisclosures.database(self)
        db.execute("INSERT INTO ext_donor_entities VALUES ('other','Example Union.','union')")
        db.executemany("INSERT INTO ext_donor_aliases VALUES (?,?,1,'curated')", [('Example Union','fixture'),('Example Union.','other')])
        # The resolver's exact tier deliberately leaves this uppercase spelling
        # ambiguous. It must not overwrite the canonical entity by dictionary order.
        recipient_fixture(db, [('Example Union','Labor',500,'2024-25','Donation Received'),
                               ('EXAMPLE UNION','Labor',100,'2024-25','Donation Received')])
        node = {'label':'Example Union','match':{'entity_id':'fixture'}}
        attach_selected_federal_receipts(db,[node])
        self.assertEqual((node['total'],node['count']),(500,1))
