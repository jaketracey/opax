#!/usr/bin/env bash
# Internal e2e.sh command: the device lifetime runs inside qa_paste_lock_run.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
UDID=${1:?}; OUT=${2:?}; APP=${3:?}; SIZE=${4:?}; FIXTURE_PID=${5:?}; OFFLINE=${6:?}; shift 6
AUDIT_PID=; OWN_DEVICE=0; ORIGINAL_SIZE=large; ORIGINAL_APPEARANCE=light
cleanup() {
  local rc=$? cleanup_start=$SECONDS
  trap - EXIT
  trap '' INT TERM
  if [ -n "$AUDIT_PID" ]; then kill "$AUDIT_PID" 2>/dev/null || true; fi
  if [ "$OWN_DEVICE" = 1 ]; then
    xcrun simctl ui "$UDID" content_size "$ORIGINAL_SIZE" > "$OUT/restore.log" 2>&1 || true
    xcrun simctl ui "$UDID" appearance "$ORIGINAL_APPEARANCE" >> "$OUT/restore.log" 2>&1 || true
    xcrun simctl ui "$UDID" content_size >> "$OUT/restore.log" 2>&1 || true
    xcrun simctl ui "$UDID" appearance >> "$OUT/restore.log" 2>&1 || true
    xcrun simctl shutdown "$UDID" >> "$OUT/restore.log" 2>&1 || true
    printf 'device_cleanup_seconds=%s\n' "$((SECONDS - cleanup_start))" >> "$OUT/device-timing.txt"
  fi
  # A slow auditor must not delay shutdown past the wrapper's TERM grace.
  if [ -n "$AUDIT_PID" ]; then wait "$AUDIT_PID" 2>/dev/null || true; fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
OWN_DEVICE=1
device_start=$SECONDS
start=$SECONDS
# Background/wait lets TERM enter cleanup immediately even during boot/install.
boot_simulator "$UDID" > "$OUT/simulator.log" 2>&1 &
wait $!
boot_seconds=$((SECONDS - start))
ORIGINAL_SIZE=$(xcrun simctl ui "$UDID" content_size)
ORIGINAL_APPEARANCE=$(xcrun simctl ui "$UDID" appearance)
xcrun simctl ui "$UDID" content_size "$SIZE"
xcrun simctl ui "$UDID" appearance light
start=$SECONDS
xcrun simctl install "$UDID" "$APP" &
wait $!
install_seconds=$((SECONDS - start))
printf 'boot_seconds=%s\ninstall_seconds=%s\nboot_install_seconds=%s\n' "$boot_seconds" "$install_seconds" "$((boot_seconds + install_seconds))" > "$OUT/device-timing.txt"
./node_modules/.bin/tsx scripts/connection-audit.ts "$UDID" "$OUT" > "$OUT/connection-audit.log" 2>&1 &
AUDIT_PID=$!
perl -e 'alarm 60; exec @ARGV' xcrun simctl launch "$UDID" au.com.opax.app > "$OUT/launch.log" 2>&1 &
wait $! || true
perl -e 'alarm 60; exec @ARGV' xcrun simctl terminate "$UDID" au.com.opax.app >> "$OUT/launch.log" 2>&1 &
wait $! || true
printf 'device_setup_seconds=%s\n' "$((SECONDS - device_start))" >> "$OUT/device-timing.txt"
if [ "$#" -gt 0 ]; then
  maestro --device "$UDID" test --test-output-dir "$OUT/maestro" --debug-output "$OUT/maestro" --format junit --output "$OUT/report.xml" -e EVIDENCE=screenshots -e REMOTE_SHARE_UI="${OPAX_REMOTE_SHARE_UI:-false}" "$@" > "$OUT/maestro.log" 2>&1 &
  rc=0; wait $! || rc=$?
  if [ "$rc" != 0 ]; then cat "$OUT/maestro.log" >&2; exit "$rc"; fi
fi
if [ "$OFFLINE" = 1 ]; then
  kill "$FIXTURE_PID"
  touch "$OUT/fixture-stopped"
  # It is the parent's child: wait for its listener to close before offline QA.
  deadline=$((SECONDS + 30))
  while lsof -nP -iTCP:"${OPAX_FIXTURE_PORT:-8910}" -sTCP:LISTEN >/dev/null 2>&1; do
    [ "$SECONDS" -lt "$deadline" ] || { echo "Fixture did not stop" >&2; exit 1; }
    sleep 0.1
  done
  maestro --device "$UDID" test --test-output-dir "$OUT/offline-maestro" --debug-output "$OUT/offline-maestro" --format junit --output "$OUT/offline-report.xml" -e EVIDENCE=screenshots -e REMOTE_SHARE_UI="${OPAX_REMOTE_SHARE_UI:-false}" .maestro/04-offline.yaml > "$OUT/offline-maestro.log" 2>&1 &
  rc=0; wait $! || rc=$?
  if [ "$rc" != 0 ]; then cat "$OUT/offline-maestro.log" >&2; exit "$rc"; fi
fi
kill "$AUDIT_PID"
rc=0; wait "$AUDIT_PID" || rc=$?
AUDIT_PID=
if [ "$rc" != 0 ]; then cat "$OUT/connection-audit.log" >&2; exit "$rc"; fi
