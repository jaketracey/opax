#!/usr/bin/env bash
# Start detached and follow private/qa/<run>/exit-status. The shared iOS lock
# covers the complete Android device lifetime, including shutdown.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/qa-env.sh
source scripts/qa-lock.sh
source scripts/qa-java.sh
AVD=${1:?Usage: e2e-android.sh OPAX_Pixel_API36|OPAX_API34 [01 02 03 07 08 13 25 32]}; shift
case "$AVD" in OPAX_Pixel_API36|OPAX_API34) ;; *) echo 'Use an OPAX Android device' >&2; exit 2 ;; esac
configure_java
export EXPO_NO_TELEMETRY=1 MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export OPAX_LOAD_LIMIT=140 OPAX_PASTE_WAIT_SECONDS=7200
RUN=${OPAX_QA_RUN:-android-bringup}
OUT="$PWD/private/qa/$RUN"
mkdir -p "$OUT"
/bin/rm -f "$OUT/exit-status" "$OUT/cancelled" "$OUT/device-runner" "$OUT/device-owner" "$OUT/device-shutdown"
echo "$$" > "$OUT/device-run-pid"
WAITER_PID=
finish() {
  local rc=$? device= started= deadline
  trap - EXIT
  trap '' INT TERM HUP
  if [ -n "$WAITER_PID" ]; then
    touch "$OUT/cancelled"
    if [ -f "$OUT/device-runner" ]; then
      device=$(sed -n '1p' "$OUT/device-runner")
      started=$(sed -n '2p' "$OUT/device-runner")
      if [ -n "$started" ] && [ "$(/bin/ps -o lstart= -p "$device")" = "$started" ]; then
        kill -TERM "$device" 2>/dev/null || true
        deadline=$((SECONDS + 60))
        while [ "$(/bin/ps -o lstart= -p "$device" 2>/dev/null)" = "$started" ]; do
          [ "$SECONDS" -lt "$deadline" ] || { rc=1; break; }
          sleep 0.1
        done
      fi
    fi
    kill -TERM -- "-$WAITER_PID" 2>/dev/null || true
    wait "$WAITER_PID" 2>/dev/null || true
  fi
  printf '%s\n' "$rc" > "$OUT/exit-status"
  exit "$rc"
}
trap finish EXIT
trap 'touch "$OUT/cancelled"; exit 130' INT
trap 'touch "$OUT/cancelled"; exit 143' TERM
trap 'touch "$OUT/cancelled"; exit 129' HUP
export QA_LOCK_LOG="$OUT/lock.log" QA_LOCK_SCRIPT=e2e-android.sh
if [ -n "${OPAX_ANDROID_FLOW_OVERRIDES:-}" ]; then
  python3 scripts/prepare-android-flows.py "$OUT/android-flows" --overrides "$OPAX_ANDROID_FLOW_OVERRIDES"
else
  python3 scripts/prepare-android-flows.py "$OUT/android-flows"
fi
perl -e 'setpgrp(0, 0) or die "setpgrp: $!\n"; exec @ARGV' bash -c '
source scripts/qa-env.sh
source scripts/qa-lock.sh
qa_paste_lock_run "$@"
' _ bash "$PWD/scripts/e2e-android-device.sh" "$AVD" "$OUT" "$@" &
WAITER_PID=$!
rc=0
wait "$WAITER_PID" || rc=$?
WAITER_PID=
exit "$rc"
