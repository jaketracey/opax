#!/usr/bin/env bash
# scripts/vm/test_nightly.sh -- end-to-end test of scripts/vm/nightly.sh in a sandbox.
#
#   scripts/vm/test_nightly.sh                    # on a Linux box (needs git, python3 + requests, flock, sqlite3)
#   docker run --rm -v "$PWD":/src:ro ubuntu:24.04 bash -c \
#     'apt-get update -qq && apt-get install -y -qq git python3 python3-requests util-linux sqlite3 >/dev/null && bash /src/scripts/vm/test_nightly.sh'
# (scripts/vm/export_people.sh reads the members table with the sqlite3 CLI; without it the weekly
# scenarios fail.)
#
# Nothing here touches the network, the real knowledge box, GitHub or the real repo:
# a throwaway HOME, a bare git repo as "origin", a fake daily_refresh.sh and a knowledge-box
# snapshot JSON. Each scenario builds a fresh sandbox and asserts on what reached origin
# (main and the nightly-status branch) and on the script's exit status.
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
  local fixture_exporters=()
  # the files the nightly reads, from the real tree
  # Bills imports roster_identity, which in turn imports parli.ingest.speaker_names.
  for f in scripts/vm/nightly.sh scripts/vm/run-nightly.sh scripts/vm/poweroff-if-idle.sh scripts/vm/validate_data.py scripts/vm/data_groups.sh scripts/export_bills.py scripts/roster_identity.py \
           scripts/vm/bills_refresh.sh scripts/vm/bills_guard.py scripts/vm/keep_if_unchanged.py \
           scripts/vm/evidence_refresh.sh scripts/vm/evidence_guard.py scripts/vm/evidence_inputs.py \
           scripts/bills_registry/bills_stages.py \
           scripts/export_division_pages.py scripts/export_recent_votes.py scripts/export_votes.py \
           scripts/verify_bill_briefs.py scripts/update_corpus_manifest.py scripts/bump_cache_epoch.py \
           parli/__init__.py parli/arag.py parli/ingest/__init__.py parli/ingest/speaker_names.py \
           portal/wrangler.jsonc portal/public/corpus.json; do
    mkdir -p "$seed/$(dirname "$f")"
    cp "$SRC/$f" "$seed/$f" || { bad "cannot copy fixture dependency: $f"; exit 1; }
    case "$f" in scripts/export_*.py) fixture_exporters+=("$f");; esac
  done
  # Check the copied exporters in isolation: the real checkout must not fill
  # gaps in this allowlist, and import failures must not become nightly failures.
  if ! python3 -I "$SRC/scripts/vm/check_fixture_imports.py" "$seed" "${fixture_exporters[@]}"; then
    bad "fixture exporter imports are incomplete ($1)"
    exit 1
  fi
  # Acquisition is stubbed: fake_refresh below already writes the bill fixtures.
  # The focused bills suite exercises the real fetch/export wrapper with stubs.
  printf '#!/usr/bin/env bash\n[ "$OPAX_SYNC_KB" = 0 ]\n' > "$seed/scripts/refresh_bills.sh"
  cp "$SRC/tests/fixtures/evidence-nightly/export_stub.py" "$seed/scripts/export_evidence_layers.py"
  cp "$SRC/tests/fixtures/evidence-nightly/audit_stub.py" "$seed/scripts/audit_evidence_export.py"
  python3 "$SRC/tests/fixtures/evidence-nightly/seed.py" "$seed/portal/public/evidence"
  mkdir -p "$seed/portal/public/bills"
  python3 - "$seed" <<'PYEOF'
import importlib.util, json, pathlib, sys
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
votes = {str(i): {"name": f"Member {i}", "jurisdiction": "federal", "for": [], "against": []} for i in range(400)}
votes['_meta'] = {"schema": 1}
open(f"{seed}/portal/public/votes.json", "w").write(json.dumps(votes) + "\n")
seo = pathlib.Path(seed) / 'portal/public/seo'; seo.mkdir()
(seo / 'recent-votes.json').write_text(json.dumps({'_meta': {'schema': 1, 'source': 'opax-parli-db', 'coverage': 'unavailable', 'person_count': 0, 'limit': 10}, 'people': {}}) + '\n')
spec = importlib.util.spec_from_file_location('division_fixture', f'{seed}/scripts/export_division_pages.py')
D = importlib.util.module_from_spec(spec); spec.loader.exec_module(D)
division = {'key': 'federal-senate-1', 'slug': 'division-federal-senate-1', 'name': 'Fixture question',
 'question': 'Fixture question', 'date': '2026-09-01', 'house': 'senate', 'jurisdiction': 'federal',
 'ayes': 1, 'noes': 0, 'result': 'affirmative', 'source_url': 'https://example.test/division',
 'members': [{'name': 'Member 0', 'person_id': '0', 'person_slug': 'member-0', 'vote': 'aye'}], 'bills': [],
 '_meta': {'schema': 1, 'source': 'parli.db-ext-divisions', 'member_coverage': 'recorded'}}
D.write_projection({division['key']: division}, pathlib.Path(seed) / 'portal/public/divisions')
open(f"{seed}/portal/public/speakers.json", "w").write(json.dumps([{"id": i, "name": f"Speaker {i}"} for i in range(100)]) + "\n")
PYEOF
  (cd "$seed" && git init -q && git add -A && git commit -q -m seed && git remote add origin "$ORIGIN" && git push -q origin HEAD:main)
  REPO="$HOME/opax"; git clone -q "$ORIGIN" "$REPO"
  mkdir -p "$REPO/.venv/bin"; ln -s "$(command -v python3)" "$REPO/.venv/bin/python"
  # state the preflight looks for
  python3 "$SRC/tests/fixtures/evidence-nightly/inputs.py" "$HOME/.cache/autoresearch"
  python3 - "$HOME/.cache/autoresearch/parli.db" <<'PYEOF'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.executescript('''
    CREATE TABLE ext_divisions (id TEXT, name TEXT, question TEXT, date TEXT, house TEXT,
     jurisdiction TEXT, ayes_count INT, noes_count INT, result TEXT, source_url TEXT);
    CREATE TABLE ext_votes (division_id TEXT, person_id TEXT, person_name TEXT, person_key TEXT,
     vote TEXT, jurisdiction TEXT, party TEXT);
    INSERT INTO ext_divisions VALUES ('federal-senate-1','Fixture question','Fixture question','2026-09-01',
     'senate','federal',1,0,'affirmative','https://example.test/division');
    INSERT INTO ext_votes VALUES ('federal-senate-1','0','Member 0','Member 0','aye','federal',NULL);
    ''')
PYEOF
  echo '{"tables":{"speeches":{"after":1323635,"pushed":600482,"failed":{}}}}' > "$HOME/.cache/autoresearch/arag_sync_state.json"
  printf 'ARAG_ZONE=aws-ap-southeast-2-1\nARAG_KB_ID=kb-test\nARAG_KB_TOKEN=tokentokentoken\nOPENAUSTRALIA_API_KEY=SECRETVALUE123456\n' > "$REPO/.env"
  printf 'OPAX_MIN_FREE_GB=0\nOPAX_SETTLE_SECONDS=0\n' > "$HOME/.config/opax/nightly.env"
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
  # fake refresh
  mkdir -p "$SB/bin"
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
  [ "${FAKE_MODE:-ok}" = partial ] && echo "$(date '+%F %T') Partial daily refresh: cut by its time limit, resumes from its checkpoint next run: arag_sync"
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
v.setdefault('new', {'name': 'New Member', 'jurisdiction': 'federal', 'for': [], 'against': []})
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
  # stands in for scripts/weekly_refresh.sh: records how it was called and rewrites speakers.json, the group's file
  cat > "$SB/fake_weekly.sh" <<'FWEOF'
#!/usr/bin/env bash
PIPE="$HOME/.cache/autoresearch/pipeline"
echo "$*" > "$HOME/weekly.args"
python3 - "${FAKE_WEEKLY_MODE:-ok}" <<'PYEOF'
import json, sys
mode = sys.argv[1]
p = "portal/public/speakers.json"
d = json.load(open(p))
if mode in ("ok", "failsteps", "crash", "stale"):
    d.append({"id": len(d), "name": f"Speaker {len(d)}"})
elif mode == "shrink":
    d = d[:10]
if mode not in ("none", "locked"):
    open(p, "w").write(json.dumps(d) + "\n")
PYEOF
[ "${FAKE_WEEKLY_MODE:-ok}" = crash ] && exit 137
if [ "${FAKE_WEEKLY_MODE:-ok}" = locked ]; then echo "$(date '+%F %T') another weekly refresh is still running (lock held); exiting" >> "$PIPE/weekly.log"; exit 0; fi
[ "${FAKE_WEEKLY_MODE:-ok}" = noblock ] && exit 0
{
  echo "$(date '+%F %T') ===== weekly refresh start (groups: $*; timeout/step=3h, host=fake) ====="
  echo "$(date '+%F %T') [x_speakers] OK in 2s; (no row count); log /x"
  [ "${FAKE_WEEKLY_MODE:-ok}" = failsteps ] && echo "$(date '+%F %T') [x_fits] FAIL(rc=1) in 1s; (no row count); log /x"
  echo "$(date '+%F %T') ===== weekly refresh end ====="
  [ "${FAKE_WEEKLY_MODE:-ok}" = stale ] && echo "$(date '+%F %T') Stale weekly refresh: source refused to change the register: ${FAKE_STALE_STEPS:-fits_fetch}"
  [ -n "${FAKE_ROSTER_HELD:-}" ] && echo "$(date '+%F %T') Roster held: $FAKE_ROSTER_HELD"
  [ "${FAKE_WEEKLY_MODE:-ok}" = failsteps ] && echo "$(date '+%F %T') Incomplete weekly refresh: failed steps x_fits"
} >> "$PIPE/weekly.log"
[ "${FAKE_WEEKLY_MODE:-ok}" = failsteps ] && exit 1
exit 0
FWEOF
  chmod +x "$SB/fake_weekly.sh"
  # a node that records its arguments and exits FAKE_NODE_RC
  cat > "$SB/bin/node" <<'NDEOF'
