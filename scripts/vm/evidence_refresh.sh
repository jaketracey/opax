# scripts/vm/evidence_refresh.sh -- sourced by nightly.sh; no standalone publishing.
# Owns only static evidence. Source and four sidecars are read-only; no KB access.
# shellcheck shell=bash

EVIDENCE_REFRESH_OK=0
EVIDENCE_ATTEMPTED=0
EVIDENCE_COMMITTED=0
EVIDENCE_SUMMARY=""
EVIDENCE_WAITING=""
EVIDENCE_STAGE=""
EVIDENCE_BUNDLE_CANDIDATE=""
EVIDENCE_BUNDLE_ROOT="$PIPE/evidence-bundles"
EVIDENCE_BUNDLE_ACTIVE="$PIPE/evidence-bundle-active.json"
EVIDENCE_PENDING="$PIPE/evidence-refresh-v1.pending"
EVIDENCE_INITIALIZED="$PIPE/evidence-refresh-v1.initialized"

evidence_build_candidate() (
  # A separately invoked daily/weekly writer shares these locks. This subshell
  # releases both automatically before export from the frozen bundle starts.
  exec 6>"$PIPE/daily_refresh.lock" || exit 1
  exec 7>"$PIPE/weekly_refresh.lock" || exit 1
  if ! flock -n 6 || ! flock -n 7; then
    echo "evidence build deferred: daily or weekly source writer holds its lock" >&2
    exit 75
  fi
  "$PY" scripts/vm/evidence_bundle_state.py prepare --bundle-root "$EVIDENCE_BUNDLE_ROOT" \
    --pointer "$EVIDENCE_BUNDLE_ACTIVE" >&2 || exit $?
  timeout --kill-after=5s 15s "$PY" scripts/vm/evidence_bundle_state.py checkpoint \
    --source "${OPAX_DB:-${OPAX_EVIDENCE_SOURCE:-$HOME/.cache/autoresearch/parli.db}}" >&2 || exit $?
  OPAX_SYNC_KB=0 timeout --kill-after=60 "${OPAX_EVIDENCE_BUILD_TIMEOUT:-90m}" "$PY" \
    scripts/vm/build_evidence_bundle.py \
    --source "${OPAX_DB:-${OPAX_EVIDENCE_SOURCE:-$HOME/.cache/autoresearch/parli.db}}" \
    --bundle-root "$EVIDENCE_BUNDLE_ROOT"
)

