#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer EXPO_NO_TELEMETRY=1 MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
UDID=${1:?Usage: scripts/e2e.sh udid [01 02 03 04 05 06 07 08 09 10 11 12 13 14 20]}; shift
source scripts/qa-env.sh
source scripts/qa-lock.sh
source scripts/qa-java.sh
source scripts/qa-flows.sh
qa_check_flow_selectors "$@" || exit 2
PORT=${OPAX_FIXTURE_PORT:-8910}
SIZE=${OPAX_CONTENT_SIZE:-large}
# The app is light-only; dark is for checking the launch screen (journey 28b).
APPEARANCE=${OPAX_APPEARANCE:-light}
case "$APPEARANCE" in light|dark) ;; *) echo "OPAX_APPEARANCE must be light or dark" >&2; exit 1 ;; esac
RUN=${OPAX_QA_RUN:-$(date -u +%Y%m%dT%H%M%SZ)-${UDID:0:8}-$SIZE}
OUT="$PWD/private/qa/$RUN"
mkdir -p "$OUT/screenshots" "$OUT/maestro"
# Pollers follow a detached run by this PID and the status file, which holds the
# exit code once cleanup (lock, fixture, simulator) has finished.
STATUS_FILE="$OUT/exit-status"
LOCKED_SESSION=${OPAX_E2E_LOCKED_SESSION:-0}
if [ "$LOCKED_SESSION" != 1 ]; then
  /bin/rm -f "$STATUS_FILE"
  echo "$$" > "$OUT/pid"
  echo "E2E pid=$$ status=$STATUS_FILE"
fi
export QA_LOCK_LOG="$OUT/lock.log" QA_LOCK_SCRIPT=e2e.sh
FIXTURE_PID=; AUDIT_PID=; OWN_DEVICE=0
cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [ -n "$AUDIT_PID" ]; then kill "$AUDIT_PID" 2>/dev/null || true; wait "$AUDIT_PID" 2>/dev/null || true; fi
  if [ -n "$FIXTURE_PID" ]; then kill "$FIXTURE_PID" 2>/dev/null || true; wait "$FIXTURE_PID" 2>/dev/null || true; fi
  if [ "$OWN_DEVICE" = 1 ]; then
    xcrun simctl ui "$UDID" content_size "$ORIGINAL_SIZE" > "$OUT/restore.log" 2>&1 || true
    xcrun simctl ui "$UDID" appearance "$ORIGINAL_APPEARANCE" >> "$OUT/restore.log" 2>&1 || true
    xcrun simctl ui "$UDID" content_size >> "$OUT/restore.log" 2>&1 || true
    xcrun simctl ui "$UDID" appearance >> "$OUT/restore.log" 2>&1 || true
    xcrun simctl location "$UDID" clear >> "$OUT/restore.log" 2>&1 || true
    xcrun simctl shutdown "$UDID" >> "$OUT/restore.log" 2>&1 || true
  fi
  if [ "$LOCKED_SESSION" != 1 ]; then
    # Record every executed retry after the device session releases its lock.
    if ! ./node_modules/.bin/tsx scripts/report-journey-retries.ts "$OUT" > "$OUT/retry-report.log" 2>&1; then
      cat "$OUT/retry-report.log" >&2
      [ "$rc" != 0 ] || rc=1
    fi
    echo "E2E exit=$rc evidence=$OUT"
    printf '%s\n' "$rc" > "$STATUS_FILE.tmp" && /bin/mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
configure_java
export PATH="$HOME/.maestro/bin:$PATH"
allow_simulator "$UDID"
java -version > "$OUT/java.log" 2>&1
APP=${OPAX_QA_APP:-$PWD/build/e2e/DerivedData/Build/Products/Release-iphonesimulator/OPAX.app}
test -f "$APP/main.jsbundle" || { echo "Run scripts/build-e2e.sh first" >&2; exit 1; }
if [ "$LOCKED_SESSION" != 1 ]; then
  OPAX_FIXTURE_PORT="$PORT" ./node_modules/.bin/tsx scripts/qa-static.ts --app "$APP" > "$OUT/app-scan.log" 2>&1
  scripts/capacity.sh | tee "$OUT/capacity.log"
  # Use the existing shared-lock runner for the entire device session. Re-enter
  # this harness only after its capacity check, build gate and lock acquisition;
  # no simulator is booted while the caller waits for any of them.
  OPAX_E2E_LOCKED_SESSION=1 OPAX_QA_RUN="$RUN" OPAX_QA_APP="$APP" \
    qa_paste_lock_run bash "$0" "$UDID" "$@" >> "$OUT/maestro.log" 2>&1
  exit 0