#!/bin/sh
echo "node $*" >> "$HOME/node.calls"
# FAKE_NODE_RED_WHILE_CHANGED=<repo path>: red for as long as that file differs from HEAD (a test the new data breaks)
if [ -n "${FAKE_NODE_RED_WHILE_CHANGED:-}" ] && [ -n "$(git status --porcelain -- ":(top)$FAKE_NODE_RED_WHILE_CHANGED" 2>/dev/null)" ]; then exit 1; fi
# The review reproduction: two unrelated bad groups force every single-group
# trial (including bills) to stay red, then cumulative rollback becomes green.
for p in ${FAKE_NODE_RED_WHILE_ANY_CHANGED:-}; do
  [ -z "$(git status --porcelain -- ":(top)$p" 2>/dev/null)" ] || exit 1
done
exit ${FAKE_NODE_RC:-0}
NDEOF
  chmod +x "$SB/bin/node"
  printf '#!/bin/sh\necho "npm $*" >> "$HOME/npm.calls"\nexit ${FAKE_NPM_RC:-0}\n' > "$SB/bin/npm"; chmod +x "$SB/bin/npm"
  export OPAX_DAILY_REFRESH="$SB/fake_refresh.sh" OPAX_WEEKLY_REFRESH="$SB/fake_weekly.sh" OPAX_NODE="$SB/bin/node" OPAX_NPM="$SB/bin/npm" OPAX_REPO="$REPO" ORIGIN
  export PATH="$SB/bin:$PATH"
}

nightly() { (cd "$REPO" && bash scripts/vm/nightly.sh >"$SB/nightly.out" 2>&1); NRC=$?; }
origin_show() { git --git-dir="$ORIGIN" show "main:$1"; }
origin_log()  { git --git-dir="$ORIGIN" log --format=%s main; }

# --- scenarios -------------------------------------------------------------------------------
status_json() { git --git-dir="$ORIGIN" show "nightly-status:status.json"; }
status_is()   { status_json | python3 -c "import json,sys; s=json.load(sys.stdin); assert s['status']=='$1', s"; }

echo "== 1. happy night: refresh ok, box grew, everything pushed (the push starts the deploy) and the status published"
new_sandbox s1
FAKE_MODE=ok nightly
check "exit 0" test "$NRC" -eq 0
check "a nightly commit reached origin" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q '^Nightly refresh $TODAY: '"
check "commit subject names the growth" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q 'speech +50'"
check "corpus.json carries the new total" bash -c "git --git-dir='$ORIGIN' show main:portal/public/corpus.json | python3 -c 'import json,sys; c=json.load(sys.stdin); assert c[\"expected_resources\"]==$BASE_TOTAL+50 and c[\"version\"]==\"$TODAY\" and c[\"collected_speeches\"]==$BASE_SPEECH+50'"
check "corpus.json is in the pushed commit (that is what triggers deploy.yml)" bash -c "git --git-dir='$ORIGIN' diff --name-only main~1 main | grep -qx portal/public/corpus.json"
check "CACHE_EPOCH bumped in both places" bash -c "[ \$(git --git-dir='$ORIGIN' show main:portal/wrangler.jsonc | grep -c '\"CACHE_EPOCH\": \"$TODAY-nightly\"') -eq 2 ]"
check "bills went through with briefs restored" bash -c "git --git-dir='$ORIGIN' show main:portal/public/bills/au-federal-t1.json | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d[\"status_as_of\"]==\"2026-09-28\" and d[\"speeches\"][0][\"brief\"]==\"Brief 1-0\"'"
check "bill deltas are in the summary commit" bash -c "git --git-dir='$ORIGIN' log -1 --format=%s main | grep -q 'bills: 0 new, 3 changed, 0 titles filled, 0 sponsor IDs filled'"
check "successful catch-up deleted its pending marker" test ! -f "$HOME/.cache/autoresearch/pipeline/bills-refresh-v1.pending"
check "votes.json published" bash -c "git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"'"
check "only data files changed" bash -c "[ -z \"\$(git --git-dir='$ORIGIN' diff --name-only main~1 main | grep -vE '^portal/(public/(bills/|divisions/|seo/recent-votes.json|votes.json|corpus.json)|wrangler.jsonc)')\" ]"
check "status branch published, says ok" status_is ok
check "status says the deploy is started by the push" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'started by the push'"
check "status branch is a single parentless commit holding only status.json" bash -c "[ \$(git --git-dir='$ORIGIN' rev-list --count nightly-status) -eq 1 ] && [ \"\$(git --git-dir='$ORIGIN' ls-tree --name-only nightly-status)\" = status.json ]"
check "local status file says ok" grep -q '"status": "ok"' "$HOME/.cache/autoresearch/pipeline/nightly-last.json"
check "log file written" test -s "$HOME/.cache/autoresearch/pipeline/nightly-$TODAY.log"

echo "== 2. rerun straight away: checked_at is fresh and nothing else moved, so nothing is committed"
before=$(git --git-dir="$ORIGIN" rev-parse main)
FAKE_MODE=ok nightly
check "exit 0" test "$NRC" -eq 0
check "main untouched" test "$(git --git-dir="$ORIGIN" rev-parse main)" = "$before"
check "says nothing to publish" grep -q 'no data changes tonight' "$SB/nightly.out"
check "status refreshed, still one commit on the status branch" bash -c "[ \$(git --git-dir='$ORIGIN' rev-list --count nightly-status) -eq 1 ]"

echo "== 3. refresh reports failed steps: still pushes, publishes status 'failed' with the reason, exits 1"
new_sandbox s3
FAKE_MODE=failsteps nightly
check "exit 1" test "$NRC" -eq 1
check "data still pushed" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q '^Nightly refresh'"
check "status branch says failed" status_is failed
check "status names the failed step" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'failed steps: nsw'"
check "the API key is nowhere in the published status" bash -c "! git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q SECRETVALUE123456"
check "the key is not in main's new commit either" bash -c "! git --git-dir='$ORIGIN' show main | grep -q SECRETVALUE123456"

echo "== 4. a bill loses its brief: bills reverted, the rest pushes, status failed"
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
check "status says the briefs were lost" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'briefs lost'"
check "failed brief verification retains catch-up" test -f "$HOME/.cache/autoresearch/pipeline/bills-refresh-v1.pending"

echo "== 5. the refresh never ran: nothing pushed to main, status failed"
new_sandbox s5
FAKE_MODE=noblock nightly
check "exit 1" test "$NRC" -eq 1
check "main untouched" test "$(git --git-dir="$ORIGIN" log --format=%s main | head -1)" = seed
check "status failed and says why" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'did not complete a run'"

echo "== 6. someone pushes to origin while the nightly runs: rebase and retry"
new_sandbox s6
FAKE_MODE=race nightly
check "exit 0" test "$NRC" -eq 0
check "human commit and nightly commit both on main" bash -c "git --git-dir='$ORIGIN' log --format=%s main | grep -q 'a human commit' && git --git-dir='$ORIGIN' log --format=%s main | grep -q '^Nightly refresh'"

echo "== 7. a quiet night (nothing new anywhere) still leaves a fresh checked_at, so the watchdog sees a live chain"
KB_GROWTH=0 new_sandbox s7
FAKE_MODE=ok nightly            # night 1: bills and votes change (the fake refresh), the box does not grow
git --git-dir="$ORIGIN" show main:portal/public/corpus.json | python3 -c 'import json,sys; c=json.load(sys.stdin); print(c["refresh"]["checked_at"])' > "$SB/stamp1"
before=$(git --git-dir="$ORIGIN" rev-parse main)
sleep 2
OPAX_STAMP_AFTER_HOURS=0 FAKE_MODE=ok nightly   # a day later, as far as the stamp is concerned
check "exit 0" test "$NRC" -eq 0
check "a second commit was made" test "$(git --git-dir="$ORIGIN" rev-parse main)" != "$before"
check "it changes corpus.json and nothing else" bash -c "[ \"\$(git --git-dir='$ORIGIN' diff --name-only main~1 main)\" = portal/public/corpus.json ]"
check "checked_at moved" bash -c "[ \"\$(git --git-dir='$ORIGIN' show main:portal/public/corpus.json | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"refresh\"][\"checked_at\"])')\" != \"\$(cat '$SB/stamp1')\" ]"
check "CACHE_EPOCH not bumped again (the box did not change)" bash -c "git --git-dir='$ORIGIN' show main:portal/wrangler.jsonc | grep -c '\"CACHE_EPOCH\"' >/dev/null && ! git --git-dir='$ORIGIN' diff main~1 main -- portal/wrangler.jsonc | grep -q CACHE_EPOCH"

