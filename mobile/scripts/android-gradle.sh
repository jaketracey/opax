#!/usr/bin/env bash
# Shared Gradle settings for build-android.sh and build-play.sh. Source from mobile/.
# These change how a build runs (daemon, caches, parallelism), not what it produces.
#   OPAX_GRADLE_WORKERS   Gradle workers (default 8, about half the desktop's 16 vCPUs)
#   OPAX_NATIVE_JOBS      C/C++ compile and link jobs across CMake builds (default 6)
#   OPAX_GRADLE_DAEMON=0  single-use build without a long-lived daemon
#   OPAX_GRADLE_CONFIG_CACHE=1  also use Gradle's configuration cache (off by default)
#   OPAX_ANDROID_CLEAN=1  start from an empty android/ (no kept Gradle state)
#   OPAX_CCACHE           ccache binary for NDK compiles (off when unset)

ANDROID_STATE_DIRS=(.gradle .kotlin build app/build app/.cxx)

# Gradle arguments for the wrapper call, in the ANDROID_GRADLE_ARGS array.
android_gradle_args() {
  local workers=${OPAX_GRADLE_WORKERS:-8} jobs=${OPAX_NATIVE_JOBS:-6}
  [[ "$workers" =~ ^[1-9][0-9]?$ ]] || { echo 'OPAX_GRADLE_WORKERS must be 1 to 99' >&2; return 2; }
  [[ "$jobs" =~ ^[1-9][0-9]?$ ]] || { echo 'OPAX_NATIVE_JOBS must be 1 to 99' >&2; return 2; }
  export OPAX_NATIVE_JOBS=$jobs
  ANDROID_GRADLE_ARGS=(--init-script "$PWD/scripts/gradle/opax-build-speed.init.gradle"
    "--max-workers=$workers")
  if [ "${OPAX_GRADLE_BUILD_CACHE:-1}" = 1 ]; then
    ANDROID_GRADLE_ARGS+=(--build-cache)
  else
    ANDROID_GRADLE_ARGS+=(--no-build-cache)
  fi
  if [ "${OPAX_GRADLE_DAEMON:-1}" = 0 ]; then
    ANDROID_GRADLE_ARGS+=(--no-daemon)
  else
    # One daemon per JVM setting, reused across worktrees, gone after 30 idle minutes.
    ANDROID_GRADLE_ARGS+=(--daemon -Dorg.gradle.daemon.idletimeout=1800000)
  fi
  if [ "${OPAX_GRADLE_CONFIG_CACHE:-0}" = 1 ]; then
    ANDROID_GRADLE_ARGS+=(--configuration-cache)
  fi
  if [ -n "${OPAX_CCACHE:-}" ]; then
    if [ -x "$OPAX_CCACHE" ]; then
      export OPAX_CCACHE CCACHE_DIR=${CCACHE_DIR:-$HOME/.cache/opax-ccache}
      export CCACHE_MAXSIZE=${CCACHE_MAXSIZE:-20G}
    else
      echo "OPAX_CCACHE is not an executable; building without ccache" >&2
      unset OPAX_CCACHE
    fi
  fi
}

# expo prebuild deletes android/ and writes it again. Move Gradle's state (task history,
# file hashes, build and CMake outputs) aside first and put it back afterwards, so every
# generated source is fresh from prebuild while Gradle and Ninja stay incremental.
android_stash_state() {
  local stash=$1 dir
  if [ "${OPAX_ANDROID_CLEAN:-0}" = 1 ]; then
    rm -rf "$stash"
    return
  fi
  for dir in "${ANDROID_STATE_DIRS[@]}"; do
    if [ -e "android/$dir" ]; then
      rm -rf "${stash:?}/$dir"
      mkdir -p "$(dirname "$stash/$dir")"
      mv "android/$dir" "$stash/$dir"
    fi
  done
}

android_restore_state() {
  local stash=$1 dir
  for dir in "${ANDROID_STATE_DIRS[@]}"; do
    if [ -e "$stash/$dir" ]; then
      rm -rf "android/${dir:?}"
      mkdir -p "$(dirname "android/$dir")"
      mv "$stash/$dir" "android/$dir"
    fi
  done
}
