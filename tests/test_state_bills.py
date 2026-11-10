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
from scripts.state_bills.stage import tas_bill, act_bills, act_bill_id, act_version_events, exact_sponsor, rights, title_key
from scripts.corrections import apply as corrections
from bs4 import BeautifulSoup

FIX = Path(__file__).parent / 'fixtures/state-bills'
RECEIPT = {'url':'https://www.parliament.tas.gov.au/bills/example','snapshot':'2026-10-14T01:00:00Z','sha256':'a'*64}


def docx(tables=None):
    out = io.BytesIO()
    def cell(value): return '<w:tc><w:p><w:r><w:t>'+value+'</w:t></w:r></w:p></w:tc>'
    tables = tables or [[['Bills Passed','PMB','Introduced','Passed','Act No','LR'],['Example Amendment Bill 2026','','01-01-26','04-01-26','A2026-1','05-01-26']]]
    xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+''.join('<w:tbl>'+''.join('<w:tr>'+''.join(map(cell,row))+'</w:tr>' for row in rows)+'</w:tbl>' for rows in tables)+'</w:body></w:document>'
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
        # 941 before the committee table's repeated Introduced events were merged.
        self.assertEqual(hub['counts']['events'],866)

    def act(self, volume, summary, tables):
        r={**RECEIPT,'url':'https://www.parliament.act.gov.au/bills/example'}
        bills,gaps=act_bills(volume.encode(),summary.encode(),docx(tables),{'volume':r,'summary':r,'list':r},10,rights('act',r))
        return {b['title']:b for b in bills},gaps

    def test_act_repeated_summary_title_joins_by_register_identifier(self):
        # state-datasets-004: the 10th Assembly summary repeats one title for the
        # government bill (db_65228) and the private member's [No 2] (db_65229).
        summary=('<h4><a href="https://www.legislation.act.gov.au/b/db_65228">Civil Law Amendment Bill 2021</a></h4><p>Presented by Mr Rattenbury (Attorney-General)—9 November 2021</p>'
                 '<h4><a href="https://www.legislation.act.gov.au/b/db_65229">Civil Law Amendment Bill 2021</a></h4><p>Presented by Mr Cain—9 November 2021</p>')
        volume=('<h4><a href="https://legislation.act.gov.au/b/db_65228">Civil Law Amendment Bill 2021</a></h4><ul><li><a href="https://legislation.act.gov.au/View/b/db_65228/1/html/db_65228.html">As presented</a></li></ul>'
                '<h4><a href="https://legislation.act.gov.au/b/db_65229">Civil Law Amendment Bill 2021 [No 2]</a></h4><ul><li><a href="https://legislation.act.gov.au/View/b/db_65229/current/html/db_65229.html">As presented</a></li></ul>')
        rows=[['Bills Passed','PMB','Introduced','Passed','Act No','LR'],['Civil Law Amendment Bill 2021','','09-11-21','01-12-21','A2021-32','10-12-21']]
        withdrawn=[['Discharged/Withdrawn','PMB','Introduced','Date Discharged / Withdrawn'],['Civil Law Amendment Bill 2021 [No 2]','Y','09-11-21','31-08-23']]
        by,_=self.act(volume,summary,[rows,withdrawn])
        gov,pmb=by['Civil Law Amendment Bill 2021'],by['Civil Law Amendment Bill 2021 [No 2]']
        self.assertEqual((gov['sponsor_name'],gov['source_id'],gov['status']),('Mr Rattenbury (Attorney-General)','db_65228','passed'))
        self.assertEqual((pmb['sponsor_name'],pmb['source_id'],pmb['status']),('Mr Cain','db_65229','withdrawn'))
        self.assertEqual(pmb['bill_url'],'https://www.legislation.act.gov.au/b/db_65229')

    def test_act_repeated_summary_title_without_identifier_shows_no_sponsor(self):
        summary=('<h4><a href="https://www.legislation.act.gov.au/b/db_1">Example Bill 2021</a></h4><p>Presented by Ms A—9 November 2021</p>'
                 '<h4><a href="https://www.legislation.act.gov.au/b/db_2">Example Bill 2021</a></h4><p>Presented by Mr B—9 November 2021</p>')
        volume='<h4><a href="https://legislation.act.gov.au/b/db_3">Example Bill 2021</a></h4><ul><li><a href="https://legislation.act.gov.au/View/b/db_3/1/x.html">As presented</a></li></ul>'
        by,_=self.act(volume,summary,[[['Before the Assembly','PMB','Introduced'],['Example Bill 2021','','09-11-21']]])
        b=by['Example Bill 2021']
        self.assertIsNone(b['sponsor_name'])
        self.assertEqual(b['source_id'],'db_3')
        self.assertIn('repeats this title',b['source_notes'][0])

    def test_act_record_keeps_its_own_identifier_when_the_summary_mislinks(self):
        # state-datasets-005: the summary links Remuneration Tribunal to Revenue's db_64044.
        summary=('<h4><a href="https://www.legislation.act.gov.au/b/db_64044">Revenue Bill 2021</a></h4><p>Presented by Mr Barr (Treasurer)—31 March 2021</p>'
                 '<h4><a href="https://www.legislation.act.gov.au/b/db_64044">Remuneration Bill 2021</a></h4><p>Presented by Ms Burch (Speaker)—11 November 2021</p>')
        volume=('<h4><a href="https://legislation.act.gov.au/b/db_64044">Revenue Bill 2021</a></h4><ul><li><a href="https://legislation.act.gov.au/View/b/db_64044/1/x.pdf">As presented</a></li></ul>'
                '<h4><a href="https://legislation.act.gov.au/b/db_65249">Remuneration Bill 2021</a></h4><ul><li><a href="https://legislation.act.gov.au/View/b/db_65249/1/x.html">As presented</a></li></ul>')
        rows=[['Bills Passed','PMB','Introduced','Passed','Act No','LR'],['Revenue Bill 2021','','31-03-21','12-05-21','A2021-10','19-05-21'],['Remuneration Bill 2021','','11-11-21','25-11-21','A2021-27','10-12-21']]
        by,_=self.act(volume,summary,[rows])
        rem=by['Remuneration Bill 2021']
        self.assertEqual((rem['source_id'],rem['bill_url'],rem['sponsor_name']),('db_65249','https://www.legislation.act.gov.au/b/db_65249','Ms Burch (Speaker)'))
        self.assertIn('links this title to db_64044',rem['source_notes'][0])
        self.assertEqual(by['Revenue Bill 2021']['source_id'],'db_64044')

    def test_act_divided_bill_gets_its_own_link_and_no_invented_presenter(self):
        # state-datasets-005: (No 2) and (No 3) were divided from [No. 2]; the summary
        # gives neither a presenter, so neither is shown one.
        summary=('<h4><a href="https://www.legislation.act.gov.au/b/db_73299">Workplace Bill 2025 [No. 2]</a></h4><p>Presented by Mr Pettersson (Minister)—2 September 2025</p>'
                 '<h4><a href="https://www.legislation.act.gov.au/b/db_73333">Workplace Bill 2025 (No 2)</a></h4><p>This bill was originally the Workplace Bill 2025 [No. 2] and was divided by a resolution of the Assembly.</p>'
                 '<h4><a href="https://www.legislation.act.gov.au/b/db_73335">Workplace Bill 2025 (No 3)</a></h4><p>This bill was originally the Workplace Bill 2025 [No. 2] and was divided by a resolution of the Assembly.</p>')
        volume=''.join(f'<h4><a href="https://www.legislation.act.gov.au/b/{i}">Workplace Bill 2025 ({n})</a></h4><ul><li><a href="https://www.legislation.act.gov.au/View/b/{i}/1/x.html">As presented</a></li></ul>' for i,n in (('db_73333','No 2'),('db_73335','No 3')))
        rows=[['Bills Passed','PMB','Introduced','Passed','Act No','LR'],['Workplace Bill 2025 [No 2]','','02-09-25','25-09-25','A2025-27','03-10-25'],['Workplace Bill 2025 (No 3)','','02-09-25','28-10-25','A2025-30','12-11-25']]
        by,_=self.act(volume,summary,[rows])
        two,three=by['Workplace Bill 2025 (No 2)'],by['Workplace Bill 2025 (No 3)']
        self.assertEqual((two['source_id'],three['source_id']),('db_73333','db_73335'))
        self.assertIsNone(two['sponsor_name']); self.assertIsNone(three['sponsor_name'])
        self.assertTrue(any('originally Workplace Bill 2025 [No. 2], presented by Mr Pettersson' in n for n in three['source_notes']))

    def test_act_committee_table_does_not_duplicate_introduced(self):
        # state-datasets-007
        passed=[['Bills Passed','PMB','Introduced','Passed','Act No','LR'],['Example Amendment Bill 2026','','01-01-26','04-01-26','A2026-1','05-01-26']]
        committee=[['Inquired into by Committee','PMB','Introduced','Date of Referral','Report Presented'],['Example Amendment Bill 2026','','01-01-26','01-01-26','03-01-26']]
        r={**RECEIPT,'url':'https://www.parliament.act.gov.au/bills/example'}
        bills,_=act_bills((FIX/'act-volume.html').read_bytes(),(FIX/'act-summary.html').read_bytes(),docx([passed,committee]),{'volume':r,'summary':r,'list':r},11,rights('act',r))
        stages=[(e['stage'],e['date']) for e in bills[0]['events']]
        self.assertEqual(stages.count(('Introduced','2026-01-01')),1)
        self.assertIn(('Referred to committee','2026-01-01'),stages)
        self.assertEqual(len(stages),len(set(stages)))

    def test_act_revenue_2023_status_title_joins_its_version_record(self):
        # state-datasets-006: the status list adds "[No 2]"; the register does not.
        self.assertEqual(title_key('Revenue Legislation Amendment Bill 2023 [No 2]'),title_key('Revenue Legislation Amendment Bill 2023'))
        self.assertNotEqual(title_key('Revenue Legislation Amendment Bill 2022 [No 2]'),title_key('Revenue Legislation Amendment Bill 2022'))

    def test_act_bill_id_reads_register_bill_links_only(self):
        self.assertEqual(act_bill_id('https://legislation.act.gov.au/View/b/db_65228/20211109-77760/html/db_65228.html'),'db_65228')
        self.assertEqual(act_bill_id('https://www.legislation.act.gov.au/DownloadFile/b/db_73335/x/PDF/db_73335.PDF'),'db_73335')
        self.assertEqual(act_bill_id('http://www.legislation.act.gov.au/b/db_68423'),'db_68423')
        for url in ('https://legislation.act.gov.au/View/es/db_65230/1/html/db_65230.html','https://legislation.act.gov.au/a/2021-27',None):
            self.assertIsNone(act_bill_id(url))

    def test_tas_same_day_stages_keep_source_row_order(self):
        # state-datasets-010: a case-sensitive sort on the stage name put "Negatived"
        # before "Resumed" and "Agreed" before "moved".
        body=('<main><h1>Example Bill 2024 (53 of 2024)</h1><p>Introduced by: Minister</p>'
              '<table><tr><th>House of Assembly - stage</th><th>Date passed</th><th>Legislative Council - stage</th><th>Date passed</th></tr>'
              '<tr><td>First reading</td><td>19/11/2024</td><td>First reading</td><td>21/11/2024</td></tr>'
              '<tr><td>2nd Reading moved</td><td>21/11/2024</td><td>Resumed</td><td>28/11/2024</td></tr>'
              '<tr><td>2nd Reading Agreed</td><td>21/11/2024</td><td>2nd Reading moved</td><td>28/11/2024</td></tr>'
              '<tr><td>Third reading</td><td>21/11/2024</td><td>Negatived</td><td>28/11/2024</td></tr></table></main>').encode()
        bill=tas_bill(body,RECEIPT,rights('tas',RECEIPT),set())
        seq=[(e['date'],e['house'][0],e['stage']) for e in bill['events']]
        self.assertEqual(seq,[('2024-11-19','H','First reading'),('2024-11-21','H','2nd Reading moved'),('2024-11-21','H','2nd Reading Agreed'),
                              ('2024-11-21','H','Third reading'),('2024-11-21','L','First reading'),('2024-11-28','L','Resumed'),
                              ('2024-11-28','L','2nd Reading moved'),('2024-11-28','L','Negatived')])
        self.assertEqual((bill['status'],bill['stage']),('negatived','Negatived'))

    def test_tas_council_bill_reads_council_stages_first_on_a_shared_day(self):
        body=('<main><h1>Example Bill 2024 (54 of 2024)</h1>'
              '<table><tr><th>House of Assembly - stage</th><th>Date passed</th><th>Legislative Council - stage</th><th>Date passed</th></tr>'
              '<tr><td>First reading</td><td>05/12/2024</td><td>First reading</td><td>01/12/2024</td></tr>'
              '<tr><td>Third reading</td><td>10/12/2024</td><td>Third reading</td><td>05/12/2024</td></tr></table></main>').encode()
        bill=tas_bill(body,RECEIPT,rights('tas',RECEIPT),set())
        same=[(e['house'][0],e['stage']) for e in bill['events'] if e['date']=='2024-12-05']
        self.assertEqual(same,[('L','Third reading'),('H','First reading')])
        self.assertEqual(bill['originating_house'],'Legislative Council')

    def test_retained_act_projection_named_records(self):
        from scripts.state_bills.stage import build
        hub,_=build('act')
        by={b['key']:b for b in hub['bills']}
        self.assertEqual((by['au-act-10-7e1c73d79e44b2c1']['sponsor_name'],by['au-act-10-7e1c73d79e44b2c1']['source_id']),('Mr Rattenbury (Attorney-General)','db_65228'))
        self.assertEqual((by['au-act-10-96972e0c91ac9f2a']['sponsor_name'],by['au-act-10-96972e0c91ac9f2a']['source_id']),('Mr Cain','db_65229'))
        self.assertEqual(by['au-act-10-cbe1c2240b79e712']['source_id'],'db_65249')
        self.assertEqual((by['au-act-11-3eba528a9f72fee3']['source_id'],by['au-act-11-df8655e3901d233b']['source_id']),('db_73333','db_73335'))
        self.assertIsNone(by['au-act-11-df8655e3901d233b']['sponsor_name'])
        revenue=by['au-act-10-f862a842f6bbf49a']
        self.assertEqual((revenue['status'],revenue['act_number']),('passed','A2023-47'))
        self.assertNotIn('au-act-10-5d1254d1363a8a73',by)
        presented=[d for d in by['au-act-10-39000bfe24fb34ae']['sources'] if d['label']=='As presented']
        self.assertEqual(act_bill_id(presented[0]['url']),'db_65320')
        self.assertEqual(presented[0]['correction']['finding'],'state-datasets-005')
        self.assertEqual((hub['counts']['bills'],hub['counts']['gaps'],hub['counts']['statuses'].get('unknown',0)),(261,11,0))
        ids=[b['source_id'] for b in hub['bills'] if b['source_id']]
        self.assertEqual(len(ids),len(set(ids)))
        for b in hub['bills']:
            ev=[(e['stage'],e['date'],e['house']) for e in b['events']]
            self.assertEqual(len(ev),len(set(ev)),b['key'])

    def test_retained_tas_projection_keeps_source_order(self):
        from scripts.state_bills.stage import build
        hub,_=build('tas')
        by={b['key']:b for b in hub['bills']}
        self.assertEqual(by['au-tas-2024-53']['stage'],'Negatived')
        for b in hub['bills']:
            rank={}
            for i,v in enumerate(b['stage_values']):
                rank.setdefault((v['house'],v['stage'],v['value']),i)
            ev=[e for e in b['events'] if (e['house'],e['stage'],e['date_raw']) in rank]
            for x,y in zip(ev,ev[1:]):
                if x['date']==y['date'] and x['house']==y['house']:
                    self.assertLess(rank[(x['house'],x['stage'],x['date_raw'])],rank[(y['house'],y['stage'],y['date_raw'])],b['key'])

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


