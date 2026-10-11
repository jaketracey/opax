"""Offline PDF body rights, source provenance, response privacy and resume gates."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from parli.ingest.qao_reports import Client, Held, LICENCE
from parli.ingest.qao_bodies import (strict_guard, rights_review, extract_recommendations, extract_responses,
    stage, kb_document, download, SCHEMA)
from scripts.export_audit import plan_export, check_budget


def page(n, texts):
    return {'page': n, 'text': '\n\n'.join(t for t, _, _ in texts), 'width': 600, 'height': 840,
            'blocks': [{'text': t, 'bbox': [x, y, x + 300, y + 15]} for t, x, y in texts]}


def fixture():
    row = {'id': 'qao-2000-01-1', 'number': 1, 'year': '2000-01', 'title': 'Source audit fixture',
           'report_label': 'Report 1: 2000–01', 'tabled_date': '2000-10-01', 'sectors': ['Health'],
           'entities': ['Queensland Health'], 'canonical_url': 'https://www.qao.qld.gov.au/reports-resources/source-audit-fixture',
           'pdf_url': 'https://www.qao.qld.gov.au/sites/default/files/source-audit-fixture.pdf',
           'recommendations': [], 'licence': {'checked': True, 'status': 'cc-by-4.0', 'body_skipped': False,
               'exceptions': [], 'licence_url': LICENCE}}
    pages = [page(1, [('Source audit fixture, published source report cover', 60, 60)]),
             page(2, [('© The State of Queensland (Queensland Audit Office) 2000.\nCreative Commons Attribution 4.0 International licence.', 60, 140)]),
             page(3, [('Contents, source audit conclusions and recommendations', 60, 140)]),
             page(4, [('2. Recommendations', 30, 60), ('Recommendations to public bodies', 60, 140),
                 ('We recommend that Queensland Health:\n1. keeps [redacted] records.', 60, 170), ('•\nPublishes source dates.', 90, 210),
                 ('Agree', 480, 170), ('2. reports progress.', 60, 250)]),
             page(5, [('3. Audit conclusions', 30, 60), ('The source report paragraph preserves the published wording and [redacted] information.', 60, 140)]),
             page(6, [('A. Entity responses', 30, 60), ('This appendix contains the responses from public bodies.', 60, 140)]),
             page(7, [('Response from Queensland Health', 60, 60),
                 ('Queensland Health agrees with recommendation 1.\n[signature as published]\nDirector-General', 60, 140)]),
             page(8, [('B. Audit methods', 30, 60), ('Source audit methods appear here, outside the response.', 60, 140)])]
    doc = {'schema': SCHEMA, 'id': row['id'], 'pdf_url': row['pdf_url'], 'sha256': 'a'*64,
           'page_count': len(pages), 'pages': pages}
    snap = {'schema':1,'complete':True,'count':1,'listed':1,'generated_at':'2000-10-01T00:00:00Z',
            'policy':{'copyright_notice':'© The State of Queensland (Queensland Audit Office) 2000'},'reports':[row]}
    return row, doc, snap


class Tests(unittest.TestCase):
    def temp(self):
        root=ROOT/'scripts/state/qao';root.mkdir(parents=True,exist_ok=True)
        t=tempfile.TemporaryDirectory(dir=root);self.addCleanup(t.cleanup);return Path(t.name)

    def staged(self, doc=None, snap=None):
        row, initial, snapshot=fixture();doc=doc or initial;snap=snap or snapshot;root=self.temp()
        (root/(row['id']+'.json')).write_text(json.dumps(doc))
        return stage(snap,root,root/'bodies.json',root/'kb/qao-bodies.jsonl')

    def test_pdf_rights_hold_keeps_separately_licensed_html_recommendations(self):
        row,doc,snap=fixture();snap['reports'][0]['recommendations']=[{'number':1,'text':'Source HTML advice','html':'','addressed_to':None,'source_text':"QAO's text"}]
        doc['pages'][1]=page(2,[('© The State of Queensland (Queensland Audit Office) 2000.\nCreative Commons Attribution-Non-Commercial-No Derivatives (CC BY-NC-ND) 4.0 International licence.',60,140)])
        data,counts=self.staged(doc,snap);r=data['reports'][0]
        self.assertIn('pdf_restrictive_licence',r['pdf']['reasons']);self.assertFalse(r['licence']['body_skipped'])
        self.assertEqual(r['recommendations'][0]['text'],'Source HTML advice');self.assertEqual(r['recommendations'][0]['provenance'],'html')
        self.assertEqual(r['responses'],[]);self.assertEqual(counts['kb_units'],0);self.assertEqual(counts['html_recommendations'],1)
        payloads,manifest=plan_export(data);self.assertEqual(manifest['recommendations'],1);self.assertEqual(manifest['bodies'],0)
        r['recommendations'][0]['provenance']='pdf p.4';r['recommendations'][0]['page']=4
        with self.assertRaises(Held):plan_export(data)
        self.assertEqual(r['pdf']['sha256'],'a'*64)

    def test_existing_rights_hold_is_never_cleared(self):
        row,doc,snap=fixture();snap['reports'][0]['licence']['body_skipped']=True
        snap['reports'][0]['recommendations']=[{'number':1,'text':'Fixture held advice','html':'','addressed_to':None,'source_text':"QAO's text"}]
        data,_=self.staged(doc,snap);self.assertIn('phase1_rights_hold',data['reports'][0]['pdf']['reasons'])
        self.assertEqual(data['reports'][0]['recommendations'],[])

    def test_third_party_notice_holds_entire_body(self):
        row,doc,_=fixture();doc['pages'][4]['blocks'].append({'text':'Image credit: an external rights owner; reproduced with permission.','bbox':[60,300,500,330]})
        self.assertIn('uncleared_rights_exception',rights_review(row,doc)['reasons'])

    def test_no_text_layer_page_holds_without_ocr(self):
        row,doc,_=fixture();doc['pages'][6]=page(7,[])
        r=rights_review(row,doc);self.assertIn('no_text_layer',r['reasons']);self.assertEqual(r['no_text_pages'],[7])
        data,counts=self.staged(doc);self.assertEqual(counts['kb_units'],0)

    def test_empty_and_any_shrunk_snapshot_is_refused(self):
        row,_,_=fixture()
        for rows,listed,old in [([],0,[]),([row],2,[]),([row],1,[{**row,'id':'qao-2000-01-2'}])]:
            with self.assertRaises(Held): strict_guard(rows,listed,old)

    def test_pdf_recommendations_are_verbatim_with_number_addressee_page(self):
        row,doc,_=fixture();recs,holds=extract_recommendations(row,doc['pages'])
        self.assertEqual(holds,[]);self.assertEqual([r['number'] for r in recs],[1,2])
        self.assertEqual(recs[0]['text'],'keeps [redacted] records.\n•\nPublishes source dates.')
        self.assertEqual(recs[0]['addressed_to'],'Queensland Health');self.assertEqual(recs[0]['provenance'],'pdf p.4')
        self.assertNotIn('Agree',json.dumps(recs))

    def test_html_is_kept_and_pdf_mismatch_recorded(self):
        row,doc,snap=fixture();snap['reports'][0]['recommendations']=[{'number':1,'text':'Source HTML advice','html':'','addressed_to':None,'source_text':"QAO's text"}]
        data,counts=self.staged(doc,snap);self.assertEqual(data['reports'][0]['recommendations'][0]['provenance'],'html')
        self.assertEqual(counts['mismatches'],1);self.assertEqual(counts['pdf_recommendations'],0)

    def test_response_signatures_remain_only_in_verbatim_text(self):
        row,doc,_=fixture();responses,start,holds=extract_responses(row,doc['pages'])
        self.assertEqual(start,6);self.assertEqual(holds,[]);self.assertEqual(len(responses),1)
        r=responses[0];self.assertEqual(r['body'],'Queensland Health');self.assertEqual(r['page_start'],7);self.assertEqual(r['page_end'],7)
        self.assertEqual(r['recommendation_numbers'],[1]);self.assertIn('[signature as published]',r['text'])
        self.assertEqual(set(r),{'id','body','text','page_start','page_end','recommendation_numbers'})
        data,_=self.staged();self.assertNotIn('[signature as published]',json.dumps(data['reports'][0]['body_units']))

    def test_first_response_on_the_appendix_heading_page_is_retained(self):
        row,doc,_=fixture();doc['pages'][5]=page(6,[('A. Entity responses',30,60),('Response from Queensland Health',60,140),('Verbatim source response to recommendation 2.\nDirector-General',60,180)])
        records,start,holds=extract_responses(row,doc['pages'][:6])
        self.assertEqual(start,6);self.assertEqual(holds,[]);self.assertEqual(records[0]['page_start'],6)
        self.assertEqual(records[0]['recommendation_numbers'],[2]);self.assertIn('Director-General',records[0]['text'])

    def test_appendix_heading_variants_keep_letter_signatures_out_of_kb_units(self):
        from parli.ingest.qao_bodies import body_units
        row,doc,_=fixture()
        for heading in ('Appendix 1: Responses','Appendix A. Comments','appendices'):
            pages=copy.deepcopy(doc['pages']);pages[5]=page(6,[(heading,30,60),('A source response signed in its published text.\nDirector-General',60,140)])
            units=body_units(row,pages)
            self.assertTrue(units);self.assertTrue(all(unit['page']<6 for unit in units))
            self.assertNotIn('Director-General',json.dumps(units))

    def test_unattributed_response_is_held_instead_of_person_fields(self):
        row,doc,_=fixture();doc['pages'][6]=page(7,[('Response from a withheld signatory',60,60),('Source letter, no public body attribution is published.',60,140)])
        records,_,holds=extract_responses(row,doc['pages']);self.assertEqual(records,[]);self.assertEqual(holds[0]['page'],7)

    def test_joins_require_explicit_recommendation_number(self):
        row,doc,_=fixture();doc['pages'][6]['text']='Response from Queensland Health\nWe agree with the advice.\nDirector-General'
        records,_,_=extract_responses(row,doc['pages']);self.assertEqual(records[0]['recommendation_numbers'],[])

    def test_kb_envelope_and_export_budget(self):
        data,counts=self.staged();row=data['reports'][0];r=kb_document(row,row['body_units'][0],1)
        self.assertEqual(r['texts']['body']['format'],'PLAIN');self.assertIn({'labelset':'kind','label':'audit_report'},r['usermetadata']['classifications'])
        self.assertEqual(r['extra']['metadata']['document_sha256'],row['pdf']['sha256'])
        self.assertEqual(r['extra']['metadata']['source_text_sha256'],hashlib.sha256(r['texts']['body']['body'].encode()).hexdigest())
        self.assertIn('page',r['extra']['metadata']);files,m=plan_export(data)
        self.assertEqual(m['phase'],2);self.assertEqual(m['responses'],1);self.assertNotIn('body_units',files['reports-1.json'].decode())
        self.assertNotIn('[signature as published]',files['index.json'].decode())
        for files in [{str(i):b'x' for i in range(151)},{'x':b'x'*30_000_001}]:
            with self.assertRaises(Held):check_budget(files)

    def test_staging_is_idempotent(self):
        row,doc,snap=fixture();root=self.temp();(root/(row['id']+'.json')).write_text(json.dumps(doc))
        out=root/'bodies.json';kb=root/'kb.jsonl';stage(snap,root,out,kb);before=(out.read_bytes(),kb.read_bytes());stage(snap,root,out,kb)
        self.assertEqual(before,(out.read_bytes(),kb.read_bytes()))

    def test_http_binary_spacing_backoff_and_challenge(self):
        class Response:
            def __init__(self,status,content,headers=None):self.status_code=status;self.content=content;self.text=content.decode();self.headers=headers or {}
        class Session:
            def __init__(self,rs):self.rs=iter(rs)
            def get(self,*a,**k):return next(self.rs)
        waits=[];client=Client(Session([Response(503,b'unavailable'),Response(200,b'%PDF-source')]),sleep=waits.append,clock=lambda:0)
        self.assertEqual(client.get(fixture()[0]['pdf_url'],binary=True),b'%PDF-source');self.assertEqual(client.requests,2);self.assertIn(10,waits);self.assertIn(2,waits)
        client=Client(Session([Response(200,b'<html><title>Just a moment</title>')]))
        with self.assertRaises(Held):client.get(fixture()[0]['pdf_url'],binary=True)

    def test_legacy_document_permission_notice_overrides_website_grant(self):
        row,doc,_=fixture();doc['pages'][1]=page(2,[('© The State of Queensland. Reproduction by whatever means is prohibited without prior written permission.',60,140)])
        self.assertIn('pdf_restrictive_licence',rights_review(row,doc)['reasons'])

    def test_unknown_otherwise_noted_exception_is_held(self):
        row,doc,_=fixture();doc['pages'][1]['blocks'].append({'text':'Otherwise noted: a reproduced third-party figure has separate reuse terms.','bbox':[60,250,500,300]})
        self.assertIn('uncleared_rights_exception',rights_review(row,doc)['reasons'])

    def test_saved_extracted_text_hash_is_checked(self):
        row,doc,snap=fixture();doc['text_sha256']='b'*64
        with self.assertRaises(Held):self.staged(doc,snap)

    def test_plural_explicit_recommendation_references(self):
        from parli.ingest.qao_bodies import explicit_recommendations
        self.assertEqual(explicit_recommendations('Recommendations 1 and 2; recommendation 4.'),[1,2,4])
        self.assertEqual(explicit_recommendations('All recommendations are accepted.'),[])

    def test_stubbed_http_pdf_acquisition_and_resume(self):
        from parli.ingest.qao_reports import SITE, INDEX, COPYRIGHT
        row,doc,snap=fixture();root=self.temp()
        listing = '<div class="view-reports-to-parliament"><div class="views-row"><div class="field--name-field-report-version">Report 1: 2000–01</div><div class="field--name-node-title"><a href="/reports-resources/source-audit-fixture">Source audit fixture</a></div><div class="field--name-field-tabled-date"><time datetime="2000-10-01T00:00:00Z">Tabled date: 1 October 2000</time></div></div></div>'
        class Response:
            status_code=200
            headers={'Content-Type':'text/html'}
            def __init__(self,body):self.text=body;self.content=body.encode()
        class Session:
            def __init__(self):self.calls=[]
            def get(self,url,**kwargs):
                self.calls.append(url)
                return Response({SITE+'/robots.txt':'User-agent: *\nCrawl-delay: 3\n',
                                 COPYRIGHT:'<main>Unless otherwise noted, Creative Commons Attribution 4.0. State of Queensland. Keep the copyright notice.</main>',
                                 INDEX:listing,row['pdf_url']:'%PDF-source'}[url])
        first=Session();waits=[]
        pdf=ROOT/'staging/pdfs'/(row['id']+'.pdf');self.addCleanup(lambda:pdf.unlink(missing_ok=True))
        with patch('parli.ingest.qao_bodies.pdf_pages',return_value=doc['pages']):
            download(snap,root,Client(first,sleep=waits.append,clock=lambda:0))
        self.assertEqual(first.calls[-1],row['pdf_url']);self.assertEqual(waits[0],2);self.assertTrue(all(w==3 for w in waits[1:]))
        receipt=json.loads((root/(row['id']+'.json')).read_text())
        self.assertEqual(receipt['sha256'],hashlib.sha256(b'%PDF-source').hexdigest());self.assertEqual(receipt['page_count'],8)
        second=Session();download(snap,root,Client(second,sleep=lambda _:None,clock=lambda:0))
        self.assertNotIn(row['pdf_url'],second.calls)

    def test_full_report_link_outranks_summary_and_request_ceiling_holds(self):
        from parli.ingest.qao_bodies import full_report_pdf
        html='<main><a href="/sites/default/files/summary.pdf">Report on a page</a><a href="/sites/default/files/full.pdf">Download full report PDF</a></main>'
        self.assertEqual(full_report_pdf(html),'https://www.qao.qld.gov.au/sites/default/files/full.pdf')
        client=Client();client.requests=800
        with self.assertRaises(Held):client.get(fixture()[0]['pdf_url'],binary=True)

    def test_signatory_followed_by_department_cannot_be_a_body_field(self):
        from parli.ingest.qao_bodies import response_body_name
        self.assertFalse(response_body_name('A withheld signatory – Department of Education'))
        row,doc,_=fixture();doc['pages'][6]=page(7,[('Response from A withheld signatory – Department of Education',60,60),('The original response is attributed to its signatory only.',60,140)])
        responses,_,holds=extract_responses(row,doc['pages']);self.assertEqual(responses,[]);self.assertEqual(holds[0]['page'],7)

    def test_held_report_cannot_make_a_kb_document(self):
        data,_=self.staged();row=data['reports'][0];unit=row['body_units'][0];row['pdf']['status']='held'
        with self.assertRaises(Held):kb_document(row,unit,1)

    def test_permission_exception_is_not_cleared_by_open_grant(self):
        row,doc,_=fixture();doc['pages'][4]['blocks'].append({'text':'Illustration used with permission; separate reuse terms apply.','bbox':[60,300,500,330]})
        self.assertIn('uncleared_rights_exception',rights_review(row,doc)['reasons'])

    def test_body_discussion_of_open_licence_cannot_clear_the_imprint(self):
        row,doc,_=fixture();doc['pages'][1]=page(2,[('© The State of Queensland (Queensland Audit Office) 2000. Copyright notice.',60,140)])
        doc['pages'][4]['blocks'].append({'text':'This audit discusses Creative Commons Attribution 4.0 International licence as a policy example.','bbox':[60,300,500,330]})
        self.assertIn('document_grant_not_verified',rights_review(row,doc)['reasons'])

    def test_published_redaction_discards_covered_text_without_ocr(self):
        from parli.ingest.qao_bodies import pdf_pages
        import pymupdf
        with pymupdf.open() as doc:
            p=doc.new_page();p.insert_text((60,90),'Withheld source text')
            p.draw_rect(pymupdf.Rect(50,50,500,150),fill=(0,0,0),color=(0,0,0),overlay=True)
            result=pdf_pages(doc.tobytes())
        self.assertTrue(result[0]['redaction_hold'])
        self.assertEqual(result[0]['text'],'');self.assertEqual(result[0]['blocks'],[])

    def test_resume_does_not_refetch_hash_receipt(self):
        row,doc,snap=fixture();root=self.temp();(root/(row['id']+'.json')).write_text(json.dumps(doc))
        client=Client();client.policies=lambda:{}
        with patch('parli.ingest.qao_bodies.verify_catalogue',return_value=1),patch.object(client,'get',side_effect=AssertionError('unnecessary HTTP')):
            self.assertEqual(download(snap,root,client)['requests'],0)

    def test_weekly_html_and_pdf_steps_share_one_request_budget(self):
        from parli.ingest.qao_bodies import remaining_request_limit
        _,_,snapshot=fixture()
        summary={'requests':799,'staged':1,'listed':1}
        self.assertEqual(remaining_request_limit(snapshot,summary),1)
        client=Client(request_limit=1);client.requests=1
        with self.assertRaises(Held):client.get(fixture()[0]['pdf_url'],binary=True)
        for invalid in [{**summary,'requests':801},{**summary,'requests':True},{**summary,'listed':0}]:
            with self.assertRaises(Held):remaining_request_limit(snapshot,invalid)

if __name__=='__main__':unittest.main()
