#!/usr/bin/env bash
# scripts/vm/export_step.sh -- run one static export and install its result only if it says something new.
#
#   export_step.sh json DEST CMD...       CMD writes JSON to stdout; DEST (repo-relative) is replaced only if the
#                                         content differs from HEAD's apart from generated*/*_at stamps
#   export_step.sh file DEST TMP CMD...   CMD writes its JSON to TMP itself (an --out flag); same rule
#   export_step.sh dir PATH... -- CMD...  CMD writes into the tree in place (PATH = the directories and files it
#                                         owns); every tracked .json under them that differs from HEAD only by
#                                         stamps is put back (keep_if_unchanged --sweep). If CMD fails, PATH... is
#                                         restored to HEAD entirely: a half-written export is never left behind
#
# Exporters stamp every file with a generation time, so a night that found nothing new would otherwise commit
# hundreds of "changed" files. Needs PY (the venv python); run from the repo root. Exit status is the
# exporter's (a failed export never installs anything).
set -euo pipefail
PY="${PY:-.venv/bin/python}"
mode=$1; shift
case "$mode" in
  json)
    dest=$1; shift
    tmp=$(mktemp "${TMPDIR:-/tmp}/export.XXXXXX")
    trap 'rm -f "$tmp"' EXIT
    "$@" > "$tmp"
    "$PY" scripts/vm/keep_if_unchanged.py "$dest" "$tmp"
    ;;
  file)
    dest=$1; tmp=$2; shift 2
    rm -f "$tmp"
    "$@"
    "$PY" scripts/vm/keep_if_unchanged.py "$dest" "$tmp"
    ;;
  dir)
    dirs=()
    while [ "$1" != "--" ]; do dirs+=("$1"); shift; done
    shift
    # an exporter that dies half way has rewritten part of the tree in place: put the whole thing back
    rc=0
    "$@" || rc=$?
    if [ "$rc" -ne 0 ]; then
      git checkout -q HEAD -- "${dirs[@]}" 2>/dev/null || true
      git clean -fdq -- "${dirs[@]}" 2>/dev/null || true
      exit "$rc"
    fi
    "$PY" scripts/vm/keep_if_unchanged.py --sweep "${dirs[@]}"
    ;;
  *) echo "usage: export_step.sh json|file|dir ..." >&2; exit 64 ;;
esac
