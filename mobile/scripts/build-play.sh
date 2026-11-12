#!/usr/bin/env bash
# Local upload-signed CNG bundle. Does not upload or contact Play Console.
set +x
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
EXPECTED_COMMIT= EXPECTED_VOICE_MODE= INSIDE_GATE=0
CALLER_VOICE_MODE_SET=${OPAX_PRODUCTION_VOICE+x}
CALLER_VOICE_MODE=${OPAX_PRODUCTION_VOICE-}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --expected-commit|--expected-voice-mode)
      [ "$#" -ge 2 ] || { echo 'Option requires a value' >&2; exit 2; }
      case "$1" in
        --expected-commit) EXPECTED_COMMIT=$2 ;;
        --expected-voice-mode) EXPECTED_VOICE_MODE=$2 ;;
      esac
      shift 2 ;;
    --inside-gate) INSIDE_GATE=1; shift ;;
    --help) echo 'build-play.sh --expected-commit <full SHA> --expected-voice-mode 0|1'; exit 0 ;;
    *) echo 'Unknown release option' >&2; exit 2 ;;
  esac
done
[[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo 'Release requires --expected-commit with the full QA-approved SHA.' >&2; exit 2; }
case "$EXPECTED_VOICE_MODE" in 0|1) ;; *) echo 'Release requires --expected-voice-mode 0 or 1.' >&2; exit 2 ;; esac
source scripts/qa-env.sh
source scripts/android-gradle.sh
source scripts/qa-lock.sh
if [ "$CALLER_VOICE_MODE_SET" = x ]; then export OPAX_PRODUCTION_VOICE=$CALLER_VOICE_MODE; fi
export OPAX_PRODUCTION_VOICE=${OPAX_PRODUCTION_VOICE-1}
export EXPO_NO_DOTENV=1 PYTHONDONTWRITEBYTECODE=1
check_inputs() {
  python3 - "$EXPECTED_COMMIT" "$EXPECTED_VOICE_MODE" <<'PY'
import os, sys
from pathlib import Path
sys.path.insert(0, 'scripts')
from release_inputs import clean_commit, refuse_dotenv
from android_release import require, version_code
clean_commit(Path.cwd().parent, sys.argv[1])
refuse_dotenv(Path.cwd())
require(os.environ.get('OPAX_PRODUCTION_VOICE') == sys.argv[2],
        'Release refused: effective voice mode differs from the explicit expected mode.')
version_code(os.environ.get('OPAX_ANDROID_VERSION_CODE'))
PY
}
check_inputs
if [ "$INSIDE_GATE" != 1 ]; then
  if [ "$(uname -s)" = Linux ]; then
    qa_native_lock_run bash "$PWD/scripts/build-play.sh" --inside-gate --expected-commit "$EXPECTED_COMMIT" --expected-voice-mode "$EXPECTED_VOICE_MODE"
  else
    OPAX_LOAD_LIMIT=180 bash scripts/capacity.sh >&2
    build_command bash "$PWD/scripts/build-play.sh" --inside-gate --expected-commit "$EXPECTED_COMMIT" --expected-voice-mode "$EXPECTED_VOICE_MODE"
  fi
  exit
fi
if [ "$(uname -s)" = Linux ]; then qa_assert_native_lock; fi
: "${JAVA_HOME:?Set JAVA_HOME to Java 21}"
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
export OPAX_VARIANT=production OPAX_TARGET_PLATFORM=android OPAX_PLAY_BUILD=1
export OPAX_BUILD_NUMBER=$OPAX_ANDROID_VERSION_CODE CI=1 EXPO_NO_TELEMETRY=1
unset OPAX_DEV_ORIGIN OPAX_FIXTURE_PORT EXPO_PUBLIC_API_ORIGIN
OUT="$PWD/private/play/$OPAX_BUILD_NUMBER"
[ ! -e "$OUT" ] || { echo 'Release evidence already exists; retain it and use a new versionCode.' >&2; exit 1; }
mkdir -p "$OUT"
git check-ignore -q "$OUT" || { echo 'Release evidence must be git-ignored.' >&2; exit 1; }
printf '%s\n' "$EXPECTED_COMMIT" > "$OUT/commit.txt"
printf '%s\n' "$EXPECTED_VOICE_MODE" > "$OUT/production-voice-switch.txt"
check_inputs
./node_modules/.bin/expo config --type public --json > "$OUT/config.json"
python3 - "$OUT/config.json" "$EXPECTED_VOICE_MODE" <<'PY'
import json, sys
config=json.load(open(sys.argv[1]))
assert (config['extra'].get('productionVoiceEnabled') is True) == (sys.argv[2] == '1'), 'Effective Expo voice mode mismatch'
PY
# Upload builds keep the provenance guards and use a fresh android/.
export OPAX_GRADLE_DAEMON=0 OPAX_GRADLE_CACHE_ENABLED=0
android_gradle_args
./node_modules/.bin/expo prebuild --platform android --no-install > "$OUT/prebuild.log" 2>&1
(cd android && "$JAVA_HOME/bin/java" -Xmx64m -Xms64m --enable-native-access=ALL-UNNAMED \
  -Dorg.gradle.appname=gradlew -classpath gradle/wrapper/gradle-wrapper.jar \
  org.gradle.wrapper.GradleWrapperMain :app:bundleRelease :app:assembleRelease \
  "${ANDROID_GRADLE_ARGS[@]}" -PreactNativeArchitectures=arm64-v8a,x86_64) > "$OUT/gradle.log" 2>&1
