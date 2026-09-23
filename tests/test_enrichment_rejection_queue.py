import importlib.util
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('enrich_loop', ROOT / 'scripts/codex_enrichment_loop.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class RejectionQueueTests(unittest.TestCase):
    def test_holds_only_rejected_records_owned_by_this_claim(self):
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / 'queue.sqlite')
            with sqlite3.connect(path) as con:
                con.execute('CREATE TABLE queue(rid TEXT PRIMARY KEY,status TEXT,error TEXT,worker TEXT,claimed_at REAL)')
                con.executemany('INSERT INTO queue VALUES (?,?,NULL,?,1)',
                                [('bad', 'claimed', 'worker1'), ('good', 'claimed', 'worker1'),
                                 ('other', 'claimed', 'worker2'), ('done', 'done', 'worker1')])
            with patch.dict(os.environ, {'SUMMARY_QUEUE_DB': path}):
                held = worker.quarantine_rejected('summaries', 'worker1',
                    [{'rid': r} for r in ['bad', 'good', 'other', 'done']],
                    ['bad: unsupported figure', 'other: bad text', 'done: stale output', 'outside: ignored'])
                self.assertEqual(held, 1)
            with sqlite3.connect(path) as con:
                rows = {r[0]: r[1:] for r in con.execute('SELECT rid,status,worker,error FROM queue')}
            self.assertEqual(rows['bad'][:2], ('error', None))
            self.assertIn('unsupported figure', rows['bad'][2])
            self.assertEqual(rows['good'][:2], ('claimed', 'worker1'))
            self.assertEqual(rows['other'][:2], ('claimed', 'worker2'))
            self.assertEqual(rows['done'][:2], ('done', 'worker1'))

    def test_grouped_rejections_preserve_diagnostics_and_claim_boundaries(self):
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / 'queue.sqlite')
            with sqlite3.connect(path) as con:
                con.execute('CREATE TABLE queue(rid TEXT PRIMARY KEY,status TEXT,error TEXT,worker TEXT,claimed_at REAL,priority INTEGER)')
                con.executemany('INSERT INTO queue VALUES (?,?,NULL,?,1,10)',
                                [('bad-a', 'claimed', 'worker1'), ('bad-b', 'claimed', 'worker1'),
                                 ('good', 'claimed', 'worker1'), ('other', 'claimed', 'worker2'),
                                 ('done', 'done', 'worker1'), ('outside', 'claimed', 'worker1')])
            grouped = 'bad-a, bad-b, other, done, outside: repeated brief in this batch; good is mentioned only in the explanation'
            with patch.dict(os.environ, {'SUMMARY_QUEUE_DB': path}):
                held = worker.quarantine_rejected('summaries', 'worker1',
                    [{'rid': r} for r in ['bad-a', 'bad-b', 'good', 'other', 'done']],
                    [grouped, 'bad-b: unsupported figure', 'good'])
                self.assertEqual(held, 2)
            with sqlite3.connect(path) as con:
                rows = {r[0]: r[1:] for r in con.execute('SELECT rid,status,worker,error,claimed_at,priority FROM queue')}
            for rid in ['bad-a', 'bad-b']:
                self.assertEqual(rows[rid][:2], ('error', None))
                self.assertIn(grouped, rows[rid][2])
                self.assertEqual(rows[rid][3:], (None, 10))
            self.assertIn('unsupported figure', rows['bad-b'][2])
            for rid in ['good', 'outside']:
                self.assertEqual(rows[rid], ('claimed', 'worker1', None, 1, 10))
            self.assertEqual(rows['other'], ('claimed', 'worker2', None, 1, 10))
            self.assertEqual(rows['done'], ('done', 'worker1', None, 1, 10))


if __name__ == '__main__':
    unittest.main()
