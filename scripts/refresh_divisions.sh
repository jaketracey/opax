#!/usr/bin/env bash
# Acquisition and projection only, on the refresh box after review. Never
# publish or push to the KB. Do not run against the desktop DB for diagnosis.
set -euo pipefail
PY="${OPAX_PYTHON:-.venv/bin/python}"
export OPAX_SYNC_KB=0
SINCE=$1
"$PY" -m parli.ingest.federal_feed --db "$OPAX_DB" --start "$SINCE" \
  --stage "${OPAX_OA_STAGE:-$HOME/.cache/autoresearch/oa-feed}" --load-divisions
# XML already writes complete ext_ evidence. The API fallback projects its
# legacy acquisition inside federal_feed, before this exact bill-ID join.
"$PY" -m parli.ingest.tvfy_bill_links --db "$OPAX_DB" --since "$SINCE"
# Keep stdout JSON separate from diagnostics; the wrapper restores exports on failure.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
"$PY" scripts/export_votes.py > "$tmp"
"$PY" scripts/vm/keep_if_unchanged.py portal/public/votes.json "$tmp"
"$PY" scripts/vm/divisions_guard.py --votes-only
