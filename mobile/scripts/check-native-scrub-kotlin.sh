#!/bin/bash
# Runs the Kotlin copy of the crash report scrub (opaxScrubNativeEvent and opaxScrubMessage), cut
# straight from patches/@posthog+react-native-plugin+2.13.0.patch, on the invented inputs in
# tests/fixtures/exception-scrub-cases.json, and prints what it keeps as JSON, as
# scripts/check-native-scrub.sh does for the Swift copy. tests/native-scrub-kotlin.test.ts
# compares that with the JavaScript rules (src/analytics/exceptions.ts and events.ts).
#
#   scripts/check-native-scrub-kotlin.sh [cases.json]
#   scripts/check-native-scrub-kotlin.sh --probe    exit 0 when it can run here, 3 when not
#
# Needs Java 17 or later (JAVA_HOME, else `java`) and the Kotlin compiler Gradle has already
# cached for the Android build (kotlin-compiler-embeddable and its dependencies under
# ~/.gradle/caches), so it runs on the Android desktop with no install and no Gradle project.
# This runs on the JVM's java.util.regex, not Android's ICU-based regex: it checks the Kotlin
# logic against the JS rules, not that every pattern loads on a phone. The on-device logcat
# check in docs/android-crash-plugin-checks.md does that, and this does not replace it.
set -euo pipefail
MOBILE=$(cd "$(dirname "$0")/.." && pwd)
PATCH="$MOBILE/patches/@posthog+react-native-plugin+2.13.0.patch"
CACHE=${GRADLE_USER_HOME:-$HOME/.gradle}/caches/modules-2/files-2.1
JAVA=${JAVA_HOME:+$JAVA_HOME/bin/}java

# The newest cached jar of one artifact (any version unless one is given).
cached() {
  find "$CACHE/$1/$2" -name "$2-${3:-*}.jar" ! -name '*-sources.jar' ! -name '*-javadoc.jar' 2>/dev/null |
    sort | tail -n 1
}
unavailable() { echo "Kotlin scrub check unavailable here: $1" >&2; exit 3; }
COMPILER=$(cached org.jetbrains.kotlin kotlin-compiler-embeddable)
[ -n "$COMPILER" ] || unavailable "no cached kotlin-compiler-embeddable under $CACHE"
VERSION=$(basename "$COMPILER" .jar)
VERSION=${VERSION#kotlin-compiler-embeddable-}
STDLIB=$(cached org.jetbrains.kotlin kotlin-stdlib "$VERSION")
[ -n "$STDLIB" ] || unavailable "no cached kotlin-stdlib $VERSION"
CLASSPATH=$COMPILER:$STDLIB
for ARTIFACT in "org.jetbrains.kotlin kotlin-script-runtime $VERSION" "org.jetbrains.kotlin kotlin-reflect $VERSION" \
  "org.jetbrains.kotlin kotlin-daemon-embeddable $VERSION" "org.jetbrains.intellij.deps trove4j" \
  "org.jetbrains.kotlinx kotlinx-coroutines-core-jvm" "org.jetbrains annotations"; do
  # shellcheck disable=SC2086
  JAR=$(cached $ARTIFACT)
  [ -n "$JAR" ] || unavailable "no cached ${ARTIFACT% *} for Kotlin $VERSION"
  CLASSPATH=$CLASSPATH:$JAR
done
SPEC=$("$JAVA" -XshowSettings:properties -version 2>&1 | sed -n 's/^ *java\.specification\.version = //p' || true)
[[ "$SPEC" =~ ^[0-9]+$ ]] && [ "$SPEC" -ge 17 ] || unavailable "needs Java 17 or later; $JAVA is ${SPEC:-not runnable}"
[ "${1:-}" != --probe ] || exit 0

CASES=${1:-$MOBILE/tests/fixtures/exception-scrub-cases.json}
[ -f "$CASES" ] || { echo "No cases at $CASES." >&2; exit 2; }
WORK=$(mktemp -d "${TMPDIR:-/tmp}/opax-native-scrub-kt.XXXXXX")
trap '/bin/rm -rf "$WORK"' EXIT

# The block the patch adds to PosthogReactNativePluginModule.kt, between its two OPAX comments.
# Unchanged lines diff kept as context inside it are part of it; one hunk must hold it all.
awk '
  /^\+\+\+ / { kotlin = ($0 ~ /PosthogReactNativePluginModule\.kt$/); next }
  kotlin && /^\+\/\/ OPAX privacy patch \(/ { grab = 1 }
  !grab { next }
  /^@@/ || /^--- / { exit }
  /^-/ { next }
  { print substr($0, 2) }
  /^\+\/\/ OPAX privacy patch end/ { done = 1; exit }
  END { exit !done }
' "$PATCH" > "$WORK/block.kt" ||
  { echo 'No whole Kotlin scrub block in the plugin patch.' >&2; exit 1; }

# One file, so the driver can read the block's private rules as the plugin's own file does.
cat "$MOBILE/scripts/native-scrub/prelude.kt" "$WORK/block.kt" "$MOBILE/scripts/native-scrub/driver.kt" > "$WORK/Main.kt"
"$JAVA" -Xmx1g -cp "$CLASSPATH" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -nowarn \
  -classpath "$STDLIB" -jvm-target 17 -d "$WORK/out" "$WORK/Main.kt" >&2
"$JAVA" -cp "$WORK/out:$STDLIB" MainKt "$CASES"
