#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer EXPO_NO_TELEMETRY=1 MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
UDID=${1:?Usage: scripts/e2e.sh udid [01 02 03 04 05 06 07 08 09 10 11 12 13 14 20]}; shift
source scripts/qa-env.sh
source scripts/qa-lock.sh
source scripts/qa-java.sh
PORT=${OPAX_FIXTURE_PORT:-8910}
SIZE=${OPAX_CONTENT_SIZE:-large}
RUN=${OPAX_QA_RUN:-$(date -u +%Y%m%dT%H%M%SZ)-${UDID:0:8}-$SIZE}
OUT="$PWD/private/qa/$RUN"
mkdir -p "$OUT/screenshots" "$OUT/maestro"
# Pollers follow a detached run by this PID and the status file, which holds the
# exit code once cleanup (lock, fixture, simulator) has finished.
STATUS_FILE="$OUT/exit-status"
/bin/rm -f "$STATUS_FILE" "$OUT/fixture-stopped"
echo "$$" > "$OUT/pid"
echo "E2E pid=$$ status=$STATUS_FILE"
export QA_LOCK_LOG="$OUT/lock.log" QA_LOCK_SCRIPT=e2e.sh
FIXTURE_PID=
cleanup() {
  rc=$?
  trap - EXIT INT TERM
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
trap 'exit 130' INT
trap 'exit 143' TERM
configure_java
export PATH="$HOME/.maestro/bin:$PATH"
allow_simulator "$UDID"
java -version > "$OUT/java.log" 2>&1
APP=${OPAX_QA_APP:-$PWD/build/e2e/DerivedData/Build/Products/Release-iphonesimulator/OPAX.app}
test -f "$APP/main.jsbundle" || { echo "Run scripts/build-e2e.sh first" >&2; exit 1; }
OPAX_FIXTURE_PORT="$PORT" ./node_modules/.bin/tsx scripts/qa-static.ts --app "$APP" > "$OUT/app-scan.log" 2>&1
scripts/capacity.sh | tee "$OUT/capacity.log"
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
# immediately, TERM the owner pid recorded in the lock (qa-locked.sh).
rc=0
# Bash 3.2 treats expansion of an empty array as unset under nounset (04 only).
DEVICE_ARGS=("$UDID" "$OUT" "$APP" "$SIZE" "$FIXTURE_PID" "$OFFLINE")
if [ "${#FLOWS[@]}" -gt 0 ]; then DEVICE_ARGS+=("${FLOWS[@]}"); fi
qa_paste_lock_run "$PWD/scripts/e2e-device.sh" "${DEVICE_ARGS[@]}" || rc=$?
if [ -f "$OUT/fixture-stopped" ]; then wait "$FIXTURE_PID" 2>/dev/null || true; FIXTURE_PID=; fi
[ "$rc" = 0 ] || exit "$rc"
if [ "${#FLOWS[@]}" -gt 0 ]; then
  ./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/maestro"
fi
if [ "$OFFLINE" = 1 ]; then
  ./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/offline-maestro"
fi
if grep -Eq 'OUTSIDE_ALLOW_LIST|"allowed":false|opax\.com\.au' "$OUT/fixture.log"; then echo "Fixture request boundary failed" >&2; exit 1; fi
node -e 'const fs=require("fs");const lines=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(x=>x.startsWith("{"));const requests=lines.map(x=>JSON.parse(x));if(requests.some(x=>!x.allowed||x.host!==`127.0.0.1:${process.argv[2]}`))process.exit(1);console.log(JSON.stringify({requests:requests.length,outsideAllowList:0,basis:"logged fixture requests; measured app connections are in connection-audit.json"},null,2))' "$OUT/fixture.log" "$PORT" > "$OUT/request-audit.json"
echo "PASS journeys ${FLOWS[*]:-} (offline 04=$OFFLINE); text size=$SIZE; evidence=$OUT"
