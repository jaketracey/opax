#!/usr/bin/env bash
# Internal e2e.sh command: the device lifetime runs inside qa_paste_lock_run.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
UDID=${1:?}; OUT=${2:?}; APP=${3:?}; SIZE=${4:?}; APPEARANCE=${5:?}; FIXTURE_PID=${6:?}; OFFLINE=${7:?}; MAP_OFFLINE=${8:?}; MONEY_OFFLINE=${9:?}; shift 9
AUDIT_PID=; OWN_DEVICE=0; ORIGINAL_SIZE=large; ORIGINAL_APPEARANCE=light; ORIGINAL_CONTRAST=disabled
# Opt-in: run with iOS Increase Contrast on (OPAX_INCREASE_CONTRAST=1).
CONTRAST=disabled; [ "${OPAX_INCREASE_CONTRAST:-0}" = 1 ] && CONTRAST=enabled
BOOT_TIMEOUT=${OPAX_BOOT_TIMEOUT_SECONDS:-300}
INSTALL_TIMEOUT=${OPAX_INSTALL_TIMEOUT_SECONDS:-240}
UI_TIMEOUT=${OPAX_SIMCTL_TIMEOUT_SECONDS:-10}
SHUTDOWN_TIMEOUT=${OPAX_SHUTDOWN_TIMEOUT_SECONDS:-20}
timed() {
  # exec preserves alarm across the command; background/wait handles TERM promptly.
  perl -e '$s=shift; $s =~ /^[1-9][0-9]*$/ or die "Invalid timeout\n"; alarm $s; exec @ARGV or die "exec: $!\n"' "$@" &
  wait $!
}
# Every simulator step must run inside this run's own shared lock.
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
# The fixture is the parent's child: wait for its listener to close.
stop_fixture() {
  [ ! -e "$OUT/fixture-stopped" ] || return 0
  kill "$FIXTURE_PID"
  touch "$OUT/fixture-stopped"
  local deadline=$((SECONDS + 30))
  while lsof -nP -iTCP:"${OPAX_FIXTURE_PORT:-8910}" -sTCP:LISTEN >/dev/null 2>&1; do
    [ "$SECONDS" -lt "$deadline" ] || { echo "Fixture did not stop" >&2; return 1; }
    sleep 0.1
  done
}
cleanup() {
  local rc=$? cleanup_start=$SECONDS
  trap - EXIT
  trap '' INT TERM
  if [ -n "$AUDIT_PID" ]; then kill "$AUDIT_PID" 2>/dev/null || true; fi
  if [ "$OWN_DEVICE" = 1 ]; then
    timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" content_size "$ORIGINAL_SIZE" > "$OUT/restore.log" 2>&1 || true
    timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" appearance "$ORIGINAL_APPEARANCE" >> "$OUT/restore.log" 2>&1 || true
    timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" increase_contrast "$ORIGINAL_CONTRAST" >> "$OUT/restore.log" 2>&1 || true
    timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" content_size >> "$OUT/restore.log" 2>&1 || true
    timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" appearance >> "$OUT/restore.log" 2>&1 || true
    timed "$UI_TIMEOUT" xcrun simctl location "$UDID" clear >> "$OUT/restore.log" 2>&1 || true
    if timed "$SHUTDOWN_TIMEOUT" xcrun simctl shutdown "$UDID" >> "$OUT/restore.log" 2>&1; then
      touch "$OUT/device-shutdown"
    fi
    printf 'device_cleanup_seconds=%s\n' "$((SECONDS - cleanup_start))" >> "$OUT/device-timing.txt"
  fi
  # A slow auditor must not delay shutdown past the wrapper's TERM grace.
  if [ -n "$AUDIT_PID" ]; then wait "$AUDIT_PID" 2>/dev/null || true; fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
{ printf '%s\n' "$PPID"; /bin/ps -o lstart= -p "$PPID"; } > "$OUT/device-wrapper.tmp"
/bin/mv -f "$OUT/device-wrapper.tmp" "$OUT/device-wrapper"
if [ -n "${OPAX_PASTE_LOCK:-}" ] && [ -f "$OPAX_PASTE_LOCK/owner" ]; then
  /bin/cp "$OPAX_PASTE_LOCK/owner" "$OUT/device-owner"
fi
[ ! -e "$OUT/cancelled" ] || exit 143
allow_simulator "$UDID"
assert_device_lock
OWN_DEVICE=1
touch "$OUT/device-started"
device_start=$SECONDS
start=$SECONDS
# Alarm the gate itself, so a timed-out gate cannot later admit a boot.
if [ -n "${OPAX_SIM_GATE:-}" ]; then
  timed "$BOOT_TIMEOUT" bash "$OPAX_SIM_GATE" opax-harness "$UDID" > "$OUT/simulator.log" 2>&1
else
  timed "$BOOT_TIMEOUT" bash -c 'source scripts/qa-env.sh; boot_simulator "$1"' _ "$UDID" > "$OUT/simulator.log" 2>&1
fi
boot_seconds=$((SECONDS - start))
ORIGINAL_SIZE=$(timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" content_size)
ORIGINAL_APPEARANCE=$(timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" appearance)
case "$(timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" increase_contrast)" in enabled) ORIGINAL_CONTRAST=enabled ;; esac
timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" content_size "$SIZE"
timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" appearance "$APPEARANCE"
timed "$UI_TIMEOUT" xcrun simctl ui "$UDID" increase_contrast "$CONTRAST"
start=$SECONDS
timed "$INSTALL_TIMEOUT" xcrun simctl install "$UDID" "$APP"
install_seconds=$((SECONDS - start))
printf 'boot_seconds=%s\ninstall_seconds=%s\nboot_install_seconds=%s\n' "$boot_seconds" "$install_seconds" "$((boot_seconds + install_seconds))" > "$OUT/device-timing.txt"
./node_modules/.bin/tsx scripts/connection-audit.ts "$UDID" "$OUT" > "$OUT/connection-audit.log" 2>&1 &
AUDIT_PID=$!
timed 60 xcrun simctl launch "$UDID" au.com.opax.app > "$OUT/launch.log" 2>&1 || true
timed 60 xcrun simctl terminate "$UDID" au.com.opax.app >> "$OUT/launch.log" 2>&1 || true
printf 'device_setup_seconds=%s\n' "$((SECONDS - device_start))" >> "$OUT/device-timing.txt"
for journey in "$@"; do
  # Journey 24 needs a simulated fix per case; restore clears it.
  case "$journey" in
    .maestro/24-electorate-map*.yaml)
      case "$journey" in
        *-offshore.yaml) timed "$UI_TIMEOUT" xcrun simctl location "$UDID" set -35,155 ;;
        *) timed "$UI_TIMEOUT" xcrun simctl location "$UDID" set -33.900123456,151.145123456 ;;
      esac ;;
  esac
  journey_name=$(basename "$journey" .yaml)
  assert_device_lock
  maestro --device "$UDID" test --test-output-dir "$OUT/maestro" --debug-output "$OUT/maestro" --format junit --output "$OUT/$journey_name-report.xml" -e EVIDENCE=screenshots -e FIXTURE_PORT="${OPAX_FIXTURE_PORT:-8910}" -e REMOTE_SHARE_UI="${OPAX_REMOTE_SHARE_UI:-false}" -e CONTENT_SIZE="$SIZE" "$journey" >> "$OUT/maestro.log" 2>&1 &
  rc=0; wait $! || rc=$?
  if [ "$rc" != 0 ]; then cat "$OUT/maestro.log" >&2; exit "$rc"; fi
  # Journey 32 copies BibTeX in the native reader. Verify its actual clipboard
  # bytes before this same lock owner restores and shuts down the simulator.
  if [ "$journey_name" = '32-record-reader' ]; then
    assert_device_lock
    timed "$UI_TIMEOUT" xcrun simctl pbpaste "$UDID" > "$OUT/records-pasteboard.txt"
    ./node_modules/.bin/tsx scripts/check-record-copy.ts "$OUT/records-pasteboard.txt" > "$OUT/records-copy-check.json"
  fi
