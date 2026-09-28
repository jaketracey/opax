#!/usr/bin/env bash
# scripts/vm/test_nightly.sh -- end-to-end test of scripts/vm/nightly.sh in a sandbox.
#
#   scripts/vm/test_nightly.sh                    # on a Linux box (needs git, python3 + requests, flock)
#   docker run --rm -v "$PWD":/src:ro ubuntu:24.04 bash -c \
#     'apt-get update -qq && apt-get install -y -qq git python3 python3-requests util-linux >/dev/null && bash /src/scripts/vm/test_nightly.sh'
#
# Nothing here touches the network, the real knowledge box, GitHub or the real repo:
# a throwaway HOME, a bare git repo as "origin", a fake daily_refresh.sh, a fake `gh`
# that records its calls, and a knowledge-box snapshot JSON. Each scenario builds a
# fresh sandbox and asserts on what reached origin, what gh was asked to do, and the
# script's exit status.
set -uo pipefail

SRC="${OPAX_TEST_SRC:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
WORK=$(mktemp -d)
trap '[ -n "${OPAX_TEST_KEEP:-}" ] && echo "sandboxes kept in $WORK" || rm -rf "$WORK"' EXIT
PASS=0; FAILN=0
ok()   { PASS=$((PASS+1)); echo "  ok   $*"; }
bad()  { FAILN=$((FAILN+1)); echo "  FAIL $*"; }
check() { # check "description" command...
  local d=$1; shift
  if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi
}

TODAY=$(TZ=Australia/Sydney date +%F)
BASE_TOTAL=$(python3 -c "import json; print(json.load(open('$SRC/portal/public/corpus.json'))['expected_resources'])")
BASE_SPEECH=$(python3 -c "import json; print(json.load(open('$SRC/portal/public/corpus.json'))['collected_speeches'])")

