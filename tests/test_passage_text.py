"""Shared display regressions from TestFlight; all databases are fixtures."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
import unittest

from scripts.passage_text import normalize_passage, passage_window, evidence_excerpt

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT / 'tests/fixtures/passage-text.json').read_text())
sys.path.insert(0, str(ROOT / 'scripts'))


class PassageTextTests(unittest.TestCase):
    def test_100kb_incomplete_markup_is_linear(self):
        for value in ('<a' + ' ' * 102400, '<!--' * 25600):
            normalize_passage(value)
            times = []
            for _ in range(3):
                started = time.perf_counter()
                normalize_passage(value)
                times.append(time.perf_counter() - started)
            self.assertLess(min(times), .05, times)

    def test_shared_utf16_windows_and_whitespace(self):
        for row in FIXTURE['windows']:
            with self.subTest(row=row):
                result = passage_window(row['text'], row['limit'], row['start'], row.get('end'))
                self.assertEqual(result, row['expected'])
                self.assertLessEqual(len(result.encode('utf-16-le')) // 2, row['limit'])

    def test_real_joins_markup_entities_and_whitespace(self):
        for case in FIXTURE['cases']:
            with self.subTest(text=case['input']):
                self.assertEqual(normalize_passage(case['input']), case['expected'])

    def test_600_cap_includes_ellipsis_and_never_cuts_a_word(self):
        text = 'A ' * 291 + 'Once We know personally how the proposal works.'
        self.assertTrue(text[:600].endswith('We know perso'))
        snippet = passage_window(text)
        self.assertLessEqual(len(snippet), 600)
        self.assertTrue(snippet.endswith('We know …'))
        self.assertEqual(passage_window('x' * 700), '…')

    def test_exact_fit_has_no_ellipsis_and_both_ends_are_bounded(self):
        self.assertEqual(passage_window('Whole words.', 12), 'Whole words.')
        text = 'Before Transport Legislation Committee after.'
        self.assertEqual(passage_window(text, start=text.index('Transport') + 1), '… Transport Legislation Committee after.')
        self.assertEqual(passage_window(text, 30, start=8), '… Transport Legislation …')
        self.assertEqual(passage_window('First\nSecond\tThird', 14), 'First\nSecond …')

    def test_reported_evidence_windows_rebuilt_from_original_spans(self):
        bodies = {str(s['speech_id']): s['text_clean'] for s in FIXTURE['speeches']}
        body = bodies['1249416']
        start = body.index('Cattle Australia')
        text = evidence_excerpt(body, start, start + len('Cattle Australia'))
        self.assertNotIn('ransport Legislation', text.replace('Transport Legislation', ''))
        self.assertIn('Meat & Livestock', text)
        self.assertNotIn('\n ', text)
        body = bodies['796901']
        start = body.index('Yandina State School', 3800)
        text = evidence_excerpt(body, start, start + len('Yandina State School'))
        self.assertIn('Opposition senators interjecting—', text)
        self.assertNotRegex(text, r'perso(?:\s*…)?$')

    def test_export_repairs_existing_sidecars_preserves_provenance_and_audits(self):
        from build_evidence_layers import setup, add_evidence
        from export_evidence_layers import export, key
        from audit_evidence_export import audit
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            source_path = path / 'source.sqlite'
            source = sqlite3.connect(source_path)
            source.executescript('CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY, text_clean TEXT); CREATE TABLE ext_press_releases(source,source_id,body_text);')
            evidence = setup(path / 'evidence.sqlite')
            originals = {}
            for speech in FIXTURE['speeches']:
                sid = str(speech['speech_id'])
                source.execute('INSERT INTO speeches VALUES (?,?)', (sid, speech['text_clean']))
                if sid == '1198151': continue
                quote = 'Yandina State School' if sid == '796901' else 'Cattle Australia'
                body = speech['text_clean']
                start = body.index(quote, 3800 if sid == '796901' else 0)
                end = start + len(quote)
                obj = 'org:' + sid
                evidence.execute('INSERT INTO entities VALUES (?,\'organisation\',?,NULL)', (obj, quote))
                digest = hashlib.sha256(body.encode()).hexdigest()
                originals[sid] = (start, end, quote, digest)
                add_evidence(evidence, 'speeches:' + sid, 'mentions', obj, 'speeches', sid, quote,
                             'unique_exact_alias', .98, start=start, end=end,
                             details={'excerpt': body[max(0,start-160):end+160], 'text_field': 'text_clean', 'text_sha256': digest})
            source.commit(); source.close()
            evidence.commit(); evidence.close()
            before = source_path.read_bytes(), (path / 'evidence.sqlite').read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                export(source_path, path / 'evidence.sqlite', path / 'public', allow_incomplete=True)
                result = audit(source_path, path / 'public', require_complete=False)
            self.assertEqual(result['errors'], [])
            for sid, (start, end, quote, digest) in originals.items():
                identity = key('org:' + sid)
                entry = json.loads((path / 'public' / (identity[:2] + '.json')).read_text())['entries'][identity]
                excerpt = entry['excerpts'][0]
                self.assertEqual((excerpt['start'], excerpt['end'], excerpt['matched_text'], excerpt['text_sha256']), (start, end, quote, digest))
                self.assertEqual(excerpt['text'], excerpt['details']['excerpt'])
                self.assertNotIn('senatorsinterjecting', excerpt['text'])
                self.assertNotIn('&#38;', excerpt['text'])
            self.assertEqual(before, (source_path.read_bytes(), (path / 'evidence.sqlite').read_bytes()))

    def test_export_falls_back_when_source_fingerprint_drifts_or_is_missing(self):
        from build_evidence_layers import setup, add_evidence
        from export_evidence_layers import export, key
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            source_path = path / 'source.sqlite'
            source = sqlite3.connect(source_path)
            source.executescript('CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY, text_clean TEXT); CREATE TABLE ext_press_releases(source,source_id,body_text);')
            old = 'Old context. Example Agency. Old ending.'
            body = 'Changed beginning. New context. Example Agency. New ending.'
            digest = hashlib.sha256(old.encode()).hexdigest()
            evidence = setup(path / 'evidence.sqlite')
            for sid in (1, 2):
                source.execute('INSERT INTO speeches VALUES (?,?)', (sid, body))
                obj = 'org:' + str(sid)
                evidence.execute('INSERT INTO entities VALUES (?,\'organisation\',?,NULL)', (obj, 'Example Agency'))
                details = {'excerpt': 'Old &#38; context. Example Agency.', 'text_field': 'text_clean'}
                if sid == 1:
                    details['text_sha256'] = digest
                start = old.index('Example Agency')
                add_evidence(evidence, 'speeches:' + str(sid), 'mentions', obj, 'speeches', str(sid), 'Example Agency',
                             'unique_exact_alias', .98, start=start, end=start+14, details=details)
            source.commit(); source.close(); evidence.commit(); evidence.close()
            before = source_path.read_bytes(), (path / 'evidence.sqlite').read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                export(source_path, path / 'evidence.sqlite', path / 'public', allow_incomplete=True)
            for sid in (1, 2):
                identity = key('org:' + str(sid))
                excerpt = json.loads((path / 'public' / (identity[:2] + '.json')).read_text())['entries'][identity]['excerpts'][0]
                self.assertEqual(excerpt['text'], 'Old & context. Example Agency.')
                self.assertEqual(excerpt['details']['excerpt'], excerpt['text'])
                self.assertEqual(excerpt['text_sha256'], digest if sid == 1 else None)
                self.assertEqual(excerpt['start'], old.index('Example Agency'))
            self.assertEqual(before, (source_path.read_bytes(), (path / 'evidence.sqlite').read_bytes()))


if __name__ == '__main__':
    unittest.main()
