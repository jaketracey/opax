"""Offline bill publication repairs, using the 12 November portal audit rows."""
import json
from pathlib import Path
import tempfile
import unittest
import subprocess
import sys
from unittest.mock import patch

from scripts import export_bills as export

ROOT = Path(__file__).resolve().parents[1]
AUDIT = json.loads((ROOT / 'portal/test/fixtures/portal-facts.json').read_text())
DATED_SPONSORS = json.loads((ROOT / 'portal/test/fixtures/dated-sponsor-parties.json').read_text())


class PublishedBillFacts(unittest.TestCase):
    def test_real_audit_labels_use_the_exporters_own_decode_and_map(self):
        self.assertEqual(len(AUDIT['parties']), 585)
        index = json.loads((ROOT / 'portal/public/bills/index.json').read_text())
        parties = {row['key']: row['sponsor_party'] for row in index['bills']}
        dated = {row['key']: row['published_party'] for row in DATED_SPONSORS['rows'] + DATED_SPONSORS['fills']}
        for row in AUDIT['parties']:
            with self.subTest(key=row['key'], raw=row['raw']):
                self.assertEqual(export.sponsor_party_token(row['raw']), row.get('source_canonical', row['canonical']))
                self.assertEqual(parties[row['key']], dated.get(row['key'], row.get('source_canonical', row['canonical'])))

    def test_next_export_resolver_matches_projected_audit_labels(self):
        records = export.SponsorPartyRecords()
        for row in AUDIT['parties']:
            with self.subTest(key=row['key']):
                bill = json.loads((ROOT / 'portal/public/bills' / (row['key'] + '.json')).read_text())
                self.assertEqual(records.check(bill)['party'], row['canonical'])
                refreshed = {**bill, 'sponsor_party': row['canonical']}
                self.assertEqual(records.check(refreshed)['party'], row['canonical'])

    def test_projection_preserves_reviewed_decision_map_except_mcmahons_registered_name(self):
        records = export.SponsorPartyRecords()
        changes = {}
        for row in DATED_SPONSORS['rows'] + DATED_SPONSORS['fills']:
            bill = json.loads((ROOT / 'portal/public/bills' / (row['key'] + '.json')).read_text())
            party = records.check(bill)['party']
            if party != row['published_party']:
                changes[row['key']] = (row['published_party'], party)
        self.assertEqual(changes, {
            'au-federal-s1309': ('Nationals', 'Country Liberal Party'),
        })

    def test_full_projection_changes_no_other_primary_or_cosponsor(self):
        from scripts.audit_bill_sponsor_parties import project
        projection = project(ROOT)
        evidence_bills = [json.loads((ROOT / 'portal/public/bills' / (key + '.json')).read_text())
                          for key in projection['sponsors']]
        held = export.fill_sponsor_parties(evidence_bills, evidence=export.vote_parties.load_evidence())
        self.assertEqual({row['key'] for row in held}, {
            'au-federal-s1297', 'au-federal-s1307', 'au-federal-s1316', 'au-federal-s1321'})
        for bill in evidence_bills:
            self.assertEqual({field: bill.get(field, []) for field in ('sponsor_party', 'sponsors')},
                             projection['sponsors'][bill['key']], bill['key'])
        changes = {}
        for key, sponsor in projection['sponsors'].items():
            bill = json.loads((ROOT / 'portal/public/bills' / (key + '.json')).read_text())
            self.assertEqual(sponsor['sponsors'], bill.get('sponsors', []), key)
            if sponsor['sponsor_party'] != bill.get('sponsor_party'):
                changes[key] = (bill.get('sponsor_party'), sponsor['sponsor_party'])
        self.assertEqual(changes, {
            'au-federal-s1309': ('Nationals', 'Country Liberal Party'),
            'au-federal-s1127': ('Nick Xenophon Team', 'Centre Alliance'),
        })

    def test_retained_label_repair_never_infers_missing_affiliations(self):
        with tempfile.TemporaryDirectory() as scratch:
            directory = Path(scratch)
            raw = [None, "Australia&#39;s Voice", 'xx', 'monarchist',
                   'Independent Members', 'Liberal', 'Australian Greens']
            expected = [None, "Australia's Voice", None, None, 'Independent',
                        'Liberal', 'Greens']
            index = {'generated_at': '2026-10-04', 'bills': []}
            for i, label in enumerate(raw):
                key = f'example-{i}'
                bill = {'key': key, 'sponsor': None, 'sponsor_person_id': 'known-person',
                        'portfolio': '(s) MEMBER, Example, MP', 'sponsor_party': label,
                        'sponsors': [{'name': 'Example', 'party': label}]}
                (directory / f'{key}.json').write_text(json.dumps(bill))
                index['bills'].append({'key': key, 'sponsor_party': label})
            (directory / 'index.json').write_text(json.dumps(index))
            # The CLI must select this offline path before opening even a DB.
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/export_bills.py'),
                '--db', 'file:/nonexistent/db?mode=ro', '--normalise-sponsor-labels',
                str(directory)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            repaired_index = json.loads((directory / 'index.json').read_text())
            self.assertEqual(repaired_index['generated_at'], index['generated_at'])
            self.assertEqual([row['sponsor_party'] for row in repaired_index['bills']], expected)
            for i, party in enumerate(expected):
                bill = json.loads((directory / f'example-{i}.json').read_text())
                self.assertIsNone(bill['sponsor'])
                self.assertEqual(bill['sponsor_party'], party)
                self.assertEqual(bill['sponsors'][0]['party'], party)
            self.assertEqual(export.normalise_sponsor_labels(directory), 0)

    def test_twenty_originally_null_alrc_affiliations_stay_null(self):
        directory = ROOT / 'portal/public/bills'
        self.assertEqual(len(AUDIT['sponsor_party_null_keys']), 20)
        for key in AUDIT['sponsor_party_null_keys']:
            bill = json.loads((directory / f'{key}.json').read_text())
            self.assertIsNone(bill['sponsor'], key)
            self.assertIsNone(bill['sponsor_party'], key)

    def test_all_published_sponsors_use_canonical_tokens(self):
        directory = ROOT / 'portal/public/bills'
        self.assertEqual(json.loads((ROOT / 'portal/public/facts/sponsor-parties.json').read_text()), sorted(export.PUBLISHED_PARTIES))
        index = json.loads((directory / 'index.json').read_text())
        for row in index['bills']:
            bill = json.loads((directory / f"{row['key']}.json").read_text())
            self.assertEqual(row['sponsor_party'], bill['sponsor_party'])
            for party in [bill['sponsor_party'], *(s.get('party') for s in bill.get('sponsors', []))]:
                self.assertTrue(party is None or party in export.PUBLISHED_PARTIES, (row['key'], party))

    def test_browser_alias_table_is_generated_from_the_exporters_accepted_aliases(self):
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / 'party-page.js'
            source = ROOT / 'portal/public/party-page.js'
            path.write_bytes(source.read_bytes())
            export.write_sponsor_party_aliases(path)
            self.assertEqual(path.read_bytes(), source.read_bytes())

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
            check_command = [sys.executable, str(ROOT / 'scripts/export_bills.py'),
                '--db', 'file:/nonexistent/db?mode=ro', '--check-division-facts', str(directory),
                '--divisions', str(ROOT / 'portal/public/divisions')]
            stale = subprocess.run(check_command, capture_output=True, text=True)
            self.assertNotEqual(stale.returncode, 0)
            self.assertIn('Bill division drift: example/federal-senate-3304/ayes', stale.stderr)
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/export_bills.py'),
                '--db','file:/nonexistent/db?mode=ro', '--refresh-division-facts',str(directory),
                '--divisions',str(ROOT / 'portal/public/divisions')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            repaired = json.loads((directory / 'example.json').read_text())
            self.assertEqual(repaired['divisions'][0]['ayes'], 37)
            self.assertEqual(json.loads((directory / 'index.json').read_text()), index)
            self.assertEqual(export.refresh_division_facts(directory, ROOT / 'portal/public/divisions'), 0)
            self.assertEqual(subprocess.run(check_command, capture_output=True).returncode, 0)

    def test_reconcile_checks_persisted_files_so_drift_fails_the_nightly_step(self):
        with tempfile.TemporaryDirectory() as scratch:
            directory = Path(scratch)
            (directory / 'index.json').write_text('{"bills":[{"key":"example"}]}')
            (directory / 'example.json').write_text(json.dumps({'key': 'example', 'divisions': [
                {'key': 'federal-senate-3304', 'ayes': 38, 'noes': 37, 'outcome': 'negative'}]}))
            # A failed persistence step must not let an in-memory repair pass.
            with patch.object(export, 'write_retained_bills', return_value=0):
                with self.assertRaisesRegex(ValueError, 'Bill division drift: example/'):
                    export.refresh_division_facts(directory, ROOT / 'portal/public/divisions')

    def test_all_persisted_bill_tallies_pass_the_offline_build_check(self):
        bills, links = export.check_division_facts(ROOT / 'portal/public/bills',
                                                 ROOT / 'portal/public/divisions')
        self.assertGreater(bills, 0)
        self.assertGreaterEqual(links, bills)


if __name__ == '__main__':
    unittest.main()
