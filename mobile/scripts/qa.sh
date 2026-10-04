#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
export EXPO_NO_TELEMETRY=1
echo 'OPAX QA: release tooling'
nice -n 10 python3 scripts/test-release-tooling.py
for gate in typecheck lint test qa-static qa-advisories; do
  echo "OPAX QA: $gate"
  if [ "$gate" = test ]; then
    # Bound memory/concurrency and avoid the shared Mac's in-process Jest crash.
    nice -n 10 ./node_modules/.bin/jest --maxWorkers=2
  else
    nice -n 10 npm run "$gate"
  fi
done
