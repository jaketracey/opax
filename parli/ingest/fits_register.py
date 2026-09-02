"""
parli.ingest.fits_register -- the Foreign Influence Transparency Scheme (FITS)
public register into four additive ext_* tables:

  ext_fits_registrants    one row per registrant (organisation or individual)
  ext_fits_principals     one row per foreign-principal record; the register
                          keys these per registrant relationship, so the same
                          government can appear under several registrants
  ext_fits_registrations  the registrant <-> foreign principal relationship
                          (commencement, cease, status, activity types, purpose)
  ext_fits_activities     one row per registrable activity

Source and access method (verified 2026-09-02; see docs/DATA-INFLUENCE.md):

  The register moved from https://transparency.ag.gov.au/ (now a static
  redirect notice) to https://foreigninfluence.ag.gov.au/, a Next.js app on
  Azure App Service (prodfissearchportal-auac.azurewebsites.net). It calls a
  same-origin JSON API, DataTables-style (form-encoded POST; `start`, `length`
  capped at 100, `sort`; response {draw, recordsTotal, recordsFiltered, data}):

    POST /api/advancedSearch/_search        registrants (nested foreignPrincipals[])
    POST /api/ForeignPrincipals/_Search     foreign principals (nested activities[], registrant)
    POST /api/Activities/_Search            activities (nested foreignPrincipal, registrant)
    GET  /api/Registrants/Details/{id}      one registrant with everything nested

  The site's "Download" controls are Excel exports of the same data, anonymous
  GET, no parameters needed for the whole register:

    /api/advancedSearch/exportExcel[WithActivities]
    /api/foreignPrincipals/exportExcel[WithActivities]
    /api/activities/exportExcel

  The register is continuous (registrants must update within 14 days of a
  change); every record carries `lastUpdated`. The site has a known bug where an
  unfiltered search page can report 0 results, so an empty page is retried and
  a zero total is refused rather than loaded as an empty register.

  Attorney-General's Department content is CC BY 4.0 (footer "Copyright" link,
  https://www.ag.gov.au/copyright-statement); attribute to the Attorney-General's
  Department, Foreign Influence Transparency Scheme Public Register.

Politeness: one request a second, User-Agent `OPAX/1.0 (+https://opax.com.au)`,
raw pages cached under ~/.cache/autoresearch/fits/<date>/.

Usage:
    python -m parli.ingest.fits_register                 # fetch and load to desktop
    python -m parli.ingest.fits_register --dry-run       # fetch and parse only
    python -m parli.ingest.fits_register --db /tmp/t.db  # load into a local file
"""

from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.ext_common import add_writer_args, clean_ws, log, make_session, writer_from_args

BASE = "https://foreigninfluence.ag.gov.au"
SOURCE = "agd_fits_register"
USER_AGENT = "OPAX/1.0 (+https://opax.com.au)"
CACHE = Path("~/.cache/autoresearch/fits").expanduser()
PAGE = 100          # the API silently caps `length` at 100
DELAY = 1.0

ENDPOINTS = {
    "registrants": "/api/advancedSearch/_search",
    "principals": "/api/ForeignPrincipals/_Search",
    "activities": "/api/Activities/_Search",
}

