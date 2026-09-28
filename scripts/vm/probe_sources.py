#!/usr/bin/env python3
"""Can THIS machine reach every source the nightly refresh reads?

    ~/opax/.venv/bin/python scripts/vm/probe_sources.py          # run it on the VM before cutover
    ~/opax/.venv/bin/python scripts/vm/probe_sources.py --only nsw,vic

One small request per source, with the same host, path shape and User-Agent as the fetcher
that uses it, so a datacenter IP that a WAF refuses shows up here rather than as a red
nightly. A source is OK if it answers with the kind of body the fetcher parses, BLOCKED if it
answers 403/429/503 or serves a bot challenge page (Cloudflare, Azure Front Door, Incapsula),
DOWN on a network error or timeout, CHECK if it answered but not with the expected shape.

Reads OPENAUSTRALIA_API_KEY, TVFY_API_KEY and the ARAG_* values from ~/opax/.env (never printed).
Exit status: number of BLOCKED/DOWN sources among those the refresh needs. `sa` (Hansard) and the SA lobbyist
site are expected to fail (their WAF refuses every non-browser client) and do not count.

The second half of the list covers the daily additions (releases, AusTender full feed, GrantConnect) and the
weekly and monthly groups run by scripts/weekly_refresh.sh (docs/operations/periodic-refresh.md section 4).
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

REPO = Path(os.environ["OPAX_REPO"]) if os.environ.get("OPAX_REPO") else Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))


def load_env() -> None:
    p = REPO / ".env"
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
QLD_UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
          "Chrome/128.0.0.0 Safari/537.36 OPAX/1.0 (+https://opax.com.au)")
CHALLENGE_MARKERS = ("just a moment", "cf-chl", "attention required", "_incapsula_", "request unsuccessful",
                     "enable javascript", "access denied", "azure front door", "errors.edgesuite", "captcha")


ORG_UA = "OPAX research (opax.com.au)"                                   # words_common.USER_AGENT
EXT_UA = "OPAX research (opax.com.au; contact jake.tracey@noice.work)"    # ext_common.USER_AGENT
RES_UA = "OPAX research (https://opax.com.au; contact jake.tracey@noice.work)"


def clean(r) -> bool:
    """No bot-challenge marker in the first 6 KB of the body."""
    body = (r.text or "")[:6000].lower()
    return not any(m in body for m in CHALLENGE_MARKERS)


def page_ok(*statuses, needle=None):
    """A page the loader reads as HTML/XML: one of the statuses (200 by default), no challenge, optional needle."""
    def ok(r):
        return r.status_code in (statuses or (200,)) and clean(r) and (needle is None or needle in (r.text or "").lower())
    return ok


def json_of(r):
    try:
        return r.json()
    except ValueError:
        return None


def probes() -> list[dict]:
    oa = os.environ.get("OPENAUSTRALIA_API_KEY", "")
    tvfy = os.environ.get("TVFY_API_KEY", "")
    return [
        dict(name="openaustralia", step="fed_download", ua="AutoResearch-Hansard/2.0 (async)",
             url="https://www.openaustralia.org.au/api/getDebates",
             params={"type": "representatives", "date": "2026-09-17", "output": "json", "key": oa},
             ok=lambda r: isinstance(json_of(r), (list, dict)), need_key=bool(oa), key_name="OPENAUSTRALIA_API_KEY"),
        dict(name="austender", step="austender", ua="OPAX/1.0 (parliamentary transparency research)",
             url="https://api.tenders.gov.au/ocds/findByDates/contractPublished/2026-09-20T00:00:00Z/2026-09-20T23:59:59Z",
             ok=lambda r: isinstance(json_of(r), dict) and "releases" in json_of(r)),
        dict(name="ipea (data.gov.au)", step="ipea", ua=None,
             url="https://data.gov.au/data/api/3/action/package_search",
             params={"q": "organization:ipea", "rows": 1},
             ok=lambda r: (json_of(r) or {}).get("success") is True),
        dict(name="vic", step="vic", ua="OPAX-VicHansardIngestor/1.0 (opax.com.au; research)",
             url="https://www.parliament.vic.gov.au/api/search/debate",
             params={"page": 1, "pageSize": 1, "hansard-house": "1"},
             ok=lambda r: "result" in (json_of(r) or {})),
        dict(name="qld data api", step="qld", ua=QLD_UA, url="https://data.parliament.qld.gov.au/api/members/current",
             params={"pageSize": 1}, ok=lambda r: json_of(r) is not None),
        dict(name="qld documents (PDFs)", step="qld", ua=QLD_UA, extra={"Range": "bytes=0-1023", "Accept": "application/pdf"},
             url="https://documents.parliament.qld.gov.au/events/han/2026/2026_09_16_WEEKLY.PDF",
             ok=lambda r: r.status_code in (200, 206) and r.content[:4] == b"%PDF"),
        dict(name="aph estimates schedule", step="committees", ua=FIREFOX,
             url="https://www.aph.gov.au/Parliamentary_Business/Hansard/Estimates_Transcript_Schedule",
             ok=lambda r: "stimates" in r.text),
        dict(name="parlinfo (bills)", step="bills + committees", ua=FIREFOX,
             url="https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22legislation%2Fbillhome%2Fr7464%22",
             ok=lambda r: len(r.text) > 2000 and "r7464" in r.text),
        dict(name="nsw hansard api", step="nsw", ua="Mozilla/5.0 (compatible; OPAX/1.0; +https://opax.com.au)",
             url="https://api.parliament.nsw.gov.au/api/hansard/search/year/2026",
             ok=lambda r: isinstance(json_of(r), (list, dict))),
        dict(name="nsw.gov.au releases", step="releases_nsw", ua="OPAX research (opax.com.au)", method="POST",
             url="https://www.nsw.gov.au/api/v1/elasticsearch/prod_content/_search",
             json={"size": 1, "query": {"query_string": {"query": "subtype:ministerialmediarelease"}}},
             ok=lambda r: "hits" in (json_of(r) or {})),
        dict(name="theyvoteforyou", step="tvfy_refresh", ua="OPAX research (opax.com.au; contact jake.tracey@noice.work)",
             url="https://theyvoteforyou.org.au/api/v1/people.json", params={"key": tvfy},
             ok=lambda r: isinstance(json_of(r), list), need_key=bool(tvfy), key_name="TVFY_API_KEY"),
        # --- periodic groups (docs/operations/periodic-refresh.md section 4): daily releases/AusTender/GrantConnect/votes
        dict(name="pm transcripts", step="releases", ua=ORG_UA, url="https://pmtranscripts.pmc.gov.au/query?transcript=1",
             ok=page_ok(200, 404)),
        dict(name="qld statements", step="releases", ua=ORG_UA, url="https://statements.qld.gov.au/statements/1",
             ok=page_ok(200, 404)),
        dict(name="vic premier sitemap", step="releases", ua=ORG_UA, url="https://www.premier.vic.gov.au/sitemap.xml",
             params={"page": 1}, ok=page_ok(200, needle="<loc>")),
        dict(name="treasury ministers", step="releases", ua=ORG_UA,
             url="https://ministers.treasury.gov.au/jsonapi/node/media", params={"page[limit]": 1},
             ok=lambda r: "data" in (json_of(r) or {})),
        dict(name="austender (full feed UA)", step="austender_full", ua=RES_UA,
             url="https://api.tenders.gov.au/ocds/findByDates/contractPublished/2026-09-20T00:00:00Z/2026-09-20T23:59:59Z",
             ok=lambda r: isinstance(json_of(r), dict) and "releases" in json_of(r)),
        dict(name="grantconnect (WAF?)", step="grants_fetch", ua="Mozilla/5.0 (compatible; OPAX research; +https://opax.com.au; contact jake.tracey@noice.work)",
             url="https://www.grants.gov.au/Ga/List", ok=page_ok(200, needle="grant")),
        # --- weekly
        dict(name="legislation.gov.au api", step="frl_acts", ua=ORG_UA, url="https://api.prod.legislation.gov.au/v1/titles",
             params={"$top": 1}, ok=lambda r: "value" in (json_of(r) or {})),
        dict(name="ecq disclosures (WAF?)", step="donations_qld", ua=EXT_UA, url="https://disclosures.ecq.qld.gov.au/Map",
             ok=page_ok(200)),
        dict(name="vec disclosures", step="donations_vic", ua=EXT_UA, url="https://disclosures.vec.vic.gov.au/public-donations/",
             ok=page_ok(200)),
        dict(name="tec tas disclosures", step="donations_tas", ua=EXT_UA, url="https://disclosures.tec.tas.gov.au/public-donations/",
             ok=page_ok(200)),
        dict(name="tec tas site", step="donations_tas", ua=EXT_UA,
             url="https://www.tec.tas.gov.au/disclosure-and-funding/registers-and-reports/", ok=page_ok(200)),
        dict(name="lobbyists federal api", step="lobbyists_fetch", ua=None, method="POST",
             url="https://api.lobbyists.ag.gov.au/search/organisations",
             extra={"Content-Type": "application/json", "Origin": "https://lobbyists.ag.gov.au",
                    "Referer": "https://lobbyists.ag.gov.au/"},
             json={"entity": "organisation", "query": "", "pageNumber": 1, "pagingCookie": None, "count": 1,
                   "sortCriteria": {"fieldName": "name", "sortOrder": 0}, "isDeregistered": False},
             ok=lambda r: json_of(r) is not None),
        dict(name="lobbyists federal site", step="lobbyists_fetch", ua=EXT_UA, url="https://lobbyists.ag.gov.au/register",
             ok=page_ok(200)),
        dict(name="lobbyists nsw (WAF?)", step="lobbyists_fetch", ua=EXT_UA, url="https://lobbyists.elections.nsw.gov.au/",
             ok=page_ok(200)),
        dict(name="lobbyists qld", step="lobbyists_fetch", ua=EXT_UA,
             url="https://lobbyists.integrity.qld.gov.au/Lobbying-Register/", ok=page_ok(200)),
        dict(name="lobbyists vic sitemap", step="lobbyists_fetch", ua=EXT_UA, url="https://www.lobbyists.vic.gov.au/sitemap.xml",
             ok=page_ok(200, needle="<loc>")),
        dict(name="lobbyists sa api", step="lobbyists_fetch", ua=EXT_UA,
             extra={"Origin": "https://www.lobbyists.sa.gov.au", "Referer": "https://www.lobbyists.sa.gov.au/"},
             url="https://saglobbyistapi02prdaue.azurewebsites.net/api/lobbyist",
             ok=lambda r: "$values" in (json_of(r) or {})),
        dict(name="lobbyists sa site (known WAF)", step="lobbyists_fetch", ua=EXT_UA, expected_fail=True,
             url="https://www.lobbyists.sa.gov.au/", ok=page_ok(200)),
        dict(name="lobbyists wa", step="lobbyists_fetch", ua=EXT_UA, url="https://www.lobbyists.wa.gov.au/", ok=page_ok(200)),
        dict(name="foreign influence (FITS)", step="fits_fetch", ua="OPAX/1.0 (+https://opax.com.au)",
             url="https://foreigninfluence.ag.gov.au/", ok=page_ok(200)),
        dict(name="qld members register PDF", step="interests_qld", ua=ORG_UA, extra={"Range": "bytes=0-1023", "Accept": "application/pdf"},
             url="https://documents.parliament.qld.gov.au/Assembly/Procedures/MembersRegister.pdf",
             ok=lambda r: r.status_code in (200, 206) and r.content[:4] == b"%PDF"),
        dict(name="nsw ministers diaries", step="diaries_nsw", ua=EXT_UA,
             url="https://www.nsw.gov.au/departments-and-agencies/cabinet-office/access-to-information/ministers-diary-disclosures",
             ok=page_ok(200)),
        dict(name="acnc/ato (data.gov.au)", step="acnc_ato", ua="OPAX/1.0 (+https://opax.com.au)",
             url="https://data.gov.au/data/api/3/action/package_show", params={"id": "corporate-transparency"},
             ok=lambda r: (json_of(r) or {}).get("success") is True),
        # --- monthly
        dict(name="qld open data (contracts)", step="qld_contracts", ua=EXT_UA,
             url="https://www.data.qld.gov.au/api/3/action/package_search", params={"q": "contract disclosure", "rows": 1},
             ok=lambda r: (json_of(r) or {}).get("success") is True),
        dict(name="qld cabinet diaries", step="diaries_qld", ua=EXT_UA, url="https://cabinet.qld.gov.au/ministers-portfolios.aspx",
             ok=page_ok(200, needle="ministers")),
        dict(name="wikidata sparql", step="rosters_fetch", ua="OPAX research (https://opax.com.au; contact jake.tracey@noice.work)",
             url="https://query.wikidata.org/sparql", params={"query": "SELECT ?x WHERE { BIND(1 AS ?x) }", "format": "json"},
             ok=lambda r: "results" in (json_of(r) or {})),
        dict(name="handbook api (pay)", step="x_pay", ua="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
             url="https://handbookapi.aph.gov.au/api/individuals", params={"$top": 1},
             ok=lambda r: "value" in (json_of(r) or {})),
        dict(name="openaustralia people.csv (pay)", step="x_pay", ua="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
             url="https://raw.githubusercontent.com/openaustralia/openaustralia-parser/master/data/people.csv",
             ok=lambda r: r.status_code == 200 and "," in r.text[:400]),
        dict(name="knowledge box", step="arag_sync", ua=None, kb=True),
        dict(name="sa hansard (expected to fail)", step="sa", ua=FIREFOX, expected_fail=True,
             url="https://hansardsearch.parliament.sa.gov.au/",
             ok=lambda r: r.status_code == 200 and "challenge" not in r.text.lower()),
    ]


def run_probe(p: dict) -> tuple[str, str, str]:
    """(verdict, http status, note)"""
    if p.get("kb"):
        try:
            from parli.arag import AragConfig, KbClient
            n = KbClient(AragConfig.from_env()).counters()["resources"]
            return "OK", "200", f"{n:,} resources"
        except Exception as e:  # noqa: BLE001
            return "DOWN", "-", f"{type(e).__name__}: {str(e)[:80]}"
    if "need_key" in p and not p["need_key"]:
        return "CHECK", "-", f"{p['key_name']} is not set in ~/opax/.env"
    headers = {"Accept": "application/json, text/html;q=0.8"}
    if p["ua"]:
        headers["User-Agent"] = p["ua"]
    headers.update(p.get("extra", {}))
    t0 = time.time()
    try:
        r = requests.request(p.get("method", "GET"), p["url"], params=p.get("params"), json=p.get("json"),
                             headers=headers, timeout=25, allow_redirects=True)
    except requests.RequestException as e:
        return "DOWN", "-", f"{type(e).__name__}: {str(e)[:80]}"
    took = f"{time.time() - t0:.1f}s"
    body = (r.text or "")[:6000].lower()
    server = r.headers.get("server", "") or ("azure front door" if "x-azure-ref" in r.headers else "")
    if r.status_code in (403, 429, 503) or any(m in body for m in CHALLENGE_MARKERS) and not p["ok"](r):
        return "BLOCKED", str(r.status_code), f"{server or 'no server header'}; {took}"
    try:
        good = p["ok"](r)
    except Exception:  # noqa: BLE001
        good = False
    if good:
        return "OK", str(r.status_code), took
    return "CHECK", str(r.status_code), f"answered, but not in the shape the fetcher parses; {server}; {took}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--only", help="comma-separated substrings of source names")
    args = ap.parse_args()
    load_env()
    want = [w.strip().lower() for w in (args.only or "").split(",") if w.strip()]
    try:
        ip = requests.get("https://api.ipify.org", timeout=10).text
    except requests.RequestException:
        ip = "public IP unknown"
    print(f"probing from {os.uname().nodename} ({ip})")
    print(f"{'source':<32}{'step':<20}{'result':<9}{'http':<6}note")
    bad = 0
    for p in probes():
        if want and not any(w in p["name"].lower() for w in want):
            continue
        verdict, status, note = run_probe(p)
        if p.get("expected_fail"):
            note = f"({verdict.lower()}; failing is normal) {note}"
        elif verdict in ("BLOCKED", "DOWN"):
            bad += 1
        print(f"{p['name']:<32}{p['step']:<20}{verdict:<9}{status:<6}{note}")
    print("\nBLOCKED = a WAF refused this machine's address or client. See docs/operations/nightly-refresh.md, "
          "'Sources that may refuse a datacenter IP'.")
    return bad


if __name__ == "__main__":
    sys.exit(main())
