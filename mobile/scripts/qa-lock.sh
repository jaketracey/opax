#!/usr/bin/env bash
# Shared-host waits for QA runs: the load budget and the Mac-wide pasteboard lock.
# Source this file; it defines functions only. Paths come from the environment.
#
# Lock protocol (OPAX_PASTE_LOCK is a directory other projects share):
# - Wait for capacity first, then try `mkdir`. Never wait for load, builds or
#   devices while holding the lock.
# - After `mkdir` succeeds, recheck the load. If it has reached the limit,
#   release the lock and go back to waiting.
# - The holder writes `owner` inside the lock directory: pid, script, worktree
#   basename, UTC start time and a random token. The file lives and dies with
#   that lock, so it can never describe a lock someone else created.
# - Release removes our own `owner` file, then `rmdir`s the directory. Other
#   projects take and release the same directory with plain `mkdir` and
#   `rmdir`; we never write into a lock we did not create, so their `rmdir` of
#   their own (empty) lock is unaffected.
# - A waiter may remove a lock only when its `owner` file names a dead pid. A
#   lock without an owner file (another project's, or one being created) or
#   with a live pid is never removed. Removal rechecks the owner under a kernel
#   lock on "<lock>.reap", so two waiters cannot both act on one stale lock.
# Lock polls run `sleep 5` as a direct child of the caller; capacity polls use
# `sleep 20`, so host tooling can tell the two waits apart.

QA_LOAD_LIMIT=${OPAX_LOAD_LIMIT:-140}
QA_LOAD_RESUME=${OPAX_LOAD_RESUME:-100}
QA_PASTE_WAIT_SECONDS=${OPAX_PASTE_WAIT_SECONDS:-7200}
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

# Returns once the load is under the limit; at or above it, waits for the
# resume level. Fails at the epoch-seconds deadline in $1 (default one hour).
qa_wait_for_capacity() {
  local deadline=${1:-$(($(date +%s) + 3600))} load
  qa_capacity_configured || return 0
  load=$(qa_load5)
  [ "$load" -ge "$QA_LOAD_LIMIT" ] || return 0
  qa_log "Shared load is $load; waiting for it to fall below $QA_LOAD_RESUME (no lock held)."
  until [ "$load" -lt "$QA_LOAD_RESUME" ]; do
    [ "$(date +%s)" -lt "$deadline" ] || { qa_log "Capacity wait expired; retry later."; return 1; }
    sleep "${OPAX_CAPACITY_POLL_SECONDS:-20}"
    load=$(qa_load5)
  done
  qa_log "Shared load is $load; continuing."
}

# Prints the public owner fields (never the token) from owner text on stdin.
qa_owner_fields() {
  awk -F= '$1=="pid"||$1=="script"||$1=="worktree"||$1=="started" {printf "%s%s=%s", sep, $1, $2; sep=" "}'
}

qa_lock_holder() {
  if [ -f "$1/owner" ]; then
    qa_owner_fields < "$1/owner"
  else
    printf 'unknown (no owner file; it may belong to another project)'
  fi
}

# Removes a lock whose owner file names a dead pid. Returns 0 only if it did.
qa_reap_stale_lock() {
  local lock=$1 owner pid
  owner=$(cat "$lock/owner" 2>/dev/null) || return 1
  pid=$(printf '%s\n' "$owner" | sed -n 's/^pid=\([0-9][0-9]*\)$/\1/p' | head -n 1)
  [ -n "$pid" ] || return 1
  /bin/ps -p "$pid" >/dev/null 2>&1 && return 1
  # Recheck and remove under an exclusive kernel lock, released on exit: the
  # owner must still be the one judged stale and its pid must still be dead.
  /usr/bin/perl -MFcntl=:flock -e '
    my ($lock, $expected) = @ARGV;
    open(my $guard, ">>", "$lock.reap") or exit 3;
    flock($guard, LOCK_EX) or exit 3;
    open(my $file, "<", "$lock/owner") or exit 1;
    my $now = do { local $/; <$file> };
    close $file;
    $now =~ s/\n+\z//;
    exit 1 unless $now eq $expected;
    my ($pid) = $now =~ /^pid=(\d+)$/m or exit 1;
    exit 1 if kill(0, $pid) || $!{EPERM};
    unlink("$lock/owner") or exit 2;
    rmdir($lock) or exit 2;
    exit 0;
  ' "$lock" "$owner" || return 1
  qa_log "Removed stale pasteboard lock $lock: its recorded pid is dead ($(printf '%s\n' "$owner" | qa_owner_fields))."
}