DDL = """
CREATE TABLE IF NOT EXISTS ext_fits_registrants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,                 -- agd_fits_register
    registrant_id TEXT NOT NULL,          -- the register's GUID (registrationId elsewhere)
    name TEXT NOT NULL,
    title TEXT,
    postnominals TEXT,
    other_names TEXT,
    trading_name TEXT,
    abn TEXT,
    foreign_business_number TEXT,
    registrant_type TEXT,                 -- Organisation | Individual
    registrant_type_id INTEGER,
    occupation TEXT,                      -- individuals only
    registered_from TEXT,                 -- earliest foreign-principal commencement (the register publishes no registration date of its own)
    registered_to TEXT,                   -- latest cease date once every relationship has ceased; NULL while any is current
    status TEXT,                          -- current | ceased (derived from the relationships)
    principal_count INTEGER,
    activity_count INTEGER,
    last_updated TEXT,
    source_url TEXT,
    raw TEXT,                             -- the register's record as JSON (nested lists removed)
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_fits_reg_source ON ext_fits_registrants(source);
CREATE INDEX IF NOT EXISTS idx_ext_fits_reg_id ON ext_fits_registrants(registrant_id);
CREATE INDEX IF NOT EXISTS idx_ext_fits_reg_name ON ext_fits_registrants(name);
CREATE INDEX IF NOT EXISTS idx_ext_fits_reg_abn ON ext_fits_registrants(abn);

CREATE TABLE IF NOT EXISTS ext_fits_principals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    principal_id TEXT NOT NULL,           -- the register's GUID for this registrant's principal record
    registrant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    postnominals TEXT,
    country TEXT,                         -- '; '-joined related countries/jurisdictions
    principal_type TEXT,                  -- Foreign government | Foreign government related entity | ... individual | Foreign political organisation
    principal_type_id INTEGER,
    description TEXT,
    abn TEXT,
    foreign_business_number TEXT,
    commencement_date TEXT,
    cease_date TEXT,
    is_ceased INTEGER,
    activity_count INTEGER,
    last_updated TEXT,
    source_url TEXT,
    raw TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_fits_pr_source ON ext_fits_principals(source);
CREATE INDEX IF NOT EXISTS idx_ext_fits_pr_id ON ext_fits_principals(principal_id);
CREATE INDEX IF NOT EXISTS idx_ext_fits_pr_reg ON ext_fits_principals(registrant_id);
CREATE INDEX IF NOT EXISTS idx_ext_fits_pr_name ON ext_fits_principals(name);

CREATE TABLE IF NOT EXISTS ext_fits_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    registrant_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    registrant_name TEXT,
    principal_name TEXT,
    country TEXT,
    activity_types TEXT,                  -- '; '-joined distinct registrable activity types
    start_date TEXT,                      -- relationship commencement (register: commencementDate)
    end_date TEXT,                        -- relationship cease date (register: ceaseDate)
    status TEXT,                          -- current | ceased
    purpose_summary TEXT,                 -- the activities' descriptions, joined and trimmed
    activity_count INTEGER,
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_fits_rr_source ON ext_fits_registrations(source);
CREATE INDEX IF NOT EXISTS idx_ext_fits_rr_reg ON ext_fits_registrations(registrant_id);
CREATE INDEX IF NOT EXISTS idx_ext_fits_rr_pr ON ext_fits_registrations(principal_id);

CREATE TABLE IF NOT EXISTS ext_fits_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    registrant_id TEXT,
    principal_id TEXT,
    registrant_name TEXT,
    principal_name TEXT,
    activity_type TEXT,                   -- Parliamentary lobbying | General political lobbying | Communications activity | Disbursement activity | Other activity (former Cabinet Minister ...)
    activity_type_id INTEGER,
    start_date TEXT,
    end_date TEXT,
    cease_date TEXT,
    description TEXT,
    disbursement_events TEXT,             -- JSON list where the register publishes any
    last_updated TEXT,
    source_url TEXT,
    raw TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_fits_ac_source ON ext_fits_activities(source);
CREATE INDEX IF NOT EXISTS idx_ext_fits_ac_reg ON ext_fits_activities(registrant_id);
CREATE INDEX IF NOT EXISTS idx_ext_fits_ac_pr ON ext_fits_activities(principal_id);
"""

REG_COLS = ["source", "registrant_id", "name", "title", "postnominals", "other_names", "trading_name", "abn",
            "foreign_business_number", "registrant_type", "registrant_type_id", "occupation", "registered_from",
            "registered_to", "status", "principal_count", "activity_count", "last_updated", "source_url", "raw",
            "ingested_at"]
PR_COLS = ["source", "principal_id", "registrant_id", "name", "title", "postnominals", "country", "principal_type",
           "principal_type_id", "description", "abn", "foreign_business_number", "commencement_date", "cease_date",
           "is_ceased", "activity_count", "last_updated", "source_url", "raw", "ingested_at"]
RR_COLS = ["source", "registrant_id", "principal_id", "registrant_name", "principal_name", "country",
           "activity_types", "start_date", "end_date", "status", "purpose_summary", "activity_count", "source_url",
           "ingested_at"]
AC_COLS = ["source", "activity_id", "registrant_id", "principal_id", "registrant_name", "principal_name",
           "activity_type", "activity_type_id", "start_date", "end_date", "cease_date", "description",
           "disbursement_events", "last_updated", "source_url", "raw", "ingested_at"]

