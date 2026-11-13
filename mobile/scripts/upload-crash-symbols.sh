#!/bin/bash
# Uploads one release build's crash report symbols to PostHog
# (docs/ANALYTICS.md): the composed Hermes source map, so JS frames show the
# source line, and the dSYMs (iOS) or R8 mapping (Android), so native frames
# show function names. The app does not depend on this. Without symbols the
# same reports arrive with unreadable frames, and the upload can be rerun
# later against the kept release evidence.
#
#   scripts/upload-crash-symbols.sh ios <version> <build> <evidence dir> <OPAX.xcarchive>
#   scripts/upload-crash-symbols.sh android <version> <versionCode> <symbols dir> [mapping.txt]
#
# On iOS <evidence dir> is the release evidence folder: the archive step
# (scripts/release-step.py) writes the composed main.jsbundle.map and
# ios.chunk-id there, beside the archive, and verify-ios-release.py checks
# them before this runs. On Android <symbols dir> holds the composed
# index.android.bundle.map (Gradle writes it to
# android/app/build/generated/sourcemaps/react/release/) and android.chunk-id,
# which metro.config.js writes when the bundle is built with OPAX_SYMBOLS_DIR set.
#
# Needs posthog-cli 0.20 or later (npm install -g @posthog/cli) and a personal
# API key with the error_tracking:write scope in POSTHOG_CLI_API_KEY.
# POSTHOG_CLI_PROJECT_ID defaults to the OPAX project and POSTHOG_CLI_HOST to
# PostHog US. Without a key it prints one line and uploads nothing.
set -euo pipefail

usage() {
  echo 'Usage: upload-crash-symbols.sh ios <version> <build> <symbols dir> <xcarchive>' >&2
  echo '       upload-crash-symbols.sh android <version> <versionCode> <symbols dir> [mapping.txt]' >&2
  exit 2
}
[ "$#" -ge 4 ] && [ "$#" -le 5 ] || usage
PLATFORM=$1 VERSION=$2 BUILD=$3 SYMBOLS=$4 NATIVE=${5:-}
case "$PLATFORM" in
  ios) MAP=main.jsbundle.map; [ -n "$NATIVE" ] || usage ;;
  android) MAP=index.android.bundle.map ;;
  *) usage ;;
esac
[[ "$VERSION" =~ ^[0-9]{1,4}(\.[0-9]{1,4}){0,3}$ && "$BUILD" =~ ^[1-9][0-9]{0,9}$ ]] || usage

if [ -z "${POSTHOG_CLI_API_KEY:-}" ]; then
  echo "Crash symbols: POSTHOG_CLI_API_KEY is not set; skipped the PostHog upload for $PLATFORM $VERSION ($BUILD)."
  exit 0
fi
# The OPAX project (docs/ANALYTICS.md); the CLI's default host is PostHog US.
export POSTHOG_CLI_PROJECT_ID=${POSTHOG_CLI_PROJECT_ID:-507367}

CLI=$(command -v posthog-cli || true)
if [ -z "$CLI" ] && [ -x "$HOME/.posthog/posthog-cli" ]; then CLI="$HOME/.posthog/posthog-cli"; fi
[ -n "$CLI" ] || { echo 'Crash symbols: posthog-cli not found (npm install -g @posthog/cli).' >&2; exit 1; }

CHUNK_ID=$(tr -d '[:space:]' < "$SYMBOLS/$PLATFORM.chunk-id")
[[ "$CHUNK_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] ||
  { echo "Crash symbols: no chunk ID in $SYMBOLS/$PLATFORM.chunk-id." >&2; exit 1; }
[ -s "$SYMBOLS/$MAP" ] || { echo "Crash symbols: no composed source map at $SYMBOLS/$MAP." >&2; exit 1; }

# React Native's composed Hermes map drops the bundle's debug ID; restore it on
# a copy so the CLI can match the map to the chunk ID JS frames report.
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/opax-crash-symbols.XXXXXX")
trap '/bin/rm -rf "$STAGE"' EXIT
node -e '
const fs = require("node:fs");
const [source, id, target] = process.argv.slice(1);
const map = JSON.parse(fs.readFileSync(source, "utf8"));
if (map.debugId && map.debugId !== id) throw new Error("Source map debug ID differs from the recorded chunk ID");
map.debugId = id;
fs.writeFileSync(target, JSON.stringify(map));
' "$SYMBOLS/$MAP" "$CHUNK_ID" "$STAGE/$MAP"

# Releases resolve per event from $app_namespace, $app_version and $app_build,
# which these must match (src/analytics/index.ts).
RELEASE=(--release-name au.com.opax.app --release-version "$VERSION" --build "$BUILD")
"$CLI" hermes upload --directory "$STAGE" --release-mode event "${RELEASE[@]}"
if [ "$PLATFORM" = ios ]; then
  [ -d "$NATIVE/dSYMs/OPAX.app.dSYM" ] || { echo "Crash symbols: no OPAX.app.dSYM in $NATIVE/dSYMs." >&2; exit 1; }
  "$CLI" dsym upload --directory "$NATIVE/dSYMs" --main-dsym OPAX.app.dSYM "${RELEASE[@]}"
elif [ -n "$NATIVE" ]; then
  # posthog-android's map ID when the app embeds none: package@versionName+versionCode.
  "$CLI" proguard upload --path "$NATIVE" --map-id "au.com.opax.app@$VERSION+$BUILD" "${RELEASE[@]}"
fi
echo "Crash symbols: uploaded $PLATFORM $VERSION ($BUILD), chunk $CHUNK_ID."
