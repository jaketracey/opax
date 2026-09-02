"""
parli.ingest.money_classify -- industry classification pass over `ext_donations`.

Three tiers, cheapest first; each only touches rows whose `industry` is still
NULL, and every row records how it was labelled in `industry_source`:

  keyword     INDUSTRY_KEYWORDS substring rules from parli.ingest.classify_donations
              (first industry to match in table order wins -- same semantics as the
              AEC SQL pass and the ingest-time classify_donor_name()).
  individual  donor_type = 'individual' -> 'individual' (the AEC fallback rule).
  aec_match   exact case-insensitive donor-name match against the AEC `donations`
              table; inherits that donor's most common industry, ignoring
              'other' / 'unidentified'. Measured 2026-09-02: 449 state donors /
              2,523 rows inherit a label this way, with zero conflicting names.

Whatever is still NULL afterwards is the LLM-pass candidate set (organisation
names no rule knows). That pass is deliberately NOT here: it spends API money,
so it is the user's call -- `--report` prints the candidates with counts and
dollars so the cost can be sized (batching 100 names per call as
classify_donations_llm does puts ~2,700 names at ~27 Haiku calls).

The script runs where parli.db lives: over ssh by default (stdlib only on the
far side, the keyword table travels base64-encoded in argv), or against a
local file with --db. The legacy `donations` table is only ever read.

Usage:
    python -m parli.ingest.money_classify              # classify on desktop:parli.db
    python -m parli.ingest.money_classify --report     # also list the LLM candidates
    python -m parli.ingest.money_classify --db /tmp/t.db --dry-run
"""

from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys

from parli.ingest.classify_donations import INDUSTRY_KEYWORDS
from parli.ingest.ext_common import DEFAULT_DB_HOST, DEFAULT_REMOTE_DB, log

PLACEHOLDERS = ["0", "1", "2", "3", "-", "--", "n/a", "N/A"]

# Runs on the box that holds parli.db. argv[1] = base64 JSON payload.
_REMOTE = r'''
import base64, collections, json, sqlite3, sys
from datetime import datetime, timezone
p = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
db = sqlite3.connect(p["db"], timeout=600)
db.execute("PRAGMA busy_timeout = 600000")
cols = [r[1] for r in db.execute("PRAGMA table_info(ext_donations)")]
if not cols:
    print(json.dumps({"error": "ext_donations does not exist"})); sys.exit(1)
cur = db.cursor()
cur.execute("BEGIN")
if "industry_source" not in cols:
    cur.execute("ALTER TABLE ext_donations ADD COLUMN industry_source TEXT")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ext_don_indsrc ON ext_donations(industry_source)")
stats = collections.OrderedDict()
# provenance for rows labelled at ingest time (classify_industry -> keyword / individual fallback)
stats["backfill_keyword"] = cur.execute(
    "UPDATE ext_donations SET industry_source='keyword' WHERE industry IS NOT NULL AND industry_source IS NULL AND industry <> 'individual'").rowcount
stats["backfill_individual"] = cur.execute(
    "UPDATE ext_donations SET industry_source='individual' WHERE industry='individual' AND industry_source IS NULL").rowcount
# tier 0: placeholder / junk donor names
ph = ",".join("?" for _ in p["placeholders"])
stats["unidentified"] = cur.execute(
    f"UPDATE ext_donations SET industry='unidentified', industry_source='keyword' WHERE industry IS NULL AND (length(trim(donor_name)) <= 2 OR trim(donor_name) IN ({ph}))",
    p["placeholders"]).rowcount
# tier 1: keyword rules, table order
kw_total = 0
for industry, kws in p["keywords"]:
    conds = " OR ".join("lower(donor_name) LIKE ?" for _ in kws)
    n = cur.execute(f"UPDATE ext_donations SET industry=?, industry_source='keyword' WHERE industry IS NULL AND ({conds})",
                    [industry] + ["%" + k.lower() + "%" for k in kws]).rowcount
    if n:
        stats["keyword:" + industry] = n
    kw_total += n
stats["keyword_total"] = kw_total
# tier 2: individuals
stats["individual"] = cur.execute(
    "UPDATE ext_donations SET industry='individual', industry_source='individual' WHERE industry IS NULL AND donor_type='individual'").rowcount
# tier 3: inherit from the AEC donations table by exact name
aec = collections.defaultdict(collections.Counter)
for name, ind in db.execute("SELECT donor_name, industry FROM donations WHERE industry IS NOT NULL AND industry NOT IN ('other','unidentified') AND donor_name IS NOT NULL"):
    aec[name.strip().lower()][ind] += 1
todo = [r[0] for r in db.execute("SELECT DISTINCT lower(trim(donor_name)) FROM ext_donations WHERE industry IS NULL")]
inherited = 0; by_ind = collections.Counter()
for key in todo:
    if key in aec:
        ind = aec[key].most_common(1)[0][0]
        n = cur.execute("UPDATE ext_donations SET industry=?, industry_source='aec_match' WHERE industry IS NULL AND lower(trim(donor_name)) = ?", (ind, key)).rowcount
        inherited += n; by_ind[ind] += n
stats["aec_match"] = inherited
stats["aec_match_by_industry"] = dict(by_ind.most_common())
remaining = db.execute("SELECT count(*), count(DISTINCT lower(trim(donor_name))) FROM ext_donations WHERE industry IS NULL").fetchone()
stats["remaining_rows"] = remaining[0]; stats["remaining_names"] = remaining[1]
changed = stats["unidentified"] + kw_total + stats["individual"] + inherited
if p["dry_run"]:
    cur.execute("ROLLBACK")
else:
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("ext_donations", "classify", changed, 0, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 json.dumps({k: v for k, v in stats.items() if not k.startswith("keyword:")})))
    cur.execute("COMMIT")
out = {"stats": stats, "changed": changed, "dry_run": p["dry_run"]}
out["industry_dist"] = db.execute("SELECT coalesce(industry,'(null)'), count(*) FROM ext_donations GROUP BY 1 ORDER BY 2 DESC").fetchall()
out["source_dist"] = db.execute("SELECT coalesce(industry_source,'(null)'), count(*) FROM ext_donations GROUP BY 1 ORDER BY 2 DESC").fetchall()
if p["report"]:
    out["candidates"] = db.execute(
        "SELECT donor_name, jurisdiction, donor_type, count(*), round(sum(amount)) FROM ext_donations WHERE industry IS NULL GROUP BY 1,2,3 ORDER BY 5 DESC LIMIT ?",
        (p["report"],)).fetchall()
print(json.dumps(out, default=str))
'''


