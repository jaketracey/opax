import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('timeout_loop', ROOT / 'scripts/codex_enrichment_loop.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class TimeoutTests(unittest.TestCase):
    def test_timeout_releases_claims_and_never_submits_leftover_output(self):
        for kind in ['labels', 'summaries']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as folder:
                result = Path(folder) / f'{kind}-test-worker' / 'result.json'

                def timeout(*args):
                    result.write_text(json.dumps({'record': [] if kind == 'labels' else 'Asked about local services.'}))
                    raise subprocess.TimeoutExpired(['codex'], 1800)

                with patch.object(worker, 'RUN_ROOT', Path(folder)), \
                     patch.object(worker, 'claim', return_value=([{'rid': 'record', 'text': 'Local services'}], 'batch 1')), \
                     patch.object(worker, 'ask_codex', side_effect=timeout) as ask, \
                     patch.object(worker, 'release') as release, \
                     patch.object(worker, 'submit') as submit, \
                     patch.object(worker, 'validate_payload') as validate, \
                     patch.object(worker, 'quarantine_rejected') as quarantine, \
                     patch('sys.argv', ['loop', kind, '--worker', 'test-worker', '--max-batches', '1']):
                    with self.assertRaisesRegex(SystemExit, 'timed out after 1800 seconds; claims released'):
                        worker.main()
                ask.assert_called_once()
                release.assert_called_once_with(kind, 'test-worker')
                submit.assert_not_called()
                validate.assert_not_called()
                quarantine.assert_not_called()
                self.assertFalse(result.exists())


if __name__ == '__main__':
    unittest.main()
