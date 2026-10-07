#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer EXPO_NO_TELEMETRY=1
UDID=${1:?Pass an assigned simulator UDID}
source scripts/qa-env.sh
allow_simulator "$UDID"
scripts/capacity.sh
trap 'xcrun simctl shutdown "$UDID" 2>/dev/null || true' EXIT
boot_simulator "$UDID"
python3 scripts/apply-privacy-patches.py
build_command env OPAX_VARIANT=development ./node_modules/.bin/expo run:ios --device "$UDID" --no-build-cache
