"""Coverage sequences and the read-only acquisition boundary, entirely offline."""
from collections import Counter
import csv
import io
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from scripts.audit import hansard_gaps as audit


class CoverageRuns(unittest.TestCase):
    def test_five_expected_days_across_recess_is_a_run(self):
        days = ['2025-02-03', '2025-02-04', '2025-03-03', '2025-03-04', '2025-03-05']
        self.assertEqual(list(audit.runs(days, {})), [days])

    def test_occupied_day_splits_runs_and_trailing_four_is_not_reported(self):
        days = [f'2025-02-{i:02}' for i in range(1, 11)]
        self.assertEqual(list(audit.runs(days, {days[5]: 1})), [days[:5]])

    def test_repeated_evidence_does_not_multiply_expected_days(self):
        self.assertEqual(list(audit.runs({'2025-02-01', '2025-02-01'}, {}, minimum=2)), [])


class ReadOnlyExtract(unittest.TestCase):
    def test_rules_keep_senate_when_house_zenodo_exists_and_preserve_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'audit.sqlite'
            with sqlite3.connect(path) as db:
                db.executescript('''
                    CREATE TABLE speeches(state,chamber,date,source,hearing_type,text,speaker_name,topic,party);
                    CREATE TABLE divisions(state,house,date);
                    CREATE TABLE ext_divisions(jurisdiction,house,date,source);
                    CREATE TABLE vic_hansard_progress(sitting_date,chamber,speeches_count);
                ''')
                rows = [('federal', ch, '2020-01-01', src, None, 'body ' * 50, 'Person', '', '')
                        for ch, src in [('representatives', 'zenodo'), ('representatives', 'openaustralia'),
                                        ('senate', 'openaustralia'), ('senate', 'wragge_xml')]]
                rows += [('federal', 'senate_committee', '2020-01-01', 'committee_senate', 'estimates',
                          'evidence ' * 50, 'Witness', '', '')]
                db.executemany('INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?,?)', rows)
            before = path.read_bytes()
            with patch.object(audit.os, 'getloadavg', return_value=(0, 0, 0)):
                result = audit.extract(path)
            self.assertEqual(path.read_bytes(), before)
            raw = Counter({(r[1], r[3]): r[-1] for r in result['speeches']})
            kept = Counter({(r[1], r[3]): r[-1] for r in result['eligible_before_exact_dedupe']})
            self.assertEqual(sum(raw.values()), 5)
            self.assertEqual(kept[('senate', 'openaustralia')], 1)
            self.assertEqual(kept[('representatives', 'openaustralia')], 0)
            self.assertEqual(kept[('senate', 'wragge_xml')], 0)
            self.assertEqual(kept[('senate_committee', 'committee_senate')], 1)

    def test_high_load_stops_before_opening_database(self):
        with patch.object(audit.os, 'getloadavg', return_value=(10, 40, 30)):
            with self.assertRaisesRegex(SystemExit, 'load5'):
                audit.extract(Path('/does-not-exist'))


class OriginalCorpus(unittest.TestCase):
    def test_federation_flag_and_length_floors_survive_original_zip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'corpus.zip'
            content = io.StringIO()
            writer = csv.DictWriter(content, ['date', 'fedchamb_flag', 'body'])
            writer.writeheader()
            writer.writerows([
                {'date': '1998-03-04', 'fedchamb_flag': '1', 'body': 'x' * 49},
                {'date': '1998-03-04', 'fedchamb_flag': '1', 'body': '<p>' + 'x' * 200 + '</p>'},
                {'date': '1998-03-04', 'fedchamb_flag': '0', 'body': 'x' * 50},
            ])
            with zipfile.ZipFile(path, 'w') as z:
                z.writestr('hansard-corpus/hansard_corpus_1998_to_2022.csv', content.getvalue())
            with patch.object(audit.os, 'getloadavg', return_value=(0, 0, 0)):
                rows = audit.zenodo_days(path)
            fed = next(r for r in rows if r['fedchamb_flag'] == '1')
            self.assertEqual((fed['raw_rows'], fed['chars_50'], fed['chars_200']), (2, 1, 1))


if __name__ == '__main__':
    unittest.main()
