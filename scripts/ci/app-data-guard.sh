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
# Each run must also print which decoders it read, "decoders: <label> <folder>", naming the folder the run
# was pointed at: a label over another build's decoders fails that build.
#
# The same run also checks one endpoint the Worker builds at request time, which no static file shows:
# /api/app/v1/vic-election. scripts/ci/app-endpoint-guard/vic-election-candidates.test.tsx is copied into the
# app tree and run once per build against the committed answers in app-endpoint-guard/fixtures (generated
# from the built hub data by scripts/ci/app-endpoint-fixtures.mjs). A build with election screens must decode
# them and draw every candidate and party with no party link; a build without must not read the endpoint.
# Each run prints "endpoint: <label> <folder> ...", checked the same way as the decoders line. A pinned
# build's rows import its native module shims and launch fixtures from beside mobile/src, so `export` lays
# out mobile/modules and mobile/scripts/fixtures with it where the build has them.
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
    # A pinned run swaps in that build's decoders through OPAX_DECODERS_SRC. A guard helper that does not read
    # it would test the app line's decoders again under the pinned build's name and pass without checking it.
    if [ -n "$(pinned)" ] && ! grep -q 'OPAX_DECODERS_SRC' "$app/tests/published-data.ts" 2>/dev/null; then
      echo "app-data-guard: the guard on $APP_REF does not read OPAX_DECODERS_SRC, so pinned builds would not be checked" >&2
      exit 1
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
      # Beside src, as that build's own files import them (the endpoint check draws its candidate rows).
      for beside in mobile/modules mobile/scripts/fixtures; do
        if git cat-file -e "$commit:$beside" 2>/dev/null; then
          git archive "$commit" "$beside" | tar -x --strip-components=1 -C "$to"
        fi
      done
      [ -f "$to/src/api/catalog-decoders.ts" ] ||
        { echo "app-data-guard: $label ($commit) has no decoders" >&2; exit 1; }
    done < <(pinned)
    echo 'present=true'
    ;;
  run)
    published=$(cd "${3:?the published folder (portal/public)}" && pwd)
    failed=()
    # The endpoint check and its fixtures come from this checkout, not from the app line.
    endpoint="$(cd "$(dirname "$0")" && pwd)/app-endpoint-guard"
    [ -f "$endpoint/vic-election-candidates.test.tsx" ] && [ -f "$endpoint/fixtures/overview.json" ] ||
      { echo "app-data-guard: the endpoint check or its fixtures are missing from $endpoint" >&2; exit 1; }
    cp "$endpoint/vic-election-candidates.test.tsx" "$app/tests/app-endpoint-vic-election-candidates.test.tsx"
    # One build: its label, then its source tree (empty for the app line's own).
    check() {
      local label=$1 src=$2 started=$SECONDS rc=0 log expected
      log=$(mktemp "$work/app-data-guard.XXXXXX")
      # The folder as the module system names it: with every link resolved.
      expected=$(cd "${src:-$app/src}" && pwd -P)
      echo "::group::app data guard: $label"
      ( cd "$app" && env OPAX_PUBLISHED_DIR="$published" OPAX_DECODERS_LABEL="$label" \
          ${src:+OPAX_DECODERS_SRC="$src"} npm test -- tests/published-data.test.ts ) 2>&1 | tee "$log" ||
        rc=${PIPESTATUS[0]}
      echo "::endgroup::"
      # The label is only a name. The helper prints the folder it loaded the decoders from, and a run that
      # does not say it read this build's own is no check of this build, whatever its tests did.
      if ! grep -Fxq "decoders: $label $expected" "$log"; then
        echo "app-data-guard: $label: the run did not say \"decoders: $label $expected\"" >&2
        echo "app-data-guard: $label: it said: $(grep '^decoders: ' "$log" | sort -u | tr '\n' ';' || true)" >&2
        rc=1
      fi
      # The endpoint, read and drawn by this build's own source.
      echo "::group::app endpoint guard: $label"
      ( cd "$app" && env OPAX_ENDPOINT_FIXTURES="$endpoint/fixtures" OPAX_DECODERS_LABEL="$label" \
          ${src:+OPAX_DECODERS_SRC="$src"} npm test -- tests/app-endpoint-vic-election-candidates.test.tsx ) 2>&1 | tee "$log" ||
        rc=${PIPESTATUS[0]}
      echo "::endgroup::"
      if ! grep -Fq "endpoint: $label $expected " "$log"; then
        echo "app-data-guard: $label: the endpoint run did not say \"endpoint: $label $expected\"" >&2
        rc=1
      else
        grep -F "endpoint: $label $expected " "$log" | head -1 | sed 's/^ *//'
      fi
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
      echo "app-data-guard: the guard failed for: ${failed[*]}" >&2
      exit 1
    fi
    ;;
  *)
    echo "app-data-guard: unknown command $command" >&2
    exit 2
    ;;
esac
