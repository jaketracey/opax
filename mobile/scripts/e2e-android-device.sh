#!/usr/bin/env bash
# Internal: invoked only by qa_paste_lock_run. No build runs in this session.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
source scripts/qa-maestro.sh
AVD=${1:?}; OUT=${2:?}; shift 2
: "${ANDROID_HOME:?Set ANDROID_HOME}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
SERIAL=emulator-${OPAX_ANDROID_EMULATOR_PORT:-5580}
ADB=(adb -s "$SERIAL")
EMULATOR_PID=; FIXTURE_PID=; METRO_PID=; OWN_DEVICE=0
PORT=${OPAX_FIXTURE_PORT:-8910}; METRO_PORT=${OPAX_ANDROID_METRO_PORT:-8976}
assert_lock() {
  [ -n "${OPAX_PASTE_LOCK:-}" ] || { echo 'Android requires the shared device lock' >&2; return 1; }
  local owner group
  owner=$(sed -n 's/^pgid=//p' "$OPAX_PASTE_LOCK/owner")
  group=$(/bin/ps -o pgid= -p $$ | tr -d ' ')
  [ "$owner" = "$group" ] || { echo 'Android is outside its shared device lock' >&2; return 1; }
}
timed() { perl -e 'alarm shift; exec @ARGV or die "exec: $!\n"' "$@" & wait $!; }
cleanup() {
  local rc=$?
  trap - EXIT
  trap '' INT TERM HUP
  qa_maestro_stop
  for pid in "$METRO_PID" "$FIXTURE_PID"; do [ -z "$pid" ] || kill "$pid" 2>/dev/null || true; done
  if [ "$OWN_DEVICE" = 1 ]; then
    timed 10 "${ADB[@]}" shell settings put system font_scale 1.0 > "$OUT/restore.log" 2>&1 || true
    timed 10 "${ADB[@]}" shell settings get system font_scale >> "$OUT/restore.log" 2>&1 || true
    if timed 20 "${ADB[@]}" emu kill >> "$OUT/restore.log" 2>&1; then touch "$OUT/device-shutdown"; else
      [ -z "$EMULATOR_PID" ] || kill -TERM "$EMULATOR_PID" 2>/dev/null || true
      rc=1
    fi
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
assert_lock
{ printf '%s\n' "$$"; /bin/ps -o lstart= -p $$; } > "$OUT/device-runner"
/bin/cp -f "$OPAX_PASTE_LOCK/owner" "$OUT/device-owner"
[ ! -e "$OUT/cancelled" ] || exit 143
# Inventory only: never adopt or shut down somebody else's device. Existing
# booted devices mean the shared lock is not yet sufficient to start safely.
BOOTED=$(xcrun simctl list devices booted --json | python3 -c 'import json,sys; print(sum(d["state"] == "Booted" for ds in json.load(sys.stdin)["devices"].values() for d in ds))')
ANDROID_BOOTED=$(adb devices | awk '$1 ~ /^emulator-/ {n++} END {print n+0}')
[ "$BOOTED" = 0 ] && [ "$ANDROID_BOOTED" = 0 ] || { echo 'Another device is booted; start no emulator.' >&2; exit 1; }
for port in "$PORT" "$METRO_PORT" "${OPAX_ANDROID_EMULATOR_PORT:-5580}"; do
  ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 || { echo "Port $port is occupied" >&2; exit 1; }
done
test -s build/android/development/opax-debug.apk
test -s build/android/e2e/opax-e2e.apk
mkdir -p "$OUT/screenshots/standard" "$OUT/screenshots/font-2" "$OUT/maestro"
OPAX_TARGET_PLATFORM=android ./node_modules/.bin/tsx scripts/fixture-server.ts > "$OUT/fixture.log" 2>&1 & FIXTURE_PID=$!
deadline=$((SECONDS + 60))
until curl --silent --fail -H "Host: 10.0.2.2:$PORT" "http://127.0.0.1:$PORT/parliamentarians.json" >/dev/null; do
  [ "$SECONDS" -lt "$deadline" ] || { echo 'Fixture did not become ready' >&2; exit 1; }
  sleep 1
done
assert_lock
[ ! -e "$OUT/cancelled" ] || exit 143
OWN_DEVICE=1
emulator -avd "$AVD" -port "${OPAX_ANDROID_EMULATOR_PORT:-5580}" -no-audio -no-snapshot -no-boot-anim > "$OUT/emulator.log" 2>&1 & EMULATOR_PID=$!
touch "$OUT/device-started"
timed 240 "${ADB[@]}" wait-for-device
deadline=$((SECONDS + 240))
until [ "$("${ADB[@]}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
  [ "$SECONDS" -lt "$deadline" ] || { echo 'Android boot timed out' >&2; exit 1; }
  sleep 1
done
"${ADB[@]}" shell input keyevent 82
"${ADB[@]}" shell settings put system font_scale 1.0
"${ADB[@]}" shell settings put global window_animation_scale 0.5
"${ADB[@]}" shell settings put global transition_animation_scale 0.5
"${ADB[@]}" shell settings put global animator_duration_scale 0.5
"${ADB[@]}" shell cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural > "$OUT/navigation-mode.log" 2>&1
"${ADB[@]}" shell settings get secure navigation_mode >> "$OUT/navigation-mode.log"
"${ADB[@]}" shell getprop ro.build.version.sdk > "$OUT/android-api.txt"
"${ADB[@]}" shell wm size > "$OUT/display-size.txt"
"${ADB[@]}" logcat -c
# Debug proof uses loopback Metro through adb reverse. No fixture access is
# permitted in debug, and no paid action is driven on the production origin.
if [ "${OPAX_ANDROID_SKIP_DEBUG_PROOF:-0}" != 1 ]; then
NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first" OPAX_VARIANT=development OPAX_TARGET_PLATFORM=android CI=1 ./node_modules/.bin/expo start --localhost --port "$METRO_PORT" > "$OUT/metro.log" 2>&1 & METRO_PID=$!
deadline=$((SECONDS + 120))
until curl --silent --fail "http://127.0.0.1:$METRO_PORT/status" >/dev/null; do
  [ "$SECONDS" -lt "$deadline" ] || { echo 'Metro did not become ready' >&2; exit 1; }
  sleep 1
done
timed 120 "${ADB[@]}" install -r build/android/development/opax-debug.apk > "$OUT/debug-install.log"
"${ADB[@]}" reverse tcp:8081 "tcp:$METRO_PORT"
printf '<map><string name="debug_http_host">localhost:8081</string></map>' | "${ADB[@]}" shell run-as au.com.opax.app sh -c '"mkdir -p shared_prefs; cat > shared_prefs/au.com.opax.app_preferences.xml"'
"${ADB[@]}" shell am start -n au.com.opax.app/.MainActivity > "$OUT/debug-launch.log"
# Debug's UiAutomator active-window tree can remain on the removed splash even
# when the welcome tour is visibly rendered. Confirm the process and Metro
# bundle, then retain a launch capture for the required visual review.
deadline=$((SECONDS + 120))
until timed 5 "${ADB[@]}" shell pidof au.com.opax.app > "$OUT/debug-process.txt" && rg -q 'Android Bundled' "$OUT/metro.log"; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    timed 15 "${ADB[@]}" exec-out screencap -p > "$OUT/debug-readiness-last.png" || true
    timed 10 "${ADB[@]}" logcat -d > "$OUT/debug-failure-logcat.txt" || true
    echo 'Debug UI did not launch' >&2; exit 1
  fi
  sleep 2
done
sleep 2
"${ADB[@]}" exec-out screencap -p > "$OUT/debug-launch.png"
timed 10 "${ADB[@]}" logcat -d > "$OUT/debug-launch-logcat.txt"
if rg -q 'FATAL EXCEPTION|Fatal signal|ReactNativeJS:.*(Error:|Invariant Violation)' "$OUT/debug-launch-logcat.txt"; then
  echo 'Debug launch emitted a fatal error' >&2; exit 1
fi
"${ADB[@]}" shell am force-stop au.com.opax.app
kill "$METRO_PID"; wait "$METRO_PID" 2>/dev/null || true; METRO_PID=
"${ADB[@]}" reverse --remove tcp:8081
fi
timed 120 "${ADB[@]}" install -r build/android/e2e/opax-e2e.apk > "$OUT/e2e-install.log"
if [ "${OPAX_ANDROID_PRESERVE_STATE:-0}" = 1 ]; then
  # Targeted continuation keeps the seat/history already validated in this AVD.
  "${ADB[@]}" shell am start -n au.com.opax.app/.MainActivity > "$OUT/e2e-continue-launch.log"
  deadline=$((SECONDS + 120))
  until "${ADB[@]}" shell uiautomator dump /sdcard/opax-continue.xml >/dev/null 2>&1 && "${ADB[@]}" shell cat /sdcard/opax-continue.xml | rg -q 'today-screen'; do
    [ "$SECONDS" -lt "$deadline" ] || exit 1
    sleep 2
  done
else
  "${ADB[@]}" shell pm clear au.com.opax.app > "$OUT/e2e-clear.log"
fi
android_flow() {
  local key=$1 size=$2 file=$3 rc=0
  assert_lock
  qa_maestro_run "$OUT/$key-maestro.log" "$OUT/maestro/$key" --device "$SERIAL" test \
    --test-output-dir "$OUT/maestro/$key" --debug-output "$OUT/maestro/$key" \
    --format junit --output "$OUT/$key-report.xml" -e EVIDENCE=screenshots \
    -e FIXTURE_PORT="$PORT" "$OUT/android-flows/${file#.maestro/}" || rc=$?
  ./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots/$size" "$OUT/maestro/$key" > "$OUT/$key-captures.log"
  return "$rc"
}
failed=0
if [ "${OPAX_ANDROID_CAPTURES_ONLY:-0}" != 1 ]; then
if [ "$#" -gt 0 ]; then FLOWS=("$@"); else FLOWS=(01 02 03 07 08 13 25 32); fi
for flow in "${FLOWS[@]}"; do
  case "$flow" in
    01) file=.maestro/android/01-launch.yaml ;;
    02) file=.maestro/02-search.yaml ;;
    03) file=.maestro/android/03-mp-profile.yaml ;;
    07) file=.maestro/07-your-mp.yaml ;;
    08) file=.maestro/08-profile.yaml ;;
    13) file=.maestro/android/13-today.yaml ;;
    25) file=.maestro/android/25-party.yaml ;;
    32) file=.maestro/android/32-record-reader.yaml ;;
    *) echo 'Unsupported Android journey' >&2; exit 2 ;;
  esac
  assert_lock
  if ! android_flow "$flow" standard "$file"; then exit 1; fi
  if [ "$flow" = 01 ]; then
    "${ADB[@]}" shell dumpsys package au.com.opax.app > "$OUT/permissions-after-launch.txt"
    if rg -q 'android.permission.ACCESS_(FINE|COARSE)_LOCATION: granted=true' "$OUT/permissions-after-launch.txt"; then
      echo 'Location unexpectedly granted on initial launch' >&2; failed=1
    fi
  fi