def run(db_path: str, host: str | None, dry_run: bool, report: int) -> dict:
    payload = {"db": db_path, "keywords": list(INDUSTRY_KEYWORDS.items()), "placeholders": PLACEHOLDERS,
               "dry_run": dry_run, "report": report}
    b64 = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    cmd = ["ssh", host, "python3", "-", b64] if host else [sys.executable, "-", b64]
    proc = subprocess.run(cmd, input=_REMOTE, capture_output=True, text=True, timeout=3600)
    if proc.returncode != 0:
        raise RuntimeError(f"classification failed: {proc.stderr[-2000:]}")
    return json.loads(proc.stdout.strip().splitlines()[-1])


def main() -> None:
    ap = argparse.ArgumentParser(description="Industry classification pass over ext_donations")
    ap.add_argument("--db", default=None, help="local SQLite file instead of the remote parli.db")
    ap.add_argument("--host", default=DEFAULT_DB_HOST)
    ap.add_argument("--remote-db", default=DEFAULT_REMOTE_DB)
    ap.add_argument("--dry-run", action="store_true", help="run every tier inside a transaction, then roll back")
    ap.add_argument("--report", type=int, nargs="?", const=40, default=0,
                    help="print the top N still-unclassified donors (LLM-pass candidates); default 40")
    args = ap.parse_args()
    target = f"sqlite:{args.db}" if args.db else f"ssh:{args.host}:{args.remote_db}"
    log(f"ext_donations classification pass -> {target}{' (dry-run)' if args.dry_run else ''}")
    res = run(args.db or args.remote_db, None if args.db else args.host, args.dry_run, args.report)
    st = res["stats"]
    log(f"  keyword: {st['keyword_total']:,}  individual: {st['individual']:,}  aec_match: {st['aec_match']:,}  "
        f"unidentified: {st['unidentified']:,}  -> changed {res['changed']:,}; "
        f"remaining NULL: {st['remaining_rows']:,} rows / {st['remaining_names']:,} names")
    kw = {k[8:]: v for k, v in st.items() if k.startswith("keyword:")}
    if kw:
        log("  keyword hits by industry: " + json.dumps(kw))
    log("  aec_match by industry: " + json.dumps(st["aec_match_by_industry"]))
    log("  industry_source: " + json.dumps(res["source_dist"]))
    log("  industry: " + json.dumps(res["industry_dist"]))
    if res.get("candidates"):
        log("\n  LLM-pass candidates (donor, jurisdiction, type, rows, $):")
        for c in res["candidates"]:
            log(f"    {c[0][:60]:60} {c[1]:4} {str(c[2]):12} {c[3]:5} {c[4]:>12,.0f}")


if __name__ == "__main__":
    main()
