"""
parli.ingest.money_aec_extras -- the parts of the AEC Transparency Register
that `parli.ingest.donations` leaves on the floor: debts, discretionary
benefits / capital contributions, and the per-return headline totals.

Source: the register's bulk download bundle,
https://transparency.aec.gov.au/Download/AllAnnualData (one ZIP of CSVs,
~2.5 MB). Fetched once and cached under ~/.cache/autoresearch/aec/; every
loader below reads the cached ZIP. AEC material is Crown copyright released
under CC BY 4.0 (https://www.aec.gov.au/footer/Copyright.htm).

What is loaded (all additive `ext_*` tables, per-source replace, never the
legacy `donations` / `associated_entities` tables):

  ext_aec_debts     'Detailed Debts.csv' -- every debt a party, associated
                    entity, significant third party or political campaigner
                    listed on its annual return: creditor, amount owed at
                    30 June, and the register's Financial / Non-financial
                    institution flag. 2000-01 onwards.
  ext_aec_benefits  'Detailed Discretionary Benefits.csv' (government
                    payments other than public funding, 2018-19 onwards) and
                    'Capital Contributions.csv' (capital put into associated
                    entities, 2000-01 onwards), distinguished by
                    `benefit_type`. Both are also in `donations` as
                    undifferentiated aec_annual rows; here they keep their
                    category.
  ext_aec_returns   one row per lodged return: 'Party Returns.csv',
                    'Associated Entity Returns.csv', 'Significant Third Party
                    Returns.csv' (which also carries the pre-2022 'Political
                    Campaigner Return' rows), 'Third Party Returns.csv',
                    'Donor Returns.csv' and 'MemberOfParliamentReturns.csv'.
                    `return_type` is the register's own name; `kind` is the
                    OPAX bucket. The itemised_* columns sum the lines of
                    'Detailed Receipts.csv' by its Receipt Type (Donation
                    Received / Other Receipt / Subscription / Public Funding /
                    Unspecified) for the same return, so a party's income can
                    be split without re-loading receipts.

Party canonicalisation reuses `ext_common.canonical_party` (the money map's
grammar) but only for rows whose return IS a party return; an associated
entity's party comes from the AssociatedParties field of its own return
(`associated_party`, `associated_party_canonical`). DLP / Liberal Democrats /
Libertarian are held out of the Labor / Liberal buckets.

Usage (on the box that holds parli.db):
    PYTHONPATH=. python -m parli.ingest.money_aec_extras --db ~/.cache/autoresearch/parli.db
    PYTHONPATH=. python -m parli.ingest.money_aec_extras --dry-run
    PYTHONPATH=. python -m parli.ingest.money_aec_extras --table debts
"""

from __future__ import annotations

import argparse
import csv
import html
import io
import json
import re
import sqlite3
import time
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.ext_common import (
    add_writer_args, cached_bytes, canonical_party, clean_ws, log, make_session,
    parse_amount, parse_date, writer_from_args,
)

AEC_ANNUAL_URL = "https://transparency.aec.gov.au/Download/AllAnnualData"
AEC_LICENCE_URL = "https://www.aec.gov.au/footer/Copyright.htm"
CACHE = Path("~/.cache/autoresearch/aec").expanduser()
SOURCE = "aec_annual"

# The register's return-type names -> the OPAX bucket.
KIND_OF = {
    "Political Party Return": "party",
    "Associated Entity Return": "associated_entity",
    "Significant Third Party Return": "significant_third_party",
    "Political Campaigner Return": "political_campaigner",
    "Third Party Return": "third_party",
    "Donor Return": "donor",
    "Member of House of Representatives Return": "member_of_parliament",
    "Member of HOR Return": "member_of_parliament",
    "Senator Return": "member_of_parliament",
}

