#!/usr/bin/env bash
# Exercise retry decisions using an offline mocked Jest executable.
set -euo pipefail
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/opax-jest-retry-test.XXXXXX")
trap '/bin/rm -rf "$SCRATCH"' EXIT
mkdir -p "$SCRATCH/scripts" "$SCRATCH/node_modules/.bin"
/bin/cp -f "$SCRIPTS/jest-retry.sh" "$SCRATCH/scripts/"
cat > "$SCRATCH/node_modules/.bin/jest" <<'EOF'
#!/usr/bin/env bash
count=$(cat "$MOCK_ROOT/count")
count=$((count + 1))
printf '%s\n' "$count" > "$MOCK_ROOT/count"
printf '%s\n' "$*" >> "$MOCK_ROOT/args"
printf '%s\n' "$$" > "$MOCK_ROOT/pid"
case "$MOCK_MODE" in
  pass) exit 0 ;;
  fail) echo 'FAIL assertion failed'; exit 3 ;;
  crash-then-pass) [ "$count" -gt 1 ] && exit 0 ;;
  crash-twice) ;;
esac
echo 'A jest worker process (pid=123) was terminated: signal=SIGSEGV, exitCode=null.'
exit 1
EOF
chmod +x "$SCRATCH/node_modules/.bin/jest"
PASSED=0
check() {
  local mode=$1 expected_rc=$2 expected_count=$3 rc=0
  printf '0\n' > "$SCRATCH/count"
  : > "$SCRATCH/args"
  MOCK_ROOT="$SCRATCH" MOCK_MODE="$mode" bash "$SCRATCH/scripts/jest-retry.sh" --maxWorkers=2 --ci > "$SCRATCH/log" 2>&1 || rc=$?
  [ "$rc" = "$expected_rc" ] && [ "$(cat "$SCRATCH/count")" = "$expected_count" ] || { cat "$SCRATCH/log" >&2; exit 1; }
  ! grep -vx -- '--maxWorkers=2 --ci' "$SCRATCH/args" || exit 1
  PASSED=$((PASSED + 1))
  echo "ok $PASSED - $mode preserves exit, attempt count and arguments"
}
check pass 0 1
check fail 3 1
check crash-then-pass 0 2
grep -q 'retrying once' "$SCRATCH/log"
check crash-twice 1 2
for option in --watch --watchAll --watch=true --watchAll=true; do
  printf '0\n' > "$SCRATCH/count"
  : > "$SCRATCH/args"
  # exec must preserve the wrapper PID (and therefore the caller's TTY).
  MOCK_ROOT="$SCRATCH" MOCK_MODE=crash-twice bash "$SCRATCH/scripts/jest-retry.sh" "$option" > "$SCRATCH/log" 2>&1 &
  watch_pid=$!
  rc=0
  wait "$watch_pid" || rc=$?
  [ "$rc" = 1 ] && [ "$(cat "$SCRATCH/count")" = 1 ] && [ "$(cat "$SCRATCH/pid")" = "$watch_pid" ] || exit 1
  [ "$(cat "$SCRATCH/args")" = "$option" ] || exit 1
  PASSED=$((PASSED + 1))
  echo "ok $PASSED - $option exec preserves interactivity and exit without retry"
done
echo "jest-retry: $PASSED passed"
