#!/usr/bin/env bash
# Keeps Android builds, emulators and flows off machines that should not run them.
# Source from mobile/ after qa-env.sh, before any Gradle, NDK or emulator step.
# A machine opts out with the marker file ~/.config/opax/no-android, or
# OPAX_NO_ANDROID=1 (for example in the ignored .qa.local.env).
# OPAX_ANDROID_HERE=1 allows one run anyway. With neither set, nothing changes.
android_host_guard() {
  [ "${OPAX_ANDROID_HERE:-0}" = 1 ] && return 0
  if [ "${OPAX_NO_ANDROID:-0}" = 1 ] || [ -e "${HOME:-/nonexistent}/.config/opax/no-android" ]; then
    echo "Android builds, emulators and flows do not run on this machine (OPAX_NO_ANDROID or ~/.config/opax/no-android). Run this on the Android host, or set OPAX_ANDROID_HERE=1 for one run." >&2
    return 3
  fi
}
android_host_guard || exit $?
