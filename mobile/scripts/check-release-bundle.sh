#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
export OPAX_VARIANT=production EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 CI=1
if [ "${1:-}" != "--inside-gate" ]; then
  if [ "$(uname -s)" = Darwin ]; then
    scripts/capacity.sh
    build_command "$PWD/scripts/check-release-bundle.sh" --inside-gate
  else
    bash "$PWD/scripts/check-release-bundle.sh" --inside-gate
  fi
  exit
fi
mkdir -p private/qa build/production-bundle
if [ "$(uname -s)" = Darwin ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  OPAX_TARGET_PLATFORM=ios ./node_modules/.bin/expo prebuild --platform ios --clean > private/qa/release-prebuild.log 2>&1
  OPAX_TARGET_PLATFORM=ios ./node_modules/.bin/tsx scripts/native-config.ts
  OPAX_TARGET_PLATFORM=ios ./node_modules/.bin/tsx scripts/voice-pod-policy.ts
else
  echo 'Linux: skipping Xcode-only iOS prebuild, native config and Pod checks.'
fi
for platform in ios android; do
  echo "OPAX QA: $platform production export and bundle policy"
  OPAX_TARGET_PLATFORM=$platform ./node_modules/.bin/expo export --platform "$platform" --output-dir "build/production-bundle/$platform" --clear > "private/qa/release-export-$platform.log" 2>&1
  # qa-static's config assertions cover the shared iOS baseline; its bundle
  # scanner inspects the platform export passed below in both iterations.
  OPAX_TARGET_PLATFORM=ios ./node_modules/.bin/tsx scripts/qa-static.ts --production-bundle "build/production-bundle/$platform"
done
