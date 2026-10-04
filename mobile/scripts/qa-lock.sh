#!/usr/bin/env bash
# Shared-host waits for QA runs: the load budget and the Mac-wide pasteboard lock.
# Source this file; it defines functions only. Paths come from the environment.
#
# Lock protocol. OPAX_PASTE_LOCK is a directory other projects share; they take
# and release it with plain `mkdir` and `rmdir`.
# - qa_paste_lock_run <command...> is the entry point for locked work. Outside
#   the build gate and holding nothing, it waits for the lock to look free and
#   for capacity (load5 under 140). It then enters the gate with qa-locked.sh,
#   which makes ONE non-blocking attempt at the lock, rechecks the load and runs
#   the command. On contention or a load spike the wrapper leaves the gate at
#   once (exit 75) and the caller starts again. The lock is never held while
#   waiting on the gate or the load, and a gate slot is never held while
#   waiting on the lock.
# - The wrapper leads its own process group and the command tree runs in it.
#   The lock's `owner` file records pid and pgid (both the wrapper), script,
#   worktree basename, UTC start and a random token.
# - Publication is atomic: the lock is built as a staging directory holding its
#   owner file, then renamed into place with renamex_np(RENAME_EXCL), which
#   fails if any directory is there (another project's empty lock included). An
#   OPAX lock never exists without its owner file.
# - Release stops and waits for every other process in the group, then renames
#   the lock aside in one step and deletes the retired copy.
# - A waiter retires a lock only when its owner names a dead pid AND its group
#   has no live process, rechecked under a kernel lock (flock) on
#   "<lock>.opax/reap". A lock without an owner file, or with a live pid or
#   group member, is never touched, and nothing is removed for its age.
# - "<lock>.opax/" also holds staging and retired directories left by crashed
#   runs; they are not locks, and are deleted once their pid is dead.
# Lock polls run `sleep 5` as a direct child of the caller; capacity polls use
# `sleep 20`, so host tooling can tell the two waits apart.

QA_LOAD_LIMIT=${OPAX_LOAD_LIMIT:-140}
QA_PASTE_WAIT_SECONDS=${OPAX_PASTE_WAIT_SECONDS:-7200}
QA_RETRY=75
PASTE_LOCK_HELD=0
PASTE_LOCK_TOKEN=

qa_log() {
  local line
  line="$(date +%H:%M:%S) $*"
  echo "$line" >&2
  if [ -n "${QA_LOCK_LOG:-}" ]; then echo "$line" >> "$QA_LOCK_LOG"; fi
}

qa_elapsed() { printf '%dm%02ds' $(($1 / 60)) $(($1 % 60)); }

# Capacity checks follow OPAX_CAPACITY_CMD: blank skips them, as documented.
qa_capacity_configured() { [ -n "${OPAX_CAPACITY_CMD:-}${OPAX_LOAD_PROBE:-}" ]; }

# Five-minute load as an integer. OPAX_LOAD_PROBE replaces the probe in tests.
qa_load5() {
  if [ -n "${OPAX_LOAD_PROBE:-}" ]; then
    bash -c "$OPAX_LOAD_PROBE" | awk '{print int($1); exit}'
  else
    /usr/sbin/sysctl -n vm.loadavg | awk '{print int($3)}'
  fi
}

# Returns once the five-minute load is under the limit (140). There is no lower
# resume level: waiting for 100 starved runs for an hour on the shared host.
# Fails at the epoch-seconds deadline in $1 (default one hour).
qa_wait_for_capacity() {
  local deadline=${1:-$(($(date +%s) + 3600))} load
  qa_capacity_configured || return 0
  load=$(qa_load5)
  [ "$load" -ge "$QA_LOAD_LIMIT" ] || return 0
  qa_log "Shared load is $load; waiting for it to fall below $QA_LOAD_LIMIT (no lock held)."
  until [ "$load" -lt "$QA_LOAD_LIMIT" ]; do
    [ "$(date +%s)" -lt "$deadline" ] || { qa_log "Capacity wait expired; retry later."; return 1; }
    sleep "${OPAX_CAPACITY_POLL_SECONDS:-20}"
    load=$(qa_load5)
  done
  qa_log "Shared load is $load; continuing."
}

# Prints the public owner fields (never the token) from owner text on stdin.
qa_owner_fields() {
  awk -F= '$1=="pid"||$1=="pgid"||$1=="script"||$1=="worktree"||$1=="started" {printf "%s%s=%s", sep, $1, $2; sep=" "}'
}

qa_lock_holder() {
  if [ -f "$1/owner" ]; then
    qa_owner_fields < "$1/owner"
  else
    printf 'unknown (no owner file; not an OPAX lock, so it is never removed)'
  fi
}

qa_owner_field() { printf '%s\n' "$1" | sed -n "s/^$2=\\([0-9][0-9]*\\)\$/\\1/p" | head -n 1; }

