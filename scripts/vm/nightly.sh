#!/usr/bin/env bash
# scripts/vm/nightly.sh -- the whole nightly OPAX refresh, unattended.
#
#   refresh  ->  bills briefs  ->  validate  ->  corpus manifest  ->  cache epoch
#            ->  commit data files  ->  push to main  ->  publish the run's status
#
# Runs on the refresh VM from systemd at boot (scripts/vm/run-nightly.sh, see
# scripts/vm/systemd/), and by hand:
#
#   scripts/vm/nightly.sh                          # the real thing
#   OPAX_NIGHTLY_NO_PUSH=1 scripts/vm/nightly.sh   # do everything but push and publish the status
#
# The deploy is not started from here: .github/workflows/deploy.yml runs on any push to main
# that changes portal/public/corpus.json, and every nightly commit does (the manifest's
# refresh.checked_at is stamped each night). Alerts are not sent from here either:
# .github/workflows/refresh-watchdog.yml reads the published corpus.json and the status this
# script publishes to the `nightly-status` branch, and fails (so GitHub emails) when the
# chain has not run, or the last run reported problems.
#
# Safe to run twice: it takes a lock, every fetch is incremental, the KB push resumes from
# its checkpoint, and a run that finds nothing to change (and a fresh checked_at stamp)
# commits nothing. A previous run's leftovers (an unpushed commit, half-written data files)
# are cleaned or rebased at the start.
#
# Credentials: git pushes over SSH with the machine's deploy key (~/.ssh/opax_deploy, mapped to
# github.com in ~/.ssh/config); there is no GitHub token on the machine. ~/opax/.env holds the
# KB, OpenAustralia and TVFY keys, read by the Python steps; ~/.config/opax/nightly.env may
# hold OPAX_* overrides and is sourced here. Nothing secret is ever printed or published.
#
# Failure policy: the data steps fail soft. A step that fails is recorded and the run carries
# on with whatever is still good (a bad bills export is reverted to HEAD while votes and the
# manifest still publish). At the end the script publishes {status, failures} to the
# nightly-status branch and exits 1 if anything failed. Only two things stop the run outright:
# the repo cannot be synced, or the refresh did not actually run.
#
# Tunables (env, or in nightly.env):
#   OPAX_REPO             checkout (default: the one this script lives in)
#   OPAX_BRANCH           branch to publish to (default main)
#   OPAX_STATUS_BRANCH    branch the run status is force-pushed to (default nightly-status)
#   OPAX_ALLOW_FAIL       refresh steps allowed to fail (default sa)
#   OPAX_SYNC_GATE        steps that must pass before the KB push (default link_speakers,classify)
#   OPAX_DAILY_REFRESH    refresh script (default scripts/daily_refresh.sh)
#   OPAX_SETTLE_SECONDS   wait for KB counters to stop moving before reading them (default 60)
#   OPAX_STAMP_AFTER_HOURS  refresh corpus.json's checked_at when older than this (default 12)
#   OPAX_MIN_FREE_GB      refuse to start with less free disk than this (default 5)
#   OPAX_PUSH_SLEEP_UNIT  seconds multiplied by the attempt number between push retries (default 5)
#   OPAX_NIGHTLY_NO_PUSH  1 = commit locally only: no push, no status publication
#   OPAX_NIGHTLY_SKIP_REFRESH  1 = skip daily_refresh.sh (rerun the publish half only)
#   OPAX_BOT_NAME / OPAX_BOT_EMAIL   commit identity

set -uo pipefail

REPO="${OPAX_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${OPAX_NIGHTLY_ENV:-$HOME/.config/opax/nightly.env}"
# nightly.env may set any OPAX_* override below, so it is read first
# shellcheck source=/dev/null
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
BRANCH="${OPAX_BRANCH:-main}"
STATUS_BRANCH="${OPAX_STATUS_BRANCH:-nightly-status}"
PIPE="$HOME/.cache/autoresearch/pipeline"
TODAY=$(TZ=Australia/Sydney date +%F)
STARTED_AT=$(date -u +%FT%TZ)
LOGFILE="$PIPE/nightly-$TODAY.log"
LASTFILE="$PIPE/nightly-last.json"
LOCKFILE="$PIPE/nightly.lock"
DAILY_LOG="$PIPE/daily.log"
DATA_PATHS=(portal/public/bills portal/public/votes.json portal/public/corpus.json portal/wrangler.jsonc)
MIN_FREE_GB="${OPAX_MIN_FREE_GB:-5}"