# Names that the money-map grammar would drop into Labor / Liberal but are
# their own parties (the `donations` table leaves these unbucketed too).
_NOT_MAJOR_RE = re.compile(r"democratic labor|liberal democrat|libertarian", re.I)
# Money-map party nodes the shared grammar misses or mis-orders ('liberal' is
# tested before 'country liberal' there): decided here first.
_BEFORE_SHARED = [
    (re.compile(r"country liberal", re.I), "Country Liberal Party"),
    (re.compile(r"centre alliance", re.I), "Centre Alliance"),
]

DDL_DEBTS = """
CREATE TABLE IF NOT EXISTS ext_aec_debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,                  -- aec_annual
    financial_year TEXT NOT NULL,          -- AEC style, normalised ('2000-01')
    return_type TEXT NOT NULL,             -- the register's own name
    kind TEXT NOT NULL,                    -- party | associated_entity | significant_third_party | political_campaigner
    recipient TEXT NOT NULL,               -- the debtor: who lodged the return, as disclosed
    recipient_canonical TEXT,              -- party bucket when the debtor is a party return
    associated_party TEXT,                 -- associated entities: the party(ies) named on their own return
    associated_party_canonical TEXT,
    lender_name TEXT NOT NULL,             -- 'Creditor Name' as disclosed
    amount REAL,                           -- 'Amount owed' at 30 June (a balance, not a flow)
    lender_type TEXT,                      -- Financial | Non-financial (register flag)
    source_file TEXT NOT NULL,
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_ext_aec_debts_recipient ON ext_aec_debts(recipient_canonical, financial_year);
CREATE INDEX IF NOT EXISTS ix_ext_aec_debts_lender ON ext_aec_debts(lender_name);
"""
COLS_DEBTS = ["source", "financial_year", "return_type", "kind", "recipient", "recipient_canonical",
              "associated_party", "associated_party_canonical", "lender_name", "amount", "lender_type",
              "source_file", "source_url", "ingested_at"]

DDL_BENEFITS = """
CREATE TABLE IF NOT EXISTS ext_aec_benefits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    financial_year TEXT NOT NULL,
    return_type TEXT NOT NULL,
    kind TEXT NOT NULL,
    benefit_type TEXT NOT NULL,            -- discretionary_benefit | capital_contribution
    recipient TEXT NOT NULL,
    recipient_canonical TEXT,
    associated_party TEXT,
    associated_party_canonical TEXT,
    provider_name TEXT NOT NULL,           -- 'Received From' / 'Contributor'
    date TEXT,                             -- ISO; discretionary benefits only, often blank
    amount REAL,
    source_file TEXT NOT NULL,
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_ext_aec_benefits_recipient ON ext_aec_benefits(recipient_canonical, financial_year);
"""
COLS_BENEFITS = ["source", "financial_year", "return_type", "kind", "benefit_type", "recipient",
                 "recipient_canonical", "associated_party", "associated_party_canonical", "provider_name",
                 "date", "amount", "source_file", "source_url", "ingested_at"]

