"""Recorded APH layouts and fake HTTP responses; never access the network."""
import argparse
import base64
import contextlib
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import requests
from parli.ingest import conduct_interests_federal as f
from parli.ingest import interests_fetch as fetch

FIX = Path(__file__).parent / 'fixtures/interests'

def html(name):
    return (FIX / name).read_text()

def response(content=None, status=200, page_status=200, pdf=False):
    data = {'metadata': {'statusCode': page_status, 'creditsUsed': 1}}
    data['rawBase64' if pdf else 'rawHtml'] = base64.b64encode(content).decode() if pdf else content
    r = mock.Mock(status_code=status, ok=status == 200)
    r.json.return_value = {'success': status == 200, 'data': data if status == 200 else None}
    return r

def client(cap=100, responses=()):
    s = mock.Mock()
    s.post.side_effect = list(responses)
    with mock.patch.dict(os.environ, {'FIRECRAWL_API_KEY': 'test-secret'}):
        return fetch.Firecrawl(cap=cap, session=s)

@contextlib.contextmanager
def quiet():
    with contextlib.redirect_stdout(io.StringIO()):
        yield

class Layouts(unittest.TestCase):
    def test_current_house_api_links_and_legacy_static_links(self):
        entries = f.parse_house_index(html('house-index.html'))
        self.assertEqual(len(entries), 151)
        self.assertEqual(entries[0]['surname'], 'Abdo')
        self.assertEqual(entries[0]['electorate'], 'Calwell')
        self.assertEqual(entries[0]['file'], '316915_48P.pdf')
        self.assertEqual(entries[0]['rev'], entries[0]['last_updated'])
        albanese = next(e for e in entries if e['surname'] == 'Albanese')
        self.assertIn('static.aph.gov.au', albanese['url'])
        legacy = html('house-index.html').replace('members-interests__table', 'documents')
        self.assertEqual(len(f.parse_house_index(legacy)), 151)

    def test_current_senate_index_and_exact_alteration(self):
        self.assertEqual(len(f.parse_senate_index(html('senate-index.html'))), 76)
        doc = f.parse_senate_page(html('senate-269375.html'), f.SENATE_INDEX_URL+'/269375', '269375')
        self.assertEqual(len(doc.rows), 27)
        self.assertTrue(doc.member_name)
        self.assertTrue(any(r.kind == 'addition' and r.date_declared for r in doc.rows))
        row = next(r for r in doc.rows if r.description == 'Membership of the Inter-Parliamentary Union (IPU) for the 48th Parliament')
        self.assertEqual((row.category, row.kind, row.date_declared), ('other', 'addition', '2025-10-21'))

    def test_recorded_house_pdf_keeps_scan_warning(self):
        entry = f.parse_house_index(html('house-index.html'))[0]
        with mock.patch.object(f, '_ocr_page', return_value=None):
            doc = f.parse_house_pdf(FIX/'house-abdo.pdf', entry)
        self.assertEqual(len(doc.rows), 25)
        self.assertIn('p11: scanned page, OCR unavailable', doc.warnings)

    def test_unread_scan_is_exposed_in_the_static_export(self):
        entry = f.parse_house_index(html('house-index.html'))[0]
        with mock.patch.object(f, '_ocr_page', return_value=None):
            doc = f.parse_house_pdf(FIX/'house-abdo.pdf', entry)
        with tempfile.TemporaryDirectory() as td, quiet():
            p = Path(td); db = p/'db.sqlite'
            f._load_docs([doc], db)
            for name in ('money', 'access', 'fits'):
                (p/(name+'.json')).write_text('{}')
            (p/'out').mkdir()
            (p/'out/n-old-name.json').write_text(json.dumps({'name': 'Old spelling', 'buckets': {}}))
            (p/'out/notes.json').write_text(json.dumps({'notes': 'unrelated'}))
            repo = Path(__file__).resolve().parents[1]
            subprocess.run([sys.executable, str(repo/'scripts/export_interests.py'),
                            '--out', str(p/'out'), '--money', str(p/'money.json'),
                            '--access', str(p/'access.json'), '--fits', str(p/'fits.json')],
                           env={**os.environ, 'OPAX_DB': str(db)}, check=True, capture_output=True)
            person = json.loads((p/'out/n-basem-abdo.json').read_text())
            self.assertEqual(person['unread_pages'], 1)
            self.assertFalse((p/'out/n-old-name.json').exists())
            self.assertTrue((p/'out/notes.json').exists())

    def test_first_name_beats_dirty_tenure_for_same_surname(self):
        conn = sqlite3.connect(':memory:')
        conn.execute('CREATE TABLE members(person_id,full_name,first_name,last_name,electorate,left_house,chamber)')
        conn.executemany('INSERT INTO members VALUES (?,?,?,?,?,?,?)', [
            ('marielle','Marielle Smith','Marielle','Smith',None,'2023-01-01','senate'),
            ('dean','Dean Smith','Dean','Smith',None,None,'senate'),
            ('matt',"Matt O'Sullivan",'Matt',"O'Sullivan",None,'2023-01-01','senate'),
            ('barry',"Barry O'Sullivan",'Barry',"O'Sullivan",None,None,'senate')])
        doc = f.parse_senate_page(html('senate-269375.html'), 'https://example.test', '1')
        for name, expected in [('Marielle Smith','marielle'), ("Matt O'Sullivan",'matt')]:
            with self.subTest(name=name):
                doc.member_name = name
                self.assertEqual(f.match_person_id(conn, doc), expected)
        conn.close()

