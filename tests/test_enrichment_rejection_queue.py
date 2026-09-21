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


if __name__ == '__main__':
    unittest.main()
