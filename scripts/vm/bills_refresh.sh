# scripts/vm/bills_refresh.sh -- sourced by nightly.sh; no standalone publishing.
# Uses nightly's PY, PIPE, run/log/fail/revert. All writes own only the bills group.
# Catch-up state is outside git; sync_repo must not resurrect a consumed marker.
# shellcheck shell=bash

BILLS_REFRESH_OK=0
BILLS_SUMMARY=""
BILLS_PENDING="$PIPE/bills-refresh-v1.pending"
BILLS_INITIALIZED="$PIPE/bills-refresh-v1.initialized"
BILLS_HELD_REPORT="$PIPE/bills-held.json"

bills_apply_guard() {
  run "$PY" scripts/vm/bills_guard.py --apply-holds --held-report "$BILLS_HELD_REPORT" || return 1
  local held
  held=$("$PY" -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$BILLS_HELD_REPORT") || return 1
  [ "$held" = 0 ] || warn "bills: $held regressed bill(s) kept at HEAD; see held bill reasons in the nightly log"
}

bills_refresh() {
  if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ]; then
    log "bills acquisition skipped (publish-only run); catch-up retained"
    return 0
  fi
  if [ ! -f "$BILLS_INITIALIZED" ]; then
    touch "$BILLS_PENDING" && touch "$BILLS_INITIALIZED" || {
      fail "cannot initialize bills catch-up marker"; return 1;
    }
  fi
  local reason day catch_up=()
  day=${OPAX_TODAY:-$(TZ=Australia/Sydney date +%F)}
  [ ! -f "$BILLS_PENDING" ] || catch_up=(--catch-up)
  reason=$("$PY" scripts/vm/bills_guard.py --date "$day" ${catch_up[@]+"${catch_up[@]}"}) || {
    fail "cannot select bills refresh cadence"; return 1;
  }
  if [ "$reason" = skip ]; then
    log "bills acquisition skipped on $day: yesterday was not a sitting day; weekly on Sunday"
    return 0
  fi
  log "bills full refresh ($reason, parliament ${OPAX_BILL_PARLIAMENT:-48}); KB sync off; budget ${OPAX_BILLS_TIMEOUT:-20m}"
  # bills_fetch has a fixed home-directory DB path; pin the export to that same DB.
  # Override inherited KB sync even though daily/periodic refresh enables it.
  if ! OPAX_SYNC_KB=0 OPAX_DB="$HOME/.cache/autoresearch/parli.db" OPAX_PYTHON="$PY" \
      run timeout --kill-after=60 "${OPAX_BILLS_TIMEOUT:-20m}" bash scripts/refresh_bills.sh; then
    fail "bills fetch/full export failed or timed out; bills reverted to HEAD"
    revert portal/public/bills
    return 1
  fi
  if ! bills_apply_guard; then
    fail "bill publication guard refused full export; bills reverted to HEAD"
    revert portal/public/bills
    return 1
  fi
  BILLS_REFRESH_OK=1
}

bills_fill_and_verify() {
  log "filling bill speech briefs from the knowledge box"
  if ! run "$PY" scripts/export_bills.py --fill-briefs portal/public/bills; then
    log "WARN: fill-briefs exited non-zero; the verification below decides whether the bills are usable"
  fi
  if ! run "$PY" scripts/verify_bill_briefs.py; then
    fail "bill briefs lost between HEAD and the new export; bills reverted to HEAD and not published tonight"
    revert portal/public/bills
    return 1
  fi
  if ! bills_apply_guard; then
    fail "bill guard failed after fill-briefs; bills reverted to HEAD"
    revert portal/public/bills
    return 1
  fi
  if ! run "$PY" scripts/vm/keep_if_unchanged.py --sweep portal/public/bills; then
    fail "bills keep-if-unchanged failed; bills reverted to HEAD"
    revert portal/public/bills
    return 1
  fi
}

bills_summary() {
  # Calculate after validation/test rollbacks so the commit describes retained data.
  BILLS_SUMMARY=$("$PY" scripts/vm/bills_guard.py) || {
    fail "final bill guard failed; bills reverted to HEAD"
    revert portal/public/bills
    BILLS_SUMMARY=$("$PY" scripts/vm/bills_guard.py) || return 1
  }
  log "$BILLS_SUMMARY"
  RESULT_SUMMARY="${RESULT_SUMMARY:+$RESULT_SUMMARY; }$BILLS_SUMMARY"
}

bills_refresh_complete() {
  # Called only after commit succeeds (or no commit is needed). Reverting bills
  # clears BILLS_REFRESH_OK; a failed gate/commit/interrupted run retries catch-up.
  if [ "$BILLS_REFRESH_OK" = 1 ] && [ -f "$BILLS_PENDING" ]; then
    if rm -f "$BILLS_PENDING"; then
      log "bills catch-up complete; pending marker deleted"
    else
      fail "cannot remove bills catch-up marker; catch-up will retry"
    fi
  fi
}