class CorrectionsTests(unittest.TestCase):
    ENTRY={'id':'b1','field':'sources[label=As presented].url','from':'https://x/old','to':'https://x/new',
           'evidence_url':'https://register.example/b1','evidence':'register page','finding':'f-1','reviewed':'2026-11-10'}

    def records(self):
        return [{'key':'b1','sources':[{'label':'As presented','url':'https://x/old'},{'label':'Explanatory','url':'https://x/es'}]}]

    def test_applies_a_reviewed_nested_value(self):
        rows=self.records()
        applied=corrections.apply('t',rows,key='key',entries=[self.ENTRY])
        self.assertEqual(rows[0]['sources'][0]['url'],'https://x/new')
        self.assertEqual(rows[0]['sources'][1]['url'],'https://x/es')
        self.assertEqual(len(applied),1)

    def test_fails_loudly_when_the_source_value_changed(self):
        rows=self.records(); rows[0]['sources'][0]['url']='https://x/fixed-at-source'
        with self.assertRaisesRegex(corrections.CorrectionError,'now holds'):
            corrections.apply('t',rows,key='key',entries=[self.ENTRY])

    def test_fails_on_missing_record_or_ambiguous_path(self):
        with self.assertRaisesRegex(corrections.CorrectionError,'record not found'):
            corrections.apply('t',[],key='key',entries=[self.ENTRY])
        rows=self.records(); rows[0]['sources'].append({'label':'As presented','url':'https://x/old'})
        with self.assertRaisesRegex(corrections.CorrectionError,'expected one'):
            corrections.apply('t',rows,key='key',entries=[self.ENTRY])

    def test_entries_need_a_source_url(self):
        with tempfile.TemporaryDirectory(prefix='opax-corrections-') as tmp:
            Path(tmp,'t.json').write_text(json.dumps([{**self.ENTRY,'evidence_url':'model knowledge'}]))
            with self.assertRaisesRegex(corrections.CorrectionError,'evidence_url'):
                corrections.load('t',tmp)

    def test_committed_bills_act_corrections_are_complete(self):
        entries=corrections.load('bills-act')
        self.assertTrue(entries)
        for e in entries:
            self.assertTrue(e['evidence_url'].startswith('https://www.legislation.act.gov.au/'))
