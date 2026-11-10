"""
parli.ingest.money_classify -- industry classification pass over `ext_donations`.

Three tiers, cheapest first; each only touches rows whose `industry` is still
NULL, and every row records how it was labelled in `industry_source`:

  keyword     INDUSTRY_PATTERNS from parli.ingest.classify_donations: escaped, whole-word,
              case-insensitive keyword patterns, first industry in table order wins --
              the same matcher as classify_donor_name() and the AEC pass (PR #217; the old
              LIKE '%kw%' pass matched inside words: 'crown' in Crown Castle, 'farm' in
              Wesfarmers).
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
local file with --db, --db-local, or OPAX_DB in the environment (the nightly VM
sets it, so an unattended run never ssh-es to the desktop). The legacy
`donations` table is only ever read.

Repair (--repair): both passes only fill NULL labels, so a label the old substring
pass stored stays wrong. --repair first proposes a change for every stored label the
fixed matcher disagrees with, in `donations` (federal; only read otherwise) and in
ext_donations rows whose industry_source is 'keyword'. A label counts as
keyword-sourced only when a pre-#217 keyword table (industry_keywords_legacy.json)
gives exactly that label; anything else (manual, LLM) is listed under `held_not_keyword`
and never changed. 'aec_match' rows whose inherited label changes with the repaired
federal labels are proposed separately (`derived`). The new label is the fixed
matcher's industry, else 'individual' for an individual donor, else NULL (an LLM-pass
candidate). Only `industry` / `industry_source` are written; amounts never change.
--repair --dry-run writes the proposals; --repair --approve FILE applies exactly the
proposals FILE lists (the dry run's `proposals`, edited down; each pins its row count,
so a group that changed since the review is held) and holds the rest.

Usage:
    python -m parli.ingest.money_classify              # classify on desktop:parli.db
    python -m parli.ingest.money_classify --report     # also list the LLM candidates
    python -m parli.ingest.money_classify --db /tmp/t.db --dry-run
    python -m parli.ingest.money_classify --db-local --repair --dry-run --repair-out proposals.json
    python -m parli.ingest.money_classify --db-local --repair --approve approved.json --repair-out applied.json
"""

from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
from pathlib import Path

from parli.ingest.classify_donations import INDUSTRY_KEYWORDS, INDUSTRY_PATTERNS
from parli.ingest.ext_common import DEFAULT_DB_HOST, DEFAULT_REMOTE_DB, default_local_db, env_db_path, log

PLACEHOLDERS = ["0", "1", "2", "3", "-", "--", "n/a", "N/A"]
LEGACY_KEYWORDS = Path(__file__).with_name("industry_keywords_legacy.json")

# The matcher, as source: exec'd on the box that holds parli.db (stdlib only) and,
# in the tests, here, so parity with classify_donor_name() is checked directly.
MATCHER = r'''
import re
def make_matcher(patterns, placeholders, legacy_tables):
    pats = [(industry, re.compile(src, re.I)) for industry, src in patterns]
    junk = set(placeholders) | {""}
    def classify(name):
        """classify_donor_name(): placeholder -> 'unidentified', first whole-word industry, else None."""
        if name is None or name.strip() in junk:
            return "unidentified"
        for industry, pat in pats:
            if pat.search(name):
                return industry
        return "unidentified" if len(name.strip()) <= 2 else None
    def legacy(name):
        """Labels the pre-#217 substring pass could have stored (one per historical table)."""
        low, out = (name or "").lower(), set()
        for table in legacy_tables:
            for industry, kws in table:
                if any(k.lower() in low for k in kws):
                    out.add(industry)
                    break
        return out
    return classify, legacy
'''

