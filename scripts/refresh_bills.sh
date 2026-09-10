#!/usr/bin/env bash
# Refresh current federal bill records, export the site projection and update KB.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${OPAX_PYTHON:-.venv/bin/python}"
PARLIAMENT="${OPAX_BILL_PARLIAMENT:-48}"
"$PY" scripts/bills_registry/bills_fetch.py --parliaments "$PARLIAMENT" --refresh
"$PY" scripts/export_bills.py --out portal/public/bills
if [ "${OPAX_SYNC_KB:-0}" = 1 ]; then
  keys=$("$PY" - "$PARLIAMENT" <<'PY'
import json,sys
index=json.load(open('portal/public/bills/index.json'))
print(','.join(b['key'] for b in index['bills'] if b['parliament']==int(sys.argv[1])))
PY
)
  [ -n "$keys" ] || { echo 'No current-parliament bills to publish' >&2; exit 1; }
  "$PY" scripts/publish_bills.py --bills-dir portal/public/bills --keys "$keys" --workers 4 --rate 4
fi
