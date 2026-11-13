"""Wave 1 money fixes (data-cleanup 2026-11-10) on temporary databases.

money-donations-001/-004: federal readers count AEC returns only; -006: an
electoral commission is never a donor; -007: a rolled-up union keeps its
canonical label; -008 / state-datasets-008: spellings join their entity and a
node id is published once; -009: one record per entity; -011: entities and
mojibake decoded; -012/-013: no raw source key or ECQ row as an AEC return;
-014: an organisation is never typed 'individual'.
"""
import contextlib
import io
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import unittest
from unittest import mock

from parli.ingest import donor_entities as resolver
from scripts import donor_disclosure as dd
from scripts import export_money_graph as federal
from scripts import export_state_money as state
from scripts.export_donor_disclosures import disclosure_catalog

ROOT = Path(__file__).resolve().parents[1]

SCHEMA = """
CREATE TABLE donations(donor_name, recipient_canonical, amount, financial_year, industry, donor_type,
    donation_type, source, donation_id);
CREATE TABLE ext_donations(donor_name, recipient_party, amount, financial_year, industry, donor_type,
    disclosure_type, is_political_donation, election, jurisdiction, source, source_record_id, source_url);
CREATE TABLE ext_donor_entities(entity_id, canonical_name, kind);
CREATE TABLE ext_donor_aliases(alias_raw, entity_id, confidence, method);
"""


def selected_receipts(*rows):
    """Party-side fixtures supplied by the uncapped money build, not raw sums."""
    return {"meta": {"uncapped": True}, "nodes": [{"id": "donor:" + name, "label": name, "kind": "donor",
        "aliases": aliases, "total": amount, "count": 1, "by_type": {"donation_received": amount},
        "by_type_year": {"2019-20": {"donation_received": [amount,1]}}} for name, amount, aliases in rows]}


def fixture_db(path, donations=(), ext=(), entities=(), aliases=()):
    with sqlite3.connect(path) as db:
        db.executescript(SCHEMA)
        db.executemany("INSERT INTO donations (donor_name,recipient_canonical,amount,financial_year,industry,"
                       "donor_type,donation_type,source,donation_id) VALUES (?,?,?,?,?,?,?,?,?)",
                       [(n, p, a, y, i, "company", "donation", s, k) for k, (n, p, a, y, i, s) in enumerate(donations)])
        db.executemany("INSERT INTO ext_donations (donor_name,recipient_party,amount,financial_year,industry,"
                       "donor_type,disclosure_type,is_political_donation,election,jurisdiction,source,"
                       "source_record_id,source_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       [(n, p, a, y, i, "individual", "gift", 1, None, j, s, f"rec{k}", "https://example.test/")
                        for k, (n, p, a, y, i, j, s) in enumerate(ext)])
        db.executemany("INSERT INTO ext_donor_entities VALUES (?,?,?)", entities)
        db.executemany("INSERT INTO ext_donor_aliases VALUES (?,?,?,?)", aliases)


def run_export(exporter, path, *argv):
    out = io.StringIO()
    with mock.patch.object(exporter, "DB_PATH", str(path)), mock.patch("sys.argv", ["export", *argv]), \
            contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
        exporter.main()
    return json.loads(out.getvalue())


class ExportCase(unittest.TestCase):
    def export(self, exporter, *argv, **tables):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "fixture.sqlite"
        fixture_db(path, **tables)
        return run_export(exporter, path, *argv)


def parties(graph):
    return {n["label"]: n["total"] for n in graph["nodes"] if n["kind"] == "party"}


def donors(graph):
    return {n["label"]: n for n in graph["nodes"] if n["kind"] == "donor"}