# --- sandbox ---------------------------------------------------------------------------
new_sandbox() {
  SB="$WORK/$1"; rm -rf "$SB"; mkdir -p "$SB"
  export HOME="$SB/home"; mkdir -p "$HOME/.cache/autoresearch/pipeline" "$HOME/.config/opax"
  git config --global user.email test@example.com; git config --global user.name test
  git config --global init.defaultBranch main; git config --global --add safe.directory '*'
  ORIGIN="$SB/origin.git"; git init -q --bare "$ORIGIN"
  local seed="$SB/seed"; mkdir -p "$seed"
  # the files the nightly reads, from the real tree
  for f in scripts/vm/nightly.sh scripts/vm/validate_data.py scripts/vm/scrub_log.py scripts/export_bills.py \
           scripts/verify_bill_briefs.py scripts/update_corpus_manifest.py scripts/bump_cache_epoch.py \
           parli/__init__.py parli/arag.py portal/wrangler.jsonc portal/public/corpus.json; do
    mkdir -p "$seed/$(dirname "$f")"; cp "$SRC/$f" "$seed/$f"
  done
  mkdir -p "$seed/portal/public/bills"
  python3 - "$seed" <<'PYEOF'
import json, sys
seed = sys.argv[1]
def bill(n, briefs):
    return {"key": f"au-federal-t{n}", "title": f"Test Bill {n}", "status": "introduced", "status_as_of": "2026-09-01",
            "speeches": [{"slug": f"s{n}-{i}", "speaker": "A", "date": "2026-09-01", "state": "NSW", "brief": b}
                         for i, b in enumerate(briefs)]}
docs = [bill(1, ["Brief 1-0", "Brief 1-1"]), bill(2, ["Brief 2-0"]), bill(3, [])]
rows = [{"key": d["key"], "title": d["title"], "parliament": 48, "introduced": "2026-08-01", "status": "introduced",
         "status_as_of": d["status_as_of"], "speeches": len(d["speeches"])} for d in docs]
for d in docs:
    open(f"{seed}/portal/public/bills/{d['key']}.json", "w").write(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
index = {"generated_at": "2026-09-21T12:00:00+00:00", "count": len(rows), "meta": {"mode": "registry"}, "bills": rows}
open(f"{seed}/portal/public/bills/index.json", "w").write(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
open(f"{seed}/portal/public/votes.json", "w").write(json.dumps({"divisions": [{"id": i} for i in range(400)]}) + "\n")
PYEOF
  (cd "$seed" && git init -q && git add -A && git commit -q -m seed && git remote add origin "$ORIGIN" && git push -q origin HEAD:main)
  REPO="$HOME/opax"; git clone -q "$ORIGIN" "$REPO"
  mkdir -p "$REPO/.venv/bin"; ln -s "$(command -v python3)" "$REPO/.venv/bin/python"
  # state the preflight looks for
  : > "$HOME/.cache/autoresearch/parli.db"
  echo '{"tables":{"speeches":{"after":1323635,"pushed":600482,"failed":{}}}}' > "$HOME/.cache/autoresearch/arag_sync_state.json"
  printf 'ARAG_ZONE=aws-ap-southeast-2-1\nARAG_KB_ID=kb-test\nARAG_KB_TOKEN=tokentokentoken\nOPENAUSTRALIA_API_KEY=SECRETVALUE123456\n' > "$REPO/.env"
  printf 'GH_TOKEN=ghp_faketokenfaketokenfaketoken123456\nOPAX_MIN_FREE_GB=0\nOPAX_SETTLE_SECONDS=0\n' > "$HOME/.config/opax/nightly.env"
  # the brief cache the Mac copy provides: every seeded speech has a brief
  python3 - <<PYEOF
import json
c = {"s1-0": "Brief 1-0", "s1-1": "Brief 1-1", "s2-0": "Brief 2-0"}
json.dump(c, open("$HOME/.cache/autoresearch/bill_speech_briefs.json", "w"))
PYEOF
  # a knowledge box that grew by 50 speeches since the committed manifest
  python3 - "$SRC" "$SB/kb.json" "${KB_GROWTH:-50}" <<'PYEOF'
import json, sys
src, out, growth = sys.argv[1], sys.argv[2], int(sys.argv[3])
c = json.load(open(f"{src}/portal/public/corpus.json"))
kinds = dict(c["refresh"]["resource_counts"]); kinds["speech"] += growth
json.dump({"resources": c["expected_resources"] + growth, "kinds": kinds, "sources": {}}, open(out, "w"))
PYEOF
  export OPAX_KB_SNAPSHOT="$SB/kb.json"
  # fake gh + fake refresh
  mkdir -p "$SB/bin" "$SB/capture"; export GH_LOG="$SB/gh.log" GH_CAPTURE="$SB/capture"; : > "$GH_LOG"
  cat > "$SB/bin/gh" <<'GHEOF'
#!/usr/bin/env bash
echo "gh $*" >> "$GH_LOG"
case "$1 $2" in
  "issue list") ;;                               # no existing issue
  "issue create"|"issue comment")
    for ((i=1;i<=$#;i++)); do if [ "${!i}" = "--body-file" ]; then j=$((i+1)); cp "${!j}" "$GH_CAPTURE/issue-body.md"; fi; done
    echo "https://github.com/x/y/issues/1" ;;
esac
exit 0
GHEOF
  chmod +x "$SB/bin/gh"
  cat > "$SB/fake_refresh.sh" <<'FREOF'
#!/usr/bin/env bash
# stands in for scripts/daily_refresh.sh: writes a daily.log block and rewrites the data files
# the way the real exporters do (every bill speech brief comes out null)
PIPE="$HOME/.cache/autoresearch/pipeline"
if [ -f .env ]; then set -a; . ./.env; set +a; fi   # like the real script
sleep 1
[ "${FAKE_MODE:-ok}" = noblock ] && { echo "fake: exiting without doing anything"; exit 0; }
{
  echo "$(date '+%F %T') ===== daily refresh start (since=2026-08-29, timeout/step=3h, host=fake) ====="
  echo "$(date '+%F %T') [nsw] OK in 5s; rows 100 -> 130 (+30); log /x"
  echo "$(date '+%F %T') [sa] FAIL(rc=1) (allowed) in 1s; rows 5 -> 5 (+0); log /x"
  echo "$(date '+%F %T')   openaustralia      newest 2026-09-17  rows 10"
  echo "$(date '+%F %T')   nsw_hansard        newest 2026-09-24  rows 10"
  echo "$(date '+%F %T')   vic_hansard        newest 2026-09-24  rows 10"
  echo "$(date '+%F %T')   qld_hansard        newest 2026-09-16  rows 10"
  echo "$(date '+%F %T')   committee_senate   newest 2026-06-05  rows 10"
  echo "$(date '+%F %T') ===== daily refresh end ====="
} >> "$PIPE/daily.log"
echo "GET https://www.openaustralia.org.au/api/getDebates?key=$OPENAUSTRALIA_API_KEY&date=2026-09-28"
python3 - <<'PYEOF'
import glob, json
for p in glob.glob("portal/public/bills/au-federal-t*.json"):
    d = json.load(open(p))
    d["status_as_of"] = "2026-09-28"
    for s in d["speeches"]:
        s["brief"] = None
    open(p, "w").write(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
idx = json.load(open("portal/public/bills/index.json"))
idx["generated_at"] = "2026-09-29T03:40:00+00:00"
for r in idx["bills"]:
    r["status_as_of"] = "2026-09-28"
open("portal/public/bills/index.json", "w").write(json.dumps(idx, ensure_ascii=False, indent=1) + "\n")
v = json.load(open("portal/public/votes.json"))
if {"id": "new"} not in v["divisions"]:
    v["divisions"].append({"id": "new"})
open("portal/public/votes.json", "w").write(json.dumps(v) + "\n")
PYEOF
if [ "${FAKE_MODE:-ok}" = race ]; then   # someone else pushes to origin while we run
  other=$(mktemp -d); git clone -q "$ORIGIN" "$other"; echo hi > "$other/HUMAN.txt"
  (cd "$other" && git add -A && git commit -q -m "a human commit" && git push -q origin HEAD:main)
fi
if [ "${FAKE_MODE:-ok}" = failsteps ]; then
  echo "$(date '+%F %T') Incomplete refresh: failed steps nsw" >> "$PIPE/daily.log"; exit 1
fi
exit 0
FREOF
  chmod +x "$SB/fake_refresh.sh"
  export OPAX_DAILY_REFRESH="$SB/fake_refresh.sh" OPAX_REPO="$REPO" ORIGIN
  export PATH="$SB/bin:$PATH"
}

nightly() { (cd "$REPO" && bash scripts/vm/nightly.sh >"$SB/nightly.out" 2>&1); NRC=$?; }
origin_show() { git --git-dir="$ORIGIN" show "main:$1"; }
origin_log()  { git --git-dir="$ORIGIN" log --format=%s main; }
gh_calls()    { grep -c "$1" "$GH_LOG" || true; }

# --- scenarios -------------------------------------------------------------------------------
echo "== 1. happy night: refresh ok, box grew, everything published and the deploy dispatched"
new_sandbox s1
FAKE_MODE=ok nightly
check "exit 0" test "$NRC" -eq 0
check "a nightly commit reached origin" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q '^Nightly refresh $TODAY: '"
check "commit subject names the growth" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q 'speech +50'"
check "corpus.json carries the new total" bash -c "git --git-dir='$ORIGIN' show main:portal/public/corpus.json | python3 -c 'import json,sys; c=json.load(sys.stdin); assert c[\"expected_resources\"]==$BASE_TOTAL+50 and c[\"version\"]==\"$TODAY\" and c[\"collected_speeches\"]==$BASE_SPEECH+50'"
check "CACHE_EPOCH bumped in both places" bash -c "[ \$(git --git-dir='$ORIGIN' show main:portal/wrangler.jsonc | grep -c '\"CACHE_EPOCH\": \"$TODAY-nightly\"') -eq 2 ]"
check "bills went through with briefs restored" bash -c "git --git-dir='$ORIGIN' show main:portal/public/bills/au-federal-t1.json | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d[\"status_as_of\"]==\"2026-09-28\" and d[\"speeches\"][0][\"brief\"]==\"Brief 1-0\"'"
check "votes.json published" bash -c "git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"'"
check "only data files changed" bash -c "[ -z \"\$(git --git-dir='$ORIGIN' diff --name-only main~1 main | grep -vE '^portal/(public/(bills/|votes.json|corpus.json)|wrangler.jsonc)')\" ]"
check "deploy workflow dispatched once" test "$(gh_calls 'workflow run deploy.yml --repo jaketracey/opax --ref main')" -eq 1
check "no issue opened" test "$(gh_calls 'issue create')" -eq 0
check "status file says ok" grep -q '"status": "ok"' "$HOME/.cache/autoresearch/pipeline/nightly-last.json"
check "log file written" test -s "$HOME/.cache/autoresearch/pipeline/nightly-$TODAY.log"

echo "== 2. rerun straight away: nothing changed, so nothing committed and no second deploy"
before=$(git --git-dir="$ORIGIN" rev-parse main)
FAKE_MODE=ok nightly
check "exit 0" test "$NRC" -eq 0
check "origin untouched" test "$(git --git-dir="$ORIGIN" rev-parse main)" = "$before"
check "no second dispatch" test "$(gh_calls 'workflow run')" -eq 1
check "says nothing to publish" grep -q 'no data changes tonight' "$SB/nightly.out"

echo "== 3. refresh reports failed steps: still publishes, opens the failure issue, exits 1"
new_sandbox s3
FAKE_MODE=failsteps nightly
check "exit 1" test "$NRC" -eq 1
check "data still published" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q '^Nightly refresh'"
check "issue opened with the dated title" bash -c "grep -q 'issue create.*--title Nightly refresh failed $TODAY' '$GH_LOG'"
check "issue names the failed step" grep -q 'failed steps: nsw' "$GH_CAPTURE/issue-body.md"
check "the API key is masked in the issue" bash -c "! grep -q SECRETVALUE123456 '$GH_CAPTURE/issue-body.md' && grep -q 'key=\\*\\*\\*' '$GH_CAPTURE/issue-body.md'"
check "the GH token is not in the log" bash -c "! grep -q ghp_faketoken '$HOME/.cache/autoresearch/pipeline/nightly-$TODAY.log'"
check "deploy still dispatched" test "$(gh_calls 'workflow run')" -eq 1

echo "== 4. a bill loses its brief: bills reverted, the rest publishes, issue opened"
new_sandbox s4
python3 - <<PYEOF
import json, os, time
p = os.path.expanduser("~/.cache/autoresearch/bill_speech_briefs.json")
c = json.load(open(p)); c["s2-0"] = None; json.dump(c, open(p, "w"))
# checked a moment ago, so the box is not asked again tonight and the speech stays empty
json.dump({"s2-0": time.time()}, open(os.path.expanduser("~/.cache/autoresearch/bill_speech_briefs.checked.json"), "w"))
PYEOF
FAKE_MODE=ok nightly
check "exit 1" test "$NRC" -eq 1
check "bill files were not published" bash -c "git --git-dir='$ORIGIN' show main:portal/public/bills/au-federal-t2.json | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d[\"speeches\"][0][\"brief\"]==\"Brief 2-0\" and d[\"status_as_of\"]==\"2026-09-01\"'"
check "votes and corpus still published" bash -c "git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"' && git --git-dir='$ORIGIN' show main:portal/public/corpus.json | grep -q '$TODAY'"
check "issue mentions the lost briefs" grep -q 'briefs lost' "$GH_CAPTURE/issue-body.md"

echo "== 5. the refresh never ran: nothing published, issue opened"
new_sandbox s5
FAKE_MODE=noblock nightly
check "exit 1" test "$NRC" -eq 1
check "origin untouched" test "$(git --git-dir="$ORIGIN" log --format=%s main | head -1)" = seed
check "no deploy" test "$(gh_calls 'workflow run')" -eq 0
check "issue opened" test "$(gh_calls 'issue create')" -eq 1

echo "== 6. someone pushes to origin while the nightly runs: rebase and retry"
new_sandbox s6
FAKE_MODE=race nightly
check "exit 0" test "$NRC" -eq 0
check "human commit and nightly commit both on origin" bash -c "git --git-dir='$ORIGIN' log --format=%s main | grep -q 'a human commit' && git --git-dir='$ORIGIN' log --format=%s main | grep -q '^Nightly refresh'"
check "deploy dispatched" test "$(gh_calls 'workflow run')" -eq 1

echo "== 7. no token: publishes, cannot deploy or file an issue, still says so"
new_sandbox s7
sed -i '/GH_TOKEN/d' "$HOME/.config/opax/nightly.env"
FAKE_MODE=ok nightly
check "exit 1 (deploy could not be dispatched)" test "$NRC" -eq 1
check "no gh calls at all" test ! -s "$GH_LOG"
check "failure recorded in the log" grep -q 'cannot dispatch deploy.yml' "$HOME/.cache/autoresearch/pipeline/nightly-$TODAY.log"

echo "== 8. NO_PUSH: commits locally, never touches origin or gh"
new_sandbox s8
OPAX_NIGHTLY_NO_PUSH=1 FAKE_MODE=ok nightly
check "exit 0" test "$NRC" -eq 0
check "origin untouched" test "$(git --git-dir="$ORIGIN" log --format=%s main | head -1)" = seed
check "local commit made" bash -c "git -C '$REPO' log --format=%s | head -1 | grep -q '^Nightly refresh'"
check "no gh calls" test ! -s "$GH_LOG"

echo "== 12. the push is refused, then works: the local commit survives and goes out on the next run"
new_sandbox s12
export OPAX_PUSH_SLEEP_UNIT=0
printf '#!/bin/sh\necho "remote: push refused by test hook" >&2\nexit 1\n' > "$ORIGIN/hooks/pre-receive"; chmod +x "$ORIGIN/hooks/pre-receive"
FAKE_MODE=ok nightly
check "exit 1" test "$NRC" -eq 1
check "origin untouched" test "$(git --git-dir="$ORIGIN" log --format=%s main | head -1)" = seed
check "commit kept locally" bash -c "git -C '$REPO' log --format=%s | head -1 | grep -q '^Nightly refresh'"
check "no deploy dispatched" test "$(gh_calls 'workflow run')" -eq 0
check "issue opened" test "$(gh_calls 'issue create')" -eq 1
rm -f "$ORIGIN/hooks/pre-receive"
FAKE_MODE=ok nightly
check "second run exits 0" test "$NRC" -eq 0
check "the earlier commit reached origin" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q '^Nightly refresh'"
check "and exactly one nightly commit exists" test "$(git --git-dir="$ORIGIN" log --format=%s main | grep -c '^Nightly refresh')" -eq 1
check "deploy dispatched now" test "$(gh_calls 'workflow run')" -eq 1
unset OPAX_PUSH_SLEEP_UNIT

echo "== 13. origin moved on while a local commit was unpushed: rebase it, no duplicate"
new_sandbox s13
export OPAX_PUSH_SLEEP_UNIT=0
printf '#!/bin/sh\nexit 1\n' > "$ORIGIN/hooks/pre-receive"; chmod +x "$ORIGIN/hooks/pre-receive"
FAKE_MODE=ok nightly
rm -f "$ORIGIN/hooks/pre-receive"
other=$(mktemp -d); git clone -q "$ORIGIN" "$other"; echo hi > "$other/HUMAN.txt"; (cd "$other" && git add -A && git commit -q -m "a human commit" && git push -q origin HEAD:main)
FAKE_MODE=ok nightly
check "exit 0" test "$NRC" -eq 0
check "human commit and the nightly commit both on origin" bash -c "git --git-dir='$ORIGIN' log --format=%s main | grep -q 'a human commit' && git --git-dir='$ORIGIN' log --format=%s main | grep -q '^Nightly refresh'"
check "still exactly one nightly commit" test "$(git --git-dir="$ORIGIN" log --format=%s main | grep -c '^Nightly refresh')" -eq 1
unset OPAX_PUSH_SLEEP_UNIT

# --- daily_refresh.sh itself: allowed failures and the KB-push gate --------------------------------------
new_refresh_sandbox() {
  RS="$WORK/$1"; rm -rf "$RS"; mkdir -p "$RS/repo/scripts" "$RS/repo/.venv/bin" "$RS/repo/portal/public" "$RS/home"
  export HOME="$RS/home"; mkdir -p "$HOME/.cache/autoresearch"
  unset OPAX_REPO OPAX_DAILY_REFRESH OPAX_ALLOW_FAIL OPAX_SYNC_GATE OPAX_SYNC_KB   # nothing left over from the nightly scenarios
  cp "$SRC/scripts/daily_refresh.sh" "$SRC/scripts/refresh_bills.sh" "$RS/repo/scripts/"
  : > "$RS/repo/.env"; : > "$RS/repo/download_hansard_fast.py"
  mkdir -p "$RS/repo/portal/public/bills"; echo '{"bills":[]}' > "$RS/repo/portal/public/bills/index.json"
  echo '{"tables":{"speeches":{"after":1323635,"pushed":600482,"failed":{}}}}' > "$HOME/.cache/autoresearch/arag_sync_state.json"
  # a python that succeeds at everything except the steps named in FAIL_STEPS, and records each module it is asked to run
  cat > "$RS/repo/.venv/bin/python" <<'PYSTUB'
#!/usr/bin/env bash
echo "$*" >> "$RS_CALLS"
if [ "${1:-}" = "-" ]; then
  case "${2:-}" in *.json) exit 0 ;; "") cat >/dev/null; exit 0 ;; *) cat >/dev/null; echo 0; exit 0 ;; esac
fi
if [ "${1:-}" = "-m" ]; then
  for f in ${FAIL_STEPS:-}; do [ "$2" = "parli.ingest.$f" ] && exit 1; done
fi
exit 0
PYSTUB
  chmod +x "$RS/repo/.venv/bin/python" "$RS/repo/scripts/daily_refresh.sh"
  export RS_CALLS="$RS/calls.log"; : > "$RS_CALLS"
}
refresh() { (cd "$RS" && "$RS/repo/scripts/daily_refresh.sh" >"$RS/out.txt" 2>&1); RRC=$?; }

