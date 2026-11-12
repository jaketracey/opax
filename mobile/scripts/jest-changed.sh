#!/usr/bin/env bash
# Lane-side fast gate: run only the Jest suites related to what changed.
#
# Jest follows each changed source file through the module graph to the test
# files that import it (directly or through other modules). Scanning suites
# always run alongside related tests; non-code test inputs run the full suite.
# Anything else that can change a test's behaviour
# without being imported (the Jest, Babel or TypeScript config, the setup
# files, package.json and the lockfile, scripts/, plugins/, app.config.ts, or
# a file outside mobile/) runs the whole suite instead. The hub's merge gate
# still runs the whole suite on every merge; this is for a lane's own loop.
#
#   scripts/jest-changed.sh [base-ref] [jest arguments...]
#
# base-ref defaults to the merge base with ios/apple-design, or origin/main
# when that branch does not exist. Working-tree and untracked changes count.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=${1:-}
if [ -n "$BASE" ] && git rev-parse --verify --quiet "$BASE" >/dev/null; then shift; else BASE=; fi
if [ -z "$BASE" ]; then
  for candidate in ios/apple-design origin/main main; do
    if git rev-parse --verify --quiet "$candidate" >/dev/null; then BASE=$candidate; break; fi
  done
fi
[ -n "$BASE" ] || { echo 'No base ref found; pass one.' >&2; exit 2; }
MERGE_BASE=$(git merge-base "$BASE" HEAD)
PREFIX=$(git rev-parse --show-prefix)   # mobile/
changed=$( {
  git diff --name-only --diff-filter=ACMRD "$MERGE_BASE" HEAD
  git diff --name-only --diff-filter=ACMRD HEAD
  git ls-files --others --exclude-standard --full-name
} | sort -u )
full_reason=
related=(tests/analytics-events.test.ts tests/no-wrapping-columns.test.ts
  tests/deprecated-recipes.test.ts tests/design-tokens.test.ts
  tests/money-routes.test.ts tests/follows-changes.test.ts)
while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    "$PREFIX"src/*|"$PREFIX"tests/*)
      case "$path" in
        *.js|*.cjs|*.mjs) full_reason="$path (a setup or mock file)" ;;   # tests/*.js setup files
        "$PREFIX"tests/fixture-bytes.ts|"$PREFIX"tests/pinned.ts) full_reason="$path (shared fixture loader)" ;;
        *.ts|*.tsx|*.jsx|*.mts|*.cts)
          if [ -e "${path#"$PREFIX"}" ]; then related+=("${path#"$PREFIX"}"); else full_reason="$path (deleted code)"; fi ;;
        *) full_reason="$path (non-code test input)" ;;
      esac ;;
    *) full_reason="$path (outside src/ and tests/)" ;;
  esac
  [ -z "$full_reason" ] || break
done <<< "$changed"
JEST=(bash scripts/jest-retry.sh)
if [ -n "$full_reason" ]; then
  echo "jest-changed: $full_reason changed; running the whole suite."
  exec "${JEST[@]}" "$@"
fi
count=$(printf '%s\n' "$changed" | awk 'NF {n++} END {print n+0}')
echo "jest-changed: $count changed file(s) since $BASE; running the related suites (the merge gate runs them all)."
exec "${JEST[@]}" --findRelatedTests --passWithNoTests "${related[@]}" "$@"
