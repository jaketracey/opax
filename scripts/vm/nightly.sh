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
# nightly-status branch and exits 1 if anything failed. Only three things stop the run outright:
# the repo cannot be synced, the venv cannot be synced to uv.lock, or the refresh did not actually run.
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
#   OPAX_FORCE_GROUPS     "weekly", "monthly", "frl" or a list: run those groups tonight whatever the day
#                         (rehearsal; normally weekly = every Sunday Sydney, monthly = the first Sunday too, frl = Thursday)
#   OPAX_WEEKLY_REFRESH   periodic script (default scripts/weekly_refresh.sh)
#   OPAX_BILL_PARLIAMENT  current federal parliament (default 48)
#   OPAX_BILLS_TIMEOUT    combined bill fetch/full-export limit (default 20m, plus 60s kill grace)
#   OPAX_EVIDENCE_TIMEOUT combined evidence export/audit/install limit (default 20m, plus 60s kill grace)
#   OPAX_EVIDENCE_READINESS_TIMEOUT input probe limit (default 60s, plus 5s kill grace; timeout waits)
#   OPAX_EVIDENCE_SOURCE / LAYERS / PLACES / DECISIONS / ADDITIONAL  matching read-only SQLite inputs
#   OPAX_TEST_GATE        0 = do not run the portal test suite against the new data before committing
#   OPAX_GATE_BUDGET      time limit of the portal gate and its blame search, from its first run (default 45m);
#                         groups not cleared by then are held, the ones proven green are published
#   OPAX_FRL_DOW          ISO weekday of the FRL instrument night (default 4, Thursday)
#   OPAX_UV_SYNC_TIMEOUT  time limit of the `uv sync --frozen` that starts the night (default 15m)
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
STAMPED_FILES=()
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
export OPAX_SOURCE_STATUS_FILE="$PIPE/source-access.json"
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
from pathlib import Path
paused_sources = {}
for receipt in [Path(path).parent / 'source-access.json', *(Path(path).parent / 'source-access').glob('*.json')]:
    try:
        paused_sources.update({k:v for k,v in json.loads(receipt.read_text()).items() if v.get('status') == 'paused'})
    except (OSError, ValueError): pass
json.dump({"date": day, "status": status, "started": started,
           "finished": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "commit": sha or None, "deploy": deploy, "summary": summary, "failures": failures, "warnings": warnings,
           "paused_sources": paused_sources},
          open(path, "w"), indent=1)
PYEOF
}

paused_summary() {
  local paused
  paused=$("$PY" - "$PIPE" <<'PYEOF'
import json, sys
from pathlib import Path
root = Path(sys.argv[1]); sources = set()
for receipt in [root / 'source-access.json', *(root / 'source-access').glob('*.json')]:
    try:
        sources.update(k for k,v in json.loads(receipt.read_text()).items() if v.get('status') == 'paused')
    except (OSError, ValueError): pass
print(', '.join(sorted(sources)) or 'none')
PYEOF
)
  log "Paused sources: ${paused:-none}"
  RESULT_SUMMARY="${RESULT_SUMMARY:+$RESULT_SUMMARY; }Paused sources: ${paused:-none}"
}

