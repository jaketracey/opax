"""Replay the recorded model response without credentials or production data."""
import contextlib
import io
import json
from pathlib import Path
import sqlite3
import sys
import types
import unittest
from unittest import mock

from parli.ingest import classify_donations as classifier

FIXTURE = Path(__file__).parent / "fixtures" / "donation_model_response.json"


class DonationModelFormatTests(unittest.TestCase):
    def setUp(self):
        self.recorded = json.loads(FIXTURE.read_text())
        self.text = self.recorded["content"][0]["text"]
        self.expected = json.loads(self.text)
        self.assertEqual(self.recorded["model"], "claude-haiku-5-5")
        self.assertEqual(set(self.expected.values()), {"health", "transport"})

    def replay(self, text):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.execute("CREATE TABLE donations (donor_name TEXT, industry TEXT)")
        for organisation in self.expected:
            db.executemany("INSERT INTO donations VALUES (?, NULL)", [(organisation,), (organisation,)])
        db.commit()
        create = mock.Mock(return_value=types.SimpleNamespace(content=[types.SimpleNamespace(text=text)]))
        client = types.SimpleNamespace(messages=types.SimpleNamespace(create=create))
        sdk = types.SimpleNamespace(Anthropic=mock.Mock(return_value=client), RateLimitError=type("RateLimitError", (Exception,), {}))
        with mock.patch.dict(sys.modules, {"anthropic": sdk}), contextlib.redirect_stdout(io.StringIO()):
            counts = classifier.classify_donations_llm(db, batch_size=100, max_batches=1)
        create.assert_called_once()
        self.assertEqual(create.call_args.kwargs["system"], classifier.LLM_SYSTEM_PROMPT)
        self.assertEqual(set(json.loads(create.call_args.kwargs["messages"][0]["content"])), set(self.expected))
        return dict(db.execute("SELECT donor_name, industry FROM donations")), counts, create.call_args.kwargs["model"]

    def test_recorded_json_and_fenced_json_write_all_rows(self):
        for response in [self.text, f"```json\n{self.text}\n```"]:
            with self.subTest(fenced=response.startswith("```")):
                actual, counts, _ = self.replay(response)
                self.assertEqual(actual, self.expected)
                self.assertEqual(counts, {"health": 2, "transport": 2})

    def test_categories_are_normalised_and_unknown_values_fall_back(self):
        payload = dict(self.expected)
        first, second = payload
        payload[first] = " HEALTH "
        payload[second] = "unsupported-category"
        actual, counts, _ = self.replay(json.dumps(payload))
        self.assertEqual(actual, {first: "health", second: "other"})
        self.assertEqual(counts, {"health": 2, "other": 2})

    def test_request_uses_verified_model(self):
        _, _, model = self.replay(self.text)
        self.assertEqual(model, self.recorded["model"])


if __name__ == "__main__":
    unittest.main()
