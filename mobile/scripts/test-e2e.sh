#!/usr/bin/env bash
# Exercise the real harness/lock in an isolated mobile tree with mock tools.
# Never source developer config, contact a device or use a shared gate/lock.
set -euo pipefail
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/opax-e2e-test.XXXXXX")
MOBILE="$SCRATCH/mobile"; LOCK="$SCRATCH/paste.lock"; LIVE=(); PASSED=0
cleanup() {
  if [ -f "$LOCK/owner" ]; then kill -TERM "$(sed -n 's/^pid=//p' "$LOCK/owner")" 2>/dev/null || true; fi
  for pid in "${LIVE[@]:-}"; do [ -n "$pid" ] && { kill "$pid"; wait "$pid"; } 2>/dev/null || true; done
  /bin/rm -rf "$SCRATCH"
}
trap cleanup EXIT
mkdir -p "$MOBILE/scripts" "$MOBILE/node_modules/.bin" "$MOBILE/.maestro" "$SCRATCH/bin" "$SCRATCH/jdk/bin" "$SCRATCH/app"
/bin/cp "$SCRIPTS"/{e2e.sh,e2e-device.sh,qa-env.sh,qa-lock.sh,qa-locked.sh,qa-java.sh,capacity.sh} "$MOBILE/scripts/"
touch "$SCRATCH/app/main.jsbundle" "$MOBILE/.maestro/01-start.yaml" "$MOBILE/.maestro/04-offline.yaml"
export SCRATCH MOBILE OPAX_PASTE_LOCK="$LOCK" OPAX_BUILD_GATE="$SCRATCH/gate.sh" OPAX_SIM_GATE="$SCRATCH/sim-gate.sh"
export OPAX_ALLOWED_UDIDS='lane-a lane-b' OPAX_QA_APP="$SCRATCH/app" OPAX_CONTENT_SIZE=large
export OPAX_CAPACITY_CMD= OPAX_LOAD_PROBE='echo 0' OPAX_PASTE_WAIT_SECONDS=10
export OPAX_PASTE_POLL_SECONDS=0.1 OPAX_STOP_GRACE_SECONDS=4 JAVA_HOME="$SCRATCH/jdk"
export PATH="$SCRATCH/bin:$PATH"
unset QA_LOCK_LOG QA_LOCK_SCRIPT OPAX_VERIFY_OFFLINE
# e2e.sh prepends the developer's Maestro directory; a shell function keeps
# this test on its mock regardless of the host installation or HOME.
maestro() { "$SCRATCH/bin/maestro" "$@"; }
export -f maestro
cat > "$SCRATCH/gate.sh" <<'EOF'
#!/usr/bin/env bash
shift
export MOCK_IN_GATE=1
"$@"
EOF
cat > "$SCRATCH/sim-gate.sh" <<'EOF'
#!/usr/bin/env bash
set -e
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
cat > "$SCRATCH/bin/xcrun" <<'EOF'
#!/usr/bin/env bash
set -eu
shift # simctl
action=$1; udid=$2; shift 2
lock=free; [ ! -f "$OPAX_PASTE_LOCK/owner" ] || lock=held
echo "$MOCK_LANE $action $* lock=$lock gate=${MOCK_IN_GATE:-0}" >> "$SCRATCH/trace"
[ "$lock" = held ] && [ "${MOCK_IN_GATE:-0}" = 1 ] || { echo unlocked >> "$SCRATCH/violations"; exit 90; }
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
    if [ "$#" = 1 ]; then
      case "$1" in content_size) echo extra-large ;; appearance) echo dark ;; esac
    fi
    [ "${MOCK_FAIL:-}" != restore ] || [ "$*" != 'appearance dark' ] || exit 25 ;;
  shutdown)
    /bin/rm -f "$SCRATCH/booted/device"
    rmdir "$SCRATCH/booted"
    touch "$SCRATCH/$MOCK_LANE.shutdown" ;;
esac
EOF
cat > "$SCRATCH/bin/maestro" <<'EOF'
#!/usr/bin/env bash
set -eu
phase=online; [[ "$*" != *04-offline.yaml* ]] || phase=offline
[ -f "$OPAX_PASTE_LOCK/owner" ] && [ -d "$SCRATCH/booted" ] && [ "${MOCK_IN_GATE:-0}" = 1 ] || { echo maestro-unlocked >> "$SCRATCH/violations"; exit 92; }
sed -n 's/^token=//p' "$OPAX_PASTE_LOCK/owner" > "$SCRATCH/$MOCK_LANE.$phase.token"
echo "$MOCK_LANE maestro $phase lock=held gate=1" >> "$SCRATCH/trace"
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
