#!/usr/bin/env bash
# Run from any directory in the lane worktree. lane | merge | review | profile
set -euo pipefail
TOOLS=$(cd "$(dirname "$0")" && pwd)
# Cached reviews should not enter either heavy queue.
if node "$TOOLS/web-gates.mjs" "$@" --cache-only; then exit 0; else code=$?; [ "$code" = 3 ] || exit "$code"; fi
for arg in "$@"; do [ "$arg" != --cache-only ] || exit 3; done
exec "$TOOLS/ox-heavy.sh" node "$TOOLS/web-gates.mjs" "$@"
