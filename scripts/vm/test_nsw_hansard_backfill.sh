#!/usr/bin/env bash
# Offline integration: failures/timeouts/receipts cannot re-trigger periodic work.
set -euo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PIPE=$(mktemp -d)
trap 'rm -rf "$PIPE"' EXIT
export PIPE
REAL_PY=$(command -v python3)
export REAL_PY
cat > "$PIPE/python" <<'PYWRAP'
#!/usr/bin/env bash
if [ "${1:-}" = scripts/vm/periodic_state.py ] && [ "${2:-}" = complete ]; then
  touch "$PIPE/periodic-completed"
  exit 0
fi
exec "$REAL_PY" "$@"
PYWRAP
chmod +x "$PIPE/python"
PY="$PIPE/python"
export OPAX_DB="$PIPE/stage.sqlite"
export OPAX_BACKFILL_NSW_CAP=3 OPAX_BACKFILL_NSW_BUDGET_S=42
export OPAX_NIGHTLY_SKIP_REFRESH=0 OPAX_NIGHTLY_SKIP_DAILY=0
FAILURES=()
log() { echo "$*" >> "$PIPE/log"; }
warn() { echo "WARN $*" >> "$PIPE/log"; }
fail() { FAILURES+=("$*"); echo "FAIL $*" >> "$PIPE/log"; }
run() {
  printf '%s\n' "$@" > "$PIPE/args"
  test "$OPAX_DB" = "$PIPE/stage.sqlite"
  test "$OPAX_BACKFILL_NSW_CAP" = "${EXPECTED_CAP:-3}"
  test "$OPAX_BACKFILL_NSW_BUDGET_S" = "${EXPECTED_BUDGET:-42}"
  test "$OPAX_SOURCE_NAME" = nsw_hansard
  if [ "${BAD_RECEIPT:-0}" = 1 ]; then
    echo broken > "$PIPE/nsw-hansard-backfill.json"
  else
    echo '{"missing_left":0,"incomplete_left":7}' > "$PIPE/nsw-hansard-backfill.json"
  fi
  return "${RESULT:-0}"
}
. "$REPO/scripts/vm/nsw_hansard_backfill.sh"
unset OPAX_NSW_BACKFILL
nsw_hansard_backfill
test -f "$PIPE/args"
export OPAX_NSW_BACKFILL=1
nsw_hansard_backfill
for expected in timeout --kill-after=60s 102s nice 10 parli.ingest.nsw_hansard --backfill-missing-days --publication-state --growth-guard; do
  grep -qxF -- "$expected" "$PIPE/args"
done
grep -qF 'WARN NSW coverage guard: 7 chamber sitting days incomplete' "$PIPE/log"
# Use the actual nightly periodic-completion function, with only its state writer stubbed.
"$REAL_PY" - "$REPO/scripts/vm/nightly.sh" "$PIPE/periodic.sh" <<'PY'
import re,sys
text=open(sys.argv[1]).read()
open(sys.argv[2],'w').write(re.search(r'^periodic_refresh_complete\(\) \{\n.*?^\}',text,re.M|re.S)[0]+'\n')
assert text.index('nsw_hansard_backfill\n') > text.index('run "$REFRESH"')
PY
. "$PIPE/periodic.sh"
PERIODIC_ACCEPTED=1
PERIODIC_DATE=2026-11-14
PERIODIC_STATE="$PIPE/periodic.json"
groups=weekly
export OPAX_NIGHTLY_NO_PUSH=0
for result in 1 4 124 137; do
  RESULT=$result nsw_hansard_backfill
  test "${#FAILURES[@]}" -eq 0
  rm -f "$PIPE/periodic-completed"
  periodic_refresh_complete
  test -f "$PIPE/periodic-completed"
done
BAD_RECEIPT=1 nsw_hansard_backfill
grep -qF 'WARN NSW Hansard repair receipt unreadable' "$PIPE/log"
test "${#FAILURES[@]}" -eq 0
rm -f "$PIPE/periodic-completed"
periodic_refresh_complete
test -f "$PIPE/periodic-completed"
rm "$PIPE/args"
OPAX_NSW_BACKFILL=0 nsw_hansard_backfill
test ! -f "$PIPE/args"
OPAX_NIGHTLY_SKIP_REFRESH=1 nsw_hansard_backfill
test ! -f "$PIPE/args"
OPAX_NIGHTLY_SKIP_DAILY=1 nsw_hansard_backfill
test ! -f "$PIPE/args"
unset OPAX_BACKFILL_NSW_CAP OPAX_BACKFILL_NSW_BUDGET_S
EXPECTED_CAP=4 EXPECTED_BUDGET=1200 nsw_hansard_backfill
grep -qxF '1260s' "$PIPE/args"
rm "$PIPE/args"
touch "$PIPE/backfill.STOP"
nsw_hansard_backfill
test ! -f "$PIPE/args"
grep -qF 'WARN Shared backfill.STOP' "$PIPE/log"
test "${#FAILURES[@]}" -eq 0
periodic_refresh_complete
test -f "$PIPE/periodic-completed"
rm "$PIPE/backfill.STOP"
OPAX_BACKFILL_NSW_CAP=5 nsw_hansard_backfill
test ! -f "$PIPE/args"
echo 'NSW nightly isolation, default-on, stop file, cap and outer-timeout checks passed'
