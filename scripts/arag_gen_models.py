#!/usr/bin/env python3
"""Full list of generative models the KB can use."""
import json
import re
import urllib.request

env = open(".env").read()
tok = re.search(r"^ARAG_KB_TOKEN=(.*)$", env, re.M).group(1)
kb = re.search(r"^ARAG_KB_ID=(.*)$", env, re.M).group(1)
zone = re.search(r"^ARAG_ZONE=(.*)$", env, re.M).group(1)

req = urllib.request.Request(
    f"https://{zone}.rag.progress.cloud/api/v1/kb/{kb}/schema",
    headers={"x-nuclia-serviceaccount": f"Bearer {tok}"},
)
schema = json.load(urllib.request.urlopen(req, timeout=30))
opts = schema["generative_model"]["options"]
print(f"{len(opts)} generative models: (default: {schema['generative_model'].get('default')})")
for o in opts:
    print(f"  {o['value']:32s} {o['name']}")
