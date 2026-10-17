"""Synthetic sheets following Treasury's Code/Title/eight-year workbook layout."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.tax_expenditures.parse import CC, SHEET, value, parse_sheet, key, permitted
from scripts.tax_expenditures.stage import projection
from scripts.tax_expenditures.check import checked_projection

ROOT=Path(__file__).resolve().parents[1]


def fixture():
    d={'id':'p2025-721342-chart-data.xlsx','url':'https://treasury.gov.au/sites/default/files/2025-12/p2025-721342-chart-data.xlsx',
        'format':'XLSX','statement':'2025-26','status':'cleared','exceptions':[],
        'receipt':{'status':200,'held':False,'challenge':False,'snapshot':'2026-10-17T00:00:00Z','sha256':'a'*64},
        'licence':{'status':'open','url':CC,'document_reviewed':True}}
    item={'item_id':'A1','title':'Example exemption','category':'Personal income tax','benchmark':'Appendix A.2: Income tax benchmark',
          'record_kind':'item','document_table':53,'reliability':'Medium','tax_expenditure_type':'Exemption','cells':{'2025-26':'C2','2026-27':'D2'}}
    grid=[['Code','Title','2025-26','2026-27'],['A1','Example exemption',-250,'*']]
    inventory={'snapshot':d['receipt']['snapshot'],'statement':'2025-26','statement_url':'https://treasury.gov.au/publication/p2025-721342',
        'published_date':'2025-12-17','documents':[d],'items':[item]}
    return d,item,grid,inventory


class TaxExpendituresTest(unittest.TestCase):
    def test_official_sheet_layout_and_negative_unquantified_cells(self):
        d,i,g,_=fixture();rows=parse_sheet(g,d,{'A1':i})
        self.assertEqual(rows[0]['value'],-250);self.assertEqual(rows[0]['source_value'],-250)
        self.assertEqual(rows[0]['cell'],'C2');self.assertEqual(rows[0]['sheet'],SHEET)
        self.assertIsNone(rows[1]['value']);self.assertEqual(rows[1]['source_value'],'*')
        self.assertNotEqual(key(rows[0]),key({**rows[0],'statement':'2024-25'}))

    def test_codes_never_become_zero(self):
        for marker,status in [('-','nil'),('..','non-zero rounded to zero'),('*','unquantifiable'),('nfp','not for publication'),('N/A','not available')]:
            self.assertEqual(value(marker),(None,status))
        self.assertEqual(value(0),(0,'quantified'))
        for raw in [None,'unknown',True,float('nan')]:
            with self.assertRaises(ValueError):value(raw)

    def test_included_item_keeps_workbook_nil_and_statement_reference(self):
        d,i,g,_=fixture();i['included_in']='A2';g[1][2]='-'
        r=parse_sheet(g,d,{'A1':i})[0]
        self.assertIsNone(r['value']);self.assertEqual(r['source_value'],'-')
        self.assertEqual(r['estimate_status'],'included in A2; workbook nil')

    def test_licence_gate_before_parse_and_projection(self):
        d,i,g,inventory=fixture();rows=parse_sheet(g,d,{'A1':i})
        for mutate in [lambda d:d.update(status='held'),lambda d:d['licence'].update(status='held'),lambda d:d['licence'].update(document_reviewed=False),lambda d:d['receipt'].update(challenge=True),lambda d:d.update(exceptions=['Unreviewed notice'])]:
            held=copy.deepcopy(inventory);mutate(held['documents'][0])
            self.assertEqual(parse_sheet(g,held['documents'][0],{'A1':i}),[])
            self.assertEqual(projection(held,rows)['rows'],[])

    def test_never_sums_non_additive_items_or_accepts_invented_totals(self):
        d,i,g,inventory=fixture();rows=parse_sheet(g,d,{'A1':i})
        for invented in [{**rows[0],'item_id':'All items','value':10000,'published':True},
                         {**rows[0],'item_id':'A999','value':10000,'published':True},
                         {**rows[0],'value':10000,'published':False},
                         {**rows[0],'estimate_basis':'outlay equivalent'}]:
            self.assertNotIn(invented,projection(inventory,[*rows,invented])['rows'])
        self.assertEqual(projection(inventory,rows)['rows'],rows)

    def test_staged_counts_and_published_totals_reconcile(self):
        hub,counts=checked_projection(ROOT/'data/staged/tax-expenditures')
        self.assertEqual(counts['rows'],2444);self.assertEqual(counts['internal_rows'],2448);self.assertEqual(counts['withheld_rows_excluded'],4);self.assertEqual(counts['published_combined_rows'],16)
        self.assertEqual(counts['reconciliation'],{'pass':2457})
        self.assertEqual({r['item_id'] for r in hub['rows'] if r['record_kind']!='item'},{'C2+C3','C1+C4'})
        self.assertEqual(next(r['value'] for r in hub['rows'] if r['item_id']=='C2+C3' and r['measure_year']=='2025-26'),32200)

    def test_annual_lane_is_opt_in_and_promotion_requires_orchestrator_review(self):
        from scripts.promote_hub_data import DEFAULT_HUBS, validated_asset, PromotionError
        self.assertNotIn('tax-expenditures',DEFAULT_HUBS)
        with patch('scripts.promote_hub_data.load',side_effect=lambda path: {'status':'pending'} if path.name=='review.json' else json.loads(path.read_bytes())):
            with self.assertRaisesRegex(PromotionError,'review: tax-expenditures'):validated_asset('tax-expenditures',ROOT)

    def test_withheld_rows_remain_internal_and_never_enter_projection(self):
        d,i,g,inventory=fixture();g[1][2]='nfp'
        rows=parse_sheet(g,d,{'A1':i});self.assertEqual(rows[0]['source_value'],'nfp')
        hub=projection(inventory,rows)
        self.assertEqual(len(hub['rows']),1);self.assertEqual(hub['items'][0]['cells'],{'2026-27':'D2'})
        self.assertNotIn('nfp',json.dumps(hub))
        source=[json.loads(line) for line in (ROOT/'data/staged/tax-expenditures/series.jsonl').read_text().splitlines()]
        checks=json.loads((ROOT/'data/staged/tax-expenditures/reconciliation.json').read_text())
        withheld=[r for r in source if r['source_value']=='nfp'];self.assertEqual(len(withheld),4)
        self.assertEqual(sum(c.get('workbook_value')=='nfp' and c['status']=='pass' for c in checks),4)
        public=json.loads((ROOT/'data/staged/tax-expenditures/hub.json').read_text())
        self.assertFalse(any(r['source_value']=='nfp' for r in public['rows']))

    def test_access_refusal_stops_subsequent_acquisition(self):
        from scripts.tax_expenditures.acquire import fetch
        with tempfile.TemporaryDirectory(prefix='opax-tax-access-') as td:
            root=Path(td);stage=root/'data/staged/tax-expenditures';stage.mkdir(parents=True)
            (stage/'receipts.json').write_text(json.dumps([{'held':True,'status':403,'sha256':'a'*64}]))
            with patch('urllib.request.build_opener') as opener:
                with self.assertRaisesRegex(ValueError,'Source held'):fetch('https://treasury.gov.au/robots.txt','robots.txt',root)
                opener.assert_not_called()

    def test_refusal_challenge_and_reset_receipts_are_compact_and_permanent(self):
        import hashlib
        import io
        import urllib.error
        from scripts.tax_expenditures.acquire import fetch
        for error in [urllib.error.HTTPError('https://treasury.gov.au/robots.txt',403,'Forbidden',{},io.BytesIO(b'challenge-platform')),
                      ConnectionResetError('reset')]:
            with tempfile.TemporaryDirectory(prefix='opax-tax-refusal-') as td:
                root=Path(td)
                with patch('urllib.request.build_opener') as factory:
                    factory.return_value.open.side_effect=error
                    with self.assertRaisesRegex(ValueError,'STOP'):fetch('https://treasury.gov.au/robots.txt','robots.txt',root)
                    receipt=json.loads((root/'data/staged/tax-expenditures/receipts.json').read_text())[0]
                    self.assertTrue(receipt['held']);self.assertEqual(len(receipt['sha256']),64)
                    self.assertNotIn('body',receipt);self.assertNotIn('local_path',receipt)
                    with self.assertRaisesRegex(ValueError,'Source held'):fetch('https://treasury.gov.au/robots.txt','robots.txt',root)
                    self.assertEqual(factory.return_value.open.call_count,1)

if __name__=='__main__':unittest.main()