echo "== 9. daily_refresh.sh: a failing sa step makes the run incomplete unless it is allowed"
new_refresh_sandbox r9
FAIL_STEPS=sa_hansard refresh
check "exit 1 without OPAX_ALLOW_FAIL" test "$RRC" -eq 1
check "log says incomplete: sa" grep -q 'Incomplete refresh: failed steps sa' "$HOME/.cache/autoresearch/pipeline/daily.log"
new_refresh_sandbox r9b
OPAX_ALLOW_FAIL=sa FAIL_STEPS=sa_hansard refresh
check "exit 0 with OPAX_ALLOW_FAIL=sa" test "$RRC" -eq 0
check "the failure is still logged, marked allowed" grep -q '\[sa\] FAIL(rc=1) (allowed)' "$HOME/.cache/autoresearch/pipeline/daily.log"
check "REPO comes from the script's own location" grep -q "since=" "$HOME/.cache/autoresearch/pipeline/daily.log"

echo "== 10. daily_refresh.sh: the KB push waits for OPAX_SYNC_GATE steps"
new_refresh_sandbox r10
OPAX_SYNC_KB=1 OPAX_ALLOW_FAIL=sa OPAX_SYNC_GATE=link_speakers,classify FAIL_STEPS="sa_hansard link_speakers" refresh
check "exit 1" test "$RRC" -eq 1
check "arag_sync was skipped and said why" grep -q '\[arag_sync\] SKIP: gate step(s) failed: link_speakers' "$HOME/.cache/autoresearch/pipeline/daily.log"
check "the push module was never run" bash -c "! grep -q 'parli.ingest.arag_sync' '$RS_CALLS'"
check "votes refresh still ran" grep -q 'parli.ingest.tvfy_refresh' "$RS_CALLS"
new_refresh_sandbox r10b
OPAX_SYNC_KB=1 OPAX_ALLOW_FAIL=sa OPAX_SYNC_GATE=link_speakers,classify FAIL_STEPS="sa_hansard" refresh
check "exit 0 when the gate steps pass" test "$RRC" -eq 0
check "arag_sync ran" grep -q 'parli.ingest.arag_sync --tables speeches --full' "$RS_CALLS"
new_refresh_sandbox r10c
OPAX_SYNC_KB=1 FAIL_STEPS="link_speakers" refresh
check "without a gate the push still runs (the old behaviour)" grep -q 'parli.ingest.arag_sync' "$RS_CALLS"

echo "== 11. daily_refresh.sh: the cutover marker keeps the desktop off the knowledge box"
new_refresh_sandbox r11
touch "$HOME/.cache/autoresearch/MIGRATED_TO_VM"
OPAX_SYNC_KB=1 refresh
check "refuses with OPAX_SYNC_KB=1 (exit 3)" test "$RRC" -eq 3
check "says why" grep -q 'REFUSING to run with OPAX_SYNC_KB=1' "$RS/out.txt"
check "ran nothing" test ! -s "$RS_CALLS"
new_refresh_sandbox r11b
touch "$HOME/.cache/autoresearch/MIGRATED_TO_VM"
refresh
check "a local-only refresh (no KB sync) is still allowed" test "$RRC" -eq 0
check "and it never touched the box" bash -c "! grep -q 'parli.ingest.arag_sync' '$RS_CALLS'"
new_refresh_sandbox r11c
touch "$HOME/.cache/autoresearch/MIGRATED_TO_VM"
OPAX_SYNC_KB=1 OPAX_FORCE_KB_SYNC=1 refresh
check "the explicit override works" grep -q 'parli.ingest.arag_sync' "$RS_CALLS"

echo
echo "passed $PASS, failed $FAILN"
[ "$FAILN" -eq 0 ]
