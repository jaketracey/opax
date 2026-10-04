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
paste_lock_wait_seconds() {
  local default_wait=7200
  local wait_seconds=${OPAX_PASTE_WAIT_SECONDS:-$default_wait}
  # Bound decimal input before shell arithmetic, including leading zeroes.
  if [[ ! "$wait_seconds" =~ ^[0-9]+$ || ${#wait_seconds} -gt 9 ]]; then
    wait_seconds=$default_wait
  fi
  printf '%s\n' "$((10#$wait_seconds))"
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
