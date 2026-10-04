#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/qa-env.sh"
source "$(dirname "$0")/qa-lock.sh"
if [ -z "${OPAX_CAPACITY_CMD:-}" ]; then
  echo "No capacity command configured; skipping capacity checks." >&2
  exit 0
fi
bash -c "$OPAX_CAPACITY_CMD"
# At or above the limit, wait until the load is under it (one hour at most).
qa_wait_for_capacity "$(($(date +%s) + 3600))"
