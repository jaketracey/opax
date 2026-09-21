import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bill_export', ROOT / 'scripts/export_bills.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class BriefPreservationTests(unittest.TestCase):
    def test_preserves_only_identical_retained_speech(self):
        speech = {'slug': 'speech-42', 'speaker': 'Example', 'date': '2026-09-10', 'state': 'federal', 'brief': 'Reviewed brief'}
        previous = {'key': 'bill-1', 'speeches': [speech]}
        fresh = {'key': 'bill-1', 'speeches': [{**speech, 'brief': None}]}
        exporter.preserve_speech_briefs(fresh, previous)
        self.assertEqual(fresh['speeches'][0]['brief'], 'Reviewed brief')
        for field in ('slug', 'speaker', 'date', 'state'):
            changed = {'key': 'bill-1', 'speeches': [{**speech, field: 'different', 'brief': None}]}
            exporter.preserve_speech_briefs(changed, previous)
            self.assertIsNone(changed['speeches'][0]['brief'])
        removed = {'key': 'bill-1', 'speeches': []}
        exporter.preserve_speech_briefs(removed, previous)
        self.assertEqual(removed['speeches'], [])

    def test_new_brief_wins_and_input_is_unchanged(self):
        previous = {'key': 'bill-1', 'speeches': [{'slug': 'speech-42', 'brief': 'Old'}]}
        before = copy.deepcopy(previous)
        fresh = {'key': 'bill-1', 'speeches': [{'slug': 'speech-42', 'brief': 'New'}]}
        exporter.preserve_speech_briefs(fresh, previous)
        self.assertEqual(fresh['speeches'][0]['brief'], 'New')
        self.assertEqual(previous, before)


if __name__ == '__main__':
    unittest.main()
