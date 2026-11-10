#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
export EXPO_NO_TELEMETRY=1
# With OPAX_QA_PASS_RECORD_DIR set, a stage that already passed on this exact
# tree (same tree hash, Node and Python) is reported and skipped; see
# scripts/qa-pass-record.sh. qa-static and qa-advisories always run.
passed() { bash scripts/qa-pass-record.sh check "$1"; }
if record=$(passed harness); then
  echo "OPAX QA: harness self-tests skipped: $record"
else
  echo 'OPAX QA: release tooling'
  nice -n 10 python3 scripts/test-release-tooling.py
  nice -n 10 python3 scripts/test-privacy-scan.py
  echo 'OPAX QA: shared-host lock'
  nice -n 10 bash scripts/test-qa-lock.sh
  echo 'OPAX QA: simulator lifetime'
  nice -n 10 bash scripts/test-e2e.sh
  echo 'OPAX QA: Jest retry policy'
  nice -n 10 bash scripts/test-jest-retry.sh
  bash scripts/qa-pass-record.sh write harness
fi
echo 'OPAX QA: design tokens'
nice -n 10 node scripts/build-design-tokens.mjs --check
if record=$(passed gate); then
  echo "OPAX QA: typecheck, lint and test skipped: $record"
else
  for gate in typecheck lint test; do
    echo "OPAX QA: $gate"
    nice -n 10 npm run "$gate"
  done
  bash scripts/qa-pass-record.sh write gate
fi
for gate in qa-static qa-advisories; do
  echo "OPAX QA: $gate"
  nice -n 10 npm run "$gate"
done