check_inputs
./node_modules/.bin/expo config --type public --json > "$OUT/config-after.json"
python3 - "$OUT" "$EXPECTED_COMMIT" "$EXPECTED_VOICE_MODE" <<'PY'
import json, os, re, shutil, sys, zipfile
from pathlib import Path
sys.path.insert(0, 'scripts')
from android_release import configured_version, require, sha256
out=Path(sys.argv[1])
before=json.loads((out/'config.json').read_text()); after=json.loads((out/'config-after.json').read_text())
require(before == after, 'Release refused: effective Expo config changed during build')
require((after['extra'].get('productionVoiceEnabled') is True) == (sys.argv[3] == '1'), 'Post-build voice mismatch')
artifacts={}
for suffix, source in [('aab', 'bundle/release/app-release.aab'), ('apk', 'apk/release/app-release.apk')]:
    target=out/f"opax-{os.environ['OPAX_BUILD_NUMBER']}.{suffix}"
    shutil.copyfile(Path('android/app/build/outputs')/source, target)
    require(target.stat().st_size > 0, 'Empty build artifact')
    artifacts[target.name]=sha256(target)
    with zipfile.ZipFile(target) as archive:
        config=json.loads(archive.read(('base/' if suffix == 'aab' else '')+'assets/app.config'))
        require((config['extra'].get('productionVoiceEnabled') is True) == (sys.argv[3] == '1'), 'Packaged voice mismatch')
# Expo's generated Gradle properties are the effective CNG switches. Keep the
# exact generated inputs so the conditional R8/symbol check can be reviewed.
props=Path('android/gradle.properties').read_text()
gradle=Path('android/app/build.gradle').read_text()
shutil.copyfile('android/gradle.properties', out/'gradle.properties')
shutil.copyfile('android/app/build.gradle', out/'app.build.gradle')
r8=bool(re.search(r'^android.enableMinifyInReleaseBuilds=true\s*$', props, re.M) or re.search(r'minifyEnabled\s+(?:=\s*)?true\b', gradle))
symbols=bool(re.search(r'debugSymbolLevel\s*(?:=\s*)?[\'\"](?:FULL|SYMBOL_TABLE)[\'\"]', gradle))
# A mapping or symbol payload in the AAB proves the feature is on even when it
# was enabled outside the generated Gradle text, so verify-play must check it.
with zipfile.ZipFile(out/f"opax-{os.environ['OPAX_BUILD_NUMBER']}.aab") as archive:
    names=archive.namelist()
r8=r8 or any(name.startswith('BUNDLE-METADATA/com.android.tools.build.obfuscation/') for name in names)
symbols=symbols or any(name.startswith('BUNDLE-METADATA/com.android.tools.build.debugsymbols/') for name in names)
evidence={'commit':sys.argv[2], 'production_voice_mode':sys.argv[3], 'version':configured_version(Path.cwd()),
          'versionCode':int(os.environ['OPAX_BUILD_NUMBER']), 'artifacts':artifacts,
          'r8_enabled':r8, 'native_symbols_enabled':symbols}
(out/'build-evidence.json.pending').write_text(json.dumps(evidence, indent=2)+'\n')
PY
# Publish evidence only after the final HEAD/tree/voice check passes.
check_inputs
mv "$OUT/build-evidence.json.pending" "$OUT/build-evidence.json"
echo "PASS local upload-signed Android $OPAX_BUILD_NUMBER; evidence: $OUT"
