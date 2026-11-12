#!/usr/bin/env python3
"""Check that resumed device evidence produces accurate per-journey results."""
import importlib.util
import json
from pathlib import Path
import os
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('android_results', Path(__file__).with_name('android-parity-results.py'))
results = importlib.util.module_from_spec(spec)
spec.loader.exec_module(results)


class ResultsTests(unittest.TestCase):
    def test_resume_overrides_old_failures_and_offline_setup_is_not_an_app_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prepared = root/'prepared'; prepared.mkdir()
            (prepared/'suite.json').write_text(json.dumps([
                {'shared': name, 'path': name, 'category': 'prepared variant', 'run': True, 'reason': ''}
                for name in ['02-search.yaml', '04-offline.yaml', '12-search.yaml']
            ]))
            old = root/'old'; old.mkdir()
            (old/'flow-results.tsv').write_text('.maestro/02-search.yaml\t34\t1\n')
            new = root/'new'; new.mkdir()
            (new/'flow-results.tsv').write_text('.maestro/02-search.yaml\t34\t0\n.maestro/android/offline-warmup.yaml\t34\t1\n')
            (new/'offline-warmup-report.xml').write_text('<testsuite><testcase><failure>Missing offline badge during warmup</failure></testcase></testsuite>')
            hierarchy = new/'maestro/offline-warmup/run/with spaces/screen-hierarchy/step.json'
            hierarchy.parent.mkdir(parents=True); hierarchy.write_text('{}')
            os.utime(old/'flow-results.tsv', (1, 1)); os.utime(new/'flow-results.tsv', (2, 2))
            body = results.index(root, prepared)
            self.assertIn('| 02-search.yaml | PASS |', body)
            self.assertIn('| 04-offline.yaml | HARNESS ERROR', body)
            self.assertIn('Offline setup failed before the journey: Missing offline badge', body)
            self.assertIn('[hierarchy](<new/maestro/offline-warmup/run/with spaces/screen-hierarchy/step.json>)', body)
            self.assertIn('API 34: PASS: 1, FAIL: 0, HARNESS ERROR: 1, NOT RUN: 1.', body)
            resumed = root/'resumed'; resumed.mkdir()
            (resumed/'flow-results.tsv').write_text('.maestro/04-offline.yaml\t34\t0\n')
            os.utime(resumed/'flow-results.tsv', (3, 3))
            self.assertIn('| 04-offline.yaml | PASS |', results.index(root, prepared))

    def test_no_report_is_a_harness_error_and_build_dependencies_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'suite.json').write_text(json.dumps([{'shared': '01-launch.yaml', 'path': '01-launch.yaml', 'category': 'prepared variant', 'run': True, 'reason': ''}]))
            (root/'flow-results.tsv').write_text('.maestro/01-launch.yaml\t36\t1\n')
            for name in ('node_modules', 'shell-source'):
                folder = root/name; folder.mkdir()
                (folder/'flow-results.tsv').write_text('This is not journey evidence\n')
            body = results.index(root, root)
            self.assertIn('HARNESS ERROR; Harness failed before a flow report', body)
            self.assertIn('API 36: PASS: 0, FAIL: 0, HARNESS ERROR: 1, NOT RUN: 0.', body)


if __name__ == '__main__':
    unittest.main()
