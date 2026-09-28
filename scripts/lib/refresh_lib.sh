# scripts/lib/refresh_lib.sh -- the step runner shared by daily_refresh.sh and weekly_refresh.sh.
#
# Source it after setting these (the callers do):
#   PIPE          directory for logs (created here)
#   LOG           the one-line-per-step log this run appends to (daily.log / weekly.log)
#   PY            the python to run steps with (also used to count rows)
#   STEP_TIMEOUT  GNU timeout per step (default 3h)
#   ONLY          comma-separated step names to run, empty = all (debugging: OPAX_ONLY)
#   ALLOW_FAIL    ",step,step," -- failures that are logged but do not make the run incomplete
# It defines log, count, run_step and the FAILED_STEPS / STEP_DELTA it fills in.
#
# Count SQL is read-only against ~/.cache/autoresearch/parli.db. A step's log goes to $PIPE/<name>.log.
# shellcheck shell=bash

declare -A STEP_DELTA=()   # step name -> rows it added ("?" when the table could not be counted)
FAILED_STEPS=()
mkdir -p "$PIPE"

ts() { date '+%F %T'; }
log() { echo "$(ts) $*" | tee -a "$LOG"; }

# Read-only row count. $1 is a SQL statement returning one number; empty $1
# (steps with no natural table) prints "-".
count() {
  if [ -z "$1" ]; then echo "-"; return; fi
  "$PY" - "$1" <<'PYEOF' 2>/dev/null || echo "-"
import os, sqlite3, sys
db = sqlite3.connect("file:" + os.path.expanduser("~/.cache/autoresearch/parli.db") + "?mode=ro", uri=True)
print(db.execute(sys.argv[1]).fetchone()[0] or 0)
PYEOF
}

# run_step NAME COUNT_SQL CMD... : runs CMD under timeout, logs OK/FAIL, delta.
run_step() {
  local name=$1 sql=$2; shift 2
  if [ -n "${ONLY:-}" ] && ! printf ',%s,' "$ONLY" | grep -q ",$name,"; then
    return 0
  fi
  local before after rc t0 dur delta status
  before=$(count "$sql")
  t0=$(date +%s)
  log "[$name] start: $*"
  if timeout --kill-after=60 "${STEP_TIMEOUT:-3h}" "$@" >"$PIPE/$name.log" 2>&1; then
    rc=0
  else
    rc=$?
  fi
  after=$(count "$sql")
  dur=$(( $(date +%s) - t0 ))
  if [ "$before" != "-" ] && [ "$after" != "-" ]; then
    delta="rows $before -> $after (+$((after - before)))"
    STEP_DELTA[$name]=$((after - before))
  else
    delta="(no row count)"
    STEP_DELTA[$name]="?"
  fi
  case $rc in
    0)   status=OK ;;
    124|137) status="FAIL(timeout ${STEP_TIMEOUT:-3h})" ;;
    *)   status="FAIL(rc=$rc)" ;;
  esac
  if [ "$rc" -ne 0 ]; then
    if [[ "$ALLOW_FAIL" == *",$name,"* ]]; then
      status="$status (allowed)"
    else
      FAILED_STEPS+=("$name")
    fi
  fi
  log "[$name] $status in ${dur}s; $delta; log $PIPE/$name.log"
  return $rc
}
