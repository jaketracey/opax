#!/usr/bin/env bash
# The build gate sees only this wrapper and one public step name.
set +x
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[ "$#" = 1 ] || { echo 'Expected one release step.' >&2; exit 2; }
exec python3 scripts/release-step.py "$1"
