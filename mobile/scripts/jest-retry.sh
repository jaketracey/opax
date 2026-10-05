#!/usr/bin/env bash
# Retry the shared host's worker SIGSEGV once; preserve all other test failures.
set -euo pipefail
cd "$(dirname "$0")/.."
# Node 24's V8 can segfault in GC (ClearStaleLeftTrimmedPointerVisitor) after
# Sparkplug leaves a stale frame slot: nodejs/node#62393. The flag is refused in
# NODE_OPTIONS, so pass it to node directly; Jest workers inherit execArgv.
JEST=(node --no-sparkplug ./node_modules/.bin/jest)
# Watch mode needs the caller's TTY for keyboard prompts. There is no retry
# wrapper in an interactive session; preserve Jest's descriptors and exit code.
for argument in "$@"; do
  case "$argument" in
    --watch|--watchAll|--watch=true|--watchAll=true)
      exec "${JEST[@]}" "$@" ;;
  esac
done
LOG=$(mktemp "${TMPDIR:-/tmp}/opax-jest.XXXXXX")
trap '/bin/rm -f "$LOG"' EXIT
for attempt in 1 2; do
  rc=0
  "${JEST[@]}" "$@" 2>&1 | tee "$LOG" || rc=${PIPESTATUS[0]}
  [ "$rc" = 0 ] && exit 0
  if [ "$attempt" = 1 ] && grep -Eiq 'jest worker.*SIGSEGV' "$LOG"; then
    echo 'OPAX Jest: worker SIGSEGV on the shared host; retrying once.' >&2
  else
    exit "$rc"
  fi
done
