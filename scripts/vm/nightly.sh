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
#   OPAX_ALLOW_FAIL       refresh steps allowed to fail (default sa,act_members)
#   OPAX_SYNC_GATE        steps that must pass before the KB push (default link_speakers,classify,committee_fetch,committee_resolve)
#   OPAX_DAILY_REFRESH    refresh script (default scripts/daily_refresh.sh)
#   OPAX_PUSH_TIMEOUT     time limit of the knowledge-box push (arag_sync) alone, default 2h; a cut push resumes next run
#   OPAX_SETTLE_SECONDS   wait for KB counters to stop moving before reading them (default 60)
#   OPAX_STAMP_AFTER_HOURS  refresh corpus.json's checked_at when older than this (default 12)
#   OPAX_MIN_FREE_GB      refuse to start with less free disk than this (default 5)
#   OPAX_PUSH_SLEEP_UNIT  seconds multiplied by the attempt number between push retries (default 5)
#   OPAX_NIGHTLY_NO_PUSH  1 = commit locally only: no push, no status publication
#   OPAX_NIGHTLY_SKIP_REFRESH  1 = skip daily_refresh.sh and the periodic groups (rerun the publish half only)
#   OPAX_NIGHTLY_SKIP_DAILY    1 = skip daily_refresh.sh only (the periodic groups still run; for rehearsing them)
#   OPAX_NIGHTLY_SKIP_PERIODIC 1 = skip the weekly/monthly groups tonight
#   OPAX_PERIODIC_SYNC_KB 0 = the periodic groups do not write to the knowledge box (rehearsal; default 1)
#   OPAX_ROSTER_SYNC_KB  1 = explicitly enable roster KB apply (default dry-run, cap 30 retirements/replacements)
#   OPAX_PERIODIC_ALLOW_FAIL  periodic steps allowed to fail without failing the night (default none)
#   OPAX_NODE / OPAX_NPM  node and npm binaries for the pre-commit portal test gate (default: from PATH)
#   OPAX_GATE_BUILD       0 = the gate does not run `npm run build:search` before the tests
#   OPAX_FORCE_GROUPS     "weekly", "monthly" or "weekly monthly": run those groups tonight whatever the day
#                         (rehearsal; normally weekly = every Sunday Sydney, monthly = the first Sunday too)
#   OPAX_WEEKLY_REFRESH   periodic script (default scripts/weekly_refresh.sh)
#   OPAX_BILL_PARLIAMENT  current federal parliament (default 48)
#   OPAX_BILLS_TIMEOUT    combined bill fetch/full-export limit (default 20m, plus 60s kill grace)
#   OPAX_TEST_GATE        0 = do not run the portal test suite against the new data before committing
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
# every committed group and its paths (scripts/vm/data_groups.sh): what a night may commit, validate and revert
# shellcheck source=scripts/vm/data_groups.sh
. "$(dirname "${BASH_SOURCE[0]}")/data_groups.sh"
MIN_FREE_GB="${OPAX_MIN_FREE_GB:-5}"

mkdir -p "$PIPE"
MARK="$PIPE/.nightly-start.$$"
touch "$MARK"
ts() { date '+%F %T'; }
log() { echo "$(ts) [nightly] $*" | tee -a "$LOGFILE"; }
# run a command, mirror its output into the nightly log, keep its exit status
run() { "$@" 2>&1 | tee -a "$LOGFILE"; return "${PIPESTATUS[0]}"; }

FAILURES=()
WARNINGS=()
COMMIT_SHA=""
DEPLOY="not pushed"
RESULT_SUMMARY=""
fail() { FAILURES+=("$*"); log "FAIL: $*"; }
warn() { WARNINGS+=("$*"); log "WARN: $*"; }

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
# only paths HEAD tracks can be checked out or cleaned; a group's file that does not exist yet needs a first manual commit
mapfile -t DATA_PATHS < <(tracked_data_paths)

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
  "$PY" - "$LASTFILE" "$status" "$TODAY" "$STARTED_AT" "$COMMIT_SHA" "$DEPLOY" "$RESULT_SUMMARY" "${#WARNINGS[@]}" "${WARNINGS[@]+"${WARNINGS[@]}"}" "${FAILURES[@]+"${FAILURES[@]}"}" <<'PYEOF' 2>/dev/null || true
