"""
parli.ingest.acnc_ato -- ACNC charity register, ACNC Annual Information Statements (AIS) and
the ATO Corporate Tax Transparency report into three additive ext_* tables keyed by ABN:

  ext_acnc_charities          one row per registered charity (ACNC Registered Charities dataset)
  ext_acnc_ais                one row per charity per AIS year (revenue, government revenue, ...)
  ext_ato_tax_transparency    one row per corporate tax entity per income year (ATO "Report of
                              entity tax information": total income, taxable income, tax payable,
                              PRRT payable)

Every row carries source, source_url (the publisher's record), dataset_url, resource_id, licence,
licence_url, licence_note, snapshot_date (the resource's last-modified on data.gov.au),
dataset_modified (CKAN metadata_modified, used by --check-updated) and ingested_at.

Where the files come from (verified 2026-09-29, see docs/DATA-TAX-CHARITY.md)
-----------------------------------------------------------------------------
Nothing is hard-coded to a file URL. The CKAN API at https://data.gov.au/data/api/3/action is asked
for the packages and the current resource URLs on every run:

  ACNC Registered Charities   package b050b242-4487-4306-abf5-07ca073e5594  (CSV, updated weekly)
  ACNC AIS, one package a year  found with package_search on the ACNC organisation, year parsed
                              from the title "ACNC 2024 Annual Information Statement (AIS) Data"
  ATO Corporate Tax Transparency  package c2524c87-cea4-4636-acac-599a82048a26 (one XLSX a year,
                              year parsed from "2023-24 Report of Entity Tax Information")

Licences are read from each package's CKAN record (cc-by = CC BY 3.0 AU, cc-by-2.5 = CC BY 2.5 AU,
cc-by-4.0 = CC BY 4.0). The 2024 AIS package leaves the field as "notspecified" and always has;
for it the licence is taken from the ACNC's own copyright statement (https://www.acnc.gov.au/copyright:
CC BY 4.0 for ACNC material) and `licence_note` says so. A package with any other licence, or none
and no publisher statement to fall back on, is not loaded.

Loading rules
-------------
* Rows are built in memory first, then each table/source(/year) is replaced in ONE transaction by
  ExtWriter (DELETE + INSERT + log), so a failed run never leaves a half-loaded set.
* Guard: a new set with no rows, or with fewer than 90% of the rows already loaded for that
  source(/year), is refused (`--allow-shrink` overrides the 90% rule, never the empty rule).
* `--check-updated` reloads only the datasets whose CKAN metadata_modified is newer than the one
  stored on the rows already loaded; nothing is downloaded for the rest.
* AIS: the latest `--ais-years` years that exist on CKAN (default 3; `all` or explicit years
  work too). Reporting groups (ABN 91111111xxx) and rows without an 11-digit ABN are skipped.
* The database path comes from `--db` or the OPAX_DB environment variable; with neither, the
  ExtWriter default (ssh to the box) applies. Development runs use a scratch file.

Usage:
    OPAX_DB=/path/parli.db python -m parli.ingest.acnc_ato --check-updated     # the weekly run
    python -m parli.ingest.acnc_ato --db /tmp/scratch.db                       # full load
    python -m parli.ingest.acnc_ato --status --db /tmp/scratch.db              # what is stale
    python -m parli.ingest.acnc_ato --dry-run                                  # fetch + parse only
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.ext_common import ExtWriter, clean_ws, log, make_session, parse_date

CKAN = "https://data.gov.au/data/api/3/action"
DATASET_BASE = "https://data.gov.au/data/dataset/"
USER_AGENT = "OPAX/1.0 (+https://opax.com.au)"
DELAY = 1.0
CACHE = Path(os.environ.get("OPAX_ACNC_CACHE", "~/.cache/autoresearch/acnc_ato")).expanduser()

REGISTER_PKG = "b050b242-4487-4306-abf5-07ca073e5594"
ATO_PKG = "c2524c87-cea4-4636-acac-599a82048a26"
ATO_DATASET_PAGE = "https://data.gov.au/data/dataset/corporate-transparency"
ACNC_REGISTER_SEARCH = "https://www.acnc.gov.au/charity/charities?search="

SRC_REGISTER = "acnc_register"
SRC_AIS = "acnc_ais"
SRC_ATO = "ato_tax_transparency"

# CKAN licence ids -> (label, url). Attribution-only Creative Commons licences are accepted;
# anything else (share-alike, "notspecified" with no publisher statement) is refused.
CKAN_LICENCES = {
    "cc-by": ("CC BY 3.0 AU", "https://creativecommons.org/licenses/by/3.0/au/"),
    "cc-by-2.5": ("CC BY 2.5 AU", "https://creativecommons.org/licenses/by/2.5/au/"),
    "cc-by-4.0": ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
}
# The ACNC's own statement (verified 2026-09-29): "All material presented on this website is
# provided under a Creative Commons licence, the current version of which is the Creative Commons
# Attribution 4.0 International Licence (CC BY 4.0), with the exception of: the Commonwealth Coat
# of Arms, the ACNC logo, ACNC forms without the ACNC logo, and content supplied by third parties."
PUBLISHER_STATEMENTS = {
    "acnc": ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/",
             "the data.gov.au record does not state a licence; taken from the ACNC copyright statement "
             "https://www.acnc.gov.au/copyright (CC BY 4.0 for ACNC material)"),
}

REGISTER_URL_TEMPLATE = ACNC_REGISTER_SEARCH + "{abn}"

DDL = """
CREATE TABLE IF NOT EXISTS ext_acnc_charities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,                 -- acnc_register
    abn TEXT NOT NULL,
    legal_name TEXT NOT NULL,
    other_names TEXT,
    size TEXT,                            -- Small | Medium | Large | NULL (no AIS lodged yet, or withheld)
    pbi INTEGER,                          -- 1 = Public Benevolent Institution, per the register
    hpc INTEGER,                          -- 1 = Health Promotion Charity, per the register
    advocacy INTEGER,                     -- 1 = "promote or oppose a change to law, government policy or practice" purpose ticked
    purposes TEXT,                        -- '; '-joined charitable purposes
    beneficiaries TEXT,                   -- '; '-joined
    operating_states TEXT,                -- '; '-joined
    operating_countries TEXT,
    town TEXT,
    state TEXT,
    postcode TEXT,
    website TEXT,
    registration_date TEXT,
    established_date TEXT,
    financial_year_end TEXT,
    responsible_persons INTEGER,
    source_url TEXT,                      -- the ACNC Charity Register search for this ABN
    dataset_url TEXT,
    resource_id TEXT,
    licence TEXT,
    licence_url TEXT,
    licence_note TEXT,
    snapshot_date TEXT,
    dataset_modified TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_acnc_ch_abn ON ext_acnc_charities(abn);
