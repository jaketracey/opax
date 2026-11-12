#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
export EXPO_NO_TELEMETRY=1
# With OPAX_QA_PASS_RECORD_DIR set, a stage that already passed on this exact
# tree, tool versions, dependencies and test environment is skipped; see
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
  echo 'OPAX QA: pass records and build speed regressions'
  nice -n 10 bash scripts/test-qa-pass-record.sh
  bash scripts/qa-pass-record.sh write harness 0 'python3 scripts/test-release-tooling.py && python3 scripts/test-privacy-scan.py && bash scripts/test-qa-lock.sh && bash scripts/test-e2e.sh && bash scripts/test-jest-retry.sh && bash scripts/test-qa-pass-record.sh'
fi
echo 'OPAX QA: Android flow preparation'
nice -n 10 node --test scripts/test-android-flows.mjs
nice -n 10 python3 scripts/test-android-harness.py
nice -n 10 python3 scripts/test-android-results.py
echo 'OPAX QA: design tokens'
nice -n 10 node scripts/build-design-tokens.mjs --check
if record=$(passed gate); then
  echo "OPAX QA: typecheck, lint and test skipped: $record"
else
  for gate in typecheck lint test; do
    echo "OPAX QA: $gate"
    nice -n 10 npm run "$gate"
  done
  bash scripts/qa-pass-record.sh write gate 0 'for gate in typecheck lint test; do nice -n 10 npm run "$gate"; done'
fi
for gate in qa-static qa-advisories; do
  echo "OPAX QA: $gate"
  nice -n 10 npm run "$gate"
done
echo 'OPAX QA: Android production export'
nice -n 10 bash scripts/check-release-bundle.sh --android