import json, sys, datetime
path, status, day, started, sha, deploy, summary, nwarn, *rest = sys.argv[1:]
warnings, failures = rest[:int(nwarn)], rest[int(nwarn):]
json.dump({"date": day, "status": status, "started": started,
           "finished": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "commit": sha or None, "deploy": deploy, "summary": summary, "failures": failures, "warnings": warnings},
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
  git clean -fdq -- "${DATA_PATHS[@]}"
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
mapfile -t DATA_PATHS < <(tracked_data_paths)
log "checkout at $(git rev-parse --short HEAD): $(git log -1 --format=%s | cut -c1-90)"

# the last line matching $2 inside the LAST run block of a step log ($1 = daily.log or weekly.log): the logs only
# ever grow, and last night's "Stale ..." line must not be reported again tonight
last_run_line() {
  awk '/===== (daily|weekly) refresh start/ { buf = "" } { buf = buf $0 "\n" } END { printf "%s", buf }' "$1" 2>/dev/null \
    | grep -E "$2" | tail -1
}

# did the run whose log is $1 ("daily" or "weekly" in $2) start after this nightly did and reach its end line?
# (a refresh that finds its lock held only logs that and exits 0; last week's complete block must not count)
run_completed() {
  local startline t
  startline=$(grep -E "===== $2 refresh start" "$1" 2>/dev/null | tail -1)
  [ -n "$startline" ] || return 1
  t=$(date -d "${startline:0:19}" +%s 2>/dev/null) || return 1
  [ "$t" -ge "$(stat -c %Y "$MARK")" ] || return 1
  awk -v name="$2" '$0 ~ "===== " name " refresh start" { seen = 1; complete = 0 }
       $0 ~ "===== " name " refresh end" && seen { complete = 1 }
       END { exit !(seen && complete) }' "$1"
}

# git helpers for putting a group of data files back to what HEAD has
revert() {
  local p
  for p in "$@"; do [ "$p" != portal/public/bills ] || BILLS_REFRESH_OK=0; done
  git checkout -q HEAD -- "$@"; git clean -fdq -- "$@" 2>/dev/null || true
}
revert_group() { local g=$1; local paths; read -ra paths <<<"${GROUP_PATHS[$g]}"; revert "${paths[@]}"; }
group_changed() { local g=$1; local paths; read -ra paths <<<"${GROUP_PATHS[$g]}"; [ -n "$(git status --porcelain -- "${paths[@]}")" ]; }

# ---- 2. the refresh -------------------------------------------------------------------------
if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ] || [ "${OPAX_NIGHTLY_SKIP_DAILY:-0}" = 1 ]; then
  log "OPAX_NIGHTLY_SKIP_REFRESH/SKIP_DAILY=1: not running daily_refresh.sh"
else
  REFRESH="${OPAX_DAILY_REFRESH:-$REPO/scripts/daily_refresh.sh}"
  log "running $REFRESH (KB sync on)"
  OPAX_SYNC_KB=1 OPAX_ENSURE_INDEXES=1 OPAX_ALLOW_FAIL="${OPAX_ALLOW_FAIL:-sa,act_members}" OPAX_SYNC_GATE="${OPAX_SYNC_GATE:-link_speakers,classify,committee_fetch,committee_resolve}" \
    run "$REFRESH"
  rc=$?
  # daily_refresh.sh exits 0 without doing anything when its own lock is held (and logs that), so prove that it
  # wrote a complete block that STARTED after we did.
  if ! run_completed "$DAILY_LOG" daily; then
    fail "daily_refresh.sh did not complete a run (rc=$rc); nothing was published"
    finish
  fi
  if [ "$rc" -ne 0 ]; then
    failed_steps=$(grep -E 'Incomplete refresh: failed steps' "$DAILY_LOG" | tail -1 | sed 's/.*failed steps //')
    fail "daily_refresh.sh reported failed steps: ${failed_steps:-unknown} (rc=$rc); the rest was still published"
  fi
  stale=$(last_run_line "$DAILY_LOG" 'Stale daily refresh:' | sed 's/.*register: //')
  [ -z "$stale" ] || warn "a source refused to change its register tonight (kept the last good rows): $stale"
  partial=$(last_run_line "$DAILY_LOG" 'Partial daily refresh:' | sed 's/.*next run: //')
  [ -z "$partial" ] || warn "cut by its time limit tonight, resumes from its checkpoint next run: $partial (the knowledge box takes only ~12-30k resources an hour)"
fi

