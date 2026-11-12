#!/usr/bin/env bash
# Optional clean-tree QA records. Gate keys use the whole tree; harness keys
# use mobile/scripts and mobile/patches. Both include tool versions and the
# installed dependency lock,
# ignored .qa.local.env bytes and sorted OPAX_*, EXPO_*, CI and NODE_* values.
# Lock/path controls and OPAX_QA_PASS_RECORD_* are excluded. Only hashes of
# local inputs are stored, never environment values or local configuration.
# node_modules hashing covers only .package-lock.json, not installed file bytes.
# Manual dependency edits with that lock unchanged do not invalidate a record;
# postinstall patches must be deterministic. Releases always run QA afresh.
#
#   qa-pass-record.sh key <gate|harness>
#   qa-pass-record.sh write <stage> <exit-code> <command>
#   qa-pass-record.sh check <stage>
#
# Writes require a successful exit code and command for audit, not attestation.
# OPAX_QA_PASS_RECORD_DIR enables records (never for a release).
# OPAX_QA_PASS_RECORD_MAX_AGE_HOURS defaults to 72.
set -euo pipefail
cd "$(dirname "$0")/.."
ACTION=${1:?key|write|check}; STAGE=${2:?stage}
case "$STAGE" in gate|harness) ;; *) echo "Unknown QA stage: $STAGE" >&2; exit 2 ;; esac
DIR=${OPAX_QA_PASS_RECORD_DIR:-}
# qa-env.sh may reload local configuration in a release child. Fail closed here
# too, even if that configuration sets the record directory again.
[ -z "${OPAX_RELEASE_COMMIT:-}" ] || DIR=
MAX_AGE_HOURS=${OPAX_QA_PASS_RECORD_MAX_AGE_HOURS:-72}
case "$MAX_AGE_HOURS" in ''|*[!0-9]*) echo 'OPAX_QA_PASS_RECORD_MAX_AGE_HOURS must be an integer' >&2; exit 2 ;; esac

tree_clean() { [ -z "$(git status --porcelain --untracked-files=all)" ]; }
stage_tree() {
  case "$STAGE" in
    gate) git rev-parse 'HEAD^{tree}' ;;
    harness)
      git rev-parse "HEAD:$(git rev-parse --show-prefix)scripts" \
        "HEAD:$(git rev-parse --show-prefix)patches" | /usr/bin/shasum -a 256 | cut -d' ' -f1 ;;
  esac
}
record_key() {
  local tree node python
  tree=$(stage_tree)
  node=$(node --version)
  python=$(python3 --version 2>&1)
  python3 - "$STAGE" "$tree" "$node" "$python" <<'PYKEY'
import hashlib, json, os, re, sys
from pathlib import Path
env = {
    name: value for name, value in os.environ.items()
    if (name.startswith(('OPAX_', 'EXPO_', 'NODE_')) or name == 'CI')
    and not name.startswith('OPAX_QA_PASS_RECORD_')
    and not re.search(r'(?:^|_)(?:LOCK|PATH)(?:_|$)', name)
    and name not in {'OPAX_BUILD_GATE', 'OPAX_SIM_GATE', 'OPAX_CAPACITY_CMD'}
}
inputs = [2, *sys.argv[1:], sorted(env.items())]
for name in ('node_modules/.package-lock.json', '.qa.local.env'):
    path = Path(name)
    inputs.append([name, hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None])
print(hashlib.sha256(json.dumps(inputs, separators=(',', ':')).encode()).hexdigest()[:24])
PYKEY
}

case "$ACTION" in
  key) record_key ;;
  write)
    [ -n "$DIR" ] || exit 0
    EXIT_CODE=${3:?write requires exit code}; COMMAND=${4:?write requires gate command}
    [ "$EXIT_CODE" = 0 ] || { echo 'QA pass record not written: command failed.' >&2; exit 1; }
    tree_clean || { echo "QA pass record not written: the tree is not clean." >&2; exit 0; }
    mkdir -p "$DIR"
    key=$(record_key)
    tmp=$(mktemp "$DIR/.tmp.XXXXXX")
    python3 - "$tmp" "$STAGE" "$key" "$(git rev-parse HEAD)" "$(stage_tree)" \
      "$(node --version)" "$(python3 --version 2>&1)" "$(basename "$(git rev-parse --show-toplevel)")" "$COMMAND" "$EXIT_CODE" <<'PY'
import datetime, json, os, platform, sys
path, stage, key, commit, tree, node, python, worktree = sys.argv[1:9]
record = {"stage": stage, "key": key, "commit": commit, "tree": tree, "node": node, "python": python,
          "worktree": worktree, "host": platform.node(), "command": sys.argv[9], "exit_code": int(sys.argv[10]),
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
if (record.get("key") != key or record.get("stage") != stage
        or record.get("exit_code") != 0 or not record.get("command")):
    sys.exit(1)
written = datetime.datetime.strptime(record["written"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
age = datetime.datetime.now(datetime.timezone.utc) - written
if age < datetime.timedelta(0) or age > datetime.timedelta(hours=int(max_age)):
    sys.exit(1)
print(f"{stage} passed on this exact tree at {record['written']} on {record.get('host', '?')} "
      f"({record.get('worktree', '?')}, commit {record['commit'][:12]}): {path}")
PY
    ;;
  *) echo "Unknown action: $ACTION" >&2; exit 2 ;;
esac
