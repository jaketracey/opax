import sys
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import watch_bill_texts as watcher


def stopped(**updates):
    return {'LoadState': 'loaded', 'ActiveState': 'inactive', 'SubState': 'dead',
            'ExecMainStatus': '0', 'Result': 'success', 'Restart': 'no', 'Job': '',
            'ExecMainStartTimestampMonotonic': '123', **updates}


class WatchBillTextTest(unittest.TestCase):
    def test_stopping_starting_and_queued_units_are_not_completed(self):
        for state in watcher.BUSY_STATES:
            self.assertIsNone(watcher.completion_state(stopped(ActiveState=state)))
        self.assertIsNone(watcher.completion_state(stopped(Job='99')))
        self.assertIsNone(watcher.completion_state(stopped(Restart='always')))

    def test_source_refusal_and_signal_are_never_success(self):
        with self.assertRaises(watcher.SourcePaused):
            watcher.completion_state(stopped(ExecMainStatus='130', Result='exit-code', Restart='on-failure'))
        self.assertEqual(watcher.completion_state(stopped(Result='signal')), 1)
        with self.assertRaises(RuntimeError):
            watcher.completion_state(stopped(ExecMainStatus='1', Result='exit-code', Restart='on-failure'))
        self.assertEqual(watcher.completion_state(stopped(ExecMainStatus='2', Result='exit-code', Restart='on-failure', RestartPreventExitStatus='2 130')), 2)

    def test_missing_service_is_not_mistaken_for_success(self):
        with patch.object(watcher.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='LoadState=not-found\nActiveState=inactive\nExecMainStatus=0\n')):
            with self.assertRaises(RuntimeError):
                watcher.crawl_state('missing.service')
        with self.assertRaises(RuntimeError):
            watcher.completion_state(stopped(ExecMainStartTimestampMonotonic='0'))

    def test_final_publication_failure_cannot_write_completion_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            args = SimpleNamespace(state_dir=Path(directory), env='/tmp/test.env', crawl_unit='crawl.service', interval=30, finish_legacy=False)
            with patch.object(watcher, 'crawl_state', return_value=stopped()), patch.object(watcher.subprocess, 'run', side_effect=[SimpleNamespace(returncode=0), SimpleNamespace(returncode=1)]):
                self.assertEqual(watcher.watch(args), 1)
            self.assertFalse((args.state_dir / 'workflow-complete.json').exists())

    def test_legacy_runs_only_after_primary_stops_and_final_pass_closes_race(self):
        with tempfile.TemporaryDirectory() as directory:
            args = SimpleNamespace(state_dir=Path(directory), env='/tmp/test.env', crawl_unit='crawl.service', interval=30, finish_legacy=True)
            child = Mock()
            child.pid = 1234
            child.poll.return_value = 0
            with patch.object(watcher, 'crawl_state', side_effect=[stopped(ActiveState='active'), stopped()]), patch.object(watcher.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as publish, patch.object(watcher.subprocess, 'Popen', return_value=child) as start, patch.object(watcher.time, 'sleep'), patch.object(watcher, 'coverage_state', return_value={'bills': {'discovered': 1}, 'versions': {'complete': 1}}):
                self.assertEqual(watcher.watch(args), 0)
            self.assertEqual(publish.call_count, 3)
            start.assert_called_once()
            self.assertIn('finish-legacy', start.call_args.args[0])
            self.assertTrue((args.state_dir / 'workflow-complete.json').exists())
            child.terminate.assert_not_called()

    def test_finished_source_gaps_do_not_starve_legacy_or_claim_full_coverage(self):
        with tempfile.TemporaryDirectory() as directory:
            args = SimpleNamespace(state_dir=Path(directory), env='/tmp/test.env', crawl_unit='crawl.service', interval=30, finish_legacy=True)
            child = Mock(pid=1234)
            child.poll.return_value = 2
            gaps = {'bills': {'discovered': 9, 'unavailable': 1}, 'versions': {'complete': 8, 'incomplete': 1}, 'identities': {'resolved': 1, 'unresolved': 2, 'ambiguous': 0}}
            with patch.object(watcher, 'crawl_state', return_value=stopped(ExecMainStatus='2', Result='exit-code', Restart='on-failure', RestartPreventExitStatus='2 130')), patch.object(watcher.subprocess, 'run', return_value=SimpleNamespace(returncode=0)), patch.object(watcher.subprocess, 'Popen', return_value=child) as start, patch.object(watcher, 'coverage_state', return_value=gaps):
                self.assertEqual(watcher.watch(args), 0)
            start.assert_called_once()
            receipt = json.loads((args.state_dir / 'workflow-complete.json').read_text())
            self.assertEqual(receipt['status'], 'completed_with_gaps')
            self.assertEqual(receipt['crawler_exit'], 2)
            self.assertEqual(receipt['legacy_exit'], 2)
            self.assertEqual(receipt['counts'], gaps)


if __name__ == '__main__':
    unittest.main()