fi
assert_device_lock() {
  if [ -n "${OPAX_PASTE_LOCK:-}" ]; then
    local owner_pgid own_pgid
    owner_pgid=$(sed -n 's/^pgid=//p' "$OPAX_PASTE_LOCK/owner")
    own_pgid=$(/bin/ps -o pgid= -p $$ | tr -d ' ')
    [ -n "$owner_pgid" ] && [ "$owner_pgid" = "$own_pgid" ] || {
      echo "Device session is outside its shared pasteboard lock" >&2; return 1;
    }
  fi
}
assert_device_lock
echo "Device setup, journeys and shutdown share the acquired pasteboard lock."
# Do not stop or reuse another lane's listener.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "Fixture port $PORT is occupied" >&2; exit 1; fi
OWN_DEVICE=1; ORIGINAL_SIZE=large; ORIGINAL_APPEARANCE=light
boot_simulator "$UDID" > "$OUT/simulator.log" 2>&1
ORIGINAL_SIZE=$(xcrun simctl ui "$UDID" content_size)
ORIGINAL_APPEARANCE=$(xcrun simctl ui "$UDID" appearance)
xcrun simctl ui "$UDID" content_size "$SIZE"
xcrun simctl ui "$UDID" appearance "$APPEARANCE"
xcrun simctl install "$UDID" "$APP"
OPAX_FIXTURE_PORT="$PORT" ./node_modules/.bin/tsx scripts/fixture-server.ts > "$OUT/fixture.log" 2>&1 &
FIXTURE_PID=$!
deadline=$((SECONDS + 30))
until grep -q OPAX_FIXTURE_READY "$OUT/fixture.log"; do
  kill -0 "$FIXTURE_PID" 2>/dev/null || { cat "$OUT/fixture.log" >&2; exit 1; }
  [ "$SECONDS" -lt "$deadline" ] || { echo "Fixture did not become ready" >&2; exit 1; }
  sleep 1
done
FLOWS=()
OFFLINE=${OPAX_VERIFY_OFFLINE:-0}
if [ "$#" = 0 ]; then set -- 01 02 03 04; fi
for flow in "$@"; do
  case "$flow" in
    04|.maestro/04-offline.yaml) OFFLINE=1 ;;
    [0-9][0-9]) matches=(.maestro/"$flow"-*.yaml); test -f "${matches[0]}" || { echo "Unknown flow: $flow" >&2; exit 1; }; for match in "${matches[@]}"; do
      case "$match" in *-open-profile.yaml|*-scene-lifecycle.yaml) continue ;; esac
      FLOWS+=("$match")
    done ;;
    *) test -f "$flow" || { echo "Unknown flow: $flow" >&2; exit 1; }; FLOWS+=("$flow") ;;
  esac
done
./node_modules/.bin/tsx scripts/connection-audit.ts "$UDID" "$OUT" > "$OUT/connection-audit.log" 2>&1 &
AUDIT_PID=$!
# Bound native launch calls; warm the installed app before Maestro's clear-state.
perl -e 'alarm 60; exec @ARGV' xcrun simctl launch "$UDID" au.com.opax.app > "$OUT/launch.log" 2>&1 || true
perl -e 'alarm 60; exec @ARGV' xcrun simctl terminate "$UDID" au.com.opax.app >> "$OUT/launch.log" 2>&1 || true
# The whole device session holds the shared lock, including simulator boot and
# shutdown. TERM the lock's owner pid (qa-locked.sh) to stop it at once.
if [ "${#FLOWS[@]}" -gt 0 ]; then
for journey in "${FLOWS[@]}"; do
  case "$journey" in
    .maestro/24-electorate-map*.yaml)
      case "$journey" in
        *-offshore.yaml) xcrun simctl location "$UDID" set -35,155 ;;
        *) xcrun simctl location "$UDID" set -33.900123456,151.145123456 ;;
      esac ;;
  esac
  journey_name=$(basename "$journey" .yaml)
  assert_device_lock
  maestro --device "$UDID" test --test-output-dir "$OUT/maestro" --debug-output "$OUT/maestro" --format junit --output "$OUT/$journey_name-report.xml" -e EVIDENCE=screenshots -e REMOTE_SHARE_UI="${OPAX_REMOTE_SHARE_UI:-false}" "$journey" || exit 1
