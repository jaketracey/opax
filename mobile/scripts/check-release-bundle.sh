#!/usr/bin/env bash
# Production bundle policy.
#   check-release-bundle.sh              iOS (Mac: prebuild, native config, Pod
#                                        policy, export) plus the Android export.
#   check-release-bundle.sh --android    Android export and policy only: no
#                                        prebuild, so npm run qa leaves ios/ alone.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
# Both production exports ignore local dotenv files, including through the gate.
export OPAX_VARIANT=production EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 CI=1
android_export() {
  echo 'OPAX QA: android production export and bundle policy'
  mkdir -p private/qa build/production-bundle-android
  OPAX_TARGET_PLATFORM=android ./node_modules/.bin/expo export --platform android --output-dir build/production-bundle-android --clear > private/qa/release-export-android.log 2>&1
  # qa-static's config assertions cover the shared iOS baseline; its bundle
  # scanner inspects the Android export passed here.
  OPAX_TARGET_PLATFORM=ios ./node_modules/.bin/tsx scripts/qa-static.ts --production-bundle build/production-bundle-android
}
if [ "${1:-}" = --android ]; then
  android_export
  exit
fi
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
  ./node_modules/.bin/expo prebuild --platform ios --clean > private/qa/release-prebuild.log 2>&1
  ./node_modules/.bin/tsx scripts/native-config.ts
  ./node_modules/.bin/tsx scripts/voice-pod-policy.ts
else
  echo 'Linux: skipping Xcode-only iOS prebuild, native config and Pod checks.'
fi
echo 'OPAX QA: ios production export and bundle policy'
OPAX_TARGET_PLATFORM=ios ./node_modules/.bin/expo export --platform ios --output-dir build/production-bundle --clear > private/qa/release-export.log 2>&1
./node_modules/.bin/tsx scripts/qa-static.ts --production-bundle build/production-bundle
android_export
