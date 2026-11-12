"""Commonwealth annual report data from the Transparency Portal (Department of Finance).

Source: https://www.transparency.gov.au, whose own front end reads a public content
delivery API at previewapi.transparency.gov.au/delivery (production, despite the host
name). The API holds each Commonwealth entity's and company's annual report and, from
2022-23, the mandatory PGPA Rule disclosures as typed tables: key management personnel
remuneration by name and position, senior executive and other highly paid staff in
bands, ongoing and non-ongoing staff numbers, reportable consultancy and
non-consultancy contract spend (with the organisations receiving it), and the
statement of comprehensive income.

Phases:
  fetch   paginated, paced GETs through the shared honest client into a raw cache
          outside git (~/.cache/autoresearch/transparency/raw/<stamp>/)
  build   normalise the newest complete raw run into a snapshot (no requests)

`scripts/export_annual_reports.py` writes the public projection from the snapshot.

Only items whose workflow step is `published` are used. Test and training bodies
are excluded. Values are kept as published (text in the source); numbers are parsed
only when the whole cell is a number, otherwise the cell stays text and the number is
null. Nothing is summed across tables, bodies or years.

Exit 3 keeps the last good snapshot when a completeness or shrink guard fails;
exit 4 (from parli.ingest.http) when the source refuses the agent.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlencode

from parli.ingest import http as source_http

API = "https://previewapi.transparency.gov.au/delivery/items"
SITE = "https://www.transparency.gov.au"
SOURCE_NAME = "transparency_portal"
CACHE = Path(os.environ.get("OPAX_TRANSPARENCY_CACHE", "~/.cache/autoresearch/transparency")).expanduser()
PAGE = 100
INTERVAL = 1.5  # seconds between requests to the API host
MAX_REQUESTS = 1500
SNAPSHOT_SCHEMA = 1
LICENCE_NCE = {"status": "cc-by-4.0", "url": "https://creativecommons.org/licenses/by/4.0/",
               "attribution": "Commonwealth of Australia, Transparency Portal (Department of Finance)"}
LICENCE_OWN = {"status": "entity-copyright", "url": SITE + "/copyright",
               "attribution": "Published by the entity on the Transparency Portal; copyright remains with the entity"}

# Table families. Each family lists the content types that carry it (the Portal adds
# year-specific variants, e.g. *_24), and the row fields in source order.
KMP_FIELDS = ["name_", "position_title", "base_salary", "bonuses", "other_benefits_and_allowances",
              "superannuation_contributions", "long_service_leave", "other_long_term_benefits",
              "termination_benefits", "total_remunerations"]
FAMILIES = {
    "kmp": ["dt_remuneration_key_management_personnel_nce", "dt_remuneration_for_key_management_personnel_cce",
            "dt_remuneration_for_key_management_personnel_cc"],
    "senior_executives": ["dt_remuneration_senior_executives_nce", "dt_remuneration_senior_executives_cce"],
    "highly_paid": ["dt_remuneration_high_paid_staff_nce", "dt_remuneration_for_highly_paid_staff_cce"],
    "consultancy": ["dt_expenditure_reportable_consultancy_contracts"],
    "non_consultancy": ["dt_expenditure_reportable_non_consultancy_contracts"],
    "consultancy_orgs": ["dt_orgs_receiving_consultancy_contract_expenditure"],
    "non_consultancy_orgs": ["dt_orgs_receiving_non_consultancy_contract_expenditure"],
    "ongoing": ["dt_all_ongoing_employees_nce", "dt_all_ongoing_employees_cce", "dt_all_ongoing_employees_cc"],
    "non_ongoing": ["dt_all_non_ongoing_employees_nce", "dt_all_non_ongoing_employees_cce", "dt_all_non_ongoing_employees_cc"],
    "income": ["dt_extract_statement_comprehensive_income_nce", "dt_extract_statement_comprehensive_income_cce",
               "dt_extract_statement_comprehensive_income_cc", "dt_extract_dept_statement_comp_income_nce_24",
               "dt_extract_dept_statement_comp_income_cce_24", "dt_extract_statement_comp_income_cc_24"],
}
TEST_BODY = re.compile(r"\b(test|testing|training)\b|portfolio of stephen", re.I)
YEAR = re.compile(r"^(\d{4})-(\d{2})$")
NUMBER = re.compile(r"^-?\$?\(?-?[\d,]+(?:\.\d+)?\)?$")


class Held(SystemExit):
    def __init__(self, reason):
        print(f"[transparency_portal] HELD: {reason}; last good snapshot kept", flush=True)
        super().__init__(3)


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def atomic_json(path: Path, value, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":")) + "\n")
    os.replace(tmp, path)


# ---- fetch ------------------------------------------------------------------------------

class Fetcher:
    def __init__(self, out: Path, max_requests=MAX_REQUESTS):
        self.out = out
        self.session = source_http.Session()
        self.count = 0
        self.max = max_requests

    def get(self, params: dict):
        if self.count >= self.max:
            raise Held(f"request budget of {self.max} reached before the run completed")
        url = API + "?" + urlencode(params, safe=",")
        source_http.pace(url, INTERVAL)
        self.count += 1
        response = self.session.get(url, expected_json=True, allow_redirects=False)
        if response.status_code != 200:
            raise Held(f"HTTP {response.status_code} for {url}")
        body = response.json()
        if isinstance(body, str):  # the Portal's proxy returns the delivery JSON as a JSON string
            body = json.loads(body)
        if not isinstance(body, dict) or "items" not in body:
            raise Held(f"unexpected response shape for {url}")
        return url, body

    def paged(self, name: str, params: dict):
        """Every page of one query, saved as raw/<name>-<n>.json; returns the item count."""
        skip, n, total = 0, 0, None
        while True:
            url, body = self.get({**params, "limit": PAGE, "skip": skip, "includeTotalCount": "true"})
            atomic_json(self.out / f"{name}-{n:04d}.json", {"url": url, "fetched_at": now(), "body": body})
            items = body.get("items") or []
            total = (body.get("pagination") or {}).get("total_count", total)
            n += 1
            skip += len(items)
            if not items or len(items) < PAGE or (total is not None and skip >= total):
                break
        if total is not None and skip != total:
            raise Held(f"{name}: received {skip} items but the source reports {total}")
        return skip


def fetch(args):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = CACHE / "raw" / stamp
    out.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("OPAX_SOURCE_NAME", SOURCE_NAME)
    f = Fetcher(out, args.max_requests)
    counts = {}
    counts["government_body"] = f.paged("government_body", {"system.type": "government_body", "depth": 0,
        "elements": "body_name,body_type,web_url,url,annual_reports,status_text,status_date,acronyms,current_portfolio_codename"})
    counts["portfolio_metadata"] = f.paged("portfolio_metadata", {"system.type": "portfolio_metadata", "depth": 0,
        "elements": "portfolio_name,web_url,status_text,entities,leading_entity,active_during"})
    counts["annual_report"] = f.paged("annual_report", {"system.type": "annual_report", "depth": 0,
        "elements": "title,web_url,reporting_period,performance_data,validation_messages"})
    for family, types in FAMILIES.items():
        counts[family] = f.paged(family, {"system.type[in]": ",".join(types), "depth": 1})
    manifest = {"schema": SNAPSHOT_SCHEMA, "fetched_at": now(), "requests": f.count, "counts": counts, "complete": True}
    atomic_json(out / "manifest.json", manifest, indent=2)
    print(f"[transparency_portal] fetched {sum(counts.values())} items in {f.count} requests -> {out}", flush=True)
    for k, v in counts.items():
        print(f"  {k}: {v}")


# ---- build ------------------------------------------------------------------------------

def latest_run() -> Path:
    runs = sorted(p for p in (CACHE / "raw").glob("*") if (p / "manifest.json").exists()
                  and json.loads((p / "manifest.json").read_text()).get("complete"))
    if not runs:
        raise Held("no complete raw run in the cache")
    return runs[-1]


def load(run: Path, name: str):
    items, modular, urls = [], {}, []
    for page in sorted(run.glob(f"{name}-*.json")):
        raw = json.loads(page.read_text())
        urls.append(raw["url"])
        items.extend(raw["body"].get("items") or [])
        modular.update(raw["body"].get("modular_content") or {})
    return items, modular


def clean(value):
    if value is None:
        return None
    if isinstance(value, str):
        text = re.sub(r"[\s ​]+", " ", value).strip()
        return text or None
    return value


# Footnote references that entities attach to a person's name in their tables: "Christine Holgate1",
# "Jane Cutler 1", "Nell Greenwood*", "Adrian Collette AM\u00b9", "Brian Hickey[1]", "Jenet Connell(d)".
FOOTNOTE_MARK = re.compile(r"[\s\ufeff]*(?:[*^#\u2020\u2021]+|[\u00b9\u00b2\u00b3\u2070\u2074-\u2079]+|\[\d{1,3}\]|\((?:\d{1,2}|[a-z])\))$")
FOOTNOTE_DIGITS = re.compile(r"(?<=[A-Za-z\u00c0-\u024f).\u2019'])[\s\ufeff]*\d{1,3}$")
# Placeholder labels whose trailing number tells rows apart ("Name withheld 5", "Executive 2"): those digits stay.
NUMBERED_LABEL = re.compile(r"(?:^|[^a-z])(?:name\s*with+e?ld|withheld|executive|member|officer|employee|individual|person|kmp|position|role|staff|band|total)(?![a-z])", re.I)


def footnote_free_name(name):
    """(name, marker): a published person name without a trailing footnote reference, and the marker removed.

    Symbols, superscripts and bracketed references are always footnotes. Plain trailing digits are removed
    only from a written name of two or more words with lower-case letters that is not a numbered placeholder
    label, so a name that genuinely ends in digits is returned unchanged (marker None). A marker of "" means
    only an invisible byte-order mark was removed."""
    if not isinstance(name, str):
        return name, None
    text = name.strip().strip("\ufeff").strip()
    out = text
    for _ in range(3):
        before = out
        m = FOOTNOTE_MARK.search(out)
        if m and re.search(r"[^\W\d_]", out[:m.start()]):
            out = out[:m.start()].rstrip()
        m = FOOTNOTE_DIGITS.search(out)
        rest = out[:m.start()].rstrip() if m else ""
        if m and " " in rest and re.search(r"[a-z]", rest) and not NUMBERED_LABEL.search(rest):
            out = rest
        if out == before:
            break
    out = out.strip(" \ufeff")
    if not out or out == name:
        return name, None
    # A stray byte-order mark is removed too; the marker is then empty but the published cell still differs.
    return out, text[len(out):].strip(" \ufeff")


def number(value):
    """A cell's number when the whole cell is a number as published; otherwise None."""
    text = clean(value)
    if text is None or not NUMBER.fullmatch(text.replace(" ", "")):
        return None
    neg = text.startswith("-") or (text.startswith("(") and text.endswith(")")) or text.startswith("$-") or text.startswith("-$")
    digits = re.sub(r"[^\d.]", "", text)
    if not digits or digits == ".":
        return None
    n = float(digits)
    n = -n if neg else n
    return int(n) if n.is_integer() else n


