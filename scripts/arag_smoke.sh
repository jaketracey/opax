#!/usr/bin/env bash
# Smoke checks against the opax KB using the data-plane token in .env.
set -uo pipefail
cd "$(dirname "$0")/.."
TOKEN=$(grep '^ARAG_KB_TOKEN=' .env | cut -d= -f2-)
KB=$(grep '^ARAG_KB_ID=' .env | cut -d= -f2-)
ZONE=$(grep '^ARAG_ZONE=' .env | cut -d= -f2-)
RAG="https://${ZONE}.rag.progress.cloud/api/v1/kb/${KB}"
H="x-nuclia-serviceaccount: Bearer ${TOKEN}"

echo "=== counters ==="
curl -s --max-time 20 -H "$H" "$RAG/counters"
echo
echo "=== find: gambling ==="
curl -s --max-time 30 -H "$H" -H 'content-type: application/json' \
  -d '{"query":"gambling reform","top_k":3,"reranker":"predict"}' "$RAG/find" \
  | python3 -c "
import json,sys
d = json.load(sys.stdin)
res = d.get('resources') or {}
print('resources:', len(res))
for rid, r in list(res.items())[:3]:
    print(' -', r.get('slug'), repr(r.get('title'))[:80])
"
