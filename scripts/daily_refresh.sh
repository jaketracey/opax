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
#   OPAX_ACT_START      ACT Assembly Hansard window start (default: DAYS_BACK ago; the one-off 11th Assembly
#                       backfill is docs/DATA-ACT-HANSARD.md: OPAX_ACT_START=2024-10-19)
#   OPAX_IPEA_SINCE     first IPEA quarter to consider (default: this year)
#   OPAX_ONLY           comma-separated step names to run (debugging)
#   OPAX_SYNC_KB=1      enable arag_sync + tvfy_refresh + export_votes
#   OPAX_ALLOW_FAIL     comma-separated steps whose failure is logged but does not
#                       make the run "incomplete" (exit 1). The nightly VM run sets
#                       sa, whose source is behind a WAF that always refuses us.
#   OPAX_SYNC_GATE      comma-separated steps that must have succeeded before
#                       arag_sync pushes to the knowledge box (the push is permanent
#                       and advances the checkpoint, so it must not run on rows a
#                       failed link_speakers/classify left half-processed). Empty
#                       (default) = no gate.
#   OPAX_ENSURE_INDEXES 1 = first create the speeches(source, date) index if it is missing (the nightly VM
#                       needs it: without it every row count is a full scan of 29 GB on network disk)
#   OPAX_REPO           checkout to run in (default: the checkout this script is in)
#   OPAX_FORCE_KB_SYNC  1 = ignore the MIGRATED_TO_VM marker (never needed; see the cutover rule below)
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

REPO="${OPAX_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
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
ACT_START="${OPAX_ACT_START:-$SINCE}"
IPEA_SINCE="${OPAX_IPEA_SINCE:-$(date +%Y)}"
ONLY="${OPAX_ONLY:-}"
ALLOW_FAIL=",${OPAX_ALLOW_FAIL:-},"
STALE_OK=",grants_apply,"   # exit 3 from ext_apply = the fetched window was empty or shrunken: rows kept, not a failure
SYNC_GATE="${OPAX_SYNC_GATE:-}"

# log, count, run_step, FAILED_STEPS, STEP_DELTA (shared with weekly_refresh.sh)
. "$REPO/scripts/lib/refresh_lib.sh"

cd "$REPO" || { log "FATAL: cannot cd $REPO"; exit 1; }
[ -x "$PY" ] || { log "FATAL: $PY missing (run: uv sync)"; exit 1; }
# The ext_* loaders and exporters read OPAX_DB (never the desktop over ssh); scripts/ needs the package importable.
export OPAX_DB="$DB" PYTHONPATH="$REPO${PYTHONPATH:+:$PYTHONPATH}"

# The cutover rule (docs/operations/nightly-refresh.md): once the pipeline has moved to the VM,
# this machine must never push to the knowledge box again, because the push checkpoint
# (arag_sync_state.json) lives on the VM and two pushers would duplicate resources.
# scripts/vm/transfer_state.sh --mark-migrated writes the marker this checks.
if [ "${OPAX_SYNC_KB:-0}" = "1" ] && [ -e "$HOME/.cache/autoresearch/MIGRATED_TO_VM" ] \
   && [ "${OPAX_FORCE_KB_SYNC:-0}" != "1" ]; then
  log "REFUSING to run with OPAX_SYNC_KB=1: $HOME/.cache/autoresearch/MIGRATED_TO_VM exists, so the nightly VM owns the knowledge-box push."
  log "Run without OPAX_SYNC_KB=1 for a local-only refresh, or delete the marker only if the VM has never pushed."
  exit 3
fi

exec 9>"$LOCK"
if ! flock -n 9; then
  log "another refresh is still running (lock $LOCK held); exiting"
  exit 0
fi

# Secrets: ARAG_*, OPENAUSTRALIA_API_KEY, TVFY_API_KEY.
# News is excluded from both acquisition and the knowledge box.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

log "===== daily refresh start (since=$SINCE, timeout/step=$STEP_TIMEOUT, host=$(hostname)) ====="

# --- one-off database housekeeping (the nightly VM sets this; see scripts/ensure_db_indexes.py) -----
if [ "${OPAX_ENSURE_INDEXES:-0}" = "1" ]; then
  run_step db_indexes "" "$PY" scripts/ensure_db_indexes.py
fi

# --- federal Hansard: JSONL from OpenAustralia, then load into speeches -------
run_step fed_download "" \
  "$PY" download_hansard_fast.py --start "$FED_START" --end "$TODAY" --workers 5
run_step fed_load "SELECT COUNT(*) FROM speeches WHERE source='openaustralia'" \
  "$PY" -m parli.ingest.speeches --modern-only --since "$FED_START"

