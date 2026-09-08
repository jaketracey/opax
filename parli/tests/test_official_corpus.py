"""News exclusion applies even to legacy callers and retry checkpoints."""
import unittest
from unittest.mock import patch
from parli.arag import AragConfig, KbClient
from parli.ingest.arag_sync import TABLES, retry_failed

class OfficialCorpusTests(unittest.TestCase):
    def test_legacy_news_writes_never_reach_network(self):
        kb = object.__new__(KbClient)
        for body in [
            {'slug':'news-123'},
            {'slug':'article-123', 'origin':{'source_id':'news'}},
            {'slug':'article-123', 'usermetadata':{'classifications':[{'labelset':'kind','label':'news'}]}},
        ]:
            with self.subTest(body=body), patch('parli.arag._request') as network:
                with self.assertRaisesRegex(ValueError, 'News articles are excluded'):
                    kb.create_resource(body)
                network.assert_not_called()

    def test_news_checkpoint_cannot_be_retried(self):
        self.assertNotIn('news_articles', TABLES)
        state={'tables':{'news_articles':{'failed':{'news-123':'503'}}}}
        with patch('parli.ingest.arag_sync._push_one') as push:
            retry_failed(None, None, state)
            push.assert_not_called()

if __name__ == '__main__': unittest.main()
