#!/usr/bin/env python3
"""List the models available to the opax KB and its current learning config."""
import json
import re
import urllib.request
import urllib.error

env = open(".env").read()
tok = re.search(r"^ARAG_KB_TOKEN=(.*)$", env, re.M).group(1)
kb = re.search(r"^ARAG_KB_ID=(.*)$", env, re.M).group(1)
zone = re.search(r"^ARAG_ZONE=(.*)$", env, re.M).group(1)

H = {"x-nuclia-serviceaccount": f"Bearer {tok}"}

def get(host: str, path: str):
    url = f"https://{zone}.{host}.progress.cloud/api/v1/kb/{kb}{path}"
    req = urllib.request.Request(url, headers=H)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200].decode(errors="replace")
    except Exception as e:  # noqa: BLE001
        return 0, str(e)

for host in ("rag", "dp"):
    for path in ("/configuration", "/schema", "/models", "/configuration/schema"):
        status, body = get(host, path)
        tag = f"{host}{path}"
        if status != 200:
            print(f"--- {tag}: {status}")
            continue
        print(f"=== {tag}: 200 ===")
        if isinstance(body, dict):
            # Print generative/model-related keys compactly.
            for k, v in body.items():
                s = json.dumps(v)
                if any(w in k.lower() for w in ("model", "generative", "semantic", "summary")):
                    print(f"  {k}: {s[:400]}")
            other = [k for k in body if not any(
                w in k.lower() for w in ("model", "generative", "semantic", "summary"))]
            print("  (other keys:", ", ".join(other[:15]), ")")
        else:
            print(" ", str(body)[:300])