done
if [ "$OFFLINE" = 1 ]; then
  stop_fixture
  assert_device_lock
  maestro --device "$UDID" test --test-output-dir "$OUT/offline-maestro" --debug-output "$OUT/offline-maestro" --format junit --output "$OUT/offline-report.xml" -e EVIDENCE=screenshots -e FIXTURE_PORT="${OPAX_FIXTURE_PORT:-8910}" -e REMOTE_SHARE_UI="${OPAX_REMOTE_SHARE_UI:-false}" .maestro/04-offline.yaml > "$OUT/offline-maestro.log" 2>&1 &
  rc=0; wait $! || rc=$?
  if [ "$rc" != 0 ]; then cat "$OUT/offline-maestro.log" >&2; exit "$rc"; fi
fi
if [ "$MAP_OFFLINE" = 1 ]; then
  stop_fixture
  assert_device_lock
  maestro --device "$UDID" test --test-output-dir "$OUT/map-offline-maestro" --debug-output "$OUT/map-offline-maestro" --format junit --output "$OUT/map-offline-report.xml" -e EVIDENCE=screenshots .maestro/support/electorate-map-offline.yaml > "$OUT/map-offline-maestro.log" 2>&1 &
  rc=0; wait $! || rc=$?
  if [ "$rc" != 0 ]; then cat "$OUT/map-offline-maestro.log" >&2; exit "$rc"; fi
fi
if [ "$MONEY_OFFLINE" = 1 ]; then
  stop_fixture
  assert_device_lock
  maestro --device "$UDID" test --test-output-dir "$OUT/money-offline-maestro" --debug-output "$OUT/money-offline-maestro" --format junit --output "$OUT/money-offline-report.xml" -e EVIDENCE=screenshots .maestro/support/money-map-offline.yaml > "$OUT/money-offline-maestro.log" 2>&1 &
  rc=0; wait $! || rc=$?
  if [ "$rc" != 0 ]; then cat "$OUT/money-offline-maestro.log" >&2; exit "$rc"; fi
fi
kill "$AUDIT_PID"
rc=0; wait "$AUDIT_PID" || rc=$?
AUDIT_PID=
if [ "$rc" != 0 ]; then cat "$OUT/connection-audit.log" >&2; exit "$rc"; fi
