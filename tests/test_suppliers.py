import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

_spec = importlib.util.spec_from_file_location('export_suppliers', Path(__file__).resolve().parents[1] / 'scripts/export_suppliers.py')
exporter = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(exporter)


class SupplierExportTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
            CREATE TABLE ext_contract_suppliers (supplier_id TEXT PRIMARY KEY,canonical_name TEXT,abn TEXT,
                abn_method TEXT,abr_name TEXT,abr_status TEXT,abr_etype TEXT,kind TEXT,
                donor_entity_id TEXT,donor_method TEXT,donor_confidence REAL);
            CREATE TABLE ext_contract_supplier_keys (source TEXT,key_type TEXT,key_value TEXT,supplier_id TEXT);
            CREATE TABLE ext_donor_entities (entity_id TEXT,canonical_name TEXT,abn TEXT);
            CREATE TABLE ext_contracts_current (base_cn TEXT PRIMARY KEY,cn_id TEXT,notices INTEGER,
                supplier_name TEXT,supplier_abn TEXT,agency TEXT,amount REAL,start_date TEXT,end_date TEXT,
                published TEXT,title TEXT,description TEXT,procurement_method TEXT);
            INSERT INTO ext_contract_suppliers VALUES ('abn:11111111111','Acme Limited','11111111111',
                'source','ACME LIMITED','Active','Company','company','donor1','abn',1.0);
            INSERT INTO ext_contract_supplier_keys VALUES ('austender','abn','11111111111','abn:11111111111');
            INSERT INTO ext_contract_supplier_keys VALUES ('austender','name','ACME','abn:11111111111');
            INSERT INTO ext_contract_supplier_keys VALUES ('qld','name','ACME','unrelated-state-supplier');
            INSERT INTO ext_donor_entities VALUES ('donor1','Acme Limited','11111111111');
        ''')
        self.graph = {'meta': {'generated': '2026-09-07'}, 'nodes': [
            {'id': 'donor:acme', 'kind': 'donor', 'label': 'Acme Limited', 'contracts': {'rid': 'abn:11111111111'}}]}

    def tearDown(self):
        self.db.close()

    def add(self, cn, name='ACME', abn='11111111111', value=10.25, start='2025-01-01', notices=1):
        self.db.execute('INSERT INTO ext_contracts_current VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        (cn, cn+'-A1' if notices > 1 else cn, notices, name, abn, 'Agency', value,
                         start, '2028-01-01', '2026-06-01', 'Title', 'Description', 'Open tender'))

    def export(self):
        self.db.commit()
        return exporter.build_export(self.db, self.graph)

    def test_latest_values_conserve_totals_and_keep_all_contracts(self):
        self.add('CN1', value=20.25, notices=3)
        self.add('CN2', value=0.75, start='not-a-date')
        result = self.export()
        index = result['index']
        self.assertEqual(index['meta']['contract_count'], 2)
        self.assertEqual(index['meta']['notice_count'], 4)
        self.assertEqual(index['meta']['total'], 21)
        entry = index['suppliers'][0]
        profile = result['shards'][entry['profile_path']]['profiles'][entry['id']]
        self.assertEqual(profile['total'], sum(c['amount'] for c in profile['contracts']))
        self.assertEqual(profile['total'], sum(y['total'] for y in profile['years']) + profile['undated']['total'])
        self.assertEqual(profile['total'], sum(a['total'] for a in profile['agencies']))
        self.assertEqual(profile['undated']['count'], 1)
        self.assertEqual(entry['money_node_ids'], ['donor:acme'])
        self.assertEqual(profile['donor_links'][0]['method'], 'published_graph_supplier_id')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM ext_contracts_current').fetchone()[0], 2)
        with self.assertRaises(sqlite3.OperationalError):
            self.db.execute('DELETE FROM ext_contracts_current')

    def test_identical_names_with_different_abns_are_not_merged(self):
        self.add('CN1')
        self.add('CN2', abn='22222222222')
        result = self.export()
        rows = result['index']['suppliers']
        self.assertEqual(len(rows), 2)
        self.assertEqual({s['abn'] for s in rows}, {'11111111111', '22222222222'})
        self.assertEqual(len({s['id'] for s in rows}), 2)
        self.assertEqual(sum(bool(s['money_node_ids']) for s in rows), 1)

    def test_empty_registry_abn_does_not_merge_distinct_source_abns(self):
        self.db.execute("UPDATE ext_contract_suppliers SET abn=NULL")
        self.add('CN1', abn='22222222222')
        self.add('CN2', abn='33333333333')
        rows = self.export()['index']['suppliers']
        self.assertEqual(len(rows), 2)
        self.assertEqual({s['abn'] for s in rows}, {'22222222222', '33333333333'})
        self.assertTrue(all(not s['money_node_ids'] for s in rows))

    def test_placeholder_1900_start_year_is_undated(self):
        self.add('CN1', start='1900-01-01')
        result = self.export()
        row = result['index']['suppliers'][0]
        profile = result['shards'][row['profile_path']]['profiles'][row['id']]
        self.assertIsNone(row['first_year'])
        self.assertEqual(profile['undated']['count'], 1)
        self.assertEqual(profile['undated']['total'], profile['total'])

    def test_stable_ids_aliases_and_source_specific_keys(self):
        self.add('CN1', name='ACME')
        self.add('CN2', name='Acme Limited')
        self.add('CN3', name='ACME', abn='')
        result = self.export()
        rows = result['index']['suppliers']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], exporter.public_id('abn:11111111111'))
        self.assertEqual(rows[0]['aliases'], ['ACME', 'Acme Limited'])
        self.assertEqual(rows[0]['count'], 3)

    def test_unresolved_names_have_profiles_without_invented_funding_links(self):
        self.add('CN1', name='Mystery Holdings', abn='')
        self.add('CN2', name=' mystery holdings ', abn='')
        self.graph['nodes'].append({'id': 'donor:mystery', 'kind': 'donor', 'label': 'Mystery Holdings'})
        result = self.export()
        rows = result['index']['suppliers']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['money_node_ids'], [])
        self.assertEqual(result['index']['meta']['unresolved_contract_rows'], 2)

    def test_ambiguous_graph_labels_do_not_create_name_link(self):
        self.add('CN1')
        self.graph['nodes'] = [
            {'id':'donor:one','kind':'donor','label':'Acme Limited'},
            {'id':'donor:two','kind':'donor','label':'ACME LIMITED'},
        ]
        self.assertEqual(self.export()['index']['suppliers'][0]['money_node_ids'], [])

    def test_no_fuzzy_rule_link_and_abn_conflict_guard(self):
        self.add('CN1')
        self.graph['nodes'][0].pop('contracts')
        self.db.execute("UPDATE ext_contract_suppliers SET donor_method='name_rule'")
        self.assertEqual(self.export()['index']['suppliers'][0]['money_node_ids'], [])
        self.db.execute('PRAGMA query_only=OFF')
        self.db.execute("UPDATE ext_contract_suppliers SET donor_method='name_exact'")
        self.db.execute("UPDATE ext_donor_entities SET abn='99999999999'")
        self.assertEqual(self.export()['index']['suppliers'][0]['money_node_ids'], [])

    def test_shards_are_readable_and_every_entry_resolves(self):
        self.add('CN1')
        result = self.export()
        with tempfile.TemporaryDirectory() as path:
            exporter.write_export(result, path)
            index = json.loads((Path(path) / 'suppliers.json').read_text())
            for row in index['suppliers']:
                shard = json.loads((Path(path) / row['profile_path'].lstrip('/')).read_text())
                self.assertEqual(shard['profiles'][row['id']]['name'], row['name'])

    def test_empty_register_fails_closed(self):
        self.db.execute('DELETE FROM ext_contract_suppliers')
        self.db.commit()
        with self.assertRaisesRegex(ValueError, 'register is empty'):
            exporter.build_export(self.db, self.graph)

    def test_legacy_supplement_deduplicates_lineages_and_keeps_current_values(self):
        self.add('CN1', value=100)
        self.db.executescript('''
            CREATE TABLE contracts (contract_id TEXT PRIMARY KEY,supplier_name TEXT,agency TEXT,
                amount REAL,start_date TEXT,end_date TEXT,title TEXT,description TEXT,procurement_method TEXT);
            INSERT INTO contracts VALUES ('CN1-A8','ACME','Agency',900,'2024-01-01',NULL,'Old value',NULL,NULL);
            INSERT INTO contracts VALUES ('CN2','Secure Journeys','Agency',20,'2024-01-01',NULL,'Original',NULL,NULL);
            INSERT INTO contracts VALUES ('CN2-A2','Secure Journeys','Agency',30,'2024-01-01',NULL,'Amended',NULL,NULL);
            INSERT INTO contracts VALUES ('CN2-A10','Secure Journeys','Agency',40,'2024-01-01',NULL,'Latest legacy',NULL,NULL);
            INSERT INTO contracts VALUES ('CN3','acme','Agency',10,'2023-01-01',NULL,'Older contract',NULL,NULL);
        ''')
        result = self.export()
        self.assertEqual(result['index']['meta']['current_contract_count'], 1)
        self.assertEqual(result['index']['meta']['supplemental_legacy_contract_count'], 2)
        self.assertEqual(result['index']['meta']['total'], 150)
        self.assertEqual(len(result['index']['suppliers']), 2)
        acme = next(s for s in result['index']['suppliers'] if s['name'] == 'Acme Limited')
        self.assertEqual(acme['total'], 110)
        self.assertEqual(acme['lookup_names'], ['Acme Limited'])
        secure = next(s for s in result['index']['suppliers'] if s['name'] == 'Secure Journeys')
        detail = result['shards'][secure['profile_path']]['profiles'][secure['id']]
        self.assertEqual(detail['contracts'][0]['id'], 'CN2-A10')
        self.assertEqual(detail['contracts'][0]['amount'], 40)
        self.assertEqual(detail['contracts'][0]['source_table'], 'contracts')

    def test_legacy_direct_name_key_cannot_bypass_identity_ambiguity(self):
        self.db.execute("UPDATE ext_contract_suppliers SET canonical_name='ACME'")
        self.db.execute('INSERT INTO ext_contract_suppliers VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                        ('abn:22222222222', 'ACME', '22222222222', 'source', None, None,
                         None, 'company', None, None, None))
        self.db.executescript('''
            CREATE TABLE contracts (contract_id TEXT PRIMARY KEY,supplier_name TEXT,agency TEXT,
                amount REAL,start_date TEXT,end_date TEXT,title TEXT,description TEXT,procurement_method TEXT);
            INSERT INTO contracts VALUES ('CN9','ACME','Agency',50,'2024-01-01',NULL,'Legacy',NULL,NULL);
        ''')
        result = self.export()
        row = result['index']['suppliers'][0]
        self.assertEqual(row['canonical_id'], 'raw-name:acme')
        self.assertIsNone(row['abn'])
        self.assertEqual(row['money_node_ids'], [])
        self.assertEqual(result['index']['meta']['unresolved_contract_rows'], 1)


if __name__ == '__main__':
    unittest.main()
