"""Synthetic suppliers only. Exercise record grain and fail-closed acquisition."""
from datetime import datetime, timezone, timedelta
from io import BytesIO, StringIO
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock
import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError, URLError
from scripts.act_invoices.acquire import acquire, BASE, META, CC
from scripts.act_invoices.parse import FIELDS, TYPES, records


def payload():
    return {'meta':{'view':{'columns':[{'fieldName':k,'name':k,'dataTypeName':t,'position':i} for i,(k,t) in enumerate(zip((':id',)+FIELDS,('meta_data',)+TYPES))]}},
            'data':[['synthetic-row-1','Morgan Synthetic Trading','00000000000','Example Territory Agency','Public building repairs',None,'2015-07-10T00:00:00','1250.50',None]]}


RECEIPT={'sha256':'a'*64,'snapshot':'2026-10-22T00:00:00+00:00'}


class Parser(unittest.TestCase):
    def test_lossless_grain_and_duplicate_report_without_dropping(self):
        p=payload();p['data'].append(['synthetic-row-2',*p['data'][0][1:]])
        rows,report=records(p,RECEIPT)
        self.assertEqual(len(rows),2)
        self.assertEqual(report['exact_duplicate_groups'],1)
        self.assertEqual(report['extra_duplicate_rows'],1)
        self.assertEqual(report['duplicates'][0]['source_row_positions'],[1,2])
        self.assertEqual(rows[0]['payment_amount'],'1250.50')
        self.assertEqual(rows[0]['supplier_abn'],'00000000000')
        self.assertEqual(rows[0]['snapshot_sha256'],RECEIPT['sha256'])
        self.assertFalse(report['unique_invoice_id'])
        self.assertEqual(report['payments_below_invoice_threshold'],2)
        self.assertEqual(report['public_computed_totals'],0)

    def test_month_coverage_and_missing_values_are_explicit(self):
        p=payload();p['data'].append(['synthetic-row-2',*p['data'][0][1:]])
        p['data'][1][-3]='2015-09-20T00:00:00'
        rows,report=records(p,RECEIPT)
        self.assertEqual(report['missing_months'],['2015-08'])
        self.assertEqual(rows[0]['financial_year'],'2015-16')
        p['data'][1][-3]=None;p['data'][1][-2]=None
        rows,report=records(p,RECEIPT)
        self.assertIsNone(rows[1]['month']);self.assertIsNone(rows[1]['amount'])
        self.assertEqual(report['missing_amounts'],1);self.assertEqual(report['missing_payment_dates'],1)

    def test_schema_and_corrupt_rows_fail(self):
        p=payload();p['meta']['view']['columns'].pop()
        with self.assertRaises(ValueError):records(p,RECEIPT)
        p=payload();p['data'][0][-2]='not a number'
        with self.assertRaises(ValueError):records(p,RECEIPT)
        p=payload();p['data'][0][-3]='2026-99-99T00:00:00'
        with self.assertRaises(ValueError):records(p,RECEIPT)


class Transport:
    def __init__(self,outcome):self.outcome=outcome;self.calls=0
    def open(self,req,timeout):
        self.calls+=1
        if isinstance(self.outcome,Exception):raise self.outcome
        return self.outcome


