import hashlib
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('collected', ROOT / 'scripts/publish_collected_bill_texts.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class CollectedPublicationTests(unittest.TestCase):
    def test_requires_no_generation_provider(self):
        schema = {'summary_model': {'options': [{'value': 'off', 'provider': 'none'}, {'value': 'paid', 'provider': 'openai'}]}}
        publisher.assert_no_generation({'summary_model': 'off'}, schema, {})
        for model in ('paid', 'unknown', None):
            with self.assertRaises(ValueError):
                publisher.assert_no_generation({'summary_model': model}, schema, {})
        for tasks in ({'running': [{}]}, {'configs': [{'enabled': True}]}):
            with self.assertRaises(ValueError):
                publisher.assert_no_generation({'summary_model': 'off'}, schema, tasks)

    def test_preserves_existing_enrichment_and_holds_changed_sources(self):
        meta = {'bill_key': 'au-federal-r1', 'version_id': 'r1-first', 'complete': True,
                'source_text_sha256': hashlib.sha256(b'Original').hexdigest()}
        body = {'slug': 'bill-text-au-federal-r1-first', 'extra': {'metadata': meta}}
        old = {'slug': body['slug'], 'extra': {'metadata': {**meta, 'codex_enrichment': {'brief': 'Preserved'}}},
               'data': {'texts': {'body': {'value': {'body': 'Original'}}}}}
        self.assertEqual(publisher.existing_outcome(old, body), 'existing')
        self.assertTrue(publisher.verify_original(old, body))
        old['data']['texts']['body']['value']['body'] = 'Changed'
        self.assertFalse(publisher.verify_original(old, body))
        old['extra']['metadata']['source_text_sha256'] = 'different'
        self.assertEqual(publisher.existing_outcome(old, body), 'held-source-mismatch')


if __name__ == '__main__':
    unittest.main()
