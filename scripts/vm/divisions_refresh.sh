# Sourced by nightly.sh. Acquisition is bounded and failures hold the exports.
# Catch-up state lives outside git, so sync_repo cannot resurrect it.
# shellcheck shell=bash
DIVISIONS_REFRESH_OK=0
DIVISIONS_ACQUISITION_FAILED=0
DIVISIONS_PENDING="$PIPE/divisions-refresh-v1.pending"
DIVISIONS_INITIALIZED="$PIPE/divisions-refresh-v1.initialized"

divisions_revert() {
  revert portal/public/votes.json portal/public/divisions portal/public/seo/recent-votes.json
  divisions_restore_dependencies
}

divisions_refresh() {
  if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ]; then
    log "federal divisions acquisition skipped (publish-only); catch-up retained"
    return 0
  fi
  if [ ! -f "$DIVISIONS_INITIALIZED" ]; then
    touch "$DIVISIONS_PENDING" && touch "$DIVISIONS_INITIALIZED" || {
      fail "cannot initialize divisions catch-up marker"; DIVISIONS_ACQUISITION_FAILED=1; divisions_revert; return 1;
    }
  fi
  local reason day since catch_up=()
  day=${OPAX_TODAY:-$(TZ=Australia/Sydney date +%F)}
  [ ! -f "$DIVISIONS_PENDING" ] || catch_up=(--catch-up)
  reason=$("$PY" scripts/vm/divisions_guard.py --date "$day" ${catch_up[@]+"${catch_up[@]}"}) &&
    since=$("$PY" scripts/vm/divisions_guard.py --since-date "$day" ${catch_up[@]+"${catch_up[@]}"}) || {
      fail "cannot select federal divisions cadence/window"; DIVISIONS_ACQUISITION_FAILED=1; divisions_revert; return 1;
    }
  if [ "$reason" = skip ]; then
    log "federal divisions acquisition skipped on $day; weekly Sunday or morning after a sitting day"
    return 0
  fi
  log "federal divisions refresh ($reason, since $since); KB sync off; budget ${OPAX_DIVISIONS_TIMEOUT:-20m}"
  if ! OPAX_SYNC_KB=0 OPAX_DB="$HOME/.cache/autoresearch/parli.db" OPAX_PYTHON="$PY" \
      run timeout --kill-after=60 "${OPAX_DIVISIONS_TIMEOUT:-20m}" bash scripts/refresh_divisions.sh "$since"; then
    fail "federal divisions acquisition/export failed or timed out; vote exports restored to HEAD"
    DIVISIONS_ACQUISITION_FAILED=1
    divisions_revert
    return 1
  fi
  DIVISIONS_REFRESH_OK=1
}

divisions_verify() {
  if ! run "$PY" scripts/vm/divisions_guard.py; then
    fail "division publication guard failed; vote exports restored to HEAD"
    divisions_revert
    return 1
  fi
  if ! run "$PY" scripts/vm/keep_if_unchanged.py --sweep \
      portal/public/votes.json portal/public/divisions portal/public/seo/recent-votes.json; then
    fail "divisions keep-if-unchanged failed; vote exports restored to HEAD"
    divisions_revert
    return 1
  fi
}

divisions_refresh_complete() {
  # Clear only after all three exports survive validation, portal gates and commit.
  if [ "$DIVISIONS_REFRESH_OK" = 1 ] && [ -f "$DIVISIONS_PENDING" ]; then
    if rm -f "$DIVISIONS_PENDING"; then
      log "federal divisions catch-up complete; pending marker deleted"
    else
      fail "cannot remove divisions catch-up marker; catch-up will retry"
    fi
  fi
}

divisions_restore_dependencies() {
  # Restore the published relationships as part of the division rollback.
  # Repeat after validation/gate decisions: bills may export after a failed
  # acquisition, and an innocent gate trial must restore its own backup first.
  if [ "${DIVISIONS_PAGES_ROLLED_BACK:-0}" = 1 ]; then
    revert portal/public/seo/recent-votes.json
    if ! run "$PY" scripts/vm/divisions_guard.py --restore-bill-links ||
        ! run "$PY" scripts/vm/keep_if_unchanged.py --sweep portal/public/bills; then
      fail "cannot restore bill division relationships; bills restored to HEAD"
      revert portal/public/bills
    fi
    log "SEO recent votes restored: published divisions were rolled back"
  fi
}

divisions_summary() {
  divisions_restore_dependencies
  local summary
  summary=$("$PY" scripts/vm/divisions_guard.py) || {
    fail "final division guard failed; vote exports restored to HEAD"
    divisions_revert
    summary=$("$PY" scripts/vm/divisions_guard.py) || return 1
  }
  log "$summary"
  RESULT_SUMMARY="${RESULT_SUMMARY:+$RESULT_SUMMARY; }$summary"
}
