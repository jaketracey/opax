"""
parli.ingest.money_state_donations -- state political-donation disclosures
into `ext_donations` (one unified schema next to the AEC `donations` table).

Sources (all machine-readable, pulled in full; see docs/DATA-MONEY.md for the
licence table and the two jurisdictions that are gated):

  qld_ecq   Electoral Commission of Queensland Electronic Disclosure System.
            POST https://disclosures.ecq.qld.gov.au/Map/ExportCsv (the
            "Download > CSV" button on the Donor Location Map) returns every
            gift in the system as one CSV (~23.6K rows, 2012-13 onwards,
            real-time since 2017). Licensed CC BY 4.0 via data.qld.gov.au
            dataset "Electronic Disclosure System - State and Local Election
            Funding and Donations".
  vic_vec   Victorian Electoral Commission "VEC Disclosures" public portal
            (Power Pages). Entity list `pit_donation` on
            https://disclosures.vec.vic.gov.au/public-donations/ — every
            disclosed donation since the scheme began (Nov 2018).
  wa_waec   WA Electoral Commission Online Disclosure System public dashboard
            (Power Pages). Entity list `waec_disclosure` on
            https://disclosures.elections.wa.gov.au/public-dashboard/ —
            real-time gift disclosures since 1 July 2024 (older years are PDF
            annual returns). NOTE: WAEC asserts full Crown copyright with no
            open licence; acquisition here is research use, public exposure
            is a licence gate (user decision).

  nsw       NOT pulled: the NSW EC "Funding and disclosure online" terms of
            use forbid bots/scrapers; the public site publishes PDFs only.
  sa        NOT pulled: disclosures.ecsa.sa.gov.au did not resolve in DNS on
            2026-09-02; SA also banned donations from 1 July 2025.

Usage:
    python -m parli.ingest.money_state_donations                 # qld + vic + wa -> desktop parli.db
    python -m parli.ingest.money_state_donations --source vic --db /tmp/test.db
    python -m parli.ingest.money_state_donations --limit 200 --dry-run
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone

from parli.ingest.ext_common import (
    CACHE_ROOT, PowerPagesGrid, add_writer_args, au_financial_year, canonical_party,
    classify_donor_type, classify_industry, clean_ws, log, make_session, parse_amount,
    parse_date, polite_get, writer_from_args,
)

CACHE = CACHE_ROOT / "state_donations"

DDL = """
CREATE TABLE IF NOT EXISTS ext_donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jurisdiction TEXT NOT NULL,          -- nsw | vic | qld | sa | wa | federal
    source TEXT NOT NULL,                -- qld_ecq | vic_vec | wa_waec
    source_record_id TEXT,               -- portal GUID where the source has one, else a content hash
    donor_name TEXT NOT NULL,
    donor_type TEXT,                     -- individual | organisation | other (parli.ingest.donations rules)
    donor_suburb TEXT,
    donor_state TEXT,
    donor_postcode TEXT,
    recipient TEXT NOT NULL,             -- party / candidate / committee as disclosed
    recipient_type TEXT,                 -- party | candidate | committee | other
    recipient_party TEXT,                -- coarse canonical party bucket (Labor, Liberal, LNP, Greens, ...)
    amount REAL,
    date_made TEXT,                      -- ISO date the gift was made (where disclosed)
    date_received TEXT,                  -- ISO date received / disclosed
    financial_year TEXT,                 -- AEC-style '2025-26', derived from date_made or date_received
    disclosure_type TEXT,                -- gift | loan | in-kind | ... as labelled by the source
    election TEXT,                       -- election event the gift is tied to, if any
    is_political_donation INTEGER,       -- QLD 'Political donation?' flag; NULL where the source has none
    status TEXT,                         -- reconciled / published / etc.
    version TEXT,                        -- WA 'Original' / 'Amended'
    industry TEXT,                       -- keyword classifier (parli.ingest.classify_donations); NULL = needs LLM pass
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_don_source ON ext_donations(source);
CREATE INDEX IF NOT EXISTS idx_ext_don_juris ON ext_donations(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_ext_don_donor ON ext_donations(donor_name);
CREATE INDEX IF NOT EXISTS idx_ext_don_recipient ON ext_donations(recipient);
CREATE INDEX IF NOT EXISTS idx_ext_don_fy ON ext_donations(financial_year);
CREATE INDEX IF NOT EXISTS idx_ext_don_industry ON ext_donations(industry);
"""

COLUMNS = [
    "jurisdiction", "source", "source_record_id", "donor_name", "donor_type", "donor_suburb",
    "donor_state", "donor_postcode", "recipient", "recipient_type", "recipient_party", "amount",
    "date_made", "date_received", "financial_year", "disclosure_type", "election",
    "is_political_donation", "status", "version", "industry", "source_url", "ingested_at",
]


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _hash(*parts) -> str:
    return hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:16]


def _recipient_type(recipient: str, party: str | None, election: str | None) -> str:
    rl = recipient.lower()
    if "committee" in rl:
        return "committee"
    if party and party.lower().split()[0] in rl or (party and rl in (party or "").lower()):
        return "party"
    if re.search(r"\b(party|greens|nationals|labor|liberal|one nation|alliance)\b", rl):
        return "party"
    if election:
        return "candidate"
    return "other"


def _row(jurisdiction, source, rec_id, donor, recipient, amount, date_made, date_received,
         disclosure_type, election, is_pol, status, version, url, party_hint=None,
         suburb=None, state=None, postcode=None) -> list:
    donor = clean_ws(donor)
    recipient = clean_ws(recipient)
    dtype = classify_donor_type(donor)
    party = canonical_party(party_hint) or canonical_party(recipient)
    fy = au_financial_year(date_made or date_received)
    return [
        jurisdiction, source, rec_id, donor, dtype, clean_ws(suburb) or None, clean_ws(state) or None,
        clean_ws(postcode) or None, recipient, _recipient_type(recipient, party, election), party, amount,
        date_made, date_received, fy, disclosure_type, election or None, is_pol, status, version,
        classify_industry(donor, dtype), url, _now(),
    ]


# ── QLD ECQ ──────────────────────────────────────────────────────────────────

QLD_MAP = "https://disclosures.ecq.qld.gov.au/Map"


def fetch_qld(session, limit: int = 0) -> list[list]:
    """POST the Map export form (empty filters = the whole register) and parse the CSV."""
    CACHE.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d")
    cache = CACHE / f"qld_eds_gifts_{stamp}.csv"
    if cache.exists() and cache.stat().st_size > 10_000:
        text = cache.read_text(encoding="utf-8-sig")
        log(f"  QLD: using cached export {cache.name} ({len(text):,} chars)")
    else:
        page = polite_get(session, QLD_MAP)
        m = re.search(r'__RequestVerificationToken[^>]*value="([^"]+)"', page.text)
        if not m:
            raise RuntimeError("QLD EDS: no anti-forgery token on /Map")
        form = {"__RequestVerificationToken": m.group(1), "ViewFilter.View": "Table",
                "NavigationFilter.PageNumber": "1", "NavigationFilter.PageSize": "100"}
        r = session.post(QLD_MAP + "/ExportCsv", data=form, timeout=600,
                         headers={"Referer": QLD_MAP})
        r.raise_for_status()
        if not r.headers.get("content-type", "").startswith("text/csv"):
            raise RuntimeError(f"QLD EDS export returned {r.headers.get('content-type')}")
        text = r.content.decode("utf-8-sig")
        cache.write_text(text, encoding="utf-8")
        log(f"  QLD: downloaded export ({len(r.content):,} bytes) -> {cache}")
    rows = []
    for rec in csv.DictReader(io.StringIO(text)):
        donor = rec.get("Donor") or ""
        recipient = rec.get("Recipient") or ""
        if not donor.strip() or not recipient.strip():
            continue
        date_made = parse_date(rec.get("Date Gift Made"), ["dmy_dash", "dmy_slash", "iso"])
        election = clean_ws(rec.get("Election")) or None
        pol = rec.get("Political donation", "").strip().lower()
        is_pol = 1 if pol == "yes" else 0 if pol == "no" else None
        committee = clean_ws(rec.get("Name of electoral committee")) or None
        rec_id = _hash(donor, recipient, rec.get("Date Gift Made"), rec.get("Gift value"), election, committee)
        rows.append(_row("qld", "qld_ecq", rec_id, donor, recipient, parse_amount(rec.get("Gift value")),
                         date_made, None, "gift", election, is_pol, None, None, QLD_MAP))
        if limit and len(rows) >= limit:
            break
    return rows


# ── VIC VEC ──────────────────────────────────────────────────────────────────

VIC_PAGE = "https://disclosures.vec.vic.gov.au/public-donations/"


def fetch_vic(session, limit: int = 0) -> list[list]:
    grid = PowerPagesGrid(VIC_PAGE, session=session)
    recs = grid.fetch_all(entity="pit_donation")
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "vic_vec_donations.json").write_text(json.dumps(recs, default=str))
    rows = []
    for r in recs:
        donor = r.get("vec_donor") or ""
        recipient = r.get("vec_recipient") or r.get("pit_recipientrpp") or ""
        if not donor.strip() or not recipient.strip():
            continue
        rows.append(_row(
            "vic", "vic_vec", r.get("pit_donationid") or r.get("_id"), donor, recipient,
            parse_amount(r.get("pit_amount")),
            parse_date(r.get("vec_datedonationmade"), ["dmy_slash", "iso"]),
            parse_date(r.get("vec_datedonationreceived"), ["dmy_slash", "iso"]),
            (r.get("pit_donationtype") or "gift").lower(), None, None, r.get("statuscode"), None, VIC_PAGE,
            party_hint=r.get("pit_recipientrpp"), suburb=r.get("pit_donorsuburb"), state=r.get("pit_donorstate"),
        ))
        if limit and len(rows) >= limit:
            break
    return rows


# ── WA WAEC ──────────────────────────────────────────────────────────────────

WA_PAGE = "https://disclosures.elections.wa.gov.au/public-dashboard/"


def fetch_wa(session, limit: int = 0) -> list[list]:
    grid = PowerPagesGrid(WA_PAGE, session=session)
    recs = grid.fetch_all(entity="waec_disclosure")
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "wa_waec_disclosures.json").write_text(json.dumps(recs, default=str))
    rows = []
    for r in recs:
        donor = r.get("waec_donorid") or ""
        recipient = r.get("waec_politicalentityaccountid") or ""
        if not donor.strip() or not recipient.strip():
            continue
        postcode = next((v for k, v in r.items() if k.endswith("waec_publicpostcode")), None)
        if postcode and not re.fullmatch(r"\d{4}", str(postcode).strip()):
            postcode = None  # 'Postcode Suppressed'
        # The dashboard renders dates in US order (m/d/yyyy) -- verified against
        # disclosures received 27 Aug 2026 showing as 8/27/2026.
        received = parse_date(r.get("waec_datedisclosurereceived"), ["mdy_slash", "iso"])
        fy_raw = r.get("waec_financialyearid")  # '2026-2027'
        rows.append(_row(
            "wa", "wa_waec", r.get("waec_disclosureid") or r.get("_id"), donor, recipient,
            parse_amount(r.get("waec_amount")), None, received,
            (r.get("waec_politicalcontributiontype") or "gift").lower(), None, None,
            r.get("statuscode"), r.get("waec_disclosureversiontype"), WA_PAGE, postcode=postcode,
        ))
        if fy_raw and re.fullmatch(r"\d{4}-\d{4}", fy_raw):
            rows[-1][COLUMNS.index("financial_year")] = f"{fy_raw[:4]}-{fy_raw[7:]}"
        if limit and len(rows) >= limit:
            break
    return rows


FETCHERS = {"qld": fetch_qld, "vic": fetch_vic, "wa": fetch_wa}
SOURCE_KEY = {"qld": "qld_ecq", "vic": "vic_vec", "wa": "wa_waec"}


def main() -> None:
    ap = argparse.ArgumentParser(description="State donation disclosures -> ext_donations")
    ap.add_argument("--source", action="append", choices=sorted(FETCHERS), help="repeatable; default all")
    ap.add_argument("--limit", type=int, default=0, help="cap rows per source (sampling)")
    add_writer_args(ap)
    args = ap.parse_args()
    writer = writer_from_args(args)
    session = make_session()
    log(f"ext_donations <- {args.source or sorted(FETCHERS)} ; writer={writer.describe()}")
    summary = {}
    for src in args.source or sorted(FETCHERS):
        log(f"\n== {src} ==")
        rows = FETCHERS[src](session, limit=args.limit)
        n_ind = sum(1 for r in rows if r[COLUMNS.index("industry")])
        log(f"  {len(rows):,} rows; industry classified (keyword pass): {n_ind:,} "
            f"({(n_ind / len(rows) * 100) if rows else 0:.0f}%)")
        res = writer.replace("ext_donations", DDL, COLUMNS, rows, source=SOURCE_KEY[src],
                             notes=f"limit={args.limit}" if args.limit else None)
        summary[src] = res
    log("\nSummary: " + json.dumps(summary, default=str))


if __name__ == "__main__":
    main()
