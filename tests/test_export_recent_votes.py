"""Worker-only recorded votes never change the installed apps' schema-1 asset."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import export_recent_votes as R


class RecentVotesTests(unittest.TestCase):
    def fixture(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript('''
        CREATE TABLE ext_divisions (id TEXT, name TEXT, question TEXT, date TEXT, source_url TEXT, jurisdiction TEXT);
        CREATE TABLE ext_votes (jurisdiction TEXT, person_id TEXT, person_key TEXT, person_name TEXT, division_id TEXT, vote TEXT);
        ''')
        for i in range(1, 13):
            db.execute('INSERT INTO ext_divisions VALUES (?,?,?,?,?,?)',
                       (f'federal-senate-{i}', f'Procedural question {i}', 'Question', '2026-09-01', f'https://example.test/{i}', 'federal'))
            db.execute('INSERT INTO ext_votes VALUES (?,?,?,?,?,?)',
                       ('federal', '123', 'Alex Example', 'Alex Example', f'federal-senate-{i}', 'no'))
        return db

    def identities(self):
        return {'_meta': {'schema': 1}, '123': {'name': 'Alex Example', 'jurisdiction': 'federal', 'for': [], 'against': []}}

    def test_actual_procedural_votes_bounded_to_ten_in_separate_schema(self):
        identities = self.identities()
        data = R.projection(self.fixture(), identities)
        rows = data['people']['123']['recent']
        self.assertEqual(data['_meta']['source'], 'opax-parli-db')
        self.assertEqual(data['_meta']['coverage'], 'recorded')
        self.assertEqual([r['division_id'] for r in rows], [f'federal-senate-{i}' for i in range(12, 2, -1)])
        self.assertTrue(all(r['vote'] == 'no' for r in rows))
        self.assertEqual(rows[0]['division_slug'], 'division-federal-senate-12')
        self.assertEqual(rows[0]['source_url'], 'https://example.test/12')
        self.assertEqual(identities, self.identities())

    def test_id_collision_does_not_attach_another_person(self):
        identities = self.identities(); identities['123']['name'] = 'Another Member'
        self.assertEqual(R.projection(self.fixture(), identities)['people'], {})

    def test_scoped_federal_id_resolves_even_when_names_are_ambiguous(self):
        db = self.fixture()
        db.execute("UPDATE ext_votes SET person_id='tvfy_123'")
        identities = self.identities()
        identities['456'] = dict(identities['123'])
        self.assertEqual(len(R.projection(db, identities)['people']['123']['recent']), 10)

    def test_unknown_source_or_date_and_conflicting_votes_are_omitted(self):
        db = self.fixture()
        db.execute("UPDATE ext_divisions SET source_url=NULL WHERE id='federal-senate-12'")
        db.execute("UPDATE ext_divisions SET date=NULL WHERE id='federal-senate-11'")
        db.execute("INSERT INTO ext_votes VALUES ('federal','123','Alex Example','Alex Example','federal-senate-10','aye')")
        rows = R.projection(db, self.identities())['people']['123']['recent']
        self.assertEqual(len(rows), 9)
        self.assertEqual(rows[0]['division_id'], 'federal-senate-9')

    def test_missing_source_columns_fail_without_publishing(self):
        with sqlite3.connect(':memory:') as db:
            with self.assertRaisesRegex(ValueError, 'tables unavailable'):
                R.projection(db, self.identities())

    def test_write_refuses_shrink_or_older_snapshot_byte_for_byte(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'seo/recent-votes.json'
            data = R.projection(self.fixture(), self.identities())
            R.write_projection(data, out)
            original = out.read_bytes()
            R.write_projection(data, out)
            self.assertEqual(out.read_bytes(), original)
            data['people']['123']['recent'].pop()
            with self.assertRaisesRegex(ValueError, 'coverage regressed'):
                R.write_projection(data, out)
            self.assertEqual(out.read_bytes(), original)

    def test_committed_separate_asset_has_no_hand_picked_sample(self):
        data = json.loads((ROOT / 'portal/public/seo/recent-votes.json').read_text())
        self.assertEqual(data['people'], {})
        self.assertEqual(data['_meta']['coverage'], 'unavailable')
        self.assertEqual(json.loads((ROOT / 'portal/public/votes.json').read_text())['_meta']['schema'], 1)

    def test_equal_count_same_day_regression_is_refused_but_new_window_can_advance(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'recent.json'
            db = self.fixture(); original = R.projection(db, self.identities())
            R.write_projection(original, out); before = out.read_bytes()
            db.execute("DELETE FROM ext_votes WHERE division_id='federal-senate-12'")
            with self.assertRaisesRegex(ValueError, 'coverage regressed'):
                R.write_projection(R.projection(db, self.identities()), out)
            self.assertEqual(out.read_bytes(), before)
            db.execute("INSERT INTO ext_votes VALUES ('federal','123','Alex Example','Alex Example','federal-senate-12','no')")
            db.execute("INSERT INTO ext_divisions VALUES ('federal-senate-13','Newest question','Question','2026-09-01','https://example.test/13','federal')")
            db.execute("INSERT INTO ext_votes VALUES ('federal','123','Alex Example','Alex Example','federal-senate-13','aye')")
            R.write_projection(R.projection(db, self.identities()), out)
            self.assertEqual(json.loads(out.read_bytes())['people']['123']['recent'][0]['division_id'], 'federal-senate-13')


if __name__ == '__main__':
    unittest.main()
