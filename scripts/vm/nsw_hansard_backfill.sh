# Bounded NSW repair, after normal refresh. One cap unit is one chamber day.
# Downloads and source turns checkpoint in OPAX_DB; no KB/D1 calls here.
# shellcheck shell=bash
nsw_hansard_backfill() {
  if [ "${OPAX_BACKFILL_NSW:-1}" != 1 ] || [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ] || [ "${OPAX_NIGHTLY_SKIP_DAILY:-0}" = 1 ]; then
    log "NSW Hansard repair skipped"
    return 0
  fi
  local rc remaining
  log "NSW Hansard repair: cap=${OPAX_BACKFILL_NSW_CAP:-4} chamber days; budget=${OPAX_BACKFILL_NSW_BUDGET_S:-1200}s"
  if OPAX_DB="${OPAX_DB:-$HOME/.cache/autoresearch/parli.db}" \
    OPAX_BACKFILL_NSW_CAP="${OPAX_BACKFILL_NSW_CAP:-4}" \
    OPAX_BACKFILL_NSW_BUDGET_S="${OPAX_BACKFILL_NSW_BUDGET_S:-1200}" \
    OPAX_SOURCE_NAME=nsw_hansard \
    run nice -n 10 "$PY" -m parli.ingest.nsw_hansard --backfill-missing-days \
      --coverage-json "$REPO/portal/public/nsw-hansard-coverage.json" \
      --receipt-json "$PIPE/nsw-hansard-backfill.json"; then
    rc=0
  else
    rc=$?
  fi
  case "$rc" in
    0)
      log "NSW Hansard repair checkpointed; days done and left in $PIPE/nsw-hansard-backfill.json"
      remaining=$("$PY" -c 'import json,sys; r=json.load(open(sys.argv[1])); print(r["missing_left"])' "$PIPE/nsw-hansard-backfill.json") || {
        fail "NSW Hansard repair receipt unreadable"
        return 0
      }
      if [ "$remaining" != 0 ]; then
        warn "NSW coverage guard: $remaining chamber sitting days missing; known, being filled"
      fi
      ;;
    4) warn "NSW Hansard API refused; repair stopped and previous data kept" ;;
    *) fail "NSW Hansard repair failed (rc=$rc); inspect $PIPE/nsw-hansard-backfill.json" ;;
  esac
  return 0
}