finish() {
  if declare -F evidence_abort >/dev/null; then evidence_abort; fi
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
nightly_exit() {
  local rc=$?
  if declare -F evidence_abort >/dev/null; then evidence_abort; fi
  if [ "$rc" -ne 0 ] && [ "${#FAILURES[@]}" -eq 0 ]; then
    fail "nightly.sh died unexpectedly (see the log)"
    finish
  fi
}
trap nightly_exit EXIT
trap 'fail "nightly interrupted"; finish' TERM INT

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
  # leftovers of a run that died half way: the nightly writes the data paths, and its portal gate rebuilds derived
  # files and restamps importers under portal/ (18 Oct 2026: killed mid-gate); nothing else edits this checkout
  local p portal=()
  for p in portal/public portal/src; do git cat-file -e "HEAD:$p" 2>/dev/null && portal+=("$p"); done
  git checkout -q HEAD -- "${DATA_PATHS[@]}" "${portal[@]+"${portal[@]}"}" || return 1
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

# ---- 1b. sync the venv to uv.lock -------------------------------------------------------------
# A dependency added to pyproject.toml never reached the box venv on its own (pymupdf, 12 Oct: qao_bodies
# failed until a hand-run sync). --frozen installs exactly uv.lock and removes anything not in it. A
# half-synced venv must not run tonight's steps, so a failed sync stops the night here.
log "syncing the Python environment (uv sync --frozen)"
if ! command -v uv >/dev/null; then fail "uv not found on PATH (~/.local/bin): cannot sync the Python environment to uv.lock"; finish; fi
if ! run timeout "${OPAX_UV_SYNC_TIMEOUT:-15m}" uv sync --frozen; then
  fail "uv sync --frozen failed: the Python environment does not match uv.lock, so no step ran tonight (see the log)"; finish
fi

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
  for p in "$@"; do
    [ "$p" != portal/public/bills ] || BILLS_REFRESH_OK=0
    [ "$p" != portal/public/evidence ] || EVIDENCE_REFRESH_OK=0
    case "$p" in portal/public/votes.json|portal/public/divisions|portal/public/seo/recent-votes.json) DIVISIONS_REFRESH_OK=0 ;; esac
    [ "$p" != portal/public/divisions ] || DIVISIONS_PAGES_ROLLED_BACK=1
  done
  # Back to HEAD means exactly HEAD under these paths, so a gate trial really tests HEAD and a rollback leaves
  # nothing behind: unstage, restore tracked files one path at a time (a path HEAD lacks is only cleaned),
  # remove every file the run created there (17 Oct: 179 new division pages), then check. Never wider than "$@".
  git reset -q -- "$@" 2>/dev/null || true
  for p in "$@"; do
    git cat-file -e "HEAD:$p" 2>/dev/null || continue
    git checkout -q HEAD -- "$p" || fail "cannot put $p back to HEAD"
  done
  git clean -fdq -- "$@" || fail "cannot remove new files under $*"
  local left; left=$(git status --porcelain -- "$@")
  [ -z "$left" ] || fail "put back to HEAD but still changed: $(echo "$left" | head -5 | tr '\n' ' ')"
}
revert_group() { local g=$1; local paths; read -ra paths <<<"${GROUP_PATHS[$g]}"; revert "${paths[@]}"; }
group_changed() { local g=$1; local paths; read -ra paths <<<"${GROUP_PATHS[$g]}"; [ -n "$(git status --porcelain -- "${paths[@]}")" ]; }

# ---- 2. the refresh -------------------------------------------------------------------------
if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" = 1 ] || [ "${OPAX_NIGHTLY_SKIP_DAILY:-0}" = 1 ]; then
  log "OPAX_NIGHTLY_SKIP_REFRESH/SKIP_DAILY=1: not running daily_refresh.sh"
else
  REFRESH="${OPAX_DAILY_REFRESH:-$REPO/scripts/daily_refresh.sh}"
  log "running $REFRESH (KB sync on)"
  OPAX_FEDERAL_VOTES_MANAGED=1 OPAX_SYNC_KB=1 OPAX_ENSURE_INDEXES=1 OPAX_ALLOW_FAIL="${OPAX_ALLOW_FAIL:-sa,act_members}" OPAX_SYNC_GATE="${OPAX_SYNC_GATE:-link_speakers,classify,committee_fetch,committee_resolve}" \
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

