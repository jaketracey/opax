import copy
from datetime import datetime, timezone
import unittest

from scripts.refresh_watchdog import evaluate


class Watchdog(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 19, 6, tzinfo=timezone.utc)
        self.corpus = {'version': '2026-10-19', 'refresh': {'checked_at': '2026-10-19T00:00:00Z'}}
        self.status = {'status': 'ok', 'finished': '2026-10-19T00:00:00Z', 'warnings': [], 'paused_sources': {}}

    def test_current_delivery(self):
        problems, _, warnings = evaluate(self.corpus, self.status, self.now)
        self.assertEqual((problems, warnings), ([], []))

    def test_pauses_and_waiting_inputs_are_visible_without_inventing_fetch_failure(self):
        self.status.update(warnings=['evidence: waiting for inputs'], paused_sources={'bills': {'status': 'paused', 'host': 'parlinfo.aph.gov.au'}})
        problems, _, warnings = evaluate(self.corpus, self.status, self.now)
        self.assertEqual(problems, [])
        self.assertTrue(any('waiting for inputs' in item for item in warnings))
        self.assertTrue(any('bills (parlinfo.aph.gov.au)' in item for item in warnings))

    def test_stale_delivery_fails_even_when_last_run_says_ok(self):
        self.corpus['refresh']['checked_at'] = '2026-10-17T00:00:00Z'
        self.assertTrue(evaluate(self.corpus, self.status, self.now)[0])

    def test_failed_run_and_missing_timestamp_fail(self):
        self.status = {'status': 'failed', 'failures': ['export failed']}
        problems, _, _ = evaluate(self.corpus, self.status, self.now)
        self.assertTrue(any('finished' in item for item in problems))
        self.assertTrue(any('export failed' in item for item in problems))

    def test_manifest_pause_survives_an_omitted_status_receipt(self):
        original = copy.deepcopy(self.corpus)
        self.corpus['refresh']['source_access'] = {'sa': {'status': 'paused'}}
        self.assertTrue(evaluate(self.corpus, self.status, self.now)[2])
        self.assertEqual(original['refresh']['checked_at'], self.corpus['refresh']['checked_at'])

    def test_future_timestamp_is_not_healthy(self):
        self.status['finished'] = '2026-10-20T00:00:00Z'
        self.assertTrue(evaluate(self.corpus, self.status, self.now)[0])

    def test_periodic_retry_debt_and_corruption(self):
        self.status['periodic_state'] = {'groups': {'monthly': {'due': '2026-10-04', 'pending_since': '2026-10-04'}}}
        self.assertTrue(any('monthly (due 2026-10-04)' in item for item in evaluate(self.corpus, self.status, self.now)[2]))
        self.status['periodic_state'] = {'error': 'unreadable'}
        self.assertTrue(any('periodic' in item for item in evaluate(self.corpus, self.status, self.now)[0]))


if __name__ == '__main__':
    unittest.main()