evidence_refresh() {
  if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ] || [ "${OPAX_NIGHTLY_SKIP_PERIODIC:-0}" = 1 ]; then
    log "evidence export skipped; catch-up retained"
    return 0
  fi
  if [ ! -f "$EVIDENCE_INITIALIZED" ]; then
    touch "$EVIDENCE_PENDING" && touch "$EVIDENCE_INITIALIZED" || {
      fail "cannot initialize evidence catch-up marker"; return 1;
    }
  fi
  local day reason started rc readiness readiness_limit bundle_paths path catch_up=() input_args=() paths=()
  day=${OPAX_TODAY:-$(TZ=Australia/Sydney date +%F)}
  [ ! -f "$EVIDENCE_PENDING" ] || catch_up=(--catch-up)
  reason=$("$PY" scripts/vm/evidence_guard.py --date "$day" ${catch_up[@]+"${catch_up[@]}"}) || {
    fail "cannot select evidence refresh cadence"; return 1;
  }
  if [ "$reason" = skip ]; then
    log "evidence export skipped on $day: weekly on Sunday"
    return 0
  fi
  # Sunday failures must retry on the next night, just like first-run catch-up.
  touch "$EVIDENCE_PENDING" || { fail "cannot retain evidence catch-up marker"; return 1; }
  input_args=(
    --source "${OPAX_EVIDENCE_SOURCE:-$HOME/.cache/autoresearch/parli.db}"
    --evidence "${OPAX_EVIDENCE_LAYERS:-$HOME/.cache/autoresearch/evidence-layers-full.sqlite}"
    --places "${OPAX_EVIDENCE_PLACES:-$HOME/.cache/autoresearch/evidence-places.sqlite}"
    --decisions "${OPAX_EVIDENCE_DECISIONS:-$HOME/.cache/autoresearch/evidence-identity-decisions.sqlite}"
    --additional "${OPAX_EVIDENCE_ADDITIONAL:-$HOME/.cache/autoresearch/evidence-additional-mentions.sqlite}"
  )
  if [ "${OPAX_EVIDENCE_BUILD:-0}" = 1 ]; then
    EVIDENCE_BUNDLE_CANDIDATE=$(mktemp "$PIPE/evidence-candidate.XXXXXX") || {
      fail "cannot create evidence bundle candidate receipt"; return 1;
    }
    log "building a frozen evidence bundle ($reason); no KB; budget ${OPAX_EVIDENCE_BUILD_TIMEOUT:-90m}"
    # All nightly source writers have finished under the owner locks. Prepare
    # their committed WAL explicitly; a busy reader or a later writer defers the
    # build. The builder separately freezes/checks its own unchanged source.
    evidence_build_candidate >"$EVIDENCE_BUNDLE_CANDIDATE" 2>"$PIPE/evidence-build.log"
    rc=$?
    if [ "$rc" = 0 ]; then
      bundle_paths=$("$PY" scripts/vm/evidence_bundle_state.py arguments \
        --candidate "$EVIDENCE_BUNDLE_CANDIDATE" --bundle-root "$EVIDENCE_BUNDLE_ROOT" 2>>"$PIPE/evidence-build.log")
      rc=$?
    fi
    if [ "$rc" -ne 0 ]; then
      EVIDENCE_WAITING="evidence: bundle build unavailable (rc=$rc; see evidence-build.log)"
      warn "$EVIDENCE_WAITING; old public evidence and active bundle retained; catch-up retained"
      rm -f -- "$EVIDENCE_BUNDLE_CANDIDATE"; EVIDENCE_BUNDLE_CANDIDATE=""
      return 0
    fi
    while IFS= read -r path; do paths+=("$path"); done <<<"$bundle_paths"
    if [ "${#paths[@]}" != 5 ]; then
      fail "invalid evidence bundle input list; catch-up retained"; return 1
    fi
    input_args=(--source "${paths[0]}" --evidence "${paths[1]}" --places "${paths[2]}"
                --decisions "${paths[3]}" --additional "${paths[4]}")
  fi
  readiness_limit=${OPAX_EVIDENCE_READINESS_TIMEOUT:-60s}
  readiness=$(timeout --kill-after=5s "$readiness_limit" "$PY" scripts/vm/evidence_inputs.py "${input_args[@]}" 2>/dev/null)
  rc=$?
  case "$rc" in
    124|137) readiness="readiness probe timed out after $readiness_limit" ;;
  esac
  if [ "$rc" -ne 0 ] || [ "$readiness" != ready ]; then
    [ -n "$readiness" ] || readiness="readiness check unavailable"
    EVIDENCE_WAITING="evidence: waiting for inputs ($readiness)"
    warn "$EVIDENCE_WAITING; catch-up retained; export skipped"
    return 0
  fi
  EVIDENCE_ATTEMPTED=1
  EVIDENCE_STAGE=$(mktemp -d "$PIPE/evidence-stage.XXXXXX") || {
    fail "cannot create evidence staging directory"; revert_group evidence; return 1;
  }
  started=$SECONDS
  log "evidence export ($reason); SQLite inputs read-only, no KB; budget ${OPAX_EVIDENCE_TIMEOUT:-20m}"
  OPAX_SYNC_KB=0 run timeout --kill-after=60 "${OPAX_EVIDENCE_TIMEOUT:-20m}" "$PY" scripts/vm/evidence_guard.py \
    --refresh --stage "$EVIDENCE_STAGE/export" "${input_args[@]}"
  rc=$?
  rm -rf -- "$EVIDENCE_STAGE"
  EVIDENCE_STAGE=""
  log "evidence export and audit finished in $((SECONDS-started))s (rc=$rc)"
  if [ "$rc" -ne 0 ]; then
    fail "evidence export/audit/guard/install failed or timed out; evidence reverted to HEAD"
    revert_group evidence
    return 1
  fi
  EVIDENCE_REFRESH_OK=1
}