# ---- 2b. the periodic groups: weekly (Sundays, Sydney), monthly (the first Sunday), frl (Thursdays) ----------
# The FRL instrument crawl (~2.6 h of 10-second-spaced requests, 18 Oct 2026) has its own night: with the rest of the
# weekly it left Sunday no time inside the 6 h unit limit to test and publish (scripts/weekly_refresh.sh).
select_groups() {
  if [ -n "${OPAX_FORCE_GROUPS:-}" ]; then echo "$OPAX_FORCE_GROUPS"; return; fi
  local today dow dom
  today=${OPAX_TODAY:-$(TZ=Australia/Sydney date +%F)}   # OPAX_TODAY=YYYY-MM-DD pretends it is that night (rehearsal, tests)
  dow=$(date -d "$today" +%u); dom=${today##*-}
  if [ "$dow" = 7 ]; then
    if [ "$((10#$dom))" -le 7 ]; then echo "weekly monthly"; else echo "weekly"; fi
  elif [ "$dow" = "${OPAX_FRL_DOW:-4}" ]; then
    echo "frl"
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
    # the shipped roster is kept record for record (scripts/roster_overlay.py); a sitting member it lacks needs review
    overlay=$(last_run_line "$WEEKLY_LOG" 'Roster overlay:' | sed 's/.*Roster overlay: //')
    case "$overlay" in *"are sitting members"*) warn "the roster export has sitting members the shipped roster lacks, held for a reviewed refresh (OPAX_ROSTER_ACCEPT=1): $overlay" ;; esac
  fi
fi

# Federal acquisition/projection must precede bills export: exact TVFY links
# are part of the bill record, and divisions use the verified bills below.
# shellcheck source=scripts/vm/divisions_refresh.sh
. "$REPO/scripts/vm/divisions_refresh.sh"
divisions_refresh

# ---- 2c. bills: current-parliament acquisition, then full static export -------------------------
# shellcheck source=scripts/vm/bills_refresh.sh
. "$REPO/scripts/vm/bills_refresh.sh"
bills_refresh

# ---- 2d. evidence: weekly/catch-up export from matching read-only sidecars ----------------------
# shellcheck source=scripts/vm/evidence_refresh.sh
. "$REPO/scripts/vm/evidence_refresh.sh"
evidence_refresh

# ---- 3. bills: put the speech briefs back, prove no brief or bill was lost ------------------------
bills_fill_and_verify

# ---- 3b. Worker-only vote/division projections from the refreshed OPAX DB -------------------------
# After bill verification so division backlinks use the retained, publishable bills.
# Both exporters read one read-only DB snapshot; neither alters mobile votes.json.
if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" != 1 ] && [ "$DIVISIONS_ACQUISITION_FAILED" != 1 ]; then
  log "refreshing static division pages and separate SEO recent votes"
  if ! run "$PY" scripts/export_division_pages.py; then
    if [ "${DIVISIONS_REFRESH_OK:-0}" = 1 ]; then divisions_revert; else revert_group divisions; fi
    DIVISIONS_EXPORT_FAILED=1
    revert_group seovotes
    fail "division export failed; pinned division pages reverted to HEAD"
  else
    DIVISIONS_PAGES_ROLLED_BACK=0
    retained=$("$PY" -c 'import json; print(json.load(open("portal/public/divisions/index.json"))["coverage"]["retained_count"])')
    [ "$retained" = 0 ] || warn "division export retained $retained pinned records; explicit coverage flags identify degraded source coverage"
  fi
  # SEO links depend on the accepted division pages, never just the DB rows.
  if [ "${DIVISIONS_EXPORT_FAILED:-0}" = 1 ]; then
    log "SEO recent votes skipped: division export failed or was rolled back"
  elif ! run "$PY" scripts/export_recent_votes.py; then
    if [ "${DIVISIONS_REFRESH_OK:-0}" = 1 ]; then divisions_revert; else revert_group seovotes; fi
    fail "SEO recent-vote export failed; previous separate export kept"
  fi
fi

divisions_verify

# ---- 3c. promote separately reviewed hub snapshots after the existing exports ------------------
# New periods arrive via reviewed staged data + review.json, never an unchecked fetch.
# Each hub fails independently and retains its last good public asset. The promoter
# also proves that it leaves the refreshed mobile votes.json bytes untouched.
for hub in budget vic-gifts bills-tas bills-act; do
  if ! run "$PY" scripts/promote_hub_data.py "$hub"; then
    revert_group "$hub"
    fail "hub promotion failed for $hub: previous reviewed asset retained"
  fi
done

# ---- 3d. Senate video: the AuSenate channel's public feed (and the Data API when YOUTUBE_API_KEY is set) ------
# Titles, ids and dates only; the site embeds the Senate's own player on a press. The file accumulates
# (the feed shows the latest 15) and re-matches first speeches against tonight's roster. Fails soft.
# OPAX_SENATE_VIDEO=0 skips it; `node scripts/senate_video/fetch.mjs --dry-run` rehearses it.
if [ "${OPAX_NIGHTLY_SKIP_REFRESH:-0}" != 1 ] && [ "${OPAX_SENATE_VIDEO:-1}" != 0 ]; then
  log "refreshing Senate video links (AuSenate feed)"
  if ! run "${OPAX_NODE:-node}" scripts/senate_video/fetch.mjs; then
    revert_group video
    fail "Senate video refresh failed: previous portal/public/video kept"
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
divisions_restore_dependencies

# The portal test suite reads the generated files (grant shards, money graph, suppliers ...), and the deploy job runs
# it before it ships anything: a red test would leave tonight's data on main but undeployed until someone noticed.
# So run it here, against the new files, before committing, the way the deploy job does: `npm run build:search`, then
# the content stamps (scripts/stamp_assets.mjs, part of the deploy's build:release: a rebuilt person-paths.js is a new
# stamp in every importer), then the suite. Needs Node 24 and portal/node_modules (scripts/vm/bootstrap.sh installs
# them); without them the gate is skipped and the deploy job is the only test.
#
# If it goes red, the groups to blame are found inside a time budget (OPAX_GATE_BUDGET, default 45m, counted from the
# first run), never by re-running the whole suite group after group (18 Oct 2026: six identical full runs, the 6 h unit
# limit, nothing published). Every changed group is backed up and put back to HEAD; the test files that failed are
# re-run on that baseline (they must pass: otherwise main itself is red); then the groups are added back in halves,
# re-running only those files: a half that stays green is kept, a red half is split until each culprit is alone, and
# a culprit stays at HEAD. When the budget would run out, the groups not yet tried are held too. The groups kept are
# green together; a last full run proves it and rebuilds the derived files from exactly what will be committed.
if [ "${OPAX_TEST_GATE:-1}" != 0 ]; then
  gate_groups=()
  for group in "${DATA_GROUPS[@]}"; do
    case $group in corpus|wrangler|bills|votes|evidence) continue ;; esac
    group_changed "$group" && gate_groups+=("$group")
  done
  for group in votes bills evidence; do group_changed "$group" && gate_groups+=("$group"); done
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
      GATE_JUNIT="$PIPE/gate-junit.xml"
      # tracked files already modified outside the data paths before the gate: never staged by the stamp step below
      mapfile -t OTHERS_BEFORE < <(git diff --name-only)
      # Everything that differs from HEAD before the gate's first build, tracked or new: whatever differs afterwards and
      # is not in here, the build or stamp step wrote (18 Oct review: build:registers writes instruments/registered.json,
      # and a step cut mid-write left '{"partial":' under a group that never changed).
      declare -A PRE_GATE=()
      while IFS= read -r -d '' f; do PRE_GATE[$f]=1; done < <(git diff -z --name-only HEAD; git ls-files -z --others --exclude-standard)
      # one build/stamp/test command, killed when the gate's budget runs out: nothing here may run past it. Any failure
      # that ends at or after the deadline is a cut (exit 124), whatever the status: timeout's 124, 137 after the KILL
      # that follows a TERM the step ignored, or any other signal death. A 137 before the deadline (out of memory)
      # stays a failure.
      gate_step() {
        local left rc
        left=$((GATE_DEADLINE - $(date +%s)))
        [ "$left" -gt 0 ] || return 124
        run timeout -k "${OPAX_GATE_KILL_GRACE:-30}" "$left" "$@"; rc=$?
        if [ "$rc" -ne 0 ] && { [ "$rc" = 124 ] || [ "$(date +%s)" -ge "$GATE_DEADLINE" ]; }; then return 124; fi
        return "$rc"
      }
      # build (what the deploy job does before its tests: rebuild the search catalog and the derived modules from the
      # public data, ~50 s), stamp, test; with arguments only those test files run. Sets SUITE_SECS and SUITE_RC on
      # every exit path (a failed build or stamp is a red run, 124 one cut by the budget).
      run_suite() {
        local t0 rc=0
        t0=$(date +%s)
        rm -f "$GATE_JUNIT"
        if [ "${OPAX_GATE_BUILD:-1}" != 0 ]; then (cd "$REPO/portal" && gate_step "$NPM" run build:search) || rc=$?; fi
        [ "$rc" -ne 0 ] || (cd "$REPO" && gate_step "$NODE" scripts/stamp_assets.mjs) || rc=$?
        if [ "$rc" -eq 0 ]; then
          if [ "$#" -gt 0 ]; then
            (cd "$REPO/portal" && gate_step "$NODE" --test --test-reporter=dot --test-reporter-destination=stdout \
               --test-reporter=junit --test-reporter-destination="$GATE_JUNIT" "$@") || rc=$?
          else
            (cd "$REPO/portal" && gate_step "$NODE" --test --test-reporter=dot --test-reporter-destination=stdout \
               --test-reporter=junit --test-reporter-destination="$GATE_JUNIT" test/*.test.mjs) || rc=$?
          fi
        fi
        [ "$rc" != 124 ] || log "portal gate: a step was cut at the ${OPAX_GATE_BUDGET:-45m} budget"
        SUITE_SECS=$(($(date +%s) - t0)); SUITE_RC=$rc
        return "$rc"
      }
      # the test files with a failing test in the last run (portal-relative), from its JUnit report
      failing_files() {
        "$PY" - "$GATE_JUNIT" <<'PYEOF' 2>/dev/null
import sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except (OSError, ET.ParseError):
    sys.exit(0)
files = set()
for case in root.iter('testcase'):
    if case.get('failure') is not None or case.find('failure') is not None or case.find('error') is not None:
        f = case.get('file') or ''
        if '/test/' in f:
            files.add('test/' + f.rsplit('/test/', 1)[1])
print('\n'.join(sorted(files)))
PYEOF
      }
      # 0 when the tracked file $1 differs from HEAD in its `?v=<hash>` content stamps and nothing else
      stamp_only() {
        "$PY" - "$1" <<'PYEOF' 2>/dev/null
import re, subprocess, sys
path = sys.argv[1]
strip = lambda b: re.sub(rb'\?v=[0-9a-f]{6,}', b'?v=', b)
try:
    head = subprocess.run(['git', 'show', 'HEAD:' + path], capture_output=True, check=True).stdout
    now = open(path, 'rb').read()
except (OSError, subprocess.CalledProcessError):
    sys.exit(1)
sys.exit(0 if head != now and strip(head) == strip(now) else 1)
PYEOF
      }
      duration_secs() { local v=$1; case $v in *h) echo $((${v%h} * 3600)) ;; *m) echo $((${v%m} * 60)) ;; *s) echo "${v%s}" ;; *) echo "$v" ;; esac; }
      GATE_BUDGET=$(duration_secs "${OPAX_GATE_BUDGET:-45m}")
      GATE_START=$(date +%s); GATE_DEADLINE=$((GATE_START + GATE_BUDGET))
      # 1 when the last build was made from exactly the data that stays (a green first run, or a green closing run);
      # otherwise every gate group is back at HEAD and so must be everything the trials' builds derived
      GATE_REBUILT=1
      log "portal tests against the new data (${gate_groups[*]})"
      if ! run_suite; then
        GATE_REBUILT=0
        FULL_SECS=$SUITE_SECS; LAST_SECS=$SUITE_SECS
        mapfile -t FOCUS < <(failing_files)
        log "portal tests red in ${FULL_SECS}s; failing files: ${FOCUS[*]:-unknown (every trial runs the whole suite)}; finding the groups to blame (budget ${GATE_BUDGET}s)"
        BK="$PIPE/gate-backup"; rm -rf "$BK"; mkdir -p "$BK"
        backup_group() {
          local g=$1 paths
          read -ra paths <<<"${GROUP_PATHS[$g]}"
          [ "$g" != bills ] || BILLS_GATE_BACKUP_OK=$BILLS_REFRESH_OK
          case "$g" in votes|divisions|seovotes) DIVISIONS_GATE_BACKUP_OK=$DIVISIONS_REFRESH_OK ;; esac
          [ "$g" != divisions ] || DIVISIONS_GATE_BACKUP_ROLLBACK=${DIVISIONS_PAGES_ROLLED_BACK:-0}
          [ "$g" != evidence ] || EVIDENCE_GATE_BACKUP_OK=$EVIDENCE_REFRESH_OK
          tar cf "$BK/$g.tar" -- "${paths[@]}" 2>/dev/null || true
        }
        restore_group() {
          local g=$1 paths
          read -ra paths <<<"${GROUP_PATHS[$g]}"
          rm -rf -- "${paths[@]}"
          if tar xf "$BK/$g.tar" 2>/dev/null; then
            # A trial rollback was innocent: restore acceptance with the files.
            [ "$g" != bills ] || BILLS_REFRESH_OK=$BILLS_GATE_BACKUP_OK
            case "$g" in votes|divisions|seovotes) DIVISIONS_REFRESH_OK=$DIVISIONS_GATE_BACKUP_OK ;; esac
            [ "$g" != divisions ] || DIVISIONS_PAGES_ROLLED_BACK=$DIVISIONS_GATE_BACKUP_ROLLBACK
            [ "$g" != evidence ] || EVIDENCE_REFRESH_OK=$EVIDENCE_GATE_BACKUP_OK
          else
            fail "cannot restore test backup for $g"
          fi
        }
        # one focused run, if the budget still has room for it and for the closing full run: 0 green, 1 red, 2 no time
        gate_trial() {
          local left=$((GATE_BUDGET - ($(date +%s) - GATE_START)))
          [ "$left" -ge $((LAST_SECS + FULL_SECS)) ] || return 2
          run_suite "${FOCUS[@]+"${FOCUS[@]}"}"; local rc=$?
          LAST_SECS=$SUITE_SECS
          [ "$rc" != 124 ] || return 2   # cut by the budget: proves nothing about the set
          return $((rc == 0 ? 0 : 1))
        }
        for group in "${gate_groups[@]}"; do backup_group "$group"; done
        for group in "${gate_groups[@]}"; do revert_group "$group"; done
        kept=(); culprits=(); untried=()
        gate_trial; trc=$?
        # one group alone, red with it and green without it: no trial needed to name it
        if [ "$trc" = 0 ] && [ "${#gate_groups[@]}" = 1 ]; then culprits=("${gate_groups[0]}"); gate_groups_left=(); else gate_groups_left=("${gate_groups[@]}"); fi
        if [ "$trc" -ne 0 ]; then
          untried=("${gate_groups[@]}")
          if [ "$trc" = 1 ]; then
            # reverted checked each group is exactly HEAD again (new files removed), so this is not tonight's data.
            fail "portal tests fail even with every changed group (${gate_groups[*]}) put back to HEAD and its new files removed: the suite is red on main itself (or a test too slow for this box); nothing published tonight except corpus.json"
          else
            fail "portal tests red (${FOCUS[*]:-whole suite}) and no time left in the ${OPAX_GATE_BUDGET:-45m} gate budget to find out why: ${gate_groups[*]} held, not published tonight"
          fi
        else
          # Sets of groups still to try, each "u:" or "s:" plus a space-separated list. A red set splits into its first
          # half (u:) and second half (s:), queued together. When the first half proves green, the second is red without a
          # run (the whole was red on top of the same kept groups): it is split again, or named if it is one group. When
          # the first half is red too, nothing is known about the second, which becomes u:. Start from the two halves
          # of the whole, which the first run showed red.
          n=${#gate_groups_left[@]}; half=$(((n + 1) / 2)); queue=()
          [ "$n" -eq 0 ] || queue=("u:${gate_groups_left[*]:0:$half}")
          [ "$n" -le "$half" ] || queue+=("s:${gate_groups_left[*]:$half}")
          while [ "${#queue[@]}" -gt 0 ]; do
            entry=${queue[0]}; queue=("${queue[@]:1}")
            read -ra set <<<"${entry:2}"
            if [ "${#untried[@]}" -gt 0 ]; then untried+=("${set[@]}"); continue; fi
            if [ "${entry:0:2}" = s: ]; then
              trc=1   # known red: its first half was green
            else
              for group in "${set[@]}"; do restore_group "$group"; done
              gate_trial; trc=$?
              if [ "$trc" = 0 ]; then kept+=("${set[@]}"); continue; fi
              for group in "${set[@]}"; do revert_group "$group"; done
              # red first half: its second half (next in the queue) is unknown again
              if [ "${#queue[@]}" -gt 0 ] && [ "${queue[0]:0:2}" = s: ]; then queue[0]="u:${queue[0]:2}"; fi
            fi
            if [ "$trc" = 2 ]; then untried+=("${set[@]}")
            elif [ "${#set[@]}" = 1 ]; then culprits+=("${set[0]}")
            else
              half=$(((${#set[@]} + 1) / 2))
              queue=("u:${set[*]:0:$half}" "s:${set[*]:$half}" "${queue[@]+"${queue[@]}"}")
            fi
          done
          for group in "${culprits[@]+"${culprits[@]}"}"; do
            fail "portal tests failed against the new $group files (green without them, with ${kept[*]:-no other new group} kept): $group not published tonight"
          done
          [ "${#untried[@]}" -eq 0 ] || fail "the portal-test blame ran out of its ${OPAX_GATE_BUDGET:-45m} budget: ${untried[*]} held untried, not published tonight"
        fi
        if [ "${#kept[@]}" -gt 0 ]; then
          # the kept groups passed the failing files together; prove the whole suite and rebuild the derived files from
          # exactly what will be committed (the last trial may have built from a half that was then put back)
          left=$((GATE_DEADLINE - $(date +%s)))
          if [ "$left" -lt "$FULL_SECS" ]; then
            for group in "${kept[@]}"; do revert_group "$group"; done
            fail "portal tests: no time left in the ${OPAX_GATE_BUDGET:-45m} budget for the closing full run (~${FULL_SECS}s, ${left}s left): ${kept[*]} held too, nothing new published tonight"
          else
            log "portal tests: keeping ${kept[*]}; closing full run"
            if run_suite; then
              GATE_REBUILT=1
            else
              for group in "${kept[@]}"; do revert_group "$group"; done
              fail "portal tests: the closing full run failed with ${kept[*]} (green on the failing files alone; rc=$SUITE_RC): those held too, nothing new published tonight"
            fi
          fi
        else
          # nothing kept: put every gate group back once more
          for group in "${gate_groups[@]}"; do revert_group "$group"; done
        fi
        rm -rf "$BK"
      fi
      if [ "$GATE_REBUILT" != 1 ]; then
        # Every gate group is at HEAD again, but the last build derived files from a trial's data, some under groups
        # that never changed (bills rewrite growth/sponsors, owned by people), and a step cut by the budget may have
        # left one half written: none of that may be staged. The known derived files go back, then every file the
        # gate changed that did not differ before it (put back if HEAD has it, removed if it is new under a data path).
        for p in "${DERIVED_PATHS[@]}"; do
          git cat-file -e "HEAD:$p" 2>/dev/null || continue
          git checkout -q HEAD -- "$p" && git clean -fdq -- "$p" || fail "cannot put the derived $p back to HEAD"
        done
        swept=()
        while IFS= read -r -d '' f; do
          [ -z "${PRE_GATE[$f]:-}" ] || continue
          if git cat-file -e "HEAD:$f" 2>/dev/null; then
            git checkout -q HEAD -- "$f" || fail "cannot put $f back to HEAD"
          else
            ours=false
            for p in "${DATA_PATHS[@]}"; do case "$f" in "$p"/*) ours=true; break ;; esac; done
            [ "$ours" = true ] || continue
            rm -f -- "$REPO/$f" || fail "cannot remove $f"
          fi
          swept+=("$f")
        done < <(git diff -z --name-only HEAD; git ls-files -z --others --exclude-standard)
        [ "${#swept[@]}" -eq 0 ] || log "put back ${#swept[@]} file(s) the gate's builds wrote from held data: ${swept[*]:0:8}"
      fi
      # build outputs that read every group, never ours to commit: leave the checkout clean outside the data paths
      for built in "${BUILD_ONLY_PATHS[@]}"; do
        git checkout -q HEAD -- "$built" 2>/dev/null || true
      done
      # Content stamps follow the generated modules (portal/public/person-paths.js): the last build stamped their
      # importers. A file outside the data paths is committed with the data only when a published group changed a
      # generated module, the last build was made from what stays, and its whole diff is `?v=` stamps; anything else
      # the build or stamp step wrote there goes back to HEAD.
      changed=()
      while IFS= read -r f; do
        ours=false
        for p in "${DATA_PATHS[@]}" "${OTHERS_BEFORE[@]+"${OTHERS_BEFORE[@]}"}"; do case "$f" in "$p"|"$p"/*) ours=true; break ;; esac; done
        [ "$ours" = true ] || changed+=("$f")
      done < <(git diff --name-only)
      stamped=(); unstamped=()
      for f in "${changed[@]+"${changed[@]}"}"; do
        if [ "$GATE_REBUILT" = 1 ] && [ -n "$(git status --porcelain -- portal/public/person-paths.js)" ] && stamp_only "$f"; then
          stamped+=("$f")
        else
          unstamped+=("$f")
        fi
      done
      if [ "${#unstamped[@]}" -gt 0 ]; then
        git checkout -q HEAD -- "${unstamped[@]}" || fail "cannot put back ${unstamped[*]:0:8}"
        log "put back ${#unstamped[@]} file(s) the gate's build wrote outside the data paths: ${unstamped[*]:0:8}"
      fi
      if [ "${#stamped[@]}" -gt 0 ]; then
        STAMPED_FILES=("${stamped[@]}")
        log "restamped ${#stamped[@]} importer(s) of a changed generated module, committed with the data: ${stamped[*]:0:8}"
      fi
    else
      log "WARN: node or portal/node_modules missing: not running the portal tests before committing (${gate_groups[*]} changed)"
    fi
  fi
fi
divisions_restore_dependencies

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

divisions_summary || { fail "cannot summarize retained divisions"; finish; }
bills_summary || { fail "cannot summarize retained bills"; finish; }
evidence_summary
paused_summary

# ---- 6. commit -----------------------------------------------------------------------------------------------
# Re-read HEAD after sync/validation; stage whole published directory roots,
# including new chunks and deletions, without admitting untracked first exports.
mapfile -t DATA_PATHS < <(tracked_data_paths)
if [ "${#DATA_PATHS[@]}" -gt 0 ]; then
  git add -A -- "${DATA_PATHS[@]}" || { fail "could not stage data changes"; finish; }
fi
# the importers the gate restamped for a changed generated module (person-paths.js), so main passes stamp_assets --check
if [ -n "${STAMPED_FILES[*]:-}" ]; then
  git add -- "${STAMPED_FILES[@]}" || { fail "could not stage the restamped importers"; finish; }
fi
others=""
while IFS= read -r line; do
  f=${line:3}; ours=false
  for p in "${DATA_PATHS[@]}" "${STAMPED_FILES[@]+"${STAMPED_FILES[@]}"}"; do case "$f" in "$p"|"$p"/*) ours=true; break ;; esac; done
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
    divisions_refresh_complete
    evidence_refresh_complete
    finish
  fi
else
  parts=(); changed_groups=()
  [ -n "$RESULT_SUMMARY" ] && [ "$KB_CHANGED" = true ] && parts+=("$RESULT_SUMMARY")
  [ "$KB_CHANGED" = true ] || parts+=("$BILLS_SUMMARY")
  if ! git diff --cached --quiet -- portal/public/evidence; then
    [ "$KB_CHANGED" = true ] || parts+=("$EVIDENCE_SUMMARY")
    changed_groups+=(evidence)
  fi
  git diff --cached --quiet -- portal/public/votes.json || parts+=("votes.json")
  for group in "${DATA_GROUPS[@]}"; do
    case $group in bills|evidence|votes|corpus|wrangler) continue ;; esac
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
  [ -z "${STAMPED_FILES[*]:-}" ] || body="$body; and the content stamps of the generated modules they changed (${STAMPED_FILES[*]:0:6})"
  git commit -q -m "$subject" -m "$body." \
    || { fail "git commit failed"; finish; }
  log "committed: $subject"
fi
bills_refresh_complete
divisions_refresh_complete
evidence_refresh_complete
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
