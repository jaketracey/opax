"""
parli.ingest.money_small_jurisdictions -- Tasmania, the ACT and the Northern
Territory political-donation disclosures into `ext_donations`, next to the
QLD/VIC/WA loads of money_state_donations (same DDL, same columns, same
per-source replace through ExtWriter). Licence findings and the two gates are in
docs/DATA-MONEY.md section 1.1.

  tas_tec   TEC Disclosures portal (Microsoft Power Pages, launched 3 July 2026):
            entity list `vec_publisheddonation` on
            https://disclosures.tec.tas.gov.au/public-donations/ -- every
            reportable political donation ($1,000+, Electoral Disclosure and
            Funding Act 2023, in force 1 July 2025). The TEC applies CC BY 4.0
            to its website (https://www.tec.tas.gov.au/info/Copyright.html,
            attribution "(c) Tasmanian Electoral Commission"); EXPOSED.
  act_eact  Elections ACT "Gift returns": one HTML page per financial year
            (2012-13 onwards) under
            https://www.elections.act.gov.au/funding-disclosures-and-registers/gift-returns/
            with a table per recipient (From | Date reported | Date gift received
            | Amount | Type | Description). Copyright is the ACT Electoral
            Commission's: unaltered personal / educational / non-commercial use
            only, "you must not copy, adapt, publish, distribute or commercialise
            ... without the permission of the ACT Electoral Commission"
            (https://www.elections.act.gov.au/about-the-commission/copyright).
            Loaded for research; GATED in export_state_money.py like WA.
  nt_ntec   NT Electoral Commission published annual returns (2014-15 onwards;
            separate "annual returns - gifts" pages from 2020-21) and Legislative
            Assembly election returns, all HTML tables under
            https://ntec.nt.gov.au/financial-disclosure/. ntec.nt.gov.au sits
            behind a Cloudflare managed challenge (HTTP 403 to non-browser clients
            from both OPAX hosts on 2026-09-02), so pages are read from the
            Internet Archive's raw captures (web.archive.org/web/<ts>id_/<url>,
            Nov 2025 - Aug 2026). The site carries the NT Government copyright
            statement (no reproduction or reuse beyond fair dealing unless a
            Creative Commons licence is applied; none is applied here). Loaded
            for research; GATED in export_state_money.py like WA.

Everything identifies as OPAX research, waits about a second between requests
and caches downloads under ~/.cache/autoresearch/ext_money/<jur>/. Rows the
parsers cannot read are logged, never guessed.

Usage:
    python -m parli.ingest.money_small_jurisdictions                      # tas + act + nt -> desktop parli.db
    python -m parli.ingest.money_small_jurisdictions --source tas --dry-run
    python -m parli.ingest.money_small_jurisdictions --source act --db /tmp/test.db
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

from parli.ingest.ext_common import (
    CACHE_ROOT, PowerPagesGrid, add_writer_args, au_financial_year, canonical_party,
    clean_ws, log, make_session, parse_amount, parse_date, polite_get, writer_from_args,
)
from parli.ingest.money_state_donations import COLUMNS, DDL, _row

UA_DELAY = 1.0  # one request per second, per the source politeness rule
COL = {name: i for i, name in enumerate(COLUMNS)}


def _hash(*parts) -> str:
    return hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:16]


# Recipient names canonical_party() gets wrong or does not know. Tested before
# the shared table because its bare `liberal` rule swallows "Country Liberal
# Party" and "Liberal Democratic Party".
_PARTY_FIXES = [
    (re.compile(r"country liberal", re.I), "Country Liberal Party"),
    (re.compile(r"liberal democrat", re.I), "Liberal Democrats"),
    (re.compile(r"jacqui lambie", re.I), "Jacqui Lambie Network"),
    (re.compile(r"territory alliance", re.I), "Territory Alliance"),
    (re.compile(r"\b1\s*territory", re.I), "1 Territory Party"),
    (re.compile(r"ban fracking", re.I), "Ban Fracking Fix Crime Protect Water"),
    (re.compile(r"federation party", re.I), "Federation Party"),
    (re.compile(r"australian motorist", re.I), "Australian Motorist Party"),
    (re.compile(r"belco party", re.I), "Belco Party"),
    (re.compile(r"independents for canberra", re.I), "Independents for Canberra"),
    (re.compile(r"first nation party", re.I), "First Nation Party"),
    (re.compile(r"canberra progressives", re.I), "Canberra Progressives"),
    (re.compile(r"sustainable australia", re.I), "Sustainable Australia"),
    (re.compile(r"australian democrats|\bdemocrats\b", re.I), "Democrats"),
    (re.compile(r"local network", re.I), "Local Network"),
    (re.compile(r"palmer united", re.I), "United Australia Party"),
]


def party_of(name: str | None) -> str | None:
    if not name:
        return None
    for rx, canon in _PARTY_FIXES:
        if rx.search(name):
            return canon
    return canonical_party(name)


_STATES = "ACT|NSW|VIC|QLD|SA|WA|TAS|NT"
_ADDR_TAIL = re.compile(rf"^(?P<suburb>.*?)[,\s]*\b(?P<state>{_STATES})\b[,\s]*(?P<pc>\d{{3,4}})?\s*$", re.I)
_PC_ONLY = re.compile(r"^(?P<suburb>.*?)[,\s]+(?P<pc>\d{4})$")


def split_address(lines: list[str]) -> tuple[str | None, str | None, str | None]:
    """Suburb / state / postcode from the last non-empty address line
    ("MCMINNS LAGOON NT 0822", "CANBERRA 2600", "KARAMA, NT 813")."""
    lines = [clean_ws(l) for l in lines if clean_ws(l)]
    if not lines:
        return None, None, None
    last = lines[-1]
    m = _ADDR_TAIL.match(last)
    if m:
        pc = m.group("pc")
        if pc and len(pc) == 3:
            pc = "0" + pc  # NT postcodes printed without their leading zero
        return clean_ws(m.group("suburb")) or None, m.group("state").upper(), pc
    m = _PC_ONLY.match(last)
    if m:
        return clean_ws(m.group("suburb")) or None, None, m.group("pc")
    return None, None, None


def cell_lines(td) -> list[str]:
    for br in td.find_all("br"):
        br.replace_with("\n")
    return [clean_ws(x) for x in td.get_text("\n").split("\n") if clean_ws(x)]


def cached_html(session, url: str, cache_path: Path, fresh: bool) -> str:
    """GET once per day when `fresh`, forever otherwise (closed periods do not change)."""
    if cache_path.exists() and cache_path.stat().st_size > 2000:
        if not fresh or datetime.fromtimestamp(cache_path.stat().st_mtime).date() == datetime.now().date():
            return cache_path.read_text(encoding="utf-8")
    r = polite_get(session, url, delay=UA_DELAY, timeout=120)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(r.text, encoding="utf-8")
    log(f"    fetched {url} ({len(r.text):,} chars)")
    return r.text


# "Surname, Given [Middle]" -- how the ACT and NT registers print people. The
# shared classify_donor_type() only knows "Given Surname" and calls these 'other'.
_PERSON_COMMA = re.compile(r"^[A-Za-z][A-Za-z'\-]+(?: [A-Za-z][A-Za-z'\-]+){0,2}, [A-Za-z][A-Za-z'\-\.]+(?: [A-Za-z][A-Za-z'\-\.]+){0,3}$")
_ORG_WORDS = re.compile(r"\b(pty|ltd|limited|inc|incorporated|corp|association|assn|union|council|trust|foundation|"
                        r"group|holdings|services|industries|company|society|institute|club|fund|party|branch|"
                        r"secretariat|greens|labor|liberal)\b", re.I)


def finish(rows: list[list], recipient_type: str | None = None, party: str | None = None,
           financial_year: str | None = None) -> None:
    """Post-adjust the last _row(): explicit recipient type / party / FY where the
    source knows better, and the comma-form person name the shared rules miss."""
    r = rows[-1]
    donor = r[COL["donor_name"]] or ""
    if r[COL["donor_type"]] == "other" and _PERSON_COMMA.match(donor) and not _ORG_WORDS.search(donor):
        r[COL["donor_type"]] = "individual"
        if r[COL["industry"]] is None:
            r[COL["industry"]] = "individual"
    if party:
        r[COL["recipient_party"]] = party
        if recipient_type is None and r[COL["recipient_type"]] == "other":
            recipient_type = "party"
    if recipient_type:
        r[COL["recipient_type"]] = recipient_type
    if financial_year and not r[COL["financial_year"]]:
        r[COL["financial_year"]] = financial_year


# ── TAS: TEC Disclosures portal + the tec.tas.gov.au report tables ───────────
#
# Tasmania publishes reportable political donations in two places, and the
# portal alone is a small slice of the scheme:
#
#   tec.tas.gov.au report tables   1 July 2025 (commencement of the Electoral
#                                  Disclosure and Funding Act 2023) to now:
#                                  monthly disclosures, plus a seven-day
#                                  disclosure report per election campaign
#                                  period (July 2025 House of Assembly, May 2026
#                                  Legislative Council). Static HTML fragments
#                                  pulled into the page by its own includeHTML().
#   TEC Disclosures portal         disclosures lodged from 3 July 2026, when the
#                                  portal launched ("From 3 July, all new
#                                  electoral participant registrations and
#                                  reportable political donation disclosures
#                                  will be published to TEC Disclosures", TEC,
#                                  registers-and-reports/index.html).
#
# The website reports are the pre-portal record and are still being maintained,
# so both are read and the union is de-duplicated on
# (date, amount, donor, recipient) with the portal row winning.
#
# Not read: the election campaign returns report
# (registers-and-reports/returns/), which publishes each participant's return as
# a PDF form plus an XLSX detail workbook. Those itemise the same reportable
# donations already in the seven-day reports for the campaign period, so
# parsing them would double-count; their added content is electoral
# expenditure, which ext_donations does not model.

TAS_PAGE = "https://disclosures.tec.tas.gov.au/public-donations/"
TAS_SITE = "https://www.tec.tas.gov.au/disclosure-and-funding/registers-and-reports/"
_TAS_ACCOUNT_TYPES = {
    "registered political party": "party",
    "political party": "party",
    "candidate": "candidate",
    "member": "candidate",
    "associated entity": "other",
    "third-party campaigner": "other",
    "third party campaigner": "other",
}

# (report key, table fragment, human page the fragment is displayed on, election)
TAS_REPORTS = [
    ("monthly", "donations/data/table-monthly-disclosures-m.html",
     "donations/monthly-disclosures.html", None),
    ("ha25", "donations/data/table-seven-day-disclosures-ha25-m.html",
     "donations/seven-day-disclosures-ha25.html", "House of Assembly - July 2025"),
    ("lc26", "donations/data/table-seven-day-disclosures-lc26-m.html",
     "donations/seven-day-disclosures-lc26.html", "Legislative Council - 2026"),
]

# "Type of recipient" as the reports print it.
_TAS_RECIPIENT_TYPES = {
    "registered party or endorsed candidate/member": "party",   # refined below
    "independent candidate/member": "candidate",
    "third-party campaigner": "other",
    "associated entity": "other",
    "significant political donor": "other",
}
# Disclosure id inside the declaration PDF's name: edf-donation-25mb-0001-r.pdf.
_TAS_PDF_ID = re.compile(r"edf-donation-([0-9a-z]+-\d+)-[dr]\.pdf", re.I)
# "<party> - <tail>": a person's name, not a place or an arm of the party.
_TAS_PERSON_TAIL = re.compile(
    r"^(?!.*\b(tasmania|tasmanian|division|branch|party|state|territory|national|federal|"
    r"secretariat|office|association|council|inc|ltd)\b)"
    r"[A-Z][A-Za-z'’\-]+(?: [A-Z][A-Za-z'’\-]+){1,3}$")


def _tas_cell(td) -> tuple[str, str | None]:
    """Cell text plus its `data-hidden-sort` value (ISO date / zero-padded cents)."""
    return clean_ws(td.get_text(" ")), td.get("data-hidden-sort") or None


def parse_tas_report(html: str, key: str, url: str, election: str | None,
                     unparsed: Counter) -> list[list]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if table is None:
        unparsed[f"{key}: no table"] += 1
        return []
    trs = table.find_all("tr")
    header = [clean_ws(c.get_text(" ")).lower() for c in trs[0].find_all(["th", "td"])]
    want = ("date of donation", "dollar value of donation", "name of recipient",
            "type of recipient", "name of donor")
    if not all(w in header for w in want):
        unparsed[f"{key}: unexpected header {header}"] += 1
        return []
    ix = {w: header.index(w) for w in want}
    rows: list[list] = []
    for tr in trs[1:]:
        tds = tr.find_all(["td", "th"])
        if len(tds) <= max(ix.values()):
            if clean_ws(tr.get_text(" ")):
                unparsed[f"{key}: short row"] += 1
            continue
        donor = clean_ws(tds[ix["name of donor"]].get_text(" "))
        recipient = clean_ws(tds[ix["name of recipient"]].get_text(" "))
        if not donor or not recipient:
            unparsed[f"{key}: empty donor/recipient"] += 1
            continue
        amt_text, amt_sort = _tas_cell(tds[ix["dollar value of donation"]])
        # A trailing asterisk marks a reportable loan ("* Reportable loan." is the
        # only footnote on these pages); parse_amount would choke on it.
        loan = "*" in amt_text
        amount = parse_amount(amt_text.replace("*", ""))
        if amount is None and amt_sort and amt_sort.isdigit():
            amount = int(amt_sort) / 100.0
        if amount is None:
            unparsed[f"{key}: unparsed amount"] += 1
            log(f"    TAS {key}: cannot read amount in {[clean_ws(t.get_text(' ')) for t in tds]}")
            continue
        date_text, date_sort = _tas_cell(tds[ix["date of donation"]])
        # The sort key is the unambiguous form ("20250828"); the printed cell is
        # d/m/yyyy without leading zeros.
        made = (parse_date(f"{date_sort[:4]}-{date_sort[4:6]}-{date_sort[6:]}", ["iso"])
                if date_sort and len(date_sort) == 8 and date_sort.isdigit() else None)
        made = made or parse_date(date_text, ["dmy_slash", "iso"])
        rtype = _TAS_RECIPIENT_TYPES.get(clean_ws(tds[ix["type of recipient"]].get_text(" ")).lower())
        party = party_of(recipient)
        # The reports print an endorsed candidate as "<party> - <person>"
        # ("Australian Labor Party - Ella Haddad"). A party whose registered name
        # simply carries a hyphen ("The National Party of Australia - Tasmania")
        # is still the party, so the tail has to look like a person.
        if rtype == "party" and " - " in recipient and _TAS_PERSON_TAIL.match(recipient.rsplit(" - ", 1)[1]):
            rtype = "candidate"
        if rtype == "other":
            party = None
        rec_id = next((m.group(1) for m in
                       (_TAS_PDF_ID.search(a["href"]) for a in tr.find_all("a", href=True)) if m), None)
        rows.append(_row(
            "tas", "tas_tec", rec_id or _hash(key, date_text, amt_text, recipient, donor),
            donor, recipient, amount, made, None,
            "loan" if loan else "gift", election, None, None, None, url,
        ))
        finish(rows, recipient_type=rtype, party=party)
    return rows


def fetch_tas_reports(session) -> list[list]:
    rows: list[list] = []
    unparsed: Counter = Counter()
    for key, frag, page, election in TAS_REPORTS:
        html = cached_html(session, TAS_SITE + frag, CACHE_ROOT / "tas" / f"report-{key}.html", fresh=True)
        got = parse_tas_report(html, key, TAS_SITE + page, election, unparsed)
        log(f"    report {key:8} {len(got):5,} donations")
        rows.extend(got)
    if unparsed:
        log(f"  TAS report rows not parsed: {json.dumps(dict(unparsed))}")
    return rows


def fetch_tas_portal(session, limit: int = 0) -> list[list]:
    grid = PowerPagesGrid(TAS_PAGE, session=session, delay=UA_DELAY)
    recs = grid.fetch_all(entity="vec_publisheddonation")
    cache = CACHE_ROOT / "tas"
    cache.mkdir(parents=True, exist_ok=True)
    (cache / f"tec_published_donations_{datetime.now():%Y%m%d}.json").write_text(json.dumps(recs, default=str))
    rows, skipped = [], Counter()
    for r in recs:
        donor = r.get("vec_donor") or ""
        recipient = r.get("vec_recipient") or ""
        if not donor.strip() or not recipient.strip():
            skipped["no donor/recipient"] += 1
            continue
        amount = parse_amount(r.get("vec_amount"))
        if amount is None:
            skipped["no amount"] += 1
            log(f"    TAS unparsed amount: {json.dumps(r, default=str)[:300]}")
            continue
        acct = next((v for k, v in r.items() if k.endswith("pit_accounttype")), None)
        disclosed = r.get("vec_recipientdiscloseddate") or r.get("vec_donordiscloseddate")
        rows.append(_row(
            "tas", "tas_tec", r.get("vec_publisheddonationid") or r.get("_id"), donor, recipient, amount,
            parse_date(r.get("vec_donationdate"), ["dmy_slash", "iso"]),
            parse_date(disclosed, ["dmy_slash", "iso"]),
            "gift", None, None, r.get("statuscode"), None, TAS_PAGE,
        ))
        finish(rows, recipient_type=_TAS_ACCOUNT_TYPES.get((acct or "").strip().lower()), party=party_of(recipient))
        if limit and len(rows) >= limit:
            break
    if skipped:
        log(f"  TAS skipped: {dict(skipped)}")
    return rows


def fetch_tas(session, limit: int = 0) -> list[list]:
    """Portal + website reports, de-duplicated. The two are meant to be disjoint
    in time (the reports stop where the portal starts), so any overlap is a
    republication of the same disclosure: keep the portal row, which carries the
    lodgement dates."""
    portal = fetch_tas_portal(session)
    log(f"    portal   {len(portal):5,} donations")
    reports = fetch_tas_reports(session)

    def key(r):
        return (r[COL["date_made"]], round(r[COL["amount"]] or 0, 2),
                (r[COL["donor_name"]] or "").lower(), (r[COL["recipient"]] or "").lower())

    seen = {key(r) for r in portal}
    rows = list(portal)
    dropped = 0
    for r in reports:
        k = key(r)
        if k in seen:
            dropped += 1
            continue
        seen.add(k)
        rows.append(r)
    if dropped:
        log(f"  TAS: {dropped} report rows already in the portal, dropped")
    return rows[:limit] if limit else rows


# ── ACT: Elections ACT gift returns ──────────────────────────────────────────

ACT_INDEX = "https://www.elections.act.gov.au/funding-disclosures-and-registers/gift-returns"
_ACT_YEAR_RE = re.compile(r"gift-returns/[^\"']*?(20\d\d)[^\"'/]*?(20\d\d)")


def act_year_pages(session) -> list[tuple[str, str]]:
    """[(financial_year 'YYYY-YY', url)] from the gift-returns index, oldest first."""
    html = cached_html(session, ACT_INDEX, CACHE_ROOT / "act" / "gift-returns-index.html", fresh=True)
    soup = BeautifulSoup(html, "html.parser")
    out = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = _ACT_YEAR_RE.search(href)
        if not m or "gift-returns/" not in href:
            continue
        y1, y2 = int(m.group(1)), int(m.group(2))
        if y2 != y1 + 1:
            continue
        fy = f"{y1}-{str(y2)[2:]}"
        out.setdefault(fy, href if href.startswith("http") else "https://www.elections.act.gov.au" + href)
    return sorted(out.items())


def _act_header_map(header_cells: list[str]) -> dict | None:
    idx = {}
    for i, h in enumerate(header_cells):
        hl = h.lower()
        if hl == "from":
            idx["from"] = i
        elif "date reported" in hl:
            idx["reported"] = i
        elif "date gift received" in hl or hl == "date received":
            idx["received"] = i
        elif hl in ("amount", "total"):
            idx["amount"] = i
        elif hl == "type":
            idx["type"] = i
        elif "description" in hl:
            idx["desc"] = i
    return idx if "from" in idx and "amount" in idx else None


def parse_act_page(html: str, fy: str, url: str, unparsed: Counter) -> list[list]:
    soup = BeautifulSoup(html, "html.parser")
    rows: list[list] = []
    seen = Counter()
    for h in soup.find_all(re.compile(r"^h[2-4]$")):
        title = clean_ws(h.get_text(" "))
        m = re.match(r"Gifts received by (.+)$", title, re.I)
        if not m:
            continue
        recipient = clean_ws(m.group(1))
        table = h.find_next("table")
        nxt = h.find_next(re.compile(r"^h[2-4]$"))
        if table is None or (nxt is not None and nxt.sourceline and table.sourceline and nxt.sourceline < table.sourceline):
            unparsed[f"{fy}: heading without table ({recipient})"] += 1
            continue
        trs = table.find_all("tr")
        if not trs:
            continue
        hdr = _act_header_map([clean_ws(c.get_text(" ")) for c in trs[0].find_all(["th", "td"])])
        if not hdr:
            unparsed[f"{fy}: unknown table header for {recipient}"] += 1
            continue
        party = party_of(recipient)
        looks_person = "," in recipient and not party
        rtype = "candidate" if (looks_person or re.search(r"\bindependent\b", recipient, re.I)) else None
        for tr in trs[1:]:
            tds = tr.find_all(["td", "th"])
            if len(tds) <= max(hdr.values()):
                if clean_ws(tr.get_text(" ")):
                    unparsed[f"{fy}: short row"] += 1
                continue
            lines = cell_lines(tds[hdr["from"]])
            if not lines:
                unparsed[f"{fy}: empty donor"] += 1
                continue
            donor, addr = lines[0], lines[1:]
            amount = parse_amount(clean_ws(tds[hdr["amount"]].get_text(" ")))
            if amount is None:
                unparsed[f"{fy}: unparsed amount"] += 1
                log(f"    ACT {fy} {recipient}: cannot read amount in {[clean_ws(t.get_text(' ')) for t in tds]}")
                continue
            received = parse_date(clean_ws(tds[hdr["received"]].get_text(" ")), ["dmy_slash", "dmy_slash2", "iso"]) if "received" in hdr else None
            reported = parse_date(clean_ws(tds[hdr["reported"]].get_text(" ")), ["dmy_slash", "dmy_slash2", "iso"]) if "reported" in hdr else None
            gtype = clean_ws(tds[hdr["type"]].get_text(" ")).lower() if "type" in hdr else ""
            dtype = "in-kind" if "kind" in gtype else "gift" if "money" in gtype or not gtype else gtype
            desc = clean_ws(tds[hdr["desc"]].get_text(" ")) if "desc" in hdr else ""
            suburb, state, pc = split_address(addr)
            key = (recipient, donor, received, amount, dtype, desc)
            seen[key] += 1
            rec_id = _hash(fy, *key, seen[key])
            rows.append(_row("act", "act_eact", rec_id, donor, recipient, amount, received, reported,
                             dtype, None, None, None, None, url, suburb=suburb, state=state, postcode=pc))
            finish(rows, recipient_type=rtype, party=party, financial_year=fy)
    return rows


def fetch_act(session, limit: int = 0) -> list[list]:
    pages = act_year_pages(session)
    log(f"  ACT: {len(pages)} financial-year pages ({pages[0][0]} to {pages[-1][0]})")
    this_fy = au_financial_year(datetime.now().strftime("%Y-%m-%d"))
    rows: list[list] = []
    unparsed: Counter = Counter()
    for fy, url in pages:
        fresh = fy >= au_financial_year(f"{int(this_fy[:4]) - 1}-07-01")  # current and previous FY still move
        html = cached_html(session, url, CACHE_ROOT / "act" / f"gift-returns-{fy}.html", fresh=fresh)
        got = parse_act_page(html, fy, url, unparsed)
        log(f"    {fy}: {len(got):,} gifts")
        rows.extend(got)
        if limit and len(rows) >= limit:
            break
    if unparsed:
        log(f"  ACT rows not parsed: {json.dumps(dict(unparsed))}")
    return rows


# ── NT: NTEC published returns via the Wayback Machine ───────────────────────

NT_BASE = "https://ntec.nt.gov.au/financial-disclosure/"
NT_ANNUAL_INDEX = NT_BASE + "published-annual-returns"
NT_ELECTION_INDEX = NT_BASE + "published-election-returns"
WAYBACK = "https://web.archive.org/web/{ts}id_/{url}"
WAYBACK_TS = "20260901"  # closest raw capture to this date (Nov 2025 - Aug 2026 exist)

_NT_TABLE_KIND = re.compile(
    r"^(?P<who>.+?)\s+-\s*(?P<kind>gifts received|donations totalling|donations of|receipts of|receipts)\b", re.I)
_NT_SECTION = re.compile(r"^(political parties|candidates|associated entities|third[- ]party campaigners|donors|"
                         r"members|broadcasters|publishers)\b", re.I)


def wayback_html(session, url: str, cache_name: str, fresh: bool) -> str:
    return cached_html(session, WAYBACK.format(ts=WAYBACK_TS, url=url), CACHE_ROOT / "nt" / cache_name, fresh=fresh)


def nt_pages(session) -> list[dict]:
    """Annual-return and election-return pages, discovered from the two index pages."""
    pages = {}
    for idx_url, kind in ((NT_ANNUAL_INDEX, "annual"), (NT_ELECTION_INDEX, "election")):
        soup = BeautifulSoup(wayback_html(session, idx_url, f"index-{kind}.html", fresh=True), "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"].split("?")[0].rstrip("/")
            href = re.sub(r"^https?://web\.archive\.org/web/\d+(?:id_)?/", "", href)
            if kind == "annual":
                m = re.search(r"/published-annual-returns/(\d{4})-(\d{4})-annual-returns(-gifts)?$", href)
                if not m:
                    continue
                fy = f"{m.group(1)}-{m.group(2)[2:]}"
                pages[href] = {"url": href, "kind": "annual", "fy": fy, "gifts_page": bool(m.group(3)),
                               "label": clean_ws(a.get_text(" ")) or fy}
            else:
                m = re.search(r"/published-election-returns/election-returns/([a-z0-9-]+)$", href)
                if not m:
                    continue
                pages[href] = {"url": href, "kind": "election", "fy": None, "gifts_page": False,
                               "label": clean_ws(a.get_text(" ")) or m.group(1)}
    # Where a FY has a dedicated gifts page, the plain annual page's "Receipts of
    # $1500 or more" tables would repeat the same money as receipts: keep gifts only.
    gift_fys = {p["fy"] for p in pages.values() if p["kind"] == "annual" and p["gifts_page"]}
    out = [p for p in pages.values() if not (p["kind"] == "annual" and not p["gifts_page"] and p["fy"] in gift_fys)]
    return sorted(out, key=lambda p: (p["kind"], p["fy"] or "", p["url"]))


def _nt_header_map(cells: list[str]) -> dict | None:
    idx = {}
    for i, h in enumerate(cells):
        hl = h.lower()
        if hl in ("received from", "donor", "name", "from", "received from / donor"):
            idx.setdefault("from", i)
        elif hl == "address":
            idx["addr"] = i
        elif "type" in hl:
            idx["type"] = i
        elif hl in ("amount", "value", "total", "amount received"):
            idx["amount"] = i
        elif "date" in hl:
            idx["date"] = i
    return idx if "from" in idx and "amount" in idx else None


def _nt_election_fy(soup, label: str) -> str | None:
    """FY of an election return: the gift aggregation period's end date, else the
    election year (Territory elections are held in August)."""
    for h in soup.find_all(re.compile(r"^h[2-5]$")):
        t = clean_ws(h.get_text(" "))
        m = re.search(r"aggregation period:.*?-\s*(\d{1,2} \w+ \d{4})", t, re.I)
        if m:
            end = parse_date(m.group(1), ["d_month_y", "d_mon_y"])
            if end:
                return au_financial_year(end)
    m = re.search(r"\b(20\d\d)\b", label)
    return au_financial_year(f"{m.group(1)}-08-01") if m else None


def parse_nt_page(html: str, page: dict, unparsed: Counter) -> list[list]:
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main") or soup
    election = page["label"] if page["kind"] == "election" else None
    fy = page["fy"] or _nt_election_fy(soup, page["label"])
    url = page["url"]
    rows: list[list] = []
    seen = Counter()
    section = None
    candidate_party: dict[str, str] = {}
    for h in main.find_all(re.compile(r"^h[2-5]$")):
        title = clean_ws(h.get_text(" "))
        sec = _NT_SECTION.match(title)
        if sec and " - " not in title:
            section = sec.group(1).lower()
            continue
        table = h.find_next("table")
        nxt = h.find_next(re.compile(r"^h[2-5]$"))
        if table is None or (nxt is not None and nxt.sourceline and table.sourceline and nxt.sourceline < table.sourceline):
            continue
        trs = table.find_all("tr")
        if not trs:
            continue
        header = [clean_ws(c.get_text(" ")) for c in trs[0].find_all(["th", "td"])]
        if re.search(r"return details$", title, re.I) and "Name" in header and any(h_.startswith("Party") for h_ in header):
            ni, pi = header.index("Name"), next(i for i, h_ in enumerate(header) if h_.startswith("Party"))
            for tr in trs[1:]:
                tds = [clean_ws(c.get_text(" ")) for c in tr.find_all(["td", "th"])]
                if len(tds) > max(ni, pi) and tds[ni]:
                    candidate_party[tds[ni].lower()] = tds[pi]
            continue
        m = _NT_TABLE_KIND.match(title)
        if not m or re.search(r"debts|expenditure|summar", title, re.I):
            continue
        recipient = clean_ws(m.group("who"))
        kind = m.group("kind").lower()
        hdr = _nt_header_map(header)
        if not hdr:
            unparsed[f"{page['label']}: unknown header {header}"] += 1
            continue
        heading_type = "receipt" if kind.startswith("receipt") else "gift"
        sec_name = section or ""
        if sec_name.startswith("candidates") or sec_name.startswith("members"):
            rtype, party = "candidate", party_of(candidate_party.get(recipient.lower()))
        elif sec_name.startswith("political parties") or not sec_name:
            rtype, party = "party", party_of(recipient)
        elif sec_name.startswith("donors"):
            continue  # donor-side returns repeat the recipients' rows
        else:
            rtype, party = "other", None
        for tr in trs[1:]:
            tds = tr.find_all(["td", "th"])
            if len(tds) <= max(hdr.values()):
                if clean_ws(tr.get_text(" ")):
                    unparsed[f"{page['label']}: short row"] += 1
                continue
            donor_lines = cell_lines(tds[hdr["from"]])
            if not donor_lines:
                unparsed[f"{page['label']}: empty donor"] += 1
                continue
            donor = donor_lines[0]
            if donor.lower() in ("total", "totals", "nil", "nil return", "none"):
                continue
            amount = parse_amount(clean_ws(tds[hdr["amount"]].get_text(" ")))
            if amount is None:
                unparsed[f"{page['label']}: unparsed amount"] += 1
                log(f"    NT {page['label']} {recipient}: cannot read amount in {[clean_ws(t.get_text(' ')) for t in tds]}")
                continue
            addr = cell_lines(tds[hdr["addr"]]) if "addr" in hdr else donor_lines[1:]
            suburb, state, pc = split_address(addr)
            rt = clean_ws(tds[hdr["type"]].get_text(" ")).lower() if "type" in hdr else ""
            if rt:
                dtype = ("in-kind" if "kind" in rt else "gift" if "gift" in rt or "donation" in rt
                         else "loan" if "loan" in rt else "receipt" if "receipt" in rt else rt)
            else:
                dtype = heading_type
            date_made = parse_date(clean_ws(tds[hdr["date"]].get_text(" ")), ["dmy_slash", "d_mon_y", "d_month_y", "iso"]) if "date" in hdr else None
            key = (url, recipient, donor, amount, dtype)
            seen[key] += 1
            rows.append(_row("nt", "nt_ntec", _hash(*key, seen[key]), donor, recipient, amount, date_made, None,
                             dtype, election, None, None, None, url, suburb=suburb, state=state, postcode=pc))
            finish(rows, recipient_type=rtype, party=party, financial_year=fy)
    return rows


def fetch_nt(session, limit: int = 0) -> list[list]:
    pages = nt_pages(session)
    log(f"  NT: {len(pages)} return pages via the Wayback Machine")
    rows: list[list] = []
    unparsed: Counter = Counter()
    this_year = datetime.now().year
    for p in pages:
        slug = p["url"].rstrip("/").rsplit("/", 1)[-1]
        fresh = bool(p["fy"] and int(p["fy"][:4]) >= this_year - 2) or (p["kind"] == "election" and str(this_year) in p["label"])
        try:
            html = wayback_html(session, p["url"], f"{p['kind']}-{slug}.html", fresh=fresh)
        except Exception as exc:  # a page with no capture is logged, not fatal
            log(f"    NT {p['label']}: not fetched ({exc})")
            unparsed[f"{p['label']}: page not fetched"] += 1
            continue
        got = parse_nt_page(html, p, unparsed)
        log(f"    {p['kind']:8} {p['label'][:48]:48} {len(got):5,} rows")
        rows.extend(got)
        if limit and len(rows) >= limit:
            break
    if unparsed:
        log(f"  NT rows not parsed: {json.dumps(dict(unparsed))}")
    return rows


FETCHERS = {"tas": fetch_tas, "act": fetch_act, "nt": fetch_nt}
SOURCE_KEY = {"tas": "tas_tec", "act": "act_eact", "nt": "nt_ntec"}


def summarise(rows: list[list]) -> dict:
    dates = [r[COL["date_made"]] or r[COL["date_received"]] for r in rows]
    dates = [d for d in dates if d]
    fys = sorted({r[COL["financial_year"]] for r in rows if r[COL["financial_year"]]})
    return {
        "rows": len(rows),
        "dollars": round(sum(r[COL["amount"]] or 0 for r in rows)),
        "donors": len({(r[COL["donor_name"]] or "").lower() for r in rows}),
        "dates": [min(dates), max(dates)] if dates else None,
        "financial_years": [fys[0], fys[-1]] if fys else None,
        "with_party": sum(1 for r in rows if r[COL["recipient_party"]]),
        "disclosure_types": dict(Counter(r[COL["disclosure_type"]] for r in rows)),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="TAS / ACT / NT donation disclosures -> ext_donations")
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
        n_ind = sum(1 for r in rows if r[COL["industry"]])
        log(f"  {len(rows):,} rows; industry classified (keyword pass): {n_ind:,} "
            f"({(n_ind / len(rows) * 100) if rows else 0:.0f}%)")
        log(f"  {json.dumps(summarise(rows))}")
        res = writer.replace("ext_donations", DDL, COLUMNS, rows, source=SOURCE_KEY[src],
                             notes=f"limit={args.limit}" if args.limit else None)
        summary[src] = res
    log("\nSummary: " + json.dumps(summary, default=str))


if __name__ == "__main__":
    main()