# --- quick structured sources ------------------------------------------------
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
# ACT Legislative Assembly (docs/DATA-ACT-HANSARD.md): the sitting members first (one request; a redesigned page must not
# fail the night, so act_members is in the nightly's allow-fail list), then the sitting-day PDFs of the window.
# Both come before link_speakers (surname linking) and fts_sync (indexing). Proofs are swapped for Finals later.
run_step act_members "SELECT COUNT(*) FROM members WHERE state='act'" \
  "$PY" -m parli.ingest.act_hansard --members
run_step act "SELECT COUNT(*) FROM speeches WHERE source='act_hansard'" \
  "$PY" -m parli.ingest.act_hansard --start "$ACT_START"

# The full-text index is brought up to date once, after every loader, instead of each loader rebuilding
# all 1.3M speeches at its end (scripts/fts_sync.py). Nothing later in this script reads it.
run_step fts_sync "" \
  "$PY" scripts/fts_sync.py

run_step bills "SELECT COUNT(*) FROM bills_v2" \
  bash scripts/refresh_bills.sh

# --- official statements already included in the public corpus ---------------
run_step releases_nsw "SELECT COUNT(*) FROM ext_press_releases WHERE source='nsw'" \
  "$PY" -m parli.ingest.words_press_releases nsw --all --since "$SINCE"
if [ "${OPAX_SYNC_KB:-0}" = "1" ]; then
  run_step releases_nsw_sync "" \
    "$PY" -m parli.ingest.words_sync --db "$DB" --source nsw --since "$SINCE" --full --limit 10000 --apply
fi

# --- the other government releases: PM transcripts, QLD statements, VIC Premier, Treasury ------------
# scripts/refresh_releases.py: the id-probe windows come from the highest stored id, the fetchers upsert and
# never delete, and --apply (KB on) creates only what is new after checking the KB has no automatic generation.
REL_APPLY=()
[ "${OPAX_SYNC_KB:-0}" = "1" ] && REL_APPLY=(--apply)
run_step releases "SELECT COUNT(*) FROM ext_press_releases WHERE source IN ('pmtranscripts','qld','vic','treasury')" \
  "$PY" scripts/refresh_releases.py --db "$DB" --since "$SINCE" ${REL_APPLY[@]+"${REL_APPLY[@]}"}

# --- AusTender: the full OCDS feed into ext_contracts (never deletes; the last 3 days are always refetched) ----
run_step austender_full "SELECT COUNT(*) FROM ext_contracts" \
  "$PY" -m parli.ingest.austender_full --db "$DB" --since "$(date -d '-10 days' +%F)"

# --- GrantConnect awards: staged, reconciled by ext_apply (refuses an empty or shrunken window), then the KB ---
# Awards are varied later (a -Vn suffix), so the window is 45 days. The loader deletes its window in whatever
# file it is pointed at, so it is pointed at a scratch file and ext_apply decides what reaches parli.db.
GRANTS_SINCE="${OPAX_GRANTS_SINCE:-$(date -d '-45 days' +%F)}"
GRANTS_STAGE="$PIPE/stage/grants"
rm -rf "$GRANTS_STAGE"; mkdir -p "$GRANTS_STAGE"
if run_step grants_fetch "" \
     "$PY" -m parli.ingest.grantconnect --since "$GRANTS_SINCE" --refetch --db "$GRANTS_STAGE/grants.sqlite"; then
  run_step grants_apply "SELECT COUNT(*) FROM ext_grants WHERE source='grantconnect'" \
    "$PY" scripts/ext_apply.py grants --stage "$GRANTS_STAGE/grants.sqlite" --db "$DB" --since "$GRANTS_SINCE"
else
  log "[grants_apply] SKIP: the fetch failed, nothing to apply"
fi

# --- state votes (NSW, VIC): parsed from Hansard into ext_divisions / ext_votes (per chamber-day replace) -------
VOTES_YEAR=$(TZ=Australia/Sydney date +%Y)
run_step votes_nsw "SELECT COUNT(*) FROM ext_divisions WHERE jurisdiction='nsw'" \
  "$PY" -m parli.ingest.votes_state nsw --year "$VOTES_YEAR" --days 6 --out "$PIPE/votes_nsw.json" --load --db "$DB"
run_step votes_vic "SELECT COUNT(*) FROM ext_divisions WHERE jurisdiction='vic'" \
  "$PY" -m parli.ingest.votes_state vic --days 8 --out "$PIPE/votes_vic.json" --load --db "$DB"

# --- derived data ------------------------------------------------------------
run_step link_speakers "SELECT COUNT(*) FROM speeches WHERE person_id IS NOT NULL AND person_id != ''" \
  "$PY" -m parli.ingest.link_speakers
