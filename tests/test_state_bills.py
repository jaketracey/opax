import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
import urllib.error
import zipfile

from scripts.state_bills.acquire import Collector, robots_allowed
from scripts.state_bills.stage import tas_bill, act_bills, act_version_events, exact_sponsor, rights
from bs4 import BeautifulSoup

FIX = Path(__file__).parent / 'fixtures/state-bills'
RECEIPT = {'url':'https://www.parliament.tas.gov.au/bills/example','snapshot':'2026-10-14T01:00:00Z','sha256':'a'*64}


def docx():
    out = io.BytesIO()
    def cell(value): return '<w:tc><w:p><w:r><w:t>'+value+'</w:t></w:r></w:p></w:tc>'
    rows = [['Bills Passed','PMB','Introduced','Passed','Act No','LR'],['Example Amendment Bill 2026','','01-01-26','04-01-26','A2026-1','05-01-26']]
    xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>'+''.join('<w:tr>'+''.join(map(cell,row))+'</w:tr>' for row in rows)+'</w:tbl></w:body></w:document>'
    with zipfile.ZipFile(out,'w') as z:
        z.writestr('word/document.xml',xml)
        z.writestr('word/header1.xml','<header>BILLS LIST NO 1—4 January 2026</header>')
    return out.getvalue()


