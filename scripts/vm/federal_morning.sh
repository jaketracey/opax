#!/usr/bin/env bash
# Not installed/enabled. The orchestrator supplies DB, stage and output paths.
set -euo pipefail
cd "$(dirname "$0")/../.."
PIPE="${OPAX_PIPE:-$HOME/.cache/autoresearch/pipeline}"
mkdir -p "$PIPE"
exec 8>"$PIPE/nightly.lock"
flock -n 8 || exit 1
exec 9>"$PIPE/daily_refresh.lock"
flock -n 9 || exit 1
timeout --kill-after=60 "${OPAX_FEDERAL_MORNING_TIMEOUT:-20m}" \
  "${OPAX_PYTHON:-.venv/bin/python}" scripts/federal_morning.py "$@"