DDL_RETURNS = """
CREATE TABLE IF NOT EXISTS ext_aec_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    financial_year TEXT NOT NULL,
    return_type TEXT NOT NULL,             -- the register's own name
    kind TEXT NOT NULL,                    -- party | associated_entity | significant_third_party | political_campaigner | third_party | donor | member_of_parliament
    entity_name TEXT NOT NULL,
    entity_canonical TEXT,                 -- party bucket for party returns
    party_group TEXT,                      -- 'Party Group' on party returns (blank for most)
    associated_parties TEXT,               -- associated entities: '; '-joined as disclosed
    associated_party_canonical TEXT,
    lodged_on_behalf_of TEXT,
    abn TEXT,
    client_file_id TEXT,
    client_type TEXT,                      -- third-party returns: the lodger's current register class
    total_receipts REAL,
    total_payments REAL,
    total_debts REAL,
    total_benefits REAL,                   -- discretionary benefits total on the return
    total_capital_contributions REAL,      -- associated entities
    electoral_expenditure REAL,            -- significant third parties / third parties
    total_donations_made REAL,             -- donor returns
    total_donations_received REAL,         -- donor and MP returns; third parties' Total Gifts Received
    donor_count INTEGER,                   -- MP returns
    itemised_donations REAL,               -- sums of 'Detailed Receipts' lines for this return, by Receipt Type
    itemised_other_receipts REAL,
    itemised_subscriptions REAL,
    itemised_public_funding REAL,
    itemised_unspecified REAL,
    source_file TEXT NOT NULL,
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_ext_aec_returns_entity ON ext_aec_returns(kind, entity_name, financial_year);
CREATE INDEX IF NOT EXISTS ix_ext_aec_returns_party ON ext_aec_returns(entity_canonical, financial_year);
"""
COLS_RETURNS = ["source", "financial_year", "return_type", "kind", "entity_name", "entity_canonical",
                "party_group", "associated_parties", "associated_party_canonical", "lodged_on_behalf_of",
                "abn", "client_file_id", "client_type", "total_receipts", "total_payments", "total_debts",
                "total_benefits", "total_capital_contributions", "electoral_expenditure",
                "total_donations_made", "total_donations_received", "donor_count",
                "itemised_donations", "itemised_other_receipts", "itemised_subscriptions",
                "itemised_public_funding", "itemised_unspecified", "source_file", "source_url", "ingested_at"]


# ── helpers ──────────────────────────────────────────────────────────────────

def norm_fy(text: str | None) -> str | None:
    """'1998-1999' / '1998-99' / '2024-25' -> '1998-99' style."""
    t = clean_ws(text)
    m = re.match(r"^(\d{4})\s*[-/]\s*(\d{2,4})$", t)
    if not m:
        return t or None
    return f"{m.group(1)}-{m.group(2)[-2:]}"


def canon_party(name: str | None) -> str | None:
    if not name or _NOT_MAJOR_RE.search(name):
        return None
    for rx, canon in _BEFORE_SHARED:
        if rx.search(name):
            return canon
    return canonical_party(name)


def split_parties(text: str | None) -> list[str]:
    return [clean_ws(p) for p in (text or "").split(";") if clean_ws(p)]


def canon_of_parties(parties: list[str]) -> str | None:
    seen = []
    for p in parties:
        c = canon_party(p)
        if c and c not in seen:
            seen.append(c)
    return "; ".join(seen) if seen else None


def name_key(name: str | None) -> str:
    return clean_ws(name).lower()


def load_bundle(session, refresh: bool = False) -> zipfile.ZipFile:
    path = CACHE / "AllAnnualData.zip"
    if refresh and path.exists():
        path.unlink()
    data = cached_bytes(session, AEC_ANNUAL_URL, path, delay=0.0, min_size=100_000)
    if not data or data[:2] != b"PK":
        raise RuntimeError(f"AEC bundle at {AEC_ANNUAL_URL} is not a ZIP")
    log(f"  bundle: {path} ({len(data):,} bytes, {datetime.fromtimestamp(path.stat().st_mtime).date()})")
    return zipfile.ZipFile(io.BytesIO(data))


def read_rows(zf: zipfile.ZipFile, name: str) -> list[dict]:
    """Rows as dicts. The register HTML-escapes names ('Brisbane Convention
    &amp; Exhibition Centre'), so every cell is unescaped here, once."""
    raw = zf.read(name)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    return [{k: html.unescape(v) if isinstance(v, str) else v for k, v in r.items()}
            for r in csv.DictReader(io.StringIO(text))]