qa_write_lock_owner() {
  local lock=$1 tmp worktree
  worktree=$(basename "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")
  PASTE_LOCK_TOKEN=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
  # Write beside the final name, then rename: readers never see a partial pid.
  tmp="$lock/.owner.$$"
  {
    echo "pid=$$"
    echo "script=${QA_LOCK_SCRIPT:-$(basename "$0")}"
    echo "worktree=$worktree"
    echo "started=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "token=$PASTE_LOCK_TOKEN"
  } > "$tmp" && /bin/mv -f "$tmp" "$lock/owner"
}

# Waits for capacity, then for the lock; sets PASTE_LOCK_HELD=1 on success.
# One deadline (OPAX_PASTE_WAIT_SECONDS, default 7200) covers both waits.
qa_paste_lock_acquire() {
  local lock=${OPAX_PASTE_LOCK:-} start deadline now load last_log=
  if [ -z "$lock" ]; then
    echo "No pasteboard lock configured; skipping lock." >&2
    return 0
  fi
  start=$(date +%s)
  deadline=$((start + QA_PASTE_WAIT_SECONDS))
  while :; do
    qa_wait_for_capacity "$deadline" || return 1
    if mkdir "$lock" 2>/dev/null; then
      PASTE_LOCK_HELD=1
      PASTE_LOCK_TOKEN=
      if ! qa_write_lock_owner "$lock"; then
        qa_paste_lock_release
        qa_log "Could not record the pasteboard lock owner; released $lock."
        return 1
      fi
      if qa_capacity_configured; then
        load=$(qa_load5)
        if [ "$load" -ge "$QA_LOAD_LIMIT" ]; then
          qa_paste_lock_release
          qa_log "Shared load rose to $load after taking the pasteboard lock; released it to wait."
          continue
        fi
      fi
      qa_log "Took pasteboard lock $lock after $(qa_elapsed $(($(date +%s) - start)))."
      return 0
    fi
    if qa_reap_stale_lock "$lock"; then continue; fi
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
  done
}

# Releases only the lock this process created. An owner file must carry our
# token; without one (interrupted before it was written) only an empty
# directory is removed.
qa_paste_lock_release() {
  local lock=${OPAX_PASTE_LOCK:-}
  [ "$PASTE_LOCK_HELD" = 1 ] && [ -n "$lock" ] || return 0
  PASTE_LOCK_HELD=0
  if [ ! -d "$lock" ]; then
    qa_log "Pasteboard lock $lock was already gone at release."
    return 0
  fi
  if [ -f "$lock/owner" ]; then
    if [ -z "$PASTE_LOCK_TOKEN" ] || ! grep -qx "token=$PASTE_LOCK_TOKEN" "$lock/owner"; then
      qa_log "Pasteboard lock $lock is no longer ours (holder: $(qa_lock_holder "$lock")); leaving it."
      return 0
    fi
    /bin/rm -f "$lock/owner"
  fi
  /bin/rm -f "$lock/.owner.$$"
  if rmdir "$lock" 2>/dev/null; then
    qa_log "Released pasteboard lock $lock."
  else
    qa_log "Could not remove pasteboard lock $lock; check its contents."
  fi
}
