#!/usr/bin/env python3
"""Which provider serves the OpenRouter preset the knowledge box generates through?

  python3 scripts/check_preset_provider.py              # one tiny call to @preset/opax-pro, about US$0.0001
  python3 scripts/check_preset_provider.py --kb         # also read the knowledge box's slot (no model call)
  python3 scripts/check_preset_provider.py --expect together --preset @preset/opax-pro

The knowledge box's generation goes to OpenRouter through a preset whose routing (provider, no
fallbacks, data_collection "deny", zero data retention) is a setting in the OpenRouter account, not
in this repository, so it can drift. Run this after any change to the preset, and whenever the
privacy facts in docs/PRIVACY.md are re-read. It exits 1 unless the provider is the expected one.

What it does: one chat completion to the preset with a fixed sentence and NO provider object of its
own (a request-level provider object would replace the preset's), then reads OpenRouter's generation
record for that id. It reports the provider and the model slug only. It never prints the key, a
header, the prompt or the completion. The key must belong to the account that owns the preset.

What it cannot show: that the knowledge box still points at this preset. --kb reads the knowledge
box's configuration (a read, not a model call) and fails unless its OpenRouter slot names the preset.
"""
import sys as _http_sys
from pathlib import Path as _HttpPath
_http_sys.path.insert(0, str(_HttpPath(__file__).resolve().parents[1]))
from parli.ingest import http as source_http
import argparse, json, os, time, urllib.error, urllib.parse

OPENROUTER = "https://openrouter.ai/api/v1"
PROMPT = "Reply with the single word: ok"


def _json(request, timeout=60):
    """(status, body) with the error body withheld: provider errors can echo request configuration."""
    try:
        with source_http.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as error:
        return error.code, {}


def served_by(key, preset, wait=(2, 4, 8)):
    """One call to the preset; returns (status, model, provider from the response, provider from the generation record)."""
    auth = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    body = {"model": preset, "max_tokens": 5, "messages": [{"role": "user", "content": PROMPT}]}
    status, data = _json(source_http.Request(f"{OPENROUTER}/chat/completions", data=json.dumps(body).encode(), headers=auth))
    if status != 200:
        return status, None, None, None
    recorded = None
    generation = data.get("id")
    for pause in wait if generation else ():
        time.sleep(pause)  # the generation record lags the response by a few seconds
        got, record = _json(source_http.Request(f"{OPENROUTER}/generation?id={urllib.parse.quote(str(generation))}", headers=auth))
        if got == 200:
            recorded = (record.get("data") or {}).get("provider_name")
            break
    return status, data.get("model"), data.get("provider"), recorded


def kb_slot(zone, kb, token):
    """The knowledge box's generative slot: (status, generative_model, endpoint url, model_id)."""
    request = source_http.Request(f"https://{zone}.rag.progress.cloud/api/v1/kb/{kb}/configuration",
                                  headers={"x-nuclia-serviceaccount": f"Bearer {token}"})
    status, config = _json(request)
    compat = ((config.get("user_keys") or {}).get("openai_compat") or {}) if status == 200 else {}
    return status, config.get("generative_model"), str(compat.get("url") or "").rstrip("/"), compat.get("model_id")


def main(argv=None, environ=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--preset", default="@preset/opax-pro")
    parser.add_argument("--expect", default="together", help="provider name, compared without case")
    parser.add_argument("--kb", action="store_true", help="also check the knowledge box's slot names the preset")
    args = parser.parse_args(argv)
    env = os.environ if environ is None else environ
    key = env.get("OPENROUTER_API_KEY")
    if not key:
        print("OPENROUTER_API_KEY missing (set it in .env or the environment)")
        return 2
    failed = False
    if args.kb:
        zone, kb, token = env.get("ARAG_ZONE"), env.get("ARAG_KB_ID"), env.get("ARAG_KB_TOKEN")
        if not (zone and kb and token):
            print("--kb needs ARAG_ZONE, ARAG_KB_ID and ARAG_KB_TOKEN")
            return 2
        status, generative, url, model_id = kb_slot(zone, kb, token)
        ok = status == 200 and generative == "openai-compatible" and url == OPENROUTER and model_id == args.preset
        print(f"knowledge box slot: status={status} generative_model={generative} endpoint_is_openrouter={url == OPENROUTER} model_id={model_id}")
        if not ok:
            print(f"FAIL: the knowledge box does not generate through {args.preset}")
            failed = True
    status, model, provider, recorded = served_by(key, args.preset)
    print(f"preset={args.preset} status={status} model={model} provider={provider} generation_record_provider={recorded}")
    if status != 200:
        print("FAIL: OpenRouter did not serve the preset (a refusal here means no endpoint meets the preset's routing)")
        return 1
    names = [name for name in (provider, recorded) if name]
    if not names or any(name.lower() != args.expect.lower() for name in names):
        print(f"FAIL: expected provider {args.expect}")
        return 1
    if recorded is None:
        print("note: the generation record was not available yet; the provider is from the response only")
    print(f"OK: {args.preset} is served by {names[0]}")
    return 1 if failed else 0


if __name__ == "__main__":
    from parli.arag import load_dotenv
    load_dotenv(str(_HttpPath(__file__).resolve().parents[1] / ".env"))
    sys.exit(main())
