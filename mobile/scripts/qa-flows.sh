#!/usr/bin/env bash
# Journey selection rules for scripts/e2e.sh. Source this file; it defines
# functions only and starts nothing.

# Journeys that run alone, by explicit path, at the text size their header
# states. A bare number would select them at the default size with others.
qa_path_only_journey() {
  case "$1" in
    15) printf '%s\n' '.maestro/15-cold-first-line.yaml' ;;
    *) return 1 ;;
  esac
}

# Refuses a bare number for a path-only journey before anything starts.
qa_check_flow_selectors() {
  local flow path
  for flow in "$@"; do
    if path=$(qa_path_only_journey "$flow"); then
      echo "Journey $flow runs alone, by path, at AX5:" >&2
      echo "  OPAX_CONTENT_SIZE=accessibility-extra-extra-extra-large scripts/e2e.sh <udid> $path" >&2
      return 2
    fi
  done
}

# The whole iPhone suite on the default fixture at the default text size, in
# journey order: scripts/e2e.sh <udid> --all-iphone. A bare number selects
# every .maestro/NN-*.yaml except the open-profile and scene-lifecycle helpers
# (e2e.sh), so journeys that share a number with a separate run are paths.
# Not iPhone suite journeys: the iPad flows (52-54, 55b, 56, 57b, ipad-tour-*),
# release-community-hidden (needs an OPAX_HIDE_COMMUNITY=1 build) and the
# reviewer walkthrough and review-pages captures.
qa_iphone_suite() {
  printf '%s\n' 01 02 03 04 05 06 07 08 09 10 11 12 13 14 20 21 22 23 24 25 27 28 \
    .maestro/28b-cold-launch.yaml 29 \
    .maestro/30-ask-entry-points.yaml .maestro/30-ask-people.yaml \
    .maestro/30-ask-progress.yaml .maestro/30-ask.yaml \
    31 32 33 34 35 36 37 38 39 40 42 43 44 45 46 48 49 50 51 55 57 58
}

# Journeys that need their own fixture or text size, one e2e.sh run each.
qa_iphone_separate_runs() {
  printf '%s\n' \
    'OPAX_FIXTURE_EDITION=absent scripts/e2e.sh <udid> .maestro/13b-today-no-edition.yaml' \
    'OPAX_FIXTURE_EDITION=withdrawn scripts/e2e.sh <udid> .maestro/13c-today-edition-withdrawn.yaml' \
    'OPAX_CONTENT_SIZE=accessibility-extra-extra-extra-large scripts/e2e.sh <udid> .maestro/15-cold-first-line.yaml' \
    'scripts/e2e.sh <udid> .maestro/15-cold-first-line.yaml' \
    'OPAX_FIXTURE_DATA=changed scripts/e2e.sh <udid> .maestro/26-follows.yaml' \
    'OPAX_FIXTURE_ROSTER=null-optional scripts/e2e.sh <udid> .maestro/30-catalog-robustness.yaml'
}

# Every run that makes up the full iPhone suite, for scripts/e2e.sh --list-iphone.
qa_iphone_plan() {
  echo 'scripts/e2e.sh <udid> --all-iphone'
  echo "  = scripts/e2e.sh <udid> $(qa_iphone_suite | tr '\n' ' ' | sed 's/ $//')"
  qa_iphone_separate_runs
}
