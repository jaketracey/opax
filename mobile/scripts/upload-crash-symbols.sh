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
# API key with the error_tracking:write scope in POSTHOG_CLI_API_KEY. When that
# is unset, the script loads ~/.config/opax/posthog.env itself, only if the
# file is mode 600 and yours. It uploads only to the OPAX project and refuses
# any other POSTHOG_PROJECT_ID or POSTHOG_CLI_PROJECT_ID. POSTHOG_CLI_HOST
# defaults to the file's POSTHOG_HOST, then PostHog US. Without a key it prints
# one line and uploads nothing.
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

PROJECT=507367 # the OPAX project (docs/ANALYTICS.md)
KEY_FILE="$HOME/.config/opax/posthog.env"
key_file_mode() { stat -c '%a %u' "$1" 2>/dev/null || stat -f '%Lp %u' "$1"; }

# xtrace would print the key, so it stays off while the key file loads and the
# key is checked, and comes back on afterwards if the caller had it on.
case $- in *x*) XTRACE=1; set +x ;; *) XTRACE= ;; esac
# The key file holds a key for every PostHog project. It is loaded here, inside
# this process only, so no build step, Xcode, Gradle or Metro ever sees it.
if [ -z "${POSTHOG_CLI_API_KEY:-}" ] && [ -e "$KEY_FILE" ]; then
  if [ ! -f "$KEY_FILE" ] || [ "$(key_file_mode "$KEY_FILE")" != "600 $(id -u)" ]; then
    echo "Crash symbols: $KEY_FILE must be mode 600 and yours; skipped the PostHog upload for $PLATFORM $VERSION ($BUILD)."
    exit 0
  fi
  # Silent, and without -e or -u: macOS bash 3.2 would otherwise exit on a bad
  # line with no message, and the shell's error could quote part of a value.
  set -a +eu
  # shellcheck source=/dev/null
  . "$KEY_FILE" >/dev/null 2>&1
  LOADED=$?
  set +a -eu
  [ "$LOADED" = 0 ] || { echo "Crash symbols: could not load $KEY_FILE; skipped the PostHog upload." >&2; exit 1; }
fi
HAVE_KEY=${POSTHOG_CLI_API_KEY:+1}
[ -z "$XTRACE" ] || set -x

if [ -z "$HAVE_KEY" ]; then
  echo "Crash symbols: POSTHOG_CLI_API_KEY is not set; skipped the PostHog upload for $PLATFORM $VERSION ($BUILD)."
  exit 0
fi
for NAME in POSTHOG_PROJECT_ID POSTHOG_CLI_PROJECT_ID; do
  [ "${!NAME:-$PROJECT}" = "$PROJECT" ] ||
    { echo "Crash symbols: $NAME is not the OPAX project ($PROJECT); refused the PostHog upload." >&2; exit 1; }
done
export POSTHOG_CLI_PROJECT_ID=$PROJECT
# The CLI's default host is PostHog US; the key file names its host as POSTHOG_HOST.
if [ -z "${POSTHOG_CLI_HOST:-}" ] && [ -n "${POSTHOG_HOST:-}" ]; then export POSTHOG_CLI_HOST=$POSTHOG_HOST; fi

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
  "$CLI" dsym upload --directory "$NATIVE/dSYMs" --main-dsym OPAX.app.dSYM --skip-on-conflict "${RELEASE[@]}"
elif [ -n "$NATIVE" ]; then
  # posthog-android's map ID when the app embeds none: package@versionName+versionCode.
  "$CLI" proguard upload --path "$NATIVE" --map-id "au.com.opax.app@$VERSION+$BUILD" "${RELEASE[@]}"
fi
echo "Crash symbols: uploaded $PLATFORM $VERSION ($BUILD), chunk $CHUNK_ID."
