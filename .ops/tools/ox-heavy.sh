#!/usr/bin/env bash
# One niced heavy job per host. Keep the original directory/pid lock protocol.
# Only recognised web gate commands can spill to the desktop; deploys stay local.
set -uo pipefail
TOOLS=$(cd "$(dirname "$0")" && pwd) || exit 2
LOCK=${OX_HEAVY_LOCK:-/tmp/opax-heavy.lock}
if [ "$(uname -s)" = Linux ] && [ -d "$HOME/opax-work" ]; then
  LOCK=${OX_HEAVY_LOCK:-$HOME/opax-work/heavy.lock}
  export OX_HEAVY_LOCAL=1
fi
WAIT=${OX_HEAVY_WAIT:-3600}
start=$(date +%s)
while ! mkdir "$LOCK" 2>/dev/null; do
  owner=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
    rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null; continue
  fi
  if [ "${OX_HEAVY_LOCAL:-0}" != 1 ] && "$TOOLS/ox-heavy-remote.sh" --available "$@" >/dev/null 2>&1; then
    echo 'ox-heavy: Mac busy; routing web gate to desktop' >&2
    exec "$TOOLS/ox-heavy-remote.sh" --route "$@"
  fi
  if [ $(( $(date +%s) - start )) -ge "$WAIT" ]; then echo "ox-heavy: waited ${WAIT}s for the heavy lock; giving up" >&2; exit 75; fi
  sleep "${OX_HEAVY_POLL:-5}"
done
echo $$ > "$LOCK/pid"
trap 'rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null' EXIT
nice -n 10 "$@"
