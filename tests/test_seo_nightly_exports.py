"""Run only the nightly SEO export block, with a throwaway OPAX DB and files.

No full nightly invocation, network calls, repository sync, push or deploy.
"""
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class NightlySEOTests(unittest.TestCase):
    def run_exports(self, missing_tables=False, skip=False):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        scripts = root / 'scripts'; scripts.mkdir()
        for name in ['export_division_pages.py', 'export_recent_votes.py', 'export_votes.py']:
            shutil.copyfile(ROOT / 'scripts' / name, scripts / name)
        public = root / 'portal/public'; (public / 'bills').mkdir(parents=True)
        (public / 'bills/example.json').write_text(json.dumps({'key': 'example', 'title': 'Example Bill', 'divisions': []}))
        votes = public / 'votes.json'
        votes.write_text(json.dumps({'_meta': {'schema': 1}, '123': {'name': 'Alex Example', 'jurisdiction': 'federal', 'for': [], 'against': []}}))
        original = votes.read_bytes()
        dbpath = root / 'fixture.db'
        with sqlite3.connect(dbpath) as db:
            if not missing_tables:
                db.executescript('''
                CREATE TABLE ext_divisions (id TEXT, name TEXT, question TEXT, date TEXT, house TEXT,
                 jurisdiction TEXT, ayes_count INT, noes_count INT, result TEXT, source_url TEXT);
                CREATE TABLE ext_votes (division_id TEXT, person_id TEXT, person_name TEXT, person_key TEXT,
                 vote TEXT, jurisdiction TEXT);
                INSERT INTO ext_divisions VALUES ('federal-senate-1','Example question','Question','2026-09-01',
                 'senate','federal',1,0,'affirmative','https://example.test/source');
                INSERT INTO ext_votes VALUES ('federal-senate-1','123','Alex Example','Alex Example','aye','federal');
                ''')
        nightly = (ROOT / 'scripts/vm/nightly.sh').read_text()
        block = nightly.split('# ---- 3b.')[1].split('# ---- 4.')[0]
        block = '# ---- 3b.' + block
        setup = '''set -u
        PY=python3
        log(){ :; }
        run(){ "$@"; }
        revert_group(){ echo "REVERT:$1"; }
        fail(){ echo "FAIL:$1"; }
        warn(){ echo "WARN:$1"; }
        '''
        result = subprocess.run(['bash'], input=setup + block, text=True, capture_output=True, cwd=root,
                                env={**os.environ, 'OPAX_DB': str(dbpath), 'OPAX_NIGHTLY_SKIP_REFRESH': '1' if skip else '0'})
        self.assertEqual(votes.read_bytes(), original)
        self.assertEqual(result.returncode, 0, result.stderr)
        return public, result.stdout

    def test_nightly_writes_both_separate_exports_and_leaves_mobile_bytes_untouched(self):
        public, output = self.run_exports()
        division = json.loads((public / 'divisions/division-federal-senate-1.json').read_text())
        self.assertEqual(division['members'][0]['name'], 'Alex Example')
        self.assertEqual(division['_meta']['member_coverage'], 'recorded')
        index = json.loads((public / 'divisions/index.json').read_text())
        self.assertEqual(index['coverage']['retained_count'], 0)
        recent = json.loads((public / 'seo/recent-votes.json').read_text())
        self.assertEqual(recent['_meta']['source'], 'opax-parli-db')
        self.assertEqual(recent['people']['123']['recent'][0]['vote'], 'aye')
        self.assertNotIn('FAIL:', output)

    def test_failed_exports_revert_their_independent_groups(self):
        public, output = self.run_exports(missing_tables=True)
        self.assertIn('REVERT:divisions', output)
        self.assertIn('REVERT:seovotes', output)
        self.assertFalse((public / 'divisions/index.json').exists())
        self.assertFalse((public / 'seo/recent-votes.json').exists())

    def test_publish_only_rerun_skips_database_exports(self):
        public, output = self.run_exports(skip=True)
        self.assertFalse((public / 'divisions').exists())
        self.assertFalse((public / 'seo').exists())
        self.assertEqual(output, '')

    def test_both_export_paths_are_validated_reverted_and_staged_as_data_groups(self):
        groups = (ROOT / 'scripts/vm/data_groups.sh').read_text()
        self.assertIn('[divisions]="portal/public/divisions"', groups)
        self.assertIn('[seovotes]="portal/public/seo/recent-votes.json"', groups)
        nightly = (ROOT / 'scripts/vm/nightly.sh').read_text()
        self.assertLess(nightly.index('# ---- 3b.'), nightly.index('# ---- 4.'))
        self.assertIn('git add -A -- "${DATA_PATHS[@]}"', nightly)


if __name__ == '__main__':
    unittest.main()
