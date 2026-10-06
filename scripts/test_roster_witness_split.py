"""Pinned public cases and real SQL/wrapper replay; never use the desktop DB."""
import copy
from contextlib import redirect_stderr
import io
import json
import os
import sqlite3
import unittest
from unittest.mock import patch
from pathlib import Path

from scripts import enrich_profile_jurisdictions as profiles
from scripts.export_parliamentarians import attribution_refusals
from scripts.export_parliamentarians import check_roster
from scripts.audit_roster_changes import audit
from scripts.roster_identity import member, verify
from scripts.split_roster_witnesses import restored_scope, split_pinned
from scripts.test_roster_export_wrappers import RealWrapperTests

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT / 'tests/fixtures/roster-export/witness-split-8e1977cf.json').read_text())


class PinnedSplitTests(unittest.TestCase):
    def test_thirteen_review_cases_and_three_historical_cases_restore_only_scoped_identity(self):
        reference = profiles.pinned_reference()
        reviewed = json.loads(profiles.REVIEWED.read_text())
        total = 0
        for case in FIXTURE['cases']:
            before = case['before']
            with self.subTest(name=before['name']):
                own = restored_scope(before, reference, reviewed)
                if not case['expected_full']:
                    self.assertIsNone(own)
                    continue
                self.assertEqual(own['full'], case['expected_full'])
                self.assertEqual(own['party'], case['expected_party'])
                self.assertEqual({k: own['speech_scope'][k] for k in ('state', 'chamber')}, {'state': 'qld', 'chamber': 'qld_la'})
                self.assertTrue(own['speech_scope']['service'])
                self.assertIsNone(own['speeches'])
                self.assertEqual(own['speech_count_basis'], 'pending own-house, in-service SQL export')
                self.assertEqual(own['transcript']['speeches'], before['speeches'])
                self.assertEqual(attribution_refusals([own]), [])
                self.assertNotIn('pid', own)
                self.assertNotIn('current', own)
                self.assertNotIn('witness_rows', own)
                self.assertEqual(own['transcript']['witness_rows'], before['witness_rows'])
                if before['name'] in FIXTURE['qld_review_names']: total += 1
        self.assertEqual(len(FIXTURE['qld_review_names']), 13)
        self.assertEqual(total, 13)

    def test_split_is_idempotent_and_repair_preserves_it(self):
        reference = profiles.pinned_reference()
        reviewed = json.loads(profiles.REVIEWED.read_text())
        doc = {'meta': {}, 'people': [copy.deepcopy(c['before']) for c in FIXTURE['cases']]}
        self.assertEqual(len(split_pinned(doc, reference, reviewed)), 16)
        before = copy.deepcopy(doc)
        self.assertEqual(split_pinned(doc, reference, reviewed), [])
        self.assertEqual(doc, before)
        profiles.repair(doc['people'], reference, reviewed)
        for row in before['people']:
            if row.get('speech_scope'):
                self.assertEqual(row, next(p for p in doc['people'] if p['name'] == row['name']))

    def test_competing_house_name_missing_evidence_and_multistate_cannot_restore(self):
        row = next(c['before'] for c in FIXTURE['cases'] if c['before']['name'] == 'Stewart')
        ref = profiles.pinned_reference()
        reviewed = json.loads(profiles.REVIEWED.read_text())
        for candidate, reference, peers in [
            (dict(row, states=['qld', 'federal', 'nsw'], chambers=[*row['chambers'], 'nsw_la']), ref, ()),
            (row, ref, [dict(name='Casey Stewart', states=['qld'], chambers=['qld_la'], first=2024, last=2026)]),
        ]:
            self.assertIsNone(restored_scope(candidate, reference, reviewed, peers))
        with patch.object(profiles, 'dated_records', return_value=[]):
            # Empty both dated authorities and member stubs.
            self.assertIsNone(restored_scope(row, {}, reviewed))

    def test_witness_marker_overrides_a_reviewed_name_and_stale_numeric_pid(self):
        members = {'1': member('1', ['Scott Stewart'], 'representatives', 2020, None)}
        for flag in [{'speaker_type': 'witness'}, {'witness_name': 'Stewart'}]:
            self.assertEqual(verify(dict(name='Scott Stewart', **flag), {'1': 20}, members,
                                    {'scott stewart': '1'}, 2026), (None, 'committee witness'))
        own = {'name': 'Stewart', 'separated_witnesses': {'speaker_type': 'witness', 'speeches': 203, 'party': 'Labor'}}
        self.assertTrue(attribution_refusals([own]))

    def test_reviewed_override_cannot_allow_an_mp_attribution_on_testimony(self):
        row = {'name':'Stewart','separated_witnesses':{'speaker_type':'witness','party':'Labor'}}
        with patch.dict(os.environ, {'OPAX_ROSTER_ACCEPT':'1'}), \
             patch('scripts.export_parliamentarians.shipped_roster', return_value=([],None)), \
             redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as held:
                check_roster([row])
        self.assertEqual(held.exception.code, 3)

    def test_diff_rejects_a_wrong_name_party_scope_or_witness_identity(self):
        before = next(c['before'] for c in FIXTURE['cases'] if c['before']['name']=='Stewart')
        reference = profiles.pinned_reference()
        reviewed = json.loads(profiles.REVIEWED.read_text())
        own = restored_scope(before, reference, reviewed)
        for mutation in ({'full':'Wrong Stewart'}, {'party':'Liberal'},
                         {'speech_scope':None},
                         {'speech_scope':{'state':'federal','chamber':'senate_committee'}},
                         {'separated_witnesses':dict(own['separated_witnesses'],pid='11011')}):
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError,'Unproven'):
                audit([before],[dict(own,**mutation)],reference,reviewed)

    def test_sync_scrubs_witness_party_member_id_and_electorate_even_with_conflicting_markers(self):
        from parli.ingest.arag_sync import map_speech
        db = sqlite3.connect(':memory:'); db.row_factory = sqlite3.Row
        db.execute('CREATE TABLE s (speech_id, date, speaker_name, person_id, party, party_canonical, topic, text, source, state, chamber, electorate, word_count, speaker_type, witness_name)')
        for witness_name, speaker_type in [(None, 'witness'), ('Stewart', 'member')]:
            db.execute('DELETE FROM s')
            db.execute('INSERT INTO s VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       ('2026-01-01','Stewart','1','Labor','Labor','Evidence','Witness text','test_fixture',
                        'federal','senate_committee','Townsville',20,speaker_type,witness_name))
            mapped = map_speech(db.execute('SELECT * FROM s').fetchone())
            labels = {c['labelset']: c['label'] for c in mapped['usermetadata']['classifications']}
            self.assertEqual(labels['speaker_type'], 'witness')
            self.assertNotIn('party', labels)
            self.assertIsNone(mapped['extra']['metadata']['person_id'])
            self.assertIsNone(mapped['extra']['metadata']['electorate'])
        db.close()


