"""Review reproductions using isolated DB/cache fixtures; no external writes."""
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from parli.ingest import federal_affiliations as F, tvfy_refresh as T
from parli.ingest.votes_ingest import read_legacy
from parli.ingest.tvfy_bill_links import official_ref, plan_links, project
from scripts.vm.mobile_votes_contract import validate_votes
from scripts.vm.test_divisions_refresh import mobile


def fixture():
    db = sqlite3.connect(':memory:'); db.row_factory = sqlite3.Row
    db.executescript('''
      CREATE TABLE divisions (division_id INT, house TEXT, name TEXT, date TEXT, number INT,
       aye_votes INT, no_votes INT, possible_turnout INT, rebellions INT, summary TEXT, state TEXT);
      CREATE TABLE votes (division_id INT, person_id TEXT, vote TEXT);
      CREATE TABLE members (person_id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, full_name TEXT,
       party TEXT, electorate TEXT, chamber TEXT, state TEXT, party_original TEXT, party_canonical TEXT);
      CREATE TABLE division_votes_fetched (division_id INT PRIMARY KEY);
      CREATE TABLE speeches (person_id TEXT, date TEXT, party_canonical TEXT, state TEXT);
      INSERT INTO members VALUES ('1','Alex','Example','Alex Example','Greens',NULL,'senate','federal','Greens','Greens');
      INSERT INTO divisions VALUES (1,'senate','Question','2026-08-20',1,1,0,1,0,NULL,'federal');
      INSERT INTO divisions VALUES (2,'senate','Question','2026-09-17',2,1,0,1,0,NULL,'federal');
      INSERT INTO votes VALUES (1,'1','aye'),(2,'1','aye');
    ''')
    db.executescript(T.BILLS_DDL)
    return db


def detail(did, day, party):
    return {'id': did, 'date': day, 'house': 'senate', 'aye_votes': 1, 'no_votes': 0,
            'votes': [{'vote': 'aye', 'member': {'person': {'id': 1}, 'party': party}}]}


class AffiliationTests(unittest.TestCase):
    def setUp(self):
        self.db = fixture(); self.addCleanup(self.db.close)
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)
        self.cache = self.home / '.cache/autoresearch/tvfy/division'; self.cache.mkdir(parents=True)
        p = patch.object(F.Path, 'home', return_value=self.home); p.start(); self.addCleanup(p.stop)

    def test_party_switcher_before_and_after_switch_uses_division_membership(self):
        for did, day, party in [(1, '2026-08-20', 'Australian Labor Party'), (2, '2026-09-17', 'Australian Greens')]:
            T.store_detail(self.db, did, detail(did, day, party), {'1'})
        _, votes = read_legacy(self.db, None, None)
        self.assertEqual({v.division_id: v.party for v in votes},
                         {'federal-senate-1': 'Labor', 'federal-senate-2': 'Greens'})
        self.assertEqual(self.db.execute('SELECT party FROM members').fetchone()[0], 'Greens')

    def test_reviewer_complete_labor_detail_beats_undated_greens_for_already_fetched_vote(self):
        self.db.execute('INSERT INTO division_votes_fetched VALUES (2)')
        raw = detail(2, '2026-09-17', 'Australian Labor Party')
        self.assertTrue(T.complete_detail(raw, 2))
        (self.cache / '2.json').write_text(json.dumps(raw))
        _, votes = read_legacy(self.db, '2026-09-17', None)
        self.assertEqual(votes[0].party, 'Labor')

    def test_per_vote_party_precedes_member_party(self):
        raw = detail(2, '2026-09-17', 'Greens'); raw['votes'][0]['party'] = 'ALP'
        T.store_detail(self.db, 2, raw, {'1'})
        self.assertEqual(read_legacy(self.db, '2026-09-17', None)[1][0].party, 'Labor')

    def test_omitted_party_uses_only_membership_evidence_on_division_date(self):
        self.db.executemany('INSERT INTO speeches VALUES (?,?,?,?)',
                            [('1', '2026-08-20', 'Labor', 'federal'), ('1', '2026-09-17', 'Independent', 'federal')])
        parties = {v.division_id: v.party for v in read_legacy(self.db, None, None)[1]}
        self.assertEqual(parties, {'federal-senate-1': 'Labor', 'federal-senate-2': 'Independent'})
        self.db.execute("DELETE FROM speeches WHERE date='2026-09-17'")
        self.assertIsNone(read_legacy(self.db, '2026-09-17', None)[1][0].party)

    def test_conflicting_or_later_membership_and_wrong_cached_date_never_supply_party(self):
        self.db.executemany('INSERT INTO speeches VALUES (?,?,?,?)',
                            [('1', '2026-09-17', 'Labor', 'federal'), ('1', '2026-09-17', 'Greens', 'federal'),
                             ('1', '2026-09-18', 'Liberal', 'federal')])
        (self.cache / '1.json').write_text(json.dumps(detail(1, '2026-09-17', 'Greens')))
        self.assertTrue(all(v.party is None for v in read_legacy(self.db, None, None)[1]))


