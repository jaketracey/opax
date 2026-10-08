#!/usr/bin/env bash
# scripts/weekly_refresh.sh -- the periodic groups: the sources the nightly does not touch, and the static
# JSON exports built from them. Run by scripts/vm/nightly.sh after daily_refresh.sh on the nights it selects:
#
#   weekly    every Sunday (Sydney)           loaders for registers that change weekly, then their exports
#   monthly   the first Sunday of the month   big shards, slow crawls, the exports that rewrite hundreds of files
#
#   scripts/weekly_refresh.sh weekly            # one group
#   scripts/weekly_refresh.sh weekly monthly    # both, in that order
#   OPAX_ONLY=fits,x_fits scripts/weekly_refresh.sh weekly     # debugging: only these steps
#
# The contract for what each step is, its runtime and its hosts is docs/operations/periodic-refresh.md; the
# ranking behind the cadences is the inventory it cites. Everything here is fail-soft in the same way as
# daily_refresh.sh: a step that fails is logged (FAIL) and the rest still run; the exit status is 1 if any step
# that is not in OPAX_ALLOW_FAIL failed. An exit status of 3 from a loader step means "the source refused to
# shrink our register": the rows on disk are the last good ones (see periodic-refresh.md section 6); that is
# logged STALE, listed on a "Stale weekly refresh:" line, and is not a failure.
#
# The registers that used to be replaced wholesale (DELETE the source, INSERT what came back) are loaded into
# a scratch file under $PIPE/stage and reconciled into parli.db by scripts/ext_apply.py, which refuses an empty or
# shrunken load, keeps row ids and reviewed labels, and archives what it replaced. The exports write to a temp file
# and scripts/vm/keep_if_unchanged.py installs it only when it differs from HEAD by more than its timestamps, so a
# night on which nothing moved commits nothing. The nightly then validates and, if need be, reverts group by group.
#
#   log      ~/.cache/autoresearch/pipeline/weekly.log      (one line per step)
#   details  ~/.cache/autoresearch/pipeline/<step>.log
#   lock     ~/.cache/autoresearch/pipeline/weekly_refresh.lock
#
# Tunables (env): OPAX_STEP_TIMEOUT (per step, default 3h), OPAX_ONLY, OPAX_ALLOW_FAIL, OPAX_SYNC_KB=1 (the KB
# patch drain only; every other step here writes parli.db and the working tree, never the knowledge box).

set -u
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

REPO="${OPAX_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PIPE="$HOME/.cache/autoresearch/pipeline"
DB="$HOME/.cache/autoresearch/parli.db"
LOG="$PIPE/weekly.log"
LOCK="$PIPE/weekly_refresh.lock"
PY="$REPO/.venv/bin/python"
STEP_TIMEOUT="${OPAX_STEP_TIMEOUT:-3h}"
ONLY="${OPAX_ONLY:-}"
ALLOW_FAIL=",${OPAX_ALLOW_FAIL:-},"
# exit 3 from these means the source refused to change the register (empty or shrunken upstream; for ipea, a
# quarter whose data.gov.au licence changed): the last good rows are kept, so it is reported as stale, not failed
# (periodic-refresh.md, exit codes)
STALE_OK=",frl_instruments,x_instruments,donations_qld,donations_vic,donations_tas,donations_apply,lobbyists_fetch,lobbyists_apply,fits_fetch,fits_apply,rosters_fetch,qld_contracts,ipea,x_people,"

# log, count, run_step, FAILED_STEPS, STEP_DELTA (shared with daily_refresh.sh)
. "$REPO/scripts/lib/refresh_lib.sh"

cd "$REPO" || { log "FATAL: cannot cd $REPO"; exit 1; }
[ -x "$PY" ] || { log "FATAL: $PY missing (run: uv sync)"; exit 1; }
export OPAX_DB="$DB" PYTHONPATH="$REPO${PYTHONPATH:+:$PYTHONPATH}" PY

want_weekly=0; want_monthly=0
for g in "$@"; do
  case "$g" in
    weekly) want_weekly=1 ;;
    monthly) want_monthly=1 ;;
    *) echo "usage: $0 weekly|monthly ..." >&2; exit 64 ;;
  esac
done
[ $((want_weekly + want_monthly)) -gt 0 ] || { echo "usage: $0 weekly|monthly ..." >&2; exit 64; }

if [ "${OPAX_SYNC_KB:-0}" = "1" ] && [ -e "$HOME/.cache/autoresearch/MIGRATED_TO_VM" ] \
   && [ "${OPAX_FORCE_KB_SYNC:-0}" != "1" ]; then
  log "REFUSING to run with OPAX_SYNC_KB=1: $HOME/.cache/autoresearch/MIGRATED_TO_VM exists (see daily_refresh.sh)"
  exit 3
fi

