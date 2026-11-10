#!/usr/bin/env bash
# QA pass records: let scripts/qa.sh skip a stage that already passed on this
# exact tree, so a release does not repeat the merge gate's work.
#
# A record names the inputs the stage reads: the stage, a tree hash, and the
# Node and Python versions. The `gate` stage (typecheck, lint, test) uses HEAD's
# whole tree, so every tracked file counts, package-lock.json and the scripts
# included. The `harness` stage (the scripts self-tests, which exercise
# mobile/scripts in temporary directories) uses the mobile/scripts subtree.
# Records are written and honoured only for a clean tree (no modified, staged
# or untracked files), so nothing outside the tree can make a record claim more
# than it tested. Nothing happens unless OPAX_QA_PASS_RECORD_DIR names a
# directory.
#
#   qa-pass-record.sh key <stage>      print the record key
#   qa-pass-record.sh write <stage>    record a pass (no-op without the dir)
#   qa-pass-record.sh check <stage>    exit 0 and print the record if one is fresh
#
# OPAX_QA_PASS_RECORD_MAX_AGE_HOURS (default 72) bounds how old a record may be.
set -euo pipefail
cd "$(dirname "$0")/.."
ACTION=${1:?key|write|check}; STAGE=${2:?stage}
case "$STAGE" in gate|harness) ;; *) echo "Unknown QA stage: $STAGE" >&2; exit 2 ;; esac
DIR=${OPAX_QA_PASS_RECORD_DIR:-}
MAX_AGE_HOURS=${OPAX_QA_PASS_RECORD_MAX_AGE_HOURS:-72}
case "$MAX_AGE_HOURS" in ''|*[!0-9]*) echo 'OPAX_QA_PASS_RECORD_MAX_AGE_HOURS must be an integer' >&2; exit 2 ;; esac

tree_clean() { [ -z "$(git status --porcelain --untracked-files=all)" ]; }
stage_tree() {
  case "$STAGE" in
    gate) git rev-parse 'HEAD^{tree}' ;;
    harness) git rev-parse "HEAD:$(git rev-parse --show-prefix)scripts" ;;
  esac
}
record_key() {
  local tree node python
  tree=$(stage_tree)
  node=$(node --version)
  python=$(python3 --version 2>&1)
  printf '%s\n%s\n%s\n%s\n' "$STAGE" "$tree" "$node" "$python" | /usr/bin/shasum -a 256 | cut -c1-24
}

case "$ACTION" in
  key) record_key ;;
  write)
    [ -n "$DIR" ] || exit 0
    tree_clean || { echo "QA pass record not written: the tree is not clean." >&2; exit 0; }
    mkdir -p "$DIR"
    key=$(record_key)
    tmp=$(mktemp "$DIR/.tmp.XXXXXX")
    python3 - "$tmp" "$STAGE" "$key" "$(git rev-parse HEAD)" "$(stage_tree)" \
      "$(node --version)" "$(python3 --version 2>&1)" "$(basename "$(git rev-parse --show-toplevel)")" <<'PY'
import datetime, json, os, platform, sys
path, stage, key, commit, tree, node, python, worktree = sys.argv[1:9]
record = {"stage": stage, "key": key, "commit": commit, "tree": tree, "node": node, "python": python,
          "worktree": worktree, "host": platform.node(),
          "written": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
with open(path, "w") as handle:
    json.dump(record, handle, indent=2)
    handle.write("\n")
PY
    /bin/mv -f "$tmp" "$DIR/$STAGE-$key.json"
    echo "QA pass record written: $DIR/$STAGE-$key.json"
    ;;
  check)
    [ -n "$DIR" ] || exit 1
    tree_clean || exit 1
    key=$(record_key)
    file="$DIR/$STAGE-$key.json"
    [ -f "$file" ] || exit 1
    python3 - "$file" "$key" "$STAGE" "$MAX_AGE_HOURS" <<'PY' || exit 1
import datetime, json, sys
path, key, stage, max_age = sys.argv[1:5]
try:
    record = json.load(open(path))
except Exception:
    sys.exit(1)
if record.get("key") != key or record.get("stage") != stage:
    sys.exit(1)
written = datetime.datetime.strptime(record["written"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
age = datetime.datetime.now(datetime.timezone.utc) - written
if age > datetime.timedelta(hours=int(max_age)):
    sys.exit(1)
print(f"{stage} passed on this exact tree at {record['written']} on {record.get('host', '?')} "
      f"({record.get('worktree', '?')}, commit {record['commit'][:12]}): {path}")
PY
    ;;
  *) echo "Unknown action: $ACTION" >&2; exit 2 ;;
esac
