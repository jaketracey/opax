#!/usr/bin/env bash
# The app data guard: every app build still in use decodes the published files.
#
#   scripts/ci/app-data-guard.sh export <work dir>                   # lay out the app tree and the pinned builds
#   scripts/ci/app-data-guard.sh run <work dir> <published dir>      # run the guard once per build
#
# Published data must decode under the strictest decoders still on readers' phones, not only the newest.
# The guard itself (mobile/tests/published-data.test.ts, its helper, the Jest config and the dependencies)
# comes from the newest app line, APP_REF. It is run once with that line's own decoders, then once for each
# pinned build with that build's mobile/src in their place (OPAX_DECODERS_SRC), so one install serves them
# all. PINNED_BUILDS lists them, one "label|tag|commit" a line: the tag keeps the commit reachable, and the
# commit says what the tag must still point at. Each problem names the build, the file and the path inside
# it: [1.1.3 (57)] bills/au-federal-r7520.json divisions.question
#
# `export` prints "present=true" when APP_REF carries the guard and "present=false" when it does not (the
# only case a caller may treat as nothing to check). Anything else that goes wrong (an app line that is not
# there, a pin whose tag is missing or has moved, a build with no decoders) is an error: it exits non-zero
# and prints neither. Between the two commands, install the app tree's dependencies (npm ci in
# <work dir>/app/mobile). The gates workflow's app-data job does exactly this.
set -euo pipefail

APP_REF=${APP_REF:?the newest app line, for example ios/apple-design}
PINNED_BUILDS=${PINNED_BUILDS:-}
command=${1:?export or run}
work=${2:?a work directory}
app="$work/app/mobile"

# "1.1.3 (57)" -> "1-1-3-57": a folder name inside the app tree.
slug() { printf '%s' "$1" | tr -c 'A-Za-z0-9' '-' | sed 's/--*/-/g; s/^-//; s/-$//'; }
# The app line as a commit: its remote branch, or the name as given.
app_commit() { git rev-parse -q --verify "origin/$APP_REF^{commit}" || git rev-parse -q --verify "$APP_REF^{commit}"; }
pinned() { printf '%s\n' "$PINNED_BUILDS" | sed 's/[[:space:]]*$//' | grep -v '^[[:space:]]*$' || true; }

case "$command" in
  export)
    commit=$(app_commit) || { echo "app-data-guard: the app line $APP_REF is not in this checkout" >&2; exit 1; }
    mkdir -p "$work/app"
    git archive "$commit" mobile | tar -x -C "$work/app"
    if [ ! -f "$app/tests/published-data.test.ts" ]; then
      echo "app-data-guard: the data guard is not on $APP_REF" >&2
      echo 'present=false'
      exit 0
    fi
    while IFS='|' read -r label tag commit; do
      [ -n "$label" ] || continue
      [ -n "$tag" ] && [ -n "$commit" ] || { echo "app-data-guard: $label: a pin is \"label|tag|commit\"" >&2; exit 1; }
      # A full-depth checkout has every tag; fetch them when this one does not.
      git rev-parse -q --verify "refs/tags/$tag^{commit}" >/dev/null ||
        git fetch --quiet --tags origin ||
        { echo "app-data-guard: $label: the tags could not be fetched" >&2; exit 1; }
      at=$(git rev-parse -q --verify "refs/tags/$tag^{commit}") ||
        { echo "app-data-guard: $label: the tag $tag is not in this repository" >&2; exit 1; }
      [ "$at" = "$commit" ] ||
        { echo "app-data-guard: $label: the tag $tag is at $at, not the pinned $commit" >&2; exit 1; }
      to="$app/pinned-builds/$(slug "$label")"
      mkdir -p "$to"
      git archive "$commit" mobile/src | tar -x --strip-components=1 -C "$to"
      [ -f "$to/src/api/catalog-decoders.ts" ] ||
        { echo "app-data-guard: $label ($commit) has no decoders" >&2; exit 1; }
    done < <(pinned)
    echo 'present=true'
    ;;
  run)
    published=$(cd "${3:?the published folder (portal/public)}" && pwd)
    failed=()
    # One build: its label, then its source tree (empty for the app line's own).
    check() {
      local label=$1 src=$2 started=$SECONDS rc=0
      echo "::group::app data guard: $label"
      ( cd "$app" && env OPAX_PUBLISHED_DIR="$published" OPAX_DECODERS_LABEL="$label" \
          ${src:+OPAX_DECODERS_SRC="$src"} npm test -- tests/published-data.test.ts ) || rc=$?
      echo "::endgroup::"
      echo "app-data-guard: $label: $([ "$rc" = 0 ] && echo passed || echo FAILED) in $((SECONDS - started)) s"
      [ "$rc" = 0 ] || failed+=("$label")
    }
    check "$APP_REF" ''
    while IFS='|' read -r label _tag _commit; do
      [ -n "$label" ] || continue
      [ -d "$app/pinned-builds/$(slug "$label")/src" ] ||
        { echo "app-data-guard: $label was not exported" >&2; exit 1; }
      check "$label" "$app/pinned-builds/$(slug "$label")/src"
    done < <(pinned)
    if [ "${#failed[@]}" -gt 0 ]; then
      echo "app-data-guard: published data does not decode in: ${failed[*]}" >&2
      exit 1
    fi
    ;;
  *)
    echo "app-data-guard: unknown command $command" >&2
    exit 2
    ;;
esac