mkdir -p "$PIPE"
MARK="$PIPE/.nightly-start.$$"
touch "$MARK"
ts() { date '+%F %T'; }
log() { echo "$(ts) [nightly] $*" | tee -a "$LOGFILE"; }
# run a command, mirror its output into the nightly log, keep its exit status
run() { "$@" 2>&1 | tee -a "$LOGFILE"; return "${PIPESTATUS[0]}"; }

FAILURES=()
COMMIT_SHA=""
DEPLOY="not pushed"
RESULT_SUMMARY=""
fail() { FAILURES+=("$*"); log "FAIL: $*"; }

# ---- lock ------------------------------------------------------------------------
exec 8>"$LOCKFILE"
if ! flock -n 8; then
  echo "$(ts) [nightly] another nightly run holds $LOCKFILE; exiting" | tee -a "$LOGFILE"
  exit 0
fi

log "===== nightly start $TODAY (repo=$REPO pid=$$) ====="

# ---- environment -------------------------------------------------------------------
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export GIT_AUTHOR_NAME="${OPAX_BOT_NAME:-OPAX nightly}" GIT_COMMITTER_NAME="${OPAX_BOT_NAME:-OPAX nightly}"
export GIT_AUTHOR_EMAIL="${OPAX_BOT_EMAIL:-opax-nightly@users.noreply.github.com}"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
export GIT_TERMINAL_PROMPT=0
PY="$REPO/.venv/bin/python"
cd "$REPO" || { fail "cannot cd $REPO"; exit 1; }

# Fetching works over HTTPS (the repository is public); pushing goes over SSH with the deploy
# key. BatchMode makes a missing or refused key fail at once instead of waiting for a prompt,
# and every network git call has a time limit so a stalled connection cannot eat the night.
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=20}"
gitn() { timeout "${OPAX_GIT_TIMEOUT:-300}" git "$@"; }

# Publish the run's outcome where the freshness watchdog can read it without any credential:
# a single parentless commit, force-pushed to the status branch, so main's history gets no
# nightly noise and the branch never grows. Only short messages this script wrote go in it.
publish_status() {
  [ "${OPAX_NIGHTLY_NO_PUSH:-0}" = 1 ] && return 0
  [ -s "$LASTFILE" ] || return 0
  local blob tree commit
  blob=$(git hash-object -w "$LASTFILE") || return 0
  tree=$(printf '100644 blob %s\tstatus.json\n' "$blob" | git mktree) || return 0
  commit=$(git commit-tree "$tree" -m "nightly status $TODAY") || return 0
  if gitn push -q -f origin "$commit:refs/heads/$STATUS_BRANCH" >>"$LOGFILE" 2>&1; then
    log "published status to origin/$STATUS_BRANCH"
  else
    log "WARN: could not publish the status to origin/$STATUS_BRANCH"
  fi
}

write_status() {
  local status=$1
  "$PY" - "$LASTFILE" "$status" "$TODAY" "$STARTED_AT" "$COMMIT_SHA" "$DEPLOY" "$RESULT_SUMMARY" "${FAILURES[@]+"${FAILURES[@]}"}" <<'PYEOF' 2>/dev/null || true
import json, sys, datetime
path, status, day, started, sha, deploy, summary, *failures = sys.argv[1:]
json.dump({"date": day, "status": status, "started": started,
           "finished": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "commit": sha or None, "deploy": deploy, "summary": summary, "failures": failures},
          open(path, "w"), indent=1)
PYEOF
}

