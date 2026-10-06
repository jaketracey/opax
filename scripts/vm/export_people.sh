#!/usr/bin/env bash
# scripts/vm/export_people.sh -- portal/public/parliamentarians.json as committed: the speech-derived directory
# (scripts/export_parliamentarians.py) plus the recorded parliamentary representation that
# scripts/enrich_profile_jurisdictions.py attaches from the members table and the AEC seat list in research/mlci.json.
# Prints the finished JSON to stdout (scripts/vm/export_step.sh json installs it only if it moved by more than a
# timestamp). The bare export alone would drop every person's `representation`, which portal tests and the person
# pages need (found by the first VM rehearsal, 2026-09-29: David Pocock lost his territory).
# Witness rows are partitioned before identity resolution; the final check refuses
# any MP identity or party on the separated testimony, even with OPAX_ROSTER_ACCEPT.
# Needs PY (default .venv/bin/python), OPAX_DB (default ~/.cache/autoresearch/parli.db), sqlite3, run from the repo root.
set -euo pipefail
PY="${PY:-.venv/bin/python}"
DB="${OPAX_DB:-$HOME/.cache/autoresearch/parli.db}"
T=$(mktemp -d "${TMPDIR:-/tmp}/people.XXXXXX")
trap 'rm -rf "$T"' EXIT
"$PY" scripts/export_parliamentarians.py --defer-check > "$T/directory.json"
sqlite3 -readonly -json "$DB" "SELECT full_name, state, chamber, electorate, entered_house, left_house FROM members" > "$T/members.json"
"$PY" scripts/enrich_profile_jurisdictions.py --members "$T/members.json" --directory "$T/directory.json" \
    --research portal/public/research/mlci.json >&2
"$PY" scripts/export_parliamentarians.py --check-directory "$T/directory.json" >&2
cat "$T/directory.json"
