import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from codex_enrichment_loop import summary_prompt, validate_payload
from summary_workers import fetch_item

class EnrichmentValidationTests(unittest.TestCase):
    def check(self, source, summary):
        return validate_payload('summaries', {'a': summary}, [{'rid': 'a', 'title': 'A speaker', 'text': source}])

    def test_short_question_does_not_need_padding(self):
        self.assertEqual(self.check('How is the department strengthening capability among staff following the capability review?',
            'Asked how the department was strengthening staff capability following the capability review.'), [])

    def test_unsupported_number_is_rejected(self):
        self.assertTrue(self.check('Staff capability was reviewed.', 'Reported that 27 staff had been appointed to improve departmental capability following the review.'))

    def test_percentage_is_not_confused_with_plain_number(self):
        self.assertTrue(self.check('27 applications were received.', 'Reported that 27% of applications were received by the department for assessment.'))

    def test_trailing_punctuation_does_not_change_number(self):
        self.assertEqual(self.check('There were 27 applications.', 'Reported that 27, including the applications under review, were received by the department.'), [])

    def test_shortened_year_range_is_rejected(self):
        self.assertTrue(self.check('The funding runs from 2026 to 2027.', 'Reported that funding would run during 2026-27 to support the program.'))

    def test_speaker_name_supported_by_source_is_allowed(self):
        self.assertEqual(self.check(
            'The motion appoints Anthony Carbines to the Standing Orders Committee.',
            'Moved that Anthony Carbines join the Standing Orders Committee under the proposed membership motion.'), [])

    def test_alphanumeric_model_number_is_supported(self):
        self.assertEqual(self.check(
            'The government was asked about parts for F-35s.',
            'Asked whether the government would continue supplying F-35 parts under the current arrangements.'), [])

    def test_release_prompt_uses_public_record_language(self):
        prompt = summary_prompt([{'rid': 'a', 'kind': 'press_release', 'text': 'A program was announced.'}])
        self.assertIn('Australian public record', prompt)
        self.assertIn('official government transcript or release', prompt)

    def test_summary_fetch_exposes_resource_kind(self):
        class FakeKb:
            def resource(self, _rid):
                return {
                    'slug': 'press-pmt-1',
                    'title': 'Program announced',
                    'data': {'texts': {'body': {'value': {'body': 'The government announced a new program.'}}}},
                    'usermetadata': {'classifications': [
                        {'labelset': 'kind', 'label': 'press_release'},
                        {'labelset': 'state', 'label': 'federal'},
                    ]},
                }

        item = fetch_item(FakeKb(), 'a')
        self.assertEqual(item['kind'], 'press_release')