finish() {
  rm -f "$MARK"
  local rc=0
  if [ "${#FAILURES[@]}" -gt 0 ]; then
    rc=1
    log "===== nightly end: FAILED (${#FAILURES[@]} problem(s)) ====="
    write_status failed
    publish_status
  else
    log "===== nightly end: OK ${RESULT_SUMMARY:+($RESULT_SUMMARY)} ====="
    write_status ok
    publish_status
  fi
  exit "$rc"
}
trap 'if [ "$?" -ne 0 ] && [ "${#FAILURES[@]}" -eq 0 ]; then fail "nightly.sh died unexpectedly (see the log)"; finish; fi' EXIT

# ---- preflight -------------------------------------------------------------------------
[ -x "$PY" ] || { fail "$PY missing: run scripts/vm/bootstrap.sh"; finish; }
[ -f "$REPO/.env" ] || { fail "$REPO/.env missing (ARAG_*, TVFY_API_KEY, OPENAUSTRALIA_API_KEY)"; finish; }
[ -f "$HOME/.cache/autoresearch/parli.db" ] || { fail "parli.db missing: the database was not transferred (see docs/operations/nightly-refresh.md)"; finish; }
[ -f "$HOME/.cache/autoresearch/arag_sync_state.json" ] || { fail "arag_sync_state.json missing: the KB push checkpoint was not transferred"; finish; }
# parli.db.get_db() switches to PostgreSQL when DATABASE_URL is set; the pipeline is SQLite-only
if [ -n "${DATABASE_URL:-}" ] || grep -Eq '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' "$REPO/.env" "$ENV_FILE" 2>/dev/null; then
  fail "DATABASE_URL is set (in the environment, .env or nightly.env): the refresh would talk to Postgres instead of parli.db. Remove it."; finish
fi
find "$PIPE" -maxdepth 1 -name 'nightly-20*.log' -mtime +90 -delete 2>/dev/null || true
avail_gb=$(df -Pk "$HOME/.cache" | awk 'NR==2 {print int($4/1024/1024)}')
if [ "${avail_gb:-0}" -lt "$MIN_FREE_GB" ]; then fail "only ${avail_gb:-0}GB free on the data disk (need ${MIN_FREE_GB}GB for the WAL and caches; the disk is small: see the runbook)"; finish; fi

# ---- 1. sync the checkout ---------------------------------------------------------------
sync_repo() {
  gitn fetch --quiet origin "$BRANCH" || return 1
  git checkout -q "$BRANCH" 2>/dev/null || git checkout -q -B "$BRANCH" "origin/$BRANCH" || return 1
  # leftovers of a run that died half way: only the data paths are ever touched by the nightly
  git checkout -q HEAD -- "${DATA_PATHS[@]}" || return 1
  git clean -fdq -- portal/public/bills
  if git merge-base --is-ancestor "origin/$BRANCH" HEAD; then
    return 0                                   # up to date, or ahead by an unpushed nightly commit
  elif git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
    git merge --ff-only -q "origin/$BRANCH"    # behind
  else
    if ! git rebase -q "origin/$BRANCH" 2>&1 | tee -a "$LOGFILE"; then   # diverged: local commit + new origin work
      git rebase --abort 2>/dev/null
      log "rebase of the unpushed nightly commit failed; discarding it (its data is regenerated below)"
      git reset -q --hard "origin/$BRANCH"
    fi
  fi
}
log "syncing $BRANCH"
if ! sync_repo; then fail "could not sync the checkout with origin/$BRANCH"; finish; fi
log "checkout at $(git rev-parse --short HEAD): $(git log -1 --format=%s | cut -c1-90)"

# ---- 2. the refresh -------------------------------------------------------------------------
if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ]; then
  log "OPAX_NIGHTLY_SKIP_REFRESH=1: not running daily_refresh.sh"