class Bundle:
    """The CSVs plus the two lookups every table needs."""

    def __init__(self, zf: zipfile.ZipFile):
        self.zf = zf
        self.now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        # (fy, name_key) -> associated parties string, from the entity's own return;
        # name_key -> latest such string as a fallback for years with no return row.
        self.assoc_by_year: dict[tuple[str, str], str] = {}
        self.assoc_latest: dict[str, tuple[str, str]] = {}
        for r in read_rows(zf, "Associated Entity Returns.csv"):
            fy = norm_fy(r.get("Financial Year"))
            nk = name_key(r.get("Name"))
            parties = "; ".join(split_parties(r.get("AssociatedParties")))
            if not nk or not parties:
                continue
            self.assoc_by_year[(fy, nk)] = parties
            prev = self.assoc_latest.get(nk)
            if prev is None or fy > prev[0]:
                self.assoc_latest[nk] = (fy, parties)
        # (fy, kind, name_key) -> {receipt type: sum} from the itemised receipts.
        self.itemised: dict[tuple[str, str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for r in read_rows(zf, "Detailed Receipts.csv"):
            kind = KIND_OF.get(clean_ws(r.get("Return Type")))
            if not kind:
                continue
            k = (norm_fy(r.get("Financial Year")), kind, name_key(r.get("Recipient Name")))
            amt = parse_amount(r.get("Value"))
            if amt is None:
                continue
            self.itemised[k][clean_ws(r.get("Receipt Type")) or "Unspecified"] += amt

    def associated(self, fy: str, name: str) -> tuple[str | None, str | None]:
        nk = name_key(name)
        parties = self.assoc_by_year.get((fy, nk))
        if parties is None and nk in self.assoc_latest:
            parties = self.assoc_latest[nk][1]
        if not parties:
            return None, None
        return parties, canon_of_parties(split_parties(parties))

    def party_fields(self, return_type: str, fy: str, name: str) -> tuple[str | None, str | None, str | None]:
        """(recipient_canonical, associated_party, associated_party_canonical) for a lodger."""
        kind = KIND_OF.get(return_type)
        if kind == "party":
            return canon_party(name), None, None
        if kind == "associated_entity":
            ap, apc = self.associated(fy, name)
            return None, ap, apc
        return None, None, None


# ── tables ───────────────────────────────────────────────────────────────────

def build_debts(b: Bundle) -> list[list]:
    src_file = "Detailed Debts.csv"
    out = []
    for r in read_rows(b.zf, src_file):
        fy = norm_fy(r.get("Financial Year"))
        rt = clean_ws(r.get("Return Type"))
        name = clean_ws(r.get("Name"))
        lender = clean_ws(r.get("Creditor Name"))
        if not (fy and rt and name and lender):
            continue
        canon, ap, apc = b.party_fields(rt, fy, name)
        out.append([SOURCE, fy, rt, KIND_OF.get(rt, "other"), name, canon, ap, apc, lender,
                    parse_amount(r.get("Amount owed")), clean_ws(r.get("Financial or Non-financial institution")) or None,
                    src_file, AEC_ANNUAL_URL, b.now])
    return out


def build_benefits(b: Bundle) -> list[list]:
    out = []
    src_file = "Detailed Discretionary Benefits.csv"
    for r in read_rows(b.zf, src_file):
        fy = norm_fy(r.get("Financial Year"))
        rt = clean_ws(r.get("Return Type"))
        name = clean_ws(r.get("Name"))
        provider = clean_ws(r.get("Received From"))
        if not (fy and rt and name and provider):
            continue
        canon, ap, apc = b.party_fields(rt, fy, name)
        out.append([SOURCE, fy, rt, KIND_OF.get(rt, "other"), "discretionary_benefit", name, canon, ap, apc,
                    provider, parse_date(r.get("Date"), ["dmy_slash", "iso"]), parse_amount(r.get("Value")),
                    src_file, AEC_ANNUAL_URL, b.now])
    src_file = "Capital Contributions.csv"
    for r in read_rows(b.zf, src_file):
        fy = norm_fy(r.get("Financial Year"))
        rt = clean_ws(r.get("Return Type"))
        name = clean_ws(r.get("Name"))
        provider = clean_ws(r.get("Contributor"))
        if not (fy and rt and name and provider):
            continue
        canon, ap, apc = b.party_fields(rt, fy, name)
        out.append([SOURCE, fy, rt, KIND_OF.get(rt, "other"), "capital_contribution", name, canon, ap, apc,
                    provider, None, parse_amount(r.get("Value")), src_file, AEC_ANNUAL_URL, b.now])
    return out


def _ret(b: Bundle, fy: str, rt: str, name: str, src_file: str, **f) -> list:
    kind = KIND_OF.get(rt, "other")
    it = b.itemised.get((fy, kind, name_key(name)), {})
    row = dict.fromkeys(COLS_RETURNS)
    row.update(source=SOURCE, financial_year=fy, return_type=rt, kind=kind, entity_name=name,
               itemised_donations=it.get("Donation Received"), itemised_other_receipts=it.get("Other Receipt"),
               itemised_subscriptions=it.get("Subscription"), itemised_public_funding=it.get("Public Funding"),
               itemised_unspecified=it.get("Unspecified"), source_file=src_file, source_url=AEC_ANNUAL_URL,
               ingested_at=b.now)
    row.update(f)
    return [row[c] for c in COLS_RETURNS]


def build_returns(b: Bundle) -> list[list]:
    out = []
    amt = parse_amount

    f = "Party Returns.csv"
    for r in read_rows(b.zf, f):
        fy, name = norm_fy(r.get("Financial Year")), clean_ws(r.get("Name"))
        if not (fy and name):
            continue
        out.append(_ret(b, fy, "Political Party Return", name, f,
                        entity_canonical=canon_party(name), party_group=clean_ws(r.get("Party Group")) or None,
                        total_receipts=amt(r.get("Total Receipts")), total_payments=amt(r.get("Total Payments")),
                        total_debts=amt(r.get("Total Debts")), total_benefits=amt(r.get("Total Discretionary Benefits"))))

    f = "Associated Entity Returns.csv"
    for r in read_rows(b.zf, f):
        fy, name = norm_fy(r.get("Financial Year")), clean_ws(r.get("Name"))
        if not (fy and name):
            continue
        parties = split_parties(r.get("AssociatedParties"))
        out.append(_ret(b, fy, "Associated Entity Return", name, f,
                        associated_parties="; ".join(parties) or None, associated_party_canonical=canon_of_parties(parties),
                        lodged_on_behalf_of=clean_ws(r.get("Lodged on behalf of")) or None,
                        total_receipts=amt(r.get("Total Receipts")), total_payments=amt(r.get("Total Payments")),
                        total_debts=amt(r.get("Total Debts")), total_benefits=amt(r.get("Discretionary Benefits")),
                        total_capital_contributions=amt(r.get("Capital Contributions"))))

    f = "Significant Third Party Returns.csv"
    for r in read_rows(b.zf, f):
        fy, name = norm_fy(r.get("Financial Year")), clean_ws(r.get("Name"))
        rt = clean_ws(r.get("Return Type")) or "Significant Third Party Return"
        if not (fy and name):
            continue
        out.append(_ret(b, fy, rt, name, f,
                        lodged_on_behalf_of=clean_ws(r.get("Lodged on behalf of")) or None,
                        abn=re.sub(r"\D", "", r.get("ABN") or "") or None, client_file_id=clean_ws(r.get("ClientFileId")) or None,
                        total_receipts=amt(r.get("Total Receipts")), total_payments=amt(r.get("Total Payments")),
                        total_debts=amt(r.get("Total Debts")), total_benefits=amt(r.get("Total Discretionary Benefits")),
                        electoral_expenditure=amt(r.get("Electoral Expenditure"))))

    f = "Third Party Returns.csv"
    for r in read_rows(b.zf, f):
        fy, name = norm_fy(r.get("Financial Year")), clean_ws(r.get("Name"))
        if not (fy and name):
            continue
        out.append(_ret(b, fy, "Third Party Return", name, f,
                        abn=re.sub(r"\D", "", r.get("ABN") or "") or None, client_file_id=clean_ws(r.get("ClientFileId")) or None,
                        client_type=clean_ws(r.get("ClientType")) or None,
                        electoral_expenditure=amt(r.get("Total Expenditure")),
                        total_donations_received=amt(r.get("Total Gifts Received"))))

    f = "Donor Returns.csv"
    for r in read_rows(b.zf, f):
        fy, name = norm_fy(r.get("Financial Year")), clean_ws(r.get("Name"))
        if not (fy and name):
            continue
        out.append(_ret(b, fy, "Donor Return", name, f,
                        lodged_on_behalf_of=clean_ws(r.get("Lodged on behalf of")) or None,
                        total_donations_made=amt(r.get("Total Donations Made")),
                        total_donations_received=amt(r.get("Total Donations Received"))))

    f = "MemberOfParliamentReturns.csv"
    for r in read_rows(b.zf, f):
        fy, name = norm_fy(r.get("Financial Year")), clean_ws(r.get("Name"))
        rt = clean_ws(r.get("Return Type")) or "Member of House of Representatives Return"
        if not (fy and name):
            continue
        n = re.sub(r"\D", "", r.get("Number of Donors") or "")
        out.append(_ret(b, fy, rt, name, f,
                        total_donations_received=amt(r.get("Total Donations Received")),
                        donor_count=int(n) if n else None))
    return out


TABLES = {
    "debts": ("ext_aec_debts", DDL_DEBTS, COLS_DEBTS, build_debts),
    "benefits": ("ext_aec_benefits", DDL_BENEFITS, COLS_BENEFITS, build_benefits),
    "returns": ("ext_aec_returns", DDL_RETURNS, COLS_RETURNS, build_returns),
}


def replace_with_retry(writer, *args, attempts: int = 5, **kw) -> dict:
    """parli.db is shared with a running backfill: wait out a lock rather than fail."""
    for i in range(attempts):
        try:
            return writer.replace(*args, **kw)
        except sqlite3.OperationalError as e:
            if "locked" not in str(e).lower() or i == attempts - 1:
                raise
            wait = 30 * (i + 1)
            log(f"  database locked; retry {i + 1}/{attempts - 1} in {wait}s")
            time.sleep(wait)
    raise RuntimeError("unreachable")


def summarise(name: str, cols: list[str], rows: list[list]) -> None:
    fy = cols.index("financial_year")
    years = sorted({r[fy] for r in rows if r[fy]})
    log(f"  {name}: {len(rows):,} rows; {years[0] if years else '-'} .. {years[-1] if years else '-'}")
    if "kind" in cols:
        k = cols.index("kind")
        counts = defaultdict(int)
        for r in rows:
            counts[r[k]] += 1
        log("    by kind: " + ", ".join(f"{a} {n:,}" for a, n in sorted(counts.items(), key=lambda kv: -kv[1])))


def main() -> None:
    ap = argparse.ArgumentParser(description="AEC Transparency Register debts / benefits / return totals -> ext_aec_*")
    ap.add_argument("--table", action="append", choices=sorted(TABLES), help="repeatable; default all three")
    ap.add_argument("--refresh", action="store_true", help="re-download the AllAnnualData bundle")
    add_writer_args(ap)
    args = ap.parse_args()
    writer = writer_from_args(args)
    log(f"ext_aec_* <- {args.table or sorted(TABLES)} ; writer={writer.describe()}")
    zf = load_bundle(make_session(), refresh=args.refresh)
    bundle = Bundle(zf)
    summary = {}
    for key in args.table or sorted(TABLES):
        table, ddl, cols, build = TABLES[key]
        log(f"\n== {table} ==")
        rows = build(bundle)
        summarise(table, cols, rows)
        summary[table] = replace_with_retry(writer, table, ddl, cols, rows, source=SOURCE,
                                            notes=f"bundle {AEC_ANNUAL_URL}; licence CC BY 4.0 ({AEC_LICENCE_URL})")
    log("\nSummary: " + json.dumps(summary, default=str))


if __name__ == "__main__":
    main()
