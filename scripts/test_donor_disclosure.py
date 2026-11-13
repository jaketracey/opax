"""Disclosure spelling and identity evidence through the persistent exporter."""
import sqlite3
import unittest
from scripts.donor_disclosure import attach_donor_disclosures


def selected_receipts(label, cells, aliases=()):
    """Explicit party-side receipt fixture, separate from legacy source declarations."""
    return {"meta": {"uncapped": True}, "nodes": [{"id": "donor:selected", "kind": "donor", "label": label,
        "aliases": list(aliases), "total": sum(a for a, _ in cells.values()), "count": sum(n for _, n in cells.values()),
        "firstYear": 2014, "lastYear": 2015, "by_type": {"donation_received": sum(a for a, _ in cells.values())},
        "by_type_year": {y: {"donation_received": c} for y, c in cells.items()}}]}


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
        catalog=disclosure_catalog(db,candidates,selected_receipts("Alex Example", {"2024-25": [120,1]}, ["EXAMPLE, ALEX"]))
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
        catalog = disclosure_catalog(db, candidates, selected_receipts("Past Cap Example Pty Ltd", {"2014-15": [650000,1], "2015-16": [21000,1]}, ["PAST CAP EXAMPLE PTY LTD"]))
        [donor] = catalog["donors"]
        self.assertEqual((donor["jurisdiction"], donor["total"], donor["count"], donor["firstYear"], donor["lastYear"]), ("federal", 671000, 2, 2014, 2015))
        self.assertEqual(donor["returnReferences"][0]["return_type"], "AEC annual return")
        self.assertEqual(catalog["references"], [])

    def test_retained_entity_prefers_its_selected_node_over_a_separately_resolved_case_variant(self):
        from scripts.export_donor_disclosures import select_federal_receipts
        # A canonical union node and an unresolved, differently cased spelling can
        # both exist in the selection. A folded-name dictionary must not choose
        # the last one and replace the canonical entity's figures.
        canonical = {"id": "donor:union", "kind": "donor", "label": "Example Union",
                     "match": {"entity_id": "union"}, "total": 500, "count": 2,
                     "by_type": {"donation_received": 500}, "by_type_year": {"2024-25": {"donation_received": [500,2]}}}
        spelling = {**canonical, "id": "donor:spelling", "label": "EXAMPLE UNION", "match": {},
                    "total": 100, "count": 1, "by_type": {"donation_received": 100}}
        for nodes in ([canonical, spelling], [spelling, canonical]):
            retained = {"label": "Example Union", "match": {"entity_id": "union"}}
            select_federal_receipts([retained], {"meta": {"uncapped": True}, "nodes": nodes})
            self.assertEqual((retained["total"], retained["count"]), (500,2))
