"""Measured source classes, identity failures and refresh persistence."""
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import export_division_pages as exporter


def page(key):
    return json.loads((ROOT / f'portal/public/divisions/division-{key}.json').read_text())


class TellerCoverageTests(unittest.TestCase):
    def test_explicit_source_tellers_close_each_measured_convention(self):
        for key, tellers in [('federal-senate-2858', [1, 1]),
                             ('federal-representatives-831', [2, 2]),
                             ('federal-representatives-396', [0, 2]),
                             ('federal-representatives-807', [1, 2])]:
            with self.subTest(key=key):
                record = page(key)
                before = deepcopy(record['members'])
                totals = record['ayes'], record['noes']
                record['_meta'] = {'member_coverage': 'partial'}
                exporter.label_coverage({key: record})
                self.assertEqual(record['_meta']['member_coverage'], 'recorded')
                proof = record['_meta']['member_reconciliation']
                self.assertEqual(proof['tellers'], tellers)
                self.assertTrue(proof['gid'])
                self.assertRegex(proof['source_url'], r'^https://data.openaustralia.org.au/scrapedxml/')
                self.assertEqual(record['members'], before)
                self.assertEqual((record['ayes'], record['noes']), totals)
                self.assertEqual(exporter.coverage_rank(record), 2)

    def test_no_offset_rule_when_the_proved_snapshot_changes(self):
        original = page('federal-senate-2858')
        for field, value in [('date', '2006-09-07'), ('house', 'representatives'),
                             ('source_url', 'https://example.test/another-source'), ('ayes', 32),
                             ('key', 'federal-senate-unknown')]:
            record = deepcopy(original)
            record[field] = value
            exporter.label_coverage({record['key']: record})
            self.assertEqual(record['_meta']['member_coverage'], 'partial', field)
            self.assertNotIn('member_reconciliation', record['_meta'])
        for field in ('name', 'person_id', 'vote'):
            record = deepcopy(original)
            member = next(m for m in record['members'] if m['vote'] == 'aye')
            member[field] = {'name': 'Another Person', 'person_id': 'tvfy_999999', 'vote': 'no'}[field]
            exporter.label_coverage({record['key']: record})
            self.assertEqual(record['_meta']['member_coverage'], 'partial', field)

    def test_unresolved_one_two_larger_and_conflicting_lists_stay_partial(self):
        for key in ('federal-representatives-7575', 'federal-senate-5323',
                    'federal-representatives-2496', 'federal-senate-3166',
                    'nsw-lc-2026-10-22-4'):
            record = page(key)
            # A stale or forged label is never enough to establish completeness.
            record['_meta']['member_coverage'] = 'recorded'
            record['_meta'].pop('member_tally', None)
            exporter.label_coverage({key: record})
            self.assertEqual(record['_meta']['member_coverage'], 'partial', key)
            self.assertEqual(record['_meta']['member_tally']['official'], [record['ayes'], record['noes']])
            self.assertNotIn('member_reconciliation', record['_meta'])

    def test_bill_only_refresh_retains_the_proved_roll_call_and_disclosure(self):
        record = page('federal-senate-2858')
        exporter.label_coverage({record['key']: record})
        with tempfile.TemporaryDirectory() as directory:
            exporter.write_projection({record['key']: record}, directory)
            candidate = deepcopy(record)
            candidate['members'] = []
            candidate['_meta'] = {'member_coverage': 'unavailable'}
            retained = exporter.write_projection({record['key']: candidate}, directory)[record['key']]
        self.assertTrue(retained['_meta']['refresh_retained'])
        self.assertEqual(retained['_meta']['member_coverage'], 'recorded')
        self.assertEqual(retained['members'], record['members'])
        self.assertIn('member_reconciliation', retained['_meta'])


