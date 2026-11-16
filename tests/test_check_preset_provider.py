"""The preset provider check: one call, provider and model only, fails on any other provider."""
import contextlib
import io
import json
import unittest
import urllib.error
from unittest import mock

from scripts import check_preset_provider as check

KEY = "test-only-placeholder"


class _Response:
    def __init__(self, body, status=200):
        self.body, self.status = body, status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return json.dumps(self.body).encode()


def run(provider="Together", recorded="Together", status=200, argv=(), env=None, config=None):
    sent = []

    def urlopen(request, timeout=None):
        sent.append(request)
        url = request.full_url
        if url.endswith("/chat/completions"):
            if status != 200:
                raise urllib.error.HTTPError(url, status, "refused", {}, io.BytesIO(b'{"error":{"message":"secret detail"}}'))
            return _Response({"id": "gen-1", "model": "deepseek/deepseek-v4-pro-0813", "provider": provider,
                              "choices": [{"message": {"content": "completion text"}}]})
        if "/generation?id=gen-1" in url:
            return _Response({"data": {"provider_name": recorded, "model": "deepseek/deepseek-v4-pro-0813"}})
        if url.endswith("/configuration"):
            return _Response(config)
        raise AssertionError("unexpected request " + url)

    out = io.StringIO()
    with mock.patch.object(check.source_http, "urlopen", urlopen), mock.patch.object(check.time, "sleep", lambda _: None), \
            contextlib.redirect_stdout(out):
        code = check.main(list(argv), {"OPENROUTER_API_KEY": KEY, **(env or {})})
    return code, out.getvalue(), sent


class PresetProviderCheck(unittest.TestCase):
    def test_together_passes_with_one_completion_and_no_provider_object(self):
        code, out, sent = run()
        self.assertEqual(code, 0)
        completions = [r for r in sent if r.full_url.endswith("/chat/completions")]
        self.assertEqual(len(completions), 1)
        body = json.loads(completions[0].data)
        self.assertEqual(body["model"], "@preset/opax-pro")
        self.assertNotIn("provider", body, "a request-level provider object would replace the preset's routing")
        self.assertIn("provider=Together", out)
        self.assertIn("generation_record_provider=Together", out)

    def test_nothing_secret_or_textual_is_printed(self):
        for kwargs in ({}, {"provider": "DeepSeek"}, {"status": 404}):
            _, out, _ = run(**kwargs)
            for text in (KEY, "Bearer", check.PROMPT, "completion text", "secret detail"):
                self.assertNotIn(text, out)

    def test_any_other_provider_fails(self):
        self.assertEqual(run(provider="DeepSeek", recorded="DeepSeek")[0], 1)
        self.assertEqual(run(provider="Together", recorded="DeepSeek")[0], 1, "the generation record disagrees")
        self.assertEqual(run(provider=None, recorded=None)[0], 1, "no provider reported")

    def test_a_refusal_fails(self):
        code, out, sent = run(status=404)
        self.assertEqual(code, 1)
        self.assertEqual(len(sent), 1)

    def test_missing_key_is_a_usage_error(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(check.main([], {}), 2)

    def test_kb_slot_must_name_the_preset(self):
        env = {"ARAG_ZONE": "zone", "ARAG_KB_ID": "kb", "ARAG_KB_TOKEN": "token-value"}
        slot = lambda model_id: {"generative_model": "openai-compatible", "user_keys": {"openai_compat": {
            "url": "https://openrouter.ai/api/v1", "model_id": model_id, "key": "stored-key-value"}}}
        code, out, _ = run(argv=["--kb"], env=env, config=slot("@preset/opax-pro"))
        self.assertEqual(code, 0)
        self.assertNotIn("stored-key-value", out)
        self.assertNotIn("token-value", out)
        self.assertEqual(run(argv=["--kb"], env=env, config=slot("deepseek/deepseek-v4-pro-0813"))[0], 1)
        self.assertEqual(run(argv=["--kb"])[0], 2)

    def test_runs_as_a_script(self):
        import subprocess
        import sys
        from pathlib import Path
        script = Path(check.__file__)
        done = subprocess.run([sys.executable, str(script), "--help"], capture_output=True, text=True, cwd=script.parents[1])
        self.assertEqual(done.returncode, 0, done.stderr[-300:])


if __name__ == "__main__":
    unittest.main()
