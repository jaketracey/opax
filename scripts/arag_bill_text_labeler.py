#!/usr/bin/env python3
"""Register the NEW-only original-bill topic labeller on our OpenRouter slot.

Run from the repo with its virtualenv. Defaults to a redacted plan; --apply
registers only future matching fields, never starts a historical corpus job.
"""
import argparse
import copy
import json

from arag_enrich import TOPICS
from parli.arag import AragConfig, KbClient, load_dotenv, _request

NAME = "opax-bill-text-topics"
OPENROUTER_URL = "https://openrouter.ai/api/v1"


def parameters(config):
    compat = (config.get("user_keys") or {}).get("openai_compat") or {}
    if (config.get("generative_model") != "openai-compatible"
            or compat.get("url", "").rstrip("/") != OPENROUTER_URL
            or not compat.get("key") or not compat.get("model_id")):
        raise ValueError("KB generation must have a complete verified OpenRouter configuration")
    return {
        "name": NAME,
        "on": 1,
        # Official UI serializes classification filters as labelset/label.
        # AND, original text fields only; no generated summaries or speeches.
        "filter": {"labels": ["kind/bill_text"], "labels_operator": 0,
                   "field_types": ["t"], "fields": ["body"],
                   "apply_to_agent_generated_fields": False},
        "operations": [{"label": {
            "ident": "topic", "multiple": True,
            "description": (
                "Classify this original Australian federal bill text into the policy topics "
                "it substantively regulates or changes. Choose every substantive topic, "
                "not matters merely mentioned in passing. Procedural text with no policy "
                "content gets no label. Classify proposed provisions, not a speaker's opinions."
            ),
            "labels": [{"label": label, "description": description, "examples": examples}
                       for label, description, examples in TOPICS],
        }}],
        "llm": {"model": "openai-compatible", "provider": "openai_compat",
                "keys": {"openai_compat": copy.deepcopy(compat)}},
    }


def safe_summary(task):
    p = task.get("parameters", task)
    c = p["llm"]["keys"]["openai_compat"]
    return {"id": task.get("id"), "name": p["name"], "enabled": task.get("enabled"),
            "filter": p["filter"], "model": p["llm"]["model"],
            "endpoint": c["url"], "model_id": c["model_id"],
            "key_present": bool(c.get("key")), "topics": len(p["operations"][0]["label"]["labels"])}


def matches(actual, desired):
    """Server responses add harmless default fields; compare every intended value."""
    if isinstance(desired, dict):
        return isinstance(actual, dict) and all(matches(actual.get(k), v) for k, v in desired.items())
    if isinstance(desired, list):
        return isinstance(actual, list) and len(actual) == len(desired) and all(matches(a, b) for a, b in zip(actual, desired))
    return actual == desired


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    load_dotenv(args.env_file)
    client = KbClient(AragConfig.from_env())
    config = _request("GET", client._rag("/configuration"), client._headers)
    desired = parameters(config)
    existing = [x for x in client.list_tasks().get("configs", [])
                if x.get("parameters", {}).get("name") == NAME]
    if existing:
        if len(existing) != 1:
            raise ValueError("Duplicate bill topic labellers found; refusing another registration")
        actual = existing[0]
        actual_parameters = actual["parameters"]
        actual_filter = actual_parameters.get("filter") or {}
        if (any(actual_filter.get(k) != v for k, v in desired["filter"].items())
                or any(actual_filter.get(k) for k in ("contains", "resource_type", "not_field_types", "rids", "splits"))
                or actual_parameters.get("filter_expression_json")
                or not matches(actual_parameters.get("operations"), desired["operations"])
                or not matches(actual_parameters.get("llm"), desired["llm"])
                or not actual.get("enabled")):
            raise ValueError("Existing labeller differs from verified configuration; review it before changing")
        print(json.dumps({"existing": safe_summary(actual)}, indent=2))
        return
    print(json.dumps({"apply": "NEW", "plan": safe_summary(desired)}, indent=2))
    if args.apply:
        result = client.start_task("labeler", desired, apply="NEW", enabled=True)
        print(json.dumps({"created": {k: result.get(k) for k in ("id", "name", "status")}}))
        found = [x for x in client.list_tasks().get("configs", [])
                 if x.get("parameters", {}).get("name") == NAME]
        if len(found) != 1 or not found[0].get("enabled"):
            raise RuntimeError("Registered task was not readable as one enabled configuration")
        print(json.dumps({"verified": safe_summary(found[0])}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # HTTP errors may echo the request's BYOK configuration. Never log it.
        raise SystemExit(f"Bill labeller setup failed ({type(error).__name__}); details withheld to protect credentials")
