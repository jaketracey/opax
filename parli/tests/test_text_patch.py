import unittest
from unittest.mock import Mock, patch

from scripts.arag_patch_speakers import patch_one


class TextPatchTests(unittest.TestCase):
    def test_text_repair_preserves_existing_enrichments(self):
        kb = Mock()
        document = {
            'slug': 'speech-123', 'title': 'A speech', 'origin': {},
            'usermetadata': {'classifications': []}, 'extra': {},
            'texts': {'body': {'body': 'Clean speech.', 'format': 'PLAIN'}},
        }
        with patch('scripts.arag_patch_speakers.map_speech', return_value=document):
            self.assertEqual(patch_one(kb, {}, 'text:openaustralia_website_footer'), ('patched', None))
        kb.patch_resource_by_slug.assert_called_once_with('speech-123', {'texts': document['texts']})

    def test_speaker_repair_still_updates_metadata_without_text(self):
        kb = Mock()
        document = dict(slug='speech-123', title='Speaker', origin={}, usermetadata={}, extra={}, texts={})
        with patch('scripts.arag_patch_speakers.map_speech', return_value=document):
            patch_one(kb, {}, 'speaker')
        self.assertNotIn('texts', kb.patch_resource_by_slug.call_args.args[1])
