"""
parli.ingest.money_ipea -- IPEA parliamentarian expenditure into `ext_expenses`.

The Independent Parliamentary Expenses Authority publishes one CSV bundle per
quarter on data.gov.au (organisation `ipea`, licence CC BY): the main
`YYYYqNN_dataextract.csv` transaction file (one row per expense line, with the
travelling person, category tree, dates, locations and amount) plus
repayments / certifications / office-costs-by-state / adjustments files. Only
the transaction file is loaded here. Coverage: 1 April 2017 onwards, 37
quarters as at 2026-09-02 (latest: 1 Apr - 30 Jun 2026, published 2026-08-05).

The legacy `mp_expenses` table (source='ipea', loaded 2026-03) stops at
2025 Q4 and is left untouched; `ext_expenses` is the clean re-load with the
IPEA UniqueId preserved and a per-quarter replace, so a re-run of one quarter
never disturbs the others.

Usage:
    python -m parli.ingest.money_ipea --since 2026q01          # new quarters only
    python -m parli.ingest.money_ipea                           # all 37 quarters (~1.2M rows)
    python -m parli.ingest.money_ipea --since 2026q02 --db /tmp/t.db --no-link
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.ext_common import (
    CACHE_ROOT, add_writer_args, log, make_session, parse_amount, polite_get, writer_from_args,
)
from parli.ingest.ipea_expenses import map_category

CKAN_API = "https://data.gov.au/data/api/3/action/package_search"
CACHE = CACHE_ROOT / "ipea"
LEGACY_CACHE = Path("~/.cache/autoresearch/ipea").expanduser()  # the 2026-03 loader's downloads

DDL = """
CREATE TABLE IF NOT EXISTS ext_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,                -- ipea
    unique_id TEXT,                      -- IPEA UniqueId (stable across re-publications)
    reporting_period_id TEXT NOT NULL,   -- 2026Q02
    reporting_period TEXT,               -- 'Apr-Jun 2026'
    period_start TEXT,
    period_end TEXT,
    office_code TEXT,
    member_name TEXT NOT NULL,           -- FullNameWithTitle as published
    surname TEXT,
    first_name TEXT,
    party TEXT,
    state TEXT,
    electorate TEXT,
    homebase TEXT,
    role TEXT,                           -- Parliamentarian / Office holder / former ...
    traveller_name TEXT,                 -- UserFirstName UserSurname: the person who incurred it (family/staff differ from member)
    category_high TEXT,                  -- Travel / Office Administration / Employee Costs ...
    category_major TEXT,
    category_minor TEXT,
    category TEXT,                       -- OPAX category (parli.ingest.ipea_expenses.map_category)
    from_date TEXT,
    to_date TEXT,
    nights INTEGER,
    nightly_rate REAL,
    description TEXT,
    from_location TEXT,
    to_location TEXT,
    amount REAL,
    trip_sequence TEXT,
    leg_number TEXT,
    reason TEXT,
    notes TEXT,
    person_id TEXT,                      -- members.person_id when first+last name matched (post-load SQL)
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_exp_period ON ext_expenses(reporting_period_id);
CREATE INDEX IF NOT EXISTS idx_ext_exp_member ON ext_expenses(member_name);
CREATE INDEX IF NOT EXISTS idx_ext_exp_person ON ext_expenses(person_id);
CREATE INDEX IF NOT EXISTS idx_ext_exp_category ON ext_expenses(category);
CREATE INDEX IF NOT EXISTS idx_ext_exp_unique ON ext_expenses(unique_id);
"""

COLUMNS = [
    "source", "unique_id", "reporting_period_id", "reporting_period", "period_start", "period_end",
    "office_code", "member_name", "surname", "first_name", "party", "state", "electorate", "homebase",
    "role", "traveller_name", "category_high", "category_major", "category_minor", "category",
    "from_date", "to_date", "nights", "nightly_rate", "description", "from_location", "to_location",
    "amount", "trip_sequence", "leg_number", "reason", "notes", "person_id", "source_url", "ingested_at",
]

# Link to the members table by (first, last) name. Runs inside the load
# transaction on the box that holds parli.db; skipped for --db test files.
LINK_SQL = """
UPDATE ext_expenses SET person_id = (
    SELECT m.person_id FROM members m
    WHERE lower(trim(m.last_name)) = lower(trim(ext_expenses.surname))
      AND lower(trim(m.first_name)) = lower(trim(ext_expenses.first_name))
    ORDER BY m.left_house IS NULL DESC, m.left_house DESC LIMIT 1)