# ---- 2b. the periodic groups: weekly (Sundays, Sydney) and monthly (the first Sunday) ------------------
select_groups() {
  if [ -n "${OPAX_FORCE_GROUPS:-}" ]; then echo "$OPAX_FORCE_GROUPS"; return; fi
  local today dow dom
  today=${OPAX_TODAY:-$(TZ=Australia/Sydney date +%F)}   # OPAX_TODAY=YYYY-MM-DD pretends it is that night (rehearsal, tests)
  dow=$(date -d "$today" +%u); dom=${today##*-}
  if [ "$dow" = 7 ]; then
    if [ "$((10#$dom))" -le 7 ]; then echo "weekly monthly"; else echo "weekly"; fi
  fi
}
WEEKLY_LOG="$PIPE/weekly.log"
if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" != 1 ] && [ "${OPAX_NIGHTLY_SKIP_PERIODIC:-0}" != 1 ]; then
  groups=$(select_groups)
  if [ -n "$groups" ]; then
    PERIODIC="${OPAX_WEEKLY_REFRESH:-$REPO/scripts/weekly_refresh.sh}"
    log "periodic groups tonight: $groups"
    # shellcheck disable=SC2086  # $groups is a word list on purpose
    OPAX_SYNC_KB="${OPAX_PERIODIC_SYNC_KB:-1}" OPAX_ALLOW_FAIL="${OPAX_PERIODIC_ALLOW_FAIL:-}" run "$PERIODIC" $groups
    prc=$?
    if ! run_completed "$WEEKLY_LOG" weekly; then
      # it never got to the end (lock held, killed, crashed): trust none of the periodic files it may have touched
      for g in "${DATA_GROUPS[@]}"; do
        case $g in bills|votes|corpus|wrangler) continue ;; esac
        revert_group "$g"
      done
      fail "weekly_refresh.sh ($groups) did not complete a run (rc=$prc); the periodic files were put back to HEAD"
    elif [ "$prc" -ne 0 ]; then
      failed_steps=$(grep -E 'Incomplete weekly refresh: failed steps' "$WEEKLY_LOG" | tail -1 | sed 's/.*failed steps //')
      fail "weekly_refresh.sh ($groups) reported failed steps: ${failed_steps:-unknown} (rc=$prc); the rest was still published"
    fi
    stale=$(last_run_line "$WEEKLY_LOG" 'Stale weekly refresh:' | sed 's/.*register: //')
    [ -z "$stale" ] || warn "a source refused to change its register tonight (kept the last good rows): $stale"
    held=$(last_run_line "$WEEKLY_LOG" 'Roster held:' | sed 's/.*Roster held: //')
    [ -z "$held" ] || warn "the roster export was held and the shipped parliamentarians.json kept (review, then OPAX_ROSTER_ACCEPT=1): $held"
  fi
fi

# ---- 2c. bills: current-parliament acquisition, then full static export -------------------------
# shellcheck source=scripts/vm/bills_refresh.sh
. "$REPO/scripts/vm/bills_refresh.sh"
bills_refresh

# ---- 3. bills: put the speech briefs back, prove no brief or bill was lost ------------------------
bills_fill_and_verify

# ---- 3b. Worker-only vote/division projections from the refreshed OPAX DB -------------------------
# After bill verification so division backlinks use the retained, publishable bills.
# Both exporters read one read-only DB snapshot; neither alters mobile votes.json.
if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" != 1 ]; then
  log "refreshing static division pages and separate SEO recent votes"
  if ! run "$PY" scripts/export_division_pages.py; then
    revert_group divisions
    fail "division export failed; pinned division pages reverted to HEAD"
  else
    retained=$("$PY" -c 'import json; print(json.load(open("portal/public/divisions/index.json"))["coverage"]["retained_count"])')
    [ "$retained" = 0 ] || warn "division export retained $retained pinned records; explicit coverage flags identify degraded source coverage"
  fi
  if ! run "$PY" scripts/export_recent_votes.py; then
    revert_group seovotes
    fail "SEO recent-vote export failed; previous separate export kept"
  fi
fi

# ---- 4. validate what will be committed ----------------------------------------------------------
# bills and votes are checked every night; every periodic group only when `git status` shows its files changed.
# A group that fails is put back to HEAD and the night goes on with the rest.
for group in "${DATA_GROUPS[@]}"; do
  case $group in corpus|wrangler) continue ;; esac
  if [ "$group" != bills ] && [ "$group" != votes ] && ! group_changed "$group"; then continue; fi
  if ! run "$PY" scripts/vm/validate_data.py "$group"; then
    revert_group "$group"
    fail "validation failed for $group: reverted to HEAD and not published tonight"
  fi
done

