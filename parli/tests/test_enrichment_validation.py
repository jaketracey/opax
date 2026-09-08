import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from codex_enrichment_loop import validate_payload

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
