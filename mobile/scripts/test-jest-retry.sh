#!/usr/bin/env bash
# Exercise retry decisions using an offline mocked Jest executable.
set -euo pipefail
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/opax-jest-retry-test.XXXXXX")
trap '/bin/rm -rf "$SCRATCH"' EXIT
mkdir -p "$SCRATCH/scripts" "$SCRATCH/node_modules/.bin"
/bin/cp -f "$SCRIPTS/jest-retry.sh" "$SCRATCH/scripts/"
cat > "$SCRATCH/node_modules/.bin/jest" <<'EOF'
#!/usr/bin/env node
// Offline Jest stand-in: the wrapper runs it with node, so it must be JS.
const fs = require('fs');
const root = process.env.MOCK_ROOT;
const count = Number(fs.readFileSync(`${root}/count`, 'utf8')) + 1;
fs.writeFileSync(`${root}/count`, `${count}\n`);
fs.appendFileSync(`${root}/args`, `${process.argv.slice(2).join(' ')}\n`);
fs.writeFileSync(`${root}/pid`, `${process.pid}\n`);
fs.appendFileSync(`${root}/execargv`, `${process.execArgv.join(' ')}\n`);
const mode = process.env.MOCK_MODE;
if (mode === 'pass' || (mode === 'crash-then-pass' && count > 1)) process.exit(0);
if (mode === 'fail') {
  console.log('FAIL assertion failed');
  process.exit(3);
}
console.log('A jest worker process (pid=123) was terminated: signal=SIGSEGV, exitCode=null.');
process.exit(1);
EOF
chmod +x "$SCRATCH/node_modules/.bin/jest"
PASSED=0
check() {
  local mode=$1 expected_rc=$2 expected_count=$3 rc=0
  printf '0\n' > "$SCRATCH/count"
  : > "$SCRATCH/args"
  : > "$SCRATCH/execargv"
  MOCK_ROOT="$SCRATCH" MOCK_MODE="$mode" bash "$SCRATCH/scripts/jest-retry.sh" --maxWorkers=2 --ci > "$SCRATCH/log" 2>&1 || rc=$?
  [ "$rc" = "$expected_rc" ] && [ "$(cat "$SCRATCH/count")" = "$expected_count" ] || { cat "$SCRATCH/log" >&2; exit 1; }
  ! grep -vx -- '--maxWorkers=2 --ci' "$SCRATCH/args" || exit 1
  # Every attempt runs node --no-sparkplug (nodejs/node#62393).
  ! grep -vx -- '--no-sparkplug' "$SCRATCH/execargv" || exit 1
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
  : > "$SCRATCH/execargv"
  # exec must preserve the wrapper PID (and therefore the caller's TTY).
  MOCK_ROOT="$SCRATCH" MOCK_MODE=crash-twice bash "$SCRATCH/scripts/jest-retry.sh" "$option" > "$SCRATCH/log" 2>&1 &
  watch_pid=$!
  rc=0
  wait "$watch_pid" || rc=$?
  [ "$rc" = 1 ] && [ "$(cat "$SCRATCH/count")" = 1 ] && [ "$(cat "$SCRATCH/pid")" = "$watch_pid" ] || exit 1
  [ "$(cat "$SCRATCH/args")" = "$option" ] || exit 1
  [ "$(cat "$SCRATCH/execargv")" = '--no-sparkplug' ] || exit 1
  PASSED=$((PASSED + 1))
  echo "ok $PASSED - $option exec preserves interactivity and exit without retry"
done
echo "jest-retry: $PASSED passed"