# True while the pid, or any process in the group, exists (EPERM counts).
qa_alive() { /usr/bin/perl -e 'exit((kill(0, $ARGV[0]) || $!{EPERM}) ? 0 : 1)' -- "$1"; }

# Atomic no-replace rename: 0 renamed, 1 the target exists, 2 any other error.
qa_rename_excl() {
  /usr/bin/python3 -c '
import ctypes, ctypes.util, errno, sys
libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
RENAME_EXCL = 0x4
if libc.renamex_np(sys.argv[1].encode(), sys.argv[2].encode(), RENAME_EXCL) == 0:
    sys.exit(0)
code = ctypes.get_errno()
if code == errno.EEXIST:
    sys.exit(1)
sys.stderr.write("renamex_np: %s\n" % errno.errorcode.get(code, code))
sys.exit(2)
' "$1" "$2"
}

qa_retire_lock() { /bin/mv "$1" "$2"; }
qa_delete_retired() { /bin/rm -rf "$1"; }

# Deletes staging and retired directories whose creating pid is dead. They are
# OPAX-only names inside OPAX's own state directory, never another lock.
qa_clean_state() {
  local state=$1 path pid
  for path in "$state"/stage.* "$state"/retired.*; do
    [ -d "$path" ] || continue
    pid=$(basename "$path" | cut -d. -f2)
    case "$pid" in '' | *[!0-9]*) continue ;; esac
    qa_alive "$pid" || qa_delete_retired "$path"
  done
}

# Retires a lock whose owner names a dead pid and an empty process group.
# Returns 0 only if it did.
qa_reap_stale_lock() {
  local lock=$1 state owner pid pgid retired
  owner=$(cat "$lock/owner" 2>/dev/null) || return 1
  pid=$(qa_owner_field "$owner" pid)
  pgid=$(qa_owner_field "$owner" pgid)
  [ -n "$pid" ] && [ -n "$pgid" ] || return 1
  qa_alive "$pid" && return 1
  qa_alive "-$pgid" && return 1
  state="$lock.opax"
  mkdir -p "$state" || return 1
  retired="$state/retired.$$.$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
  # Recheck under an exclusive kernel lock, released on exit: the owner must
  # still be the one judged stale, and its pid and group must still be dead.
  /usr/bin/perl -MFcntl=:flock -e '
    my ($lock, $state, $expected, $retired) = @ARGV;
    open(my $guard, ">>", "$state/reap") or exit 3;
    flock($guard, LOCK_EX) or exit 3;
    open(my $file, "<", "$lock/owner") or exit 1;
    my $now = do { local $/; <$file> };
    close $file;
    $now =~ s/\n+\z//;
    exit 1 unless $now eq $expected;
    my ($pid) = $now =~ /^pid=(\d+)$/m or exit 1;
    my ($pgid) = $now =~ /^pgid=(\d+)$/m or exit 1;
    for my $target ($pid, -$pgid) { exit 1 if kill(0, $target) || $!{EPERM}; }
    rename($lock, $retired) or exit 2;
    exit 0;
  ' "$lock" "$state" "$owner" "$retired" || return 1
  qa_log "Removed stale pasteboard lock $lock: its pid and process group are gone ($(printf '%s\n' "$owner" | qa_owner_fields))."
  qa_delete_retired "$retired"
}

# One non-blocking attempt, from a process-group leader (qa-locked.sh).
# Returns 0 held (or no lock configured), 1 busy, 2 load spike (released),
# 3 error.
qa_paste_lock_try() {
  local lock=${OPAX_PASTE_LOCK:-} state stage load rc worktree
  if [ -z "$lock" ]; then
    echo "No pasteboard lock configured; running without it." >&2
    return 0
  fi
  if [ "$(/bin/ps -o pgid= -p $$ | tr -d ' ')" != "$$" ]; then
    qa_log "The pasteboard lock must be taken by a process-group leader (qa-locked.sh)."
    return 3
  fi
  [ ! -e "$lock" ] || return 1
  state="$lock.opax"
  mkdir -p "$state" || return 3
  qa_clean_state "$state"
  PASTE_LOCK_TOKEN=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
  stage="$state/stage.$$.$PASTE_LOCK_TOKEN"
  worktree=$(basename "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")
  mkdir "$stage" && {
    echo "pid=$$"
    echo "pgid=$$"
    echo "script=${QA_LOCK_SCRIPT:-$(basename "$0")}"
    echo "worktree=$worktree"
    echo "started=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "token=$PASTE_LOCK_TOKEN"
  } > "$stage/owner" || { qa_delete_retired "$stage"; return 3; }
  qa_rename_excl "$stage" "$lock"
  rc=$?
  if [ "$rc" != 0 ]; then
    qa_delete_retired "$stage"
    [ "$rc" = 1 ] && return 1
    return 3
  fi
  PASTE_LOCK_HELD=1
  if qa_capacity_configured; then
    load=$(qa_load5)
    if [ "$load" -ge "$QA_LOAD_LIMIT" ]; then
      qa_paste_lock_release
      qa_log "Shared load rose to $load after taking the pasteboard lock; released it to wait."
      return 2
    fi
  fi
  qa_log "Took pasteboard lock $lock (pid and process group $$)."
}

