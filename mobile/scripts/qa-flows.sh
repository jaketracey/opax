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
