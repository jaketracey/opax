#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer EXPO_NO_TELEMETRY=1 MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
UDID=${1:?Usage: scripts/e2e.sh udid [01 02 03 04 05 06 07 08 09]}; shift
source scripts/qa-env.sh
source scripts/qa-java.sh
configure_java
export PATH="$HOME/.maestro/bin:$PATH"
allow_simulator "$UDID"
PORT=${OPAX_FIXTURE_PORT:-8910}
SIZE=${OPAX_CONTENT_SIZE:-large}
RUN=${OPAX_QA_RUN:-$(date -u +%Y%m%dT%H%M%SZ)-${UDID:0:8}-$SIZE}
OUT="$PWD/private/qa/$RUN"
mkdir -p "$OUT/screenshots" "$OUT/maestro"
java -version > "$OUT/java.log" 2>&1
APP=${OPAX_QA_APP:-$PWD/build/e2e/DerivedData/Build/Products/Release-iphonesimulator/OPAX.app}
test -f "$APP/main.jsbundle" || { echo "Run scripts/build-e2e.sh first" >&2; exit 1; }
OPAX_FIXTURE_PORT="$PORT" ./node_modules/.bin/tsx scripts/qa-static.ts --app "$APP" > "$OUT/app-scan.log" 2>&1
scripts/capacity.sh | tee "$OUT/capacity.log"
# Do not stop or reuse another lane's listener.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "Fixture port $PORT is occupied" >&2; exit 1; fi
FIXTURE_PID=; AUDIT_PID=; PASTE_LOCK=0; OWN_DEVICE=0
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
    xcrun simctl shutdown "$UDID" >> "$OUT/restore.log" 2>&1 || true
  fi
  if [ "$PASTE_LOCK" = 1 ]; then rmdir "$OPAX_PASTE_LOCK" 2>/dev/null || true; fi
  echo "E2E exit=$rc evidence=$OUT"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Maestro inputText may use iOS pasteboard internally. Serialize all input flows.
if [ -n "${OPAX_PASTE_LOCK:-}" ]; then
  deadline=$((SECONDS + ${OPAX_PASTE_WAIT_SECONDS:-3600}))
  while true; do
    # Capacity waits belong outside the shared input lock, including after contention.
    scripts/capacity.sh >> "$OUT/capacity.log"
    if mkdir "$OPAX_PASTE_LOCK" 2>/dev/null; then break; fi
    [ "$SECONDS" -lt "$deadline" ] || { echo "Pasteboard lock wait expired" >&2; exit 1; }
    sleep 5
  done
  PASTE_LOCK=1
else
  echo "No pasteboard lock configured; skipping lock." >&2
fi
OWN_DEVICE=1; ORIGINAL_SIZE=large; ORIGINAL_APPEARANCE=light
boot_simulator "$UDID" > "$OUT/simulator.log" 2>&1
ORIGINAL_SIZE=$(xcrun simctl ui "$UDID" content_size)
ORIGINAL_APPEARANCE=$(xcrun simctl ui "$UDID" appearance)
xcrun simctl ui "$UDID" content_size "$SIZE"
xcrun simctl ui "$UDID" appearance light
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
    01|02|03|05|06|07|08|09) matches=(.maestro/"$flow"*.yaml); for match in "${matches[@]}"; do
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
if [ "${#FLOWS[@]}" -gt 0 ]; then
build_command maestro --device "$UDID" test --test-output-dir "$OUT/maestro" --debug-output "$OUT/maestro" --format junit --output "$OUT/report.xml" -e EVIDENCE=screenshots -e REMOTE_SHARE_UI="${OPAX_REMOTE_SHARE_UI:-false}" "${FLOWS[@]}" > "$OUT/maestro.log" 2>&1 || { cat "$OUT/maestro.log" >&2; exit 1; }
./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/maestro"
fi
if [ "$OFFLINE" = 1 ]; then
  kill "$FIXTURE_PID"; wait "$FIXTURE_PID" || true; FIXTURE_PID=
  build_command maestro --device "$UDID" test --test-output-dir "$OUT/offline-maestro" --debug-output "$OUT/offline-maestro" --format junit --output "$OUT/offline-report.xml" -e EVIDENCE=screenshots -e REMOTE_SHARE_UI="${OPAX_REMOTE_SHARE_UI:-false}" .maestro/04-offline.yaml > "$OUT/offline-maestro.log" 2>&1 || { cat "$OUT/offline-maestro.log" >&2; exit 1; }
  ./node_modules/.bin/tsx scripts/collect-screenshots.ts "$OUT/screenshots" "$OUT/offline-maestro"
fi
if grep -Eq 'OUTSIDE_ALLOW_LIST|"allowed":false|opax\.com\.au' "$OUT/fixture.log"; then echo "Fixture request boundary failed" >&2; exit 1; fi
kill "$AUDIT_PID"
wait "$AUDIT_PID" || { cat "$OUT/connection-audit.log" >&2; AUDIT_PID=; exit 1; }
AUDIT_PID=
node -e 'const fs=require("fs");const lines=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(x=>x.startsWith("{"));const requests=lines.map(x=>JSON.parse(x));if(requests.some(x=>!x.allowed||x.host!==`127.0.0.1:${process.argv[2]}`))process.exit(1);console.log(JSON.stringify({requests:requests.length,outsideAllowList:0,basis:"logged fixture requests; measured app connections are in connection-audit.json"},null,2))' "$OUT/fixture.log" "$PORT" > "$OUT/request-audit.json"
echo "PASS journeys ${FLOWS[*]:-} (offline 04=$OFFLINE); text size=$SIZE; evidence=$OUT"