class SqlSplitTests(unittest.TestCase):
    sandbox = RealWrapperTests.sandbox
    export = RealWrapperTests.export

    def test_real_sql_and_nightly_wrapper_counts_only_own_house_in_service(self):
        rows = FIXTURE['cases']
        baseline = {'meta': {}, 'people': [dict(name=c['before']['name'], speeches=c['before']['speeches'],
                       states=c['before']['states'], chambers=c['before']['chambers'], representation=[]) for c in rows]}
        box = self.sandbox(json.dumps(baseline).encode())
        db = sqlite3.connect(box / 'parli.db')
        db.execute('PRAGMA foreign_keys=OFF'); db.execute('DELETE FROM speeches'); db.execute('DELETE FROM members')
        db.execute('ALTER TABLE speeches ADD COLUMN speaker_type TEXT')
        services = {s['print']:s for s in json.loads(profiles.WITNESS_SERVICE.read_text())['services']}
        for pid, name, start in [('jana_fixture','Jana Stewart','2022-03-06'), ('charlotte_fixture','Charlotte Walker','2025-07-01')]:
            db.execute('INSERT INTO members (person_id,full_name,state,chamber,party,entered_house) VALUES (?,?,?,?,?,?)',
                       (pid,name,'federal','senate','Labor',start))
        expected_counts = {}
        for case in rows:
            p = case['before']; name = p['name']; pid = 'qld_fixture_' + name
            db.execute('INSERT INTO members (person_id,full_name,state,chamber,party,entered_house) VALUES (?,?,?,?,?,?)',
                       (pid,case['expected_full'] or 'Unverified Namesake','qld','qld_la','Liberal','2024-01-01'))
            remainder = p['speeches'] - p.get('witness_rows', 0)
            # Review-shaped counts: Scott's and Les's other non-witness rows
            # are committee parliamentarians, including Jana/Charlotte.
            own_count = {'Stewart':30, 'Walker':28}.get(name, remainder - 1) if case['expected_full'] else 0
            expected_counts[name] = own_count
            for i in range(p['speeches']):
                witness = i < p.get('witness_rows', 0)
                j = i - p.get('witness_rows', 0)
                own = not witness and j < own_count
                stale_house = not witness and j == own_count and case['expected_full']
                date = '2026-03-01'
                if own:
                    date = '2024-07-01' if services[name]['intervals'][-1]['end'] == '2024-09-30' else ('2024-11-01' if j % 2 else '2026-03-01')
                if stale_house:
                    date = '2023-07-01'  # same house, outside reviewed service coverage
                party = 'Independent' if name=='Sullivan' and date >= '2025-05-12' else case['expected_party']
                db.execute('INSERT INTO speeches (person_id,speaker_name,party,party_canonical,state,chamber,date,text,source,witness_name,speaker_type) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    (pid if witness or own or stale_house else {'Stewart':'jana_fixture','Walker':'charlotte_fixture'}.get(name),name,'Liberal' if witness else party,'Liberal' if witness else party,
                     'qld' if own or stale_house else 'federal', 'qld_la' if own or stale_house else 'senate_committee', date,
                     f'Fixture {name} {i}. ' + 'Parliamentary statement on public services. '*10, 'test_fixture',
                     name if witness and i%2 else None, 'witness' if witness and not i%2 else 'member'))
        db.commit(); db.close()
        code, err, output = self.export(box)
        self.assertEqual(code, 0, err)
        doc = json.loads(output); actual = {p['name']: p for p in doc['people']}
        self.assertEqual(sum(bool(p.get('speech_scope')) for p in actual.values()),16)
        for case in rows:
            row = actual[case['before']['name']]
            if not case['expected_full']:
                for field in ('pid','full','party','current','party_now'):
                    self.assertNotIn(field, row)
                self.assertEqual(row['representation'], [])
                continue
            self.assertEqual(row.get('full'), case['expected_full'], row['name'])
            self.assertEqual(row['party'], case['expected_party'])
            self.assertEqual(row['states'], ['qld'])
            self.assertEqual(row['chambers'], ['qld_la'])
            self.assertEqual(row['speeches'], expected_counts[row['name']])
            self.assertEqual(row['separated_witnesses']['speeches'], case['before']['witness_rows'])
            self.assertEqual(attribution_refusals([row]), [])
            self.assertNotIn('speech_count_basis', row)
            self.assertNotIn('witness_rows', row)

    def test_committees_and_out_of_service_rows_cannot_supply_the_five_row_floor(self):
        case = next(c for c in FIXTURE['cases'] if c['before']['name']=='Stewart')
        own = restored_scope(case['before'], profiles.pinned_reference(), json.loads(profiles.REVIEWED.read_text()))
        for groups in [
            [dict(state='qld',chamber='qld_la',date='2024-06-01',n=4), dict(state='federal',chamber='senate_committee',date='2024-06-01',n=150)],
            [dict(state='qld',chamber='qld_la',date='2024-06-01',n=4), dict(state='qld',chamber='qld_la',date='2026-06-01',n=150)],
        ]:
            row = dict(name='Stewart',speeches=154,states=['qld','federal'],chambers=['qld_la','senate_committee'],first=2024,last=2026,
                       separated_witnesses=own['separated_witnesses'],_speech_groups=groups)
            profiles.repair([row], profiles.pinned_reference(), json.loads(profiles.REVIEWED.read_text()))
            self.assertNotIn('full',row)
            self.assertNotIn('party',row)
            self.assertNotIn('speech_scope',row)

    def test_named_split_without_scope_is_refused_even_with_override(self):
        row = dict(name='Brooks', full='Casey Brooks', party='Labor', separated_witnesses={'speaker_type':'witness','speeches':51})
        self.assertTrue(attribution_refusals([row]))
        self.assertTrue(attribution_refusals([dict(row,speech_scope={'state':'qld','chamber':'qld_la'})]))
        with patch.dict(os.environ, {'OPAX_ROSTER_ACCEPT':'1'}), redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as held: check_roster([row])
        self.assertEqual(held.exception.code, 3)


if __name__ == '__main__':
    unittest.main()
