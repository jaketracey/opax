#!/usr/bin/env bash
# Retry the shared host's worker SIGSEGV once; preserve all other test failures.
set -euo pipefail
cd "$(dirname "$0")/.."
LOG=$(mktemp "${TMPDIR:-/tmp}/opax-jest.XXXXXX")
trap '/bin/rm -f "$LOG"' EXIT
for attempt in 1 2; do
  rc=0
  ./node_modules/.bin/jest "$@" 2>&1 | tee "$LOG" || rc=${PIPESTATUS[0]}
  [ "$rc" = 0 ] && exit 0
  if [ "$attempt" = 1 ] && grep -Eiq 'jest worker.*SIGSEGV' "$LOG"; then
    echo 'OPAX Jest: worker SIGSEGV on the shared host; retrying once.' >&2
  else
    exit "$rc"
  fi
done
