"""Run with: python -m unittest discover -s tests -p test_export_tax_charity.py

scripts/export_tax_charity.py against a small database and a small portal tree: the join is by ABN
only, ambiguous names are dropped, the ATO's blank amounts stay blank, and the output is stable.
"""

import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from parli.ingest import acnc_ato as A

_spec = importlib.util.spec_from_file_location(
    "export_tax_charity", Path(__file__).resolve().parents[1] / "scripts/export_tax_charity.py")
X = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(X)

ENTITY_DDL = """
CREATE TABLE ext_donor_entities (entity_id TEXT, canonical_name TEXT, kind TEXT, abn TEXT);
CREATE TABLE ext_donor_aliases (alias_raw TEXT, alias_norm TEXT, entity_id TEXT);
CREATE TABLE ext_lobbyist_clients (client_name TEXT, client_abn TEXT);
CREATE TABLE ext_fits_registrants (name TEXT, abn TEXT, registrant_type TEXT);
"""


def insert(db, table, cols, rows):
    db.executemany(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})", rows)


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.db_path = d / "parli.db"
        self.portal = d / "public"
        self.out = self.portal / "entities" / "tax-charity"
        db = sqlite3.connect(self.db_path)
        db.executescript(A.DDL + ENTITY_DDL)
        common = dict(dataset_url="https://data.gov.au/data/dataset/x", resource_id="r", licence="CC BY 3.0 AU",
                      licence_url="https://creativecommons.org/licenses/by/3.0/au/", licence_note="n",
                      snapshot_date="2026-09-27", dataset_modified="2026-09-27T19:00:00", ingested_at="2026-09-28T00:00:00Z")
        ch_cols = ["source", "abn", "legal_name", "size", "pbi", "hpc", "advocacy", "registration_date", "source_url"] + list(common)
        insert(db, "ext_acnc_charities", ch_cols, [
            ("acnc_register", "11000073870", "Integricare Limited", "Large", 1, 0, 0, "2012-12-03", "u", *common.values()),
            ("acnc_register", "33333333333", "Same Name Pty Ltd", "Small", 0, 0, 0, "2015-01-01", "u", *common.values()),
        ])
        ais_cols = ["source", "abn", "ais_year", "charity_name", "registration_status", "size", "basic_religious_charity",
                    "fin_report_to", "revenue_from_government", "donations_and_bequests", "total_revenue", "total_expenses",
                    "source_url"] + list(common)
        ais_rows = []
        for y, gov, rev in [(2021, 1, 10), (2022, 2, 20), (2023, 3, 30), (2024, 12638727.4, 17505079.0)]:
            ais_rows.append(("acnc_ais", "11000073870", y, "Integricare Limited", "Registered", "Large", 0, f"{y}-06-30",
                             gov, 134403.0, rev, 18492195.0, "u", *common.values()))
        ais_rows.append(("acnc_ais", "44444444444", 2024, "Gone Inc", "Voluntarily Revoked No Longer Operating", "Small", 0,
                         "2024-06-30", 0.0, 0.0, 0.0, 0.0, "u", *common.values()))
        insert(db, "ext_acnc_ais", ais_cols, ais_rows)
        ato_cols = ["source", "abn", "entity_name", "income_year", "total_income", "taxable_income", "tax_payable",
                    "prrt_payable", "section", "source_url"] + list(common)
        insert(db, "ext_ato_tax_transparency", ato_cols, [
            ("ato_tax_transparency", "88000014675", "WOOLWORTHS GROUP LIMITED", "2023-24", 56596759405.0, 2702605198.0, 767268429.0,
             None, "income_tax", "https://data.gov.au/r/24", *common.values()),
            ("ato_tax_transparency", "88000014675", "WOOLWORTHS GROUP LIMITED", "2022-23", 50000000000.0, 2500000000.0, 700000000.0,
             None, "income_tax", "https://data.gov.au/r/23", *common.values()),
            ("ato_tax_transparency", "55555555555", "LOSS MAKER PTY LTD", "2023-24", 150000000.0, None, None, None,
             "income_tax", "https://data.gov.au/r/24", *common.values()),
            ("ato_tax_transparency", "62091829819", "ESSO AUSTRALIA", "2023-24", None, None, None, 351898218.0, "prrt_only",
             "https://data.gov.au/r/24", *common.values()),
            ("ato_tax_transparency", None, "NO ABN BIDCO PTY LTD", "2023-24", 112972764.0, None, None, None, "income_tax",
             "https://data.gov.au/r/24", *common.values()),
            # not an OPAX entity at all
            ("ato_tax_transparency", "77777777777", "UNSEEN PTY LTD", "2023-24", 1.0, 1.0, 1.0, None, "income_tax",
             "https://data.gov.au/r/24", *common.values()),
        ])
        # donor entities: Woolworths has an ABN; "Same Name" has none (a name-alike of a charity); a two-ABN donor
        insert(db, "ext_donor_entities", ["entity_id", "canonical_name", "kind", "abn"], [
            ("e1", "Woolworths Group Limited", "company", "88000014675"),
            ("e2", "Same Name Pty Ltd", "company", None),
            ("e3", "Two Abn Co", "company", "11111111111"),
            ("e4", "Two Abn Co Other", "company", "22222222222"),
            ("e5", "Integricare", "association", "11000073870"),
        ])
        insert(db, "ext_donor_aliases", ["alias_raw", "alias_norm", "entity_id"], [
            ("Woolworths Ltd", "woolworths", "e1"), ("Two Abn Co", "x", "e3"), ("Two Abn Co", "x", "e4"),
        ])
        insert(db, "ext_lobbyist_clients", ["client_name", "client_abn"], [
            ("Loss Maker Pty Ltd", "55 555 555 555"), ("Client Without ABN", ""), ("Gone Inc", "44444444444")])
        insert(db, "ext_fits_registrants", ["name", "abn", "registrant_type"], [("Integricare Limited", "11000073870", "Organisation")])
        db.commit()
        db.close()

        (self.portal / "suppliers").mkdir(parents=True)
        (self.portal / "suppliers" / "00.json").write_text(json.dumps({"profiles": {
            "s-1": {"id": "s-1", "name": "Woolworths", "abn": "88000014675"},
            "s-2": {"id": "s-2", "name": "Unrelated", "abn": "99999999999"},
            "s-3": {"id": "s-3", "name": "No ABN Supplier"}}}))
        (self.portal / "grants" / "federal").mkdir(parents=True)
        (self.portal / "grants" / "federal" / "shard-00.json").write_text(json.dumps({
            "abn-11000073870": {"id": "abn:11000073870", "n": "Integricare Limited", "abn": "11000073870"},
            "name-x": {"id": "name:x", "n": "Same Name Pty Ltd"}}))
        (self.portal / "graph").mkdir()
        (self.portal / "graph" / "money.json").write_text(json.dumps({"nodes": [
            {"id": "donor:woolworths", "label": "Woolworths Group Limited", "kind": "donor", "aliases": ["Woolworths Ltd"]},
            {"id": "donor:same", "label": "Same Name Pty Ltd", "kind": "donor", "aliases": []},
            {"id": "donor:two", "label": "Two Abn Co", "kind": "donor", "aliases": []},
            {"id": "donor:missing", "label": "Not In Entities", "kind": "donor", "aliases": []},
            {"id": "party:alp", "label": "Woolworths Group Limited", "kind": "party"}]}))
        (self.portal / "access.json").write_text(json.dumps({"donors": {"Integricare": {}}}))

    def tearDown(self):
        self.tmp.cleanup()

    def run_export(self, **kw):
        return X.export(str(self.db_path), self.portal, self.out, **kw)

    def shard(self, abn):
        return json.loads((self.out / f"{abn[-2:]}.json").read_text())[abn]

    def test_only_abns_of_opax_entities_with_a_row_are_written(self):
        res = self.run_export()
        self.assertEqual(sorted(res["records"]), ["11000073870", "44444444444", "55555555555", "88000014675"])
        self.assertNotIn("77777777777", res["records"])         # in the ATO file, not an OPAX entity
        self.assertNotIn("33333333333", res["records"])         # a charity nobody on OPAX links to by ABN
        self.assertNotIn("62091829819", res["records"])         # PRRT-only, not an OPAX entity
        shards = sorted(p.name for p in self.out.glob("??.json"))
        self.assertEqual(shards, ["44.json", "55.json", "70.json", "75.json"])        # last two digits of each ABN

    def test_charity_ais_and_ato_shapes(self):
        self.run_export()
        c = self.shard("11000073870")
        self.assertEqual(c["c"], {"n": "Integricare Limited", "sz": "Large", "pbi": 1, "reg": "2012-12-03"})
        self.assertEqual([a["y"] for a in c["a"]], [2024, 2023, 2022])          # latest first, three years
        self.assertEqual(c["a"][0]["gov"], 12638727)                             # whole dollars
        self.assertEqual(c["a"][0]["rev"], 17505079)
        self.assertEqual(c["a"][0]["n"], "Integricare Limited")
        self.assertNotIn("n", c["a"][1])
        self.assertNotIn("t", c)
        w = self.shard("88000014675")
        self.assertEqual([t["y"] for t in w["t"]], ["2023-24", "2022-23"])
        self.assertEqual(w["t"][0], {"y": "2023-24", "inc": 56596759405, "tax": 2702605198, "pay": 767268429})
        self.assertEqual(w["tn"], "WOOLWORTHS GROUP LIMITED")
        self.assertNotIn("c", w)

    def test_ato_blank_stays_absent_never_zero(self):
        self.run_export()
        t = self.shard("55555555555")["t"][0]
        self.assertEqual(t, {"y": "2023-24", "inc": 150000000})
        self.assertNotIn("tax", t)
        self.assertNotIn("pay", t)

    def test_revoked_charity_keeps_its_registration_status(self):
        self.run_export()
        a = self.shard("44444444444")["a"][0]
        self.assertEqual(a["rs"], "Voluntarily Revoked No Longer Operating")
        self.assertEqual(a["rev"], 0)                                            # a zero in the dataset is kept, but never worded as "reported"
        self.assertNotIn("rs", self.shard("11000073870")["a"][0])

    def test_basic_religious_zeros_are_placeholders_not_figures(self):
        db = sqlite3.connect(self.db_path)
        cols = ["source", "abn", "ais_year", "charity_name", "registration_status", "size", "basic_religious_charity", "fin_report_to",
                "revenue_from_government", "donations_and_bequests", "total_revenue", "total_expenses", "source_url", "dataset_url",
                "resource_id", "licence", "licence_url", "licence_note", "snapshot_date", "dataset_modified", "ingested_at"]
        tail = ("u", "https://data.gov.au/data/dataset/x", "r", "CC BY 3.0 AU", "l", "n", "2026-09-27", "2026-09-27T19:00:00", "t")
        insert(db, "ext_acnc_ais", cols, [
            ("acnc_ais", "66666666666", 2024, "A Church", "Registered", "Small", 1, None, 0.0, 0.0, 0.0, 0.0, *tail),
            ("acnc_ais", "77777777777", 2024, "A Big Church", "Registered", "Large", 1, "2024-12-31", 0.0, 5.0, 900000.0, 800000.0, *tail),
        ])
        insert(db, "ext_lobbyist_clients", ["client_name", "client_abn"], [("A Church", "66666666666"), ("A Big Church", "77777777777")])
        db.commit()
        db.close()
        self.run_export()
        church = self.shard("66666666666")["a"][0]
        self.assertEqual(church, {"y": 2024, "sz": "Small", "rel": 1, "n": "A Church"})     # no rev / gov / exp keys at all
        big = self.shard("77777777777")["a"][0]
        self.assertEqual((big["rev"], big["exp"], big["rel"]), (900000, 800000, 1))       # it did report: figures kept

    def test_donors_reach_an_abn_only_through_their_entity(self):
        res = self.run_export()
        names = json.loads((self.out / "names.json").read_text())["by_name"]
        self.assertEqual(names["woolworths group"], "88000014675")
        self.assertEqual(names["woolworths"], "88000014675")                     # an alias of the entity
        self.assertNotIn("same name", names)                                     # entity has no ABN: never matched by name
        self.assertNotIn("two abn co", names)                                    # entity has two ABNs: no match on ambiguity
        # nodes: Woolworths (entity + ABN), Same Name (entity, no ABN), Two Abn Co (two ABNs), Not In Entities,
        # and access.json's "Integricare" (entity + ABN)
        self.assertEqual(res["meta"]["counts"]["donor_resolution"],
                         {"ambiguous_abn": 1, "entity": 2, "no_abn": 1, "no_entity": 1})
        self.assertEqual(res["sets"]["donors"], {"88000014675": "Woolworths Group Limited", "11000073870": "Integricare"})

    def test_lobbying_clients_and_fits_registrants_join_by_abn_and_feed_the_name_index(self):
        res = self.run_export()
        names = json.loads((self.out / "names.json").read_text())["by_name"]
        self.assertEqual(names["loss maker"], "55555555555")                     # client_abn '55 555 555 555' normalised
        self.assertEqual(names["gone"], "44444444444")                           # "Gone Inc" -> key "gone"
        self.assertEqual(names["integricare"], "11000073870")                    # FITS registrant name
        m = res["meta"]["matches"]
        self.assertEqual(m["lobbying_clients"]["abns"], 2)
        self.assertEqual(m["lobbying_clients"]["matched"], 2)
        self.assertEqual(m["fits_registrants"]["matched"], 1)
        self.assertEqual(m["suppliers"], {"abns": 2, "matched": 1, "charity": 0, "ais": 0, "ato": 1})
        self.assertEqual(m["grant_recipients"]["matched"], 1)
        self.assertEqual(m["grant_recipients"]["charity"], 1)

    def test_a_name_with_two_abns_is_dropped_from_the_index(self):
        db = sqlite3.connect(self.db_path)
        insert(db, "ext_lobbyist_clients", ["client_name", "client_abn"], [("Loss Maker Pty Ltd", "44444444444")])
        db.commit()
        db.close()
        res = self.run_export()
        names = json.loads((self.out / "names.json").read_text())["by_name"]
        self.assertNotIn("loss maker", names)
        self.assertGreaterEqual(res["meta"]["counts"]["by_name_ambiguous_dropped"], 1)

    def test_meta_carries_sources_licences_and_caveats(self):
        res = self.run_export()
        meta = json.loads((self.out / "index.json").read_text())["meta"]
        self.assertEqual(meta["sources"]["register"]["licence"], "CC BY 3.0 AU")
        self.assertEqual(meta["sources"]["ais"]["latest_year"], "2024")
        self.assertEqual(sorted(meta["sources"]["ais"]["years"]), ["2021", "2022", "2023", "2024"])
        self.assertEqual(meta["sources"]["ato"]["latest_year"], "2023-24")
        self.assertEqual(meta["sources"]["ato"]["years"]["2023-24"]["record_url"], "https://data.gov.au/r/24")
        self.assertIn("ato.gov.au", meta["sources"]["ato"]["guidance_url"])
        for phrase in ("it is not tax paid", "zero or less", "lawful reasons", "larger group"):
            self.assertIn(phrase, meta["caveats"]["ato"])
        self.assertIn("DGR", meta["caveats"]["register"])
        self.assertEqual(res["meta"]["counts"]["abns_written"], 4)

    def test_output_is_deterministic(self):
        self.run_export()
        first = {p.name: p.read_bytes() for p in self.out.iterdir()}
        self.run_export()
        second = {p.name: p.read_bytes() for p in self.out.iterdir()}
        self.assertEqual(first, second)

    def test_empty_table_is_refused(self):
        self.run_export()
        db = sqlite3.connect(self.db_path)
        db.execute("DELETE FROM ext_ato_tax_transparency")
        db.commit()
        db.close()
        with self.assertRaisesRegex(SystemExit, "empty or missing"):
            self.run_export()
        self.assertTrue((self.out / "index.json").exists())               # the published export is untouched

    def test_shrunk_export_is_refused_unless_allowed_and_stale_shards_go(self):
        first = self.run_export()
        self.assertEqual(first["meta"]["counts"]["abns_written"], 4)
        db = sqlite3.connect(self.db_path)
        db.execute("DELETE FROM ext_ato_tax_transparency WHERE abn = '55555555555'")   # 4 -> 3 ABNs is 75%, under the 90% rule
        db.commit()
        db.close()
        with self.assertRaisesRegex(SystemExit, "under 90%"):
            self.run_export()
        self.assertTrue((self.out / "55.json").exists())                   # refused: nothing removed
        res = self.run_export(allow_shrink=True)
        self.assertEqual(res["meta"]["counts"]["abns_written"], 3)
        self.assertFalse((self.out / "55.json").exists())                  # no stale shard for an ABN that dropped out
        self.assertTrue((self.out / "70.json").exists())

    def test_dry_run_writes_nothing(self):
        self.run_export(dry_run=True)
        self.assertFalse(self.out.exists())


class Helpers(unittest.TestCase):
    def test_norm_js_matches_the_portal_normaliser(self):
        self.assertEqual(X.norm_js("The Smith Holdings Pty Ltd"), "smith")
        self.assertEqual(X.norm_js("Westpac Banking Corporation"), "westpac banking corporation")
        self.assertEqual(X.norm_js("A&B Co."), "a b")

    def test_shard_is_the_last_two_digits(self):
        self.assertEqual(X.shard_of("88000014675"), "75")


if __name__ == "__main__":
    unittest.main()