# Presentation-only fields the API adds for its own search UI.
_NOISE = re.compile(r"(Highlighted|FilterText|Description|Str|Icon)$")
_KEEP_DESCRIPTION = {"description", "registrantTypeDescription"}
_NESTED = {"foreignPrincipals", "activities", "registrant", "foreignPrincipal"}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _date(v) -> str | None:
    """'2022-02-27T12:16:16+11:00' -> '2022-02-27' (register timestamps are AEST/AEDT local)."""
    if not v:
        return None
    s = str(v)
    return s[:10] if len(s) >= 10 and s[4] == "-" else None


def _abn(v) -> str | None:
    d = re.sub(r"\D", "", str(v or ""))
    return d if len(d) == 11 else (clean_ws(v) or None)


def _raw(rec: dict) -> str:
    slim = {k: v for k, v in rec.items()
            if k not in _NESTED and (k in _KEEP_DESCRIPTION or not _NOISE.search(k))}
    return json.dumps(slim, ensure_ascii=False, default=str)


def profile_url(registrant_id: str, page: str | None = None, anchor: str | None = None) -> str:
    u = f"{BASE}/Profile/{registrant_id}"
    if page:
        u += f"?page={page}"
    if anchor:
        u += f"#{anchor}"
    return u


# ── Fetch ────────────────────────────────────────────────────────────────────

def _session():
    s = make_session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json", "Origin": BASE, "Referer": BASE + "/"})
    return s


def fetch_all(kind: str, session=None, refresh: bool = False, limit: int = 0) -> list[dict]:
    """Every record of one search endpoint, paged 100 at a time, cached per day."""
    s = session or _session()
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cache_dir = CACHE / day
    cache_dir.mkdir(parents=True, exist_ok=True)
    out: list[dict] = []
    start = 0
    total = None
    while True:
        path = cache_dir / f"{kind}-{start:05d}.json"
        if path.exists() and not refresh:
            page = json.loads(path.read_text(encoding="utf-8"))
        else:
            page = None
            for attempt in range(4):
                time.sleep(DELAY)
                r = s.post(BASE + ENDPOINTS[kind], data={"start": str(start), "length": str(PAGE), "sort": "1"},
                           timeout=120)
                r.raise_for_status()
                page = r.json()
                if page.get("recordsTotal") or attempt == 3:
                    break
                # The register's known "0 results on an unfiltered page" fault: back off and retry.
                log(f"    {kind}: recordsTotal=0 at start={start} (attempt {attempt + 1}); retrying")
                time.sleep(5 * (attempt + 1))
            path.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")
        recs = page.get("data") or []
        if total is None:
            total = int(page.get("recordsTotal") or 0)
            if total == 0:
                raise RuntimeError(f"{kind}: the register reported 0 records; refusing to load an empty register")
        out.extend(recs)
        log(f"    {kind}: start={start} -> {len(recs)} rows (total {len(out)} / {total})")
        start += PAGE
        if not recs or len(recs) < PAGE or start >= total or (limit and len(out) >= limit):
            break
    if limit:
        out = out[:limit]
    return out


# ── Shape ────────────────────────────────────────────────────────────────────