else
  REFRESH="${OPAX_DAILY_REFRESH:-$REPO/scripts/daily_refresh.sh}"
  log "running $REFRESH (KB sync on)"
  OPAX_SYNC_KB=1 OPAX_ALLOW_FAIL="${OPAX_ALLOW_FAIL:-sa}" OPAX_SYNC_GATE="${OPAX_SYNC_GATE:-link_speakers,classify}" \
    run "$REFRESH"
  rc=$?
  # daily_refresh.sh exits 0 without doing anything when its own lock is held, so prove
  # that it wrote a complete block after we started.
  refresh_completed() {
    [ "$DAILY_LOG" -nt "$MARK" ] || return 1
    awk '/===== daily refresh start/ { seen=1; complete=0 }
         /===== daily refresh end/ && seen { complete=1 }
         END { exit !(seen && complete) }' "$DAILY_LOG"
  }
  if ! refresh_completed; then
    fail "daily_refresh.sh did not complete a run (rc=$rc); nothing was published"
    finish
  fi
  if [ "$rc" -ne 0 ]; then
    failed_steps=$(grep -E 'Incomplete refresh: failed steps' "$DAILY_LOG" | tail -1 | sed 's/.*failed steps //')
    fail "daily_refresh.sh reported failed steps: ${failed_steps:-unknown} (rc=$rc); the rest was still published"
  fi
fi

# ---- 3. bills: put the speech briefs back, prove none was lost -----------------------------------
revert() { git checkout -q HEAD -- "$@"; git clean -fdq -- "$@" 2>/dev/null || true; }
log "filling bill speech briefs from the knowledge box"
if ! run "$PY" scripts/export_bills.py --fill-briefs portal/public/bills; then
  log "WARN: fill-briefs exited non-zero; the verification below decides whether the bills are usable"
fi
if ! run "$PY" scripts/verify_bill_briefs.py; then
  fail "bill briefs lost between HEAD and the new export; bills reverted to HEAD and not published tonight"
  revert portal/public/bills
fi

# ---- 4. validate what will be committed ----------------------------------------------------------
for group in bills votes; do
  if ! run "$PY" scripts/vm/validate_data.py "$group"; then
    case $group in
      bills) revert portal/public/bills ;;
      votes) revert portal/public/votes.json ;;
    esac
    fail "validation failed for $group: reverted to HEAD and not published tonight"
  fi
done

# ---- 5. corpus manifest + cache epoch ---------------------------------------------------------------------
RESULT_JSON=$(mktemp)
# corpus.json is what starts the deploy (deploy.yml runs on pushes that change it). So it must change
# whenever anything else is about to be pushed, and at least once a day even when nothing else moved:
# that daily stamp is also what the watchdog reads to know the whole chain is alive.
stamp_args=(--stamp-after-hours "${OPAX_STAMP_AFTER_HOURS:-12}")
if [ -n "$(git status --porcelain -- portal/public/bills portal/public/votes.json)" ]; then stamp_args=(--always-stamp); fi
log "updating portal/public/corpus.json from the live knowledge box (${stamp_args[*]})"
"$PY" scripts/update_corpus_manifest.py --daily-log "$DAILY_LOG" --settle "${OPAX_SETTLE_SECONDS:-60}" \
    "${stamp_args[@]}" --result-json "$RESULT_JSON" 2>&1 | tee -a "$LOGFILE"
mrc=${PIPESTATUS[0]}
KB_CHANGED=false
if [ "$mrc" -ne 0 ]; then
  fail "update_corpus_manifest.py failed (rc=$mrc): corpus.json and CACHE_EPOCH left as they were"
  revert portal/public/corpus.json
else
  KB_CHANGED=$("$PY" -c 'import json,sys; r=json.load(open(sys.argv[1])); print("true" if r.get("kb_changed") else "false")' "$RESULT_JSON" 2>/dev/null || echo false)
  RESULT_SUMMARY=$("$PY" - "$RESULT_JSON" <<'PYEOF' 2>/dev/null
import json, sys
r = json.load(open(sys.argv[1]))
d = ", ".join(f"{k} {v:+,}" for k, v in r.get("kind_deltas", {}).items())
print(f"{r['resources']:,} resources ({r['new_resources']:+,}{': ' + d if d else ''})")
PYEOF
)
  if ! run "$PY" scripts/vm/validate_data.py corpus; then
    revert portal/public/corpus.json
    KB_CHANGED=false
    fail "validation failed for corpus.json: reverted to HEAD"
  fi
