#!/usr/bin/env bash
# Acquisition and projection only, on the refresh box after review. Never
# publish or push to the KB. Do not run against the desktop DB for diagnosis.
set -euo pipefail
PY="${OPAX_PYTHON:-.venv/bin/python}"
export OPAX_SYNC_KB=0
SINCE=$1
"$PY" -m parli.ingest.tvfy_refresh --db "$OPAX_DB" --since "$SINCE" --relist --strict
# No --limit/--days: project complete chamber-days across the entire window.
"$PY" -m parli.ingest.votes_ingest --db "$OPAX_DB" --from-legacy --load-ext-only --strict-ext --since "$SINCE"
# Keep stdout JSON separate from diagnostics; the wrapper restores exports on failure.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
"$PY" scripts/export_votes.py > "$tmp"
"$PY" scripts/vm/keep_if_unchanged.py portal/public/votes.json "$tmp"
"$PY" scripts/vm/divisions_guard.py --votes-only
