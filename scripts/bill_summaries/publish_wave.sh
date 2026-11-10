#!/usr/bin/env bash
# Store a wave of accepted summaries in the desktop registry and re-project the bills.
#
# Run on the desktop (the registry host) inside the export worktree, after
# `accepted/` has been synced into the pack:
#
#   PACK=~/.cache/autoresearch/bill-summaries-20261110 scripts/bill_summaries/publish_wave.sh
#
# Steps, each one stopping the run on failure:
#   store      store_reviewed.py: backup, then insert the accepted rows as review_state ok
#   export     export_bills.py (registry mode) into a fresh directory, rsync --delete into portal/public/bills
#   guard      scripts/vm/bills_guard.py --apply-holds: a regressed bill keeps its HEAD copy (nightly's rule)
#   briefs     export_bills.py --fill-briefs, then verify_bill_briefs.py proves no speech brief was lost
#   tidy       keep_if_unchanged.py --sweep: unchanged files keep HEAD's bytes, so the diff is only real changes
#   test       node portal/test/bills.test.mjs on the result
#   counts     has_summary before (HEAD) and after
#
# The commit, push, deploy, KB upsert and cache-epoch bump happen from the Mac afterwards.
set -euo pipefail
WT=${WT:-/home/jake/Projects/opax-ios-wt/bill-summaries}
PACK=${PACK:-$HOME/.cache/autoresearch/bill-summaries-20261110}
PY=${PY:-/home/jake/opax/.venv/bin/python}
ACC=${ACC:-$PACK/accepted}   # a gated wave directory from reconcile.py --gate
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
cd "$WT"
# shellcheck disable=SC1090
[ -f "$HOME/opax-work/env.sh" ] && . "$HOME/opax-work/env.sh"   # node 24 for the shape test
[ -f .env ] || cp "$HOME/opax/.env" .env   # knowledge box credentials for the briefs (gitignored)

echo "== store"
"$PY" scripts/bill_summaries/store_reviewed.py --accepted "$ACC" --fetched "$PACK/fetched.json" \
  --receipt "$PACK/store-desktop-$STAMP.json"

echo "== export"
OUT=/tmp/bills-export-$STAMP
"$PY" scripts/export_bills.py --out "$OUT"
rsync -a --delete "$OUT/" portal/public/bills/
rm -rf "$OUT"

echo "== guard"
"$PY" scripts/vm/bills_guard.py --apply-holds --held-report "$PACK/held-$STAMP.json"

echo "== briefs"
"$PY" scripts/export_bills.py --fill-briefs portal/public/bills
"$PY" scripts/verify_bill_briefs.py

echo "== tidy"
"$PY" scripts/vm/keep_if_unchanged.py --sweep portal/public/bills

echo "== test"
node portal/test/bills.test.mjs

echo "== counts"
python3 - <<'PY'
import json, subprocess
head = json.loads(subprocess.run(["git", "show", "HEAD:portal/public/bills/index.json"], capture_output=True, text=True, check=True).stdout)
now = json.load(open("portal/public/bills/index.json"))
hs = lambda d: sum(1 for b in d["bills"] if b["has_summary"])
print(f"bills: HEAD {head['count']} -> {now['count']}; has_summary: HEAD {hs(head)} -> {hs(now)}")
changed = sum(1 for line in subprocess.run(["git", "status", "--porcelain", "portal/public/bills"], capture_output=True, text=True).stdout.splitlines())
print(f"changed files under portal/public/bills: {changed}")
PY