# docs/COMMITTEE-WITNESSES.md: link_speakers surname-links witnesses to members ("Ms Hall" -> Jill Hall), so
# after new committee rows arrive, `fetch` (the hearing's attendance list) and `resolve` (witnesses are never
# members; full names, positions) must run before those rows reach the knowledge box. They read committee rows
# only, so they run only when the committees step added some (estimates rounds), and the KB push waits for them
# (OPAX_SYNC_GATE). `resolve` also queues KB patches for rows already pushed; draining that queue is
# scripts/arag_patch_speakers.py, not part of the nightly.
if [ "${STEP_DELTA[committees]:-0}" != "0" ]; then
  run_step committee_fetch "" \
    "$PY" -m parli.ingest.committee_witnesses fetch --db "$DB"
  run_step committee_resolve "" \
    "$PY" -m parli.ingest.committee_witnesses resolve --db "$DB"
fi
run_step classify "SELECT COUNT(*) FROM speech_topics" \
  "$PY" classify_state_speeches.py

# --- knowledge box + votes: DISABLED unless OPAX_SYNC_KB=1 -------------------
if [ "${OPAX_SYNC_KB:-0}" = "1" ]; then
  # arag_sync caps at 100 rows/table unless --full; --full is still
  # incremental because it resumes from the per-table checkpoint in
  # ~/.cache/autoresearch/arag_sync_state.json. Refuse to run --full without a
  # sane checkpoint: that would re-push the whole ~550K-document corpus.
  STATE="$HOME/.cache/autoresearch/arag_sync_state.json"
  gate_failed=""
  for g in ${SYNC_GATE//,/ }; do
    for f in ${FAILED_STEPS[@]+"${FAILED_STEPS[@]}"}; do
      if [ "$f" = "$g" ]; then gate_failed="$gate_failed $g"; fi
    done
  done
  if [ -n "$gate_failed" ]; then
    log "[arag_sync] SKIP: gate step(s) failed:$gate_failed; not pushing to the knowledge box"
    FAILED_STEPS+=("arag_sync(skipped)")
  elif "$PY" - "$STATE" <<'PYEOF'
import json, sys
s = json.load(open(sys.argv[1]))["tables"]
assert s["speeches"]["after"] > 1_000_000
PYEOF
  then
    run_step arag_sync "" \
      "$PY" -m parli.ingest.arag_sync --tables speeches --full
    # ACT turns that changed after they were pushed (proof -> final): text-only PATCH, deletes of removed turns
    run_step act_kb_patch "SELECT COUNT(*) FROM act_hansard_kb_queue WHERE done_at IS NULL" \
      "$PY" -m parli.ingest.act_hansard --patch-kb
  else
    log "[arag_sync] SKIP: $STATE missing or implausible; refusing --full without a checkpoint"
  fi
  run_step tvfy_refresh "SELECT COUNT(*) FROM divisions WHERE state='federal'" \
    "$PY" -m parli.ingest.tvfy_refresh
  # division documents for the KB (409 = already there): the state ones just loaded, then the federal ones
  # tvfy_refresh brought in (legacy tables)
  run_step votes_kb_ext "" \
    "$PY" -m parli.ingest.votes_ingest --db "$DB" --from-ext --since "$SINCE" --full --limit 5000
  run_step votes_kb_legacy "" \
    "$PY" -m parli.ingest.votes_ingest --db "$DB" --from-legacy --since "$SINCE" --full --limit 5000
  # GrantConnect awards from the window into the KB (create-only; amendments are held, not overwritten)
  if [ -s "$GRANTS_STAGE/grants.sqlite" ]; then
    run_step grants_kb "" bash -c '
      set -e
      sqlite3 -readonly -json "$1" "select * from ext_grants where source=\"grantconnect\" and publish_date >= \"$2\"" > "$3/rows.json"
      "$4" scripts/publish_recent_grants.py --input "$3/rows.json" --env .env --receipt "$3/receipt-$(date +%F).jsonl" --apply
    ' _ "$DB" "$GRANTS_SINCE" "$GRANTS_STAGE" "$PY"
  fi
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
  log "[arag_sync] DISABLED (set OPAX_SYNC_KB=1 to push new speeches to the knowledge box)"
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
[ "${#STALE_STEPS[@]}" -eq 0 ] || log "Stale daily refresh: source refused to change the register: ${STALE_STEPS[*]}"
if [ "${#FAILED_STEPS[@]}" -gt 0 ]; then
  log "Incomplete refresh: failed steps ${FAILED_STEPS[*]}"
  exit 1
fi