def build_rows(registrants: list[dict], principals: list[dict], activities: list[dict]):
    now = _now()
    acts_by_principal: dict[str, list[dict]] = {}
    for a in activities:
        acts_by_principal.setdefault(a.get("foreignPrincipalId") or "", []).append(a)
    principals_by_registrant: dict[str, list[dict]] = {}
    for p in principals:
        principals_by_registrant.setdefault(p.get("registrationId") or "", []).append(p)

    reg_rows, pr_rows, rr_rows, ac_rows = [], [], [], []

    for r in registrants:
        rid = r["id"]
        rels = principals_by_registrant.get(rid) or r.get("foreignPrincipals") or []
        starts = sorted(d for d in (_date(p.get("commencementDate")) for p in rels) if d)
        ends = [_date(p.get("ceaseDate")) for p in rels]
        all_ceased = bool(rels) and all(p.get("isCeased") for p in rels)
        reg_rows.append([
            SOURCE, rid, clean_ws(r.get("name")), clean_ws(r.get("title")) or None,
            clean_ws(r.get("postnominals")) or None, clean_ws(r.get("otherNames")) or None,
            clean_ws(r.get("tradingName")) or None, _abn(r.get("abn")),
            clean_ws(r.get("foreignBusinessRegistrationNumber")) or None,
            r.get("registrantTypeDescription"), r.get("registrantTypeId"), clean_ws(r.get("occupation")) or None,
            starts[0] if starts else None,
            max(d for d in ends if d) if all_ceased and any(ends) else None,
            "ceased" if all_ceased else "current",
            len(rels) or r.get("foreignPrincipalTotal"), r.get("activityTotal"), _date(r.get("lastUpdated")),
            profile_url(rid), _raw(r), now,
        ])

    for p in principals:
        pid, rid = p["id"], p.get("registrationId") or ""
        acts = acts_by_principal.get(pid) or p.get("activities") or []
        countries = "; ".join(p.get("countries") or []) or clean_ws(p.get("countriesDescription")) or None
        pr_rows.append([
            SOURCE, pid, rid, clean_ws(p.get("name")), clean_ws(p.get("title")) or None,
            clean_ws(p.get("postnominals")) or None, countries, p.get("foreignPrincipalType"),
            p.get("foreignPrincipalTypeId"), clean_ws(p.get("description")) or None, _abn(p.get("abn")),
            clean_ws(p.get("foreignBusinessRegistrationNumber")) or None,
            _date(p.get("commencementDate")), _date(p.get("ceaseDate")), 1 if p.get("isCeased") else 0,
            len(acts) or p.get("activityTotal"), _date(p.get("lastUpdated")),
            profile_url(rid, "ForeignPrincipals", pid), _raw(p), now,
        ])
        types = sorted({clean_ws(a.get("activityType")) for a in acts if a.get("activityType")})
        purpose = " | ".join(dict.fromkeys(clean_ws(a.get("description")) for a in acts if clean_ws(a.get("description"))))
        rr_rows.append([
            SOURCE, rid, pid, clean_ws(p.get("registrationName")) or None, clean_ws(p.get("name")), countries,
            "; ".join(types) or None, _date(p.get("commencementDate")), _date(p.get("ceaseDate")),
            "ceased" if p.get("isCeased") else "current",
            (purpose[:1000] + "…") if len(purpose) > 1000 else (purpose or None),
            len(acts), profile_url(rid, "ForeignPrincipals", pid), now,
        ])

    for a in activities:
        rid = a.get("registrationId") or ""
        dis = a.get("disbursementEvents")
        ac_rows.append([
            SOURCE, a["id"], rid, a.get("foreignPrincipalId"), clean_ws(a.get("registrationName")) or None,
            clean_ws(a.get("foreignPrincipalName")) or None, clean_ws(a.get("activityType")) or None,
            a.get("activityTypeId"), _date(a.get("startDate")), _date(a.get("endDate")), _date(a.get("ceaseDate")),
            clean_ws(a.get("description")) or None,
            json.dumps(dis, ensure_ascii=False, default=str) if dis else None, _date(a.get("lastUpdated")),
            profile_url(rid, "Activities", a["id"]), _raw(a), now,
        ])

    return reg_rows, pr_rows, rr_rows, ac_rows


# ── Main ─────────────────────────────────────────────────────────────────────

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_writer_args(ap)
    ap.add_argument("--refresh", action="store_true", help="Ignore today's cached pages")
    ap.add_argument("--limit", type=int, default=0, help="Stop after this many records per endpoint (testing)")
    args = ap.parse_args(argv)
    writer = writer_from_args(args)
    log(f"FITS register -> {writer.describe()}")

    s = _session()
    registrants = fetch_all("registrants", s, args.refresh, args.limit)
    principals = fetch_all("principals", s, args.refresh, args.limit)
    activities = fetch_all("activities", s, args.refresh, args.limit)
    log(f"  fetched {len(registrants)} registrants, {len(principals)} foreign principals, {len(activities)} activities")

    reg_rows, pr_rows, rr_rows, ac_rows = build_rows(registrants, principals, activities)
    current = sum(1 for r in reg_rows if r[REG_COLS.index("status")] == "current")
    individuals = sum(1 for r in reg_rows if r[REG_COLS.index("registrant_type")] == "Individual")
    log(f"  registrants: {len(reg_rows)} ({current} with a current relationship; {individuals} individuals)")

    notes = f"foreigninfluence.ag.gov.au search API; {len(registrants)} registrants, {len(principals)} principals, {len(activities)} activities"
    writer.replace("ext_fits_registrants", DDL, REG_COLS, reg_rows, SOURCE, notes=notes)
    writer.replace("ext_fits_principals", DDL, PR_COLS, pr_rows, SOURCE, notes=notes)
    writer.replace("ext_fits_registrations", DDL, RR_COLS, rr_rows, SOURCE, notes=notes)
    writer.replace("ext_fits_activities", DDL, AC_COLS, ac_rows, SOURCE, notes=notes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
