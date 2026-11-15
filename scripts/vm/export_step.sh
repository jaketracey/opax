#!/usr/bin/env bash
# scripts/vm/export_step.sh -- run one static export and install its result only if it says something new.
#
#   export_step.sh json DEST CMD...       CMD writes JSON to stdout; DEST (repo-relative) is replaced only if the
#                                         content differs from HEAD's apart from generated*/*_at stamps
#   export_step.sh json DEST --also DEST2 TMP2 [--also ...] CMD...
#                                         CMD also writes companion files to TMP2... (an --out flag each); every
#                                         file is installed by the same rule, and only after CMD succeeded and
#                                         wrote them all, so a failed export never leaves one file of the set new
#                                         beside the others' old copies (15 Nov 2026: the money export wrote
#                                         money-receipts.json in place)
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
    also_dest=(); also_tmp=()
    while [ "${1:-}" = --also ]; do
      [ "$#" -ge 3 ] || { echo "usage: export_step.sh json DEST [--also DEST TMP]... CMD..." >&2; exit 64; }
      also_dest+=("$2"); also_tmp+=("$3"); shift 3
    done
    # A scratch file is removed before the export and again on exit: it must never be a published file (its own
    # DEST, the main DEST or another companion's), nor be named twice.
    for i in "${!also_tmp[@]}"; do
      for d in "$dest" "${also_dest[@]}"; do
        if [ "${also_tmp[$i]}" = "$d" ] || [ "${also_tmp[$i]}" -ef "$d" ]; then
          echo "export_step.sh: the scratch file ${also_tmp[$i]} is the published file $d; nothing run" >&2; exit 64
        fi
      done
      for j in "${!also_tmp[@]}"; do
        if [ "$i" != "$j" ] && [ "${also_tmp[$i]}" = "${also_tmp[$j]}" ]; then
          echo "export_step.sh: the scratch file ${also_tmp[$i]} is named twice; nothing run" >&2; exit 64
        fi
      done
    done
    tmp=$(mktemp "${TMPDIR:-/tmp}/export.XXXXXX")
    trap 'rm -f "$tmp" "${also_tmp[@]+"${also_tmp[@]}"}"' EXIT
    rm -f "${also_tmp[@]+"${also_tmp[@]}"}"
    "$@" > "$tmp"
    for t in "${also_tmp[@]+"${also_tmp[@]}"}"; do
      [ -s "$t" ] || { echo "export_step.sh: the export did not write $t; nothing installed" >&2; exit 2; }
    done
    # With companions, every file of the set is checked before the first is installed: keep_if_unchanged.py refuses
    # an empty or unparseable file one at a time, which would leave the files before it new and the rest old.
    if [ "${#also_tmp[@]}" -gt 0 ]; then
      checks=("$dest" "$tmp")
      for i in "${!also_dest[@]}"; do checks+=("${also_dest[$i]}" "${also_tmp[$i]}"); done
      "$PY" -c 'import json, os, sys
pairs = list(zip(sys.argv[1::2], sys.argv[2::2]))
for dest, new in pairs:
    if os.path.getsize(new) == 0:
        sys.exit(f"export_step.sh: the export wrote nothing for {dest}; nothing installed")
    if dest.endswith(".json"):
        try:
            json.load(open(new, encoding="utf-8"))
        except ValueError as error:
            sys.exit(f"export_step.sh: the export for {dest} is not valid JSON ({error}); nothing installed")' "${checks[@]}" || exit 2
    fi
    for i in "${!also_dest[@]}"; do
      "$PY" scripts/vm/keep_if_unchanged.py "${also_dest[$i]}" "${also_tmp[$i]}"
    done
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
