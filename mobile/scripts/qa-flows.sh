#!/usr/bin/env bash
# Journey selection rules for scripts/e2e.sh. Source this file; it defines
# functions only and starts nothing.

# Journeys that run alone, by explicit path, at the text size their header
# states. A bare number would select them at the default size with others.
qa_path_only_journey() {
  case "$1" in
    28) printf '%s\n' '.maestro/28-welcome-ax5.yaml' ;;
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
# Not iPhone suite journeys: the iPad flows (52-54, 55b, 56, 57b, other iPad captures),
# release-community-hidden (needs an OPAX_HIDE_COMMUNITY=1 build) and the
# reviewer walkthrough and review-pages captures.
qa_iphone_suite() {
  printf '%s\n' 01 02 03 04 05 06 07 08 09 10 11 12 13 14 20 21 22 23 24 25 27 \
    .maestro/28-welcome.yaml .maestro/28b-cold-launch.yaml .maestro/28c-welcome-not-now.yaml \
    .maestro/28d-first-launch-link.yaml .maestro/28e-no-permission-at-launch.yaml \
    .maestro/28f-update-from-1-0.yaml .maestro/28g-welcome-basics.yaml \
    .maestro/13d-today-seat.yaml .maestro/13e-today-invitation.yaml \
    .maestro/13f-today-edition-tiers.yaml .maestro/13h-today-state-seat.yaml \
    .maestro/13i-today-see-all.yaml 29 \
    .maestro/30-ask-entry-points.yaml .maestro/30-ask-people.yaml \
    .maestro/30-ask-progress.yaml .maestro/30-ask.yaml \
    31 32 33 34 35 36 37 39 42 43 44 45 46 48 49 50 51 55 57 58 59 60 61 62 63 64 65 66 67 68 69 70 .maestro/22b-sources.yaml
}

# Journeys that need their own fixture or text size, one e2e.sh run each.
qa_iphone_separate_runs() {
  printf '%s\n' \
    'OPAX_FIXTURE_EDITION=absent scripts/e2e.sh <udid> .maestro/13b-today-no-edition.yaml' \
    'OPAX_FIXTURE_EDITION=withdrawn scripts/e2e.sh <udid> .maestro/13c-today-edition-withdrawn.yaml' \
    'OPAX_CONTENT_SIZE=accessibility-extra-extra-extra-large scripts/e2e.sh <udid> .maestro/15-cold-first-line.yaml' \
    'scripts/e2e.sh <udid> .maestro/15-cold-first-line.yaml' \
    'OPAX_FIXTURE_DATA=changed scripts/e2e.sh <udid> .maestro/26-follows.yaml' \
    'OPAX_CONTENT_SIZE=accessibility-extra-extra-extra-large scripts/e2e.sh <udid> .maestro/28-welcome-ax5.yaml' \
    'OPAX_FIXTURE_ROSTER=vacant scripts/e2e.sh <udid> .maestro/28g-vacant-seat.yaml' \
    'OPAX_NETWORK_PROFILE=throttled scripts/e2e.sh <udid> .maestro/13g-today-first-install.yaml' \
    'scripts/e2e.sh <udid> .maestro/26c-follow-limit.yaml' \
    'OPAX_FIXTURE_ROSTER=null-optional scripts/e2e.sh <udid> .maestro/30-catalog-robustness.yaml'
}

# Every run that makes up the full iPhone suite, for scripts/e2e.sh --list-iphone.
qa_iphone_plan() {
  echo 'scripts/e2e.sh <udid> --all-iphone'
  echo "  = scripts/e2e.sh <udid> $(qa_iphone_suite | tr '\n' ' ' | sed 's/ $//')"
  qa_iphone_separate_runs
}

# Prepared Android paths are explicit; numeric selectors may match multiple
# journeys (for example 32 Ask and record reader). Helpers are not suite roots.
qa_android_select() {
  local root=$1 selector=$2
  python3 - "$root" "$selector" <<'PYSELECT'
import json, pathlib, re, sys
root=pathlib.Path(sys.argv[1]); selector=sys.argv[2]
plan=json.loads((root/'suite.json').read_text())
if selector == '--all-android':
    selected=[p['path'] for p in plan if p['run']]
elif selector.startswith('.maestro/'):
    selected=[selector.removeprefix('.maestro/')]
elif any(pathlib.Path(p['path']).stem == selector for p in plan):
    # An exact name selects that flow only: 28-welcome never also means
    # 28-welcome-ax5. A flow that does not run on Android stays unsupported.
    selected=[p['path'] for p in plan if p['run'] and pathlib.Path(p['path']).stem == selector]
else:
    selected=[p['path'] for p in plan if p['run'] and re.match(re.escape(selector)+r'-', pathlib.Path(p['path']).name)]
if not selected or any(not (root/p).is_file() for p in selected):
    raise SystemExit('Unsupported Android journey: '+selector)
for path in selected: print('.maestro/'+path)
PYSELECT
}