CREATE INDEX IF NOT EXISTS idx_ext_acnc_ch_source ON ext_acnc_charities(source);

CREATE TABLE IF NOT EXISTS ext_acnc_ais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,                 -- acnc_ais
    abn TEXT NOT NULL,
    ais_year INTEGER NOT NULL,            -- the AIS year the dataset is named for (reporting period ends in it, usually)
    charity_name TEXT,
    registration_status TEXT,
    size TEXT,
    basic_religious_charity INTEGER,
    ais_received TEXT,
    fin_report_from TEXT,
    fin_report_to TEXT,
    cash_or_accrual TEXT,
    revenue_from_government REAL,         -- Commonwealth, state, territory and local government funding, contracts and subsidies (AIS wording)
    donations_and_bequests REAL,
    revenue_goods_services REAL,
    revenue_investments REAL,
    all_other_revenue REAL,
    total_revenue REAL,                   -- the five revenue lines above; excludes other income
    other_income REAL,
    total_gross_income REAL,              -- total revenue + other income
    employee_expenses REAL,
    total_expenses REAL,
    net_surplus REAL,
    total_assets REAL,
    total_liabilities REAL,
    net_assets REAL,
    fte_staff REAL,
    volunteers INTEGER,
    kmp_count INTEGER,
    kmp_paid REAL,
    source_url TEXT,
    dataset_url TEXT,
    resource_id TEXT,
    licence TEXT,
    licence_url TEXT,
    licence_note TEXT,
    snapshot_date TEXT,
    dataset_modified TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_acnc_ais_abn ON ext_acnc_ais(abn, ais_year);
CREATE INDEX IF NOT EXISTS idx_ext_acnc_ais_source ON ext_acnc_ais(source, ais_year);

