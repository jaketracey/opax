#!/usr/bin/env bash
# scripts/daily_refresh.sh -- OPAX daily data refresh for parli.db on `desktop`.
#
# Replaces the dead `parli.pipeline` cron (which ran from the stale
# /home/jake/autoresearch checkout and failed every step with exit 127 because
# `uv` was not on cron's PATH). Runs every fetcher that still works against
# today's sources, one at a time, each under its own timeout, continuing past
# failures, and logs per-step OK/FAIL with row-count deltas.
#
#   log      ~/.cache/autoresearch/pipeline/daily.log       (one line per step)
#   details  ~/.cache/autoresearch/pipeline/<step>.log      (fetcher stdout/err)
#   lock     ~/.cache/autoresearch/pipeline/daily_refresh.lock
#
# The knowledge-box push (parli.ingest.arag_sync) and the votes refresh
# (tvfy_refresh + scripts/export_votes.py) are DISABLED unless OPAX_SYNC_KB=1,
# because they cost money / touch the public site. Everything else only
# writes to parli.db and the fetchers' own caches.
#
# Tunables (env):
#   OPAX_DAYS_BACK      lookback window for date-bounded fetchers (default 30)
#   OPAX_STEP_TIMEOUT   per-step timeout, GNU timeout syntax (default 3h)
#   OPAX_FED_START / OPAX_NSW_START / OPAX_VIC_SINCE / OPAX_QLD_START /
#   OPAX_SA_SINCE       per-source start dates (default: DAYS_BACK ago) --
#                       set these for a one-off backfill, e.g.
#                       OPAX_STEP_TIMEOUT=12h OPAX_NSW_START=2024-11-22 scripts/daily_refresh.sh
#   OPAX_IPEA_SINCE     first IPEA quarter to consider (default: this year)
#   OPAX_ONLY           comma-separated step names to run (debugging)
#   OPAX_SYNC_KB=1      enable arag_sync + tvfy_refresh + export_votes
#
# Not installed in crontab by this script. Suggested line (local time, after
# OpenAustralia has published the previous day's Hansard):
#   0 5 * * * /home/jake/opax/scripts/daily_refresh.sh >/dev/null 2>&1
#
# Known-broken source: sa_hansard. hansardsearch.parliament.sa.gov.au sits
# behind an Azure Front Door WAF JavaScript challenge (Sept 2026) that rejects
# every non-browser client; the step is kept so the log shows the day it
# starts working again.

set -u
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

REPO=/home/jake/opax
PIPE="$HOME/.cache/autoresearch/pipeline"
DB="$HOME/.cache/autoresearch/parli.db"
LOG="$PIPE/daily.log"
LOCK="$PIPE/daily_refresh.lock"
PY="$REPO/.venv/bin/python"

STEP_TIMEOUT="${OPAX_STEP_TIMEOUT:-3h}"
DAYS_BACK="${OPAX_DAYS_BACK:-30}"
TODAY=$(date +%F)
SINCE=$(date -d "-${DAYS_BACK} days" +%F)
FED_START="${OPAX_FED_START:-$SINCE}"
NSW_START="${OPAX_NSW_START:-$SINCE}"
VIC_SINCE="${OPAX_VIC_SINCE:-$SINCE}"
QLD_START="${OPAX_QLD_START:-$SINCE}"
SA_SINCE="${OPAX_SA_SINCE:-$SINCE}"
IPEA_SINCE="${OPAX_IPEA_SINCE:-$(date +%Y)}"
ONLY="${OPAX_ONLY:-}"

mkdir -p "$PIPE"
ts() { date '+%F %T'; }
log() { echo "$(ts) $*" | tee -a "$LOG"; }

cd "$REPO" || { log "FATAL: cannot cd $REPO"; exit 1; }
[ -x "$PY" ] || { log "FATAL: $PY missing (run: uv sync)"; exit 1; }

exec 9>"$LOCK"
if ! flock -n 9; then
  log "another refresh is still running (lock $LOCK held); exiting"
  exit 0
fi

# Secrets: ARAG_*, OPENAUSTRALIA_API_KEY, TVFY_API_KEY (GUARDIAN_API_KEY is
# optional; the fetcher falls back to the public 'test' key).
if [ -f .env ]; then set -a; . ./.env; set +a; fi

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
  if [ -n "$ONLY" ] && ! printf ',%s,' "$ONLY" | grep -q ",$name,"; then
    return 0
  fi
  local before after rc t0 dur delta status
  before=$(count "$sql")
  t0=$(date +%s)
  log "[$name] start: $*"
  if timeout --kill-after=60 "$STEP_TIMEOUT" "$@" >"$PIPE/$name.log" 2>&1; then
    rc=0
  else
    rc=$?
  fi
  after=$(count "$sql")
  dur=$(( $(date +%s) - t0 ))
  if [ "$before" != "-" ] && [ "$after" != "-" ]; then
    delta="rows $before -> $after (+$((after - before)))"
  else
    delta="(no row count)"
  fi
  case $rc in
    0)   status=OK ;;
    124|137) status="FAIL(timeout ${STEP_TIMEOUT})" ;;
    *)   status="FAIL(rc=$rc)" ;;
  esac
  log "[$name] $status in ${dur}s; $delta; log $PIPE/$name.log"
  return $rc
}

log "===== daily refresh start (since=$SINCE, timeout/step=$STEP_TIMEOUT, host=$(hostname)) ====="

