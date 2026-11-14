"""A refused portrait run never retries, even in the next pipeline process."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests
from scripts import portrait_http


class Adapter(requests.adapters.BaseAdapter):
    def __init__(self, status):
        self.status = status
        self.calls = 0

    def send(self, request, **kwargs):
        self.calls += 1
        response = requests.Response()
        response.status_code = self.status
        response.url = request.url
        response.request = request
        response._content = b'{}'
        if self.status == 200:
            response.headers['cf-mitigated'] = 'challenge'
        return response

    def close(self):
        pass


class PortraitHTTP(unittest.TestCase):
    def test_refusal_is_terminal_and_recorded(self):
        for status in [403, 429, 200]:
            with self.subTest(status=status), tempfile.TemporaryDirectory() as tmp:
                ledger = Path(tmp) / "requests.jsonl"
                adapter = Adapter(status)
                with patch.object(portrait_http, "LEDGER", ledger), patch.object(portrait_http, "_last", 0), \
                     patch.dict("os.environ", {"OPAX_SOURCE_STATUS_FILE": str(Path(tmp) / "status.json")}):
                    with portrait_http.Session() as session:
                        session.mount("https://", adapter)
                        with self.assertRaises(SystemExit):
                            session.get("https://commons.wikimedia.org/w/api.php")
                        with self.assertRaises(SystemExit):
                            session.get("https://commons.wikimedia.org/w/api.php")
                    self.assertEqual(adapter.calls, 1)
                    self.assertTrue(json.loads(ledger.read_text())["refused"])

    def test_commons_budget_is_shared_by_pipeline_sessions(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "requests.jsonl"
            ledger.write_text(json.dumps({"commons": True}) + "\n")
            with patch.object(portrait_http, "LEDGER", ledger), patch.dict("os.environ", {"PHOTOS_COMMONS_BUDGET": "1"}):
                with self.assertRaisesRegex(SystemExit, "budget exhausted"):
                    portrait_http.get("https://thumb.wikimedia.org/example.jpg")

    def test_pacing_uses_persistent_wall_time_after_a_reboot(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "requests.jsonl"
            ledger.write_text(json.dumps({"commons": False, "wall_time": 999.5, "at": 999999999}) + "\n")
            response = requests.Response()
            response.status_code = 200
            with patch.object(portrait_http, "LEDGER", ledger), patch.object(portrait_http, "_last", 0), \
                 patch.object(portrait_http.time, "time", return_value=1000), \
                 patch.object(portrait_http.time, "monotonic", return_value=10), \
                 patch.object(portrait_http.time, "sleep") as sleep, \
                 patch.object(portrait_http.source_http, "pace"), \
                 patch.object(portrait_http.source_http.Session, "send", return_value=response):
                portrait_http.get("https://commons.wikimedia.org/w/api.php")
                portrait_http.get("https://commons.wikimedia.org/w/api.php")
            self.assertEqual([call.args[0] for call in sleep.call_args_list], [0.5, 1.0])


if __name__ == "__main__":
    unittest.main()
