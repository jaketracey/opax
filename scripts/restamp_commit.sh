#!/usr/bin/env bash
# Commit the post-deploy restamp back to main. The Deploy workflow's last step
# (.github/workflows/deploy.yml) runs it from the repository root once production is live.
#
# The release build ends with scripts/stamp_assets.mjs, which regenerates files from what the
# build made: the coverage table in index.html from corpus.json, spa-shell.js from index.html,
# seo-links.json, the ?v= content stamps in the pages and module importers, and _headers.
# Every file on `node scripts/stamp_assets.mjs --files` (what the stamp writes or hashes, and the
# search-catalogue manifest the coverage table counts) that the build changed is committed
# together, so a stamp never lands without the file it names. Until 13 Nov
# 2026 a fixed pattern chose the files and missed spa-shell.js: main held an index.html naming a
# spa-shell.js it did not have, `stamp_assets --check` failed on main, and SPA hydration failed
# on every branch until #312.
#
# The commit is then checked out on its own, without the rest of the build's output: stamp_assets
# --check must pass there and stamping must leave that tree clean. That check runs again after
# every rebase onto a newer main. If it fails on any attempt, nothing is pushed and the step
# fails, so the job opens its "Deploy failed" issue. Production is already deployed.
#
# Never committed: voice.js and chunks/ (esbuild bakes the absolute checkout path into their
# hashes, so a CI build never matches the committed copy) and anything else not on that list.
# A notice lists the tracked ones the build changed.
set -euo pipefail

# The build rewrites this file's line endings; it is never a real change.
git checkout -- portal/public/grants-map-LICENSE.txt 2>/dev/null || true

list=$(node scripts/stamp_assets.mjs --files)
if [ -z "$list" ]; then
  echo "::error::stamp_assets.mjs --files listed nothing; the restamp was not committed"
  exit 1
fi
files=()
while IFS= read -r file; do files+=("$file"); done <<<"$list"
git add -- "${files[@]}"
stamped=$(git diff --cached --name-only)
other=$(git diff --name-only)
if [ -n "$other" ]; then
  echo "::notice::tracked files changed by the build and not committed: $(echo "$other" | paste -sd ' ' -)"
fi
if [ -n "$stamped" ]; then
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git commit -q -m "Restamp assets after deploy [skip ci]"
  echo "Restamp commit: $(echo "$stamped" | paste -sd ' ' -)"
else
  echo "Stamps unchanged; nothing to commit."
fi

# Check what main will hold (HEAD: the restamp commit, or main as it was) in a clean worktree:
# stamp_assets --check must pass and stamping must leave the tree clean. Run before the first push
# and again after every rebase onto a newer main, so nothing that fails it is ever pushed.
check_root=""
cleanup() {
  [ -n "$check_root" ] || return 0
  git worktree remove --force "$check_root/tree" >/dev/null 2>&1 || true
  rm -rf -- "$check_root"
  check_root=""
}
trap cleanup EXIT
check_head() {  # $1: what went wrong if it fails
  local dir problems="" dirty
  check_root=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/restamp-check.XXXXXX")
  dir="$check_root/tree"
  git worktree add -q --detach "$dir" HEAD
  # the stamp loads wrangler's config reader and seo-content.ts's packages from portal/node_modules
  if [ -d portal/node_modules ]; then ln -s "$PWD/portal/node_modules" "$dir/portal/node_modules"; fi
  (cd "$dir" && node scripts/stamp_assets.mjs --check) || problems="stamp_assets --check failed"
  (cd "$dir" && node scripts/stamp_assets.mjs >/dev/null) || problems="${problems:+$problems; }stamping failed"
  dirty=$(git -C "$dir" status --porcelain --untracked-files=all -- . ':(exclude)portal/node_modules' | cut -c4-)
  if [ -n "$dirty" ]; then problems="${problems:+$problems; }stamping it changes $(echo "$dirty" | paste -sd ' ' -)"; fi
  cleanup
  if [ -n "$problems" ]; then
    echo "::error::the restamp commit fails the stamp check on its own ($problems). Nothing was pushed; production is already deployed. $1"
    # shellcheck disable=SC2016 # the backticks are Markdown for the job summary
    printf '### Restamp not pushed\n- %s\n- main fails `node scripts/stamp_assets.mjs --check` until the missing files are committed\n' "$problems" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    exit 1
  fi
  echo "The restamp commit passes stamp_assets --check on its own."
}
check_head "A file the build regenerates is missing from stamp_assets.mjs --files."
[ -n "$stamped" ] || exit 0

for attempt in 1 2 3 4 5; do
  if git push origin HEAD:main; then exit 0; fi
  echo "push rejected (attempt $attempt); rebasing onto origin/main"
  if git pull --rebase --autostash origin main; then
    check_head "main moved during the deploy (rebased on attempt $attempt); a push that changes what the stamp reads starts its own deploy, which restamps main."
  else
    echo "::warning::restamp rebase failed (attempt $attempt); production is already deployed"
    git rebase --abort 2>/dev/null || true
  fi
  sleep $((attempt * 5))
done
echo "::warning::could not push the restamp commit; production is already deployed"
exit 0
