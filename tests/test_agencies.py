import unittest
from decimal import Decimal
from pathlib import Path
import json
from scripts.export_agencies import build_agencies, agency_id

class AgencyExportTests(unittest.TestCase):
    def test_names_stay_separate_and_supplier_identity_is_preserved(self):
        profiles = [dict(id='s-one', name='Same name', abn='123', donor_links=[], contracts=[
            dict(id='CN1', agency='Department A', amount=10.1, start_date='2025-02-01'),
            dict(id='CN2', agency='Department A renamed', amount=-2, start_date='bad')]),
            dict(id='s-two', name='Same name', abn='456', donor_links=[], contracts=[
                dict(id='CN3', agency='Department A', amount=0.2, start_date='2025-02-31')])]
        directory, profiles = build_agencies(profiles, {})
        self.assertEqual(len(directory['agencies']), 2)
        a = profiles[agency_id('Department A')]
        self.assertEqual(a['total'], 10.3)
        self.assertEqual(a['supplier_count'], 2)
        self.assertEqual(a['undated']['total'], 0.2)
        self.assertEqual(a['years'][0]['count'], 1)
        self.assertNotEqual(agency_id('Department A'), agency_id('Department A renamed'))

    def test_published_totals_reconcile_in_both_directions(self):
        root = Path(__file__).resolve().parents[1] / 'portal/public'
        suppliers = json.loads((root/'suppliers.json').read_text())
        agencies = json.loads((root/'agencies.json').read_text())
        money = lambda rows: sum(Decimal(str(r['total'])) for r in rows)
        self.assertEqual(sum(a['count'] for a in agencies['agencies']), suppliers['meta']['contract_count'])
        self.assertEqual(money(agencies['agencies']), money(suppliers['suppliers']))
        pairs = {}
        contract_ids = set()
        for entry in agencies['agencies']:
            profile = json.loads((root/entry['profile_path'].lstrip('/')).read_text())
            self.assertEqual(money(profile['suppliers']), Decimal(str(profile['total'])))
            self.assertEqual(money(profile['years'] + [profile['undated']]), Decimal(str(profile['total'])))
            self.assertEqual(sum(s['count'] for s in profile['suppliers']), profile['count'])
            self.assertEqual(len(profile['contracts']), profile['count'])
            for c in profile['contracts']:
                self.assertNotIn(c['id'], contract_ids)
                contract_ids.add(c['id'])
            for supplier in profile['suppliers']:
                pairs[(supplier['id'], profile['name'])] = (Decimal(str(supplier['total'])), supplier['count'])
        for shard in {s['profile_path'] for s in suppliers['suppliers']}:
            for supplier in json.loads((root/shard.lstrip('/')).read_text())['profiles'].values():
                for a in supplier['agencies']:
                    self.assertEqual(pairs.pop((supplier['id'], a['name'])), (Decimal(str(a['total'])), a['count']))
        self.assertFalse(pairs)
