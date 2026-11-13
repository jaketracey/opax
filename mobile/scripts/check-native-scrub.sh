#!/bin/bash
# Runs the Swift copy of the crash report scrub, cut straight from
# patches/@posthog+react-native-plugin+2.13.0.patch, on the invented inputs in
# tests/fixtures/exception-scrub-cases.json, and prints what it keeps as JSON.
# tests/native-scrub.test.ts compares that with the JavaScript rules
# (src/analytics/exceptions.ts and events.ts).
#
#   scripts/check-native-scrub.sh [cases.json]
#
# Needs only `swift` (Xcode or its command line tools): no simulator, Xcode project or
# PostHog SDK. The Kotlin copy is not compiled here. It uses the same pattern texts, which
# the test compares, and on Android the same regex engine (ICU) as NSRegularExpression.
set -euo pipefail
MOBILE=$(cd "$(dirname "$0")/.." && pwd)
PATCH="$MOBILE/patches/@posthog+react-native-plugin+2.13.0.patch"
CASES=${1:-$MOBILE/tests/fixtures/exception-scrub-cases.json}
[ -f "$CASES" ] || { echo "No cases at $CASES." >&2; exit 2; }
WORK=$(mktemp -d "${TMPDIR:-/tmp}/opax-native-scrub.XXXXXX")
trap '/bin/rm -rf "$WORK"' EXIT

# The block the patch adds to PosthogReactNativePlugin.swift, between its two OPAX comments.
# Unchanged lines diff kept as context inside it are part of it; one hunk must hold it all.
awk '
  /^\+\+\+ / { swift = ($0 ~ /PosthogReactNativePlugin\.swift$/); next }
  swift && /^\+\/\/ OPAX privacy patch \(/ { grab = 1 }
  !grab { next }
  /^@@/ || /^--- / { exit }
  /^-/ { next }
  { print substr($0, 2) }
  /^\+\/\/ OPAX privacy patch end/ { done = 1; exit }
  END { exit !done }
' "$PATCH" > "$WORK/block.swift" ||
  { echo 'No whole Swift scrub block in the plugin patch.' >&2; exit 1; }

cat "$MOBILE/scripts/native-scrub/prelude.swift" "$WORK/block.swift" \
  "$MOBILE/scripts/native-scrub/driver.swift" > "$WORK/main.swift"
# The plugin builds as Swift 5 (its podspec); the module cache stays in the scratch folder.
swift -swift-version 5 -module-cache-path "$WORK/cache" "$WORK/main.swift" "$CASES"