# Runs on the box that holds parli.db. argv[1] = base64 JSON payload.
_REMOTE = r'''
import base64, collections, json, sqlite3, sys
from datetime import datetime, timezone
p = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
exec(p["matcher"])
classify, legacy = make_matcher(p["patterns"], p["placeholders"], p["legacy"])
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
# repair: stored labels the fixed matcher disagrees with (see the module docstring)
repair = None
if p["repair"]:
    SKIP = ("individual", "unidentified", "other")
    approve = None if p["approve"] is None else {tuple(a) for a in p["approve"]}
    repair = {"proposals": [], "applied": [], "held": [], "held_not_keyword": []}
    def key(e):
        # the reviewed row count is part of the key: a group that changed since the dry run is held
        return (e["table"], e["jurisdiction"], e["donor_name"], e["donor_type"], e["from"], e["to"], e["rows"])
    def target(new, donor_type):
        return new if new else ("individual" if donor_type == "individual" else None)
    def consider(e, sql, args):
        repair["proposals"].append(e)
        if approve is not None and key(e) in approve:
            n = cur.execute(sql, args).rowcount
            if n != e["rows"]:
                raise SystemExit(f"repair row count changed for {key(e)}: {n} != {e['rows']}")
            repair["applied"].append(e)
        else:
            repair["held"].append(e)
    has_fed = bool(list(db.execute("PRAGMA table_info(donations)")))
    # federal labels before any repair write, for the derived (aec_match) pass below
    fed_before = db.execute("SELECT donor_name, donor_type, industry, count(*) FROM donations WHERE industry IS NOT NULL "
                            "AND donor_name IS NOT NULL GROUP BY 1,2,3").fetchall() if has_fed else []
    if has_fed:
        for name, dtype, ind, n, amt in db.execute(
                "SELECT donor_name, donor_type, industry, count(*), round(coalesce(sum(amount),0),2) FROM donations "
                "WHERE industry IS NOT NULL GROUP BY 1,2,3 ORDER BY 5 DESC").fetchall():
            new = classify(name)
            if ind in SKIP or new == ind:
                continue
            e = {"table": "donations", "jurisdiction": "federal", "donor_name": name, "donor_type": dtype, "rows": n,
                 "amount": amt, "from": ind, "to": target(new, dtype), "matcher": new, "kind": "keyword"}
            if ind not in legacy(name):
                if new is not None:
                    repair["held_not_keyword"].append(e)
                continue
            consider(e, "UPDATE donations SET industry=? WHERE donor_name=? AND donor_type IS ? AND industry=?",
                     (e["to"], name, dtype, ind))
    for jur, name, dtype, ind, n, amt in db.execute(
            "SELECT jurisdiction, donor_name, donor_type, industry, count(*), round(coalesce(sum(amount),0),2) FROM ext_donations "
            "WHERE industry IS NOT NULL AND industry_source='keyword' GROUP BY 1,2,3,4 ORDER BY 6 DESC").fetchall():
        new = classify(name)
        if ind in SKIP or new == ind:
            continue
        e = {"table": "ext_donations", "jurisdiction": jur, "donor_name": name, "donor_type": dtype, "rows": n,
             "amount": amt, "from": ind, "to": target(new, dtype), "matcher": new, "kind": "keyword"}
        if ind not in legacy(name):
            if new is not None:
                repair["held_not_keyword"].append(e)
            continue
        src = None if e["to"] is None else ("keyword" if new else "individual")
        consider(e, "UPDATE ext_donations SET industry=?, industry_source=? WHERE jurisdiction=? AND donor_name=? "
                    "AND donor_type IS ? AND industry=? AND industry_source='keyword'", (e["to"], src, jur, name, dtype, ind))
    if has_fed:
        # aec_match rows inherit the federal label by exact name. Re-derive them from the federal labels as
        # every federal proposal (approved or not) would leave them, so a dry run and an approved run
        # propose the same thing; only names a federal proposal touches are considered.
        moved = {(e["donor_name"], e["donor_type"], e["from"]): e["to"] for e in repair["proposals"] if e["table"] == "donations"}
        touched = {e["donor_name"].strip().lower() for e in repair["proposals"] if e["table"] == "donations"}
        fed = collections.defaultdict(collections.Counter)
        for name, dtype, ind, n in fed_before:
            ind = moved.get((name, dtype, ind), ind)
            if ind is not None and ind not in ("other", "unidentified"):
                fed[name.strip().lower()][ind] += n
        for jur, name, dtype, ind, n, amt in db.execute(
                "SELECT jurisdiction, lower(trim(donor_name)), donor_type, industry, count(*), round(coalesce(sum(amount),0),2) "
                "FROM ext_donations WHERE industry_source='aec_match' GROUP BY 1,2,3,4 ORDER BY 6 DESC").fetchall():
            if name not in touched:
                continue
            inherited = fed[name].most_common(1)[0][0] if name in fed else None
            if inherited == ind:
                continue
            e = {"table": "ext_donations", "jurisdiction": jur, "donor_name": name, "donor_type": dtype, "rows": n,
                 "amount": amt, "from": ind, "to": inherited, "matcher": None, "kind": "derived"}
            consider(e, "UPDATE ext_donations SET industry=?, industry_source=? WHERE jurisdiction=? AND lower(trim(donor_name))=? "
                        "AND donor_type IS ? AND industry=? AND industry_source='aec_match'",
                     (inherited, "aec_match" if inherited else None, jur, name, dtype, ind))
    stats["repair_proposed"] = len(repair["proposals"])
    stats["repair_applied"] = len(repair["applied"])
    stats["repair_applied_rows"] = sum(e["rows"] for e in repair["applied"])
# tier 1: keyword rules, the shared whole-word matcher, table order
kw_total = 0
by_kw = collections.defaultdict(list)
for (name,) in db.execute("SELECT DISTINCT donor_name FROM ext_donations WHERE industry IS NULL").fetchall():
    ind = classify(name)
    if ind not in (None, "unidentified"):
        by_kw[ind].append(name)
for industry, _ in p["patterns"]:
    n = 0
    for name in by_kw.get(industry, []):
        n += cur.execute("UPDATE ext_donations SET industry=?, industry_source='keyword' WHERE industry IS NULL AND donor_name=?",
                         (industry, name)).rowcount
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
changed = stats["unidentified"] + kw_total + stats["individual"] + inherited + stats.get("repair_applied_rows", 0)
if p["dry_run"]:
    cur.execute("ROLLBACK")
else:
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("ext_donations", "classify", changed, 0, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 json.dumps({k: v for k, v in stats.items() if not k.startswith("keyword:")})))
    cur.execute("COMMIT")
out = {"stats": stats, "changed": changed, "dry_run": p["dry_run"], "repair": repair}
out["industry_dist"] = db.execute("SELECT coalesce(industry,'(null)'), count(*) FROM ext_donations GROUP BY 1 ORDER BY 2 DESC").fetchall()
out["source_dist"] = db.execute("SELECT coalesce(industry_source,'(null)'), count(*) FROM ext_donations GROUP BY 1 ORDER BY 2 DESC").fetchall()
if p["report"]:
    out["candidates"] = db.execute(
        "SELECT donor_name, jurisdiction, donor_type, count(*), round(sum(amount)) FROM ext_donations WHERE industry IS NULL GROUP BY 1,2,3 ORDER BY 5 DESC LIMIT ?",
        (p["report"],)).fetchall()
print(json.dumps(out, default=str))
'''


