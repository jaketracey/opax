#!/usr/bin/env bash
# Source only a developer-owned, ignored file; never commit host-specific values.
QA_MOBILE_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
if [ -f "$QA_MOBILE_ROOT/.qa.local.env" ]; then
  set -a
  source "$QA_MOBILE_ROOT/.qa.local.env"
  set +a
fi
build_command() {
  if [ -n "${OPAX_BUILD_GATE:-}" ]; then
    bash "$OPAX_BUILD_GATE" opax-harness "$@"
  else
    echo "No build gate configured; running command directly: $1" >&2
    "$@"
  fi
}
# Android's desktop gate uses a mkdir lock shared by all Linux worktrees.
# Keep the Mac's existing build gate and capacity protocol unchanged.
android_build_command() {
  if [ "$(uname -s)" != Linux ]; then
    build_command "$@"
    return
  fi
  (
    set -euo pipefail
    # Plain assignments, not locals: the subshell already scopes them, and
    # bash 3.2 unwinds locals before an errexit EXIT trap reads $lock.
    lock=${OPAX_ANDROID_NATIVE_LOCK:-/tmp/opax-android-native.lock}
    deadline=$((SECONDS + ${OPAX_ANDROID_NATIVE_WAIT_SECONDS:-7200}))
    owner=
    until mkdir "$lock" 2>/dev/null; do
      # Serialize stale-owner retirement, then recheck before removing it.
      (
        flock -x 9
        owner=$(cat "$lock/pid" 2>/dev/null || true)
        if [[ "$owner" =~ ^[0-9]+$ ]] && ! kill -0 "$owner" 2>/dev/null; then
          rm -f "$lock/pid"
          rmdir "$lock" 2>/dev/null || true
        fi
      ) 9>"$lock.reap"
      [ -d "$lock" ] || continue
      [ "$SECONDS" -lt "$deadline" ] || {
        echo "Android native lock wait expired: $lock" >&2
        exit 75
      }
      sleep 20
    done
    # Bash 3.2 (macOS /bin/bash, used only by tests here) has no BASHPID.
    printf '%s\n' "${BASHPID:-$(exec sh -c 'echo "$PPID"')}" > "$lock/pid"
    trap 'rm -f "$lock/pid"; rmdir "$lock"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM HUP
    "$@"
  )
}
allow_simulator() {
  if [ -z "${OPAX_ALLOWED_UDIDS:-}" ]; then
    echo "Warning: no simulator allow-list configured; accepting the requested simulator." >&2
    return
  fi
  case " $OPAX_ALLOWED_UDIDS " in
    *" $1 "*) ;;
    *) echo "Simulator is outside the configured allow-list" >&2; return 1 ;;
  esac
}
boot_simulator() {
  allow_simulator "$1"
  if [ -n "${OPAX_SIM_GATE:-}" ]; then
    bash "$OPAX_SIM_GATE" opax-harness "$1"
  else
    echo "No simulator gate configured; booting the requested simulator directly." >&2
    xcrun simctl boot "$1" || true
    xcrun simctl bootstatus "$1" -b
  fi
}