WHERE source = 'ipea' AND reporting_period_id = '{period}' AND person_id IS NULL;
"""


def discover(session) -> list[dict]:
    """All IPEA quarterly datasets with their transaction-CSV URL, oldest first."""
    out, start = [], 0
    while True:
        r = polite_get(session, CKAN_API, delay=0.3, params={
            "q": "organization:ipea", "rows": 50, "start": start, "sort": "metadata_created desc"})
        res = r.json()["result"]
        for ds in res["results"]:
            for rs in ds.get("resources", []):
                url = rs.get("url", "")
                fname = url.rsplit("/", 1)[-1].lower()
                # transaction file only: skip the repayments / certifications /
                # officecostsbystate / adjustments companions
                m = re.match(r"(\d{4})q(\d{2})[_-]?dataextract(?!.*(repayment|certif|officecost|adjust)).*\.csv$", fname)
                # the 2024 datasets tag their resources '.CSV' (leading dot)
                if m and (rs.get("format") or "").strip(". ").upper() == "CSV":
                    out.append({"quarter": f"{m.group(1)}q{m.group(2)}", "url": url, "title": ds["title"],
                                "licence": ds.get("license_id"), "modified": rs.get("last_modified") or ds.get("metadata_modified"),
                                "dataset_url": f"https://data.gov.au/data/dataset/{ds['name']}"})
        start += 50
        if start >= res["count"]:
            break
    out.sort(key=lambda d: d["quarter"])
    return out


def download(session, ds: dict) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    fname = ds["url"].rsplit("/", 1)[-1]
    dest = CACHE / fname
    legacy = LEGACY_CACHE / fname
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    if legacy.exists() and legacy.stat().st_size > 1000:
        dest.write_bytes(legacy.read_bytes())
        return dest
    log(f"  downloading {fname} ...")
    r = polite_get(session, ds["url"], delay=0.5, timeout=600)
    dest.write_bytes(r.content)
    log(f"    {len(r.content):,} bytes")
    return dest


def _int(s):
    try:
        return int(float(s)) if s not in (None, "") else None
    except ValueError:
        return None


def parse_csv(path: Path, ds: dict) -> list[list]:
    text = path.read_bytes().decode("utf-8-sig", errors="replace")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    period_id = ds["quarter"].upper()  # 2026Q02
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        g = lambda k: (r.get(k) or "").strip()
        member = g("FullNameWithTitle")
        if not member:
            continue
        high, major, minor = g("HighLevelCategory"), g("MajorSubCategory"), g("MinorSubCategory")
        traveller = f"{g('UserFirstName')} {g('UserSurname')}".strip() or None
        rows.append([
            "ipea", g("UniqueId") or None, g("ReportingPeriodId") or period_id, g("ReportingPeriod") or None,
            g("ReportingPeriodStartDate") or None, g("ReportingPeriodEndDate") or None, g("OfficeCode") or None,
            member, g("Surname") or None, g("FirstName") or None, g("Party") or None, g("StateOrTerritory") or None,
            g("Electorate") or None, g("Homebase") or None, g("Role") or None, traveller,
            high or None, major or None, minor or None, map_category(high, major) or None,
            g("FromDate") or None, g("ToDate") or None, _int(g("NumberNights")), parse_amount(g("NightlyRate")),
            g("Description") or None, g("FromLocation") or None, g("ToLocation") or None, parse_amount(g("Amount")),
            g("TripSequence") or None, g("LegNumber") or None, g("ReasonForTravel") or None,
            g("PublishableNotes") or None, None, ds["dataset_url"], now,
        ])
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description="IPEA quarterly expenditure -> ext_expenses")
    ap.add_argument("--since", default=None, help="only quarters >= this id, e.g. 2026q01")
    ap.add_argument("--until", default=None, help="only quarters <= this id")
    ap.add_argument("--no-link", action="store_true", help="skip the members.person_id link SQL")
    ap.add_argument("--list", action="store_true", help="list quarters and exit")
    add_writer_args(ap)
    args = ap.parse_args()
    session = make_session()
    writer = writer_from_args(args)

    datasets = discover(session)
    log(f"IPEA: {len(datasets)} quarterly transaction files on data.gov.au "
        f"({datasets[0]['quarter']} .. {datasets[-1]['quarter']}); licences: {sorted({d['licence'] for d in datasets})}")
    if args.list:
        for d in datasets:
            print(f"  {d['quarter']}  {d['modified'][:10] if d['modified'] else '?':10}  {d['url']}")
        return
    todo = [d for d in datasets if (not args.since or d["quarter"] >= args.since.lower())
            and (not args.until or d["quarter"] <= args.until.lower())]
    log(f"writer={writer.describe()} ; loading {len(todo)} quarter(s)")
    summary = {}
    for ds in todo:
        path = download(session, ds)
        rows = parse_csv(path, ds)
        period_id = rows[0][2] if rows else ds["quarter"].upper()
        total = sum((r[COLUMNS.index("amount")] or 0) for r in rows)
        log(f"  {ds['quarter']}: {len(rows):,} rows, ${total:,.0f}")
        post = [] if (args.no_link or args.db) else [LINK_SQL.format(period=period_id)]
        res = writer.replace("ext_expenses", DDL, COLUMNS, rows, source="ipea",
                             delete_where="source = ? AND reporting_period_id = ?",
                             delete_params=["ipea", period_id], post_sql=post,
                             notes=f"{ds['title']} | {ds['url']}")
        summary[ds["quarter"]] = res.get("inserted")
    log("\nSummary: " + json.dumps(summary))


if __name__ == "__main__":
    main()
