#!/usr/bin/env bash
# Offline nightly integration: command, budget/cap forwarding, refusal and guards.
set -euo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PIPE=$(mktemp -d)
trap 'rm -rf "$PIPE"' EXIT
PY=$(command -v python3)
export OPAX_DB="$PIPE/stage.sqlite"
export OPAX_BACKFILL_NSW_CAP=3 OPAX_BACKFILL_NSW_BUDGET_S=42
export OPAX_BACKFILL_NSW=1 OPAX_NIGHTLY_SKIP_REFRESH=0 OPAX_NIGHTLY_SKIP_DAILY=0
log() { echo "$*" >> "$PIPE/log"; }
warn() { echo "WARN $*" >> "$PIPE/log"; }
fail() { echo "FAIL $*" >> "$PIPE/log"; }
run() {
  printf '%s\n' "$@" > "$PIPE/args"
  test "$OPAX_DB" = "$PIPE/stage.sqlite"
  test "$OPAX_BACKFILL_NSW_CAP" = 3
  test "$OPAX_BACKFILL_NSW_BUDGET_S" = 42
  test "$OPAX_SOURCE_NAME" = nsw_hansard
  echo '{"missing_left":7}' > "$PIPE/nsw-hansard-backfill.json"
  return "${RESULT:-0}"
}
. "$REPO/scripts/vm/nsw_hansard_backfill.sh"
nsw_hansard_backfill
rg -q '^nice$' "$PIPE/args"
rg -q '^10$' "$PIPE/args"
rg -q '^parli.ingest.nsw_hansard$' "$PIPE/args"
rg -q '^--backfill-missing-days$' "$PIPE/args"
rg -q 'WARN NSW coverage guard: 7 chamber sitting days missing' "$PIPE/log"
RESULT=4 nsw_hansard_backfill
rg -q 'API refused; repair stopped' "$PIPE/log"
RESULT=1 nsw_hansard_backfill
rg -q 'FAIL NSW Hansard repair failed' "$PIPE/log"
rm "$PIPE/args"
OPAX_BACKFILL_NSW=0 nsw_hansard_backfill
test ! -f "$PIPE/args"
OPAX_NIGHTLY_SKIP_REFRESH=1 nsw_hansard_backfill
test ! -f "$PIPE/args"
OPAX_NIGHTLY_SKIP_DAILY=1 nsw_hansard_backfill
test ! -f "$PIPE/args"
python3 - "$REPO/scripts/vm/nightly.sh" <<'PY'
import sys
text=open(sys.argv[1]).read()
assert text.index('nsw_hansard_backfill\n') > text.index('run "$REFRESH"')
PY
echo 'NSW nightly integration passed'