exec 9>"$LOCK"
if ! flock -n 9; then
  log "another weekly refresh is still running (lock $LOCK held); exiting"
  exit 0
fi
if [ -f .env ]; then set -a; . ./.env; set +a; fi

STAGE="$PIPE/stage/weekly"; TMP="$PIPE/tmp"
rm -rf "$STAGE" "$TMP"; mkdir -p "$STAGE" "$TMP"
EXPORT="scripts/vm/export_step.sh"
YEAR=$(TZ=Australia/Sydney date +%Y)

log "===== weekly refresh start (groups: $*; timeout/step=$STEP_TIMEOUT, host=$(hostname)) ====="

if [ "$want_weekly" = 1 ]; then
  # --- loaders ------------------------------------------------------------------------------------------
  # Metadata-only FRL group. Persistent local checkpoint survives weekly scratch cleanup.
  # This wiring is held on web/frl-instruments until the orchestrator merges it.
  if run_step frl_instruments "" "$PY" -m parli.ingest.frl_instruments; then
    run_step x_instruments "" "$EXPORT" dir portal/public/instruments -- \
      "$PY" scripts/export_instruments.py
  else
    log "[x_instruments] SKIP: FRL acquisition held; last good export kept"
  fi
  # Federal Register of Legislation Acts (INSERT OR REPLACE on act_id; feeds "became law" on the bill pages)
  run_step frl_acts "SELECT COUNT(*) FROM ext_frl_acts" \
    "$PY" -m parli.ingest.words_parlinfo --db "$DB" frl-acts

  # State political donations QLD / VIC / TAS: staged, reconciled, then labelled
  mkdir -p "$STAGE/donations"
  run_step donations_qld "" "$PY" -m parli.ingest.money_state_donations --source qld --db "$STAGE/donations/qld.sqlite"
  run_step donations_vic "" "$PY" -m parli.ingest.money_state_donations --source vic --db "$STAGE/donations/vic.sqlite"
  run_step donations_tas "" "$PY" -m parli.ingest.money_small_jurisdictions --source tas --db "$STAGE/donations/tas.sqlite"
  run_step donations_apply "SELECT COUNT(*) FROM ext_donations" \
    "$PY" scripts/ext_apply.py donations --stage-dir "$STAGE/donations" --db "$DB"
  run_step donations_classify "" "$PY" -m parli.ingest.money_classify --db "$DB"

  # Lobbyist registers (six jurisdictions, four tables that move together)
  if run_step lobbyists_fetch "" "$PY" -m parli.ingest.money_lobbyists --db "$STAGE/lobbyists.sqlite"; then
    run_step lobbyists_apply "SELECT COUNT(*) FROM ext_lobbyist_clients" \
      "$PY" scripts/ext_apply.py lobbyists --stage "$STAGE/lobbyists.sqlite" --db "$DB"
  else
    log "[lobbyists_apply] SKIP: the fetch failed, nothing to apply"
  fi

  # Foreign Influence Transparency Scheme
  if run_step fits_fetch "" "$PY" -m parli.ingest.fits_register --db "$STAGE/fits.sqlite"; then
    run_step fits_apply "SELECT COUNT(*) FROM ext_fits_activities" \
      "$PY" scripts/ext_apply.py fits --stage "$STAGE/fits.sqlite" --db "$DB"
  else
    log "[fits_apply] SKIP: the fetch failed, nothing to apply"
  fi

  # Federal interests and their export run daily; the QLD register is republished weekly.
  run_step interests_qld "SELECT COUNT(*) FROM ext_interests" \
    "$PY" -m parli.ingest.conduct_interests_qld --fetch --db "$DB"
  run_step diaries_nsw "SELECT COUNT(*) FROM ext_ministerial_meetings" \
    "$PY" -m parli.ingest.money_diaries --jurisdiction nsw --years "$YEAR" --new-only --db "$DB"
  # needs the ABR index (abr/abr_names.sqlite, transferred once; see docs/operations/nightly-refresh.md)
  run_step contract_suppliers "SELECT COUNT(*) FROM ext_contract_suppliers" \
    "$PY" -m parli.ingest.contract_suppliers --db "$DB" --abr-dir "$HOME/.cache/autoresearch/abr"
  # ACNC charity register + AIS + ATO tax transparency: reloads only the datasets CKAN says are newer
  run_step acnc_ato "SELECT COUNT(*) FROM ext_acnc_charities" \
    "$PY" -m parli.ingest.acnc_ato --check-updated

  # --- exports, in dependency order (later ones read earlier outputs) -------------------------------------------
  run_step x_speakers "" "$EXPORT" json portal/public/speakers.json "$PY" scripts/export_speakers.py
  # the directory plus the recorded representation the portal needs (scripts/vm/export_people.sh says why)
  run_step x_people "" "$EXPORT" json portal/public/parliamentarians.json bash scripts/vm/export_people.sh
  # exit 3: the export would take a sitting member's id or seat, change >25 rows' identity or drop rows, so the
  # shipped roster is kept (STALE_OK); say why, for the nightly status (docs/PHOTOS.md, "Nightly safety net")
  held=$(grep -m1 '^ROSTER HELD:' "$PIPE/x_people.log" 2>/dev/null || true)
  [ -z "$held" ] || log "Roster held: ${held#ROSTER HELD: }"
  run_step x_money "" "$EXPORT" json portal/public/graph/money.json "$PY" scripts/export_money_graph.py
  for j in qld vic tas; do
    run_step "x_money_$j" "" "$EXPORT" json "portal/public/graph/money.$j.json" "$PY" scripts/export_state_money.py "$j"
  done
  run_step x_access "" "$EXPORT" json portal/public/access.json \
    "$PY" scripts/export_access.py portal/public/graph/money.json portal/public/speakers.json
  run_step x_fits "" "$EXPORT" file portal/public/fits.json "$TMP/fits.json" \
    "$PY" scripts/export_fits.py --portal portal/public --out "$TMP/fits.json"
  run_step x_interests "" "$EXPORT" dir portal/public/interests -- \
    "$PY" scripts/export_interests.py --out portal/public/interests
