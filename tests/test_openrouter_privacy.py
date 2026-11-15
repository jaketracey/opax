"""Scripts that call OpenRouter directly send the no-train, zero-retention routing fields."""
import json
import unittest
from pathlib import Path
from unittest import mock

from scripts import generate_reports


class _Response:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self, *args):
        return json.dumps({"choices": [{"message": {"tool_calls": [
            {"function": {"arguments": json.dumps({"ok": True})}}]}}]}).encode()


class OpenRouterPrivacyTest(unittest.TestCase):
    def test_report_extraction_request_carries_the_privacy_fields(self):
        sent = []

        def urlopen(request, timeout=None):
            sent.append(request)
            return _Response()

        schema = {"name": "extract", "description": "d", "parameters": {"type": "object", "properties": {}}}
        with mock.patch.dict("os.environ", {"REPORT_STRUCTURED_WRITER": ""}), \
                mock.patch.object(Path, "read_text", return_value="OPENROUTER_API_KEY=test-only-placeholder\n"), \
                mock.patch.object(generate_reports.source_http, "urlopen", urlopen):
            self.assertEqual(generate_reports.openrouter_tool_call(schema, "prompt"), {"ok": True})
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0].full_url, "https://openrouter.ai/api/v1/chat/completions")
        body = json.loads(sent[0].data)
        self.assertEqual(body["provider"]["data_collection"], "deny")
        self.assertIs(body["provider"]["zdr"], True)


if __name__ == "__main__":
    unittest.main()