evidence_summary() {
  if [ -n "$EVIDENCE_WAITING" ]; then
    EVIDENCE_SUMMARY=$EVIDENCE_WAITING
    RESULT_SUMMARY="${RESULT_SUMMARY:+$RESULT_SUMMARY; }$EVIDENCE_SUMMARY"
    return 0
  fi
  EVIDENCE_SUMMARY="evidence: 0 changed shards, 0 records with text changed, 0 cleaned fields"
  if group_changed evidence; then
    EVIDENCE_SUMMARY=$("$PY" scripts/vm/evidence_guard.py) || {
      fail "final evidence guard failed; evidence reverted to HEAD"
      revert_group evidence
      EVIDENCE_SUMMARY="evidence: 0 changed shards, 0 records with text changed, 0 cleaned fields"
    }
  fi
  log "$EVIDENCE_SUMMARY"
  RESULT_SUMMARY="${RESULT_SUMMARY:+$RESULT_SUMMARY; }$EVIDENCE_SUMMARY"
}

evidence_refresh_complete() {
  # The caller confirms accepted data on origin/main before this boundary.
  if [ "${OPAX_NIGHTLY_NO_PUSH:-0}" = 1 ]; then
    log "evidence publication not confirmed (NO_PUSH); active bundle and catch-up retained"
    return 0
  fi
  EVIDENCE_COMMITTED=1
  if [ "$EVIDENCE_REFRESH_OK" = 1 ] && [ -n "$EVIDENCE_BUNDLE_CANDIDATE" ]; then
    local activation line
    if ! activation=$("$PY" scripts/vm/evidence_bundle_state.py activate --candidate "$EVIDENCE_BUNDLE_CANDIDATE" \
        --bundle-root "$EVIDENCE_BUNDLE_ROOT" --pointer "$EVIDENCE_BUNDLE_ACTIVE" --commit "$(git rev-parse HEAD)" 2>&1); then
      fail "cannot activate published evidence bundle; old pointer and catch-up retained"
      return 1
    fi
    while IFS= read -r line; do
      if [[ "$line" == "WARNING "* ]]; then warn "$line"; else log "$line"; fi
    done <<<"$activation"
    rm -f -- "$EVIDENCE_BUNDLE_CANDIDATE"; EVIDENCE_BUNDLE_CANDIDATE=""
    log "published evidence bundle activated"
  fi
  if [ "$EVIDENCE_REFRESH_OK" = 1 ] && [ -f "$EVIDENCE_PENDING" ]; then
    if rm -f "$EVIDENCE_PENDING"; then
      log "evidence catch-up complete; pending marker deleted"
    else
      fail "cannot remove evidence catch-up marker; catch-up will retry"
    fi
  fi
}

evidence_abort() {
  # Also called by finish after staging/commit failure or an interrupted run.
  [ -z "$EVIDENCE_STAGE" ] || rm -rf -- "$EVIDENCE_STAGE"
  EVIDENCE_STAGE=""
  [ -z "$EVIDENCE_BUNDLE_CANDIDATE" ] || rm -f -- "$EVIDENCE_BUNDLE_CANDIDATE"
  EVIDENCE_BUNDLE_CANDIDATE=""
  if [ "$EVIDENCE_ATTEMPTED" = 1 ] && [ "$EVIDENCE_COMMITTED" != 1 ]; then
    revert_group evidence
    local zero_summary="evidence: 0 changed shards, 0 records with text changed, 0 cleaned fields"
    if [ -n "$EVIDENCE_SUMMARY" ] && [ "$EVIDENCE_SUMMARY" != "$zero_summary" ]; then
      RESULT_SUMMARY=${RESULT_SUMMARY/"$EVIDENCE_SUMMARY"/"$zero_summary"}
      EVIDENCE_SUMMARY=$zero_summary
      log "$EVIDENCE_SUMMARY (uncommitted export restored)"
    fi
  fi
  EVIDENCE_ATTEMPTED=0
}