# Releases only our own lock: it must carry our token. Renaming it aside is the
# single step that frees it; the retired copy is deleted afterwards.
qa_paste_lock_release() {
  local lock=${OPAX_PASTE_LOCK:-} retired
  [ "$PASTE_LOCK_HELD" = 1 ] && [ -n "$lock" ] || return 0
  PASTE_LOCK_HELD=0
  if ! grep -qx "token=$PASTE_LOCK_TOKEN" "$lock/owner" 2>/dev/null; then
    qa_log "Pasteboard lock $lock is gone or no longer ours (holder: $(qa_lock_holder "$lock")); leaving it."
    return 0
  fi
  retired="$lock.opax/retired.$$.$PASTE_LOCK_TOKEN"
  if qa_retire_lock "$lock" "$retired"; then
    qa_log "Released pasteboard lock $lock."
    qa_delete_retired "$retired"
  else
    qa_log "Could not release pasteboard lock $lock; a waiter retires it once this group is gone."
  fi
}

# Sets QA_GROUP_OTHERS to the other live members of our process group (the
# locked command tree). Runs in this shell, not a subshell (bash 3.2 has no
# BASHPID); pgrep never lists itself, and zombies are skipped.
qa_group_others() {
  local pid state
  QA_GROUP_OTHERS=
  for pid in $(pgrep -g "$$"); do
    [ "$pid" = "$$" ] && continue
    state=$(/bin/ps -o stat= -p "$pid" 2>/dev/null) || continue
    case "$state" in Z*) continue ;; esac
    QA_GROUP_OTHERS="$QA_GROUP_OTHERS $pid"
  done
}

# Stops the rest of our process group: TERM, a grace period, then KILL.
# Returns 1 if a member survives; the lock must then stay held.
qa_stop_group() {
  local deadline
  qa_group_others
  [ -n "$QA_GROUP_OTHERS" ] || return 0
  qa_log "Stopping leftover process(es)$QA_GROUP_OTHERS of the locked command before release."
  kill -TERM $QA_GROUP_OTHERS 2>/dev/null
  deadline=$((SECONDS + ${OPAX_STOP_GRACE_SECONDS:-20}))
  while qa_group_others && [ -n "$QA_GROUP_OTHERS" ] && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.2; done
  if [ -n "$QA_GROUP_OTHERS" ]; then
    kill -KILL $QA_GROUP_OTHERS 2>/dev/null
    deadline=$((SECONDS + 5))
    while qa_group_others && [ -n "$QA_GROUP_OTHERS" ] && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.2; done
  fi
  [ -z "$QA_GROUP_OTHERS" ] || { qa_log "Locked command processes$QA_GROUP_OTHERS would not stop; keeping the lock."; return 1; }
}

qa_gate() {
  if declare -F build_command >/dev/null; then build_command "$@"; else "$@"; fi
}

# Runs a command under the pasteboard lock: capacity, then the gate, then one
# lock attempt inside it (see the protocol above). Returns the command's exit
# code, or 1 when OPAX_PASTE_WAIT_SECONDS (default 7200) expires first.
qa_paste_lock_run() {
  local lock=${OPAX_PASTE_LOCK:-} wrapper start deadline now rc last_log=
  wrapper="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/qa-locked.sh"
  start=$(date +%s)
  deadline=$((start + QA_PASTE_WAIT_SECONDS))
  while :; do
    if [ -n "$lock" ] && [ -e "$lock" ] && ! qa_reap_stale_lock "$lock"; then
      now=$(date +%s)
      if [ -z "$last_log" ] || [ $((now - last_log)) -ge "${OPAX_PASTE_LOG_SECONDS:-60}" ]; then
        qa_log "Waiting for pasteboard lock $lock; elapsed $(qa_elapsed $((now - start))) of $(qa_elapsed "$QA_PASTE_WAIT_SECONDS"); holder: $(qa_lock_holder "$lock")."
        last_log=$now
      fi
      if [ "$now" -ge "$deadline" ]; then
        qa_log "Pasteboard lock wait expired after $(qa_elapsed $((now - start))); holder: $(qa_lock_holder "$lock")."
        return 1
      fi
      sleep "${OPAX_PASTE_POLL_SECONDS:-5}"
      continue
    fi
    qa_wait_for_capacity "$deadline" || return 1
    [ -n "$lock" ] && [ -e "$lock" ] && continue
    rc=0
    qa_gate "$wrapper" "$@" || rc=$?
    [ "$rc" = "$QA_RETRY" ] || return "$rc"
    if [ "$(date +%s)" -ge "$deadline" ]; then
      qa_log "Pasteboard lock wait expired after $(qa_elapsed $(($(date +%s) - start)))."
      return 1
    fi
    sleep "${OPAX_PASTE_POLL_SECONDS:-5}"
  done
}