echo "== 8. NO_PUSH: commits locally, never touches origin and publishes no status"
new_sandbox s8
OPAX_NIGHTLY_NO_PUSH=1 FAKE_MODE=ok nightly
check "exit 0" test "$NRC" -eq 0
check "origin untouched" test "$(git --git-dir="$ORIGIN" log --format=%s main | head -1)" = seed
check "local commit made" bash -c "git -C '$REPO' log --format=%s | head -1 | grep -q '^Nightly refresh'"
check "no status branch" bash -c "! git --git-dir='$ORIGIN' rev-parse --verify -q nightly-status"

echo "== 9. the manifest step fails: bills still pushed, but with no corpus.json change the deploy would not start, so it says so"
new_sandbox s9
OPAX_KB_SNAPSHOT=/nonexistent/kb.json FAKE_MODE=ok nightly
check "exit 1" test "$NRC" -eq 1
check "bills and votes pushed" bash -c "git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"'"
check "corpus.json untouched" bash -c "! git --git-dir='$ORIGIN' diff --name-only main~1 main | grep -q corpus.json"
check "status lists both problems" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'update_corpus_manifest.py failed' && git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'deploy workflow did not start'"

echo "== 10. the push is refused, then works: the local commit survives and goes out on the next run"
new_sandbox s10
export OPAX_PUSH_SLEEP_UNIT=0
printf '#!/bin/sh\necho "remote: push refused by test hook" >&2\nexit 1\n' > "$ORIGIN/hooks/pre-receive"; chmod +x "$ORIGIN/hooks/pre-receive"
FAKE_MODE=ok nightly
check "exit 1" test "$NRC" -eq 1
check "main untouched" test "$(git --git-dir="$ORIGIN" log --format=%s main | head -1)" = seed
check "commit kept locally" bash -c "git -C '$REPO' log --format=%s | head -1 | grep -q '^Nightly refresh'"
check "the failed night is recorded locally" grep -q '"status": "failed"' "$HOME/.cache/autoresearch/pipeline/nightly-last.json"
rm -f "$ORIGIN/hooks/pre-receive"
FAKE_MODE=ok nightly
check "second run exits 0" test "$NRC" -eq 0
check "the earlier commit reached origin" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q '^Nightly refresh'"
check "and exactly one nightly commit exists" test "$(git --git-dir="$ORIGIN" log --format=%s main | grep -c '^Nightly refresh')" -eq 1
check "status is ok again" status_is ok
unset OPAX_PUSH_SLEEP_UNIT

echo "== 11. origin moved on while a local commit was unpushed: rebase it, no duplicate"
new_sandbox s11
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

echo "== 12. run-nightly.sh (what systemd runs): skip-nightly skips the run"
new_sandbox s12
run_nightly() { (cd "$REPO" && bash scripts/vm/run-nightly.sh >"$SB/run.out" 2>&1); NRC=$?; }
touch "$HOME/.config/opax/skip-nightly"
FAKE_MODE=ok run_nightly
check "exit 0" test "$NRC" -eq 0
check "said it was skipping" grep -q 'skip-nightly exists' "$SB/run.out"
check "nothing ran: main untouched, no status" bash -c "[ \"\$(git --git-dir='$ORIGIN' log --format=%s main | head -1)\" = seed ] && ! git --git-dir='$ORIGIN' rev-parse --verify -q nightly-status"
rm -f "$HOME/.config/opax/skip-nightly"
FAKE_MODE=ok run_nightly
check "without the file it runs the nightly" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q '^Nightly refresh'"

echo "== 13. poweroff-if-idle.sh: updates then power off when idle; stays up for hold, a login or an ssh connection"
new_sandbox s13
PO="$REPO/scripts/vm/poweroff-if-idle.sh"
export OPAX_POWEROFF_CMD="touch $SB/powered-off" OPAX_UPGRADE_CMD="touch $SB/upgraded" OPAX_APT_UPDATE_CMD="touch $SB/apt-updated"
export OPAX_WHO_CMD="true" OPAX_SS_CMD="true"
po() { rm -f "$SB/powered-off" "$SB/upgraded" "$SB/apt-updated"; SERVICE_RESULT=success bash "$PO" "$(id -un)" "$HOME" >"$SB/po.out" 2>&1; }
po
check "idle: package lists refreshed, updates applied, powered off" bash -c "[ -e '$SB/apt-updated' ] && [ -e '$SB/upgraded' ] && [ -e '$SB/powered-off' ]"
touch "$HOME/.config/opax/hold"; po
check "hold file: nothing done, machine stays up" bash -c "[ ! -e '$SB/powered-off' ] && [ ! -e '$SB/upgraded' ] && grep -q 'hold exists' '$SB/po.out'"
rm -f "$HOME/.config/opax/hold"
OPAX_WHO_CMD="echo ubuntu pts/0 2026-09-29 03:20 (203.0.113.9)" po
check "an interactive login: stays up" bash -c "[ ! -e '$SB/powered-off' ] && grep -q 'interactive login' '$SB/po.out'"
OPAX_SS_CMD="echo ESTAB 0 0 172.31.33.114:22 203.0.113.9:51234" po
check "an established ssh connection (scp/rsync too): stays up" bash -c "[ ! -e '$SB/powered-off' ] && grep -q 'established ssh connection' '$SB/po.out'"
OPAX_UPGRADE_CMD="touch $HOME/.config/opax/hold" po
check "someone holds the machine during the updates: stays up after them" bash -c "[ ! -e '$SB/powered-off' ] && grep -q 'staying up after the updates' '$SB/po.out'"
rm -f "$HOME/.config/opax/hold"
OPAX_UPGRADE_CMD="false" po
check "a failing update does not stop the power-off" test -e "$SB/powered-off"
unset OPAX_POWEROFF_CMD OPAX_UPGRADE_CMD OPAX_APT_UPDATE_CMD OPAX_WHO_CMD OPAX_SS_CMD

# --- daily_refresh.sh itself: allowed failures and the KB-push gate --------------------------------------
new_refresh_sandbox() {
  RS="$WORK/$1"; rm -rf "$RS"; mkdir -p "$RS/repo/scripts" "$RS/repo/.venv/bin" "$RS/repo/portal/public" "$RS/home"
  export HOME="$RS/home"; mkdir -p "$HOME/.cache/autoresearch"
  unset OPAX_REPO OPAX_DAILY_REFRESH OPAX_ALLOW_FAIL OPAX_SYNC_GATE OPAX_SYNC_KB   # nothing left over from the nightly scenarios
  cp "$SRC/scripts/daily_refresh.sh" "$SRC/scripts/refresh_bills.sh" "$RS/repo/scripts/"
  mkdir -p "$RS/repo/scripts/lib"; cp "$SRC/scripts/lib/refresh_lib.sh" "$RS/repo/scripts/lib/"
  mkdir -p "$RS/repo/scripts/vm"
  cp "$SRC/scripts/vm/export_step.sh" "$SRC/scripts/vm/keep_if_unchanged.py" "$RS/repo/scripts/vm/"
  chmod +x "$RS/repo/scripts/vm/export_step.sh"
  : > "$RS/repo/.env"; : > "$RS/repo/download_hansard_fast.py"
  mkdir -p "$RS/repo/portal/public/bills"; echo '{"bills":[]}' > "$RS/repo/portal/public/bills/index.json"
  echo '{"tables":{"speeches":{"after":1323635,"pushed":600482,"failed":{}}}}' > "$HOME/.cache/autoresearch/arag_sync_state.json"
  # a python that succeeds at everything except the steps named in FAIL_STEPS, and records each module it is asked to run
  cat > "$RS/repo/.venv/bin/python" <<'PYSTUB'
#!/usr/bin/env bash
echo "$*" >> "$RS_CALLS"
echo "${STEP_TIMEOUT:-unset} $*" >> "$RS_CALLS.timeouts"
if [ "${1:-}" = "-" ]; then
  case "${2:-}" in
    *.json) exit 0 ;;
    "") cat >/dev/null; exit 0 ;;
    # the committees row count: COMMITTEE_ADDS new rows appear between the count before and the count after
    *committee_%*) cat >/dev/null; f="$(dirname "$RS_CALLS")/cc"; n=$(cat "$f" 2>/dev/null || echo 10); echo "$n"; echo $((n + ${COMMITTEE_ADDS:-0})) > "$f"; exit 0 ;;
    *) cat >/dev/null; echo 0; exit 0 ;;
  esac
fi
if [ "${1:-}" = "-m" ]; then
  [ "$2" = parli.ingest.committee_hearings ] && [ -n "${COMMITTEES_CHANGED:-}" ] && echo "COMMITTEES_CHANGED rows_updated=$COMMITTEES_CHANGED rows_removed=0"
  for f in ${FAIL_STEPS:-}; do [ "$2" = "parli.ingest.$f" ] && exit ${FAIL_RC:-1}; done
else
  for f in ${FAIL_STEPS:-}; do [ "${1:-}" = "scripts/$f" ] && { [ -z "${FAIL_MSG:-}" ] || echo "$FAIL_MSG" >&2; exit ${FAIL_RC:-1}; }; done
