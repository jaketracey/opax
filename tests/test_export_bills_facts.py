"""Offline bill publication repairs, using the 12 November portal audit rows."""
import json
from pathlib import Path
import tempfile
import unittest
import subprocess
import sys

from scripts import export_bills as export

ROOT = Path(__file__).resolve().parents[1]
AUDIT = json.loads((ROOT / 'portal/test/fixtures/portal-facts.json').read_text())


class PublishedBillFacts(unittest.TestCase):
    def test_real_audit_labels_use_the_exporters_own_decode_and_map(self):
        self.assertEqual(len(AUDIT['parties']), 585)
        for row in AUDIT['parties']:
            with self.subTest(key=row['key'], raw=row['raw']):
                self.assertEqual(export.sponsor_party_token(row['raw']), row['canonical'])

    def test_all_published_sponsors_use_canonical_tokens(self):
        directory = ROOT / 'portal/public/bills'
        self.assertEqual(json.loads((ROOT / 'portal/public/facts/sponsor-parties.json').read_text()), sorted(export.PUBLISHED_PARTIES))
        index = json.loads((directory / 'index.json').read_text())
        for row in index['bills']:
            bill = json.loads((directory / f"{row['key']}.json").read_text())
            self.assertEqual(row['sponsor_party'], bill['sponsor_party'])
            for party in [bill['sponsor_party'], *(s.get('party') for s in bill.get('sponsors', []))]:
                self.assertTrue(party is None or party in export.PUBLISHED_PARTIES, (row['key'], party))

    def test_reconciles_all_eight_tallies_from_the_reviewed_source_records(self):
        directory = ROOT / 'portal/public/divisions'
        corrections = json.loads((ROOT / 'scripts/corrections/divisions.json').read_text())
        for row in AUDIT['divisions']:
            doc = {'divisions': [{'key':row['key'], 'ayes':999, 'noes':999, 'outcome':'stale', 'stage':'Second reading'}]}
            export.reconcile_divisions([doc], directory)
            division = doc['divisions'][0]
            self.assertEqual((division['ayes'], division['noes']), (row['ayes'], row['noes']))
            self.assertEqual(division['stage'], 'Second reading')
            source = json.loads((directory / f"division-{row['key']}.json").read_text())
            self.assertEqual(sum(m['vote'] == 'aye' for m in source['members']), row['ayes'])
            self.assertEqual(sum(m['vote'] == 'no' for m in source['members']), row['noes'])
            for correction in (c for c in corrections if c['id'] == row['key'] and c['field'] in ('ayes', 'noes', 'result')):
                field = 'outcome' if correction['field'] == 'result' else correction['field']
                self.assertEqual(division[field], correction['to'])
                self.assertIn('divisioncount', correction['evidence'])

    def test_missing_or_mismatched_divisions_fail_before_publication(self):
        with tempfile.TemporaryDirectory() as scratch:
            directory = Path(scratch)
            doc = {'divisions':[{'key':'example', 'ayes':99}]}
            with self.assertRaises(FileNotFoundError):
                export.reconcile_divisions([doc], directory)
            (directory / 'division-example.json').write_text('{"key":"another"}')
            with self.assertRaisesRegex(ValueError, 'identity mismatch'):
                export.reconcile_divisions([doc], directory)

    def test_offline_refresh_never_opens_a_database_or_changes_the_source_stamp(self):
        with tempfile.TemporaryDirectory() as scratch:
            directory = Path(scratch)
            bill = {'key':'example', 'divisions':[{'key':'federal-senate-3304', 'ayes':38, 'noes':37, 'stage':'Second reading'}]}
            index = {'generated_at':'2026-10-04', 'bills':[{'key':'example'}]}
            (directory / 'index.json').write_text(json.dumps(index))
            (directory / 'example.json').write_text(json.dumps(bill))
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/export_bills.py'),
                '--db','file:/nonexistent/db?mode=ro', '--refresh-division-facts',str(directory),
                '--divisions',str(ROOT / 'portal/public/divisions')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            repaired = json.loads((directory / 'example.json').read_text())
            self.assertEqual(repaired['divisions'][0]['ayes'], 37)
            self.assertEqual(json.loads((directory / 'index.json').read_text()), index)
            self.assertEqual(export.refresh_division_facts(directory, ROOT / 'portal/public/divisions'), 0)


if __name__ == '__main__':
    unittest.main()