done
./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/maestro"
# Journey 15 must draw "OPAX is" below the large title. The accessibility tree
# kept the sentence while build 2 drew it behind the title, so read the pixels.
for flow in "${FLOWS[@]}"; do
  case "$flow" in
    *15-cold-first-line.yaml)
      ./node_modules/.bin/tsx scripts/first-line-check.ts "$OUT/screenshots/15-cold-today-first-line.png" > "$OUT/first-line-check.log" 2>&1 || { cat "$OUT/first-line-check.log" >&2; exit 1; } ;;
  esac
done
fi
if [ "$OFFLINE" = 1 ]; then
  kill "$FIXTURE_PID"; wait "$FIXTURE_PID" || true; FIXTURE_PID=
  assert_device_lock
  maestro --device "$UDID" test --test-output-dir "$OUT/offline-maestro" --debug-output "$OUT/offline-maestro" --format junit --output "$OUT/offline-report.xml" -e EVIDENCE=screenshots -e REMOTE_SHARE_UI="${OPAX_REMOTE_SHARE_UI:-false}" .maestro/04-offline.yaml > "$OUT/offline-maestro.log" 2>&1 || { cat "$OUT/offline-maestro.log" >&2; exit 1; }
  ./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/offline-maestro"
fi
if [ "${OPAX_VERIFY_MAP_OFFLINE:-0}" = 1 ]; then
  kill "$FIXTURE_PID"; wait "$FIXTURE_PID" || true; FIXTURE_PID=
  assert_device_lock
  maestro --device "$UDID" test --test-output-dir "$OUT/map-offline-maestro" --debug-output "$OUT/map-offline-maestro" --format junit --output "$OUT/map-offline-report.xml" -e EVIDENCE=screenshots .maestro/support/electorate-map-offline.yaml > "$OUT/map-offline-maestro.log" 2>&1 || { cat "$OUT/map-offline-maestro.log" >&2; exit 1; }
  ./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/map-offline-maestro"
fi
if [ "${OPAX_VERIFY_MONEY_OFFLINE:-0}" = 1 ]; then
  if [ -n "$FIXTURE_PID" ]; then kill "$FIXTURE_PID"; wait "$FIXTURE_PID" || true; FIXTURE_PID=; fi
  assert_device_lock
  maestro --device "$UDID" test --test-output-dir "$OUT/money-offline-maestro" --debug-output "$OUT/money-offline-maestro" --format junit --output "$OUT/money-offline-report.xml" -e EVIDENCE=screenshots .maestro/support/money-map-offline.yaml > "$OUT/money-offline-maestro.log" 2>&1 || { cat "$OUT/money-offline-maestro.log" >&2; exit 1; }
  ./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/money-offline-maestro"
fi
if grep -Eq 'OUTSIDE_ALLOW_LIST|"allowed":false|opax\.com\.au' "$OUT/fixture.log"; then echo "Fixture request boundary failed" >&2; exit 1; fi
kill "$AUDIT_PID"
wait "$AUDIT_PID" || { cat "$OUT/connection-audit.log" >&2; AUDIT_PID=; exit 1; }
AUDIT_PID=
node -e 'const fs=require("fs");const lines=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(x=>x.startsWith("{"));const requests=lines.map(x=>JSON.parse(x));if(requests.some(x=>!x.allowed||x.host!==`127.0.0.1:${process.argv[2]}`))process.exit(1);console.log(JSON.stringify({requests:requests.length,outsideAllowList:0,basis:"logged fixture requests; measured app connections are in connection-audit.json"},null,2))' "$OUT/fixture.log" "$PORT" > "$OUT/request-audit.json"
echo "PASS journeys ${FLOWS[*]:-} (offline 04=$OFFLINE); text size=$SIZE; evidence=$OUT"
