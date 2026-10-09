"""Stubbed HTTP exercises QAO paging, resume, policy, shrink and licence guards."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from parli.ingest.qao_reports import Client, Held, INDEX, SITE, COPYRIGHT, acquire, guard_count, parse_index, parse_report
from parli.ingest.qao_reports import reparse_cache
from scripts.export_audit import check_budget, plan_export
from unittest.mock import patch


def card(number=1, title="Example audit", subtitle=False, date="2 January 2026"):
    field = "subtitle" if subtitle else "report-version"
    return f'''<div class="views-row"><div class="field--name-field-{field}">Report {number}: 2025–26</div>
    <div class="field--name-node-title"><a href="/reports-resources/reports-parliament/example-{number}">{title}</a></div>
    <div class="field--name-field-tabled-date"><time datetime="2026-01-01T23:30:00Z">Tabled date: {date}</time></div>
    <div class="field--name-field-sectors"><div class="field__item">Health</div></div></div>'''


def listing(number=1, more=False):
    return '<div class="view-reports-to-parliament">' + card(number, subtitle=number == 2) + (f'<a rel="next" href="?page=1">Next</a><li class="pager__item--last"><a href="?page=1">Last</a></li>' if more else '') + '</div>'


def detail(exception=""):
    return f'''<h1>Example audit</h1><main><p>{exception}</p>
    <a href="/sites/default/files/report.pdf">Download full report PDF</a>
    <div class="field--name-field-entities-audited"><div class="field__item">Queensland Health</div><div class="field__item">Jane Citizen</div></div>
    <h2>2. Recommendations</h2><div class="field--name-field-text"><table><tr>
    <td><p>We recommend that Queensland Health:</p><ol start="3"><li>improves <em>its records</em>.<ul><li>Keep redactions.</li></ul></li><li value="7">reports progress.</li></ol></td><td>Agree. Jane Citizen responded.</td></tr></table></div></main>'''


class Response:
    def __init__(self, body, status=200, headers=None):
        self.text, self.status_code = body, status
        self.headers = headers or {"Content-Type": "text/html"}


class Session:
    def __init__(self, fail=None):
        self.calls, self.fail = [], fail
        self.responses = {SITE + '/robots.txt': Response('User-agent: *\nCrawl-delay: 3\n'),
            COPYRIGHT: Response('<main>Unless otherwise noted, Creative Commons Attribution 4.0. State of Queensland. Keep the copyright notice.</main>'),
            INDEX: Response(listing(more=True)), INDEX + '?page=1': Response(listing(2)),
            INDEX + '/example-1': Response(detail()), INDEX + '/example-2': Response(detail('© Private Company. All rights reserved.'))}
    def get(self, url, **kwargs):
        self.calls.append(url)
        if url == self.fail: return Response('unavailable', 500)
        return self.responses[url]


class Tests(unittest.TestCase):
    def temp(self):
        state = ROOT / 'scripts/state/qao'; state.mkdir(parents=True, exist_ok=True)
        tmp = tempfile.TemporaryDirectory(dir=state); self.addCleanup(tmp.cleanup)
        return Path(tmp.name)

    def test_paging_resume_idempotence_and_licence_exception(self):
        root = self.temp(); out = root / 'snapshot.json'; checkpoint = root / 'checkpoint'
        failed = Session(fail=INDEX + '/example-2'); client = Client(failed, sleep=lambda _: None, clock=lambda: 0)
        with self.assertRaises(Held): acquire(out, checkpoint, client)
        self.assertFalse(out.exists())
        resumed = Session(); waits = []; client = Client(resumed, sleep=waits.append, clock=lambda: 0)
        data = acquire(out, checkpoint, client)
        self.assertEqual(data['count'], 2); self.assertEqual(data['listed'], 2)
        self.assertNotIn(INDEX + '/example-1', resumed.calls)
        self.assertEqual(resumed.calls.count(INDEX + '?page=1'), 1)
        self.assertTrue(all(w == 3 for w in waits)); self.assertEqual(client.requests, 5)
        self.assertEqual(data['listing_verified_pages'], 2)
        first, second = data['reports']; self.assertEqual(first['tabled_date'], '2026-01-02')
        self.assertEqual(first['entities'], ['Queensland Health'])
        self.assertEqual([r['number'] for r in first['recommendations']], [3, 7])
        self.assertEqual(first['recommendations'][0]['text'], 'improves its records. Keep redactions.')
        self.assertEqual(first['recommendations'][0]['addressed_to'], 'Queensland Health')
        self.assertNotIn('Agree', json.dumps(first['recommendations']))
        self.assertNotIn('Jane Citizen', json.dumps(first['recommendations']))
        self.assertTrue(second['licence']['body_skipped']); self.assertEqual(second['recommendations'], [])
        before = out.read_bytes(); acquire(out, checkpoint, Client(Session(), sleep=lambda _: None, clock=lambda: 0))
        self.assertEqual(before, out.read_bytes())
        payloads, manifest = plan_export(data, [{'id':'exact','name':'Queensland Health','jurisdiction':'qld'}, {'id':'fuzzy','name':'QUEENSLAND HEALTH','jurisdiction':'qld'}])
        exported = json.loads(payloads['reports-1.json'])['records']
        self.assertEqual(exported[0]['entity_links'], {'Queensland Health':'/subject/agency/exact'})
        federal, _ = plan_export(data, [{'id':'wrong-jurisdiction','name':'Queensland Health','jurisdiction':'federal'}])
        self.assertEqual(json.loads(federal['reports-1.json'])['records'][0]['entity_links'], {})
        self.assertEqual(manifest['licence_exceptions'], ['qao-2025-26-2'])
        self.assertEqual(check_budget(payloads)[0], 4)

    def test_shrink_guard_and_budget(self):
        guard_count(98, 98, 100)
        for args in [(0,0,0), (97,97,100), (3,4,0)]:
            with self.assertRaises(Held): guard_count(*args)
        with self.assertRaises(Held): check_budget({str(i): b'x' for i in range(41)})
        with self.assertRaises(Held): check_budget({'large': b'x' * 10_000_001})
        with self.assertRaises(Held): parse_index('<html>empty</html>', INDEX)
        root = self.temp(); out = root / 'snapshot.json'
        out.write_text('{"count":100,"keep":"last good snapshot"}')
        before = out.read_bytes()
        with self.assertRaisesRegex(Held, 'shrink'):
            acquire(out, root/'checkpoint', Client(Session(), sleep=lambda _:None, clock=lambda:0))
        self.assertEqual(out.read_bytes(), before)
        with self.assertRaisesRegex(Held, 'inside this checkout'):
            acquire('/tmp/qao-outside-checkout.json', root/'checkpoint', Client(Session(),sleep=lambda _:None))

    def test_resume_rechecks_second_page_membership_before_acceptance(self):
        root=self.temp();out=root/'snapshot.json';checkpoint=root/'checkpoint'
        with self.assertRaises(Held):
            acquire(out,checkpoint,Client(Session(fail=INDEX+'/example-2'),sleep=lambda _:None,clock=lambda:0))
        session=Session();session.responses[INDEX+'?page=1']=Response(listing(3))
        with self.assertRaisesRegex(Held,'changed.*page 2'):
            acquire(out,checkpoint,Client(session,sleep=lambda _:None,clock=lambda:0))
        self.assertFalse(out.exists());self.assertFalse((checkpoint/'complete.json').exists())
        self.assertIn(INDEX+'?page=1',session.calls)

    def test_saved_source_sections_cover_all_six_intro_split_reports(self):
        root=ROOT/'portal/test/fixtures/qao'
        expected={'qao-2020-21-14':6,'qao-2020-21-5':6,'qao-2021-22-1':7,
                  'qao-2021-22-2':5,'qao-2021-22-8':4,'qao-2022-23-6':7}
        rows=json.loads((root/'index.json').read_text())
        for rid,count in expected.items():
            with self.subTest(report=rid):
                row=next(r for r in rows if r['id']==rid)
                recs=parse_report((root/(rid+'.html')).read_text(),row)['recommendations']
                self.assertEqual([r['number'] for r in recs],list(range(1,count+1)))
                self.assertTrue(all(r['text'] and r['addressed_to'] for r in recs))
        self.assertEqual(sum(expected.values()),35)

    def test_legacy_rec_cells_and_stated_counts_reconcile(self):
        root=ROOT/'portal/test/fixtures/qao';rows=json.loads((root/'index.json').read_text())
        for rid,count in {'qao-2016-17-1':6,'qao-2020-21-15':2,'qao-2021-22-18':5,
                          'qao-2022-23-17':8,'qao-2022-23-2':8,'qao-2024-25-13':5,'qao-2025-26-12':2}.items():
            with self.subTest(report=rid):
                row=next(r for r in rows if r['id']==rid)
                self.assertEqual(len(parse_report((root/(rid+'.html')).read_text(),row)['recommendations']),count)
        row=next(r for r in rows if r['id']=='qao-2021-22-18')
        html=(root/(row['id']+'.html')).read_text().replace('following 5 recommendations','following 6 recommendations')
        with self.assertRaisesRegex(Held,'page states 6, parsed 5'):parse_report(html,row)
        row=parse_index(listing(),INDEX)[0][0]
        with self.assertRaisesRegex(Held,'numbering mismatch'):
            parse_report('<h1>Example audit</h1><main><h2>Recommendations</h2><ol><li></li></ol></main>',row)

    def test_alphabetic_source_markers_survive_export(self):
        root=ROOT/'portal/test/fixtures/qao';rows=json.loads((root/'index.json').read_text())
        for rid in ('qao-2022-23-14','qao-2021-22-17'):
            with self.subTest(report=rid):
                row=next(r for r in rows if r['id']==rid);record=parse_report((root/(rid+'.html')).read_text(),row)
                html=''.join(r['html'] for r in record['recommendations'])
                self.assertIn('<ol type="a">',html)
                payloads,_=plan_export({'complete':True,'listed':1,'count':1,'reports':[record],
                    'generated_at':'2026-10-10T00:00:00Z','policy':{'copyright_notice':'© State of Queensland'}})
                self.assertIn('<ol type=\\"a\\">',payloads['reports-1.json'].decode())
        from bs4 import BeautifulSoup
        from parli.ingest.qao_reports import clean_markup
        markup=clean_markup(BeautifulSoup('<ol type="a" start="3" onclick="bad"><li value="5">Words</li></ol>','html.parser').ol)
        self.assertEqual(markup,'<ol type="a" start="3"><li value="5">Words</li></ol>')

    def test_unknown_notices_and_standalone_captions_fail_closed(self):
        row=parse_index(listing(),INDEX)[0][0]
        for notice in ('<figcaption>Image © Third Party.</figcaption>',
                       '<figcaption>Image © Third Party.<p>A caption with block markup.</p></figcaption>',
                       '<figcaption>Photo supplied by a third party.</figcaption>',
                       '<figcaption>Source: Private Image Library.</figcaption>',
                       '<div class="licence-notice">Restrictions apply; contact the publisher.</div>',
                       '<caption>Otherwise noted: reproduction requires approval.</caption>',
                       '<p>This report is licensed under Custom Reuse Terms 2.0.</p>',
                       '<figcaption>Use only under special rights granted by the provider.</figcaption>',
                       '<span>Copyright material licensed under CC BY-NC 4.0.</span>',
                       '<p>Copyright © State of Queensland. Additional reuse conditions apply.</p>'):
            with self.subTest(notice=notice):
                record=parse_report(detail()+notice,row)
                self.assertTrue(record['licence']['body_skipped']);self.assertEqual(record['recommendations'],[])
                self.assertEqual(record['entities'],[]);self.assertTrue(record['licence']['exceptions'])
        for notice in ('<p>Copyright © 2026 Queensland Audit Office.</p>',
                       '<p>This work is licensed under a Creative Commons Attribution 4.0 International licence.</p>',
                       '<a href="/copyright">Copyright ©</a>'):
            self.assertFalse(parse_report(detail()+notice,row)['licence']['body_skipped'])

    def test_quiet_hours(self):
        from parli.ingest.qao_reports import quiet_guard
        with patch('parli.ingest.qao_reports.datetime') as clock:
            for hour in (0,7,20,23):
                clock.now.return_value.hour = hour; quiet_guard()
            for hour in (8,12,19):
                clock.now.return_value.hour = hour
                with self.assertRaises(Held): quiet_guard()

    def test_legacy_numbered_paragraphs_keep_supporting_lists(self):
        row=parse_index(listing(),INDEX)[0][0]
        body='''<h1>Example audit</h1><main><p>The objective of our audit was to assess how well Queensland Health has planned its services.</p>
        <div class="field--name-field-recommendations"><div class="field__item">
        <h4>Queensland Health</h4><p>We recommend that Queensland Health:</p>
        <p>1. keeps <strong>source wording</strong>.</p><p>This includes:</p><ul><li>Preserving punctuation.</li></ul>
        <p>2. reports progress.</p></div></div></main>'''
        record=parse_report(body,row)
        self.assertEqual(record['entities'],['Queensland Health'])
        self.assertEqual([r['number'] for r in record['recommendations']],[1,2])
        self.assertEqual(record['recommendations'][0]['text'],'keeps source wording. This includes: Preserving punctuation.')
        self.assertIn('<strong>source wording</strong>',record['recommendations'][0]['html'])

    def test_number_column_and_copyright_context(self):
        row=parse_index(listing(),INDEX)[0][0]
        body='''<h1>Example audit</h1><main><p>We cannot understand third-party risks and have not undertaken testing.</p>
        <div class="field--name-field-recommendations"><p>We recommend Queensland Health:</p><table><tr>
        <td>4.</td><td><p>Preserve <em>the words</em>.</p><ul><li>Keep punctuation.</li></ul></td><td>Agree. Private person response.</td>
        </tr></table></div></main>'''
        record=parse_report(body,row)
        self.assertFalse(record['licence']['body_skipped'])
        self.assertEqual(len(record['recommendations']),1)
        rec=record['recommendations'][0]
        self.assertEqual((rec['number'],rec['addressed_to']),(4,'Queensland Health'))
        self.assertEqual(rec['text'],'Preserve the words. Keep punctuation.')
        self.assertNotIn('Private person',json.dumps(rec))
        excepted=parse_report(body.replace('</main>','<p>Image © Private Photographer, used under licence.</p></main>'),row)
        self.assertTrue(excepted['licence']['body_skipped']);self.assertEqual(excepted['recommendations'],[])
        excepted=parse_report(body.replace('</main>','<p>Copyright material licensed under CC BY-NC 4.0.</p></main>'),row)
        self.assertTrue(excepted['licence']['body_skipped']);self.assertEqual(excepted['recommendations'],[])

    def test_offline_reparse_verifies_raw_receipts(self):
        root=self.temp();out=root/'snapshot.json';checkpoint=root/'checkpoint'
        session=Session();session.responses[INDEX+'/example-1']=Response(detail().replace('\n','\r\n'))
        acquire(out,checkpoint,Client(session,sleep=lambda _:None,clock=lambda:0,cache=checkpoint/'http'))
        calls=list(session.calls);before=out.read_bytes();reparse_cache(out,checkpoint)
        self.assertEqual(out.read_bytes(),before);self.assertEqual(session.calls,calls)
        import hashlib
        raw=checkpoint/'http'/(hashlib.sha256((INDEX+'/example-1').encode()).hexdigest()+'.html')
        raw.write_text('tampered')
        with self.assertRaisesRegex(Held,'hash mismatch'):reparse_cache(out,checkpoint)
        self.assertEqual(out.read_bytes(),before)

    def test_challenge_robots_backoff_ceiling(self):
        session = Session(); session.responses[INDEX] = Response('<title>Just a moment...</title>', 403)
        client = Client(session, sleep=lambda _: None); client.policies()
        with self.assertRaisesRegex(Held, 'challenge'): client.get(INDEX)
        self.assertEqual(session.calls.count(INDEX), 1)
        session = Session(); session.responses[SITE+'/robots.txt'] = Response('User-agent: *\nDisallow: /reports-resources/\n')
        client = Client(session, sleep=lambda _: None); client.policies()
        with self.assertRaisesRegex(Held, 'disallows'): client.get(INDEX)
        self.assertNotIn(INDEX, session.calls)
        session = Session(fail=INDEX); waits=[]; client = Client(session,sleep=waits.append,clock=lambda:0)
        with self.assertRaises(Held): client.get(INDEX)
        self.assertEqual(session.calls.count(INDEX),4); self.assertTrue(10 in waits and 40 in waits)
        client.requests = 800
        with self.assertRaisesRegex(Held,'ceiling'): client.get(INDEX)


if __name__ == '__main__': unittest.main()
