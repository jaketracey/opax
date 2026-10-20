"""Synthetic records only; never copy published recipient or project text."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from scripts.sa_grants import acquire as access
from scripts.sa_grants.parse import csv_awards, xls_awards, amount
from scripts.sa_grants.stage import projection, CC
from scripts.sa_budget import acquire as engine
from scripts import promote_hub_data as promoter

CSV = b'Organisation Name,Project Title,Project Description,Region,Amount\r\nExample Community Club,Example project,Example description,Example region,"$1,250 "\r\n,,,,\r\n'


class Sheet:
    nrows=2
    def row_values(self,index):
        return ['Organisation Name','Project Title','Project Description','Region','Amount'] if index==0 else ['Example Club','Example project','Example description','Example region',1250]


class Book:
    def __init__(self): self.opened=[]
    def sheet_names(self): return ['Successful','Applicants','Unsuccessful','Applications','Not funded']
    def sheet_by_name(self,name):
        self.opened.append(name)
        if name!='Successful': raise AssertionError('Excluded cells accessed')
        return Sheet()


class GrantsTests(unittest.TestCase):
    def test_storage_requires_robots_and_checked_grant(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);cache=root/'cache';cache.mkdir()
            url=access.BASE+'/data/storage/f/example-successful.xls'
            with patch.object(access,'STAGE',root),patch.object(access,'CACHE',cache),patch.object(engine.request,'build_opener') as transport:
                with self.assertRaisesRegex(ValueError,'Outside authorised'):access.acquire(url,'download')
                resource=access.BASE+'/data/dataset/'+access.DATASETS[0]+'/resource/'+sorted(access.SELECTED)[0]
                with self.assertRaisesRegex(ValueError,'Robots first'):access.acquire(resource,'resource')
                ledger=[dict(url=resource,kind='resource',body_retained=True,sha256='example')]
                (cache/'example').write_text(url)
                (root/'receipts.json').write_text(json.dumps(ledger))
                with self.assertRaisesRegex(ValueError,'checked source grant'):access.acquire(url,'download')
                transport.assert_not_called()

    def test_first_refusal_challenge_reset_or_timeout_persists_stop(self):
        class Response:
            status=200
            headers={'Content-Type':'text/plain'}
            def __init__(self,body):self.body=body
            def __enter__(self):return self
            def __exit__(self,*_):pass
            def read(self):return self.body
        for failure in ('403','challenge','reset','timeout'):
            with self.subTest(failure=failure),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);cache=root/'cache'
                def response(req,**_):
                    if req.full_url.endswith('/robots.txt'):return Response(b'User-agent: *\nAllow: /')
                    if failure=='403':raise HTTPError(req.full_url,403,'Forbidden',{},io.BytesIO(b'refused'))
                    if failure=='challenge':return Response(b'verify you are human')
                    if failure=='reset':raise ConnectionResetError()
                    raise TimeoutError()
                with patch.object(access,'STAGE',root),patch.object(access,'CACHE',cache),patch.object(engine.time,'sleep'),patch.object(engine.request,'build_opener') as transport:
                    transport.return_value.open.side_effect=response
                    access.acquire(access.BASE+'/robots.txt','robots')
                    resource=access.BASE+'/data/dataset/'+access.DATASETS[0]
                    with self.assertRaises(SystemExit):access.acquire(resource,'dataset')
                    calls=transport.call_count
                    with self.assertRaisesRegex(ValueError,'Host stopped'):access.acquire(access.BASE+'/copyright','terms')
                    self.assertEqual(transport.call_count,calls)
                    ledger=json.loads((root/'receipts.json').read_text())
                    self.assertEqual(len(ledger),2);self.assertFalse(ledger[-1]['body_retained'])
                    self.assertFalse((cache/ledger[-1]['sha256']).exists())

    def test_csv_verbatim_amount_row_and_blank(self):
        rows=csv_awards(CSV,'2016-17')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['source_row'],2)
        self.assertEqual(rows[0]['amount_as_published'],'$1,250 ')
        self.assertEqual(rows[0]['amount'],1250)
        self.assertEqual(rows[0]['recipient'],'Example Community Club')

    def test_windows_punctuation_preserved(self):
        data=CSV.replace(b'Example description',b'Example\x92s description\x87')
        self.assertEqual(csv_awards(data,'2017-18')[0]['project_description'],'Example’s description‡')

    def test_unknown_amount_schema_and_year_fail_closed(self):
        for value in ['nil','1m','-1','1,23','100.123','NaN','1e3']:
            with self.assertRaises(ValueError): amount(value)
        for data,year in [(CSV.replace(b'Amount',b'Payment'),'2016-17'),(CSV,'2025-26'),(CSV.replace(b'$1,250 ',b'?'),'2016-17')]:
            with self.assertRaises(ValueError): csv_awards(data,year)

    def test_never_open_excluded_sheets_even_if_allowlisted(self):
        book=Book()
        rows=xls_awards(book,'2008-09','Successful Organisations PCIF 2008-09',book.sheet_names())
        self.assertEqual(len(rows),1);self.assertEqual(book.opened,['Successful'])
        for title in ['Unsuccessful Organisations PCIF 2008-09','Applicant Organisations PCIF 2008-09']:
            book=Book();self.assertEqual(xls_awards(book,'2008-09',title,book.sheet_names()),[])
            self.assertEqual(book.opened,[])

    def test_no_xls_sheet_approved_by_default(self):
        book=Book()
        self.assertEqual(xls_awards(book,'2008-09','Successful Organisations PCIF 2008-09',[]),[])
        self.assertEqual(book.opened,[])

    def test_scope_rejects_unsuccessful_without_network(self):
        with patch('scripts.sa_grants.acquire._acquire') as network:
            for url in [access.BASE+'/data/storage/unsuccessful.xls',access.BASE+'/data/storage/applicants.xls',access.BASE+'/data/dataset/premier-s-community-initiatives-fund/resource/00000000-0000-0000-0000-000000000000']:
                with self.assertRaisesRegex(ValueError,'successful-award'):access.acquire(url,'download')
            network.assert_not_called()

    def test_process_lock_surrounds_shared_engine(self):
        with tempfile.TemporaryDirectory() as tmp:
            events=[]
            with patch.object(access,'STAGE',Path(tmp)),patch.object(access.fcntl,'flock',side_effect=lambda *_:events.append('lock')),patch.object(access,'_acquire',side_effect=lambda *_,**__:events.append('request')):
                access.acquire(access.BASE+'/robots.txt','robots')
            self.assertEqual(events,['lock','request'])

    def test_private_record_text_has_no_identity_projection(self):
        from scripts.sa_grants.stage import ROW_FIELDS
        self.assertFalse(set(ROW_FIELDS)&{'person_id','recipient_id','supplier_id','charity_id','href','donor','entity','facets'})

    def test_pending_review_blocks_promoter_and_hash_tampering(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);stage=root/'data/staged/sa-grants';stage.mkdir(parents=True)
            for name in promoter.INPUTS['sa-grants']:(stage/name).write_text('{}\n')
            hashes={n:hashlib.sha256((stage/n).read_bytes()).hexdigest() for n in promoter.INPUTS['sa-grants']}
            review=dict(status='pending',reviewed_commit=None,inputs=hashes)
            def write(): (stage/'review.json').write_text(json.dumps(review))
            write()
            with patch.object(promoter,'sa_grants_projection',return_value=({'schema':1,'generated_at':'2026-10-21','rows':[]},{})):
                with self.assertRaisesRegex(promoter.PromotionError,'review:'):promoter.validated_asset('sa-grants',root)
                review.update(status='approved',reviewed_commit='synthetic-review-only');write()
                (stage/'hub.json').write_text('{"changed":true}')
                with self.assertRaisesRegex(promoter.PromotionError,'review-hash'):promoter.validated_asset('sa-grants',root)
            self.assertFalse((root/'portal/public').exists())
            self.assertNotIn('sa-grants',promoter.DEFAULT_HUBS)

    def test_source_projection_omits_held_and_diagnostic_values(self):
        from scripts.sa_grants.stage import ROW_FIELDS
        row={key:'Example' for key in ROW_FIELDS};row.update(resource_id='fixture',amount=1250,source_row=2,internal_total=987654321,person_id='synthetic-person')
        doc=dict(id='fixture',status='reviewed-staged',licence=dict(url=CC,dataset_explicit=True,resource_explicit=True,file_notices_reviewed=True,exceptions=[]))
        for key in ('title','programme','year','dataset','dataset_title','publisher','dataset_url','resource_url','snapshot','sha256','attribution','notes'):doc[key]='Example'
        h=dict(generated_at='2026-10-21',documents=[doc],rows=[row,{**row,'computed':True}])
        output=projection(h)
        self.assertEqual(len(output['rows']),1)
        self.assertNotIn('internal_total',json.dumps(output));self.assertNotIn('person_id',json.dumps(output))
        doc['licence']['file_notices_reviewed']=False
        self.assertEqual(projection(h)['rows'],[])


if __name__=='__main__': unittest.main()
