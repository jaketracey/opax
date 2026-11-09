#!/usr/bin/env python3
"""Watcher regressions with synthetic logs and children, never a simulator."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

WATCHER = Path(__file__).with_name('maestro-watch.py')
spec = importlib.util.spec_from_file_location('maestro_watch', WATCHER)
watch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(watch)
PROBE = ('[Failed] Perform XCUITest driver status check on simulator, '
         'exception: java.net.ConnectException: Connection refused')


class StartupTests(unittest.TestCase):
    def test_cli_preflight_plus_server_allowance_in_milliseconds(self):
        for env, expected in (({}, 360000),
                              ({'OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS': '235'}, 415000),
                              ({'OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS': '090'}, 270000),
                              ({'MAESTRO_DRIVER_STARTUP_TIMEOUT': '600000'}, 600000)):
            with self.subTest(env=env), patch.dict(os.environ, env, clear=True):
                self.assertEqual(watch.driver_startup_timeout_ms(), expected)
        for value in ('0', '-1', '1.5', 'seconds'):
            with self.subTest(value=value), patch.dict(
                    os.environ, MAESTRO_DRIVER_STARTUP_TIMEOUT=value):
                with self.assertRaisesRegex(ValueError, 'positive integer'):
                    watch.driver_startup_timeout_ms()

    def test_default_180_seconds_including_a_probe_after_60_seconds(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(watch.startup_timeout_seconds(), 180)
        allowance = watch.StartupAllowance(10, 180)
        self.assertTrue(allowance.allows(PROBE, 71))
        self.assertTrue(allowance.allows(PROBE, 189.99))
        self.assertFalse(allowance.allows(PROBE, 190))

    def test_configured_budget_and_invalid_input(self):
        with patch.dict(os.environ, OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS='240'):
            self.assertEqual(watch.startup_timeout_seconds(), 240)
        for value in ('0', '-1', '1.5', 'seconds', ''):
            with self.subTest(value=value), patch.dict(
                    os.environ, OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS=value):
                with self.assertRaisesRegex(ValueError, 'positive integer'):
                    watch.startup_timeout_seconds()

    def test_server_signal_anchors_readiness_instead_of_launch(self):
        allowance = watch.StartupAllowance(0, 180)
        allowance.observe('XCTest HTTP server started on port 9010', 175)
        self.assertTrue(allowance.allows(PROBE, 250))
        # Console and debug duplicates cannot keep extending the allowance.
        allowance.observe('HTTP server started on port 9010', 300)
        self.assertFalse(allowance.allows(PROBE, 355))

    def test_visible_native_preflight_does_not_spend_the_readiness_budget(self):
        allowance = watch.StartupAllowance(0, 180)
        allowance.observe("Test Suite 'SwipeRouteHandlerV2ClassificationTests' started.", 10, runner=True)
        self.assertTrue(allowance.allows(PROBE, 250))
        allowance.observe('[FlyingFox] starting server 127.0.0.1:9010', 300, runner=True)
        self.assertTrue(allowance.allows(PROBE, 479))
        self.assertFalse(allowance.allows(PROBE, 480))

    def test_maestro_210_flyingfox_server_signal_anchors_readiness(self):
        allowance = watch.StartupAllowance(0, 180)
        allowance.observe('maestro-driver-iosUITests-Runner[3610] [FlyingFox] starting server 127.0.0.1:9010', 175)
        self.assertTrue(allowance.allows(PROBE, 250))
        self.assertFalse(allowance.allows(PROBE, 355))

    def test_runner_logs_are_read_for_startup_but_never_transport_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('xctest_runner_2026.log', 'device-xctest.log', 'maestro.log', 'device-simulator.log'):
                (root / name).touch()
            sources = watch.log_sources(root / 'console.log', root)
            self.assertEqual(sources[:2], [(root / 'device-xctest.log', False),
                                          (root / 'xctest_runner_2026.log', False)])
            self.assertEqual(sources[2:], [(root / 'console.log', True), (root / 'maestro.log', True)])

    def test_connected_driver_gets_no_further_startup_allowance(self):
        allowance = watch.StartupAllowance(0, 180)
        allowance.observe('[Done] Perform XCUITest driver status check', 4)
        self.assertFalse(allowance.allows(PROBE, 5))

    def test_only_the_named_probe_is_allowed(self):
        allowance = watch.StartupAllowance(0, 180)
        self.assertFalse(allowance.allows('Connection reset by peer', 1))
        self.assertIsNotNone(watch.forbidden.search(PROBE + ' HTTP status 403'))


class WatcherProcessTests(unittest.TestCase):
    def run_child(self, source, seconds='30', driver_timeout=''):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            debug = root / 'debug'
            debug.mkdir()
            env = dict(os.environ, OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS='180',
                       MAESTRO_DRIVER_STARTUP_TIMEOUT=driver_timeout)
            result = subprocess.run(
                [sys.executable, str(WATCHER), str(root / 'console.log'),
                 str(debug), seconds, sys.executable, '-c', source, str(root)],
                env=env, capture_output=True, text=True, timeout=60,
            )
            console = (root / 'console.log').read_text()
            return result, console

    def test_direct_watcher_sets_the_cli_budget_and_preserves_override(self):
        for value, expected in (('', '360000'), ('600000', '600000')):
            result, console = self.run_child(
                'import os; print(os.environ["MAESTRO_DRIVER_STARTUP_TIMEOUT"])',
                driver_timeout=value,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(console.strip(), expected)

    def test_success_report_wins_over_post_flow_simulator_syslog(self):
        result, _ = self.run_child('''
from pathlib import Path
import sys, time
root = Path(sys.argv[1])
(root / 'report.xml').write_text('<testsuites><testsuite tests="1" failures="0"><testcase status="SUCCESS"/></testsuite></testsuites>')
(root / 'debug/device-simulator.log').write_text('swcd: Connection reset by peer\\nHTTP status 403\\n')
time.sleep(0.5)
''')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('Maestro driver failed', result.stderr)

    def test_success_report_does_not_hide_real_cli_failure(self):
        result, _ = self.run_child('''
from pathlib import Path
import sys
root = Path(sys.argv[1])
(root / 'report.xml').write_text('<testcase status="SUCCESS"/>')
(root / 'debug/device-simulator.log').write_text('swcd: Connection reset by peer\\n')
sys.exit(23)
''')
        self.assertEqual(result.returncode, 23, result.stderr)

    def test_runner_unit_test_transport_messages_are_not_flow_failures(self):
        result, _ = self.run_child('''
from pathlib import Path
import sys, time
root = Path(sys.argv[1])
(root / 'debug/xctest_runner_2026.log').write_text('testConnection: Connection reset by peer\\n[FlyingFox] starting server 127.0.0.1:9010\\n')
time.sleep(0.5)
''')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_preflight_without_a_server_is_still_bounded_overall(self):
        result, _ = self.run_child('''
from pathlib import Path
import sys, time
root = Path(sys.argv[1])
(root / 'debug/xctest_runner_2026.log').write_text("Test Suite 'ClassificationTests' started.\\n")
time.sleep(300)
''', seconds='1')
        self.assertEqual(result.returncode, 124, result.stderr)
        self.assertIn('Maestro exceeded 1s', result.stderr)

    def test_real_driver_debug_errors_still_fail(self):
        result, _ = self.run_child('''
from pathlib import Path
import sys, time
root = Path(sys.argv[1])
(root / 'debug/maestro.log').write_text('XCTest driver: Connection reset by peer\\n')
time.sleep(300)
''')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('Maestro driver failed', result.stderr)


if __name__ == '__main__':
    unittest.main()