class CreditAndTransport(unittest.TestCase):
    def test_payload_and_failed_source_charge_respect_cap(self):
        c = client(1, [response('Forbidden', page_status=403)])
        with self.assertRaisesRegex(fetch.FetchError, 'source 403'):
            c.scrape(f.HOUSE_INDEX_URL)
        with self.assertRaisesRegex(fetch.FetchError, 'cap reached'):
            c.scrape(f.HOUSE_INDEX_URL)
        self.assertEqual((c.requests, c.credits), (1, 1))
        payload = c.session.post.call_args.kwargs['json']
        self.assertEqual((payload['proxy'], payload['waitFor'], payload['parsers']), ('basic', 3000, []))
        self.assertEqual(payload['formats'], ['rawHtml'])
        self.assertNotIn('headers', payload)

    def test_missing_key_never_reads_mac_config_or_calls_api(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            c = fetch.Firecrawl(session=mock.Mock())
        with self.assertRaisesRegex(fetch.FetchError, 'missing'):
            c.scrape(f.HOUSE_INDEX_URL)
        c.session.post.assert_not_called()

    def test_credit_exhaustion_stops_further_calls_and_does_not_log_body(self):
        c = client(responses=[response(status=402)])
        with self.assertRaisesRegex(fetch.FetchError, 'out of credits'):
            c.scrape(f.HOUSE_INDEX_URL)
        with self.assertRaisesRegex(fetch.FetchError, 'out of credits'):
            c.scrape(f.SENATE_INDEX_URL)
        self.assertEqual(c.session.post.call_count, 1)
        self.assertEqual(c.credits, 0)

    def test_timeout_reserved_and_safe_error(self):
        c = client(responses=[requests.Timeout('test-secret private response')])
        with self.assertRaises(fetch.FetchError) as cm:
            c.scrape(f.HOUSE_INDEX_URL)
        self.assertNotIn('test-secret', str(cm.exception))
        self.assertEqual((c.requests, c.unknown), (1, 1))

    def test_one_rendering_failure_does_not_block_other_statements(self):
        c = client(responses=[response(status=500), response('valid HTML')])
        with self.assertRaisesRegex(fetch.FetchError, 'HTTP 500'):
            c.scrape(f.SENATE_INDEX_URL+'/missing')
        with quiet():
            self.assertEqual(c.scrape(f.SENATE_INDEX_URL+'/valid'), 'valid HTML')
        self.assertEqual(c.requests, 2)

    def test_pdf_fallback_keeps_original_bytes_without_paid_pdf_parser(self):
        pdf = b'%PDF-1.7\nrecorded transport bytes'
        c = client(responses=[response(pdf, pdf=True)])
        s = mock.Mock(); s.get.return_value = mock.Mock(ok=False, status_code=403, content=b'Forbidden')
        with tempfile.TemporaryDirectory() as td, quiet():
            path, _ = fetch.house_pdf({'file':'Test.pdf','url':'https://static.aph.gov.au/test.pdf','rev':'a'}, Path(td), c, s)
            self.assertEqual(path.read_bytes(), pdf)
            fetch.house_pdf({'file':'Test.pdf','url':'https://static.aph.gov.au/test.pdf','rev':'a'}, Path(td), c, s)
        self.assertEqual(s.get.call_count, 1)
        self.assertEqual(c.requests, 1)
        self.assertEqual(c.session.post.call_args.kwargs['json']['formats'], ['rawBase64'])

class CacheAndPreservation(unittest.TestCase):
    def test_date_only_revisions_are_rechecked_after_the_source_day(self):
        self.assertFalse(fetch.date_settled('2026-10-03', '2026-10-03T23:00:00+00:00'))
        self.assertTrue(fetch.date_settled('2026-10-03', '2026-10-04T01:00:00+00:00'))
        self.assertTrue(fetch.date_settled('7185f24202cb4acfad0c0208e7d6b7e6', None))

    def test_partial_render_retries_once_then_caches_only_the_statement(self):
        e = f.parse_senate_index(html('senate-index.html'))[0]
        c = client(responses=[response('<h1>Register listing</h1>'), response(html('senate-269375.html'))])
        with tempfile.TemporaryDirectory() as td, quiet():
            result, _ = fetch.senate_page(e, Path(td), c)
            self.assertIn('interests-table-collapse', result)
        self.assertEqual(c.requests, 2)
        self.assertEqual(c.session.post.call_args.kwargs['json']['waitFor'], 6000)

    def test_reloading_identical_statements_preserves_recent_row_ids(self):
        doc = f.parse_senate_page(html('senate-269375.html'), f.SENATE_INDEX_URL+'/269375', '269375')
        with tempfile.TemporaryDirectory() as td, quiet():
            db = Path(td)/'db.sqlite'
            f._load_docs([doc], db)
            conn = sqlite3.connect(db)
            before = conn.execute('SELECT id FROM ext_interests ORDER BY id').fetchall()
            f._load_docs([doc], db)
            self.assertEqual(conn.execute('SELECT id FROM ext_interests ORDER BY id').fetchall(), before)
            conn.close()

    def test_senate_updated_date_invalidates_valid_cache(self):
        e = f.parse_senate_index(html('senate-index.html'))[0]
        e['id']='269375'; e['last_updated']='2026-09-01'
        c = client(responses=[response(html('senate-269375.html')), response(html('senate-269375.html'))])
        with tempfile.TemporaryDirectory() as td, quiet():
            p = Path(td)
            fetch.senate_page(e, p, c)
            fetch.senate_page(e, p, c)
            self.assertEqual(c.requests, 1)
            e['last_updated']='2026-10-01'
            fetch.senate_page(e, p, c)
            self.assertEqual(c.requests, 2)
            (p/'269375.html').write_text('<h1>Register listing</h1>')
            c.session.post.side_effect=[response('<h1>Register listing</h1>'), response('<h1>Register listing</h1>')]
            with self.assertRaisesRegex(fetch.FetchError, 'no interests blocks'):
                fetch.senate_page(e, p, c)

    def test_new_house_links_keep_old_doc_id(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td)/'db.sqlite'; conn = sqlite3.connect(db); f.ensure_tables(conn)
            conn.execute("INSERT INTO ext_interests_documents(doc_id,jurisdiction,chamber,parliament,member_name_raw,member_name,electorate,source_url) VALUES ('house-48-abdo-48p','federal','house',48,'Abdo','Basem Abdo','Calwell','https://static.aph.gov.au/Abdo_48P.pdf')")
            conn.commit();conn.close()
            entries = f.parse_house_index(html('house-index.html'));fetch.retain_house_ids(entries, db)
            self.assertEqual(entries[0]['doc_id'], 'house-48-abdo-48p')
            self.assertEqual(entries[0]['file'], 'house-48-abdo-48p.pdf')
            conn = sqlite3.connect(db)
            conn.execute("UPDATE ext_interests_documents SET source_url=?", (entries[0]['url'],))
            conn.commit();conn.close()
            second = f.parse_house_index(html('house-index.html'))
            fetch.retain_house_ids(second, db)
            self.assertEqual(second[0]['file'], entries[0]['file'])

    def test_preferred_given_name_preserves_house_id_without_matching_initial(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td)/'db.sqlite'; conn = sqlite3.connect(db); f.ensure_tables(conn)
            conn.execute("INSERT INTO ext_interests_documents(doc_id,jurisdiction,chamber,parliament,member_name_raw,member_name,electorate,source_url) VALUES ('house-48-pasin-48p','federal','house',48,'Pasin','Tony Pasin','Barker','https://static.aph.gov.au/Pasin_48P.pdf')")
            conn.commit();conn.close()
            entries = [{'surname': 'Pasin', 'given': 'Antony', 'electorate': 'Barker', 'file': '316999_48P.pdf'}]
            fetch.retain_house_ids(entries, db)
            self.assertEqual(entries[0]['doc_id'], 'house-48-pasin-48p')
            self.assertEqual(entries[0]['file'], 'house-48-pasin-48p.pdf')

    def test_unavailable_indices_preserve_db_and_write_limitation(self):
        with tempfile.TemporaryDirectory() as td, quiet(), mock.patch.dict(os.environ, {}, clear=True):
            p = Path(td);db=p/'db.sqlite';db.write_bytes(b'untouched database sentinel')
            args=argparse.Namespace(cache_dir=p/'cache',credit_cap=100,status=p/'status.json',chamber=None,
                                    db=db,dry_run=False,export_jsonl=p/'out.jsonl')
            self.assertEqual(fetch.refresh(args),3)
            self.assertEqual(db.read_bytes(),b'untouched database sentinel')
            status=json.loads(args.status.read_text())
            self.assertFalse(status['complete'])
            self.assertIn('FIRECRAWL_API_KEY is missing',status['limitations'][0])
            self.assertEqual(status['credits_reserved'],0)

if __name__ == '__main__':
    unittest.main()
