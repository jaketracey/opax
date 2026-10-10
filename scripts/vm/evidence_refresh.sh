# scripts/vm/evidence_refresh.sh -- sourced by nightly.sh; no standalone publishing.
# Owns only static evidence. Source and four sidecars are read-only; no KB access.
# shellcheck shell=bash

EVIDENCE_REFRESH_OK=0
EVIDENCE_ATTEMPTED=0
EVIDENCE_COMMITTED=0
EVIDENCE_SUMMARY=""
EVIDENCE_WAITING=""
EVIDENCE_STAGE=""
EVIDENCE_PENDING="$PIPE/evidence-refresh-v1.pending"
EVIDENCE_INITIALIZED="$PIPE/evidence-refresh-v1.initialized"

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
  local day reason started rc readiness readiness_limit catch_up=() input_args=()
  day=${OPAX_TODAY:-$(TZ=Australia/Sydney date +%F)}
  [ ! -f "$EVIDENCE_PENDING" ] || catch_up=(--catch-up)
  reason=$("$PY" scripts/vm/evidence_guard.py --date "$day" ${catch_up[@]+"${catch_up[@]}"}) || {
    fail "cannot select evidence refresh cadence"; return 1;
  }
  if [ "$reason" = skip ]; then
    log "evidence export skipped on $day: weekly on Sunday"
    return 0
  fi
  input_args=(
    --source "${OPAX_EVIDENCE_SOURCE:-$HOME/.cache/autoresearch/parli.db}"
    --evidence "${OPAX_EVIDENCE_LAYERS:-$HOME/.cache/autoresearch/evidence-layers-full.sqlite}"
    --places "${OPAX_EVIDENCE_PLACES:-$HOME/.cache/autoresearch/evidence-places.sqlite}"
    --decisions "${OPAX_EVIDENCE_DECISIONS:-$HOME/.cache/autoresearch/evidence-identity-decisions.sqlite}"
    --additional "${OPAX_EVIDENCE_ADDITIONAL:-$HOME/.cache/autoresearch/evidence-additional-mentions.sqlite}"
  )
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
  EVIDENCE_COMMITTED=1
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
