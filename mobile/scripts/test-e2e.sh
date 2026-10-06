#!/usr/bin/env bash
# Exercise the real harness/lock in an isolated mobile tree with mock tools.
# Never source developer config, contact a device or use a shared gate/lock.
set -euo pipefail
if [ "${OPAX_E2E_TEST_SUPERVISED:-0}" != 1 ]; then
  # A stuck/stopped child must fail QA, not hold the suite forever. The parent
  # supervises only process groups whose command names this unique scratch tree.
  exec python3 - "$0" "${OPAX_E2E_TEST_TIMEOUT_SECONDS:-300}" <<'PY'
import os, shutil, signal, subprocess, sys, tempfile
limit = int(sys.argv[2])
if limit <= 0:
    raise SystemExit('Test timeout must be positive')
scratch = tempfile.mkdtemp(prefix='opax-e2e-test.')
env = dict(os.environ, OPAX_E2E_TEST_SUPERVISED='1', OPAX_E2E_TEST_SCRATCH=scratch)
child = subprocess.Popen(['bash', sys.argv[1]], env=env, start_new_session=True)
def stop():
    try:
        os.killpg(child.pid, signal.SIGCONT)
        child.terminate()
        child.wait(timeout=8)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=2)
    except ProcessLookupError:
        pass
def interrupted(signum, frame):
    stop()
    raise SystemExit(128 + signum)
signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGINT, interrupted)
try:
    try:
        rc = child.wait(timeout=limit)
    except subprocess.TimeoutExpired:
        print(f'e2e harness: overall timeout after {limit}s', file=sys.stderr)
        stop()
        rc = 124
finally:
    # qa-locked and the gate waiter lead separate groups; remove any leftovers
    # even if the supervised shell was killed before its EXIT trap ran.
    rows = subprocess.check_output(['/bin/ps', '-axo', 'pid=,pgid=,command='], text=True)
    groups = {int(r[1]) for line in rows.splitlines() if len(r := line.split(None, 2)) == 3 and scratch in r[2]}
    for group in groups:
        if group != os.getpgrp():
            try:
                os.killpg(group, signal.SIGKILL)
            except ProcessLookupError:
                pass
    shutil.rmtree(scratch, ignore_errors=True)
