#!/usr/bin/env bash
# Local upload-signed CNG bundle. Does not upload or contact Play Console.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
: "${OPAX_ANDROID_VERSION_CODE:?Set a new YYYYMMDDrr Android versionCode}"
[[ "$OPAX_ANDROID_VERSION_CODE" =~ ^[1-9][0-9]{9}$ ]] || { echo 'Expected YYYYMMDDrr versionCode' >&2; exit 2; }
if [ "${1:-}" != --inside-gate ]; then
  OPAX_LOAD_LIMIT=180 bash scripts/capacity.sh >&2
  build_command bash "$PWD/scripts/build-play.sh" --inside-gate
  exit
fi
: "${JAVA_HOME:?Set JAVA_HOME to Java 21}"
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
export OPAX_VARIANT=production OPAX_TARGET_PLATFORM=android OPAX_PLAY_BUILD=1
export OPAX_BUILD_NUMBER=$OPAX_ANDROID_VERSION_CODE CI=1 EXPO_NO_TELEMETRY=1
OUT="$PWD/private/play"
mkdir -p "$OUT"
./node_modules/.bin/expo prebuild --platform android --no-install > "$OUT/prebuild.log" 2>&1
(cd android && "$JAVA_HOME/bin/java" -Xmx64m -Xms64m --enable-native-access=ALL-UNNAMED \
  -Dorg.gradle.appname=gradlew -classpath gradle/wrapper/gradle-wrapper.jar \
  org.gradle.wrapper.GradleWrapperMain :app:bundleRelease :app:assembleRelease \
  --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a,x86_64) > "$OUT/gradle.log" 2>&1
AAB="android/app/build/outputs/bundle/release/app-release.aab"
APK="android/app/build/outputs/apk/release/app-release.apk"
test -s "$AAB" && test -s "$APK"
/bin/cp -f "$AAB" "$OUT/opax-$OPAX_BUILD_NUMBER.aab"
/bin/cp -f "$APK" "$OUT/opax-$OPAX_BUILD_NUMBER.apk"
echo "PASS local upload-signed Android $OPAX_BUILD_NUMBER bundle and APK"