CREATE TABLE IF NOT EXISTS ext_ato_tax_transparency (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,                 -- ato_tax_transparency
    abn TEXT,                             -- NULL where the ATO publishes the entity without one
    entity_name TEXT NOT NULL,
    income_year TEXT NOT NULL,            -- 2023-24
    total_income REAL,                    -- label 6S of the company tax return
    taxable_income REAL,                  -- label 7T; NULL = zero or less (the ATO leaves those blank)
    tax_payable REAL,                     -- label T5; NULL = zero or less (blank in the report)
    prrt_payable REAL,                    -- label 25I of the PRRT return, where listed on the PRRT tab
    section TEXT,                         -- income_tax | prrt_only
    source_url TEXT,                      -- the data.gov.au resource page for that year's report
    dataset_url TEXT,
    resource_id TEXT,
    licence TEXT,
    licence_url TEXT,
    licence_note TEXT,
    snapshot_date TEXT,
    dataset_modified TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_ato_abn ON ext_ato_tax_transparency(abn, income_year);
CREATE INDEX IF NOT EXISTS idx_ext_ato_source ON ext_ato_tax_transparency(source, income_year);
"""

CHARITY_COLS = ["source", "abn", "legal_name", "other_names", "size", "pbi", "hpc", "advocacy", "purposes",
                "beneficiaries", "operating_states", "operating_countries", "town", "state", "postcode", "website",
                "registration_date", "established_date", "financial_year_end", "responsible_persons", "source_url",
                "dataset_url", "resource_id", "licence", "licence_url", "licence_note", "snapshot_date",
                "dataset_modified", "ingested_at"]
AIS_COLS = ["source", "abn", "ais_year", "charity_name", "registration_status", "size", "basic_religious_charity",
            "ais_received", "fin_report_from", "fin_report_to", "cash_or_accrual", "revenue_from_government",
            "donations_and_bequests", "revenue_goods_services", "revenue_investments", "all_other_revenue",
            "total_revenue", "other_income", "total_gross_income", "employee_expenses", "total_expenses",
            "net_surplus", "total_assets", "total_liabilities", "net_assets", "fte_staff", "volunteers",
            "kmp_count", "kmp_paid", "source_url", "dataset_url", "resource_id", "licence", "licence_url",
            "licence_note", "snapshot_date", "dataset_modified", "ingested_at"]
ATO_COLS = ["source", "abn", "entity_name", "income_year", "total_income", "taxable_income", "tax_payable",
            "prrt_payable", "section", "source_url", "dataset_url", "resource_id", "licence", "licence_url",
            "licence_note", "snapshot_date", "dataset_modified", "ingested_at"]

class UnsupportedLayout(ValueError):
    """A file whose columns are not the ones this loader maps (the 2013 AIS spreadsheet, a redesigned
    file). Skipped with a warning, not a failure: it must not make the weekly run exit non-zero."""


# ── Pure helpers (unit-tested) ───────────────────────────────────────────────


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def norm_header(h) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(h or "").lower()).strip()


def abn_digits(v) -> str | None:
    """'11 000 073 870', 11000073870 or 1.1000073870e10 -> '11000073870'; None unless 11 digits."""
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    d = re.sub(r"\D", "", str(v))
    return d if len(d) == 11 else None      # exactly 11 digits: a short number is not padded into an ABN


def is_reporting_group_abn(abn: str | None) -> bool:
    """AIS reporting groups have no ABN of their own; the dataset lists them as 91111111xxx."""
    return bool(abn) and abn.startswith("91111111")


def num(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[$,\s]", "", str(v))
    if not s or s in ("-", "NA", "N/A"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        x = float(s)
    except ValueError:
        return None
    return -x if neg else x


def whole(v) -> int | None:
    x = num(v)
    return int(round(x)) if x is not None else None


def flag(v) -> int | None:
    s = str(v or "").strip().upper()
    if s in ("Y", "YES", "TRUE", "1"):
        return 1
    return None


def iso_date(v) -> str | None:
    if v is None or v == "":
        return None
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    return parse_date(str(v), ["dmy_slash", "iso", "d_mon_y", "dmy_dash"])


def ckan_licence(pkg: dict, publisher: str | None = None):
    """(label, url, note) from a CKAN package, falling back to the publisher's own statement.

    None when the licence cannot be established, in which case the dataset is not loaded.
    """
    lid = (pkg.get("license_id") or "").strip().lower()
    if lid in CKAN_LICENCES:
        label, url = CKAN_LICENCES[lid]
        return label, url, "as stated on the data.gov.au dataset record"
    # The publisher's statement stands in only where the record states no licence at all; a record that
    # names some other licence (share-alike, a national-licence variant) is refused, not relabelled.
    if lid in ("", "notspecified", "none") and publisher in PUBLISHER_STATEMENTS:
        label, url, note = PUBLISHER_STATEMENTS[publisher]
        return label, url, note
    return None


def ais_year_of(title: str) -> int | None:
    m = re.search(r"\b(20\d{2})\s+Annual Information Statement", title or "", re.I)
    return int(m.group(1)) if m else None


def income_year_of(text: str) -> str | None:
    m = re.search(r"\b(20\d{2}-\d{2})\b", text or "")
    return m.group(1) if m else None


def _fmt(r: dict) -> str:
    return (r.get("format") or "").strip().lower()


def _is_csv(r: dict) -> bool:
    return "csv" in _fmt(r) or (r.get("url") or "").lower().split("?")[0].endswith(".csv")


def _is_xlsx(r: dict) -> bool:
    u = (r.get("url") or "").lower().split("?")[0]
    return "xls" in _fmt(r) or u.endswith((".xlsx", ".xls"))


def pick_data_resource(resources: list[dict], reject: str = r"program|group|note|guide|explan|member") -> dict | None:
    """The main data file of an ACNC package: CSV if there is one, else XLSX; never the programs,
    group-members or explanatory-notes files."""
    ok = [r for r in resources if not re.search(reject, f"{r.get('name') or ''} {r.get('url') or ''}", re.I)]
    for test in (_is_csv, _is_xlsx):
        hits = [r for r in ok if test(r)]
        if hits:
            # the biggest file is the main table when a package lists several
            return sorted(hits, key=lambda r: -(int(r.get("size") or 0)))[0]
    return None


# Register: purposes by header prefix (the register's own headers carry typos: "natual", "ther").
PURPOSES = [
    ("preventing or relieving suffering of animals", "Preventing or relieving suffering of animals"),
    ("advancing culture", "Advancing culture"),
    ("advancing education", "Advancing education"),
    ("advancing health", "Advancing health"),
    ("promote or oppose a change to law", "Promote or oppose a change to law, government policy or practice"),
    ("advancing natual environment", "Advancing the natural environment"),
    ("advancing natural environment", "Advancing the natural environment"),
    ("promoting or protecting human rights", "Promoting or protecting human rights"),
    ("purposes beneficial to ther general public", "Other purposes beneficial to the general public"),
    ("purposes beneficial to the general public", "Other purposes beneficial to the general public"),
    ("promoting reconciliation", "Promoting reconciliation, mutual respect and tolerance"),
    ("advancing religion", "Advancing religion"),
    ("advancing social or public welfare", "Advancing social or public welfare"),
    ("advancing security or safety", "Advancing security or safety of Australia or the Australian public"),
]
ADVOCACY_PREFIX = "promote or oppose a change to law"
BENEFICIARIES_FROM = "aboriginal or tsi"     # first beneficiary column; the rest run to the end of the row
STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]


def build_charity_rows(rows: list[dict], ds: "Dataset", now: str):
    """Register CSV rows (dicts keyed by the raw header) -> DB rows and stats."""
    out, stats = [], {"read": 0, "no_abn": 0, "duplicate_abn": 0}
    seen: set[str] = set()
    if not rows:
        return out, stats
    headers = list(rows[0].keys())
    nh = {norm_header(h): h for h in headers}
    purpose_cols = [(nh[p], label) for key, label in PURPOSES for p in nh if p.startswith(key)]
    ben_start = next((i for i, h in enumerate(headers) if norm_header(h).startswith(BENEFICIARIES_FROM)), None)
    ben_cols = headers[ben_start:] if ben_start is not None else []
    state_cols = [(s, nh.get(f"operates in {s.lower()}")) for s in STATES]

    def g(r, key):
        h = nh.get(key)
        return clean_ws(r.get(h)) if h else ""

    for r in rows:
        stats["read"] += 1
        abn = abn_digits(r.get(nh["abn"]))
        if not abn:
            stats["no_abn"] += 1      # ABN withheld (the register omits it) or malformed
            continue
        if abn in seen:
            stats["duplicate_abn"] += 1
            continue
        seen.add(abn)
        purposes = []
        for h, label in purpose_cols:
            if flag(r.get(h)) and label not in purposes:
                purposes.append(label)
        adv = 1 if any(flag(r.get(nh[p])) for p in nh if p.startswith(ADVOCACY_PREFIX)) else 0
        bens = [re.sub(r"[_]+", " ", h).strip() for h in ben_cols if flag(r.get(h))]
        states = [s for s, h in state_cols if h and flag(r.get(h))]
        size = g(r, "charity size").title() or None
        out.append([
            SRC_REGISTER, abn, g(r, "charity legal name"), g(r, "other organisation names") or None,
            size if size in ("Small", "Medium", "Large") else None,
            flag(r.get(nh.get("pbi"))) or 0, flag(r.get(nh.get("hpc"))) or 0, adv,
            "; ".join(purposes) or None, "; ".join(bens) or None, "; ".join(states) or None,
            g(r, "operating countries") or None, g(r, "town city") or None, g(r, "state") or None,
            g(r, "postcode") or None, g(r, "charity website") or None,
            iso_date(g(r, "registration date")), iso_date(g(r, "date organisation established")),
            g(r, "financial year end") or None, whole(g(r, "number of responsible persons")),
            REGISTER_URL_TEMPLATE.format(abn=abn), ds.dataset_url, ds.resource_id, ds.licence, ds.licence_url,
            ds.licence_note, ds.snapshot_date, ds.dataset_modified, now,
        ])
    return out, stats


# AIS column aliases (normalised headers), first hit wins. The 2022-2024 CSVs share these; older
# spreadsheets are matched by the same names and skipped with an error if a required one is absent.
AIS_FIELDS = {
    "abn": ["abn"],
    "charity_name": ["charity name"],
    "registration_status": ["registration status"],
    "size": ["charity size"],
    "basic_religious_charity": ["basic religious charity"],
    "ais_received": ["date ais received"],
    "fin_report_from": ["fin report from"],
    "fin_report_to": ["fin report to"],
    "cash_or_accrual": ["cash or accrual"],
    "revenue_from_government": ["revenue from government", "government grants"],
    "donations_and_bequests": ["donations and bequests"],
    "revenue_goods_services": ["revenue from goods and services"],
    "revenue_investments": ["revenue from investments"],
    "all_other_revenue": ["all other revenue"],
    "total_revenue": ["total revenue"],
    "other_income": ["other income"],
    "total_gross_income": ["total gross income"],
    "employee_expenses": ["employee expenses"],
    "total_expenses": ["total expenses"],
    "net_surplus": ["net surplus deficit"],
    "total_assets": ["total assets"],
    "total_liabilities": ["total liabilities"],
    "net_assets": ["net assets liabilities"],
    "fte_staff": ["total full time equivalent staff"],
    "volunteers": ["staff volunteers"],
    "kmp_count": ["number of key management personnel"],
    "kmp_paid": ["total paid to key management personnel"],
}
AIS_REQUIRED = ["abn", "total_revenue", "revenue_from_government"]


def ais_column_map(headers: list[str]) -> dict[str, str]:
    nh = {norm_header(h): h for h in headers}
    m = {}
    for field_name, aliases in AIS_FIELDS.items():
        for a in aliases:
            if a in nh:
                m[field_name] = nh[a]
                break
    return m


def build_ais_rows(rows: list[dict], ds: "Dataset", now: str):
    stats = {"read": 0, "no_abn": 0, "reporting_groups": 0, "duplicate_abn": 0, "no_financials": 0}
    out: list = []
    if not rows:
        return out, stats
    cmap = ais_column_map(list(rows[0].keys()))
    missing = [f for f in AIS_REQUIRED if f not in cmap]
    if missing:
        raise UnsupportedLayout(f"AIS {ds.year}: required columns not found: {missing}")
    seen: set[str] = set()

    def g(r, f):
        h = cmap.get(f)
        return r.get(h) if h else None

    for r in rows:
        stats["read"] += 1
        abn = abn_digits(g(r, "abn"))
        if not abn:
            stats["no_abn"] += 1
            continue
        if is_reporting_group_abn(abn):
            stats["reporting_groups"] += 1
            continue
        if abn in seen:
            stats["duplicate_abn"] += 1
            continue
        seen.add(abn)
        total = num(g(r, "total_revenue"))
        if total is None:
            stats["no_financials"] += 1     # basic religious charities and withheld returns publish none
        size = clean_ws(g(r, "size")).title() or None
        out.append([
            SRC_AIS, abn, int(ds.year), clean_ws(g(r, "charity_name")) or None,
            clean_ws(g(r, "registration_status")) or None, size if size in ("Small", "Medium", "Large") else None,
            1 if str(g(r, "basic_religious_charity") or "").strip().upper() in ("Y", "YES", "TRUE") else 0,
            iso_date(g(r, "ais_received")), iso_date(g(r, "fin_report_from")), iso_date(g(r, "fin_report_to")),
            clean_ws(g(r, "cash_or_accrual")) or None,
            num(g(r, "revenue_from_government")), num(g(r, "donations_and_bequests")),
            num(g(r, "revenue_goods_services")), num(g(r, "revenue_investments")), num(g(r, "all_other_revenue")),
            total, num(g(r, "other_income")), num(g(r, "total_gross_income")), num(g(r, "employee_expenses")),
            num(g(r, "total_expenses")), num(g(r, "net_surplus")), num(g(r, "total_assets")),
            num(g(r, "total_liabilities")), num(g(r, "net_assets")), num(g(r, "fte_staff")),
            whole(g(r, "volunteers")), whole(g(r, "kmp_count")), num(g(r, "kmp_paid")),
            REGISTER_URL_TEMPLATE.format(abn=abn), ds.dataset_url, ds.resource_id, ds.licence, ds.licence_url,
            ds.licence_note, ds.snapshot_date, ds.dataset_modified, now,
        ])
    return out, stats


def _header_index(rows: list[tuple], needle: str = "abn") -> int | None:
    for i, row in enumerate(rows[:12]):
        cells = [norm_header(c) for c in row]
        if needle in cells and any(c.startswith("total income") for c in cells):
            return i
    return None


def parse_ato_workbook(sheets: dict[str, list[tuple]], year: str | None = None):
    """{sheet name: rows} -> ([(name, abn, total, taxable, tax, income_year|None)], {abn|name: prrt}, stats).

    The 2013-14 workbook splits the entities across 'December' and 'March' sheets and repeats all
    of them on 'Combined'; the 2014-15 and 2015-16 workbooks carry one sheet per year, named for it
    (the file's own year is the one taken); every later year has 'Income tax details'. The PRRT
    sheet is 'PRRT details'. Blank taxable income / tax payable stay None: the ATO leaves a field
    blank when the amount is zero or less.
    """
    stats = {"income_rows": 0, "no_abn": 0, "duplicate_abn": 0, "prrt_rows": 0}
    income, prrt = [], {}
    pick = (next((n for n in sheets if year and n.strip() == year), None)
            or next((n for n in sheets if n.strip().lower() == "combined"), None)
            or next((n for n in sheets if n.strip().lower().startswith("income tax")), None))
    if pick is None:
        raise UnsupportedLayout(f"ATO workbook has no income tax sheet (sheets: {list(sheets)})")
    rows = sheets[pick]
    hi = _header_index(rows)
    if hi is None:
        raise UnsupportedLayout(f"ATO sheet {pick!r}: header row not found")
    head = [norm_header(c) for c in rows[hi]]

    def col(prefix):
        return next((i for i, c in enumerate(head) if c.startswith(prefix)), None)

    ci_name, ci_abn = col("name"), col("abn")
    ci_tot, ci_tax, ci_pay, ci_year = col("total income"), col("taxable income"), col("tax payable"), col("income year")
    seen = set()
    for r in rows[hi + 1:]:
        if not r or ci_name is None or not r[ci_name]:
            continue
        name = clean_ws(str(r[ci_name]))
        abn = abn_digits(r[ci_abn]) if ci_abn is not None else None
        if not abn:
            stats["no_abn"] += 1
        elif abn in seen:
            stats["duplicate_abn"] += 1
        seen.add(abn)
        year = clean_ws(str(r[ci_year])) if ci_year is not None and r[ci_year] else None
        income.append((name, abn, num(r[ci_tot]), num(r[ci_tax]) if ci_tax is not None else None,
                       num(r[ci_pay]) if ci_pay is not None else None, year))
        stats["income_rows"] += 1
    p_sheet = next((n for n in sheets if n.strip().lower().startswith("prrt")), None)
    if p_sheet:
        prow = sheets[p_sheet]
        ph = next((i for i, row in enumerate(prow[:12]) if "abn" in [norm_header(c) for c in row]), None)
        if ph is not None:
            phead = [norm_header(c) for c in prow[ph]]
            pn, pa = phead.index("name"), phead.index("abn")
            pp = next(i for i, c in enumerate(phead) if c.startswith("prrt payable"))
            for r in prow[ph + 1:]:
                if not r or not r[pn]:
                    continue
                abn = abn_digits(r[pa])
                prrt[(abn, clean_ws(str(r[pn])))] = num(r[pp])
                stats["prrt_rows"] += 1
    return income, prrt, stats


def build_ato_rows(income, prrt, ds: "Dataset", now: str):
    out = []
    prrt_by_abn = {abn: v for (abn, _), v in prrt.items() if abn}
    used = set()
    for name, abn, total, taxable, tax, year in income:
        y = year or ds.year
        p = prrt_by_abn.get(abn) if abn else None
        if abn and abn in prrt_by_abn:
            used.add(abn)
        out.append([SRC_ATO, abn, name, y, total, taxable, tax, p, "income_tax", ds.record_url, ds.dataset_url,
                    ds.resource_id, ds.licence, ds.licence_url, ds.licence_note, ds.snapshot_date,
                    ds.dataset_modified, now])
    for (abn, name), v in prrt.items():
        if abn and abn in used:
            continue
        out.append([SRC_ATO, abn, name, ds.year, None, None, None, v, "prrt_only", ds.record_url, ds.dataset_url,
                    ds.resource_id, ds.licence, ds.licence_url, ds.licence_note, ds.snapshot_date,
                    ds.dataset_modified, now])
    return out


def check_guard(what: str, old: int, new: int, allow_shrink: bool = False) -> None:
    """Refuse an empty set always, and a set under 90% of what is loaded unless allowed."""
    if new <= 0:
        raise RuntimeError(f"{what}: the new set is empty; refusing to replace {old:,} loaded rows")
    if old > 0 and new < 0.9 * old and not allow_shrink:
        raise RuntimeError(f"{what}: the new set has {new:,} rows against {old:,} loaded (under 90%); "
                           f"refusing (use --allow-shrink if the publisher really cut it)")


# ── CKAN ─────────────────────────────────────────────────────────────────────


@dataclass
class Dataset:
    source: str
    key: str                       # register | ais2024 | ato2023-24
    year: str | None
    package_id: str
    package_name: str
    title: str
    dataset_url: str
    resource_id: str
    resource_name: str
    resource_url: str
    resource_format: str
    snapshot_date: str | None      # the resource's last-modified on data.gov.au
    dataset_modified: str | None   # the package's metadata_modified
    licence: str
    licence_url: str
    licence_note: str
    record_url: str = ""           # the publisher's record a reader can open
    resource_size: int | None = None
    extra: dict = field(default_factory=dict)


def _session():
    s = make_session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def ckan(session, action: str, **params) -> dict:
    time.sleep(DELAY)
    r = session.get(f"{CKAN}/{action}", params=params, timeout=90)
    r.raise_for_status()
    j = r.json()
    if not j.get("success"):
        raise RuntimeError(f"CKAN {action} failed: {j.get('error')}")
    return j["result"]


def _dataset(source, key, year, pkg, res, licence, record_url) -> Dataset:
    return Dataset(
        source=source, key=key, year=str(year) if year is not None else None, package_id=pkg["id"],
        package_name=pkg.get("name") or pkg["id"], title=pkg.get("title") or "",
        dataset_url=DATASET_BASE + (pkg.get("name") or pkg["id"]), resource_id=res["id"],
        resource_name=clean_ws(res.get("name")), resource_url=res["url"], resource_format=_fmt(res),
        snapshot_date=(res.get("last_modified") or res.get("created") or pkg.get("metadata_modified") or "")[:10] or None,
        dataset_modified=pkg.get("metadata_modified"), licence=licence[0], licence_url=licence[1],
        licence_note=licence[2], record_url=record_url,
        resource_size=int(res["size"]) if str(res.get("size") or "").isdigit() else None)


def discover(session, want=("register", "ais", "ato"), ais_years: str = "3") -> list[Dataset]:
    """Ask CKAN for the current packages and resources; nothing about a file URL is remembered."""
    out: list[Dataset] = []
    if "register" in want:
        pkg = ckan(session, "package_show", id=REGISTER_PKG)
        lic = ckan_licence(pkg, "acnc")
        res = pick_data_resource(pkg["resources"])
        if lic and res:
            out.append(_dataset(SRC_REGISTER, "register", None, pkg, res, lic, ACNC_REGISTER_SEARCH))
        else:
            log(f"  ! register: no usable resource or licence ({lic}, {bool(res)}); skipped")
    if "ais" in want:
        found = ckan(session, "package_search", q='"Annual Information Statement"', fq="organization:acnc", rows=100)
        by_year = {}
        for pkg in found["results"]:
            y = ais_year_of(pkg.get("title"))
            if y:
                by_year[y] = pkg
        years = sorted(by_year, reverse=True)
        if ais_years != "all":
            if "," in ais_years or (ais_years.isdigit() and len(ais_years) == 4):
                wanted = {int(x) for x in ais_years.split(",") if x.strip()}
                years = [y for y in years if y in wanted]
            else:
                years = years[: max(1, int(ais_years))]
        for y in years:
            pkg = by_year[y]
            lic = ckan_licence(pkg, "acnc")
            res = pick_data_resource(pkg["resources"])
            if lic and res:
                out.append(_dataset(SRC_AIS, f"ais{y}", y, pkg, res, lic, ACNC_REGISTER_SEARCH))
            else:
                log(f"  ! AIS {y}: no usable resource or licence; skipped")
    if "ato" in want:
        pkg = ckan(session, "package_show", id=ATO_PKG)
        lic = ckan_licence(pkg, None)
        if lic is None:
            log(f"  ! ATO: licence {pkg.get('license_id')!r} is not an accepted attribution licence; skipped")
        else:
            for res in pkg["resources"]:
                y = income_year_of(res.get("name") or "")
                if y and _is_xlsx(res):
                    out.append(_dataset(SRC_ATO, f"ato{y}", y, pkg, res, lic,
                                        f"{ATO_DATASET_PAGE}/resource/{res['id']}"))
    return out


# ── Fetch + parse files ──────────────────────────────────────────────────────


def download(session, ds: Dataset, cache: Path, refresh: bool = False) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    stamp = re.sub(r"\W+", "", ds.snapshot_date or "") + re.sub(r"\W+", "", ds.dataset_modified or "")[:14]
    ext = ".csv" if _is_csv({"format": ds.resource_format, "url": ds.resource_url}) else ".xlsx"
    path = cache / f"{ds.resource_id}-{stamp}{ext}"
    if path.exists() and path.stat().st_size > 0 and not refresh:
        return path
    time.sleep(DELAY)
    part = path.with_suffix(path.suffix + ".part")
    n = 0
    with session.get(ds.resource_url, stream=True, timeout=300) as r:
        r.raise_for_status()
        want = int(r.headers.get("Content-Length") or 0)
        with open(part, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                n += len(chunk)
    if n == 0 or (want and n != want):
        part.unlink(missing_ok=True)
        raise RuntimeError(f"{ds.key}: download incomplete ({n} of {want or '?'} bytes)")
    part.replace(path)
    for old in cache.glob(f"{ds.resource_id}-*"):
        if old != path:
            old.unlink(missing_ok=True)
    return path


def read_csv_dicts(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def read_xlsx_sheets(path: Path) -> dict[str, list[tuple]]:
    import warnings
    import openpyxl
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        return {ws.title: [tuple(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}


def read_xlsx_dicts(path: Path) -> list[dict]:
    """First sheet with an ABN header -> dict rows (older AIS years ship as spreadsheets)."""
    for rows in read_xlsx_sheets(path).values():
        hi = next((i for i, r in enumerate(rows[:10]) if "abn" in [norm_header(c) for c in r]), None)
        if hi is None:
            continue
        head = [str(c) if c is not None else "" for c in rows[hi]]
        return [dict(zip(head, r)) for r in rows[hi + 1:] if r and any(c is not None for c in r)]
    raise ValueError(f"{path.name}: no sheet with an ABN column")


# ── Store access (state + guard) ─────────────────────────────────────────────

_REMOTE_QUERY = r'''
import base64, json, sqlite3, sys
db = sqlite3.connect("file:%s?mode=ro" % sys.argv[1], uri=True, timeout=120)
sql, params = json.loads(base64.b64decode(sys.argv[2]).decode("utf-8"))
try:
    print(json.dumps([list(r) for r in db.execute(sql, params)]))
except sqlite3.OperationalError as e:
    print(json.dumps({"error": str(e)}))
'''


def store_query(writer: ExtWriter, sql: str, params=()) -> list[list]:
    """Read-only query against wherever the writer writes; a missing table reads as empty."""
    if writer.db_path:
        if not writer.db_path.exists():
            return []
        db = sqlite3.connect(f"file:{writer.db_path}?mode=ro", uri=True, timeout=120)
        try:
            return [list(r) for r in db.execute(sql, params)]
        except sqlite3.OperationalError:
            return []
        finally:
            db.close()
    payload = base64.b64encode(json.dumps([sql, list(params)]).encode("utf-8")).decode("ascii")
    proc = subprocess.run(["ssh", writer.ssh_host, "python3", "-", writer.remote_db, payload],
                          input=_REMOTE_QUERY, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(f"remote query failed: {proc.stderr[-500:]}")
    res = json.loads(proc.stdout.strip().splitlines()[-1])
    return [] if isinstance(res, dict) else res


TABLE_OF = {SRC_REGISTER: "ext_acnc_charities", SRC_AIS: "ext_acnc_ais", SRC_ATO: "ext_ato_tax_transparency"}


def _where(ds: Dataset) -> tuple[str, list]:
    """What one dataset replaces. AIS: its year. ATO: its resource, NOT its income year: the 2023-24
    workbook also lists late lodgers for 2021-22 and 2022-23 (the ATO's own note on the Information
    sheet), so replacing by income year would let one year's load delete another file's rows."""
    if ds.source == SRC_AIS:
        return "source = ? AND ais_year = ?", [ds.source, int(ds.year)]
    if ds.source == SRC_ATO:
        return "source = ? AND resource_id = ?", [ds.source, ds.resource_id]
    return "source = ?", [ds.source]


def loaded_state(writer: ExtWriter, ds: Dataset) -> tuple[int, str | None]:
    """(row count, dataset_modified stored on those rows) for one dataset."""
    where, params = _where(ds)
    rows = store_query(writer, f"SELECT COUNT(*), MAX(dataset_modified) FROM {TABLE_OF[ds.source]} WHERE {where}", params)
    return (int(rows[0][0]), rows[0][1]) if rows else (0, None)


# ── One dataset end to end ───────────────────────────────────────────────────


def load_dataset(ds: Dataset, session, writer: ExtWriter, cache: Path, allow_shrink: bool = False,
                 refresh: bool = False) -> dict:
    now = now_iso()
    path = download(session, ds, cache, refresh)
    sha = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    if ds.source == SRC_REGISTER:
        rows, stats = build_charity_rows(read_csv_dicts(path), ds, now)
        cols = CHARITY_COLS
    elif ds.source == SRC_AIS:
        data = read_csv_dicts(path) if path.suffix == ".csv" else read_xlsx_dicts(path)
        rows, stats = build_ais_rows(data, ds, now)
        cols = AIS_COLS
    else:
        income, prrt, stats = parse_ato_workbook(read_xlsx_sheets(path), ds.year)
        rows = build_ato_rows(income, prrt, ds, now)
        cols = ATO_COLS
    where, params = _where(ds)
    old, _ = loaded_state(writer, ds) if not writer.dry_run else (0, None)
    check_guard(f"{ds.key}", old, len(rows), allow_shrink)
    notes = (f"{ds.title}; resource {ds.resource_id} ({ds.resource_name}), sha256 {sha}; snapshot {ds.snapshot_date}; "
             f"dataset_modified {ds.dataset_modified}; licence {ds.licence} ({ds.licence_note}); {json.dumps(stats)}")
    res = writer.replace(TABLE_OF[ds.source], DDL, cols, rows, ds.source, delete_where=where,
                         delete_params=params, notes=notes)
    log(f"  {ds.key}: {len(rows):,} rows ({stats}) sha256 {sha}")
    return {"key": ds.key, "rows": len(rows), "stats": stats, "old_rows": old, "result": res}


# ── CLI ──────────────────────────────────────────────────────────────────────


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.environ.get("OPAX_DB"),
                    help="local SQLite file (default: $OPAX_DB; with neither, ssh to --host)")
    ap.add_argument("--host", default=os.environ.get("OPAX_DB_HOST", "desktop"))
    ap.add_argument("--remote-db", default=os.environ.get("OPAX_REMOTE_DB", "/home/jake/.cache/autoresearch/parli.db"))
    ap.add_argument("--only", default="register,ais,ato", help="comma list of register, ais, ato")
    ap.add_argument("--ais-years", default="3", help="latest N AIS years (default 3), 'all', or e.g. 2023,2024")
    ap.add_argument("--check-updated", action="store_true",
                    help="only reload datasets whose CKAN metadata_modified is newer than the loaded rows")
    ap.add_argument("--status", action="store_true", help="print what CKAN offers against what is loaded; write nothing")
    ap.add_argument("--dry-run", action="store_true", help="download and parse, write nothing")
    ap.add_argument("--allow-shrink", action="store_true", help="accept a set under 90%% of the loaded rows")
    ap.add_argument("--refresh", action="store_true", help="ignore cached downloads")
    ap.add_argument("--cache", default=str(CACHE))
    args = ap.parse_args(argv)

    writer = ExtWriter(db_path=args.db, ssh_host=None if args.db else args.host, remote_db=args.remote_db,
                       dry_run=args.dry_run)
    log(f"ACNC / AIS / ATO -> {writer.describe()}")
    session = _session()
    want = tuple(x.strip() for x in args.only.split(",") if x.strip())
    datasets = discover(session, want, args.ais_years)
    if not datasets:
        log("nothing to load: CKAN offered no usable dataset")
        return 1

    plan = []
    for ds in datasets:
        n, stored = loaded_state(writer, ds)
        stale = stored is None or (ds.dataset_modified or "") > stored
        plan.append((ds, n, stored, stale))
    for ds, n, stored, stale in plan:
        log(f"  {ds.key:<11} ckan {ds.dataset_modified}  loaded {n:>7,} rows @ {stored}  {'STALE' if stale else 'current'}  [{ds.licence}]")
    if args.status:
        return 0
    todo = [p for p in plan if p[3]] if args.check_updated else plan
    if not todo:
        log("acnc_ato: up to date; nothing changed at the publisher since the last load (CHANGED=0)")
        return 0

    failures, done, skipped = [], [], []
    for ds, *_ in todo:
        try:
            done.append(load_dataset(ds, session, writer, Path(args.cache).expanduser(), args.allow_shrink, args.refresh))
        except UnsupportedLayout as e:
            skipped.append(ds.key)
            log(f"  ~ {ds.key}: skipped, {e}")
        except Exception as e:  # keep going: one bad year must not block the others
            failures.append((ds.key, str(e)))
            log(f"  ! {ds.key}: {e}")
    log(f"acnc_ato: loaded {len(done)} dataset(s): {', '.join(d['key'] for d in done) or 'none'} (CHANGED={len(done)})"
        + (f"; skipped for layout: {', '.join(skipped)}" if skipped else ""))
    if failures:
        log("acnc_ato: FAILED: " + "; ".join(f"{k}: {m}" for k, m in failures))
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
