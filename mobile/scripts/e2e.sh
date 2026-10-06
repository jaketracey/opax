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
/bin/rm -f "$STATUS_FILE" "$OUT/fixture-stopped" "$OUT/cancelled" "$OUT/device-owner" "$OUT/device-wrapper" "$OUT/device-started" "$OUT/device-shutdown"
echo "$$" > "$OUT/pid"
echo "E2E pid=$$ status=$STATUS_FILE"
export QA_LOCK_LOG="$OUT/lock.log" QA_LOCK_SCRIPT=e2e.sh
FIXTURE_PID=; WAITER_PID=; FALLBACK_DONE=0
# This allowance is local to the e2e command; the shared lock protocol stays intact.
export OPAX_STOP_GRACE_SECONDS=${OPAX_E2E_STOP_GRACE_SECONDS:-120}
if [[ ! "$OPAX_STOP_GRACE_SECONDS" =~ ^[0-9]+$ || ${#OPAX_STOP_GRACE_SECONDS} -gt 9 ]] || [ "$((10#$OPAX_STOP_GRACE_SECONDS))" -eq 0 ]; then
  echo 'OPAX_E2E_STOP_GRACE_SECONDS must be a positive integer' >&2; exit 2
fi
export OPAX_STOP_GRACE_SECONDS=$((10#$OPAX_STOP_GRACE_SECONDS))
fallback_shutdown() {
  [ -f "$OUT/device-started" ] && [ ! -f "$OUT/device-shutdown" ] && [ "$FALLBACK_DONE" = 0 ] || return 0
  FALLBACK_DONE=1
  if perl -e '$s=shift; $s =~ /^[1-9][0-9]*$/ or die "Invalid timeout\n"; alarm $s; exec @ARGV or die "exec: $!\n"' "${OPAX_SHUTDOWN_TIMEOUT_SECONDS:-20}" xcrun simctl shutdown "$UDID" > "$OUT/fallback-shutdown.log" 2>&1; then
    touch "$OUT/device-shutdown"
  else
    cat "$OUT/fallback-shutdown.log" >&2
    return 1
  fi
}
stop_device() {
  local deadline owner started
  # PID + start time also covers the explicitly unconfigured-lock mode and
  # prevents a reused PID from being signalled. The token pins shared release.
  if [ -f "$OUT/device-wrapper" ]; then
    owner=$(sed -n '1p' "$OUT/device-wrapper")
    started=$(sed -n '2p' "$OUT/device-wrapper")
    if [ -n "$started" ] && [ "$(/bin/ps -o lstart= -p "$owner")" = "$started" ]; then
      kill -TERM "$owner" 2>/dev/null || true
      kill -CONT -- "-$owner" 2>/dev/null || true
    fi
    deadline=$(($(date +%s) + OPAX_STOP_GRACE_SECONDS + 10))
    while { [ -n "$started" ] && [ "$(/bin/ps -o lstart= -p "$owner")" = "$started" ]; } || { [ -n "${OPAX_PASTE_LOCK:-}" ] && cmp -s "$OUT/device-owner" "$OPAX_PASTE_LOCK/owner"; }; do
      [ "$(date +%s)" -lt "$deadline" ] || { echo 'Locked cleanup did not finish within its stop grace' >&2; return 1; }
      sleep 0.1
    done
  fi
}
cancel_wait() {
  [ -n "$WAITER_PID" ] || return 0
  touch "$OUT/cancelled"
  local rc=0 deadline
  # Drain the active device owner before stopping its gate parent, so the build
  # gate remains held through shutdown. A queued lane has no device to drain.
  stop_device || rc=1
  # The waiter/gate queue has its own group; qa-locked leads a separate group.
  kill -TERM "$WAITER_PID" 2>/dev/null || true
  kill -TERM -- "-$WAITER_PID" 2>/dev/null || true
  kill -CONT "$WAITER_PID" 2>/dev/null || true
  kill -CONT -- "-$WAITER_PID" 2>/dev/null || true
  deadline=$(($(date +%s) + 2))
  while kill -0 "$WAITER_PID" 2>/dev/null && [ "$(date +%s)" -lt "$deadline" ]; do sleep 0.1; done
  if /bin/ps -axo pgid=,command= | awk -v group="$WAITER_PID" -v out="$OUT" '$1 == group && index($0, out) {found=1} END {exit !found}'; then
    kill -KILL -- "-$WAITER_PID" 2>/dev/null || true
  fi
  wait "$WAITER_PID" 2>/dev/null || true
  WAITER_PID=
  # Catch a wrapper admitted during cancellation; its pre-boot cancelled check
  # keeps it from booting, but its separate process group still needs draining.
  stop_device || rc=1
  return "$rc"
}
cleanup() {
  rc=$?
  trap - EXIT
  trap '' INT TERM
  cancel_wait || { [ "$rc" != 0 ] || rc=1; }
  fallback_shutdown || { [ "$rc" != 0 ] || rc=1; }
  if [ -n "$FIXTURE_PID" ]; then
    # The locked offline phase may already have stopped the fixture.
    if [ ! -f "$OUT/fixture-stopped" ]; then kill "$FIXTURE_PID" 2>/dev/null || true; fi
    wait "$FIXTURE_PID" 2>/dev/null || true
  fi
  # Record every executed retry, including a run that subsequently fails.
  if ! ./node_modules/.bin/tsx scripts/report-journey-retries.ts "$OUT" > "$OUT/retry-report.log" 2>&1; then
    cat "$OUT/retry-report.log" >&2
    [ "$rc" != 0 ] || rc=1
  fi
  echo "E2E exit=$rc evidence=$OUT"
  printf '%s\n' "$rc" > "$STATUS_FILE.tmp" && /bin/mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
  exit "$rc"
}
trap cleanup EXIT
trap 'touch "$OUT/cancelled"; exit 130' INT
trap 'touch "$OUT/cancelled"; exit 143' TERM
configure_java
export PATH="$HOME/.maestro/bin:$PATH"
allow_simulator "$UDID"
java -version > "$OUT/java.log" 2>&1
APP=${OPAX_QA_APP:-$PWD/build/e2e/DerivedData/Build/Products/Release-iphonesimulator/OPAX.app}
test -f "$APP/main.jsbundle" || { echo "Run scripts/build-e2e.sh first" >&2; exit 1; }
OPAX_FIXTURE_PORT="$PORT" ./node_modules/.bin/tsx scripts/qa-static.ts --app "$APP" > "$OUT/app-scan.log" 2>&1
perl -e 'setpgrp(0, 0) or die "setpgrp: $!\n"; exec @ARGV' bash -c 'set -o pipefail; scripts/capacity.sh | tee "$1"' _ "$OUT/capacity.log" &
WAITER_PID=$!
wait "$WAITER_PID"
WAITER_PID=
# Do not stop or reuse another lane's listener.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "Fixture port $PORT is occupied" >&2; exit 1; fi
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
MAP_OFFLINE=${OPAX_VERIFY_MAP_OFFLINE:-0}
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
# The whole device lifetime is one locked command inside the build gate.
# All fixture/build preparation is complete before waiting. The device command
# restores and shuts down on EXIT/TERM before qa-locked.sh releases the lock;
# fixture teardown and screenshot collection happen after release. To interrupt
# immediately, TERM this runner (including while queued), or the lock owner.
rc=0
# Bash 3.2 treats expansion of an empty array as unset under nounset (04 only).
DEVICE_ARGS=("$UDID" "$OUT" "$APP" "$SIZE" "$APPEARANCE" "$FIXTURE_PID" "$OFFLINE" "$MAP_OFFLINE")
if [ "${#FLOWS[@]}" -gt 0 ]; then DEVICE_ARGS+=("${FLOWS[@]}"); fi
# A separate waiting group lets a TERM cancel the gate queue without orphans.
# wait is a shell builtin, so the runner's trap takes effect immediately.
perl -e 'setpgrp(0, 0) or die "setpgrp: $!\n"; exec @ARGV' bash -c '
device_grace=$1; shift
source scripts/qa-env.sh
export OPAX_STOP_GRACE_SECONDS=$device_grace
source scripts/qa-lock.sh
qa_paste_lock_run "$@"
' _ "$OPAX_STOP_GRACE_SECONDS" "$PWD/scripts/e2e-device.sh" "${DEVICE_ARGS[@]}" &
WAITER_PID=$!
wait "$WAITER_PID" || rc=$?
WAITER_PID=
fallback_shutdown || { [ "$rc" != 0 ] || rc=1; }
if [ -f "$OUT/fixture-stopped" ]; then wait "$FIXTURE_PID" 2>/dev/null || true; FIXTURE_PID=; fi
[ "$rc" = 0 ] || exit "$rc"
if [ "${#FLOWS[@]}" -gt 0 ]; then
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
  ./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/offline-maestro"
fi
if [ "$MAP_OFFLINE" = 1 ]; then
  ./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/map-offline-maestro"
fi
if grep -Eq 'OUTSIDE_ALLOW_LIST|"allowed":false|opax\.com\.au' "$OUT/fixture.log"; then echo "Fixture request boundary failed" >&2; exit 1; fi
node -e 'const fs=require("fs");const lines=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(x=>x.startsWith("{"));const requests=lines.map(x=>JSON.parse(x));if(requests.some(x=>!x.allowed||x.host!==`127.0.0.1:${process.argv[2]}`))process.exit(1);console.log(JSON.stringify({requests:requests.length,outsideAllowList:0,basis:"logged fixture requests; measured app connections are in connection-audit.json"},null,2))' "$OUT/fixture.log" "$PORT" > "$OUT/request-audit.json"
echo "PASS journeys ${FLOWS[*]:-} (offline 04=$OFFLINE); text size=$SIZE; evidence=$OUT"
