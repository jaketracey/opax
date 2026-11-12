#!/usr/bin/env bash
# Offline tests for scripts/android-host.sh. Uses a scratch HOME; runs no Gradle,
# emulator or device step.
set -euo pipefail
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/opax-android-host-test.XXXXXX")
trap '/bin/rm -rf "$SCRATCH"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
guard() { env -i PATH="$PATH" HOME="$1" "${@:2}" bash -c "source '$SCRIPTS/android-host.sh'; echo passed"; }

mkdir -p "$SCRATCH/plain" "$SCRATCH/marked/.config/opax"
: > "$SCRATCH/marked/.config/opax/no-android"

[ "$(guard "$SCRATCH/plain" 2>/dev/null)" = passed ] || fail 'a machine without the marker must pass'
set +e
out=$(guard "$SCRATCH/marked" 2>&1); rc=$?
set -e
[ "$rc" = 3 ] || fail "the marker must stop the run with exit 3, got $rc"
case "$out" in *'Android host'*) ;; *) fail 'the refusal must say where to run instead' ;; esac
case "$out" in *passed*) fail 'nothing may run after a refusal' ;; esac
set +e
guard "$SCRATCH/plain" OPAX_NO_ANDROID=1 >/dev/null 2>&1; rc=$?
set -e
[ "$rc" = 3 ] || fail "OPAX_NO_ANDROID=1 must stop the run, got $rc"
[ "$(guard "$SCRATCH/marked" OPAX_ANDROID_HERE=1 2>/dev/null)" = passed ] || fail 'OPAX_ANDROID_HERE=1 must allow one run'

# Every Android entry point loads the guard right after qa-env.sh, before Gradle or an emulator.
for f in build-android.sh build-play.sh e2e-android.sh e2e-android-device.sh; do
  first_env=$(grep -n -m1 '^source scripts/qa-env.sh$' "$SCRIPTS/$f" | cut -d: -f1)
  guard_line=$(grep -n -m1 '^source scripts/android-host.sh$' "$SCRIPTS/$f" | cut -d: -f1)
  [ -n "$guard_line" ] || fail "$f does not source android-host.sh"
  [ "$guard_line" = $((first_env + 1)) ] || fail "$f must source android-host.sh straight after qa-env.sh"
done
echo 'android-host: all checks passed'