def el(item, key):
    return ((item.get("elements") or {}).get(key) or {}).get("value")


def text_elements(item):
    """Every text/number element of an item: {codename: (label, value)}."""
    out = {}
    for key, e in (item.get("elements") or {}).items():
        if e.get("type") in ("text", "number") and key not in ("title",):
            out[key] = (e.get("name") or key, e.get("value"))
    return out


def period(item):
    tax = el(item, "reporting_period") or []
    for t in tax:
        if YEAR.match(t.get("name", "")):
            return t["name"]
    return None


def published(item):
    return (item.get("system") or {}).get("workflow_step") == "published"


def publication_date(message):
    """The Portal normally prints MM/DD/YYYY, but some reports print DD/MM/YYYY.

    Retain month-first for ambiguous dates. Only use day-first when the first
    component cannot be a month, and reject impossible dates in either form.
    """
    match = re.search(r"Annual Report Published: (\d{2})/(\d{2})/(\d{4})", message or "")
    if not match:
        return None
    first, second, year = map(int, match.groups())
    month, day = (first, second) if first <= 12 else (second, first)
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def projected_publication_date(value):
    """Replay a retained projection through the source parser.

    The old parser copied MM/DD/YYYY components verbatim to YYYY-MM-DD. Its
    invalid output therefore retains the exact source components; reverse that
    formatting before parsing. Valid projections are already normalised.
    """
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", value)
        if not match:
            return None
        year, first, second = match.groups()
        return publication_date(f"Annual Report Published: {first}/{second}/{year}")


