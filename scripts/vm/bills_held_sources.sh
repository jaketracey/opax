# scripts/vm/bills_held_sources.sh -- sourced by nightly.sh; no standalone publishing.
# Bill progress from the sources the nightly already holds, while ParlInfo is paused:
#   bills_frl_recent     one request to the Federal Register of Legislation near the 03:15 boot
#                        (the newest 100 Act titles into ext_frl_acts), policy in
#                        parli/ingest/source_policy.json (frl_acts);
#   bills_held_sources   the field-only overlay scripts/bills_held_sources.py on the retained bills:
#                        Royal Assent by exact originatingBillUri, Hansard readings by exact bill id,
#                        exact division links. Information only, under the bills guard; any failure
#                        puts the bills back to HEAD, the way a bad bills export is reverted.
# Uses nightly's PY, PIPE, run/log/warn/fail/revert and bills_refresh.sh's bills_apply_guard.
# shellcheck shell=bash

BILLS_FRL_STATUS="$PIPE/source-access/frl-acts-recent.json"
BILLS_HELD_SUMMARY="$PIPE/bills-held-sources.json"
BILLS_HELD_REVIEW="$PIPE/bills-held-review.json"

bills_frl_recent() {
  if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ]; then
    log "FRL recent Acts skipped (publish-only run)"
    return 0
  fi
  local rc=0
  # One attempt, no retry: a throttle, error, busy hours (exit 3) or refusal (exit 4) skips the night.
  OPAX_SOURCE_NAME=frl_acts_recent OPAX_SOURCE_STATUS_FILE="$BILLS_FRL_STATUS" \
    run timeout --kill-after=30 "${OPAX_FRL_RECENT_TIMEOUT:-3m}" \
      "$PY" -m parli.ingest.words_parlinfo --db "$HOME/.cache/autoresearch/parli.db" frl-acts-recent || rc=$?
  case $rc in
    0) rm -f "$BILLS_FRL_STATUS"; log "FRL recent Acts: one request answered" ;;
    3) warn "FRL recent Acts held tonight (throttled, refused politely or outside the quiet window); no retry; stored Acts kept" ;;
    4) warn "FRL recent Acts PAUSED: the register refused the honest agent; stored Acts kept; one request again next night" ;;
    *) warn "FRL recent Acts request failed (rc=$rc); no retry tonight; stored Acts kept" ;;
  esac
  return 0
}

bills_held_sources() {
  rm -f "$BILLS_HELD_SUMMARY"
  if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ]; then
    log "bills held sources skipped (publish-only run)"
    return 0
  fi
  log "bills held sources: Royal Assent (FRL), Hansard readings (OpenAustralia XML) and exact division links on the retained bills"
  if ! OPAX_DB="$HOME/.cache/autoresearch/parli.db" run "$PY" scripts/bills_held_sources.py \
      --oa-stage "${OPAX_OA_STAGE:-$HOME/.cache/autoresearch/oa-feed}" \
      --today "${TODAY:-$(TZ=Australia/Sydney date +%F)}" \
      --review-out "$BILLS_HELD_REVIEW" --summary-out "$BILLS_HELD_SUMMARY"; then
    rm -f "$BILLS_HELD_SUMMARY"
    fail "bills held-sources overlay failed; bills reverted to HEAD"
    revert portal/public/bills
    return 1
  fi
  if ! bills_apply_guard; then
    rm -f "$BILLS_HELD_SUMMARY"
    fail "bill guard refused the held-sources overlay; bills reverted to HEAD"
    revert portal/public/bills
    return 1
  fi
  if ! run "$PY" scripts/vm/keep_if_unchanged.py --sweep portal/public/bills; then
    rm -f "$BILLS_HELD_SUMMARY"
    fail "bills keep-if-unchanged failed after the held-sources overlay; bills reverted to HEAD"
    revert portal/public/bills
    return 1
  fi
}
