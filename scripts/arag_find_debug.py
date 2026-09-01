#!/usr/bin/env python3
"""Dump the raw /find response structure (debugging serialization shapes)."""
import json
import re
import urllib.request

env = open(".env").read()
tok = re.search(r"^ARAG_KB_TOKEN=(.*)$", env, re.M).group(1)
kb = re.search(r"^ARAG_KB_ID=(.*)$", env, re.M).group(1)
zone = re.search(r"^ARAG_ZONE=(.*)$", env, re.M).group(1)

req = urllib.request.Request(
    f"https://{zone}.rag.progress.cloud/api/v1/kb/{kb}/find",
    data=json.dumps({
        "query": "gambling reform",
        "top_k": 2,
        "show": ["basic", "origin", "extra"],
    }).encode(),
    headers={"content-type": "application/json",
             "x-nuclia-serviceaccount": f"Bearer {tok}"},
)
d = json.load(urllib.request.urlopen(req))
r = next(iter(d["resources"].values()))
print("resource keys:", sorted(r.keys()))
flds = r.get("fields") or {}
print("fields keys:", list(flds)[:4])
for fk, fv in list(flds.items())[:2]:
    print(fk, "->", sorted(fv.keys()))
    for pk, pv in list((fv.get("paragraphs") or {}).items())[:1]:
        print("  para:", {k: pv.get(k) for k in ("score", "score_type")})
