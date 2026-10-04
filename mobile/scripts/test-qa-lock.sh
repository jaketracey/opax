#!/usr/bin/env bash
# Offline tests for scripts/qa-lock.sh. Every lock lives in a scratch directory;
# this never sources the local QA config and never touches a shared lock.
set -euo pipefail
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/opax-qa-lock-test.XXXXXX")
LOCK="$SCRATCH/paste.lock"
WORKTREE=$(basename "$(cd "$SCRIPTS/../.." && pwd)")
LIVE=()
cleanup() {
  for pid in "${LIVE[@]:-}"; do [ -n "$pid" ] && { kill "$pid"; wait "$pid"; } 2>/dev/null || true; done
  /bin/rm -rf "$SCRATCH"
}
trap cleanup EXIT
unset OPAX_CAPACITY_CMD OPAX_PASTE_WAIT_SECONDS OPAX_LOAD_LIMIT QA_LOCK_LOG QA_LOCK_SCRIPT
export OPAX_PASTE_LOCK="$LOCK" OPAX_LOAD_PROBE="bash '$SCRATCH/probe.sh'"
export OPAX_CAPACITY_POLL_SECONDS=0.2 OPAX_PASTE_POLL_SECONDS=0.2 OPAX_PASTE_LOG_SECONDS=1
case "$OPAX_PASTE_LOCK" in "$SCRATCH"/*) ;; *) echo "Refusing a lock outside the scratch directory" >&2; exit 1 ;; esac
PASSED=0
pass() { PASSED=$((PASSED + 1)); echo "ok $PASSED - $1"; }
fail() { echo "not ok - $1" >&2; for f in "$SCRATCH"/*.log "$SCRATCH"/trace; do [ -f "$f" ] && { echo "--- $f" >&2; cat "$f" >&2; }; done; exit 1; }

# The load probe pops one value per call from $SCRATCH/loads (the last value
# repeats) and records whether the lock existed at that moment.
cat > "$SCRATCH/probe.sh" <<'EOF'
dir=$(dirname "$0")
value=$(head -n 1 "$dir/loads")
if [ "$(wc -l < "$dir/loads")" -gt 1 ]; then tail -n +2 "$dir/loads" > "$dir/loads.next"; /bin/mv -f "$dir/loads.next" "$dir/loads"; fi
if [ -d "$dir/paste.lock" ]; then state=held; else state=free; fi
echo "$value $state" >> "$dir/trace"
echo "$value"
EOF
# A holder acquires, reports, waits for a release file, then releases.
cat > "$SCRATCH/holder.sh" <<'EOF'
set -uo pipefail
source "$1"
name=$2
QA_LOCK_SCRIPT=holder.sh
if qa_paste_lock_acquire; then
  echo "$$" > "$name.acquired"
  until [ -f "$name.release" ]; do sleep 0.1; done
  qa_paste_lock_release
  touch "$name.released"
else
  touch "$name.failed"
fi
EOF
loads() { printf '%s\n' "$@" > "$SCRATCH/loads"; : > "$SCRATCH/trace"; }
# start_holder <name> [VAR=value ...]
start_holder() {
  local name=$1; shift
  env "$@" bash "$SCRATCH/holder.sh" "$SCRIPTS/qa-lock.sh" "$SCRATCH/$name" 2> "$SCRATCH/$name.log" &
  LIVE+=("$!")
}
wait_for() {
  local deadline=$((SECONDS + ${2:-15}))
  until [ -e "$1" ]; do [ "$SECONDS" -lt "$deadline" ] || return 1; sleep 0.1; done
}
release_holder() { touch "$SCRATCH/$1.release"; wait_for "$SCRATCH/$1.released" || fail "$1 did not release"; }
dead_pid() { bash -c 'echo $$' ; }

# 1. Capacity first: no lock is taken while the load is at or above the limit,
#    and the wait ends as soon as the load is under it (no lower resume level).
loads 150 140 139 130
start_holder capacity
wait_for "$SCRATCH/capacity.acquired" || fail "holder never acquired after the load fell"
grep -q 'waiting for it to fall below 140 (no lock held)' "$SCRATCH/capacity.log" || fail "no capacity wait logged"
! awk '$1 >= 140 && $2 == "held"' "$SCRATCH/trace" | grep -q . || fail "load was above the limit while the lock was held"
expected=$'150 free\n140 free\n139 free\n130 held'
[ "$(cat "$SCRATCH/trace")" = "$expected" ] || fail "capacity wait or recheck out of order"
pass "waits for load under 140 before taking the lock, then rechecks under it"

# 2. Owner metadata names the holder without private paths or secrets.
holder=$(cat "$SCRATCH/capacity.acquired")
owner="$LOCK/owner"
[ -f "$owner" ] || fail "no owner file inside the lock"
grep -qx "pid=$holder" "$owner" || fail "owner pid is not the holder"
grep -qx 'script=holder.sh' "$owner" || fail "owner script missing"
grep -qx "worktree=$WORKTREE" "$owner" || fail "owner worktree basename missing"
grep -Eqx 'started=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' "$owner" || fail "owner start time missing"
grep -Eqx 'token=[0-9a-f]{16}' "$owner" || fail "owner token missing"
[ "$(wc -l < "$owner")" -eq 5 ] || fail "owner has unexpected fields"
! grep -q '/' "$owner" || fail "owner records a path"
[ "$(/bin/ls -A "$LOCK")" = owner ] || fail "lock holds more than the owner file"
! mkdir "$LOCK" 2>/dev/null || fail "plain mkdir succeeded while held"
release_holder capacity
[ ! -e "$LOCK" ] || fail "release left the lock behind"
mkdir "$LOCK" && rmdir "$LOCK" || fail "plain mkdir/rmdir failed after release"
pass "owner file records pid, script, worktree and start; release removes it before rmdir"

# 3. A load spike right after mkdir releases the lock and goes back to waiting.
loads 50 150 150 150 150 60 60
start_holder spike
wait_for "$SCRATCH/spike.acquired" || fail "holder never acquired after the spike"
grep -q 'rose to 150 after taking the pasteboard lock; released it to wait' "$SCRATCH/spike.log" || fail "spike not logged"
expected=$'50 free\n150 held\n150 free\n150 free\n150 free\n60 free\n60 held'
[ "$(cat "$SCRATCH/trace")" = "$expected" ] || fail "lock not released during the spike wait"
release_holder spike
pass "releases the lock on a load spike and waits without it"

# 4. A lock whose recorded pid is dead is removed, with a log line.
loads 50
mkdir "$LOCK"
printf 'pid=%s\nscript=e2e.sh\nworktree=old-lane\nstarted=2026-10-04T00:00:00Z\ntoken=0123456789abcdef\n' "$(dead_pid)" > "$LOCK/owner"
start_holder stale
wait_for "$SCRATCH/stale.acquired" || fail "stale lock was not removed"
grep -q 'Removed stale pasteboard lock .*recorded pid is dead (pid=[0-9]* script=e2e.sh worktree=old-lane' "$SCRATCH/stale.log" || fail "stale removal not logged"
grep -qx "pid=$(cat "$SCRATCH/stale.acquired")" "$LOCK/owner" || fail "new owner not recorded"
release_holder stale
pass "removes a lock left by a dead pid and logs it"

# 5. A lock whose pid is alive is never removed; the wait names lock, holder, time.
sleep 30 & live=$!; LIVE+=("$live")
mkdir "$LOCK"
printf 'pid=%s\nscript=e2e.sh\nworktree=busy-lane\nstarted=2026-10-04T00:00:00Z\ntoken=fedcba9876543210\n' "$live" > "$LOCK/owner"
before=$(cat "$LOCK/owner")
start_holder alive OPAX_PASTE_WAIT_SECONDS=2
wait_for "$SCRATCH/alive.failed" || fail "waiter did not give up"
[ "$(cat "$LOCK/owner")" = "$before" ] || fail "live owner was changed"
grep -q "Waiting for pasteboard lock $LOCK; elapsed 0m0[0-9]s of 0m02s; holder: pid=$live script=e2e.sh worktree=busy-lane" "$SCRATCH/alive.log" || fail "wait line lacks lock, time or holder"
grep -q 'Pasteboard lock wait expired' "$SCRATCH/alive.log" || fail "expiry not logged"
/bin/rm -f "$LOCK/owner"; rmdir "$LOCK"
pass "never removes a lock whose pid is alive"

# 6. A lock with no owner file (another project's plain mkdir) is never removed,
#    and its holder's own plain rmdir still works afterwards.
mkdir "$LOCK"
start_holder foreign OPAX_PASTE_WAIT_SECONDS=2
wait_for "$SCRATCH/foreign.failed" || fail "waiter did not give up on a foreign lock"
grep -q 'holder: unknown (no owner file; it may belong to another project)' "$SCRATCH/foreign.log" || fail "foreign holder not described"
[ -d "$LOCK" ] && [ -z "$(/bin/ls -A "$LOCK")" ] || fail "foreign lock was changed"
rmdir "$LOCK" || fail "foreign holder could not rmdir its own lock"
pass "never removes or writes into a lock without an owner file"

# 7. Two waiters on one stale lock: exactly one takes it; the other waits.
loads 50
mkdir "$LOCK"
printf 'pid=%s\nscript=e2e.sh\nworktree=old-lane\nstarted=2026-10-04T00:00:00Z\ntoken=0123456789abcdef\n' "$(dead_pid)" > "$LOCK/owner"
start_holder first; start_holder second
deadline=$((SECONDS + 15))
until [ -e "$SCRATCH/first.acquired" ] || [ -e "$SCRATCH/second.acquired" ]; do
  [ "$SECONDS" -lt "$deadline" ] || fail "neither waiter acquired"; sleep 0.1
done
sleep 1
if [ -e "$SCRATCH/first.acquired" ]; then winner=first loser=second; else winner=second loser=first; fi
[ ! -e "$SCRATCH/$loser.acquired" ] || fail "both waiters acquired one lock"
grep -qx "pid=$(cat "$SCRATCH/$winner.acquired")" "$LOCK/owner" || fail "owner is not the winner"
release_holder "$winner"
wait_for "$SCRATCH/$loser.acquired" || fail "second waiter never acquired"
release_holder "$loser"
[ "$(grep -c 'Removed stale' "$SCRATCH/first.log" "$SCRATCH/second.log" | awk -F: '{s+=$2} END {print s}')" -eq 1 ] || fail "stale lock removed more than once"
pass "one stale lock is removed once and taken by one waiter"

# 8. Release never removes a lock that is no longer ours.
(
  source "$SCRIPTS/qa-lock.sh"
  qa_paste_lock_acquire 2>/dev/null
  printf 'pid=1\nscript=other\nworktree=x\nstarted=2026-10-04T00:00:00Z\ntoken=0000000000000000\n' > "$LOCK/owner"
  qa_paste_lock_release 2> "$SCRATCH/foreign-release.log"
)
[ -f "$LOCK/owner" ] && grep -q 'no longer ours' "$SCRATCH/foreign-release.log" || fail "released a lock with another token"
/bin/rm -f "$LOCK/owner"; rmdir "$LOCK"
pass "release leaves a lock carrying another owner's token"

# 9. With no capacity source configured, capacity waits are skipped.
(
  unset OPAX_LOAD_PROBE
  source "$SCRIPTS/qa-lock.sh"
  qa_paste_lock_acquire 2>/dev/null && [ -d "$LOCK" ] && qa_paste_lock_release 2>/dev/null
) || fail "acquire without a capacity source failed"
[ ! -e "$LOCK" ] || fail "lock left behind"
pass "skips capacity checks when none is configured"

echo "qa-lock: $PASSED passed"
