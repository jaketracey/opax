#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export OPAX_VARIANT=e2e OPAX_FIXTURE_PORT=${OPAX_FIXTURE_PORT:-8910} CI=1 EXPO_NO_TELEMETRY=1
source scripts/qa-env.sh
if [ "${1:-}" != "--inside-gate" ]; then
  scripts/capacity.sh >&2
  build_command "$PWD/scripts/build-e2e.sh" --inside-gate
  exit
fi
OUT="$PWD/build/e2e"
mkdir -p "$OUT"
start=$SECONDS
PREBUILD_FLAGS=(--platform ios)
if [ "${OPAX_CLEAN_PREBUILD:-0}" = 1 ]; then PREBUILD_FLAGS+=(--clean); fi
./node_modules/.bin/expo prebuild "${PREBUILD_FLAGS[@]}" > "$OUT/prebuild.log" 2>&1 || { tail -60 "$OUT/prebuild.log" >&2; exit 1; }
# Prebuild templates may add ATS developer defaults: enforce the reviewed variant in the generated plist.
./node_modules/.bin/tsx scripts/native-config.ts
printf 'export NODE_BINARY=%q\n' "$(command -v node)" > ios/.xcode.env.local
xcodebuild -jobs 4 -workspace ios/OPAX.xcworkspace -scheme OPAX -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath "$OUT/DerivedData" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= DEVELOPMENT_TEAM= build > "$OUT/build.log" 2>&1 || { tail -80 "$OUT/build.log" >&2; exit 1; }
APP="$OUT/DerivedData/Build/Products/Release-iphonesimulator/OPAX.app"
test -f "$APP/main.jsbundle" || { echo "Embedded JS bundle missing" >&2; exit 1; }
./node_modules/.bin/tsx scripts/qa-static.ts --app "$APP" >&2
echo "Build seconds: $((SECONDS - start)); app KB: $(/usr/bin/du -sk "$APP" | awk '{print $1}')" | tee "$OUT/metrics.txt" >&2
printf '%s\n' "$APP"
