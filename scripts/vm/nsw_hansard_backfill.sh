# Bounded NSW repair, after normal refresh. Both spend switches default off.
# Repair warnings must never enter FAILURES or leave periodic acquisition owed.
# shellcheck shell=bash
nsw_hansard_backfill() {
  if [ "${OPAX_BACKFILL_NSW:-0}" != 1 ] || [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ] || [ "${OPAX_NIGHTLY_SKIP_DAILY:-0}" = 1 ]; then
    log "NSW Hansard repair off; coverage holes retained, spend approval pending"
    return 0
  fi
  local rc remaining outer_s
  outer_s=$("$PY" -c 'import math,sys; n=float(sys.argv[1]); assert math.isfinite(n) and n>0; print(math.ceil(n)+60)' "${OPAX_BACKFILL_NSW_BUDGET_S:-1200}") || {
    warn "NSW Hansard repair budget invalid; stage deferred"
    return 0
  }
  log "NSW Hansard repair: cap=${OPAX_BACKFILL_NSW_CAP:-4}; budget=${OPAX_BACKFILL_NSW_BUDGET_S:-1200}s; outer=${outer_s}s plus 60s kill grace; publication=${OPAX_BACKFILL_NSW_PUBLISH:-0}"
  if OPAX_DB="${OPAX_DB:-$HOME/.cache/autoresearch/parli.db}" \
    OPAX_BACKFILL_NSW_CAP="${OPAX_BACKFILL_NSW_CAP:-4}" \
    OPAX_BACKFILL_NSW_BUDGET_S="${OPAX_BACKFILL_NSW_BUDGET_S:-1200}" \
    OPAX_SOURCE_NAME=nsw_hansard \
    run timeout --kill-after=60s "${outer_s}s" nice -n 10 "$PY" -m parli.ingest.nsw_hansard --backfill-missing-days \
      --coverage-json "$REPO/portal/public/nsw-hansard-coverage.json" \
      --receipt-json "$PIPE/nsw-hansard-backfill.json" \
      --publication-state "${OPAX_BACKFILL_NSW_SYNC_STATE:-$HOME/.cache/autoresearch/arag_sync_state.json}"; then
    rc=0
  else
    rc=$?
  fi
  case "$rc" in
    0)
      remaining=$("$PY" -c 'import json,sys; r=json.load(open(sys.argv[1])); print(r.get("incomplete_left",r["missing_left"]))' "$PIPE/nsw-hansard-backfill.json") || {
        warn "NSW Hansard repair receipt unreadable; periodic completion unaffected"
        return 0
      }
      log "NSW Hansard repair checkpointed; days and held/publication counts in $PIPE/nsw-hansard-backfill.json"
      if [ "$remaining" != 0 ]; then
        warn "NSW coverage guard: $remaining chamber sitting days incomplete"
      fi
      ;;
    4) warn "NSW Hansard API refused; repair stopped and previous data kept" ;;
    124|137) warn "NSW Hansard repair outer timeout (rc=$rc); retained checkpoints resume later" ;;
    *) warn "NSW Hansard repair failed (rc=$rc); periodic completion unaffected; inspect $PIPE/nsw-hansard-backfill.json" ;;
  esac
  return 0
}
