import copy
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from arag_bill_text_labeler import parameters, matches, safe_summary


class BillLabellerProviderTest(unittest.TestCase):
    def config(self):
        return {"generative_model": "openai-compatible", "user_keys": {"openai_compat": {
            "key": "test-secret", "url": "https://openrouter.ai/api/v1",
            "model_id": "@preset/opax-pro", "model_features": {"tool_use": True},
        }}}

    def test_refuses_native_model_other_host_and_missing_key(self):
        for field, value in (("model", "gemini-2.5-flash-lite"),
                             ("url", "https://api.openai.com/v1"), ("key", "")):
            with self.subTest(field=field):
                config = self.config()
                if field == "model":
                    config["generative_model"] = value
                else:
                    config["user_keys"]["openai_compat"][field] = value
                with self.assertRaises(ValueError):
                    parameters(config)

    def test_scoped_label_operation_preserves_provider_and_no_secret_output(self):
        config = self.config()
        before = copy.deepcopy(config)
        result = parameters(config)
        self.assertEqual(result["filter"], {"labels": ["kind/bill_text"], "labels_operator": 0,
                         "field_types": ["t"], "fields": ["body"],
                         "apply_to_agent_generated_fields": False})
        self.assertEqual(list(result["operations"][0]), ["label"])
        self.assertEqual(config, before)
        self.assertEqual(result["llm"]["keys"]["openai_compat"], config["user_keys"]["openai_compat"])
        self.assertNotIn("test-secret", str(safe_summary(result)))
        result["llm"]["keys"]["openai_compat"]["key"] = "changed"
        self.assertEqual(config, before)

    def test_readback_defaults_do_not_hide_changed_intended_values(self):
        self.assertTrue(matches({"model": "openai-compatible", "reasoning_config": None}, {"model": "openai-compatible"}))
        self.assertFalse(matches({"model": "native"}, {"model": "openai-compatible"}))

    def test_legacy_native_paths_fail_before_credentials_or_network(self):
        for script, arg in (("arag_byok_openrouter.py", "--rollback"),
                            ("arag_set_models.py", "gemini-2.5-flash-lite")):
            result = subprocess.run([sys.executable, str(ROOT / "scripts" / script), arg],
                                    cwd="/tmp", capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("disabled", result.stderr)
            self.assertNotIn(".env", result.stderr)


if __name__ == "__main__":
    unittest.main()
