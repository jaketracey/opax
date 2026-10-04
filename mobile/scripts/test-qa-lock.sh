#!/usr/bin/env bash
# Offline tests for scripts/qa-lock.sh and qa-locked.sh with a mocked build
# gate. Every lock lives in a scratch directory; this never sources the local QA
# config and never touches a shared lock or gate.
set -euo pipefail
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/opax-qa-lock-test.XXXXXX")
LOCK="$SCRATCH/paste.lock"
STATE="$LOCK.opax"
WORKTREE=$(basename "$(cd "$SCRIPTS/../.." && pwd)")
LIVE=()
cleanup() {
  for pid in "${LIVE[@]:-}"; do [ -n "$pid" ] && { kill "$pid"; wait "$pid"; } 2>/dev/null || true; done
  /bin/rm -rf "$SCRATCH"
}
trap cleanup EXIT
unset OPAX_CAPACITY_CMD OPAX_PASTE_WAIT_SECONDS OPAX_LOAD_LIMIT OPAX_BUILD_GATE QA_LOCK_LOG QA_LOCK_SCRIPT
export OPAX_PASTE_LOCK="$LOCK" OPAX_LOAD_PROBE="bash '$SCRATCH/probe.sh'" SCRATCH
export OPAX_CAPACITY_POLL_SECONDS=0.2 OPAX_PASTE_POLL_SECONDS=0.2 OPAX_PASTE_LOG_SECONDS=1 OPAX_STOP_GRACE_SECONDS=2
case "$OPAX_PASTE_LOCK" in "$SCRATCH"/*) ;; *) echo "Refusing a lock outside the scratch directory" >&2; exit 1 ;; esac
PASSED=0
pass() { PASSED=$((PASSED + 1)); echo "ok $PASSED - $1"; }
fail() {
  echo "not ok - $1" >&2
  for f in "$SCRATCH"/*.log "$SCRATCH"/*.trace; do [ -f "$f" ] && { echo "--- $f" >&2; cat "$f" >&2; }; done
  exit 1
}

# Lock state as other processes see it: opax (owner file), foreign (no owner), free.
cat > "$SCRATCH/state.sh" <<'EOF'
if [ -f "$OPAX_PASTE_LOCK/owner" ]; then echo opax; elif [ -d "$OPAX_PASTE_LOCK" ]; then echo foreign; else echo free; fi
EOF
# The load probe pops one value per call from loads (the last value repeats)
# and records the lock state and whether it ran inside the gate.
cat > "$SCRATCH/probe.sh" <<'EOF'
value=$(head -n 1 "$SCRATCH/loads")
if [ "$(wc -l < "$SCRATCH/loads")" -gt 1 ]; then tail -n +2 "$SCRATCH/loads" > "$SCRATCH/loads.next"; /bin/mv -f "$SCRATCH/loads.next" "$SCRATCH/loads"; fi
echo "$value $(bash "$SCRATCH/state.sh") gate=${MOCK_IN_GATE:-0}" >> "$SCRATCH/probe.trace"
echo "$value"
EOF
# Mock build gate: waits while the pause flag exists (like an archive pause),
# can let another project take the lock inside our slot, then runs the command.
cat > "$SCRATCH/gate.sh" <<'EOF'
shift
while [ -e "$SCRATCH/pause" ]; do echo "gate-wait lock=$(bash "$SCRATCH/state.sh")" >> "$SCRATCH/gate.trace"; sleep 0.1; done
echo "gate-enter $(date +%s) lock=$(bash "$SCRATCH/state.sh")" >> "$SCRATCH/gate.trace"
if [ -e "$SCRATCH/race" ]; then /bin/rm -f "$SCRATCH/race"; mkdir "$OPAX_PASTE_LOCK"; fi
MOCK_IN_GATE=1 nice -n 10 "$@"
rc=$?
echo "gate-exit $(date +%s) rc=$rc lock=$(bash "$SCRATCH/state.sh")" >> "$SCRATCH/gate.trace"
exit "$rc"
EOF
# runner.sh <name> <command...>: qa_paste_lock_run through the mock gate.
cat > "$SCRATCH/runner.sh" <<'EOF'
set -uo pipefail
source "$1"; shift
name=$1; shift
build_command() { bash "$SCRATCH/gate.sh" test "$@"; }
export QA_LOCK_SCRIPT=runner.sh
qa_paste_lock_run "$@"
echo "$?" > "$SCRATCH/$name.rc"
EOF
# cmd.sh <name> [hold|leave|exit N|child]: the locked command.
cat > "$SCRATCH/cmd.sh" <<'EOF'
name=$1; mode=${2:-quick}
/bin/ps -o pgid= -p $$ | tr -d ' ' > "$SCRATCH/$name.pgid"
[ -d "$OPAX_PASTE_LOCK" ] && cat "$OPAX_PASTE_LOCK/owner" > "$SCRATCH/$name.owner" 2>/dev/null
echo "run $name lock=$(bash "$SCRATCH/state.sh") pause=$([ -e "$SCRATCH/pause" ] && echo yes || echo no) gate=${MOCK_IN_GATE:-0}" >> "$SCRATCH/cmd.trace"
case "$mode" in
  quick) ;;
  exit) exit "$3" ;;
  hold) touch "$SCRATCH/$name.running"; until [ -e "$SCRATCH/$name.release" ] || [ ! -d "$SCRATCH" ]; do sleep 0.1; done ;;
  leave) sleep 30 & echo $! > "$SCRATCH/$name.leftover" ;;
  child) sleep 60 & echo $! > "$SCRATCH/$name.child"; touch "$SCRATCH/$name.running"; wait ;;
  critical)
    for i in 1 2 3; do mkdir "$SCRATCH/critical" || { echo overlap >> "$SCRATCH/violations"; exit 1; }; sleep 0.05; rmdir "$SCRATCH/critical"; done ;;
esac
EOF
loads() { printf '%s\n' "$@" > "$SCRATCH/loads"; : > "$SCRATCH/probe.trace"; : > "$SCRATCH/gate.trace"; : > "$SCRATCH/cmd.trace"; }
# run_locked <name> [VAR=value ...] -- <cmd mode...>: runs in the background.
run_locked() {
  local name=$1; shift
  local envs=()
  while [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  env "${envs[@]:-SCRATCH=$SCRATCH}" bash "$SCRATCH/runner.sh" "$SCRIPTS/qa-lock.sh" "$name" bash "$SCRATCH/cmd.sh" "$name" "$@" 2> "$SCRATCH/$name.log" &
  LIVE+=("$!")
}
wait_for() {
  local deadline=$((SECONDS + ${2:-15}))
  until [ -e "$1" ]; do [ "$SECONDS" -lt "$deadline" ] || return 1; sleep 0.1; done
}
rc_of() { wait_for "$SCRATCH/$1.rc" "${2:-15}" || fail "$1 did not finish"; cat "$SCRATCH/$1.rc"; }
dead_pid() { bash -c 'echo $$'; }
no_litter() { [ -z "$(/bin/ls "$STATE" 2>/dev/null | grep -v '^reap$')" ]; }
# in_leader '<code>': runs code in a new process-group leader with the library sourced.
# The subshell's stderr only carries the shell's "Killed: 9" notice for crash tests.
in_leader() { ( /usr/bin/perl -e 'setpgrp(0, 0) or die; exec @ARGV' bash -c 'source "$0"; '"$1" "$SCRIPTS/qa-lock.sh" 2>> "$SCRATCH/leader.log"; : ) 2>/dev/null; }
stale_owner() { printf 'pid=%s\npgid=%s\nscript=e2e.sh\nworktree=old-lane\nstarted=2026-10-04T00:00:00Z\ntoken=0123456789abcdef\n' "$1" "$2"; }

# 1. Capacity first, outside the gate and holding nothing; one gate entry once
#    the load is under 140, with the recheck under the lock inside the gate.
loads 150 140 139 130
run_locked first -- quick
[ "$(rc_of first)" = 0 ] || fail "first run failed"
[ "$(cat "$SCRATCH/probe.trace")" = $'150 free gate=0\n140 free gate=0\n139 free gate=0\n130 opax gate=1' ] || fail "capacity and recheck out of order"
[ "$(grep -c gate-enter "$SCRATCH/gate.trace")" = 1 ] && grep -q 'gate-enter .* lock=free' "$SCRATCH/gate.trace" || fail "gate entered more than once or with the lock held"
grep -q 'gate-exit .* rc=0 lock=free' "$SCRATCH/gate.trace" || fail "lock not released before leaving the gate"
grep -qx 'run first lock=opax pause=no gate=1' "$SCRATCH/cmd.trace" || fail "command did not run under the lock inside the gate"
pass "waits for capacity outside the gate, then locks and runs inside it"

# 2. Owner metadata: pid = pgid = the wrapper leading the command's group.
owner="$SCRATCH/first.owner"
pgid=$(cat "$SCRATCH/first.pgid")
grep -qx "pid=$pgid" "$owner" && grep -qx "pgid=$pgid" "$owner" || fail "owner pid/pgid is not the command's group leader"
grep -qx 'script=runner.sh' "$owner" && grep -qx "worktree=$WORKTREE" "$owner" || fail "owner script or worktree missing"
grep -Eqx 'started=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' "$owner" && grep -Eqx 'token=[0-9a-f]{16}' "$owner" || fail "owner start or token missing"
[ "$(wc -l < "$owner")" -eq 6 ] && ! grep -q / "$owner" || fail "owner has extra fields or a path"
[ ! -e "$LOCK" ] && no_litter || fail "release left the lock or staging behind"
mkdir "$LOCK" && rmdir "$LOCK" || fail "plain mkdir/rmdir failed after release"
pass "owner records pid and pgid of the wrapper, script, worktree and start"

# 3. A load spike after taking the lock: release inside the gate, leave it,
#    wait for capacity outside, then enter again.
loads 50 150 150 150 60 60
run_locked spike -- quick
[ "$(rc_of spike)" = 0 ] || fail "spike run failed"
[ "$(cat "$SCRATCH/probe.trace")" = $'50 free gate=0\n150 opax gate=1\n150 free gate=0\n150 free gate=0\n60 free gate=0\n60 opax gate=1' ] || fail "spike not handled outside the gate"
[ "$(grep -c gate-enter "$SCRATCH/gate.trace")" = 2 ] && grep -q 'gate-exit .* rc=75 lock=free' "$SCRATCH/gate.trace" || fail "spike did not leave the gate without the lock"
grep -q 'rose to 150 after taking the pasteboard lock; released it to wait' "$SCRATCH/spike.log" || fail "spike not logged"
pass "a load spike releases the lock, leaves the gate and waits outside"

# 4. Stale admission: an archive pause that starts during the lock wait still
#    holds Maestro back, and the gate waits without the lock.
loads 50
mkdir "$LOCK"
run_locked paused -- quick
wait_for "$SCRATCH/paused.log" && sleep 0.5
touch "$SCRATCH/pause"
rmdir "$LOCK"
sleep 1
[ ! -s "$SCRATCH/cmd.trace" ] || fail "command ran during the pause"
grep -q 'gate-wait' "$SCRATCH/gate.trace" || fail "gate did not see the pause"
/bin/rm -f "$SCRATCH/pause"
[ "$(rc_of paused)" = 0 ] || fail "paused run failed"
grep -qx 'run paused lock=opax pause=no gate=1' "$SCRATCH/cmd.trace" || fail "command ran during the pause or unlocked"
! grep 'gate-wait' "$SCRATCH/gate.trace" | grep -vq 'lock=free' || fail "lock held while the gate waited"
pass "an archive pause during the lock wait still holds Maestro; no lock while the gate waits"

# 5. Contention inside the gate: one attempt, no waiting; leave and retry later.
loads 50
touch "$SCRATCH/race"
run_locked race -- quick
deadline=$((SECONDS + 10))
until grep -q 'rc=75' "$SCRATCH/gate.trace" 2>/dev/null; do [ "$SECONDS" -lt "$deadline" ] || fail "no busy exit"; sleep 0.1; done
enter=$(awk '/gate-enter/ {print $2; exit}' "$SCRATCH/gate.trace"); leave=$(awk '/gate-exit/ {print $2; exit}' "$SCRATCH/gate.trace")
[ $((leave - enter)) -le 1 ] || fail "waited for the lock inside the gate"
grep -q 'gate-exit .* rc=75 lock=foreign' "$SCRATCH/gate.trace" || fail "busy exit not recorded"
[ -d "$LOCK" ] && [ -z "$(/bin/ls -A "$LOCK")" ] && no_litter || fail "foreign lock written into or staging left"
sleep 1
[ "$(grep -c gate-enter "$SCRATCH/gate.trace")" = 1 ] || fail "re-entered the gate while the lock was taken"
rmdir "$LOCK"
[ "$(rc_of race)" = 0 ] && [ "$(grep -c '^run race' "$SCRATCH/cmd.trace")" = 1 ] || fail "race run did not complete once"
pass "a busy lock inside the gate exits at once and retries outside it"

# 6. Reviewer case: the wrapper dies but its command tree lives. The lock is
#    not reaped until no process in the group is alive.
loads 50
run_locked holder -- child
wait_for "$SCRATCH/holder.running" || fail "holder never ran"
holder_pgid=$(cat "$SCRATCH/holder.pgid")
kill -KILL "$holder_pgid"
[ "$(rc_of holder)" = 137 ] || fail "holder wrapper not killed"
kill -0 "$(cat "$SCRATCH/holder.child")" || fail "child should outlive the wrapper"
before=$(cat "$LOCK/owner")
run_locked waiter OPAX_PASTE_WAIT_SECONDS=2 -- quick
[ "$(rc_of waiter)" = 1 ] || fail "waiter took a lock whose command tree is alive"
[ "$(cat "$LOCK/owner")" = "$before" ] && ! grep -q '^run waiter' "$SCRATCH/cmd.trace" || fail "live group's lock was changed"
kill -TERM -- "-$holder_pgid"
deadline=$((SECONDS + 5)); while pgrep -g "$holder_pgid" >/dev/null; do [ "$SECONDS" -lt "$deadline" ] || fail "group did not stop"; sleep 0.1; done
run_locked after -- quick
[ "$(rc_of after)" = 0 ] || fail "lock not reaped once the group was gone"
grep -q "Removed stale pasteboard lock .*pid and process group are gone (pid=$holder_pgid pgid=$holder_pgid" "$SCRATCH/after.log" || fail "reap not logged"
pass "a dead wrapper with a live command tree is never reaped; reaped once the group is gone"

# 7. Release stops and waits for leftover processes of the command first.
loads 50
run_locked leaver -- leave
[ "$(rc_of leaver)" = 0 ] || fail "leaver failed"
! kill -0 "$(cat "$SCRATCH/leaver.leftover")" 2>/dev/null || fail "leftover process survived release"
awk '/Stopping leftover/ {s=NR} /Released pasteboard lock/ {r=NR} END {exit !(s && r && s < r)}' "$SCRATCH/leaver.log" || fail "leftovers not stopped before release"
pass "release stops the command's leftover processes first"

# 8. TERM to the wrapper stops its group and releases at once.
loads 50
run_locked termed -- hold
wait_for "$SCRATCH/termed.running" || fail "termed never ran"
kill -TERM "$(cat "$SCRATCH/termed.pgid")"
[ "$(rc_of termed)" = 143 ] || fail "TERM did not stop the wrapper with 143"
! pgrep -g "$(cat "$SCRATCH/termed.pgid")" >/dev/null && [ ! -e "$LOCK" ] || fail "TERM left the group or the lock"
pass "TERM to the holder stops its command tree and releases"

# 9. Exit codes pass through; 75 from a command is not taken as a retry.
loads 50
run_locked seven -- exit 7
[ "$(rc_of seven)" = 7 ] || fail "exit code not passed through"
run_locked retry -- exit 75
[ "$(rc_of retry)" = 1 ] && [ "$(grep -c '^run retry' "$SCRATCH/cmd.trace")" = 1 ] || fail "command exit 75 was retried"
pass "command exit codes pass through; 75 is reserved for retry"

# 10. Crash before publication leaves no lock, only staging that is cleaned.
loads 50
in_leader 'qa_rename_excl() { kill -KILL $$; }; qa_paste_lock_try' || true
[ ! -e "$LOCK" ] && /bin/ls "$STATE" | grep -q '^stage\.' || fail "crash before publication left a lock"
run_locked afterstage -- quick
[ "$(rc_of afterstage)" = 0 ] && no_litter || fail "staging litter not cleaned"
pass "a crash before publication leaves no lock"

# 11. Crash in release before the rename leaves a complete, reapable lock.
in_leader 'qa_paste_lock_try; qa_retire_lock() { kill -KILL $$; }; qa_paste_lock_release' || true
grep -q '^pgid=' "$LOCK/owner" || fail "crash in release left an owner-less lock"
run_locked afterrelease -- quick
[ "$(rc_of afterrelease)" = 0 ] && grep -q 'Removed stale' "$SCRATCH/afterrelease.log" || fail "crashed holder's lock not reaped"
pass "a crash during release leaves a complete lock that is reaped"

# 12. Crash after the rename frees the lock; the retired copy is cleaned.
in_leader 'qa_paste_lock_try; qa_delete_retired() { kill -KILL $$; }; qa_paste_lock_release' || true
[ ! -e "$LOCK" ] && /bin/ls "$STATE" | grep -q '^retired\.' || fail "crash after rename should leave only a retired copy"
run_locked afterretire -- quick
[ "$(rc_of afterretire)" = 0 ] && no_litter || fail "retired litter not cleaned"
pass "a crash after the release rename leaves no lock"

# 13. A crashing reaper retires atomically too.
mkdir "$LOCK"; stale_owner "$(dead_pid)" "$(dead_pid)" > "$LOCK/owner"
in_leader 'qa_delete_retired() { kill -KILL $$; }; qa_reap_stale_lock "$OPAX_PASTE_LOCK"' || true
[ ! -e "$LOCK" ] || fail "reaper crash left the lock"
run_locked afterreap -- quick
[ "$(rc_of afterreap)" = 0 ] && no_litter || fail "reaper litter not cleaned"
pass "a crash in the reaper leaves no owner-less lock"

# 14. Locks the protocol did not make, or whose holder lives, are never removed:
#     no owner file (another project), a live pid, or an owner without pgid.
sleep 30 & live=$!; LIVE+=("$live")
for kind in foreign live nopgid; do
  mkdir "$LOCK"
  case "$kind" in
    live) stale_owner "$live" "$(dead_pid)" > "$LOCK/owner" ;;
    nopgid) printf 'pid=%s\nscript=e2e.sh\n' "$(dead_pid)" > "$LOCK/owner" ;;
  esac
  before=$(/bin/ls -A "$LOCK"; cat "$LOCK/owner" 2>/dev/null || true)
  run_locked "keep-$kind" OPAX_PASTE_WAIT_SECONDS=1 -- quick
  [ "$(rc_of "keep-$kind")" = 1 ] || fail "$kind lock was taken"
  [ "$(/bin/ls -A "$LOCK"; cat "$LOCK/owner" 2>/dev/null || true)" = "$before" ] || fail "$kind lock was changed"
  /bin/rm -f "$LOCK/owner"; rmdir "$LOCK" || fail "$kind lock could not be removed by its holder"
done
grep -q "holder: unknown (no owner file; not an OPAX lock" "$SCRATCH/keep-foreign.log" || fail "foreign holder not described"
grep -q "Waiting for pasteboard lock $LOCK; elapsed 0m0[0-9]s of 0m01s; holder: pid=$live" "$SCRATCH/keep-live.log" || fail "wait line lacks lock, time or holder"
pass "never removes a foreign lock, a live holder's lock or one without a group"

# 14b. Publication never replaces another project's empty lock directory.
mkdir "$LOCK" "$SCRATCH/stage-x"; : > "$SCRATCH/stage-x/owner"
rc=0; bash -c 'source "$0"; qa_rename_excl "$1" "$2"' "$SCRIPTS/qa-lock.sh" "$SCRATCH/stage-x" "$LOCK" || rc=$?
[ "$rc" = 1 ] && [ -z "$(/bin/ls -A "$LOCK")" ] && [ -f "$SCRATCH/stage-x/owner" ] || fail "publication replaced or wrote into a foreign lock"
rmdir "$LOCK" || fail "foreign holder could not rmdir its lock"
/bin/rm -rf "$SCRATCH/stage-x"
pass "atomic publication refuses an existing empty lock directory"

# 15. Two waiters on one stale lock: one reap, one holder at a time.
loads 50
mkdir "$LOCK"; stale_owner "$(dead_pid)" "$(dead_pid)" > "$LOCK/owner"
run_locked one -- hold; run_locked two -- hold
deadline=$((SECONDS + 15))
until [ -e "$SCRATCH/one.running" ] || [ -e "$SCRATCH/two.running" ]; do [ "$SECONDS" -lt "$deadline" ] || fail "neither waiter ran"; sleep 0.1; done
sleep 1
if [ -e "$SCRATCH/one.running" ]; then winner=one loser=two; else winner=two loser=one; fi
[ ! -e "$SCRATCH/$loser.running" ] || fail "both waiters held one lock"
touch "$SCRATCH/$winner.release"
wait_for "$SCRATCH/$loser.running" || fail "second waiter never ran"
touch "$SCRATCH/$loser.release"
[ "$(rc_of one)" = 0 ] && [ "$(rc_of two)" = 0 ] || fail "waiters failed"
[ "$(cat "$SCRATCH/one.log" "$SCRATCH/two.log" | grep -c 'Removed stale')" = 1 ] || fail "stale lock removed more than once"
pass "one stale lock is removed once and held by one waiter at a time"

# 16. Racing holders never overlap, and the lock is never visible without its owner.
loads 50
: > "$SCRATCH/violations"
( while [ ! -e "$SCRATCH/stop-watch" ]; do
    i1=$(stat -f %i "$LOCK" 2>/dev/null) && [ ! -f "$LOCK/owner" ] && i2=$(stat -f %i "$LOCK" 2>/dev/null) && [ "$i1" = "$i2" ] && echo ownerless >> "$SCRATCH/violations"
  done ) &
watcher=$!; LIVE+=("$watcher")
for r in a b c; do
  ( for i in 1 2 3; do bash "$SCRATCH/runner.sh" "$SCRIPTS/qa-lock.sh" "race-$r-$i" bash "$SCRATCH/cmd.sh" "race-$r-$i" critical 2>> "$SCRATCH/racers.log"; done ) &
  LIVE+=("$!")
done
for r in a b c; do for i in 1 2 3; do [ "$(rc_of "race-$r-$i" 60)" = 0 ] || fail "racer $r-$i failed"; done; done
touch "$SCRATCH/stop-watch"; wait "$watcher" 2>/dev/null || true
[ ! -s "$SCRATCH/violations" ] || fail "overlap or owner-less lock seen: $(sort "$SCRATCH/violations" | uniq -c)"
[ ! -e "$LOCK" ] && no_litter || fail "racers left a lock or litter"
pass "nine racing locked runs never overlap or expose an owner-less lock"

# 17. Release leaves a lock that carries another owner's token.
in_leader 'qa_paste_lock_try; sed -i "" "s/^token=.*/token=0000000000000000/" "$OPAX_PASTE_LOCK/owner"; qa_paste_lock_release' || true
[ -f "$LOCK/owner" ] && grep -q 'no longer ours' "$SCRATCH/leader.log" || fail "released a lock with another token"
/bin/rm -f "$LOCK/owner"; rmdir "$LOCK"
pass "release leaves a lock carrying another owner's token"

# 18. The lock is taken only by a process-group leader.
rc=0; bash -c 'source "$0"; qa_paste_lock_try' "$SCRIPTS/qa-lock.sh" 2>/dev/null || rc=$?
[ "$rc" = 3 ] && [ ! -e "$LOCK" ] || fail "a non-leader took the lock"
pass "refuses to lock outside a process-group leader"

# 19. With no capacity source configured, capacity waits are skipped.
run_locked nocap OPAX_LOAD_PROBE= -- quick
[ "$(rc_of nocap)" = 0 ] && [ ! -e "$LOCK" ] || fail "run without a capacity source failed"
pass "skips capacity checks when none is configured"

echo "qa-lock: $PASSED passed"
