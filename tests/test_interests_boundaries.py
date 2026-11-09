"""Offline recorded-source regressions; no production database or network."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from parli.ingest import conduct_interests_federal as f
from scripts.export_interests import description

FIX = Path(__file__).parent / 'fixtures/interests'
SOURCE = 'https://interests-register-api-public.aph.gov.au/api/members/102376/statement/48'
EXPECTED = [
    'Gift: Enamelled box containing a silk scarf Provided by: His excellency Mr Le M.nh Hung, Vietnamese Minister for Industry and Trade. Value: Unknown Date provided: 11/08/26',
    '2 x tickets and hospitality at the Fremantle v Adelaide AFL Game courtesy of 7 West media. Value: Unknown Date provided: 14/08/26',
    'Correction to a 7th of August Date alteration: 14/07/2026 - 4 tickets to Fremantle v GWS AFL game Hosted by Woodside Value: Unknown This was on the 04/07/26',
]

def block():
    return json.loads((FIX/'house-king-page33-blocks.json').read_text())[0]


class Boundaries(unittest.TestCase):
    def test_recorded_three_rows_are_isolated_in_full_not_substrings(self):
        b = block()
        before = copy.deepcopy(b)
        rows = f._rows_from_alteration_block(b)
        self.assertEqual([r.description for r in rows], EXPECTED)
        self.assertEqual([r.category for r in rows], ['gifts', 'travel', 'travel'])
        self.assertTrue(all(r.holder == 'self' and r.kind == 'addition' and r.page == 33 for r in rows))
        self.assertEqual(b, before)

    def test_wrapped_descriptions_blank_paragraphs_and_adjacent_same_category_rows(self):
        b = block()
        # Deliberately remove the blank gaps between entries and add a larger
        # paragraph gap inside the gift: whitespace alone cannot choose cuts.
        for i, line in enumerate(b['details']):
            line['top'] = 50 + i * 12 + (50 if i >= 2 else 0)
        self.assertEqual([r.description for r in f._rows_from_alteration_block(b)], EXPECTED)

    def test_page_break_inside_wrapped_row_retains_text_and_original_start_pages(self):
        b = block()
        for i, line in enumerate(b['details']):
            if i >= 4:
                line['page'] = 34
                line['top'] = 50 + (i - 4) * 12
        rows = f._rows_from_alteration_block(b)
        self.assertEqual([r.description for r in rows], EXPECTED)
        self.assertEqual([r.page for r in rows], [33, 34, 34])

    def test_extra_date_metadata_is_ambiguous_and_retains_existing_partition(self):
        b = block()
        b['details'].insert(3, {**b['details'][2], 'text': 'Date provided: 01/08/26', 'top': 100})
        det = b['details']
        old = [text for _, text in f._partition(det, det[0]['cell_x0'], det[0]['cell_x1'], len(b['items']))]
        self.assertEqual([r.description for r in f._rows_from_alteration_block(b)], old)

    def test_no_metadata_and_unclassified_continuations_keep_existing_behavior(self):
        for items in [block()['items'], []]:
            b = block(); b['items'] = items
            b['details'] = [l for l in b['details'] if not any(x in l['text'] for x in ['Date provided:', 'This was on'])]
            det = b['details']
            old = [text for _, text in f._partition(det, det[0]['cell_x0'], det[0]['cell_x1'], len(items) or None)]
            self.assertEqual([r.description for r in f._rows_from_alteration_block(b)], old)

    def test_canonical_export_does_not_truncate_correction_or_seven_west_date(self):
        # Independent of parsing: even correctly isolated input was truncated.
        for text in EXPECTED:
            self.assertEqual(description(json.dumps({'item': 'Travel Or Hospitality', 'details': text}), text), text)
        self.assertTrue(description(json.dumps({'details': EXPECTED[2]}), '', 60).endswith('…'))


class RecordedPDF(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = f.parse_house_pdf(FIX/'house-king-48.pdf', {
            'file': 'King_48P.pdf', 'surname': 'King', 'given': 'Madeleine',
            'url': SOURCE, 'last_updated': '2026-09-15',
        })

    def test_recorded_pdf_integrity_full_rows_and_neutral_record_date(self):
        self.assertEqual(hashlib.sha256((FIX/'house-king-48.pdf').read_bytes()).hexdigest(), '60e72cec465b9b7f955f6d4e1fd8f1f3e14dcb9aa611ca8149e6b537b3813e92')
        rows = [r for r in self.doc.rows if r.page == 33]
        self.assertEqual([r.description for r in rows], EXPECTED)
        self.assertTrue(all(r.kind == 'addition' and r.date_declared == '2026-09-15' for r in rows))
        self.assertIn('14/07/2026', rows[2].description)
        self.assertIn('This was on the 04/07/26', rows[2].description)

    def test_scratch_storage_and_export_retain_full_text_kind_holder_date_and_page_citation(self):
        doc = copy.deepcopy(self.doc); doc.person_id = '10884'
        doc.rows = [r for r in doc.rows if r.page == 33]
        with tempfile.TemporaryDirectory() as td:
            p = Path(td); db = p/'scratch.sqlite'
            with sqlite3.connect(db) as con:
                f.ensure_tables(con); f.store_document(con, doc)
                self.assertEqual([r[0] for r in con.execute('SELECT source_url FROM ext_interests')], [SOURCE+'#page=33']*3)
            for name in ['money', 'access', 'fits']:
                (p/(name+'.json')).write_text('{}')
            repo = Path(__file__).resolve().parents[1]
            subprocess.run([sys.executable, str(repo/'scripts/export_interests.py'), '--out', str(p/'out'),
                            '--money', str(p/'money.json'), '--access', str(p/'access.json'), '--fits', str(p/'fits.json')],
                           env={**os.environ, 'OPAX_DB': str(db)}, check=True, capture_output=True)
            exported = json.loads((p/'out/10884.json').read_text())
            items = exported['buckets']['gifts']['items'] + exported['buckets']['travel']['items']
            # The export's existing history ordering is independent of PDF order.
            self.assertCountEqual([i['description'] for i in items], EXPECTED)
            self.assertTrue(all(i['holder']=='self' and i['kind']=='addition' and i['date']=='2026-09-15' and i['page']==33 for i in items))
            self.assertEqual(exported['source_url'], SOURCE)
            if target := os.environ.get('OPAX_TEST_INTERESTS_EXPORT'):
                Path(target).write_text(json.dumps(exported))


if __name__ == '__main__':
    unittest.main()