fi
rm -f "$RESULT_JSON"
if [ "$KB_CHANGED" = true ]; then
  run "$PY" scripts/bump_cache_epoch.py --date "$TODAY" || fail "could not bump CACHE_EPOCH"
  run "$PY" scripts/vm/validate_data.py wrangler || { revert portal/wrangler.jsonc; fail "wrangler.jsonc failed validation: reverted"; }
else
  log "knowledge box unchanged: CACHE_EPOCH not bumped"
fi

# ---- 6. commit -----------------------------------------------------------------------------------------------
git add -A -- "${DATA_PATHS[@]}"
others=$(git status --porcelain | grep -v '^??' | grep -vE ' (portal/public/bills/|portal/public/votes.json|portal/public/corpus.json|portal/wrangler.jsonc)' || true)
[ -z "$others" ] || log "WARN: other tracked files are modified and were NOT committed: $(echo "$others" | tr '\n' ' ' | cut -c1-300)"
if git diff --cached --quiet; then
  if [ -n "$(git log "origin/$BRANCH..HEAD" --oneline 2>/dev/null)" ]; then
    log "nothing new to commit, but an earlier nightly commit is unpushed: pushing it"
  else
    log "no data changes tonight (and checked_at is fresh): nothing to commit, push or deploy"
    DEPLOY="not needed (no changes)"
    finish
  fi
else
  nbills=$(git diff --cached --name-only -- portal/public/bills | wc -l | tr -d ' ')
  parts=()
  [ -n "$RESULT_SUMMARY" ] && [ "$KB_CHANGED" = true ] && parts+=("$RESULT_SUMMARY")
  [ "$nbills" -gt 0 ] && parts+=("$nbills bill files")
  git diff --cached --quiet -- portal/public/votes.json || parts+=("votes.json")
  subject="Nightly refresh $TODAY"
  if [ "${#parts[@]}" -gt 0 ]; then
    joined=$(printf '%s; ' "${parts[@]}")
    subject="$subject: ${joined%; }"
  fi
  git commit -q -m "$subject" -m "Unattended run of scripts/vm/nightly.sh on the OPAX VM. Data files only: bills, votes.json, corpus.json, CACHE_EPOCH." \
    || { fail "git commit failed"; finish; }
  log "committed: $subject"
fi
COMMIT_SHA=$(git rev-parse --short HEAD)

# ---- 7. push (the push starts the deploy) --------------------------------------------------------------------
if [ "${OPAX_NIGHTLY_NO_PUSH:-0}" = 1 ]; then
  log "OPAX_NIGHTLY_NO_PUSH=1: committed $COMMIT_SHA locally; not pushing"
  DEPLOY="skipped (NO_PUSH)"
  finish
fi
BASE_BEFORE=$(git rev-parse "origin/$BRANCH")
pushed=false
for attempt in 1 2 3 4 5; do
  if run gitn push -q origin "HEAD:$BRANCH"; then pushed=true; break; fi
  log "push rejected (attempt $attempt): rebasing onto origin/$BRANCH and retrying"
  gitn fetch --quiet origin "$BRANCH" || true
  if ! git rebase -q "origin/$BRANCH" 2>&1 | tee -a "$LOGFILE"; then git rebase --abort 2>/dev/null; break; fi
  sleep $((attempt * ${OPAX_PUSH_SLEEP_UNIT:-5}))
done
if [ "$pushed" != true ]; then
  fail "could not push $COMMIT_SHA to origin/$BRANCH (deploy key? network?); it stays committed locally and is retried on the next run"
  DEPLOY="not pushed"
  finish
fi
COMMIT_SHA=$(git rev-parse --short HEAD)
log "pushed $COMMIT_SHA to origin/$BRANCH"
# deploy.yml runs on pushes that change corpus.json; say whether this one will
if git diff --quiet "$BASE_BEFORE" HEAD -- portal/public/corpus.json; then
  DEPLOY="NOT started: this push did not change corpus.json (data is on $BRANCH but not deployed)"
  fail "pushed $COMMIT_SHA but corpus.json did not change, so the deploy workflow did not start; run it by hand (Actions > Deploy > Run workflow)"
else
  DEPLOY="started by the push (deploy.yml, corpus.json changed)"
fi
finish