raise SystemExit(rc)
PY
fi
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
SCRATCH=$OPAX_E2E_TEST_SCRATCH
MOBILE="$SCRATCH/mobile"; LOCK="$SCRATCH/paste.lock"; LIVE=(); PASSED=0
cleanup() {
  trap - EXIT
  trap '' INT TERM
  if [ -f "$LOCK/owner" ]; then kill -TERM "$(sed -n 's/^pid=//p' "$LOCK/owner")" 2>/dev/null || true; fi
  for pid in "${LIVE[@]:-}"; do
    [ -n "$pid" ] && [ "$(/bin/ps -o ppid= -p "$pid" | tr -d ' ')" = "$$" ] && kill -TERM "$pid" 2>/dev/null || true
  done
  local deadline=$((SECONDS + 5))
  while [ -n "$(jobs -pr)" ] && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.1; done
  # The supervisor kills any remaining scratch groups after this shell exits.
  /bin/rm -rf "$SCRATCH"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
mkdir -p "$MOBILE/scripts" "$MOBILE/node_modules/.bin" "$MOBILE/.maestro" "$SCRATCH/bin" "$SCRATCH/jdk/bin" "$SCRATCH/app"
/bin/cp "$SCRIPTS"/{e2e.sh,e2e-device.sh,qa-env.sh,qa-lock.sh,qa-locked.sh,qa-java.sh,capacity.sh} "$MOBILE/scripts/"
# polish-b3 adds this source; keep its merge tests isolated too.
if [ -f "$SCRIPTS/qa-flows.sh" ]; then /bin/cp "$SCRIPTS/qa-flows.sh" "$MOBILE/scripts/"; fi
touch "$SCRATCH/app/main.jsbundle" "$MOBILE/.maestro/01-start.yaml" "$MOBILE/.maestro/04-offline.yaml"
export SCRATCH MOBILE OPAX_PASTE_LOCK="$LOCK" OPAX_BUILD_GATE="$SCRATCH/gate.sh" OPAX_SIM_GATE="$SCRATCH/sim-gate.sh"
export OPAX_ALLOWED_UDIDS='lane-a lane-b' OPAX_QA_APP="$SCRATCH/app" OPAX_CONTENT_SIZE=large
export OPAX_CAPACITY_CMD= OPAX_LOAD_PROBE='echo 0' OPAX_PASTE_WAIT_SECONDS=10 OPAX_LOAD_LIMIT=140
export OPAX_PASTE_POLL_SECONDS=0.1 OPAX_STOP_GRACE_SECONDS=4 JAVA_HOME="$SCRATCH/jdk"
export OPAX_E2E_STOP_GRACE_SECONDS=4
export PATH="$SCRATCH/bin:$PATH"
unset QA_LOCK_LOG QA_LOCK_SCRIPT OPAX_VERIFY_OFFLINE
# e2e.sh prepends the developer's Maestro directory; a shell function keeps
# this test on its mock regardless of the host installation or HOME.
maestro() { "$SCRATCH/bin/maestro" "$@"; }
export -f maestro
cat > "$SCRATCH/gate.sh" <<'EOF'
#!/usr/bin/env bash
shift
if [ -e "$SCRATCH/gate-hold" ]; then
  touch "$SCRATCH/$MOCK_LANE.gate-queued"
  echo "$$" > "$SCRATCH/$MOCK_LANE.gate-pid"
  while [ -e "$SCRATCH/gate-hold" ]; do sleep 0.1; done
fi
export MOCK_IN_GATE=1
touch "$SCRATCH/$MOCK_LANE.gate-active"
trap '/bin/rm -f "$SCRATCH/$MOCK_LANE.gate-active"' EXIT
trap 'exit 143' TERM
"$@" &
wait $!
EOF
cat > "$SCRATCH/sim-gate.sh" <<'EOF'
#!/usr/bin/env bash
set -e
if [ "${MOCK_SIM_GATE_STALL:-0}" = 1 ]; then touch "$SCRATCH/$MOCK_LANE.sim-queued"; sleep 60; fi
xcrun simctl boot "$2"
xcrun simctl bootstatus "$2" -b
EOF
cat > "$SCRATCH/jdk/bin/java" <<'EOF'
#!/usr/bin/env bash
echo 'openjdk version "21.0.1"' >&2
EOF
cat > "$SCRATCH/bin/lsof" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
cat > "$SCRATCH/bin/tee" <<'EOF'
#!/usr/bin/env bash
[ "${MOCK_TEE_FAIL:-0}" != 1 ] || exit 29
exec /usr/bin/tee "$@"
EOF
cat > "$SCRATCH/bin/xcrun" <<'EOF'
#!/usr/bin/env bash
set -eu
shift # simctl
action=$1; udid=$2; shift 2
lock=free; [ ! -f "$OPAX_PASTE_LOCK/owner" ] || lock=held
echo "$MOCK_LANE $action $* lock=$lock gate=${MOCK_IN_GATE:-0}" >> "$SCRATCH/trace"
if [ "$lock" != held ] || [ "${MOCK_IN_GATE:-0}" != 1 ] || [ ! -e "$SCRATCH/$MOCK_LANE.gate-active" ]; then
  { [ "${MOCK_NO_LOCK:-0}" = 1 ] && [ "${MOCK_IN_GATE:-0}" = 1 ] && [ -e "$SCRATCH/$MOCK_LANE.gate-active" ]; } || { [ "$action" = shutdown ] && [ "${MOCK_ALLOW_FALLBACK:-0}" = 1 ] && [ -e "$MOBILE/private/qa/$MOCK_LANE/device-started" ]; } || { echo unlocked >> "$SCRATCH/violations"; exit 90; }
fi
case "$action" in
  boot)
    mkdir "$SCRATCH/booted" || { echo overlap >> "$SCRATCH/violations"; exit 91; }
    echo "$udid" > "$SCRATCH/booted/device"
    touch "$SCRATCH/$MOCK_LANE.boot"
    [ "${MOCK_PAUSE:-}" != boot ] || sleep 60
    [ "${MOCK_FAIL:-}" != boot ] || exit 23 ;;
  install)
    touch "$SCRATCH/$MOCK_LANE.install"
    [ "${MOCK_PAUSE:-}" != install ] || sleep 60
    [ "${MOCK_FAIL:-}" != install ] || exit 24 ;;
  ui)
    if [ -e "$SCRATCH/$MOCK_LANE.maestro" ]; then sleep "${MOCK_CLEANUP_SLEEP:-0}"; fi
    if [ "$#" = 1 ]; then
      case "$1" in content_size) echo extra-large ;; appearance) echo dark ;; esac
    fi
    [ "${MOCK_FAIL:-}" != restore ] || [ "$*" != 'appearance dark' ] || exit 25 ;;
  shutdown)
    [ "${MOCK_FAIL:-}" != shutdown ] || exit 27
    if [ "$lock" = held ]; then sleep "${MOCK_SHUTDOWN_SLEEP:-0}"; fi
    /bin/rm -f "$SCRATCH/booted/device"
    [ ! -d "$SCRATCH/booted" ] || rmdir "$SCRATCH/booted"
    touch "$SCRATCH/$MOCK_LANE.shutdown" ;;