# The portal test suite reads the generated files (grant shards, money graph, suppliers ...), and the deploy job runs
# it before it ships anything: a red test would leave tonight's data on main but undeployed until someone noticed.
# So run it here, against the new files, before committing (~1.5 min on the VM: the search catalog is rebuilt first, as
# the deploy job does). If it goes red, the group to blame is found by putting each changed group back to HEAD on its own
# and re-running (an innocent group is restored from a backup, not lost); only the culprit is not published tonight.
# Needs Node 24 and portal/node_modules (scripts/vm/bootstrap.sh installs them); without them the gate is skipped and
# the deploy job is the only test.
if [ "${OPAX_TEST_GATE:-1}" != 0 ]; then
  gate_groups=()
  for group in "${DATA_GROUPS[@]}"; do
    case $group in corpus|wrangler|bills|votes) continue ;; esac
    group_changed "$group" && gate_groups+=("$group")
  done
  for group in votes bills; do group_changed "$group" && gate_groups+=("$group"); done
  if [ "${#gate_groups[@]}" -gt 0 ]; then
    NODE="${OPAX_NODE:-node}"; NPM="${OPAX_NPM:-npm}"
    if [ -f "$REPO/portal/package-lock.json" ] && [ -d "$REPO/portal/node_modules" ] \
       && [ "$(cat "$REPO/portal/node_modules/.opax-lock-sha" 2>/dev/null)" != "$(sha256sum "$REPO/portal/package-lock.json" | cut -d' ' -f1)" ] \
       && command -v "$NODE" >/dev/null 2>&1 && command -v "$NPM" >/dev/null 2>&1; then
      log "portal/package-lock.json changed since the last install: npm ci"
      if (cd "$REPO/portal" && run "$NPM" ci --ignore-scripts --no-audit --no-fund); then
        sha256sum "$REPO/portal/package-lock.json" | cut -d' ' -f1 > "$REPO/portal/node_modules/.opax-lock-sha"
      else
        log "WARN: npm ci failed; the tests below run against the old node_modules"
      fi
    fi
    if command -v "$NODE" >/dev/null 2>&1 && [ -d "$REPO/portal/node_modules" ]; then
      # what the deploy job does before its tests: rebuild the search catalog from the public data (~50 s; the
      # generated shards are gitignored, only manifest.json is tracked and is put back below)
      run_suite() {
        [ "${OPAX_GATE_BUILD:-1}" = 0 ] || (cd "$REPO/portal" && run "$NPM" run build:search) || return 1
        (cd "$REPO/portal" && run "$NODE" --test --test-reporter=dot test/*.test.mjs)
      }
      log "portal tests against the new data (${gate_groups[*]})"
      if ! run_suite; then
        # Red. Find the group(s) to blame without throwing away innocent ones: back every changed group up, then put
        # each back to HEAD alone and re-run; the first one whose revert turns the suite green is the culprit (it stays
        # reverted; the others are restored from the backup). If no single group does it, two or more together break
        # a test: put them back cumulatively, in order, until green (the same as blaming all of them).
        BK="$PIPE/gate-backup"; rm -rf "$BK"; mkdir -p "$BK"
        backup_group() { local g=$1 paths; read -ra paths <<<"${GROUP_PATHS[$g]}"; tar cf "$BK/$g.tar" -- "${paths[@]}" 2>/dev/null || true; }
        restore_group() { local g=$1 paths; read -ra paths <<<"${GROUP_PATHS[$g]}"; rm -rf -- "${paths[@]}"; tar xf "$BK/$g.tar" 2>/dev/null || true; }
        for group in "${gate_groups[@]}"; do backup_group "$group"; done
        culprit=""
        for group in "${gate_groups[@]}"; do
          revert_group "$group"
          if run_suite; then culprit=$group; break; fi
          restore_group "$group"
        done
        if [ -n "$culprit" ]; then
          fail "portal tests failed against the new $culprit files (green with only that group put back to HEAD): $culprit not published tonight"
        else
          reverted=(); green=false
          for group in "${gate_groups[@]}"; do
            revert_group "$group"; reverted+=("$group")
            if run_suite; then green=true; break; fi
          done
          if [ "$green" = true ]; then
            fail "portal tests failed against the new data; no single group was to blame, green again with ${reverted[*]} put back to HEAD: not published tonight"
          else
            fail "portal tests fail even with every changed group (${reverted[*]}) put back to HEAD: the suite is red on main itself; nothing published tonight except corpus.json"
          fi
        fi
        rm -rf "$BK"
      fi
      git checkout -q HEAD -- portal/public/search-catalog/manifest.json 2>/dev/null || true   # a build output, never ours to commit
    else
      log "WARN: node or portal/node_modules missing: not running the portal tests before committing (${gate_groups[*]} changed)"
    fi
  fi
fi

# Preview derived roster evidence after the final data gate. Publication needs
# the dedicated switch explicitly set to 1; the broader periodic switch cannot
# enable it. The reconciler aborts above 30 combined retirements/replacements.
if [ -f scripts/reconcile_roster_profiles.py ]; then
  roster_mode=(--dry-run)
  if [ "${OPAX_ROSTER_SYNC_KB:-0}" = 1 ]; then roster_mode=(--apply); fi
  log "reconciling owned roster-profile KB records (${roster_mode[0]}, apply cap 30)"
  run "$PY" scripts/reconcile_roster_profiles.py --env .env "${roster_mode[@]}" \
    --output "$PIPE/roster-profile-plan.json" --backup "$PIPE/roster-profile-backups" \
    || fail "roster-profile reconciliation failed; retry next night (plan and backups retained)"
fi

# ---- 5. corpus manifest + cache epoch ---------------------------------------------------------------------
RESULT_JSON=$(mktemp)
# corpus.json is what starts the deploy (deploy.yml runs on pushes that change it). So it must change
# whenever anything else is about to be pushed, and at least once a day even when nothing else moved:
# that daily stamp is also what the watchdog reads to know the whole chain is alive.
stamp_args=(--stamp-after-hours "${OPAX_STAMP_AFTER_HOURS:-12}")
if [ -n "$(git status --porcelain -- "${DATA_PATHS[@]}")" ]; then stamp_args=(--always-stamp); fi
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

bills_summary || { fail "cannot summarize retained bills"; finish; }

# ---- 6. commit -----------------------------------------------------------------------------------------------
# Re-read HEAD after sync/validation; stage whole published directory roots,
# including new chunks and deletions, without admitting untracked first exports.
mapfile -t DATA_PATHS < <(tracked_data_paths)
if [ "${#DATA_PATHS[@]}" -gt 0 ]; then
  git add -A -- "${DATA_PATHS[@]}" || { fail "could not stage data changes"; finish; }
fi
others=""
while IFS= read -r line; do
  f=${line:3}; ours=false
  for p in "${DATA_PATHS[@]}"; do case "$f" in "$p"|"$p"/*) ours=true; break ;; esac; done
  [ "$ours" = true ] || others+="$line "
done < <(git status --porcelain | grep -v '^??' || true)
[ -z "$others" ] || log "WARN: other tracked files are modified and were NOT committed: $(echo "$others" | cut -c1-300)"
if git diff --cached --quiet; then
  if [ -n "$(git log "origin/$BRANCH..HEAD" --oneline 2>/dev/null)" ]; then
    log "nothing new to commit, but an earlier nightly commit is unpushed: pushing it"
  else
    log "no data changes tonight (and checked_at is fresh): nothing to commit, push or deploy"
    DEPLOY="not needed (no changes)"
    bills_refresh_complete
    finish
  fi
else
  parts=(); changed_groups=()
  [ -n "$RESULT_SUMMARY" ] && [ "$KB_CHANGED" = true ] && parts+=("$RESULT_SUMMARY")
  [ "$KB_CHANGED" = true ] || parts+=("$BILLS_SUMMARY")
  git diff --cached --quiet -- portal/public/votes.json || parts+=("votes.json")
  for group in "${DATA_GROUPS[@]}"; do
    case $group in bills|votes|corpus|wrangler) continue ;; esac
    read -ra gpaths <<<"${GROUP_PATHS[$group]}"
    git diff --cached --quiet -- "${gpaths[@]}" || { changed_groups+=("$group"); parts+=("$group"); }
  done
  subject="Nightly refresh $TODAY"
  if [ "${#parts[@]}" -gt 0 ]; then
    joined=$(printf '%s; ' "${parts[@]}")
    subject="$subject: ${joined%; }"
  fi
  body="Unattended run of scripts/vm/nightly.sh on the OPAX VM. Data files only: bills, votes.json, corpus.json, CACHE_EPOCH"
  [ "${#changed_groups[@]}" -gt 0 ] && body="$body, ${changed_groups[*]}"
  git commit -q -m "$subject" -m "$body." \
    || { fail "git commit failed"; finish; }
  log "committed: $subject"
fi
bills_refresh_complete
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