done
if [[ " ${FLOWS[*]} " = *" 32 "* ]]; then
  if android_flow clipboard standard .maestro/android/clipboard.yaml; then
    "${ADB[@]}" shell uiautomator dump /sdcard/opax-clipboard.xml >/dev/null
    "${ADB[@]}" exec-out cat /sdcard/opax-clipboard.xml > "$OUT/clipboard-ui.xml"
    python3 - "$OUT" <<'CHECK'
import sys, xml.etree.ElementTree as ET
from pathlib import Path
out=Path(sys.argv[1])
node=next(n for n in ET.parse(out/'clipboard-ui.xml').iter('node') if n.get('resource-id','').endswith('ask-question'))
(out/'records-pasteboard.txt').write_text(node.get('text',''))
CHECK
    TZ=$("${ADB[@]}" shell getprop persist.sys.timezone | tr -d '\r') ./node_modules/.bin/tsx scripts/check-record-copy.ts "$OUT/records-pasteboard.txt" > "$OUT/records-copy-check.json" || failed=1
    "${ADB[@]}" shell am force-stop au.com.opax.app
  else failed=1; fi
fi
fi
for scale in 1.0 2.0; do
  "${ADB[@]}" shell settings put system font_scale "$scale"
  size=standard; [ "$scale" = 1.0 ] || size=font-2
  file=.maestro/android/screenshots.yaml
  # Private continuations can capture only the unfinished screens at each size.
  if [ -f "$OUT/android-flows/android/screenshots-$size.yaml" ]; then
    file=".maestro/android/screenshots-$size.yaml"
  fi
  if ! android_flow "screenshots-$size" "$size" "$file"; then failed=1; fi
done
"${ADB[@]}" shell settings put system font_scale 1.0
if [ "${OPAX_ANDROID_CAPTURES_ONLY:-0}" != 1 ]; then
if ! android_flow native-share standard .maestro/android/native-share.yaml; then failed=1; fi
for permission in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION; do
  "${ADB[@]}" shell pm revoke au.com.opax.app "android.permission.$permission"
  "${ADB[@]}" shell pm clear-permission-flags au.com.opax.app "android.permission.$permission" user-set user-fixed
done
if ! android_flow back-and-location standard .maestro/android/back-and-location.yaml; then failed=1; fi
fi
"${ADB[@]}" logcat -d > "$OUT/logcat.txt"
"${ADB[@]}" shell dumpsys package au.com.opax.app > "$OUT/e2e-package.txt"
exit "$failed"