class FederalSourceTests(ExportCase):
    def test_only_aec_returns_reach_the_federal_map_party_totals_and_meta(self):
        g = self.export(federal, donations=[
            ("Acme Pty Ltd", "Labor", 6_000_000, "2019-20", "finance", "aec_annual"),
            ("Acme Pty Ltd", "Labor", 1_000_000, "2022", "finance", "aec_election"),
            ("Acme Pty Ltd", "Labor", 500_000, "2023", "finance", "aec_referendum"),
            # the third-party copy of the same AEC return, and a Queensland ECQ row
            ("Acme Pty Ltd", "Labor", 6_000_000, "2019-20", "finance", "icacpls"),
            ("Acme Pty Ltd", "LNP", 2_000_000, "2020-21", "finance", "qld_ecq"),
        ])
        self.assertEqual(parties(g), {"Labor": 7_500_000})
        self.assertEqual(donors(g)["Acme Pty Ltd"]["total"], 7_500_000)
        self.assertEqual(g["meta"]["rows_excluded_non_aec_source"], {"icacpls": 1, "qld_ecq": 1})

    def test_disclosure_references_never_cite_a_raw_source_key_or_an_ecq_row_as_the_aec(self):
        g = self.export(federal, donations=[
            ("Acme Pty Ltd", "Labor", 6_000_000, "2019-20", "finance", "aec_annual"),
            ("Acme Pty Ltd", "Labor", 1_000_000, "2014-15", "finance", "icacpls"),
            ("Acme Pty Ltd", "LNP", 1_000_000, None, "finance", "qld_ecq"),
        ])
        refs = donors(g)["Acme Pty Ltd"]["returnReferences"]
        self.assertEqual([(r["return_type"], r["year"]) for r in refs], [("AEC annual return", "2019-20")])

    def test_grants_remote_program_carries_the_same_aec_predicate(self):
        # export_grants streams its program to the DB host and cannot import donor_disclosure.
        source = (ROOT / "scripts/export_grants.py").read_text()
        reads = re.findall(r"FROM donations.*?\"\)", source, re.S)
        self.assertTrue(reads, "export_grants no longer reads donations?")
        for read in reads:
            self.assertIn(dd.AEC_SOURCE_SQL, read.replace('"\n           "', "").replace('" "', ""))
        self.assertEqual(dd.AEC_SOURCE_SQL, "source IN (%s)" % ",".join(f"'{s}'" for s in dd.AEC_SOURCES))

    def test_disclosure_catalogue_federal_rows_are_aec_only_and_qld_keeps_ecq(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "f.sqlite"
        fixture_db(path, donations=[("Acme Pty Ltd", "Labor", 100, "2019-20", "finance", "aec_annual"),
                                    ("Acme Pty Ltd", "Labor", 900, "2014-15", "finance", "icacpls"),
                                    ("Acme Pty Ltd", "LNP", 50, "2020-21", "finance", "qld_ecq")],
                   ext=[("Acme Pty Ltd", "LNP", 50, "2020-21", "finance", "qld", "qld_ecq")])
        db = sqlite3.connect(path)
        self.addCleanup(db.close)
        catalog = disclosure_catalog(db, [{"id": "donor:acme", "label": "Acme Pty Ltd", "kind": "donor",
                                           "aliases": [], "references": []}], selected_receipts(("Acme Pty Ltd", 100, [])))
        by_jur = {d["jurisdiction"]: d for d in catalog["donors"]}
        self.assertEqual(by_jur["federal"]["total"], 100)
        self.assertEqual({r["return_type"] for r in by_jur["federal"]["returnReferences"]}, {"AEC annual return"})
        self.assertEqual(by_jur["qld"]["total"], 50)
        self.assertEqual(by_jur["qld"]["returnReferences"][0]["return_type"], "ECQ gift")
        self.assertNotIn("transparency.aec.gov.au", by_jur["qld"]["returnReferences"][0]["url"])


class PublicFundingTests(ExportCase):
    def test_misspelt_commissions_and_funding_authorities_are_public_funding(self):
        for name in ("NSW Electoral Comission", "Australian Electoral Commision", "Electoral Commissions SA",
                     "NSW Electoral Funding Authority", "Election Funding Authority of NSW"):
            with self.subTest(name=name):
                self.assertTrue(federal.PUBLIC_FUNDING_RE.search(name))
                self.assertTrue(state.PUBLIC_FUNDING_RE.search(name))
                self.assertEqual(resolver.guess_kind(name), "government")

    def test_electoral_commission_is_neither_a_donor_nor_party_income(self):
        g = self.export(federal, donations=[
            ("NSW Electoral Comission", "Labor", 9_000_000, "2019-20", "finance", "aec_annual"),
            ("Acme Pty Ltd", "Labor", 6_000_000, "2019-20", "finance", "aec_annual"),
        ])
        self.assertNotIn("NSW Electoral Comission", donors(g))
        self.assertEqual(parties(g), {"Labor": 6_000_000})

    def test_a_payment_from_a_government_entity_is_not_party_income(self):
        g = self.export(federal, donations=[
                ("Parliament of Victoria", "Greens", 4_000_000, "2019-20", "other", "aec_annual"),
                ("Acme Pty Ltd", "Greens", 6_000_000, "2019-20", "finance", "aec_annual")],
            entities=[("parliament-of-victoria", "Parliament of Victoria", "government")],
            aliases=[("Parliament of Victoria", "parliament-of-victoria", 1, "exact")])
        self.assertEqual(parties(g), {"Greens": 6_000_000})
        self.assertEqual(g["meta"]["party_rows_excluded_government_entity"], 1)

    def test_state_party_totals_drop_government_entities_too(self):
        g = self.export(state, "qld", ext=[
                ("Brisbane City Council", "Labor", 5_000, "2020-21", "other", "qld", "qld_ecq"),
                ("Acme Pty Ltd", "Labor", 200_000, "2020-21", "finance", "qld", "qld_ecq")],
            entities=[("brisbane-city-council", "Brisbane City Council", "government")],
            aliases=[("Brisbane City Council", "brisbane-city-council", 1, "exact")])
        self.assertEqual(parties(g), {"Labor": 200_000})


class IndustryTests(ExportCase):
    def test_an_organisation_tagged_individual_is_shown_by_its_next_tag_or_other(self):
        for exporter, argv, rows in (
                (federal, (), {"donations": [("Kriticos Nominees Pty Ltd", "Liberal", 6_000_000, "2019-20", "individual", "aec_annual"),
                                             ("Chorus Consulting", "Liberal", 3_000_000, "2019-20", "individual", "aec_annual"),
                                             ("Chorus Consulting", "Liberal", 3_000_000, "2020-21", "property", "aec_annual")]}),
                (state, ("tas",), {"ext": [("Kriticos Nominees Pty Ltd", "Liberal", 6_000, "2025-26", "individual", "tas", "tas_tec"),
                                           ("Chorus Consulting", "Liberal", 3_000, "2025-26", "individual", "tas", "tas_tec"),
                                           ("Chorus Consulting", "Liberal", 2_000, "2025-26", "property", "tas", "tas_tec")]})):
            with self.subTest(exporter=exporter.__name__):
                g = self.export(exporter, *argv, **rows,
                                entities=[("kriticos", "Kriticos Nominees Pty Ltd", "company"),
                                          ("chorus", "Chorus Consulting", "company")],
                                aliases=[("Kriticos Nominees Pty Ltd", "kriticos", 1, "exact"),
                                         ("Chorus Consulting", "chorus", 1, "exact")])
                shown = donors(g)
                self.assertEqual(shown["Kriticos Nominees Pty Ltd"]["industry"], "other")
                self.assertEqual(shown["Chorus Consulting"]["industry"], "property")

    def test_a_person_stays_individual(self):
        g = self.export(federal, donations=[("Pamela Wall", "Liberal", 6_000_000, "2019-20", "individual", "aec_annual")],
                        entities=[("pamela-wall", "Pamela Wall", "individual")],
                        aliases=[("Pamela Wall", "pamela-wall", 1, "exact")])
        self.assertEqual(donors(g)["Pamela Wall"]["industry"], "individual")


class NodeIdTests(ExportCase):
    def test_a_spelling_loaded_after_the_resolver_ran_joins_its_entity(self):
        # state-datasets-008: "TIm Mead" filed after the last resolver run made a second "donor:tim mead"
        g = self.export(state, "tas",
                        ext=[("Tim Mead", "Liberal", 3_700, "2025-26", "individual", "tas", "tas_tec"),
                             ("TIm Mead", "Liberal", 1_401, "2026-27", "individual", "tas", "tas_tec")],
                        entities=[("tim-mead", "Tim Mead", "individual")],
                        aliases=[("Tim Mead", "tim-mead", 1, "exact")])
        ids = [n["id"] for n in g["nodes"]]
        self.assertEqual(len(ids), len(set(ids)))
        mead = [n for n in g["nodes"] if n["id"] == "donor:tim mead"]
        self.assertEqual(len(mead), 1)
        self.assertEqual((mead[0]["total"], mead[0]["count"]), (5_101, 2))
        self.assertEqual([e["amount"] if "amount" in e else e.get("total") for e in g["edges"]
                          if e.get("source") == "donor:tim mead"], [5_101])

    def test_two_entities_that_display_alike_get_distinct_ids(self):
        for exporter, argv, rows in (
                (federal, (), {"donations": [("Smith Holdings", "Labor", 6_000_000, "2019-20", "finance", "aec_annual"),
                                             ("SMITH HOLDINGS P/L", "Liberal", 7_000_000, "2019-20", "finance", "aec_annual")]}),
                (state, ("tas",), {"ext": [("Smith Holdings", "Labor", 6_000, "2025-26", "finance", "tas", "tas_tec"),
                                           ("SMITH HOLDINGS P/L", "Liberal", 7_000, "2025-26", "finance", "tas", "tas_tec")]})):
            with self.subTest(exporter=exporter.__name__):
                g = self.export(exporter, *argv, **rows,
                                entities=[("smith-a", "Smith Holdings", "company"), ("smith-b", "Smith Holdings", "company")],
                                aliases=[("Smith Holdings", "smith-a", 1, "exact"), ("SMITH HOLDINGS P/L", "smith-b", 1, "exact")])
                ids = [n["id"] for n in g["nodes"]]
                self.assertEqual(len(ids), len(set(ids)), ids)
                key = "donor:" + exporter.norm_key("Smith Holdings")
                self.assertEqual(sorted(i for i in ids if i.startswith("donor:")), [key, key + "~smith-a"])
                self.assertEqual(g["meta"]["node_id_collisions"], 1)
                self.assertTrue({key, key + "~smith-a"} <= {e["source"] for e in g["edges"]})


class NameCleaningTests(unittest.TestCase):
    SAMPLES = {
        "Slater &amp; Gordon Ltd": "Slater & Gordon Ltd",
        "Spirits &amp;amp; Cocktails Australia": "Spirits & Cocktails Australia",
        "O&#39;Brien Group": "O'Brien Group",
        "Sandvik&#160;Australia": "Sandvik Australia",
        "Transport Workersâ€™ Union": "Transport Workers’ Union",
        "Smith &Regal Pty Ltd": "Smith &Regal Pty Ltd",
        "Bell &para Co": "Bell &para Co",
        "  Plain   Name ": "Plain Name",
    }

    def test_clean_name_decodes_entities_and_mojibake_and_leaves_the_rest(self):
        for raw, want in self.SAMPLES.items():
            with self.subTest(raw=raw):
                self.assertEqual(dd.clean_name(raw), want)

    def test_scripts_and_resolver_copies_agree(self):
        for raw in [*self.SAMPLES, "J.J. Richards & Sons Pty Ltd", "JJ RICHARDS & SONS P/L", "TIm Mead", ""]:
            with self.subTest(raw=raw):
                self.assertEqual(dd.clean_name(raw), resolver.clean_name(raw))
                self.assertEqual(dd.norm_exact(raw), resolver.norm_exact(raw))

    def test_an_entity_encoded_spelling_matches_its_decoded_twin(self):
        self.assertEqual(dd.norm_exact("Slater &amp; Gordon"), dd.norm_exact("Slater & Gordon"))
        self.assertEqual(dd.norm_exact("TIm Mead"), dd.norm_exact("Tim Mead"))

    def test_exact_index_leaves_out_a_key_two_entities_share(self):
        index = dd.exact_alias_index({"Tim Mead": "tim-mead", "Joyce": "joyce-person", "JOYCE": "joyce-co"})
        self.assertEqual(index, {"tim mead": "tim-mead"})
        self.assertEqual(dd.resolve_alias("TIm Mead", {"Tim Mead": "tim-mead"}, index), "tim-mead")
        self.assertIsNone(dd.resolve_alias("Joyce", {}, index))


def raw(name, total=1000.0, count=1):
    n = resolver.RawName(name)
    n.total, n.count = total, count
    n.seen_in.add("donations")
    return n


class ResolverTests(unittest.TestCase):
    def resolve(self, *names):
        entities, _ = resolver.resolve({n: raw(n) for n in names}, resolver.load_curated())
        return {m[0].raw: e for e in entities.values() for m in e.members}

    def test_entity_encoded_spellings_resolve_with_their_decoded_twin(self):
        got = self.resolve("Slater & Gordon Lawyers", "Slater &amp; Gordon Lawyers")
        self.assertIs(got["Slater & Gordon Lawyers"], got["Slater &amp; Gordon Lawyers"])
        self.assertNotIn("&amp;", got["Slater & Gordon Lawyers"].canonical)

    def test_curated_jj_richards_and_nalspa_merges(self):
        got = self.resolve("J.J. Richards & Sons Pty Ltd", "JJ Richards & Sons Pty Ltd", "JJ Richards & Sons P/L",
                           "National Automotive Leasing & Salary Packaging Ass",
                           "National Automotive Leasing & Salary Pack")
        self.assertEqual({got[n].entity_id for n in ("J.J. Richards & Sons Pty Ltd", "JJ Richards & Sons Pty Ltd",
                                                     "JJ Richards & Sons P/L")}, {"j-j-richards-sons"})
        self.assertEqual(got["JJ Richards & Sons P/L"].kind, "company")
        nalspa = {got[n].entity_id for n in ("National Automotive Leasing & Salary Packaging Ass",
                                             "National Automotive Leasing & Salary Pack")}
        self.assertEqual(len(nalspa), 1)
        self.assertEqual(next(iter(nalspa)), next(c["id"] for c in resolver.load_curated()
                                                  if c["canonical"].startswith("National Automotive Leasing")))

    def test_unproven_variants_stay_apart(self):
        got = self.resolve("J R Richards & Sons", "JJ Richards & Sons Pty Ltd")
        self.assertIsNot(got["J R Richards & Sons"], got["JJ Richards & Sons Pty Ltd"])

    def test_electoral_commission_spellings_are_government(self):
        got = self.resolve("NSW Electoral Comission", "Australian Electoral Commision",
                           "NSW Electoral Funding Authority")
        self.assertEqual({e.kind for e in got.values()}, {"government"})


class DisclosureLabelTests(unittest.TestCase):
    def db(self, rows, entity_kind="union"):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript(SCHEMA)
        db.executemany("INSERT INTO donations (donor_name,amount,financial_year,source,donation_id,donation_type,"
                       "recipient_canonical) VALUES (?,?,?,'aec_annual',?, 'gift','Labor')",
                       [(n, a, y, k) for k, (n, a, y) in enumerate(rows)])
        db.execute("INSERT INTO ext_donor_entities VALUES ('sda','Shop, Distributive and Allied Employees Association',?)",
                   (entity_kind,))
        db.executemany("INSERT INTO ext_donor_aliases VALUES (?, 'sda', 1, 'curated')", [(n,) for n, _, _ in rows])
        return db

    def node(self, db, label="Shop, Distributive and Allied Employees Association"):
        graph = {"meta": {}, "nodes": [{"id": "donor:x", "label": label, "kind": "donor", "aliases": [],
                                        "entity_id": "sda"}], "edges": []}
        return dd.attach_donor_disclosures(db, graph, "federal")["nodes"][0]

    def test_a_rolled_up_union_keeps_its_canonical_label_not_its_biggest_branch(self):
        node = self.node(self.db([("SDA Vic Branch", 900, "2019-20"), ("SDA NSW Branch", 100, "2019-20")]))
        self.assertEqual(node["label"], "Shop, Distributive and Allied Employees Association")
        self.assertEqual(node["source_name"], "SDA Vic Branch")
        self.assertEqual(sorted(node["aliases"]), ["SDA NSW Branch", "SDA Vic Branch"])

    def test_one_spelling_is_shown_as_filed_and_decoded(self):
        node = self.node(self.db([("Shop, Distributive &amp; Allied", 900, "2019-20")]))
        self.assertEqual(node["label"], "Shop, Distributive & Allied")
        self.assertEqual(node["returnReferences"][0]["source_name"], "Shop, Distributive & Allied")
        self.assertNotIn("&amp;", json.dumps(node))


class CatalogueDedupeTests(unittest.TestCase):
    def test_two_spellings_of_one_entity_publish_one_record_answering_to_both(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript(SCHEMA)
        db.executemany("INSERT INTO donations (donor_name,amount,financial_year,source,donation_id,donation_type,"
                       "recipient_canonical) VALUES (?,?,?,'aec_annual',?,'gift','Liberal')",
                       [("Pratt Holdings Pty Ltd", 300, "2019-20", 1), ("PRATT HOLDINGS P/L", 200, "2020-21", 2)])
        db.execute("INSERT INTO ext_donor_entities VALUES ('pratt','Pratt Holdings Pty Ltd','company')")
        db.executemany("INSERT INTO ext_donor_aliases VALUES (?, 'pratt', 1, 'rule')",
                       [("Pratt Holdings Pty Ltd",), ("PRATT HOLDINGS P/L",)])
        candidates = [{"id": "donor:a", "label": "Pratt Holdings Pty Ltd", "kind": "donor", "aliases": [], "references": []},
                      {"id": "donor:b", "label": "PRATT HOLDINGS P/L", "kind": "donor", "aliases": [], "references": []}]
        records = disclosure_catalog(db, candidates, selected_receipts(("Pratt Holdings Pty Ltd", 500, ["PRATT HOLDINGS P/L"])))["donors"]
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["total"], 500)
        self.assertEqual(records[0]["lookup_names"], ["PRATT HOLDINGS P/L", "Pratt Holdings Pty Ltd"])

    def test_different_returns_are_never_merged(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript(SCHEMA)
        db.executemany("INSERT INTO donations (donor_name,amount,financial_year,source,donation_id,donation_type,"
                       "recipient_canonical) VALUES (?,?,?,'aec_annual',?,'gift','Liberal')",
                       [("Acme A", 300, "2019-20", 1), ("Acme B", 200, "2020-21", 2)])
        candidates = [{"id": "donor:a", "label": "Acme A", "kind": "donor", "aliases": [], "references": []},
                      {"id": "donor:b", "label": "Acme B", "kind": "donor", "aliases": [], "references": []}]
        self.assertEqual(len(disclosure_catalog(db, candidates, selected_receipts(("Acme A", 300, []), ("Acme B", 200, [])))["donors"]), 2)


if __name__ == "__main__":
    unittest.main()