def build(args):
    run = Path(args.run) if args.run else latest_run()
    raw_manifest = json.loads((run / "manifest.json").read_text())

    bodies_raw, _ = load(run, "government_body")
    portfolios_raw, _ = load(run, "portfolio_metadata")
    reports_raw, _ = load(run, "annual_report")

    portfolios = {}
    for p in portfolios_raw:
        portfolios[p["system"]["codename"]] = {"name": clean(el(p, "portfolio_name")), "slug": clean(el(p, "web_url")),
                                               "status": clean(el(p, "status_text")), "entities": set(el(p, "entities") or []),
                                               "years": {t.get("name") for t in (el(p, "active_during") or [])}}

    def portfolio_for(body_code, year):
        """The portfolio that listed this body in that reporting year (the Portal's URL path)."""
        hits = [v for v in portfolios.values() if body_code in v["entities"] and (not year or year in v["years"])]
        return hits[0] if len(hits) == 1 else None

    reports = {}
    for r in reports_raw:
        if not published(r):
            continue
        msg = clean(re.sub(r"<[^>]+>", " ", el(r, "validation_messages") or ""))
        reports[r["system"]["codename"]] = {
            "codename": r["system"]["codename"], "id": r["system"]["id"], "title": clean(el(r, "title")),
            "web_url": clean(el(r, "web_url")), "year": period(r), "collection": r["system"].get("collection"),
            "published_on": publication_date(msg),
            "last_modified": r["system"].get("last_modified"),
            "tables": list(el(r, "performance_data") or []),
        }

    bodies, excluded = {}, []
    for b in bodies_raw:
        name = clean(el(b, "body_name")) or b["system"]["name"]
        code = b["system"]["codename"]
        if TEST_BODY.search(name) or TEST_BODY.search(code):
            excluded.append(name)
            continue
        types = [t.get("name") for t in (el(b, "body_type") or [])]
        kind = next((k for k in ("NCE", "CCE", "CC") if any(k == (t or "").split()[0].upper() or k in (t or "") for t in types)), None)
        body_reports = [reports[c] for c in (el(b, "annual_reports") or []) if c in reports]
        body_reports.sort(key=lambda r: r["year"] or "")
        bodies[code] = {
            "id": code, "name": name, "type": kind, "type_as_published": types,
            "acronyms": clean(el(b, "acronyms")), "status": clean(el(b, "status_text")),
            "website": clean(el(b, "url")),
            "reports": sorted(({"year": r["year"], "codename": r["codename"], "title": r["title"], "web_url": r["web_url"],
                                "published_on": r["published_on"],
                                "portfolio": (portfolio_for(code, r["year"]) or {}).get("name"),
                                "portfolio_slug": (portfolio_for(code, r["year"]) or {}).get("slug")}
                               for r in body_reports if r["year"]), key=lambda r: r["year"]),
        }

    # report codename -> body; tables are linked from a report's performance_data, which
    # also gives the year for the 2022-23 tables that carry no reporting period.
    report_of_table, body_of_report = {}, {}
    for code, body in bodies.items():
        for r in body["reports"]:
            body_of_report[r["codename"]] = code
            for t in reports[r["codename"]]["tables"]:
                report_of_table[t] = r["codename"]


    tables, rows, unlinked = [], [], 0
    for family in FAMILIES:
        items, modular = load(run, family)
        for t in items:
            if not published(t):
                continue
            tcode = t["system"]["codename"]
            rcode = report_of_table.get(tcode)
            if not rcode:
                unlinked += 1
                continue
            report = reports[rcode]
            body = bodies[body_of_report[rcode]]
            year = period(t) or report["year"]
            if year != report["year"]:
                year = report["year"]  # the report's own period governs (CCE calendar-year tags)
            table = {
                "id": t["system"]["id"], "codename": tcode, "family": family, "content_type": t["system"]["type"],
                "title": clean(el(t, "title")) or t["system"]["name"], "body_id": body["id"], "year": year,
                "report": rcode, "last_modified": t["system"].get("last_modified"),
                "fields": {k: [label, clean(v)] for k, (label, v) in text_elements(t).items()},
                "api_url": API + "?" + urlencode({"system.codename": tcode, "depth": 1}),
                "licence": LICENCE_NCE if body["type"] == "NCE" else LICENCE_OWN,
                "rows": [],
            }
            for i, rc in enumerate(el(t, "row_items") or []):
                row = modular.get(rc)
                if not row or not published(row):
                    continue
                cells = {k: [label, clean(v)] for k, (label, v) in text_elements(row).items()}
                table["rows"].append({"id": row["system"]["id"], "codename": rc, "order": i, "cells": cells,
                                      "last_modified": row["system"].get("last_modified")})
            tables.append(table)

    if len(bodies) < args.min_bodies:
        raise Held(f"only {len(bodies)} bodies (minimum {args.min_bodies})")
    kmp_rows = sum(len(t["rows"]) for t in tables if t["family"] == "kmp")
    previous = CACHE / "snapshot.json"
    if previous.exists() and not args.allow_shrink:
        old = json.loads(previous.read_text())
        old_kmp = old["counts"]["kmp_rows"]
        if kmp_rows < old_kmp * 0.9:
            raise Held(f"KMP rows fell from {old_kmp} to {kmp_rows}")
    snapshot = {
        "schema": SNAPSHOT_SCHEMA, "built_at": now(), "fetched_at": raw_manifest["fetched_at"], "raw_run": run.name,
        "source": {"name": "Transparency Portal, Department of Finance", "url": SITE, "api": API},
        "counts": {"bodies": len(bodies), "reports": sum(len(b["reports"]) for b in bodies.values()),
                   "tables": len(tables), "kmp_rows": kmp_rows, "unlinked_tables": unlinked,
                   "excluded_test_bodies": len(excluded)},
        "bodies": bodies, "tables": tables,
    }
    snapshot["sha256"] = hashlib.sha256(json.dumps(snapshot["tables"], sort_keys=True).encode()).hexdigest()
    atomic_json(previous, snapshot)
    print(f"[transparency_portal] snapshot {run.name}: {json.dumps(snapshot['counts'])}", flush=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--max-requests", type=int, default=MAX_REQUESTS)
    b = sub.add_parser("build")
    b.add_argument("--run")
    b.add_argument("--min-bodies", type=int, default=150)
    b.add_argument("--allow-shrink", action="store_true")
    r = sub.add_parser("refresh", help="fetch then build")
    r.add_argument("--max-requests", type=int, default=MAX_REQUESTS)
    r.add_argument("--min-bodies", type=int, default=150)
    r.add_argument("--allow-shrink", action="store_true")
    r.add_argument("--run")
    args = ap.parse_args(argv)
    if args.cmd in ("fetch", "refresh"):
        fetch(args)
    if args.cmd in ("build", "refresh"):
        args.run = None if args.cmd == "refresh" else args.run
        build(args)


if __name__ == "__main__":
    main()
