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

    def test_schema_without_a_no_generation_provider_rejects_only_offered_generative_models(self):
        # The vendor's November 2026 schema: every summary model offered is generative, the legacy value is not listed.
        schema = {'summary_model': {'options': [{'value': 'gcp-claude-5-sonnet', 'provider': 'claude3'},
                                                {'value': 'openai-compatible', 'provider': 'openai_compat'}]}}
        publisher.assert_no_generation({'summary_model': 'generative-multilingual-2023'}, schema, {})
        for model in ('gcp-claude-5-sonnet', 'openai-compatible'):
            with self.assertRaises(ValueError):
                publisher.assert_no_generation({'summary_model': model}, schema, {})
        with self.assertRaises(ValueError):
            publisher.assert_no_generation({'summary_model': 'generative-multilingual-2023'}, schema, {'configs': [{'enabled': True}]})

    def test_behavioural_proof_reads_the_newest_resources_for_processing_summaries(self):
        class Kb:
            _headers = {}
            def _rag(self, path): return 'https://kb.test' + path
        def resource(summary):
            return {'data': {'texts': {'body': {'extracted': {'metadata': {'metadata': {'summary': summary, 'language': 'en'}}}},
                                       'da-summary-t-body': {'extracted': {'metadata': {'metadata': {'summary': ''}}}}},
                             'generics': {'title': {}}}}
        calls = []
        def fake_request(method, url, headers, summaries={'r1': '', 'r2': ''}):
            calls.append(url)
            if '/catalog?' in url:
                self.assertIn('sort_field=created&sort_order=desc', url)
                return {'resources': {rid: {'slug': f'speech-{rid}'} for rid in summaries}}
            rid = url.split('/resource/')[1].split('?')[0]
            return resource(summaries[rid])
        original = publisher._request
        try:
            publisher._request = fake_request
            publisher.assert_no_generated_summaries(Kb(), newest=2)
            self.assertEqual(len(calls), 3)
            publisher._request = lambda m, u, h: fake_request(m, u, h, {'r1': '', 'r2': 'A generated summary.'})
            with self.assertRaisesRegex(ValueError, 'speech-r2'):
                publisher.assert_no_generated_summaries(Kb(), newest=2)
            publisher._request = lambda m, u, h: {'resources': {}}
            with self.assertRaises(ValueError):
                publisher.assert_no_generated_summaries(Kb())
        finally:
            publisher._request = original

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
