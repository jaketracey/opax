"""False-positive and provenance boundaries for corpus relationship extraction."""
import importlib.util
from pathlib import Path
import tempfile
import sqlite3
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from evidence_quality import publishable_alias
import unittest

spec=importlib.util.spec_from_file_location('layers',Path(__file__).resolve().parents[2]/'scripts/build_evidence_layers.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class EvidenceLayersTest(unittest.TestCase):
    def test_common_phrases_and_loose_aliases_are_not_published(self):
        self.assertFalse(publishable_alias('our community','Our Community Pty Ltd'))
        self.assertFalse(publishable_alias('The Farm','The Farm'))
        self.assertFalse(publishable_alias('Australian Public Service','Australian Public Service Commission'))
        self.assertTrue(publishable_alias('Reserve Bank of Australia','Reserve Bank of Australia'))
        self.assertTrue(publishable_alias('Acme Holdings','Acme Holdings Pty Ltd'))

    def test_mismatched_legal_identity_is_quarantined(self):
        self.assertFalse(m.compatible_names('Construction Control Interiors Pty Ltd',
            'DEPARTMENT OF CLIMATE CHANGE AND ENERGY EFFICIENCY'))
        self.assertTrue(m.compatible_names('Construction Control Interiors Pty Ltd',
            'CCONTROL INTERIORS PTY LIMITED'))

    def test_postcode_overlap_keeps_candidates_and_location_roles(self):
        source=sqlite3.connect(':memory:'); source.row_factory=sqlite3.Row
        source.executescript("""
            CREATE TABLE postcode_electorates(postcode,electorate_name,state,ratio);
            INSERT INTO postcode_electorates VALUES ('2000','One','nsw',0.6),('2000','Two','nsw',0.4);
            CREATE TABLE ext_grant_details(ga_id,recipient_postcode,recipient_state,delivery_postcode,delivery_state);
            INSERT INTO ext_grant_details VALUES ('GA1','2000','NSW','2000','NSW');
            CREATE TABLE ext_contract_suppliers(supplier_id,abr_postcode,abr_state);
            CREATE TABLE ext_grant_recipients(recipient_id,abr_postcode,abr_state);
        """)
        with tempfile.TemporaryDirectory() as d:
            out=m.setup(str(Path(d)/'e.sqlite'))
            m.structured_places(source,out)
            self.assertEqual(out.execute('select count(*) from evidence').fetchone()[0],4)
            self.assertEqual(set(r[0] for r in out.execute('select predicate from evidence')),
                {'recipient_address_overlaps','delivery_postcode_overlaps'})
            import json
            for (details,) in out.execute('select details from evidence'):
                self.assertEqual(json.loads(details)['candidate_electorates'],2)
            out.close()
        source.close()

    def test_abn_checksum_and_invalid_source(self):
        self.assertEqual(m.valid_abn('51 824 753 556'),'51824753556')
        for value in ['51824753557','00000000000','not an ABN','123']:
            self.assertIsNone(m.valid_abn(value))

    def test_ambiguous_alias_never_becomes_a_mention(self):
        matcher=m.Matcher({m.tokens('Acme Holdings'):{'abn:one','abn:two'}})
        self.assertEqual(list(matcher.matches('Acme Holdings was awarded a contract.')),[])

    def test_exact_offsets_survive_case_and_whitespace(self):
        matcher=m.Matcher({m.tokens('Acme Holdings'):{'acme'}})
        text='The ACME  Holdings contract was announced.'
        rows=list(matcher.matches(text))
        self.assertEqual(rows,[('acme',4,18)])
        self.assertEqual(text[rows[0][1]:rows[0][2]],'ACME  Holdings')

    def test_no_partial_words_or_cross_sentence_names(self):
        matcher=m.Matcher({m.tokens('Acme Holdings'):{'acme'}})
        for text in ['Acme Holdingsworth','Acme. Holdings','Acme\nHoldings']:
            self.assertEqual(list(matcher.matches(text)),[])

    def test_generic_and_single_word_names_excluded(self):
        matcher=m.Matcher({m.tokens('Australian Government'):{'a'},m.tokens('Health'):{'b'}})
        self.assertEqual(list(matcher.matches('Australian Government Health')),[])

    def test_evidence_is_idempotent_and_keeps_original_quote(self):
        with tempfile.TemporaryDirectory() as d:
            db=m.setup(str(Path(d)/'e.sqlite'))
            for _ in range(2):
                m.add_evidence(db,'speech:1','mentions','org:1','speeches','1',
                    'ACME  Holdings','unique_exact_alias',.98,start=4,end=18)
            self.assertEqual(db.execute('select count(*) from evidence').fetchone()[0],1)
            self.assertEqual(db.execute('select quote,start,end from evidence').fetchone(),('ACME  Holdings',4,18))
            db.close()

if __name__=='__main__': unittest.main()

class ExportCoverageTest(unittest.TestCase):
    def test_export_refuses_partial_corpus_without_preview_flag(self):
        from export_evidence_layers import export
        with tempfile.TemporaryDirectory() as d:
            path=Path(d); source=sqlite3.connect(path/'source.sqlite')
            source.executescript('CREATE TABLE speeches(id); INSERT INTO speeches VALUES(1); CREATE TABLE ext_press_releases(id);')
            source.close(); out=m.setup(str(path/'e.sqlite'));out.close()
            with self.assertRaisesRegex(ValueError,'incomplete'):
                export(str(path/'source.sqlite'),str(path/'e.sqlite'),str(path/'public'))
            self.assertFalse((path/'public').exists())

class IdentityDecisionTest(unittest.TestCase):
    def test_full_name_with_validated_abn_can_resolve(self):
        from review_evidence_identities import decide
        candidate={'name':'Acme Holdings Pty Ltd'};target={'name':'Acme Holdings Pty Ltd','abn':'51824753556'}
        original=[{'source_name':'Acme Holdings Pty Ltd','source_abn':None,'method':'source_identity'}]
        supported=[{'source_name':'Acme Holdings Pty Ltd','source_abn':'51824753556','method':'validated_source_abn'}]
        self.assertEqual(decide(candidate,target,original,supported)[0],'accepted')
        self.assertEqual(decide(candidate,target,original,supported,{'51824753556','other'})[0],'unresolved')
        original[0]['source_abn']='12345678901'
        self.assertEqual(decide(candidate,target,original,supported)[0],'unresolved')

    def test_similar_name_and_generic_phrase_remain_unresolved(self):
        from review_evidence_identities import decide
        source=[{'source_name':'Acme','source_abn':None,'method':'source_identity'}]
        target=[{'source_name':'Acme Holdings','source_abn':'51824753556','method':'validated_source_abn'}]
        self.assertEqual(decide({'name':'Acme'},{'name':'Acme Holdings','abn':'51824753556'},source,target)[0],'unresolved')
