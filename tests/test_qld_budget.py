"""Offline access/hold gates. CSV parsing awaits accessible official originals."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.qld_budget import acquire as source
from scripts.qld_budget.check import check


class QueenslandBudgetAccessTests(unittest.TestCase):
    def test_held_inventory_has_no_public_consumers_or_computed_totals(self):
        result = check()
        self.assertEqual(result['rows_staged'], 0)
        self.assertEqual(result['public_computed_totals'], 0)

    def test_robots_wildcards_hold_attachment_redirects(self):
        policy = 'User-agent: *\nDisallow: /api/\nDisallow: /ckan-*-attachments-*/\nCrawl-delay: 10\n'
        self.assertFalse(source.robots_allowed(policy, source.BASE + '/ckan-opendata-attachments-prod/resources/example.csv?ETag=example'))
        self.assertFalse(source.robots_allowed(policy, source.BASE + '/api/3/action/datastore_search'))
        self.assertTrue(source.robots_allowed(policy, source.BASE + '/dataset/' + source.DATASETS[0]))

    def test_specific_agent_and_longest_allow(self):
        policy = 'User-agent: *\nDisallow: /\nUser-agent: OPAXBot\nDisallow: /blocked/\nAllow: /blocked/exact.csv$\n'
        self.assertTrue(source.robots_allowed(policy, source.BASE + '/blocked/exact.csv'))
        self.assertFalse(source.robots_allowed(policy, source.BASE + '/blocked/exact.csv/other'))

    def test_refusal_and_challenge_stop_host_but_redirect_does_not(self):
        for status in (403, None):
            self.assertTrue(source.host_stopped({'stopped': True, 'status': status}))
        self.assertFalse(source.host_stopped({'stopped': True, 'status': 302}))
        self.assertTrue(source.host_stopped({'stopped': True, 'status': 302, 'challenge': True}))
        self.assertTrue(source.host_stopped({'stopped': True, 'status': 302, 'error': 'connection-error-or-timeout'}))

    def test_redirect_handler_never_follows(self):
        self.assertIsNone(source.NoRedirect().redirect_request(None, None, 302, '', {}, source.BASE + '/ckan-example-attachments-prod/file.csv'))

    def test_stopped_host_cannot_issue_another_request(self):
        with tempfile.TemporaryDirectory(prefix='opax-qld-held-') as scratch:
            root = Path(scratch)
            (root / 'receipts.json').write_text(json.dumps([{'stopped': True, 'status': 403}]))
            with patch.object(source, 'STAGE', root), patch.object(source, 'CACHE', root / 'cache'), patch.object(source.request, 'build_opener') as transport:
                with self.assertRaisesRegex(ValueError, 'Host stopped'):
                    source.acquire(source.BASE + '/robots.txt', 'robots')
                transport.assert_not_called()

    def test_original_is_never_re_requested_after_302(self):
        with tempfile.TemporaryDirectory(prefix='opax-qld-once-') as scratch:
            root = Path(scratch)
            url = source.BASE + '/dataset/' + source.DATASETS[0]
            (root / 'receipts.json').write_text(json.dumps([{'url': url, 'stopped': True, 'status': 302}]))
            with patch.object(source, 'STAGE', root), patch.object(source, 'CACHE', root / 'cache'), patch.object(source.request, 'build_opener') as transport, patch('builtins.print'):
                source.acquire(url, 'dataset')
                transport.assert_not_called()


if __name__ == '__main__':
    unittest.main()
