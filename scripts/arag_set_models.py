#!/usr/bin/env python3
"""Pin the opax KB's generative + summary models.

Default: gemini-2.5-flash-lite — the cheapest generative option the platform
offers ($0.10/$0.40 per 1M provider tokens). Grounded, cited /ask answers keep
lite-tier models honest; step up the ladder only if sample-eval quality demands:
  gemini-2.5-flash-lite -> chatgpt-5-nano -> gemini-3.1-flash-lite -> gemini-3.6-flash

Usage: python3 scripts/arag_set_models.py [model-id]
"""
import json
import re
import sys
import urllib.request
import urllib.error

MODEL = sys.argv[1] if len(sys.argv) > 1 else "gemini-2.5-flash-lite"

env = open(".env").read()
tok = re.search(r"^ARAG_KB_TOKEN=(.*)$", env, re.M).group(1)
kb = re.search(r"^ARAG_KB_ID=(.*)$", env, re.M).group(1)
zone = re.search(r"^ARAG_ZONE=(.*)$", env, re.M).group(1)

url = f"https://{zone}.rag.progress.cloud/api/v1/kb/{kb}/configuration"
body = json.dumps({"generative_model": MODEL, "summary_model": MODEL}).encode()
req = urllib.request.Request(
    url, data=body, method="PATCH",
    headers={"content-type": "application/json",
             "x-nuclia-serviceaccount": f"Bearer {tok}"},
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("PATCH", r.status)
except urllib.error.HTTPError as e:
    print("PATCH failed", e.code, e.read()[:300].decode(errors="replace"))
    sys.exit(1)

with urllib.request.urlopen(urllib.request.Request(
        url, headers={"x-nuclia-serviceaccount": f"Bearer {tok}"}), timeout=30) as r:
    cfg = json.load(r)
print("generative_model:", cfg.get("generative_model"))
print("summary_model:", cfg.get("summary_model"))