class Acquisition(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='opax-act-test-');self.addCleanup(self.temp.cleanup)
        self.stage=Path(self.temp.name)/'stage';self.cache=Path(self.temp.name)/'cache'
        self.stage.mkdir();self.cache.mkdir()

    def seed(self,robots='User-agent: *\nDisallow: /resource/*?$limit=*\n'):
        import hashlib
        ledger=[]
        for kind,url,body in [('robots',BASE+'/robots.txt',robots.encode()),('metadata',META,json.dumps({'id':'kzmf-7uhp','license':{'termsLink':CC}}).encode())]:
            sha=hashlib.sha256(body).hexdigest();(self.cache/sha).write_bytes(body)
            ledger.append(dict(kind=kind,url=url,body_retained=True,sha256=sha,status=200,snapshot=(datetime.now(timezone.utc)-timedelta(seconds=60)).isoformat()))
        (self.stage/'receipts.json').write_text(json.dumps(ledger))

    def test_exact_query_disallow_holds_before_any_request(self):
        self.seed();t=Transport(None)
        with self.assertRaisesRegex(ValueError,'including query'):
            acquire(BASE+'/resource/kzmf-7uhp.json?$limit=50000','data',stage=self.stage,cache=self.cache,opener=t,sleep=lambda _:None)
        self.assertEqual(t.calls,0);self.assertTrue((self.stage/'hold.json').exists())
        with self.assertRaisesRegex(ValueError,'held'):
            acquire(META,'metadata',stage=self.stage,cache=self.cache,opener=t)
        self.assertEqual(t.calls,0)

    def test_refusal_timeout_reset_and_challenge_stop_without_partial_output(self):
        challenge=BytesIO(b'verify you are human');challenge.status=200;challenge.headers={'Content-Type':'text/html'}
        for failure in [challenge,HTTPError(BASE+'/resource/kzmf-7uhp.json',403,'refused',{},BytesIO(b'refused')),URLError('reset'),TimeoutError()]:
            with self.subTest(failure=type(failure).__name__):
                # Reset only this test's own empty synthetic directories.
                if (self.stage/'hold.json').exists():(self.stage/'hold.json').unlink()
                self.seed('User-agent: *\nAllow: /\n');t=Transport(failure)
                with self.assertRaisesRegex(ValueError,'STOP'):
                    acquire(BASE+'/resource/kzmf-7uhp.json','data',stage=self.stage,cache=self.cache,opener=t,sleep=lambda _:None)
                self.assertEqual(t.calls,1)
                with self.assertRaisesRegex(ValueError,'held'):
                    acquire(META,'metadata',stage=self.stage,cache=self.cache,opener=t)
                self.assertFalse((self.stage/'series.jsonl').exists())
                receipt=json.loads((self.stage/'receipts.json').read_text())[-1]
                self.assertFalse(receipt['body_retained']);self.assertFalse(receipt['automatic_redirects'])
                self.assertFalse((self.cache/receipt['sha256']).exists())

    def test_robots_first_and_licence_before_data(self):
        t=Transport(None)
        with self.assertRaisesRegex(ValueError,'Robots first'):
            acquire(META,'metadata',stage=self.stage,cache=self.cache,opener=t)
        self.assertEqual(t.calls,0)
        (self.stage/'hold.json').unlink()
        (self.stage/'receipts.json').write_text('[]')
        with self.assertRaisesRegex(ValueError,'licence'):
            acquire(BASE+'/resource/kzmf-7uhp.json','data',stage=self.stage,cache=self.cache,opener=t)
        self.assertEqual(t.calls,0)


class Promotion(unittest.TestCase):
    def setUp(self):
        from scripts.promote_hub_data import INPUTS, digest
        self.temp=tempfile.TemporaryDirectory(prefix='opax-act-promote-');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.stage=self.root/'data/staged/act-invoices';self.stage.mkdir(parents=True)
        public=self.root/'portal/public';public.mkdir(parents=True)
        (public/'votes.json').write_text(json.dumps({'_meta':{'schema':1}}))
        self.hub={'generated_at':'2026-10-22T00:00:00+00:00','series_jsonl':'synthetic-source-record\n'}
        for name in INPUTS['act-invoices']:(self.stage/name).write_text(json.dumps(self.hub if name=='hub.json' else {}))
        self.review={'status':'pending','reviewed_commit':None,'inputs':{n:digest((self.stage/n).read_bytes()) for n in INPUTS['act-invoices']}}
        (self.stage/'review.json').write_text(json.dumps(self.review))

    def run_gate(self):
        from scripts.promote_hub_data import promote
        with mock.patch('scripts.promote_hub_data.act_invoices_projection',return_value=(self.hub,{'rows':1})),redirect_stdout(StringIO()),redirect_stderr(StringIO()):
            return promote(['act-invoices'],self.root)

    def test_pending_review_cannot_write_a_private_or_public_asset(self):
        self.assertEqual(self.run_gate(),1)
        self.assertFalse((self.root/'data/promoted/act-invoices/table.json').exists())
        self.assertEqual(list((self.root/'portal/public').iterdir()),[self.root/'portal/public/votes.json'])

    def test_approved_explicit_gate_writes_only_private_artifact_and_holds_changed_inputs(self):
        self.review.update(status='approved',reviewed_commit='b'*40)
        (self.stage/'review.json').write_text(json.dumps(self.review))
        self.assertEqual(self.run_gate(),0)
        target=self.root/'data/promoted/act-invoices/table.json';before=target.read_bytes()
        self.assertEqual(json.loads(before)['promotion']['reviewed_commit'],'b'*40)
        self.assertEqual(list((self.root/'portal/public').iterdir()),[self.root/'portal/public/votes.json'])
        (self.stage/'series.jsonl').write_text('changed')
        self.assertEqual(self.run_gate(),1);self.assertEqual(target.read_bytes(),before)


if __name__=='__main__':unittest.main()
