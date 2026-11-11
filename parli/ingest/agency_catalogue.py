"""Catalogues of tabled agency annual reports, read with the OPAXBot identity only.

Source policy (docs/SOURCES-ACCESS.md): every request goes through the integrity
``common.Client`` (one OPAXBot identity, robots.txt checked, paced per host, no proxy, no
browser identity). A host that refuses the agent is recorded as refused, for the
maintainer; nothing tries another route.

  python -m parli.ingest.agency_catalogue vic   [--year 2025-26 --since 2026-07-01 --until 2026-11-11]
  python -m parli.ingest.agency_catalogue probe   # record which catalogue hosts answer OPAXBot
  python -m parli.ingest.agency_catalogue fetch --catalogue <file> [--only <report ids>] [--limit N]

``vic`` searches the Parliament of Victoria's tabled documents database (the same API the
IBAC adapter reads) for papers it types as annual reports, titled for the reporting year and
tabled or released in the window, and writes ``data/agency-reports/catalogue-vic-<until>.json``: one row per paper
with the authoring agency as the database records it, the title, the date and the PDF
link. Rows already held in an intake (same agency and year) are marked ``held``.

``fetch`` downloads the PDFs of chosen catalogue rows (OPAXBot, cached outside git) and
writes an intake manifest that ``python -m parli.ingest.agency_reports stage`` reads, so a
fetched file goes through the same SHA-256, page-count and edition handling as a manual
intake. Its rows say ``acquisition: "OPAXBot fetch"``.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit

from parli.ingest import agency_reports as ar
from parli.ingest.integrity import common

PV = "https://www.parliament.vic.gov.au"
SEARCH = PV + "/api/search/tabledpapers"
DETAIL = PV + "/parliamentary-activity/tabled-documents-database/tabled-document-details/"
VIC = common.Body(code="agency_catalogue_vic", name="Parliament of Victoria tabled documents", short="Vic tabled papers",
                  jurisdiction="Vic", site=PV, interval=2.0, max_requests=900)
YEAR = re.compile(r"\b(20\d\d)\s*[-–/]\s*(\d\d)(?!\d)")
# catalogue hosts named in the intake manifest; probe asks each for robots.txt and its catalogue page once
PROBES = {
    "NSW": "https://www.parliament.nsw.gov.au/parliamentary-business/tabled-papers",
    "Vic": PV + "/tabled-documents-database",
    "Qld": "https://www.parliament.qld.gov.au/Work-of-the-Assembly/Tabled-Papers/search?timeframeId=-1",
    "WA": "https://www.parliament.wa.gov.au/Test/Tables.nsf/ScreenLCTabledPapersByTabledPaperDate",
    "SA": "https://www.parliament.sa.gov.au/en/House-of-Assembly/Tabled-Papers-and-Petitions",
    "Tas": "https://www.parliament.tas.gov.au/house-of-assembly/tabled-papers/house-of-assembly-tabled-papers-2026",
    "ACT": "https://www.act.gov.au/open/annual_reports",
    "NT": "https://parliament.nt.gov.au/business/tabled-papers",
}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def iso(text):
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text or "")
    months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
    if not m or m.group(2).lower() not in months:
        return None
    return f"{int(m.group(3)):04d}-{months.index(m.group(2).lower()) + 1:02d}-{int(m.group(1)):02d}"


def reporting_year(title):
    m = YEAR.search(title or "")
    return f"{m.group(1)}-{m.group(2)}" if m else None


def held_keys():
    return {(r["jurisdiction"], ar.slug(r["agency"]), r["reporting_year"]) for r in ar.intake_rows().values()}


def vic(args):
    client = common.Client(VIC)
    hits, page, total = {}, 1, None
    try:
        while page <= args.max_pages:
            # The API ignores its sort and date parameters (checked 11 Nov 2026); the document-type filter
            # (49 = annual reports) and the reporting year as a term select the year's papers.
            url = SEARCH + "?" + urlencode({"page": page, "pageSize": 100, "sortType": 30, "tabled-type": "49", "term": args.year})
            body = client.get(url, "html")
            if body is None:
                break
            result = json.loads(body).get("result") or {}
            total = result.get("totalMatching", total)
            batch = result.get("hits") or []
            for h in batch:
                hits[h["id"]] = h
            if not batch or len(hits) >= (total or 0):
                break
            page += 1
    except common.Held as e:
        print(f"[agency_catalogue] held: {e}", file=sys.stderr)
        return 4
    held = held_keys()
    rows = []
    for h in hits.values():
        c = h.get("content") or {}
        title = common.clean(c.get("title")) or ""
        when = iso(c.get("context"))
        if not when or not (args.since <= when <= args.until) or reporting_year(title) != args.year:
            continue
        files = [f for f in ((c.get("slot") or {}).get("context") or {}).get("files") or [] if f.get("type") == "pdf"]
        agency = common.clean(c.get("subtitle")) or None
        year = reporting_year(title)
        pid = int(h["id"].rsplit("_", 1)[1])
        # "Report 2025-26" is the agency's annual report; "Report 2025-26 under s 30L of ..." is a statutory report
        kind = "annual_report" if re.fullmatch(r"(?:annual\s+)?report\s+" + re.escape(year or "") + r"(?:\s*\(.*\))?", title, re.I) else "statutory_report"
        rows.append({"paper_id": pid, "agency": agency, "title": title, "kind": kind, "reporting_year": year, "date": when,
                     "date_basis": (c.get("context") or "").split(":")[0].strip().lower() or None,
                     "act": common.clean(c.get("description")) or None, "detail_url": DETAIL + str(pid),
                     "pdf_urls": [f["path"] for f in files], "pdf_bytes": [int(f.get("size") or 0) for f in files],
                     "held": bool(agency and year and ("VIC", ar.slug(agency), year) in held)})
    rows.sort(key=lambda r: (r["date"], r["paper_id"]), reverse=True)
    out = ar.DATA / f"catalogue-vic-{args.until}.json"
    out.write_text(json.dumps({"source": SEARCH, "filter": {"tabled-type": "49 (annual reports)", "term": args.year}, "window": [args.since, args.until], "fetched_at": now(),
                               "total_matching": total, "hits_read": len(hits), "requests": client.count,
                               "note": f"Papers the database types as annual reports, titled for {args.year}, tabled or released in the window. "
                                       "Not a roster of every reporting body: an agency that tables late or under another title is not here.",
                               "rows": rows}, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"catalogue": str(out.relative_to(ar.ROOT)), "rows": len(rows), "annual_reports": sum(r["kind"] == "annual_report" for r in rows), "held": sum(r["held"] for r in rows),
                      "without_pdf": sum(not r["pdf_urls"] for r in rows), "requests": client.count}))
    return 0


def probe(args):
    """One robots.txt and one catalogue GET per host, recorded with the status OPAXBot got."""
    out = []
    for jur, url in PROBES.items():
        host = urlsplit(url).hostname
        body = common.Body(code=f"agency_probe_{jur.lower()}", name=host, short=host, jurisdiction=jur, site=f"https://{host}", interval=2.0, max_requests=4)
        client = common.Client(body)
        try:
            page = client.get(url, "html")
            status = "answered" if page is not None else "missing or robots-disallowed"
        except (Exception, SystemExit) as e:  # SourceRefused, Held, network errors: record and move on
            status = f"refused or failed: {type(e).__name__}: {str(e)[:200]}"
        out.append({"jurisdiction": jur, "url": url, "result": status, "log": client.log, "at": now()})
        print(f"{jur}: {status}")
    path = ar.DATA / f"catalogue-probe-{date.today().isoformat()}.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    return 0


def fetch(args):
    cat = json.loads(Path(args.catalogue).read_text())
    client = common.Client(VIC)
    wanted = set(args.only or [])
    rows = [r for r in cat["rows"] if r.get("kind") == "annual_report" and not r["held"] and r["pdf_urls"] and r["agency"] and r["reporting_year"]
            and (not wanted or str(r["paper_id"]) in wanted)]
    rows = rows[: args.limit] if args.limit else rows
    reports, seen = [], set()
    for r in rows:
        # the report is the largest file that is not the tabling letter
        files = [(u, b) for u, b in zip(r["pdf_urls"], r["pdf_bytes"]) if "letter" not in u.rsplit("/", 1)[-1].lower()] or list(zip(r["pdf_urls"], r["pdf_bytes"]))
        url = max(files, key=lambda f: f[1])[0]
        try:
            body = client.get(url, "pdf")
        except common.Held as e:
            print(f"[agency_catalogue] held at paper {r['paper_id']}: {e}", file=sys.stderr)
            break
        if body is None:
            print(f"[agency_catalogue] paper {r['paper_id']}: no PDF", file=sys.stderr)
            continue
        path = client.cache / (client._key(common._quote(url)) + ".pdf")
        key = (ar.slug(r["agency"]), r["reporting_year"])
        if key in seen:
            continue
        seen.add(key)
        pages = len(common.pdf_pages(body, ar.CACHE))
        reports.append({"jurisdiction": "VIC", "agency": r["agency"], "reporting_year": r["reporting_year"], "document_kind": "annual report",
                        "path": str(path), "source_url": url, "catalogue_url": r["detail_url"], "bytes": len(body), "pages": pages,
                        "sha256": hashlib.sha256(body).hexdigest(), "acquisition": "OPAXBot fetch",
                        "tabled": {"date": r["date"], "basis": r["date_basis"], "paper_id": r["paper_id"]}})
    manifest = {"as_of": args.as_of, "batch": args.batch, "scope": f"Victorian annual reports tabled {cat['window'][0]} to {cat['window'][1]}, fetched from the Parliament of Victoria's tabled copies with OPAXBot.",
                "reporting_body_roster": {"source_url": SEARCH, "as_at": cat["window"][1], "use": "Tabled papers search, not a full roster."},
                "catalogues": [{"jurisdiction": "VIC", "primary": PV + "/tabled-documents-database", "format": "Parliament tabled originals"}],
                "reports": reports}
    out = Path(args.out)
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"manifest": str(out), "documents": len(reports), "requests": client.count}))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("vic")
    v.add_argument("--since", default="2026-07-01")
    v.add_argument("--until", default=date.today().isoformat())
    v.add_argument("--year", default="2025-26")
    v.add_argument("--max-pages", type=int, default=12)
    sub.add_parser("probe")
    f = sub.add_parser("fetch")
    f.add_argument("--catalogue", required=True)
    f.add_argument("--only", nargs="*")
    f.add_argument("--limit", type=int)
    f.add_argument("--as-of", default=date.today().isoformat())
    f.add_argument("--batch", default="vic-tabled")
    f.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    return {"vic": vic, "probe": probe, "fetch": fetch}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
