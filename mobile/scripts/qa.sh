#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
export EXPO_NO_TELEMETRY=1
for gate in typecheck lint test qa-static qa-advisories; do
  echo "OPAX QA: $gate"
  nice -n 10 npm run "$gate"
done
