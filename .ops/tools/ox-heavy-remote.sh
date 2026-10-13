#!/usr/bin/env bash
set -euo pipefail
TOOLS=$(cd "$(dirname "$0")" && pwd)
exec node "$TOOLS/heavy-remote.mjs" "$@"