# --- federal Hansard: JSONL from OpenAustralia, then load into speeches -------
run_step fed_download "" \
  "$PY" download_hansard_fast.py --start "$FED_START" --end "$TODAY" --workers 5
run_step fed_load "SELECT COUNT(*) FROM speeches WHERE source='openaustralia'" \
  "$PY" -m parli.ingest.speeches --modern-only --since "$FED_START"

# --- quick structured sources ------------------------------------------------
run_step guardian "SELECT COUNT(*) FROM news_articles" \
  "$PY" -m parli.ingest.guardian_news --all-topics --limit 100
run_step austender "SELECT COUNT(*) FROM contracts" \
  "$PY" -m parli.ingest.austender
run_step ipea "SELECT COUNT(*) FROM mp_expenses WHERE source='ipea'" \
  "$PY" -m parli.ingest.ipea_expenses --since "$IPEA_SINCE" --new-only

# --- state Hansards + committees ---------------------------------------------
run_step vic "SELECT COUNT(*) FROM speeches WHERE source='vic_hansard'" \
  "$PY" -m parli.ingest.vic_parliament --since "$VIC_SINCE"
run_step qld "SELECT COUNT(*) FROM speeches WHERE source='qld_hansard'" \
  "$PY" -m parli.ingest.qld_parliament --hansard-only --start "$QLD_START"
run_step committees "SELECT COUNT(*) FROM speeches WHERE source LIKE 'committee_%'" \
  "$PY" -m parli.ingest.committee_hearings
run_step nsw "SELECT COUNT(*) FROM speeches WHERE source='nsw_hansard'" \
  "$PY" -m parli.ingest.nsw_hansard --start "$NSW_START"
run_step sa "SELECT COUNT(*) FROM speeches WHERE source='sa_hansard'" \
  "$PY" -m parli.ingest.sa_hansard --since "$SA_SINCE"

# --- derived data ------------------------------------------------------------
run_step link_speakers "SELECT COUNT(*) FROM speeches WHERE person_id IS NOT NULL AND person_id != ''" \
  "$PY" -m parli.ingest.link_speakers
run_step classify "SELECT COUNT(*) FROM speech_topics" \
  "$PY" classify_state_speeches.py

# --- knowledge box + votes: DISABLED unless OPAX_SYNC_KB=1 -------------------
if [ "${OPAX_SYNC_KB:-0}" = "1" ]; then
  # arag_sync caps at 100 rows/table unless --full; --full is still
  # incremental because it resumes from the per-table checkpoint in
  # ~/.cache/autoresearch/arag_sync_state.json. Refuse to run --full without a
  # sane checkpoint: that would re-push the whole ~550K-document corpus.
  STATE="$HOME/.cache/autoresearch/arag_sync_state.json"
  if "$PY" - "$STATE" <<'PYEOF'
import json, sys
s = json.load(open(sys.argv[1]))["tables"]
assert s["speeches"]["after"] > 1_000_000 and s["news_articles"]["after"] > 1_000
PYEOF
  then
    run_step arag_sync "" \
      "$PY" -m parli.ingest.arag_sync --tables speeches,news_articles --full
  else
    log "[arag_sync] SKIP: $STATE missing or implausible; refusing --full without a checkpoint"
  fi
  run_step tvfy_refresh "SELECT COUNT(*) FROM divisions WHERE state='federal'" \
    "$PY" -m parli.ingest.tvfy_refresh
  # export_votes writes JSON to stdout and progress to stderr. run_step folds
  # both into one log (2>&1), which interleaved a progress line INTO the middle
  # of the JSON and made every run unpublishable. Keep the two streams apart:
  # stdout to its own file, stderr to the step log where the other steps put it.
  if timeout --kill-after=60 "$STEP_TIMEOUT" "$PY" scripts/export_votes.py \
       >"$PIPE/export_votes.json" 2>"$PIPE/export_votes.log"; then
    log "[export_votes] OK; $(wc -c < "$PIPE/export_votes.json") bytes of JSON"
    if "$PY" -c 'import json,sys; json.load(open(sys.argv[1]))' "$PIPE/export_votes.json" 2>/dev/null; then
      cp "$PIPE/export_votes.json" portal/public/votes.json.tmp \
        && mv portal/public/votes.json.tmp portal/public/votes.json \
        && log "[export_votes] wrote portal/public/votes.json ($(wc -c < portal/public/votes.json) bytes)"
    else
      log "[export_votes] output is not valid JSON; portal/public/votes.json left untouched"
    fi
  else
    log "[export_votes] FAILED (rc=$?); see $PIPE/export_votes.log"
  fi
else
  log "[arag_sync] DISABLED (set OPAX_SYNC_KB=1 to push new speeches/news_articles to the knowledge box)"
  log "[tvfy_refresh+export_votes] DISABLED (set OPAX_SYNC_KB=1)"
fi

# --- summary -----------------------------------------------------------------
"$PY" - <<'PYEOF' 2>/dev/null | while IFS= read -r line; do log "  $line"; done
import os, sqlite3
db = sqlite3.connect("file:" + os.path.expanduser("~/.cache/autoresearch/parli.db") + "?mode=ro", uri=True)
for src, mx, n in db.execute("SELECT source, MAX(date), COUNT(*) FROM speeches GROUP BY source ORDER BY source"):
    print(f"{src:18s} newest {mx}  rows {n:,}")
PYEOF
log "===== daily refresh end ====="
