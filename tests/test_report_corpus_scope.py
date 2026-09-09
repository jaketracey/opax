import unittest
from scripts.generate_reports import REPORTS, WINDOW_PROMPT, window_clauses, window_questions, resource_summary, trim_record_preamble, refreshed_speech_stats

class ReportCorpusScopeTests(unittest.TestCase):
    def test_narratives_do_not_require_speech_or_topic_labels(self):
        clauses = window_clauses('housing', '2024-07-01', '2026-09-09')['field']['and']
        self.assertFalse(any(c.get('labelset') in ('kind', 'topic') for c in clauses))
        self.assertIn({'not': {'prop': 'label', 'labelset': 'kind', 'label': 'bill'}}, clauses)
        self.assertIn({'not': {'prop': 'field', 'type': 'text', 'name': 'da-summary-t-body'}}, clauses)
        self.assertTrue(any(c.get('prop') == 'created' for c in clauses))

    def test_every_topic_has_cross_corpus_questions(self):
        for cfg in REPORTS.values():
            questions = window_questions(cfg, [])
            self.assertTrue(questions[0].startswith('What policy changes'))
            self.assertTrue(questions[1].startswith('What do bills, government releases'))

    def test_source_kind_is_preserved(self):
        source = resource_summary({'slug': 'press-nsw-123', 'usermetadata': {'classifications': [{'labelset': 'kind', 'label': 'press_release'}]}})
        self.assertEqual(source['kind'], 'press_release')
        self.assertIsNone(source['speaker'])

    def test_prompt_distinguishes_announcement_from_delivery(self):
        self.assertIn('an announcement is not proof of delivery', WINDOW_PROMPT)
        self.assertNotIn('Every passage was delivered in an Australian parliament', WINDOW_PROMPT)

    def test_removing_preamble_preserves_citation_offsets(self):
        prefix = 'The record shows '
        section = {'answer': prefix + 'housing supply increased.', 'sources': [
            {'answer_ranges': [[len(prefix), len(prefix) + 14]]}
        ]}
        trim_record_preamble(section)
        self.assertEqual(section['answer'], 'Housing supply increased.')
        self.assertEqual(section['sources'][0]['answer_ranges'], [[0, 14]])

    def test_speech_metrics_use_current_catalog_and_preserve_financial_snapshot(self):
        rows = [{'speaker': 'A Speaker', 'date': '2025-01-01'}, {'speaker': 'A Speaker', 'date': '2025-02-01'}]
        stats = refreshed_speech_stats({'speech_count': 999, 'donations': {'total': 100}}, rows)
        self.assertEqual(stats['speech_count'], 2)
        self.assertEqual(stats['unique_speakers'], 1)
        self.assertEqual(stats['timeline'], [['2025', 2]])
        self.assertEqual(stats['donations']['total'], 100)