esac
EOF
cat > "$SCRATCH/bin/maestro" <<'EOF'
#!/usr/bin/env bash
set -eu
phase=online; [[ "$*" != *04-offline.yaml* ]] || phase=offline
{ [ -f "$OPAX_PASTE_LOCK/owner" ] || [ "${MOCK_NO_LOCK:-0}" = 1 ]; } && [ -d "$SCRATCH/booted" ] && [ "${MOCK_IN_GATE:-0}" = 1 ] && [ -e "$SCRATCH/$MOCK_LANE.gate-active" ] || { echo maestro-unlocked >> "$SCRATCH/violations"; exit 92; }
if [ "${MOCK_NO_LOCK:-0}" = 1 ]; then echo none; else sed -n 's/^token=//p' "$OPAX_PASTE_LOCK/owner"; fi > "$SCRATCH/$MOCK_LANE.$phase.token"
lock=held; [ "${MOCK_NO_LOCK:-0}" != 1 ] || lock=unconfigured
echo "$MOCK_LANE maestro $phase lock=$lock gate=1" >> "$SCRATCH/trace"
touch "$SCRATCH/$MOCK_LANE.maestro"
if [ "${MOCK_PAUSE:-}" = maestro ]; then
  until [ -e "$SCRATCH/$MOCK_LANE.release" ]; do sleep 0.1; done
fi
[ "${MOCK_FAIL:-}" != "$phase" ] || exit 26
EOF
cat > "$MOBILE/node_modules/.bin/tsx" <<'EOF'
#!/usr/bin/env bash
set -eu
case "$1" in
  scripts/fixture-server.ts)
    trap 'echo "$MOCK_LANE fixture-stop lock=$([ -f "$OPAX_PASTE_LOCK/owner" ] && echo held || echo free)" >> "$SCRATCH/trace"; exit 0' TERM
    echo OPAX_FIXTURE_READY
    touch "$SCRATCH/$MOCK_LANE.fixture"
    while :; do sleep 0.1 & wait $! || true; done ;;
  scripts/connection-audit.ts)
    if [ "${MOCK_AUDIT_STUCK:-0}" = 1 ]; then trap '' TERM; else trap 'exit 0' TERM; fi
    while :; do sleep 0.1 & wait $! || true; done ;;
  scripts/collect-screenshots.ts)
    # Another lane may already hold the next lock while we collect files.
    token=$(sed -n 's/^token=//p' "$OPAX_PASTE_LOCK/owner" 2>/dev/null || true)
    for phase in online offline; do
      file="$SCRATCH/$MOCK_LANE.$phase.token"
      if [ -n "$token" ] && [ -f "$file" ] && [ "$token" = "$(cat "$file")" ]; then
        echo collect-locked >> "$SCRATCH/violations"; exit 93
      fi
    done ;;
