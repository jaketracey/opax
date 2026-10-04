#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export OPAX_VARIANT=production EXPO_NO_TELEMETRY=1 CI=1
if [ "${1:-}" != "--inside-gate" ]; then
  scripts/capacity.sh
  build_command "$PWD/scripts/check-release-bundle.sh" --inside-gate
  exit
fi
mkdir -p private/qa build/production-bundle
./node_modules/.bin/expo prebuild --platform ios --clean > private/qa/release-prebuild.log 2>&1
./node_modules/.bin/tsx scripts/native-config.ts
./node_modules/.bin/tsx scripts/voice-pod-policy.ts
./node_modules/.bin/expo export --platform ios --output-dir build/production-bundle --clear > private/qa/release-export.log 2>&1
./node_modules/.bin/tsx scripts/qa-static.ts --production-bundle build/production-bundle
