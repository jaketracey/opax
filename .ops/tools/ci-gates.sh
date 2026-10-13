#!/usr/bin/env bash
# Hosted CI consumes the same trusted receipt as Mac/desktop reviews.
set -euo pipefail
TOOLS=$(cd "$(dirname "$0")" && pwd)
if [ -n "${OX_GATE_RECEIPT_JSON:-}" ]; then
  mkdir -p .ops/gate-cache
  node --input-type=module -e 'import {writeFileSync} from "node:fs"; writeFileSync(".ops/gate-cache/ci-import.json",JSON.stringify(JSON.parse(process.env.OX_GATE_RECEIPT_JSON)));'
  node "$TOOLS/gate-cache.mjs" import .ops/gate-cache/ci-import.json
fi
if "$TOOLS/web-gates.sh" merge --base HEAD --cache-only; then
  :
else
  code=$?; [ "$code" = 3 ] || exit "$code"
  if [ "${OX_GATE_REMOTE:-0}" != 0 ]; then
    "$TOOLS/ox-heavy-remote.sh" --tier merge --base HEAD
  else
    "$TOOLS/web-gates.sh" merge --base HEAD
  fi
fi
node "$TOOLS/gate-cache.mjs" verify
node "$TOOLS/gate-cache.mjs" export .ops/gate-cache/ci-pass.json