class BillLinkTests(unittest.TestCase):
    def setUp(self):
        self.db = fixture(); self.addCleanup(self.db.close)
        self.db.executescript('''
          CREATE TABLE bills_v2 (bill_key TEXT, jurisdiction TEXT, source_id TEXT);
          CREATE TABLE bill_sources (bill_key TEXT, kind TEXT, source_id TEXT, url TEXT);
          CREATE TABLE ext_divisions (id TEXT, jurisdiction TEXT);
          INSERT INTO bills_v2 VALUES ('au-federal-r7512','federal','legislation/billhome/r7512');
          INSERT INTO bills_v2 VALUES ('same-title-no-evidence','federal',NULL);
          INSERT INTO ext_divisions VALUES ('federal-senate-2','federal');
          INSERT INTO division_bills VALUES (2,123,'r7512','Misleading title','http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id:legislation/billhome/r7512');
        ''')

    def test_exact_reference_adds_published_bill_link_before_export_and_is_idempotent(self):
        self.assertEqual(project(self.db, '2026-08-20'), 1)
        row = self.db.execute('SELECT * FROM bill_links').fetchone()
        self.assertEqual((row['bill_key'], row['target_key'], row['rule']),
                         ('au-federal-r7512', 'federal-senate-2', 'tvfy-official-id'))
        self.assertEqual(json.loads(row['evidence_json'])['tvfy_bill_id'], 123)
        self.assertEqual(project(self.db), 0)

    def test_url_only_ref_and_conflicting_or_ambiguous_refs(self):
        self.assertEqual(official_ref('https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r7512'), 'r7512')
        self.db.execute("UPDATE division_bills SET official_id='unknown'")
        self.assertEqual(len(plan_links(self.db)), 1)
        self.db.execute("UPDATE division_bills SET official_id='s1511'")
        self.assertEqual(plan_links(self.db), [])
        self.db.execute("UPDATE division_bills SET official_id='r7512'")
        self.db.execute("INSERT INTO bills_v2 VALUES ('duplicate','federal','legislation/billhome/r7512')")
        self.assertEqual(plan_links(self.db), [])

    def test_title_alone_external_url_and_unprojected_division_never_create_links(self):
        self.db.execute("UPDATE division_bills SET official_id='unknown',url='https://example.test/r7512'")
        self.assertEqual(project(self.db), 0)
        self.db.execute("UPDATE division_bills SET official_id='r7512'")
        self.db.execute('DELETE FROM ext_divisions')
        self.assertEqual(project(self.db), 0)

    def test_audited_wrong_links_are_never_overwritten(self):
        project(self.db)
        self.db.execute("UPDATE bill_links SET audited='wrong',rule='reviewed'")
        self.assertEqual(project(self.db), 0)
        self.assertEqual(self.db.execute('SELECT rule,audited FROM bill_links').fetchone()[:], ('reviewed', 'wrong'))

    def test_nightly_division_projection_precedes_full_bills_export(self):
        root = Path(__file__).resolve().parents[1]
        nightly = (root / 'scripts/vm/nightly.sh').read_text()
        self.assertLess(nightly.index('\ndivisions_refresh\n'), nightly.index('\nbills_refresh\n'))
        wrapper = (root / 'scripts/refresh_bills.sh').read_text()
        self.assertLess(wrapper.index('bills_fetch.py'), wrapper.index('parli.ingest.tvfy_bill_links'))
        self.assertLess(wrapper.index('parli.ingest.tvfy_bill_links'), wrapper.index('scripts/export_bills.py --out'))


class MobileDecoderTests(unittest.TestCase):
    def test_published_asset_satisfies_pinned_real_decoder(self):
        validate_votes(json.loads((Path(__file__).resolve().parents[1] / 'portal/public/votes.json').read_text()))

    def test_every_required_field_is_required_and_nested_violations_are_refused(self):
        good = mobile(); good['1']['for'] = [{'name': 'Example Bill', 'stage': '', 'date': '2026-08-20'}]
        for container in ('record', 'meta', 'sample', 'root'):
            fields = list(good['1']) if container == 'record' else list(good['_meta']) if container == 'meta' \
                else ['name', 'stage', 'date'] if container == 'sample' else ['_names', '_meta']
            for field in fields:
                bad = deepcopy(good)
                parent = bad['1'] if container == 'record' else bad['_meta'] if container == 'meta' \
                    else bad['1']['for'][0] if container == 'sample' else bad
                del parent[field]
                with self.subTest(container=container, field=field), self.assertRaises(ValueError): validate_votes(bad)
        for field, value in [('name', 3), ('party', []), ('jurisdiction', ''), ('house', None),
                             ('ayes', True), ('noes', -1), ('divisions_total', 1.5), ('years', [None]),
                             ('for', [None]), ('against', {})]:
            bad = deepcopy(good); bad['1'][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError): validate_votes(bad)
        for sample in [{'name': 'Bill', 'stage': None, 'date': '2026-08-20'},
                       {'name': 'Bill', 'stage': '', 'date': '2026-02-30'},
                       {'name': 'Bill', 'stage': '', 'date': '2026-08-20', 'rebels': True}]:
            bad = deepcopy(good); bad['1']['against'] = [sample]
            with self.subTest(sample=sample), self.assertRaises(ValueError): validate_votes(bad)

    def test_name_bridge_ids_dates_schema_and_nullability(self):
        good = mobile(); good['1']['party'] = None; good['_meta']['latest_division_date'] = None
        good['_meta']['latest_division_date_by_jurisdiction']['federal'] = None
        validate_votes(good)
        for names in (None, [], {'alex': '1'}, {'alex': [1]}, {'alex': ['999']}, {'': ['1']}):
            bad = deepcopy(good); bad['_names'] = names
            with self.subTest(names=names), self.assertRaises(ValueError): validate_votes(bad)
        for schema in (True, '1', 2):
            bad = deepcopy(good); bad['_meta']['schema'] = schema
            with self.subTest(schema=schema), self.assertRaises(ValueError): validate_votes(bad)
        bad = deepcopy(good); bad['_meta']['content_changed_at'] = '2026-08-20T23:00:00-12:00'
        with self.assertRaises(ValueError): validate_votes(bad)