def legacy_tables() -> list:
    return [list(t["keywords"].items()) for t in json.loads(LEGACY_KEYWORDS.read_text())["tables"]]


def run(db_path: str, host: str | None, dry_run: bool, report: int, repair: bool = False, approve: list | None = None) -> dict:
    payload = {"db": db_path, "patterns": [(i, INDUSTRY_PATTERNS[i].pattern) for i in INDUSTRY_KEYWORDS],
               "placeholders": PLACEHOLDERS, "matcher": MATCHER, "legacy": legacy_tables(),
               "dry_run": dry_run, "report": report, "repair": repair, "approve": approve}
    b64 = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    cmd = ["ssh", host, "python3", "-", b64] if host else [sys.executable, "-", b64]
    proc = subprocess.run(cmd, input=_REMOTE, capture_output=True, text=True, timeout=3600)
    if proc.returncode != 0:
        raise RuntimeError(f"classification failed: {proc.stderr[-2000:]}")
    return json.loads(proc.stdout.strip().splitlines()[-1])


def main() -> None:
    ap = argparse.ArgumentParser(description="Industry classification pass over ext_donations")
    ap.add_argument("--db", default=None, help="local SQLite file instead of the remote parli.db (default: $OPAX_DB when set)")
    ap.add_argument("--db-local", "--local", dest="db_local", action="store_true",
                    help="the local parli.db ($OPAX_DB, else ~/.cache/autoresearch/parli.db); never ssh")
    ap.add_argument("--host", default=DEFAULT_DB_HOST)
    ap.add_argument("--remote-db", default=DEFAULT_REMOTE_DB)
    ap.add_argument("--dry-run", action="store_true", help="run every tier inside a transaction, then roll back")
    ap.add_argument("--report", type=int, nargs="?", const=40, default=0,
                    help="print the top N still-unclassified donors (LLM-pass candidates); default 40")
    ap.add_argument("--repair", action="store_true",
                    help="propose (with --dry-run) or apply (with --approve) fixes to stored labels the fixed matcher disagrees with")
    ap.add_argument("--approve", default=None, help="JSON list of proposals to apply (from a --repair --dry-run)")
    ap.add_argument("--repair-out", default=None, help="write the repair proposals / applied / held lists here as JSON")
    args = ap.parse_args()
    if args.repair and not args.dry_run and not args.approve:
        ap.error("--repair needs --dry-run (to list proposals) or --approve FILE (to apply the listed ones)")
    if args.approve and not args.repair:
        ap.error("--approve only applies with --repair")
    approve = None
    if args.approve:
        approve = [[e["table"], e["jurisdiction"], e["donor_name"], e["donor_type"], e["from"], e["to"], e["rows"]]
                   for e in json.loads(Path(args.approve).read_text())]
    db = args.db or (default_local_db() if args.db_local else env_db_path())
    target = f"sqlite:{db}" if db else f"ssh:{args.host}:{args.remote_db}"
    log(f"ext_donations classification pass -> {target}{' (dry-run)' if args.dry_run else ''}")
    res = run(db or args.remote_db, None if db else args.host, args.dry_run, args.report,
              **({"repair": True, "approve": approve} if args.repair else {}))
    st = res["stats"]
    if res.get("repair") is not None:
        r = res["repair"]
        log(f"  repair: {len(r['proposals'])} proposed, {len(r['applied'])} applied ({st['repair_applied_rows']:,} rows), "
            f"{len(r['held'])} held, {len(r['held_not_keyword'])} not keyword-sourced (left unchanged)")
        for e in r["proposals"]:
            mark = "applied" if e in r["applied"] else "held"
            log(f"    [{mark}] {e['kind']:7} {e['table']:13} {e['jurisdiction']:7} {e['donor_name'][:60]:60} "
                f"{e['from']} -> {e['to']}  ({e['rows']} rows, ${e['amount']:,.0f})")
        if args.repair_out:
            Path(args.repair_out).write_text(json.dumps(r, indent=1, ensure_ascii=False) + "\n")
            log(f"  repair lists written to {args.repair_out}")
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