class StateBillsTests(unittest.TestCase):
    def test_robots_query_rules_and_longest_allow_are_respected(self):
        rules=[('disallow','/*?sq_content_src='),('disallow','/search'),('allow','/search/help')]
        self.assertFalse(robots_allowed('https://www.parliament.tas.gov.au/bills?sq_content_src=1',rules))
        self.assertFalse(robots_allowed('https://www.parliament.tas.gov.au/search',rules))
        self.assertTrue(robots_allowed('https://www.parliament.tas.gov.au/search/help',rules))
        self.assertTrue(robots_allowed('https://www.parliament.tas.gov.au/bills',rules))

    def test_tas_stages_identifiers_version_links_and_assent(self):
        bill=tas_bill((FIX/'tas.html').read_bytes(),RECEIPT,rights('tas',RECEIPT),set())
        self.assertEqual(bill['key'],'au-tas-2026-7')
        self.assertEqual(bill['parliament'],52)
        self.assertEqual(bill['sponsor_name'],'Example Member')
        self.assertEqual(bill['introduced_date'],'2026-02-01')
        self.assertEqual(bill['status'],'assented')
        self.assertEqual(bill['last_action']['date'],'2026-02-18')
        self.assertEqual(len(bill['events']),6)
        self.assertTrue(all(s['body_status']=='held' and s['document_date'] is None for s in bill['sources']))
        self.assertFalse(bill['licence']['text_allowed'])

    def test_tas_lapse_and_missing_dates_are_not_invented(self):
        body=(FIX/'tas.html').read_bytes().replace(b'18/02/2026',b'').replace(b'15/02/2026',b'')
        body=body.replace(b'<main>',b'<main><p>Bill lapsed at prorogation on Wednesday 11 June 2026.</p>')
        bill=tas_bill(body,RECEIPT,rights('tas',RECEIPT),set())
        self.assertEqual(bill['status'],'lapsed')
        self.assertEqual(bill['last_action']['date'],'2026-06-11')

    def test_act_preserves_source_disagreement_and_holds_prose(self):
        r={**RECEIPT,'url':'https://www.parliament.act.gov.au/bills/example'}
        bills,gaps=act_bills((FIX/'act-volume.html').read_bytes(),(FIX/'act-summary.html').read_bytes(),docx(),{'volume':r,'summary':r,'list':r},11,rights('act',r))
        b=bills[0]
        self.assertFalse(gaps)
        self.assertEqual(b['introduced_date'],'2026-01-01')
        self.assertEqual(b['status_as_of'],'2026-01-04')
        self.assertEqual(b['status'],'passed')
        self.assertEqual(b['last_action']['stage'],'Notified on Legislation Register')
        self.assertIn('sources disagree',b['source_notes'][0])
        self.assertIn('later than',b['source_notes'][1])
        self.assertNotIn('HELD EXPLANATORY',json.dumps(b))

    def test_exact_name_and_jurisdiction_only(self):
        roster=[{'name':'Example Member','representation':[{'jurisdiction':'tas'}]}]
        paths={'Example Member':'/subject/person/example-member'}
        self.assertIsNotNone(exact_sponsor(' Example  Member ','tas',roster,paths))
        for name in ('E Member','Dr Example Member','Example Member (Minister)'):
            self.assertIsNone(exact_sponsor(name,'tas',roster,paths))
        self.assertIsNone(exact_sponsor('Example Member','act',roster,paths))
        self.assertIsNone(exact_sponsor('Example Member','tas',roster+roster,paths))

    def test_act_dated_expiry_comes_from_version_index_with_its_own_receipt(self):
        r={**RECEIPT,'url':'https://www.parliament.act.gov.au/bills/status-list'}
        version={**r,'url':'https://www.parliament.act.gov.au/bills/version-index','sha256':'b'*64}
        volume=(FIX/'act-volume.html').read_bytes()+b'<p>[Lapsed on expiry of the Assembly 19 October 2024]</p>'
        bills,_=act_bills(volume,(FIX/'act-summary.html').read_bytes(),docx(),{'volume':version,'summary':r,'list':r},10,rights('act',r))
        lapse=next(e for e in bills[0]['events'] if e['stage']=='Lapsed on expiry of Assembly')
        self.assertEqual(lapse['date'],'2024-10-19')
        self.assertEqual(lapse['date_raw'],'19 October 2024')
        self.assertEqual(lapse['source_url'],version['url'])
        self.assertEqual(lapse['sha256'],version['sha256'])
        self.assertEqual(bills[0]['status_as_of'],'2026-01-04')

    def test_act_expiry_is_not_inferred_and_duplicate_notices_are_one_event(self):
        for note in ('[Lapsed on expiry of Assembly]','[Lapsed on expiry of Assembly 31 February 2024]','Assembly 2020-2024'):
            nodes=BeautifulSoup('<p>'+note+'</p>','html.parser').find_all('p')
            self.assertEqual(act_version_events(nodes,RECEIPT),[])
        nodes=BeautifulSoup('<p>[Lapsed on Expiry of Assembly 19 October 2024]</p>'*2,'html.parser').find_all('p')
        self.assertEqual(len(act_version_events(nodes,RECEIPT)),1)

    def test_retained_act_expiry_dates_recover_all_eight_source_notices(self):
        from scripts.state_bills.stage import build
        hub,_=build('act')
        lapsed=[b for b in hub['bills'] if b['status']=='lapsed']
        self.assertEqual(len(lapsed),8)
        self.assertTrue(all(b['last_action']['date']=='2024-10-19' and b['stage']=='Lapsed on expiry of Assembly' for b in lapsed))
        self.assertEqual(hub['counts']['events'],941)

    def test_refusal_or_reset_permanently_stops_collection(self):
        for error in (urllib.error.HTTPError('https://www.parliament.tas.gov.au/bills',403,'Forbidden',{},io.BytesIO(b'Forbidden')),ConnectionResetError()):
            with self.subTest(error=type(error).__name__),tempfile.TemporaryDirectory(prefix='opax-state-bills-') as tmp:
                root=Path(tmp);(root/'parli/ingest').mkdir(parents=True)
                (root/'parli/ingest/user-agent.json').write_text('{"user_agent":"OPAXBot/1.0"}')
                opener=Mock();opener.open.side_effect=error
                c=Collector('tas',root,opener);c.rules=[]
                with self.assertRaisesRegex(ValueError,'stopped'):c.get(c.origin+'/bills','registry')
                with self.assertRaisesRegex(ValueError,'stopped'):c.get(c.origin+'/bills/other','bill')
                self.assertEqual(opener.open.call_count,1)
                self.assertTrue(c.ledger['stopped'])
                r=c.ledger['receipts'][0]
                self.assertEqual(hashlib.sha256(c.body(r)).hexdigest(),r['sha256'])

    def test_bill_bodies_never_requested(self):
        with tempfile.TemporaryDirectory(prefix='opax-state-bills-') as tmp:
            root=Path(tmp);(root/'parli/ingest').mkdir(parents=True)
            (root/'parli/ingest/user-agent.json').write_text('{"user_agent":"OPAXBot/1.0"}')
            opener=Mock();c=Collector('tas',root,opener);c.rules=[]
            with self.assertRaisesRegex(ValueError,'held'):c.get(c.origin+'/bill.pdf','bill')
            opener.open.assert_not_called()