fi
exit 0
PYSTUB
  chmod +x "$RS/repo/.venv/bin/python" "$RS/repo/scripts/daily_refresh.sh"
  export RS_CALLS="$RS/calls.log"; : > "$RS_CALLS"
}
refresh() { (cd "$RS" && "$RS/repo/scripts/daily_refresh.sh" >"$RS/out.txt" 2>&1); RRC=$?; }

echo "== 14. daily_refresh.sh: a failing sa step makes the run incomplete unless it is allowed"
new_refresh_sandbox r9
FAIL_STEPS=sa_hansard refresh
check "exit 1 without OPAX_ALLOW_FAIL" test "$RRC" -eq 1
check "log says incomplete: sa" grep -q 'Incomplete refresh: failed steps sa' "$HOME/.cache/autoresearch/pipeline/daily.log"
new_refresh_sandbox r9b
OPAX_ALLOW_FAIL=sa FAIL_STEPS=sa_hansard refresh
check "exit 0 with OPAX_ALLOW_FAIL=sa" test "$RRC" -eq 0
check "the failure is still logged, marked allowed" grep -q '\[sa\] FAIL(rc=1) (allowed)' "$HOME/.cache/autoresearch/pipeline/daily.log"
check "REPO comes from the script's own location" grep -q "since=" "$HOME/.cache/autoresearch/pipeline/daily.log"

echo "== 15. daily_refresh.sh: the KB push waits for OPAX_SYNC_GATE steps"
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

echo "== 15b. daily_refresh.sh: a KB push cut by its own time limit is partial (resumes next run), not a failed night"
new_refresh_sandbox r15p
OPAX_SYNC_KB=1 OPAX_PUSH_TIMEOUT=7h FAIL_RC=124 FAIL_STEPS="arag_sync" refresh
check "exit 0" test "$RRC" -eq 0
check "logged PARTIAL and listed on the Partial line" bash -c "grep -q '\[arag_sync\] PARTIAL(timeout 7h' '$HOME/.cache/autoresearch/pipeline/daily.log' && grep -q 'Partial daily refresh: .*arag_sync' '$HOME/.cache/autoresearch/pipeline/daily.log'"
check "the push has its own limit (OPAX_PUSH_TIMEOUT), not the per-step one" bash -c "! grep -q 'timeout 3h' '$HOME/.cache/autoresearch/pipeline/daily.log' || grep -q 'arag_sync\] PARTIAL(timeout 7h' '$HOME/.cache/autoresearch/pipeline/daily.log'"
new_refresh_sandbox r15q
OPAX_SYNC_KB=1 FAIL_RC=124 FAIL_STEPS="link_speakers" refresh
check "a timeout of any other step is still a failure" test "$RRC" -eq 1

echo "== 16. daily_refresh.sh: the cutover marker keeps the desktop off the knowledge box"
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
check "federal interests and their export run daily" bash -c "grep -q 'conduct_interests_federal refresh --db' '$RS_CALLS' && grep -q 'export_interests.py --out portal/public/interests' '$RS_CALLS'"
check "interests has its own 45m timeout" grep -q '^45m -m parli.ingest.conduct_interests_federal refresh --db' "$RS_CALLS.timeouts"
check "the interests timeout does not leak to exports" bash -c "grep 'scripts/export_interests.py --out' '$RS_CALLS.timeouts' | grep -q '^unset '"
new_refresh_sandbox r11f
FAIL_RC=3 FAIL_STEPS="conduct_interests_federal" refresh
check "an unavailable federal source is STALE and the daily run still completes" bash -c "[ '$RRC' -eq 0 ] && grep -q 'Stale daily refresh: .*interests_federal' '$HOME/.cache/autoresearch/pipeline/daily.log' && grep -q 'export_interests.py' '$RS_CALLS'"
new_refresh_sandbox r11c
touch "$HOME/.cache/autoresearch/MIGRATED_TO_VM"
OPAX_SYNC_KB=1 OPAX_FORCE_KB_SYNC=1 refresh
check "the explicit override works" grep -q 'parli.ingest.arag_sync' "$RS_CALLS"


echo "== 17. daily_refresh.sh: OPAX_ENSURE_INDEXES=1 runs the index step first; off by default"
new_refresh_sandbox r17
mkdir -p "$RS/repo/scripts"; : > "$RS/repo/scripts/ensure_db_indexes.py"
refresh
check "not run by default (the desktop is untouched)" bash -c "! grep -q ensure_db_indexes '$RS_CALLS'"
new_refresh_sandbox r17b
: > "$RS/repo/scripts/ensure_db_indexes.py"
OPAX_ENSURE_INDEXES=1 refresh
check "runs the index step when asked" grep -q 'scripts/ensure_db_indexes.py' "$RS_CALLS"
check "and before the first fetch" bash -c "[ \"\$(head -1 '$RS_CALLS')\" = 'scripts/ensure_db_indexes.py' ]"

