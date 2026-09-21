import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('recent_grants', ROOT / 'scripts/publish_recent_grants.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class RecentGrantTests(unittest.TestCase):
    def row(self):
        return {'source': 'grantconnect', 'ga_id': 'GA123456', 'activity': 'Community project',
                'agency': 'Example agency', 'recipient_name': 'Example recipient',
                'publish_date': '2026-09-07', 'value': 12500.75, 'aggregate': 1}

    def test_preserves_amount_identity_and_award_stage(self):
        row = self.row()
        body = publisher.resource_body(row)
        self.assertEqual(body['extra']['metadata']['source_fields'], row)
        self.assertEqual(body['extra']['metadata']['stage'], 'award')
        self.assertEqual(body['extra']['metadata']['value_aud'], 12500.75)
        self.assertEqual(body['slug'], 'grantconnect-award-ga123456')
        text = body['texts']['body']['body']
        self.assertIn('AUD 12,500.75', text)
        self.assertIn('not evidence that money has been paid', text)
        self.assertIn('aggregate award', text)
        self.assertIn('does not establish the delivery location', text)

    def test_rejects_invalid_identity_date_and_amount(self):
        for override in ({'ga_id': '../secret'}, {'publish_date': '2999-01-01'},
                         {'value': float('nan')}, {'value': -2}, {'source': 'unverified'}):
            with self.assertRaises(ValueError):
                publisher.resource_body({**self.row(), **override})


if __name__ == '__main__':
    unittest.main()
