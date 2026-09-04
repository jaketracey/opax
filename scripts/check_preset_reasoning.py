#!/usr/bin/env python3
"""Is the OpenRouter preset the knowledge box generates through still spending tokens on reasoning?

  python3 scripts/check_preset_reasoning.py            # one tiny call to @preset/opax, ~$0.0001

Prints the model the preset resolved to and completion_tokens_details.reasoning_tokens.
That number must be 0 once the preset carries {"reasoning": {"enabled": false}}; while it is
not, /ask answers on the site can come back empty (MIGRATION-ARAG.md "Reasoning burn")."""
import json, sys, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from parli.arag import load_dotenv  # noqa: E402
import os
load_dotenv(str(ROOT / ".env"))
key = os.environ.get("OPENROUTER_API_KEY") or sys.exit("OPENROUTER_API_KEY missing from .env")
body = {"model": "@preset/opax", "max_tokens": 200,
        "messages": [{"role": "user", "content": "In one sentence: what is a poker machine?"}]}
req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                             headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
r = json.load(urllib.request.urlopen(req, timeout=60))
u = r.get("usage", {}); rt = (u.get("completion_tokens_details") or {}).get("reasoning_tokens")
print(f"model={r.get('model')} completion_tokens={u.get('completion_tokens')} reasoning_tokens={rt}")
print("OK: reasoning is off on the preset" if rt == 0 else "STILL REASONING: edit the opax preset (reasoning enabled=false) and re-run")
sys.exit(0 if rt == 0 else 1)