echo "== 18. daily_refresh.sh: the full-text index is synced once, after the loaders; bills run in nightly"
new_refresh_sandbox r18
refresh
check "fts_sync ran" grep -q 'scripts/fts_sync.py' "$RS_CALLS"
check "daily refresh no longer fetches, exports or publishes bills" bash -c "! grep -qE 'refresh_bills|bills_fetch|export_bills|publish_bills' '$RS_CALLS'"
check "after the last loader (sa) and before the bills step" bash -c "
  a=\$(grep -n 'parli.ingest.sa_hansard' '$RS_CALLS' | head -1 | cut -d: -f1); b=\$(grep -n 'scripts/fts_sync.py' '$RS_CALLS' | head -1 | cut -d: -f1); c=\$(grep -n 'refresh_bills\|bills_fetch' '$RS_CALLS' | head -1 | cut -d: -f1)
  [ -n \"\$a\" ] && [ -n \"\$b\" ] && [ \"\$a\" -lt \"\$b\" ] && { [ -z \"\$c\" ] || [ \"\$b\" -lt \"\$c\" ]; }"

echo "== 19. daily_refresh.sh: new committee rows are resolved (fetch + resolve) after link_speakers and before the KB push"
new_refresh_sandbox r19
COMMITTEE_ADDS=7 OPAX_SYNC_KB=1 OPAX_SYNC_GATE=link_speakers,classify,committee_fetch,committee_resolve refresh
check "committees added rows, so fetch and resolve both ran" bash -c "grep -q 'committee_witnesses fetch' '$RS_CALLS' && grep -q 'committee_witnesses resolve' '$RS_CALLS'"
check "in the order link_speakers, fetch, resolve, arag_sync" bash -c "
  n() { grep -n \"\$1\" '$RS_CALLS' | head -1 | cut -d: -f1; }
  [ \"\$(n parli.ingest.link_speakers)\" -lt \"\$(n 'committee_witnesses fetch')\" ] && [ \"\$(n 'committee_witnesses fetch')\" -lt \"\$(n 'committee_witnesses resolve')\" ] && [ \"\$(n 'committee_witnesses resolve')\" -lt \"\$(n parli.ingest.arag_sync)\" ]"
new_refresh_sandbox r19b
OPAX_SYNC_KB=1 refresh
check "no new committee rows: neither runs" bash -c "! grep -q 'committee_witnesses' '$RS_CALLS'"
new_refresh_sandbox r19d
COMMITTEES_CHANGED=4 OPAX_SYNC_KB=1 OPAX_SYNC_GATE=link_speakers,classify,committee_fetch,committee_resolve refresh
check "rows changed in place (Proof -> Final) with none added: fetch and resolve still run before the push" bash -c "
  n() { grep -n \"\$1\" '$RS_CALLS' | head -1 | cut -d: -f1; }
  [ -n \"\$(n 'committee_witnesses fetch')\" ] && [ \"\$(n 'committee_witnesses resolve')\" -lt \"\$(n parli.ingest.arag_sync)\" ]"
new_refresh_sandbox r19c
COMMITTEE_ADDS=3 OPAX_SYNC_KB=1 OPAX_SYNC_GATE=link_speakers,classify,committee_fetch,committee_resolve FAIL_STEPS="committee_witnesses" refresh
check "a failing resolve holds the KB push back" bash -c "! grep -q 'parli.ingest.arag_sync' '$RS_CALLS'"

echo "== 20. daily_refresh.sh: releases, AusTender, GrantConnect and the state votes run every night"
new_refresh_sandbox r20
refresh
check "exit 0" test "$RRC" -eq 0
check "releases ran without --apply (no KB sync)" bash -c "grep -q 'scripts/refresh_releases.py' '$RS_CALLS' && ! grep 'refresh_releases' '$RS_CALLS' | grep -q -- '--apply'"
check "austender_full ran" grep -q 'parli.ingest.austender_full' "$RS_CALLS"
check "GrantConnect is fetched into a scratch file, then reconciled into the database by ext_apply" bash -c "
  grep 'parli.ingest.grantconnect' '$RS_CALLS' | grep -q 'stage/grants/grants.sqlite' && grep 'scripts/ext_apply.py grants' '$RS_CALLS' | grep -q -- '--stage .*stage/grants/grants.sqlite'"
check "state votes NSW and VIC loaded" bash -c "grep -q 'parli.ingest.votes_state nsw' '$RS_CALLS' && grep -q 'parli.ingest.votes_state vic' '$RS_CALLS'"
check "no KB steps without OPAX_SYNC_KB" bash -c "! grep -q 'votes_ingest' '$RS_CALLS'"
new_refresh_sandbox r20b
OPAX_SYNC_KB=1 refresh
check "with the KB on: releases --apply and the two division-document steps run" bash -c "grep 'refresh_releases' '$RS_CALLS' | grep -q -- '--apply' && grep -q 'votes_ingest.*--from-ext' '$RS_CALLS' && grep -q 'votes_ingest.*--from-legacy' '$RS_CALLS'"
new_refresh_sandbox r20c
FAIL_STEPS="grantconnect" refresh
check "a failed GrantConnect fetch is a failed step" test "$RRC" -eq 1
check "and ext_apply is skipped, so the register is never touched by a half load" bash -c "grep -q '\[grants_apply\] SKIP' '$HOME/.cache/autoresearch/pipeline/daily.log' && ! grep -q 'ext_apply.py grants' '$RS_CALLS'"
check "the nightly went on to the votes and the derived steps" bash -c "grep -q 'votes_state vic' '$RS_CALLS' && grep -q 'link_speakers' '$RS_CALLS'"

echo "== 20b. daily_refresh.sh: ACT Hansard members and days before linking and indexing, the KB patch after the push"
new_refresh_sandbox r20d
OPAX_SYNC_KB=1 refresh
check "exit 0" test "$RRC" -eq 0
check "act_members, act, then link_speakers; act before the full-text sync" bash -c "
  n() { grep -n \"\$1\" '$RS_CALLS' | head -1 | cut -d: -f1; }
  [ \"\$(n 'act_hansard --members')\" -lt \"\$(n 'act_hansard --start')\" ] && [ \"\$(n 'act_hansard --start')\" -lt \"\$(n parli.ingest.link_speakers)\" ] && [ \"\$(n 'act_hansard --start')\" -lt \"\$(n scripts/fts_sync.py)\" ]"
check "the window is the daily one by default, OPAX_ACT_START overrides it" bash -c "grep 'act_hansard --start' '$RS_CALLS' | grep -qE 'start [0-9]{4}-[0-9]{2}-[0-9]{2}\$'"
check "act_kb_patch runs after arag_sync" bash -c "a=\$(grep -n 'parli.ingest.arag_sync' '$RS_CALLS' | head -1 | cut -d: -f1); b=\$(grep -n 'act_hansard --patch-kb' '$RS_CALLS' | head -1 | cut -d: -f1); [ -n \"\$a\" ] && [ -n \"\$b\" ] && [ \"\$a\" -lt \"\$b\" ]"
new_refresh_sandbox r20e
OPAX_ACT_START=2024-10-19 refresh
check "OPAX_ACT_START=2024-10-19 is passed to the loader (the one-off backfill)" grep -q 'act_hansard --start 2024-10-19' "$RS_CALLS"
check "no KB patch without OPAX_SYNC_KB" bash -c "! grep -q 'act_hansard --patch-kb' '$RS_CALLS'"
new_refresh_sandbox r20f
FAIL_STEPS=act_hansard refresh
check "a failing ACT loader is a failed step by default (the run is incomplete)" test "$RRC" -eq 1
new_refresh_sandbox r20g
OPAX_ALLOW_FAIL=act_members,act FAIL_STEPS=act_hansard refresh
check "and listed in OPAX_ALLOW_FAIL it is logged but the run stays complete (the nightly lists act_members)" test "$RRC" -eq 0

# --- weekly_refresh.sh itself -------------------------------------------------------------------------------
new_weekly_sandbox() {
  new_refresh_sandbox "$1"
  cp "$SRC/scripts/weekly_refresh.sh" "$RS/repo/scripts/"; mkdir -p "$RS/repo/scripts/vm"
  cp "$SRC/scripts/vm/export_step.sh" "$SRC/scripts/vm/keep_if_unchanged.py" "$SRC/scripts/vm/export_people.sh" "$RS/repo/scripts/vm/"
  chmod +x "$RS/repo/scripts/weekly_refresh.sh" "$RS/repo/scripts/vm/export_step.sh"
  # export_people.sh reads the members table with the sqlite3 CLI
  python3 -c "import sqlite3,os; d=sqlite3.connect(os.path.expanduser('~/.cache/autoresearch/parli.db')); d.execute('create table if not exists members(full_name,state,chamber,electorate,entered_house,left_house)'); d.commit()"
}
weekly() { (cd "$RS" && "$RS/repo/scripts/weekly_refresh.sh" "$@" >"$RS/out.txt" 2>&1); WRC=$?; }
WLOG='$HOME/.cache/autoresearch/pipeline/weekly.log'
order() { # order STEP_A STEP_B ...: the first calls of each pattern are in this order
  bash -c "prev=0; for pat in \"\$@\"; do n=\$(grep -n -- \"\$pat\" '$RS_CALLS' | head -1 | cut -d: -f1); [ -n \"\$n\" ] && [ \"\$n\" -gt \"\$prev\" ] || { echo \"out of order or missing: \$pat\"; exit 1; }; prev=\$n; done" _ "$@"
}

echo "== 21. weekly_refresh.sh weekly: registers loaded (staged where they replace), then exports, tax/charity block last"
new_weekly_sandbox w21
weekly weekly
check "exit 0" test "$WRC" -eq 0
check "log brackets the run" bash -c "grep -q 'weekly refresh start (groups: weekly' $WLOG && grep -q '===== weekly refresh end' $WLOG"
check "state donations are staged in a scratch file and applied by ext_apply, then labelled" bash -c "grep 'money_state_donations --source qld' '$RS_CALLS' | grep -q 'stage/weekly/donations/qld.sqlite' && grep 'scripts/ext_apply.py donations --stage-dir' '$RS_CALLS' | grep -q 'stage/weekly/donations' && grep -q 'money_classify' '$RS_CALLS'"
check "lobbyists and FITS are staged then applied" bash -c "grep -q 'ext_apply.py lobbyists --stage' '$RS_CALLS' && grep -q 'ext_apply.py fits --stage' '$RS_CALLS'"
check "ACNC/ATO runs with --check-updated" grep -q 'parli.ingest.acnc_ato --check-updated' "$RS_CALLS"
check "QLD interests refresh weekly before the export; federal does not run twice on Sundays" bash -c "grep -q 'conduct_interests_qld --fetch --db' '$RS_CALLS' && ! grep -q 'conduct_interests_federal' '$RS_CALLS'"
check "the people directory is enriched with the recorded representation right after it is exported" order scripts/export_parliamentarians.py scripts/enrich_profile_jurisdictions.py
check "the loaders come before the exports, and the tax/charity export is the last" order parli.ingest.acnc_ato scripts/export_speakers.py scripts/export_money_graph.py scripts/export_access.py scripts/export_fits.py scripts/export_interests.py scripts/export_tax_charity.py
check "no monthly step ran" bash -c "! grep -qE 'qld_contracts|money_ipea|state_rosters|export_suppliers|export_grants|build_pay|export_discovery' '$RS_CALLS'"
check "the contract_suppliers step is given the ABR index directory" bash -c "grep 'contract_suppliers' '$RS_CALLS' | grep -q -- '--abr-dir .*/abr'"
new_weekly_sandbox w21b
weekly monthly
check "monthly alone: exit 0 and only the monthly loaders/exports (plus the tax/charity block at the end)" bash -c "[ '$WRC' -eq 0 ] && grep -q qld_contracts '$RS_CALLS' && grep -q build_pay.py '$RS_CALLS' && ! grep -q 'parli.ingest.acnc_ato' '$RS_CALLS' && grep -q export_tax_charity '$RS_CALLS'"
check "suppliers and grants exports come before the tax/charity block that reads them" order scripts/export_suppliers.py scripts/export_grants.py scripts/export_tax_charity.py
check "no KB patch drain without OPAX_SYNC_KB" bash -c "! grep -q arag_patch_speakers '$RS_CALLS'"
new_weekly_sandbox w21c
OPAX_SYNC_KB=1 weekly monthly
check "with the KB on the roster patches are drained" grep -q 'scripts/arag_patch_speakers.py' "$RS_CALLS"
new_weekly_sandbox w21d
weekly weekly monthly
check "both groups: the weekly ones come first" order parli.ingest.acnc_ato qld_contracts export_tax_charity
check "and the tax/charity export runs once" test "$(grep -c export_tax_charity "$RS_CALLS")" -eq 1

echo "== 22. weekly_refresh.sh: a failing fetch skips its apply; failures make the run incomplete; bad usage; the cutover marker"
new_weekly_sandbox w22
FAIL_STEPS="fits_register" weekly weekly
check "exit 1" test "$WRC" -eq 1
check "the failed FITS fetch is named" grep -q 'Incomplete weekly refresh: failed steps fits_fetch' "$HOME/.cache/autoresearch/pipeline/weekly.log"
check "its apply was skipped, never run on a half load" bash -c "grep -q '\[fits_apply\] SKIP' '$HOME/.cache/autoresearch/pipeline/weekly.log' && ! grep -q 'ext_apply.py fits' '$RS_CALLS'"
check "the other steps still ran (exports after the failure)" grep -q 'export_tax_charity.py' "$RS_CALLS"
new_weekly_sandbox w22b
OPAX_ALLOW_FAIL=fits_fetch FAIL_STEPS="fits_register" weekly weekly
check "an allowed failure leaves the run complete (exit 0)" test "$WRC" -eq 0
new_weekly_sandbox w22c
FAIL_STEPS="export_speakers.py" weekly weekly
check "a failing export is a failed step and the rest of the exports still run" bash -c "[ '$WRC' -eq 1 ] && grep -q 'failed steps x_speakers' '$HOME/.cache/autoresearch/pipeline/weekly.log' && grep -q export_tax_charity.py '$RS_CALLS'"
new_weekly_sandbox w22d
weekly nonsense
check "an unknown group is refused (exit 64) and nothing runs" bash -c "[ '$WRC' -eq 64 ] && [ ! -s '$RS_CALLS' ]"
new_weekly_sandbox w22e
touch "$HOME/.cache/autoresearch/MIGRATED_TO_VM"
OPAX_SYNC_KB=1 weekly weekly
check "the desktop cutover marker refuses a KB-syncing run (exit 3)" test "$WRC" -eq 3

echo "== 23. export_step.sh: an unchanged export leaves the tree alone; a failing directory export is restored"
ES=$(mktemp -d); mkdir -p "$ES/scripts/vm" "$ES/out"; cp "$SRC/scripts/vm/export_step.sh" "$SRC/scripts/vm/keep_if_unchanged.py" "$ES/scripts/vm/"
( cd "$ES" && git init -q && git config user.email t@t && git config user.name t
  printf '{"generated_at":"2026-01-01","n":1}\n' > out/a.json; printf '{"generated_at":"2026-01-01","n":1}\n' > out/b.json
  git add -A && git commit -q -m base )
export PY=python3
( cd "$ES" && bash scripts/vm/export_step.sh json out/a.json bash -c 'printf "{\"generated_at\":\"2026-09-01\",\"n\":1}\n"' )
check "json mode: only the timestamp differs, so the file is not touched" bash -c "cd '$ES' && git diff --quiet"
( cd "$ES" && bash scripts/vm/export_step.sh json out/a.json bash -c 'printf "{\"generated_at\":\"2026-09-01\",\"n\":2}\n"' )
check "json mode: real change is installed" bash -c "cd '$ES' && git diff --quiet -- out/a.json; [ \$? -eq 1 ]"
( cd "$ES" && git checkout -q -- out )
( cd "$ES" && bash scripts/vm/export_step.sh dir out -- bash -c 'for f in out/a.json out/b.json; do sed -i.bak "s/2026-01-01/2026-09-01/" $f; rm -f $f.bak; done' )
check "dir mode: stamp-only rewrites are put back" bash -c "cd '$ES' && git diff --quiet"
( cd "$ES" && bash scripts/vm/export_step.sh dir out -- bash -c 'echo {} > out/a.json; echo {} > out/new.json; exit 7' ); ESRC=$?
check "dir mode: a failing exporter exits with its status, restores the tree and drops what it added" bash -c "[ '$ESRC' -eq 7 ] && cd '$ES' && git diff --quiet && [ ! -e out/new.json ]"
rm -rf "$ES"; unset PY

echo "== 24. nightly: which periodic groups run (Sydney date) and what happens when they run"
new_sandbox s24
OPAX_TODAY=2026-09-21 FAKE_WEEKLY_MODE=ok nightly
check "a Monday (2026-09-21): the periodic refresh is not called" test ! -e "$HOME/weekly.args"
new_sandbox s24b
OPAX_TODAY=2026-09-20 FAKE_WEEKLY_MODE=ok nightly
check "Sunday 2026-09-20 (not the first): weekly only" bash -c "[ \"\$(cat '$HOME/weekly.args')\" = weekly ]"
check "exit 0 and the group's file was published" bash -c "[ '$NRC' -eq 0 ] && git --git-dir='$ORIGIN' show main:portal/public/speakers.json | python3 -c 'import json,sys; assert len(json.load(sys.stdin))==101'"
check "the commit subject names the group" bash -c "git --git-dir='$ORIGIN' log --format=%s main | head -1 | grep -q 'speakers'"
check "corpus.json changed with it (that starts the deploy)" bash -c "git --git-dir='$ORIGIN' diff --name-only main~1 main | grep -qx portal/public/corpus.json"
check "the log says which groups ran" grep -q 'periodic groups tonight: weekly' "$HOME/.cache/autoresearch/pipeline/nightly-$TODAY.log"
new_sandbox s24c
OPAX_TODAY=2026-09-06 FAKE_WEEKLY_MODE=ok nightly
check "Sunday 2026-09-06, the first: weekly and monthly" bash -c "[ \"\$(cat '$HOME/weekly.args')\" = 'weekly monthly' ]"
new_sandbox s24d
OPAX_FORCE_GROUPS="monthly" OPAX_TODAY=2026-09-23 FAKE_WEEKLY_MODE=ok nightly
check "OPAX_FORCE_GROUPS overrides the calendar" bash -c "[ \"\$(cat '$HOME/weekly.args')\" = monthly ]"
new_sandbox s24e
OPAX_FORCE_GROUPS="weekly" OPAX_NIGHTLY_SKIP_PERIODIC=1 FAKE_WEEKLY_MODE=ok nightly
check "OPAX_NIGHTLY_SKIP_PERIODIC=1 switches them off" test ! -e "$HOME/weekly.args"

echo "== 27. a night whose KB push was cut short is ok, with a warning"
new_sandbox s27
FAKE_MODE=partial nightly
check "exit 0 and status ok" bash -c "[ '$NRC' -eq 0 ] && git --git-dir='$ORIGIN' show nightly-status:status.json | python3 -c 'import json,sys; s=json.load(sys.stdin); assert s[\"status\"]==\"ok\" and any(\"resumes from its checkpoint\" in w and \"arag_sync\" in w for w in s[\"warnings\"]), s'"

echo "== 26. an exit status of 3 (the source refused to change the register) is stale, not failed"
new_weekly_sandbox w22f
FAIL_RC=3 FAIL_STEPS="fits_register" weekly weekly
check "exit 0" test "$WRC" -eq 0
check "logged STALE and listed on the Stale line" bash -c "grep -q '\[fits_fetch\] STALE(rc=3' '$HOME/.cache/autoresearch/pipeline/weekly.log' && grep -q 'Stale weekly refresh: .*fits_fetch' '$HOME/.cache/autoresearch/pipeline/weekly.log'"
check "and not as an incomplete run" bash -c "! grep -q 'Incomplete weekly refresh' '$HOME/.cache/autoresearch/pipeline/weekly.log'"
new_weekly_sandbox w22i
FAIL_RC=3 FAIL_STEPS="money_ipea" weekly monthly
check "monthly: an IPEA quarter refused for its licence (exit 3) is stale: exit 0" test "$WRC" -eq 0
check "logged STALE and listed on the Stale line, not as an incomplete run" bash -c "grep -q '\[ipea\] STALE(rc=3' $WLOG && grep -q 'Stale weekly refresh: .*ipea' $WLOG && ! grep -q 'Incomplete weekly refresh' $WLOG"
check "and the expenses export still runs after it" order parli.ingest.money_ipea scripts/export_expenses.py
new_weekly_sandbox w22h
FAIL_RC=3 FAIL_STEPS="export_parliamentarians.py" FAIL_MSG="ROSTER HELD: 1 sitting member row(s) lose their id or seat: Pat Conaghan (10922 -> no id)" weekly weekly
check "a held roster export (exit 3) is stale, not failed: exit 0" test "$WRC" -eq 0
check "logged STALE, listed on the Stale line, and the reason on a Roster held line" bash -c "grep -q '\[x_people\] STALE(rc=3' $WLOG && grep -q 'Stale weekly refresh: .*x_people' $WLOG && grep -q 'Roster held: 1 sitting member row(s) lose their id or seat: Pat Conaghan (10922 -> no id)' $WLOG && ! grep -q 'Incomplete weekly refresh' $WLOG"
check "and the exports after it still run" order scripts/export_parliamentarians.py scripts/export_money_graph.py
new_weekly_sandbox w22g
FAIL_RC=3 FAIL_STEPS="export_speakers.py" weekly weekly
check "exit 3 from a step that is not a register loader is still a failure" test "$WRC" -eq 1
new_refresh_sandbox r22
FAIL_RC=3 FAIL_STEPS="grantconnect" refresh
check "daily: an exit 3 from the GrantConnect fetch is a failure (only the apply step's refusal is stale)" test "$RRC" -eq 1
new_sandbox s22n
FAKE_MODE=ok OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=stale nightly
check "a stale source: the night is ok (exit 0)" test "$NRC" -eq 0
check "but the status carries a warning naming it" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | python3 -c 'import json,sys; s=json.load(sys.stdin); assert s[\"status\"]==\"ok\" and any(\"fits_fetch\" in w for w in s[\"warnings\"]), s'"
new_sandbox s22r
FAKE_MODE=ok OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=stale FAKE_STALE_STEPS=x_people FAKE_ROSTER_HELD="1 sitting member row(s) lose their id or seat: Pat Conaghan (10922 -> no id)" nightly
check "a held roster: the night is ok, and the status says the roster was held and why" bash -c "[ '$NRC' -eq 0 ] && git --git-dir='$ORIGIN' show nightly-status:status.json | python3 -c 'import json,sys; s=json.load(sys.stdin); assert s[\"status\"]==\"ok\" and any(\"roster export was held\" in w and \"Pat Conaghan (10922 -> no id)\" in w for w in s[\"warnings\"]), s'"
new_sandbox s22p
FAKE_MODE=ok OPAX_FORCE_GROUPS=monthly FAKE_WEEKLY_MODE=stale FAKE_STALE_STEPS=ipea nightly
check "a monthly run with a stale IPEA quarter: exit 0, status ok with a warning naming ipea" bash -c "[ '$NRC' -eq 0 ] && git --git-dir='$ORIGIN' show nightly-status:status.json | python3 -c 'import json,sys; s=json.load(sys.stdin); assert s[\"status\"]==\"ok\" and any(\"ipea\" in w for w in s[\"warnings\"]), s'"

echo "== 25. nightly: a periodic group that fails validation, fails its tests, or never completes is put back; the rest goes out"
new_sandbox s25
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=shrink nightly
check "exit 1" test "$NRC" -eq 1
check "the shrunken speakers.json was not published" bash -c "git --git-dir='$ORIGIN' show main:portal/public/speakers.json | python3 -c 'import json,sys; assert len(json.load(sys.stdin))==100'"
check "votes and corpus still went out" bash -c "git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"' && git --git-dir='$ORIGIN' show main:portal/public/corpus.json | grep -q '$TODAY'"
check "status says which group failed validation" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'validation failed for speakers'"
new_sandbox s25b
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=failsteps nightly
check "failed steps: exit 1, but the finished exports are published" bash -c "[ '$NRC' -eq 1 ] && git --git-dir='$ORIGIN' show main:portal/public/speakers.json | python3 -c 'import json,sys; assert len(json.load(sys.stdin))==101'"
check "status names the failed step" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'failed steps: x_fits'"
new_sandbox s25c
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=crash nightly
check "a run that never reaches its end block: exit 1, its files are put back" bash -c "[ '$NRC' -eq 1 ] && git --git-dir='$ORIGIN' show main:portal/public/speakers.json | python3 -c 'import json,sys; assert len(json.load(sys.stdin))==100'"
check "status says it did not complete" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'weekly_refresh.sh (weekly) did not complete'"
new_sandbox s25c2
printf '2026-09-20 05:00:00 ===== weekly refresh start (groups: weekly)\n2026-09-20 05:40:00 ===== weekly refresh end =====\n' > "$HOME/.cache/autoresearch/pipeline/weekly.log"
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=locked nightly
check "a periodic run that only found its lock held is not mistaken for last week's complete block" bash -c "[ '$NRC' -eq 1 ] && git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'weekly_refresh.sh (weekly) did not complete'"
new_sandbox s25d
mkdir -p "$REPO/portal/node_modules" "$REPO/portal/test"
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=ok FAKE_NODE_RED_WHILE_CHANGED=portal/public/speakers.json nightly
check "portal suite red because of a group's files: exit 1" test "$NRC" -eq 1
check "that group is not published" bash -c "git --git-dir='$ORIGIN' show main:portal/public/speakers.json | python3 -c 'import json,sys; assert len(json.load(sys.stdin))==100'"
check "the suite is green again after that one revert, so votes and bills still go out" bash -c "git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"' && git --git-dir='$ORIGIN' show main:portal/public/bills/au-federal-t1.json | grep -q 2026-09-28"
check "the suite reruns until green, each time after rebuilding the search catalog" bash -c "n=\$(grep -c 'node --test' '$HOME/node.calls'); [ \$n -ge 2 ] && [ \$(grep -c 'npm run build:search' '$HOME/npm.calls') -eq \$n ]"
check "status names the group that was put back" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'new speakers files (green with only that group put back to HEAD)'"
new_sandbox s25d3
mkdir -p "$REPO/portal/node_modules" "$REPO/portal/test"
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=ok FAKE_NODE_RED_WHILE_CHANGED=portal/public/votes.json nightly
check "the culprit is found by trying each group alone: votes (not the first group) is the one not published" bash -c "[ '$NRC' -eq 1 ] && ! git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"'"
check "the innocent groups tried on the way (speakers) are restored, not lost, and bills go out too" bash -c "git --git-dir='$ORIGIN' show main:portal/public/speakers.json | python3 -c 'import json,sys; assert len(json.load(sys.stdin))==101' && git --git-dir='$ORIGIN' show main:portal/public/bills/au-federal-t1.json | grep -q 2026-09-28"
# Division/SEO projections may also change and be tried before speakers/votes.
check "multiple runs: all changed (red), innocent groups put back (still red), votes put back (green)" test "$(grep -c 'node --test' "$HOME/node.calls")" -ge 3
check "status names votes as the culprit" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'new votes files (green with only that group put back to HEAD)'"
new_sandbox s25two
mkdir -p "$REPO/portal/node_modules" "$REPO/portal/test"
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=ok FAKE_NODE_RED_WHILE_ANY_CHANGED="portal/public/speakers.json portal/public/votes.json" nightly
check "two failing groups: unrelated speakers/votes are rolled back and the night reports failure" bash -c "[ '$NRC' -eq 1 ] && git --git-dir='$ORIGIN' show main:portal/public/speakers.json | python3 -c 'import json,sys; assert len(json.load(sys.stdin))==100' && ! git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"'"
check "temporary bills rollback is restored and accepted bills reach the commit" bash -c "git --git-dir='$ORIGIN' show main:portal/public/bills/au-federal-t1.json | grep -q 2026-09-28 && git --git-dir='$ORIGIN' log -1 --format=%s main | grep -q 'bills: 0 new, 3 changed'"
check "catch-up is consumed despite two unrelated failures" test ! -f "$HOME/.cache/autoresearch/pipeline/bills-refresh-v1.pending"
check "the cumulative rollback scenario reached a green suite" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'no single group was to blame, green again'"
new_sandbox s25d2
mkdir -p "$REPO/portal/node_modules" "$REPO/portal/test"
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=ok FAKE_NODE_RC=1 nightly
check "a suite that is red whatever the data: everything changed goes back to HEAD, exit 1" bash -c "[ '$NRC' -eq 1 ] && git --git-dir='$ORIGIN' show main:portal/public/speakers.json | python3 -c 'import json,sys; assert len(json.load(sys.stdin))==100' && ! git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"'"
check "status says the suite is red on main itself" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'red on main itself'"
check "the manifest still went out (the deploy job will report the red suite)" bash -c "git --git-dir='$ORIGIN' show main:portal/public/corpus.json | grep -q '$TODAY'"
check "permanently rolled-back bills retain catch-up" test -f "$HOME/.cache/autoresearch/pipeline/bills-refresh-v1.pending"
new_sandbox s25e
mkdir -p "$REPO/portal/node_modules" "$REPO/portal/test"
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=ok FAKE_NODE_RC=0 nightly
check "portal tests green: exit 0, the group is published, the suite ran once" bash -c "[ '$NRC' -eq 0 ] && git --git-dir='$ORIGIN' show main:portal/public/speakers.json | python3 -c 'import json,sys; assert len(json.load(sys.stdin))==101' && [ \$(grep -c 'node --test' '$HOME/node.calls') -eq 1 ]"
new_sandbox s25f
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=ok nightly
check "no portal checkout (no node_modules): the gate is skipped with a warning and the group goes out" bash -c "[ '$NRC' -eq 0 ] && grep -q 'not running the portal tests' '$HOME/.cache/autoresearch/pipeline/nightly-$TODAY.log'"
new_sandbox s25g
mkdir -p "$REPO/portal/node_modules"
OPAX_TEST_GATE=0 OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=ok FAKE_NODE_RC=1 nightly
check "OPAX_TEST_GATE=0 turns the gate off" bash -c "[ '$NRC' -eq 0 ] && [ ! -e '$HOME/node.calls' ]"
new_sandbox s25h
git -C "$REPO" ls-files portal/public | grep -q speakers.json   # the group's file is tracked
echo 'x' > "$REPO/portal/public/speakers.json.untracked.txt"
FAKE_MODE=ok nightly
check "a file the nightly does not own is never swept into its commit" bash -c "! git --git-dir='$ORIGIN' ls-tree -r --name-only main | grep -q untracked"

echo "== 28. owned roster profiles preview by default; only the dedicated switch enables bounded apply"
roster_stub() {
  cat > "$REPO/scripts/reconcile_roster_profiles.py" <<'PYEOF'
import json, os, pathlib, sys
home = pathlib.Path(os.environ['HOME'])
calls = (home / 'node.calls').read_text() if (home / 'node.calls').exists() else ''
(home / 'roster.calls').write_text(json.dumps({'args': sys.argv[1:], 'tests_ran': 'node --test' in calls}))
sys.exit(int(os.environ.get('FAKE_ROSTER_RC', '0')))
PYEOF
}
new_sandbox s28
roster_stub
mkdir -p "$REPO/portal/node_modules" "$REPO/portal/test"
OPAX_FORCE_GROUPS=weekly FAKE_WEEKLY_MODE=ok nightly
check "reconciliation runs after the passing portal gate with dry-run, plan and no apply" python3 -c "import json; r=json.load(open('$HOME/roster.calls')); assert r['tests_ran'] and '--dry-run' in r['args'] and '--apply' not in r['args'] and '--output' in r['args']"
check "successful reconciliation leaves the night green" test "$NRC" -eq 0
new_sandbox s28b
roster_stub
OPAX_PERIODIC_SYNC_KB=0 nightly
check "rehearsal KB switch leaves roster read-only" python3 -c "import json; r=json.load(open('$HOME/roster.calls')); assert '--dry-run' in r['args'] and '--apply' not in r['args']"
new_sandbox s28enabled
roster_stub
OPAX_ROSTER_SYNC_KB=1 nightly
check "only explicit OPAX_ROSTER_SYNC_KB=1 selects apply with backups" python3 -c "import json; r=json.load(open('$HOME/roster.calls')); assert '--apply' in r['args'] and '--dry-run' not in r['args'] and '--backup' in r['args']"
new_sandbox s28periodic
roster_stub
OPAX_PERIODIC_SYNC_KB=1 nightly
check "the broader periodic switch cannot enable roster apply" python3 -c "import json; r=json.load(open('$HOME/roster.calls')); assert '--dry-run' in r['args'] and '--apply' not in r['args']"
new_sandbox s28disabled
roster_stub
OPAX_ROSTER_SYNC_KB=0 nightly
check "explicit zero leaves roster read-only" python3 -c "import json; r=json.load(open('$HOME/roster.calls')); assert '--dry-run' in r['args'] and '--apply' not in r['args']"
new_sandbox s28c
roster_stub
FAKE_ROSTER_RC=1 nightly
check "a reconciliation failure is visible and retried next night" bash -c "[ '$NRC' -eq 1 ] && git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'roster-profile reconciliation failed; retry next night'"
echo "== 29. evidence catch-up, Sunday cadence, safe holds and final test attribution"
new_sandbox evidence_catchup
OPAX_TODAY=2026-10-10 EVIDENCE_TEST_MODE=ok nightly
check "Saturday catch-up exports/audits and commits evidence" bash -c "[ '$NRC' -eq 0 ] && git --git-dir='$ORIGIN' show main:portal/public/evidence/aa.json | grep -q 'members interjecting' && grep -qx audit '$HOME/evidence.calls'"
check "committed evidence consumes catch-up and keeps initialized outside git" bash -c "[ ! -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending' ] && [ -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.initialized' ]"
check "evidence delta summary reaches status and commit" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'evidence: 1 changed shards, 1 records with text changed, 2 cleaned fields' && git --git-dir='$ORIGIN' log -1 --format=%s main | grep -q 'evidence: 1 changed shards'"
rm "$HOME/evidence.calls"
OPAX_TODAY=2026-10-12 EVIDENCE_TEST_MODE=ok nightly
check "initialized weekday skips export" test ! -f "$HOME/evidence.calls"
OPAX_TODAY=2026-10-11 EVIDENCE_TEST_MODE=stamps nightly
check "Sunday runs export/audit without a catch-up marker" grep -q 'evidence export (weekly)' "$SB/nightly.out"
check "timestamp-only evidence stays byte-identical" bash -c "git -C '$REPO' diff --quiet HEAD -- portal/public/evidence && ! git --git-dir='$ORIGIN' diff --name-only main~1 main | grep -q '^portal/public/evidence/'"

for evidence_mode in export_fail audit_fail partial_failure timeout record_shrink shard_shrink entity_vanish excerpt_vanish budget incomplete malformed; do
  new_sandbox "evidence_$evidence_mode"
  evidence_limit=20m
  [ "$evidence_mode" != timeout ] || evidence_limit=0.2s
  OPAX_TODAY=2026-10-10 OPAX_EVIDENCE_TIMEOUT="$evidence_limit" EVIDENCE_TEST_MODE="$evidence_mode" nightly
  check "$evidence_mode holds all evidence and cleans new shards" bash -c "[ '$NRC' -eq 1 ] && git --git-dir='$ORIGIN' diff --quiet main~1 main -- portal/public/evidence && [ ! -f '$REPO/portal/public/evidence/cc.json' ]"
  check "$evidence_mode preserves catch-up and publishes the rest" bash -c "[ -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending' ] && git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"' && git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'evidence export/audit/guard/install failed'"
done

new_sandbox evidence_missing
rm "$HOME/.cache/autoresearch/evidence-places.sqlite"
OPAX_TODAY=2026-10-10 nightly
check "missing sidecars keep the night green and skip export/staging" bash -c "[ '$NRC' -eq 0 ] && [ ! -f '$HOME/evidence.calls' ] && ! find '$HOME/.cache/autoresearch/pipeline' -maxdepth 1 -name 'evidence-stage.*' | grep -q . && git -C '$REPO' diff --quiet HEAD -- portal/public/evidence"
check "one evidence warning names missing files and status says waiting" bash -c "[ \$(grep -c 'WARN: evidence:' '$SB/nightly.out') -eq 1 ] && git --git-dir='$ORIGIN' show nightly-status:status.json | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d[\"status\"]==\"ok\" and not d[\"failures\"] and \"evidence: waiting for inputs (missing:\" in d[\"summary\"] and \"evidence-places.sqlite\" in d[\"summary\"]'"
check "waiting retains catch-up and publishes the rest" bash -c "[ -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending' ] && git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"'"
OPAX_TODAY=2026-10-10 nightly
check "missing inputs on the next night still succeed without exporting" bash -c "[ '$NRC' -eq 0 ] && [ ! -f '$HOME/evidence.calls' ] && [ -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending' ] && [ \$(grep -c 'WARN: evidence:' '$SB/nightly.out') -eq 1 ]"

new_sandbox evidence_mismatch
python3 - "$HOME/.cache/autoresearch/parli.db" <<'PYEOF'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.execute('INSERT INTO speeches VALUES(2)')
PYEOF
OPAX_TODAY=2026-10-10 nightly
check "mismatched coverage keeps the night green without export" bash -c "[ '$NRC' -eq 0 ] && [ ! -f '$HOME/evidence.calls' ] && [ -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending' ] && [ \$(grep -c 'WARN: evidence:' '$SB/nightly.out') -eq 1 ]"
check "mismatch names sidecars in the successful status summary" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d[\"status\"]==\"ok\" and \"waiting for inputs (mismatch:\" in d[\"summary\"] and \"evidence-layers-full.sqlite\" in d[\"summary\"] and \"evidence-additional-mentions.sqlite\" in d[\"summary\"]'"

for evidence_skip in OPAX_NIGHTLY_SKIP_REFRESH OPAX_NIGHTLY_SKIP_PERIODIC; do
  new_sandbox "evidence_$evidence_skip"
  touch "$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending"
  env "$evidence_skip=1" OPAX_NIGHTLY_NO_PUSH=1 OPAX_TODAY=2026-10-11 bash "$REPO/scripts/vm/nightly.sh" >"$SB/nightly.out" 2>&1
  check "$evidence_skip preserves pending and makes no evidence calls" bash -c "[ -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending' ] && [ ! -f '$HOME/evidence.calls' ]"
done

new_sandbox evidence_gate
mkdir -p "$REPO/portal/node_modules" "$REPO/portal/test"
OPAX_TODAY=2026-10-10 EVIDENCE_TEST_MODE=ok FAKE_NODE_RED_WHILE_CHANGED=portal/public/evidence/aa.json nightly
check "evidence test regression reverts only evidence and retains catch-up" bash -c "[ '$NRC' -eq 1 ] && git --git-dir='$ORIGIN' diff --quiet main~1 main -- portal/public/evidence && [ -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending' ] && git --git-dir='$ORIGIN' show main:portal/public/votes.json | grep -q '\"new\"'"
check "rollback summary reports zero cleaned fields" bash -c "git --git-dir='$ORIGIN' show nightly-status:status.json | grep -q 'evidence: 0 changed shards, 0 records with text changed, 0 cleaned fields'"

new_sandbox evidence_gate_restore
mkdir -p "$REPO/portal/node_modules" "$REPO/portal/test"
OPAX_TODAY=2026-10-10 OPAX_FORCE_GROUPS=weekly EVIDENCE_TEST_MODE=ok FAKE_NODE_RED_WHILE_ANY_CHANGED="portal/public/speakers.json portal/public/votes.json" nightly
check "innocent trial rollback restores evidence acceptance and consumes catch-up" bash -c "[ '$NRC' -eq 1 ] && git --git-dir='$ORIGIN' show main:portal/public/evidence/aa.json | grep -q 'members interjecting' && [ ! -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending' ]"

new_sandbox evidence_commit_failure
printf '#!/bin/sh\nexit 1\n' > "$REPO/.git/hooks/pre-commit"
chmod +x "$REPO/.git/hooks/pre-commit"
OPAX_TODAY=2026-10-10 EVIDENCE_TEST_MODE=ok nightly
check "failed commit restores evidence including the index and retains catch-up" bash -c "[ '$NRC' -eq 1 ] && git -C '$REPO' diff --quiet HEAD -- portal/public/evidence && [ -f '$HOME/.cache/autoresearch/pipeline/evidence-refresh-v1.pending' ]"
check "failed commit status reports no retained evidence changes" grep -q 'evidence: 0 changed shards, 0 records with text changed, 0 cleaned fields' "$HOME/.cache/autoresearch/pipeline/nightly-last.json"

echo
echo "passed $PASS, failed $FAILN"
[ "$FAILN" -eq 0 ]