fi

if [ "$want_monthly" = 1 ]; then
  # --- loaders ------------------------------------------------------------------------------------------
  run_step qld_contracts "SELECT COUNT(*) FROM ext_state_contracts" \
    "$PY" -m parli.ingest.qld_contracts --db "$DB"
  run_step diaries_qld "SELECT COUNT(*) FROM ext_ministerial_meetings" \
    "$PY" -m parli.ingest.money_diaries --jurisdiction qld --db "$DB"
  # IPEA quarterly expenses (a new quarter is due mid Feb/May/Aug/Nov; an empty quarter is skipped)
  run_step ipea "SELECT COUNT(*) FROM ext_expenses" \
    "$PY" -m parli.ingest.money_ipea --since "${YEAR}q01" --db "$DB"
  # State rosters (Wikidata), surname-only stubs named from them, then the KB patches that queues
  run_step rosters_fetch "SELECT COUNT(*) FROM ext_state_roster" \
    "$PY" -m parli.ingest.state_rosters fetch --db "$DB"
  run_step rosters_resolve "" "$PY" -m parli.ingest.state_rosters resolve --db "$DB"
  run_step speaker_hygiene "" "$PY" -m parli.ingest.speaker_hygiene --db "$DB"
  if [ "${OPAX_SYNC_KB:-0}" = "1" ]; then
    run_step kb_patch_drain "" timeout 45m "$PY" scripts/arag_patch_speakers.py --env .env --db "$DB"
  fi
  run_step grant_recipients "SELECT COUNT(*) FROM ext_grant_recipients" \
    "$PY" -m parli.ingest.grant_recipients --db "$DB" --abr-dir "$HOME/.cache/autoresearch/abr"

  # --- exports ---------------------------------------------------------------------------------------------------
  run_step x_expenses "" "$EXPORT" json portal/public/expenses.json "$PY" scripts/export_expenses.py
  run_step x_suppliers "" "$EXPORT" dir portal/public/suppliers portal/public/agencies \
      portal/public/suppliers.json portal/public/agencies.json -- \
    "$PY" scripts/export_suppliers.py --db "$DB" --published-since 2025-07-08 --output portal/public
  run_step x_grants "" "$EXPORT" dir portal/public/grants/federal portal/public/graph/grants.federal.json -- \
    "$PY" scripts/export_grants.py federal --local
  run_step x_discovery "" "$EXPORT" file portal/public/discovery.json "$TMP/discovery.json" \
    "$PY" scripts/export_discovery.py --db "$DB" --output "$TMP/discovery.json"
  run_step x_pay "" "$EXPORT" file portal/public/pay.json "$TMP/pay.json" \
    "$PY" scripts/build_pay.py --refresh --out "$TMP/pay.json"
fi

# The tax/charity block reads the current suppliers, grants and money exports (docs/DATA-TAX-CHARITY.md section 6),
# so it goes last, after whichever of the two groups ran; its output is deterministic, so no change = no diff.
run_step x_taxcharity "" "$EXPORT" dir portal/public/entities/tax-charity -- \
  "$PY" scripts/export_tax_charity.py --db "$DB" --portal portal/public

log "===== weekly refresh end ====="
[ "${#STALE_STEPS[@]}" -eq 0 ] || log "Stale weekly refresh: source refused to change the register: ${STALE_STEPS[*]}"
if [ "${#FAILED_STEPS[@]}" -gt 0 ]; then
  log "Incomplete weekly refresh: failed steps ${FAILED_STEPS[*]}"
  exit 1
fi