class HeldTableRecoveryTests(unittest.TestCase):
    def fixture(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript('''
            CREATE TABLE ext_divisions (id TEXT, name TEXT, question TEXT, date TEXT, house TEXT,
              jurisdiction TEXT, ayes_count INT, noes_count INT, result TEXT, source_url TEXT, extra TEXT);
            CREATE TABLE ext_votes (division_id TEXT, person_id TEXT, person_name TEXT, vote TEXT, party TEXT);
            CREATE TABLE ext_state_roster (qid TEXT, state TEXT, chamber TEXT, full_name TEXT,
              given_name TEXT, family_name TEXT, district TEXT, party TEXT, term_start TEXT,
              term_end TEXT, fetched_at TEXT);
        ''')
        db.execute('INSERT INTO ext_divisions VALUES (?,?,?,?,?,?,?,?,?,?,?)', (
            'nsw-lc-fixture', 'Fixture question', 'That the motion be agreed to', '2025-11-27', 'nsw_lc',
            'nsw', 1, 1, 'negative', 'https://api.parliament.nsw.gov.au/fixture',
            json.dumps({'table_names': {'aye': ['Barrett (teller)'], 'no': ['Franklin'], 'paired': []}})))
        db.execute('INSERT INTO ext_votes VALUES (?,?,?,?,?)', ('nsw-lc-fixture', 'nsw_1', 'Scott Barrett', 'aye', None))
        db.execute('INSERT INTO ext_state_roster VALUES (?,?,?,?,?,?,?,?,?,?,?)', (
            'Q19873536', 'nsw', 'nsw_lc', 'Ben Franklin', 'Ben', 'Franklin', None,
            'Liberal-National Coalition', '2019-05-08', None, '2026-09-21T12:26:21Z'))
        return db

    def test_recovers_source_print_with_dated_chamber_seat_and_individual_provenance(self):
        db = self.fixture()
        record = exporter.database_projection(db, {})['nsw-lc-fixture']
        self.assertEqual(record['_meta']['member_coverage'], 'recorded')
        self.assertEqual((record['ayes'], record['noes']), (1, 1))
        recovered = next(m for m in record['members'] if m['name'] == 'Ben Franklin')
        self.assertEqual(recovered['vote'], 'no')
        self.assertNotIn('party', recovered)
        self.assertIsNone(recovered['person_id'])  # no invented NSW parliament ID
        source = recovered['member_source']
        self.assertEqual(source['printed'], 'Franklin')
        self.assertEqual(source['url'], record['source_url'])
        self.assertEqual((source['chamber'], source['seat']), ('nsw_lc', 'New South Wales'))
        self.assertEqual(source['service_from'], '2019-05-08')
        self.assertEqual(source['identity_url'], 'https://www.wikidata.org/wiki/Q19873536')

    def test_coverage_refresh_preserves_published_parties_despite_a_different_db_snapshot(self):
        db = self.fixture()
        # The published label and blank/withheld evidence win over a stale DB.
        for fields in ({'party': 'Published party', 'party_source': {'source_party': 'Original party'}},
                       {'party_withheld': {'reason': 'No dated party'}}, {}):
            with self.subTest(fields=fields), tempfile.TemporaryDirectory() as directory:
                record = exporter.database_projection(db, {})['nsw-lc-fixture']
                record['members'] = [dict(name='Scott Barrett', person_id='nsw_1',
                                          person_slug='scott-barrett', vote='aye', **fields)]
                record['_meta'] = {'member_coverage': 'partial', 'party_source': 'Published provenance'}
                prior = exporter.write_projection({record['key']: record}, directory)
                db.execute("UPDATE ext_votes SET party='Wrong snapshot party'")
                with patch.object(exporter.vote_parties, 'load_evidence', side_effect=AssertionError('No party reload')):
                    current = exporter.refresh_coverage(db, directory)
                exporter.check_coverage_changes(current, prior)
                before = prior[record['key']]
                after = current[record['key']]
                self.assertIn(before['members'][0], after['members'])
                self.assertEqual(after['_meta']['party_source'], 'Published provenance')
                self.assertEqual(after['_meta']['member_coverage'], 'recorded')
                self.assertEqual(after['_meta']['member_count'], 2)
                self.assertEqual(after['_meta']['refresh_retained'], before['_meta']['refresh_retained'])
                self.assertFalse(any('party' in k for m in after['members'] if m['name'] == 'Ben Franklin' for k in m))
                self.assertEqual(exporter.refresh_coverage(db, directory), current)

    def test_coverage_check_rejects_party_and_other_noncoverage_changes(self):
        record = exporter.database_projection(self.fixture(), {})['nsw-lc-fixture']
        prior = {record['key']: record}
        mutations = [lambda d: d['members'][0].update(party='Changed'),
                     lambda d: d['members'][0].update(party_source={'source_party': 'Changed'}),
                     lambda d: d['members'][0].update(party_withheld={'reason': 'Changed'}),
                     lambda d: d['_meta'].update(party_source='Changed'),
                     lambda d: d.update(ayes=99), lambda d: d.update(question='Changed')]
        for mutate in mutations:
            current = deepcopy(prior)
            mutate(current[record['key']])
            with self.assertRaises(ValueError):
                exporter.check_coverage_changes(current, prior)

    def test_unproved_identity_or_inconsistent_source_table_adds_nobody(self):
        changes = [
            "UPDATE ext_state_roster SET term_start='2026-01-01'",
            "UPDATE ext_state_roster SET term_end='2025-11-26'",
            "UPDATE ext_divisions SET date='2026-09-26'",
            "UPDATE ext_state_roster SET chamber='nsw_la'",
            "UPDATE ext_state_roster SET district='Another seat'",
            "UPDATE ext_state_roster SET full_name='Another Franklin'",
            "INSERT INTO ext_state_roster SELECT 'Q999',state,chamber,'Another Franklin',given_name,family_name,district,party,term_start,term_end,fetched_at FROM ext_state_roster",
            "UPDATE ext_votes SET vote='no'",
            "UPDATE ext_divisions SET noes_count=2",
            "UPDATE ext_divisions SET extra='{}'",
        ]
        for sql in changes:
            with self.subTest(sql=sql):
                db = self.fixture()
                db.execute(sql)
                record = exporter.database_projection(db, {})['nsw-lc-fixture']
                self.assertEqual(len(record['members']), 1)
                self.assertEqual(record['_meta']['member_coverage'], 'partial')

    def test_shortened_held_name_array_can_supply_an_explicit_name_without_losing_prior_votes(self):
        # NSW 2025-12-23 division 19 holds 20 no prints in table_names but a
        # source count of 26; ext_votes retains 25 names. Franklin is explicit
        # in that no table, and every other print agrees with the held votes.
        db = self.fixture()
        db.execute("UPDATE ext_divisions SET noes_count=2")
        db.execute('INSERT INTO ext_votes VALUES (?,?,?,?,?)', ('nsw-lc-fixture', 'nsw_2', 'Sarah Kaine', 'no', None))
        extra = {'table_names': {'aye': ['Barrett'], 'no': ['Franklin']},
                 'members_listed': {'aye': 1, 'no': 2}}
        db.execute('UPDATE ext_divisions SET extra=?', (json.dumps(extra),))
        record = exporter.database_projection(db, {})['nsw-lc-fixture']
        self.assertEqual(record['_meta']['member_coverage'], 'recorded')
        self.assertEqual({m['name']: m['vote'] for m in record['members']},
                         {'Scott Barrett': 'aye', 'Sarah Kaine': 'no', 'Ben Franklin': 'no'})
        extra['members_listed']['no'] = 1
        db.execute('UPDATE ext_divisions SET extra=?', (json.dumps(extra),))
        self.assertEqual(len(exporter.database_projection(db, {})['nsw-lc-fixture']['members']), 2)

    def speech_fixture(self, day='2025-11-27'):
        db = self.fixture()
        db.execute("UPDATE ext_divisions SET extra='{}',date=?", (day,))
        db.executescript('''
            CREATE TABLE speeches (speech_id INTEGER, date TEXT, chamber TEXT, topic TEXT, text TEXT);
            CREATE VIRTUAL TABLE speeches_fts USING fts5(text);
        ''')
        text = 'The House divided. Ayes1 Noes1 Majority0 AYES Barrett NOES Franklin Motion agreed to.'
        db.execute('INSERT INTO speeches VALUES (?,?,?,?,?)', (501, day, 'nsw_lc', 'Fixture question', text))
        db.execute('INSERT INTO speeches_fts(rowid,text) VALUES (?,?)', (501, text))
        return db

    def test_held_hansard_list_recovers_a_name_and_preserves_pairs(self):
        db = self.speech_fixture('2026-09-24')
        db.execute('INSERT INTO ext_votes VALUES (?,?,?,?,?)', ('nsw-lc-fixture', 'nsw_2', 'Sarah Kaine', 'paired', None))
        records = exporter.database_projection(db, {})
        keys = exporter.division_coverage.recover_speech_members(db, records, exporter.person_slug)
        self.assertEqual(keys, {'nsw-lc-fixture'})
        exporter.label_coverage(records)
        record = records['nsw-lc-fixture']
        self.assertEqual(record['_meta']['member_coverage'], 'recorded')
        self.assertIn(('Sarah Kaine', 'paired'), [(m['name'], m['vote']) for m in record['members']])
        source = next(m['member_source'] for m in record['members'] if m['name'] == 'Ben Franklin')
        self.assertEqual(source['held_speech_id'], 501)
        self.assertEqual(source['table'], 'speeches.text')
        self.assertEqual(source['service_through'], '2026-09-25')
        self.assertEqual(len(source['held_speech_sha256']), 64)

    def test_hansard_requires_an_unambiguous_complete_matching_list_and_dated_identity(self):
        for sql in [
            "UPDATE speeches SET topic='Another motion'",
            "UPDATE speeches SET date='2025-11-28'",
            "UPDATE speeches SET chamber='nsw_la'",
            "UPDATE speeches SET text='Ayes2 Noes1 AYES Barrett Kaine NOES Franklin'",
            "UPDATE speeches SET text='Ayes1 Noes1 AYES Barrett NOES Motion agreed to'",
            "UPDATE speeches SET text='Ayes1 Noes1 AYES Barrett NOES Unknown'",
            "UPDATE ext_votes SET vote='no'",
            "UPDATE ext_state_roster SET term_end='2025-11-26'",
            "INSERT INTO speeches SELECT 502,date,chamber,topic,text FROM speeches",
        ]:
            with self.subTest(sql=sql):
                db = self.speech_fixture()
                db.execute(sql)
                db.execute("DELETE FROM speeches_fts")
                db.execute('INSERT INTO speeches_fts(rowid,text) SELECT speech_id,text FROM speeches')
                records = exporter.database_projection(db, {})
                self.assertEqual(exporter.division_coverage.recover_speech_members(db, records, exporter.person_slug), set())
                self.assertEqual(len(records['nsw-lc-fixture']['members']), 1)

    def test_october_vote_is_not_projected_from_the_last_held_membership_observation(self):
        db = self.speech_fixture('2026-10-01')
        records = exporter.database_projection(db, {})
        self.assertEqual(exporter.division_coverage.recover_speech_members(db, records, exporter.person_slug), set())


if __name__ == '__main__':
    unittest.main()
