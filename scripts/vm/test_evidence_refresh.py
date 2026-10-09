"""Evidence cadence, retention and shell failure tests using only fixture git data."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

from scripts.vm import evidence_guard as guard

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'tests/fixtures/evidence-nightly'
spec = importlib.util.spec_from_file_location('evidence_seed', FIXTURES / 'seed.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

DRIVER = '''
set -uo pipefail
PY=$(command -v python3)
PIPE="$HOME/.cache/autoresearch/pipeline"
RESULT_SUMMARY=""
log() { echo "$*"; }
fail() { echo "FAIL: $*"; }
run() { "$@"; }
revert() {
  EVIDENCE_REFRESH_OK=0
  git checkout -q HEAD -- "$@"
  git clean -fdq -- "$@"
}
revert_group() { revert portal/public/evidence; }
group_changed() { [ -n "$(git status --porcelain -- portal/public/evidence)" ]; }
. scripts/vm/evidence_refresh.sh
trap evidence_abort EXIT
evidence_refresh || true
if [ "${EVIDENCE_TEST_ROLLBACK:-0}" = 1 ]; then revert_group evidence; fi
evidence_summary
if [ "${EVIDENCE_TEST_COMMIT_FAIL:-0}" = 1 ]; then exit 1; fi
git add -A -- portal/public/evidence
git -c commit.gpgsign=false commit -q --allow-empty -m accepted || exit 1
evidence_refresh_complete
'''


def change_stats(files, **changes):
    index = json.loads(files['index.json'])
    index['meta'].update(changes)
    files['index.json'] = json.dumps(index).encode()
    files['stats.json'] = json.dumps(index['meta']).encode()


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        fixture.seed(self.tmp.name)
        self.head = guard.read_tree(Path(self.tmp.name))

    def test_weekly_and_catchup(self):
        for day, expected in (('2026-10-10', 'skip'), ('2026-10-11', 'weekly'),
                              ('2026-10-12', 'skip'), ('2027-01-03', 'weekly')):
            self.assertEqual(guard.cadence(day), expected)
            self.assertEqual(guard.cadence(day, True), 'catch-up')
        with self.assertRaises(ValueError):
            guard.cadence('invalid', True)

    def test_complete_unchanged_tree(self):
        self.assertEqual(guard.compare(self.head, self.head),
                         'evidence: 0 changed shards, 0 records with text changed, 0 cleaned fields')

    def test_ids_cannot_disappear_even_when_total_counts_are_kept(self):
        new = copy.deepcopy(self.head)
        doc = json.loads(new['aa.json'])
        next(iter(doc['entries'].values()))['excerpts'] = []
        new['aa.json'] = json.dumps(doc).encode()
        with self.assertRaisesRegex(ValueError, 'IDs vanished.*1 excerpts'):
            guard.compare(self.head, new)

    def test_lookup_shards_exactly_at_and_below_98_percent(self):
        head = copy.deepcopy(self.head)
        for i in range(48):
            head[f'lookup/{i:02x}.json'] = head['lookup/aa.json']
        # aa/bb plus 48 shards: one removal is exactly 2%, two exceed it.
        new = copy.deepcopy(head)
        del new['lookup/00.json']
        guard.compare(head, new)
        del new['lookup/01.json']
        with self.assertRaisesRegex(ValueError, 'lookup shards shrank beyond 2%'):
            guard.compare(head, new)

    def test_record_counts_exactly_at_and_below_98_percent(self):
        for records, accepted in ((96, True), (95, False)):
            new = copy.deepcopy(self.head)
            doc = json.loads(new['aa.json'])
            entry = next(iter(doc['entries'].values()))
            entry['records'] = records
            entry['years']['2026'] = entry['source_kinds']['Parliamentary record'] = records
            new['aa.json'] = json.dumps(doc, ensure_ascii=False).encode()
            index = json.loads(new['index.json'])
            index['entities'][0]['records'] = records
            new['index.json'] = json.dumps(index).encode()
            change_stats(new, published_record_matches=records + 100)
            if accepted:
                guard.compare(self.head, new)
            else:
                with self.assertRaisesRegex(ValueError, 'record count shrank beyond 2%'):
                    guard.compare(self.head, new)

    def test_fixed_budget_and_head_budget_both_apply(self):
        with mock.patch.object(guard, 'MAX_BYTES', sum(map(len, self.head.values())) - 1):
            with self.assertRaisesRegex(ValueError, 'asset budget exceeded'):
                guard.compare(self.head, self.head)
        new = copy.deepcopy(self.head)
        new['identity-links.json'] += b' '  # valid JSON; one byte over HEAD.
        with self.assertRaisesRegex(ValueError, 'asset budget exceeded'):
            guard.compare(self.head, new)

    def test_invalid_mirrors_totals_and_lookup_ids_are_refused(self):
        for mode in ('mirror', 'totals', 'lookup', 'duplicate', 'unexpected'):
            new = copy.deepcopy(self.head)
            if mode == 'totals':
                change_stats(new, published_record_matches=201)
            elif mode == 'lookup':
                new['lookup/aa.json'] = b'{"bad":["missing"]}'
            elif mode == 'unexpected':
                new['extra.txt'] = b'no'
            else:
                doc = json.loads(new['aa.json'])
                entry = next(iter(doc['entries'].values()))
                if mode == 'mirror':
                    entry['excerpts'][0]['details']['excerpt'] = 'different'
                else:
                    entry['excerpts'] *= 2
                new['aa.json'] = json.dumps(doc).encode()
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                guard.compare(self.head, new)

    def test_symlink_is_refused(self):
        (Path(self.tmp.name) / 'cc.json').symlink_to(Path(self.tmp.name) / 'aa.json')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            guard.read_tree(Path(self.tmp.name))

    def test_ambiguous_lookup_keeps_unpublished_candidates(self):
        files = copy.deepcopy(self.head)
        lookup = json.loads(files['lookup/aa.json'])
        lookup['fixture 1'].append('cc' + '0' * 22)
        files['lookup/aa.json'] = json.dumps(lookup).encode()
        guard.projection(files)


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.repo = self.base / 'repo'
        self.repo.mkdir()
        self.home = self.base / 'fixture-home'
        self.pipe = self.home / '.cache/autoresearch/pipeline'
        self.pipe.mkdir(parents=True)
        for name in ('scripts/vm/evidence_refresh.sh', 'scripts/vm/evidence_guard.py',
                     'scripts/vm/keep_if_unchanged.py'):
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, path)
        for src, dest in (('export_stub.py', 'export_evidence_layers.py'), ('audit_stub.py', 'audit_evidence_export.py')):
            shutil.copyfile(FIXTURES / src, self.repo / 'scripts' / dest)
        fixture.seed(self.repo / guard.EVIDENCE)
        self.env = dict(os.environ, HOME=str(self.home), OPAX_TODAY='2026-10-10',
                        OPAX_EVIDENCE_TIMEOUT='10s', OPAX_SYNC_KB='1',
                        GIT_AUTHOR_NAME='Fixture', GIT_AUTHOR_EMAIL='fixture@example.invalid',
                        GIT_COMMITTER_NAME='Fixture', GIT_COMMITTER_EMAIL='fixture@example.invalid')
        for key in ('SOURCE', 'LAYERS', 'PLACES', 'DECISIONS', 'ADDITIONAL'):
            path = self.base / (key.lower() + '.sqlite')
            path.touch()
            self.env['OPAX_EVIDENCE_' + key] = str(path)
        self.git('init', '-q')
        self.git('add', '-A')
        self.git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture')

    def git(self, *args):
        result = subprocess.run(['git', *args], cwd=self.repo, env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, 'fixture git operation failed')
        return result.stdout

    @property
    def pending(self):
        return self.pipe / 'evidence-refresh-v1.pending'

    def run_refresh(self, mode='stamps', **env):
        result = subprocess.run(['bash', '-c', DRIVER], cwd=self.repo,
                                env=dict(self.env, EVIDENCE_TEST_MODE=mode, **env), capture_output=True, text=True)
        self.assertEqual(result.returncode, 1 if env.get('EVIDENCE_TEST_COMMIT_FAIL') else 0,
                         result.stdout + result.stderr)
        return result.stdout + result.stderr

    def test_catchup_then_weekday_skip_then_sunday(self):
        result = self.run_refresh('ok')
        self.assertIn('evidence export (catch-up)', result)
        self.assertIn('1 changed shards, 1 records with text changed, 2 cleaned fields', result)
        self.assertFalse(self.pending.exists())
        self.assertTrue((self.pipe / 'evidence-refresh-v1.initialized').exists())
        calls = self.home / 'evidence.calls'
        self.assertEqual(calls.read_text(), 'export\naudit\n')
        calls.unlink()
        self.run_refresh(OPAX_TODAY='2026-10-12')
        self.assertFalse(calls.exists())
        self.assertIn('evidence export (weekly)', self.run_refresh(OPAX_TODAY='2026-10-11'))
        self.assertEqual(calls.read_text(), 'export\naudit\n')

    def test_stamp_only_export_keeps_head_bytes_despite_longer_timestamp(self):
        before = guard.read_tree(self.repo / guard.EVIDENCE)
        result = self.run_refresh()
        self.assertIn('0 changed shards', result)
        self.assertEqual(guard.read_tree(self.repo / guard.EVIDENCE), before)
        self.assertFalse(self.pending.exists())

    def test_export_audit_retention_budget_and_partial_install_failures_restore_head(self):
        before = guard.read_tree(self.repo / guard.EVIDENCE)
        for mode in ('export_fail', 'audit_fail', 'partial_failure', 'record_shrink', 'shard_shrink',
                     'entity_vanish', 'excerpt_vanish', 'budget', 'incomplete', 'malformed', 'timeout'):
            with self.subTest(mode=mode):
                result = self.run_refresh(mode, OPAX_EVIDENCE_TIMEOUT='0.2s' if mode == 'timeout' else '10s')
                self.assertIn('evidence reverted to HEAD', result)
                self.assertIn('0 cleaned fields', result)
                self.assertEqual(guard.read_tree(self.repo / guard.EVIDENCE), before)
                self.assertTrue(self.pending.exists())
                self.assertFalse(list(self.pipe.glob('evidence-stage.*')))
                self.assertEqual(self.git('status', '--porcelain', '--', guard.EVIDENCE), '')

    def test_missing_inputs_refuse_before_export(self):
        Path(self.env['OPAX_EVIDENCE_PLACES']).unlink()
        self.assertIn('sidecars missing', self.run_refresh('ok'))
        self.assertTrue(self.pending.exists())
        self.assertFalse((self.home / 'evidence.calls').exists())

    def test_publish_only_and_periodic_skip_retain_catchup(self):
        self.pending.touch()
        for switch in ('OPAX_NIGHTLY_SKIP_REFRESH', 'OPAX_NIGHTLY_SKIP_PERIODIC'):
            self.run_refresh('ok', **{switch: '1'})
            self.assertTrue(self.pending.exists())
            self.assertFalse((self.home / 'evidence.calls').exists())

    def test_rollback_and_failed_commit_retry_catchup(self):
        before = guard.read_tree(self.repo / guard.EVIDENCE)
        self.run_refresh('ok', EVIDENCE_TEST_ROLLBACK='1')
        self.assertEqual(guard.read_tree(self.repo / guard.EVIDENCE), before)
        self.assertTrue(self.pending.exists())
        self.run_refresh('ok', EVIDENCE_TEST_COMMIT_FAIL='1')
        self.assertEqual(guard.read_tree(self.repo / guard.EVIDENCE), before)
        self.assertTrue(self.pending.exists())
        self.run_refresh('ok')
        self.assertFalse(self.pending.exists())

    def test_exact_record_threshold_is_accepted(self):
        result = self.run_refresh('at_threshold')
        self.assertNotIn('FAIL:', result)
        self.assertFalse(self.pending.exists())


if __name__ == '__main__':
    unittest.main()
