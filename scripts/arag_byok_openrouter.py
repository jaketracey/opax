#!/usr/bin/env python3
"""Point the opax KB's generation at OpenRouter (BYOK) — DeepSeek V4 Flash.

Switches `generative_model` and `summary_model` to the platform's
`openai-compatible` provider, backed by our own OpenRouter key via
`user_keys.openai_compat`. Generation then bills to the OpenRouter account at
provider list price (deepseek/deepseek-v4-flash: ~$0.08/$0.16 per 1M tokens)
instead of ARAG platform tokens. Schema facts verified against the live KB
2026-09-01: option value `openai-compatible` pairs with user_key group
`openai_compat` (required fields: url, model_id).

Setup: add `OPENROUTER_API_KEY=sk-or-...` to .env (never committed). Use a
key that is spend-capped in the OpenRouter dashboard — it is stored in the
KB configuration platform-side.

Usage:
  python3 scripts/arag_byok_openrouter.py                 # switch + smoke test
  python3 scripts/arag_byok_openrouter.py <model-id>      # different OR model
  python3 scripts/arag_byok_openrouter.py --rollback      # restore gemini + clear key

The switch self-verifies with a live /ask; if that fails, the previous
configuration is restored automatically.
"""
import json
import re
import sys
import urllib.error
import urllib.request

MODEL = "deepseek/deepseek-v4-flash"
OPENROUTER_URL = "https://openrouter.ai/api/v1"
ROLLBACK_MODEL = "gemini-2.5-flash-lite"  # the pinned pre-BYOK models

env = open(".env").read()


def var(name, required=True):
    m = re.search(rf"^{name}=(.*)$", env, re.M)
    if not m and required:
        sys.exit(f"{name} missing from .env")
    return m.group(1).strip() if m else None


TOK = var("ARAG_KB_TOKEN")
KB = var("ARAG_KB_ID")
ZONE = var("ARAG_ZONE")
BASE = f"https://{ZONE}.rag.progress.cloud/api/v1/kb/{KB}"
HEADERS = {"content-type": "application/json",
           "x-nuclia-serviceaccount": f"Bearer {TOK}"}


def call(path, method="GET", body=None, timeout=90, headers=None):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method, headers={**HEADERS, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:400].decode(errors="replace")


def patch_config(body):
    status, detail = call("/configuration", "PATCH", body)
    if status not in (200, 204):
        sys.exit(f"PATCH /configuration failed ({status}): {detail}")


def models_now():
    status, cfg = call("/configuration")
    if status != 200:
        sys.exit(f"GET /configuration failed ({status}): {cfg}")
    return cfg.get("generative_model"), cfg.get("summary_model"), cfg


def smoke_ask():
    """One tiny live /ask; returns (ok, note). Sync mode, small question."""
    # x-synchronous gives one JSON object; without it /ask streams NDJSON.
    status, body = call("/ask", "POST", {
        "query": "In one sentence, what is this knowledge base about?",
        "top_k": 3, "citations": False,
    }, timeout=120, headers={"x-synchronous": "true"})
    if status != 200:
        return False, f"/ask returned {status}: {str(body)[:200]}"
    answer = (body.get("answer") or "") if isinstance(body, dict) else ""
    if len(answer.strip()) < 10:
        return False, f"empty/short answer: {answer[:100]!r}"
    return True, answer[:120]


if "--rollback" in sys.argv:
    patch_config({"generative_model": ROLLBACK_MODEL,
                  "summary_model": ROLLBACK_MODEL,
                  "user_keys": None})
    gen, summ, _ = models_now()
    print(f"rolled back: generative={gen} summary={summ} user_keys cleared")
    sys.exit(0)

or_key = var("OPENROUTER_API_KEY")
model = next((a for a in sys.argv[1:] if not a.startswith("-")), MODEL)

prev_gen, prev_summary, prev_cfg = models_now()
print(f"current: generative={prev_gen} summary={prev_summary}")

patch_config({
    "user_keys": {"openai_compat": {
        "key": or_key,
        "url": OPENROUTER_URL,
        "model_id": model,
        # Defaults are 800 out / 64k in - too small for cited answers over
        # long passages; deepseek-v4-flash takes 1M in.
        "generation_config": {
            "temperature": 0.0,
            "default_max_completion_tokens": 1600,
            "max_input_tokens": 120000,
        },
        # DeepSeek v4-flash defaults to thinking mode, which rejects the
        # forced tool_choice ARAG uses for answer_json_schema (verified:
        # "Thinking mode does not support this tool_choice"). Declaring
        # effort NONE (5) with effort dispatch (2) makes ARAG send
        # reasoning_effort=none on every request - structured asks work and
        # prose asks get faster and cheaper. vision off: 0731 is text-only.
        "model_features": {
            "tool_use": True,
            "vision": False,
            "reasoning_features": {
                "dispatch": 2,
                "available_efforts": [5],
                "default_effort": 5,
            },
        },
    }},
    "generative_model": "openai-compatible",
    "summary_model": "openai-compatible",
})
gen, summ, _ = models_now()
print(f"patched: generative={gen} summary={summ} model_id={model}")

ok, note = smoke_ask()
if ok:
    print(f"smoke /ask OK: {note}")
    print("Done. Generation now bills to the OpenRouter account.")
else:
    print(f"smoke /ask FAILED: {note}", file=sys.stderr)
    patch_config({"generative_model": prev_gen or ROLLBACK_MODEL,
                  "summary_model": prev_summary or ROLLBACK_MODEL,
                  "user_keys": prev_cfg.get("user_keys")})
    print("rolled back to previous configuration.", file=sys.stderr)
    sys.exit(1)
