#!/usr/bin/env bash
# Local CNG builds only. No upload or distribution signing configuration.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
VARIANT=${1:?Usage: build-android.sh development|e2e|production [--inside-gate]}
case "$VARIANT" in
  development) TASK=:app:assembleDebug; TYPE=debug ;;
  e2e) TASK=:app:assembleE2e; TYPE=e2e ;;
  production) TASK=:app:assembleRelease; TYPE=release ;;
  *) echo 'Unknown Android build variant' >&2; exit 2 ;;
esac
if [ "${2:-}" != --inside-gate ]; then
  OPAX_LOAD_LIMIT=180 bash scripts/capacity.sh >&2
  build_command bash "$PWD/scripts/build-android.sh" "$VARIANT" --inside-gate
  exit
fi
: "${JAVA_HOME:?Set JAVA_HOME to the local Java 21 installation}"
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
export OPAX_VARIANT=$VARIANT OPAX_TARGET_PLATFORM=android
export OPAX_FIXTURE_PORT=${OPAX_FIXTURE_PORT:-8910} CI=1 EXPO_NO_TELEMETRY=1
OUT="$PWD/build/android/$VARIANT"
mkdir -p "$OUT"
./node_modules/.bin/expo prebuild --platform android --no-install > "$OUT/prebuild.log" 2>&1
# Gradle 9's generated script uses -jar. Keep the wrapper class visible to
# the shared gate's native-build counter without editing generated scripts.
(cd android && "$JAVA_HOME/bin/java" -Xmx64m -Xms64m --enable-native-access=ALL-UNNAMED \
  -Dorg.gradle.appname=gradlew -classpath gradle/wrapper/gradle-wrapper.jar \
  org.gradle.wrapper.GradleWrapperMain "$TASK" --no-daemon --max-workers=2 \
  -PreactNativeArchitectures=arm64-v8a) > "$OUT/gradle.log" 2>&1
APK="android/app/build/outputs/apk/$TYPE/app-$TYPE.apk"
test -s "$APK"
/bin/cp -f "$APK" "$OUT/opax-$TYPE.apk"
echo "PASS $VARIANT Android build: $OUT/opax-$TYPE.apk"
