#!/usr/bin/env bash
# The withheld list in a release: applied to the built files just before they are deployed, and taken out of
# the working tree again before anything is committed back. Run from the repository root by the Deploy
# workflow (.github/workflows/deploy.yml):
#
#   withheld_overlay.sh apply     after the build and the tests, before `wrangler deploy`
#   withheld_overlay.sh restore   after the deploy and the table reload, before the restamp commit
#
# The list arrives in OPAX_WITHHELD_JSON (an Actions secret) and is never in the repository. With no secret
# both commands do nothing. The tests run on the public build, so a test failure can never print a withheld
# item, and the restamp commit is made from the public build, so no commit can show one being removed.
# Nothing here prints a path, a count or a build log: the one line is the same whatever the list holds.
set -euo pipefail
snapshot="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/opax-public-build"
data=(portal/public/royal-commissions portal/public/transcripts portal/public/integrity-reports portal/public/agency-reports portal/public/annual-reports)

case "${1:-}" in
  apply)
    if [ -n "${OPAX_WITHHELD_JSON:-}" ]; then
      rm -rf "$snapshot"; mkdir -p "$snapshot"
      # Every file the restamp commit could carry, as the public build left it.
      node scripts/stamp_assets.mjs --files | while IFS= read -r file; do
        if [ -f "$file" ]; then mkdir -p "$snapshot/$(dirname "$file")"; cp -p "$file" "$snapshot/$file"; fi
      done
      if ! (cd portal && node ../scripts/apply_source_policy.mjs && node ../scripts/build_search_catalog.mjs \
            && node ../scripts/cached_release_build.mjs crawl && node ../scripts/stamp_assets.mjs) >/dev/null 2>&1; then
        echo "::error::the release could not be prepared; nothing was deployed"
        exit 1
      fi
    fi
    echo "[withheld_overlay] ready" ;;
  restore)
    if [ -d "$snapshot" ]; then
      (cd "$snapshot" && find . -type f -print0) | while IFS= read -r -d '' file; do cp -p "$snapshot/$file" "$file"; done
      rm -rf "$snapshot"
      # Data files the overlay rewrote or removed go back to the committed copies.
      git checkout -- "${data[@]}" >/dev/null 2>&1 || true
    fi
    echo "[withheld_overlay] ready" ;;
  *) echo "usage: withheld_overlay.sh apply|restore" >&2; exit 2 ;;
esac