esac
EOF
chmod +x "$SCRATCH/bin/"* "$SCRATCH/jdk/bin/java" "$MOBILE/node_modules/.bin/tsx"
pass() { PASSED=$((PASSED + 1)); echo "ok $PASSED - $1"; }
fail() { echo "not ok - $1" >&2; cat "$SCRATCH/trace" >&2; cat "$MOBILE"/private/qa/*/*.log >&2; exit 1; }
wait_for() {
  local deadline=$((SECONDS + 15))
  until [ -e "$1" ]; do [ "$SECONDS" -lt "$deadline" ] || fail "timeout: $1"; sleep 0.1; done
}
run_lane() {
  local name=$1; shift
  MOCK_LANE="$name" OPAX_QA_RUN="$name" bash "$MOBILE/scripts/e2e.sh" "${MOCK_UDID:-lane-a}" "$@" > "$SCRATCH/$name.log" 2>&1 &
  LANE_PID=$!; LIVE+=("$LANE_PID")
}
check_rc() {
  local name=$1 expected=$2
  wait_for "$MOBILE/private/qa/$name/exit-status"
  [ "$(cat "$MOBILE/private/qa/$name/exit-status")" = "$expected" ] || fail "$name exit status"
  [ -f "$SCRATCH/$name.shutdown" ] && [ ! -d "$SCRATCH/booted" ] && [ ! -e "$LOCK" ] || fail "$name shutdown/release"
  [ ! -s "$SCRATCH/violations" ] || fail "$name protocol violation"
}
run_lane success 01
check_rc success 0
grep -q 'success ui content_size extra-large lock=held' "$SCRATCH/trace" && grep -q 'success ui appearance dark lock=held' "$SCRATCH/trace" || fail 'restore original settings'
grep -q 'success fixture-stop lock=free' "$SCRATCH/trace" || fail 'fixture teardown before release'
[ -f "$MOBILE/private/qa/success/device-timing.txt" ] || fail 'no boot/install timing'
pass 'boot/install/Maestro/restore/shutdown inside lock and gate; teardown after release; timings saved'
for phase in online offline install boot restore; do
  export MOCK_FAIL=$phase
  flows=(01); [ "$phase" != offline ] || flows+=(04)
  run_lane "fail-$phase" "${flows[@]}"
  expected=26
  case "$phase" in install) expected=24 ;; boot) expected=23 ;; restore) expected=0 ;; esac
  check_rc "fail-$phase" "$expected"
  pass "shutdown after $phase failure; preserves run status"
done
unset MOCK_FAIL
run_lane offline 01 04
check_rc offline 0
cmp "$SCRATCH/offline.online.token" "$SCRATCH/offline.offline.token" || fail 'second phase changed lock'
grep -q 'offline fixture-stop lock=held' "$SCRATCH/trace" || fail 'offline fixture not stopped under lock'
pass 'offline second phase retains the same lock until shutdown'
run_lane offline-only 04
check_rc offline-only 0
[ ! -e "$SCRATCH/offline-only.online.token" ] && [ -e "$SCRATCH/offline-only.offline.token" ] || fail 'offline-only phase selection'
pass 'offline-only journey boots and shuts down under the lock'
for phase in boot install maestro; do
  export MOCK_PAUSE=$phase
  run_lane "term-$phase" 01
  wait_for "$SCRATCH/term-$phase.$phase"
  owner=$(sed -n 's/^pid=//p' "$LOCK/owner")
  kill -TERM "$owner"
  check_rc "term-$phase" 143
  pass "TERM during $phase shuts down before release and preserves 143"
done
export MOCK_PAUSE=maestro MOCK_AUDIT_STUCK=1
run_lane term-stuck-audit 01
wait_for "$SCRATCH/term-stuck-audit.maestro"
kill -TERM "$(sed -n 's/^pid=//p' "$LOCK/owner")"
check_rc term-stuck-audit 143
pass 'TERM shuts down before waiting for a stuck auditor or forced group cleanup'
unset MOCK_AUDIT_STUCK
export MOCK_PAUSE=maestro
run_lane first 01
wait_for "$SCRATCH/first.maestro"
unset MOCK_PAUSE
export MOCK_UDID=lane-b
run_lane second 01
wait_for "$SCRATCH/second.fixture"
deadline=$((SECONDS + 15))
until grep -q 'Waiting for pasteboard lock' "$MOBILE/private/qa/second/lock.log" 2>/dev/null; do
  [ "$SECONDS" -lt "$deadline" ] || fail 'second lane never waited'; sleep 0.1
done
[ ! -e "$SCRATCH/second.boot" ] && [ "$(cat "$SCRATCH/booted/device")" = lane-a ] || fail 'waiting lane booted'
touch "$SCRATCH/first.release"
check_rc second 0
[ "$(cat "$MOBILE/private/qa/first/exit-status")" = 0 ] || fail 'first lane failed'
first_shutdown=$(awk '/^first shutdown / {print NR}' "$SCRATCH/trace")
second_boot=$(awk '/^second boot / {print NR}' "$SCRATCH/trace")
[ "$first_shutdown" -lt "$second_boot" ] || fail 'concurrent boot lifetimes'
pass 'two concurrent lanes: waiter stays shut down until holder shuts down and releases'
unset MOCK_UDID
export OPAX_BOOT_TIMEOUT_SECONDS=1 MOCK_SIM_GATE_STALL=1
run_lane stalled-gate 01
wait_for "$SCRATCH/stalled-gate.sim-queued"
check_rc stalled-gate 142
[ ! -e "$SCRATCH/stalled-gate.boot" ] || fail 'timed-out sim gate booted later'
pass 'sim gate capacity stall times out, shuts down and releases without booting'
unset MOCK_SIM_GATE_STALL
for phase in boot install; do
  export MOCK_PAUSE=$phase OPAX_INSTALL_TIMEOUT_SECONDS=1
  run_lane "stalled-$phase" 01
  check_rc "stalled-$phase" 142
  [ ! -e "$SCRATCH/stalled-$phase.maestro" ] || fail 'setup timeout ran Maestro'
  pass "stalled $phase times out non-zero, shuts down and releases"
done
unset MOCK_PAUSE OPAX_BOOT_TIMEOUT_SECONDS OPAX_INSTALL_TIMEOUT_SECONDS

touch "$SCRATCH/gate-hold"
run_lane term-gate 01
wait_for "$SCRATCH/term-gate.gate-queued"
start=$SECONDS
kill -TERM "$LANE_PID"
wait_for "$MOBILE/private/qa/term-gate/exit-status"
[ $((SECONDS - start)) -lt 5 ] && [ "$(cat "$MOBILE/private/qa/term-gate/exit-status")" = 143 ] || fail 'queued gate TERM was deferred'
[ ! -e "$SCRATCH/term-gate.boot" ] && [ ! -e "$LOCK" ] || fail 'queued gate TERM booted'
gate_pid=$(cat "$SCRATCH/term-gate.gate-pid")
! kill -0 "$gate_pid" 2>/dev/null || fail 'queued gate child orphaned'
/bin/rm -f "$SCRATCH/gate-hold"
pass 'TERM while queued in build gate exits promptly with no boot or orphan'

touch "$SCRATCH/capacity-full"
export OPAX_LOAD_PROBE='if [ -e "$SCRATCH/capacity-full" ]; then echo 141; else echo 0; fi'
export OPAX_CAPACITY_POLL_SECONDS=0.1
run_lane term-capacity 01
deadline=$((SECONDS + 15))
until grep -q 'Shared load' "$MOBILE/private/qa/term-capacity/lock.log" 2>/dev/null; do
  [ "$SECONDS" -lt "$deadline" ] || fail 'capacity waiter never waited'; sleep 0.1
done
kill -TERM "$LANE_PID"
wait_for "$MOBILE/private/qa/term-capacity/exit-status"
[ "$(cat "$MOBILE/private/qa/term-capacity/exit-status")" = 143 ] && [ ! -e "$SCRATCH/term-capacity.boot" ] && [ ! -e "$LOCK" ] || fail 'capacity TERM booted or lost status'
/bin/rm -f "$SCRATCH/capacity-full"
export OPAX_LOAD_PROBE='echo 0'
pass 'TERM during capacity wait exits promptly without taking the lock or booting'
export MOCK_TEE_FAIL=1
run_lane failed-capacity-log 01
wait_for "$MOBILE/private/qa/failed-capacity-log/exit-status"
[ "$(cat "$MOBILE/private/qa/failed-capacity-log/exit-status")" = 29 ] && [ ! -e "$SCRATCH/failed-capacity-log.boot" ] && [ ! -e "$LOCK" ] || fail 'capacity pipeline lost its failure status'
unset MOCK_TEE_FAIL
pass 'capacity log failure preserves pipeline status and never boots'

export MOCK_PAUSE=maestro MOCK_CLEANUP_SLEEP=60 OPAX_SIMCTL_TIMEOUT_SECONDS=1 OPAX_E2E_STOP_GRACE_SECONDS=8
run_lane bounded-restore 01
wait_for "$SCRATCH/bounded-restore.maestro"
kill -TERM "$(sed -n 's/^pid=//p' "$LOCK/owner")"
check_rc bounded-restore 143
[ ! -e "$MOBILE/private/qa/bounded-restore/fallback-shutdown.log" ] || fail 'bounded restore missed shutdown within grace'
pass 'stalled restore calls time out and shutdown completes before the stop grace'

export MOCK_CLEANUP_SLEEP=1 MOCK_SHUTDOWN_SLEEP=1 OPAX_SIMCTL_TIMEOUT_SECONDS=3
echo OPAX_STOP_GRACE_SECONDS=1 > "$MOBILE/.qa.local.env"
run_lane slow-cleanup 01
wait_for "$SCRATCH/slow-cleanup.maestro"
kill -TERM "$(sed -n 's/^pid=//p' "$LOCK/owner")"
check_rc slow-cleanup 143
seconds=$(sed -n 's/^device_cleanup_seconds=//p' "$MOBILE/private/qa/slow-cleanup/device-timing.txt")
[ "$seconds" -ge 5 ] && [ ! -e "$MOBILE/private/qa/slow-cleanup/fallback-shutdown.log" ] || fail 'longer grace did not permit slow cleanup'
/bin/rm -f "$MOBILE/.qa.local.env"
pass 'longer device stop grace permits slow cleanup despite a local lock-grace override'

export MOCK_CLEANUP_SLEEP=60 MOCK_SHUTDOWN_SLEEP=0 OPAX_E2E_STOP_GRACE_SECONDS=1 MOCK_ALLOW_FALLBACK=1
run_lane killed-cleanup 01
wait_for "$SCRATCH/killed-cleanup.maestro"
kill -TERM "$(sed -n 's/^pid=//p' "$LOCK/owner")"
check_rc killed-cleanup 143
grep -q '^killed-cleanup shutdown .*lock=free gate=0' "$SCRATCH/trace" || fail 'missing post-release fallback'
pass 'parent fallback shuts down after inner cleanup is killed and lock released'
unset MOCK_CLEANUP_SLEEP MOCK_SHUTDOWN_SLEEP MOCK_ALLOW_FALLBACK OPAX_SIMCTL_TIMEOUT_SECONDS
export OPAX_E2E_STOP_GRACE_SECONDS=4
run_lane term-parent 01
wait_for "$SCRATCH/term-parent.maestro"
kill -TERM "$LANE_PID"
check_rc term-parent 143
[ ! -e "$MOBILE/private/qa/term-parent/fallback-shutdown.log" ] || fail 'parent TERM skipped locked cleanup'
pass 'TERM to the active runner retains the build gate through locked shutdown'
export OPAX_PASTE_LOCK= MOCK_NO_LOCK=1
run_lane term-unconfigured 01
wait_for "$SCRATCH/term-unconfigured.maestro"
wrapper=$(sed -n '1p' "$MOBILE/private/qa/term-unconfigured/device-wrapper")
kill -TERM "$LANE_PID"
check_rc term-unconfigured 143
! kill -0 "$wrapper" 2>/dev/null || fail 'unconfigured lock left its device wrapper orphaned'
export OPAX_PASTE_LOCK="$LOCK"
unset MOCK_NO_LOCK
pass 'active TERM drains the device wrapper even without a configured pasteboard lock'
unset MOCK_PAUSE

export MOCK_FAIL=shutdown MOCK_ALLOW_FALLBACK=1
run_lane failed-shutdown 01
wait_for "$MOBILE/private/qa/failed-shutdown/exit-status"
[ "$(cat "$MOBILE/private/qa/failed-shutdown/exit-status")" = 1 ] && [ ! -e "$LOCK" ] || fail 'failed fallback reported success or retained lock'
[ ! -e "$MOBILE/private/qa/failed-shutdown/device-shutdown" ] && [ -d "$SCRATCH/booted" ] || fail 'failed shutdown claimed completion'
[ "$(grep -c '^failed-shutdown shutdown ' "$SCRATCH/trace")" = 2 ] || fail 'fallback repeated or skipped'
/bin/rm -rf "$SCRATCH/booted"
unset MOCK_FAIL MOCK_ALLOW_FALLBACK
pass 'failed inner and fallback shutdown makes a successful Maestro run fail'

# The nested suite cannot reach this point before its one-second outer limit.
rc=0
OPAX_E2E_TEST_SUPERVISED=0 OPAX_E2E_TEST_TIMEOUT_SECONDS=1 bash "$SCRIPTS/test-e2e.sh" > "$SCRATCH/overall-timeout.log" 2>&1 || rc=$?
[ "$rc" = 124 ] && grep -q 'overall timeout' "$SCRATCH/overall-timeout.log" || fail 'test supervisor did not bound the suite'
pass 'overall test timeout fails with 124 instead of hanging QA'

# A foreign lock is never removed, including on timeout or TERM while waiting.
mkdir "$LOCK"
export OPAX_PASTE_WAIT_SECONDS=0
run_lane timeout 01
wait_for "$MOBILE/private/qa/timeout/exit-status"
[ "$(cat "$MOBILE/private/qa/timeout/exit-status")" = 1 ] && [ ! -e "$SCRATCH/timeout.boot" ] && [ -d "$LOCK" ] || fail 'timeout booted or removed foreign lock'
pass 'lock wait timeout never boots a simulator or removes a foreign lock'
export OPAX_PASTE_WAIT_SECONDS=10
run_lane term-wait 01
deadline=$((SECONDS + 15))
until grep -q 'Waiting for pasteboard lock' "$MOBILE/private/qa/term-wait/lock.log" 2>/dev/null; do
  [ "$SECONDS" -lt "$deadline" ] || fail 'TERM waiter never waited'; sleep 0.1
done
kill -TERM "$LANE_PID"
wait_for "$MOBILE/private/qa/term-wait/exit-status"
[ "$(cat "$MOBILE/private/qa/term-wait/exit-status")" = 143 ] && [ ! -e "$SCRATCH/term-wait.boot" ] && [ -d "$LOCK" ] || fail 'TERM waiter booted or removed foreign lock'
pass 'TERM to waiting harness preserves 143 without booting or removing the lock'
rmdir "$LOCK"
echo "e2e harness: $PASSED passed"
