"""Royal commissions: reports, numbered recommendations and official responses and status.

The registry (parli/ingest/royal_commissions.json) names each commission OPAX loads and
the official documents its record is read from. Sources, all fetched with the shared
OPAXBot identity, paced, with each host's robots policy checked:

  * Parliament of Victoria tabled documents database (www.parliament.vic.gov.au). Victorian
    royal commissions table their reports there, and so do the Commonwealth royal
    commissions Victoria joined by its own letters patent. The Parliament publishes the
    tabled PDF and the tabled dates.
  * www.vic.gov.au: the Victorian Government's published implementation status for the
    Royal Commission into Family Violence recommendations and its published responses
    (HTML pages only; the site's robots policy disallows its PDFs).
  * treasury.gov.au: the Financial Services Royal Commission final report and the
    Government's response.

Commonwealth royal commission websites (royalcommission.gov.au and the per-commission
hosts), the Attorney-General's Department and the NSW Parliament refused the identifying
agent when this ingest was built; see docs/DATA-ROYAL-COMMISSIONS.md for the gaps.

Phases:
  fetch   paced GETs into a raw cache outside git (~/.cache/autoresearch/royal-commissions/,
          or $OPAX_ROYAL_COMMISSIONS_CACHE); PDFs are kept by URL hash and reused
  build   read PDF text locally (PyMuPDF) and write snapshot.json (no requests)
  refresh fetch, then build

`scripts/export_royal_commissions.py` writes the public projection from the snapshot.

Nothing is inferred. A recommendation's text is the report's own text, cut at its own
"Recommendation N" headings, kept only when the run is a clean 1..N sequence whose every
line is verbatim on the page it cites, and whose count matches the count the registry
records from the report. A status is recorded only where an official tracker publishes
one for that recommendation; anything else is left unknown. Facts the registry states
(letters patent dates, commissioners) carry a quote that the build checks is verbatim on
the cited page.

Exit 3 keeps the last good snapshot when a guard fails; exit 4 (parli.ingest.http) when a
source refuses the agent.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import html as htmllib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

from parli.ingest import http as source_http
from parli.ingest import pdf_recommendations as pr

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get("OPAX_ROYAL_COMMISSIONS_CACHE", "~/.cache/autoresearch/royal-commissions")).expanduser()
REGISTRY = Path(__file__).with_name("royal_commissions.json")
SOURCE_NAME = "royal_commissions"
PV = "https://www.parliament.vic.gov.au"
DETAIL = PV + "/parliamentary-activity/tabled-documents-database/tabled-document-details/"
VIC = "https://www.vic.gov.au"
INTERVAL = 2.0
MAX_REQUESTS = 1200
SCHEMA = 1
JURISDICTIONS = {"Cth": "Commonwealth", "NSW": "New South Wales", "Vic": "Victoria", "Qld": "Queensland",
                 "WA": "Western Australia", "SA": "South Australia", "Tas": "Tasmania",
                 "ACT": "Australian Capital Territory", "NT": "Northern Territory"}
INQUIRY_TYPES = ("royal_commission", "commission_of_inquiry", "board_of_inquiry")
DOC_KINDS = ("interim_report", "final_report", "progress_report", "government_response", "implementation_progress",
             "hearing_transcript")
SOURCES = ("parliament_vic", "url", "manual")
OPAXBOT = "fetched by OPAXBot"
REPORT_KINDS = ("interim_report", "final_report", "progress_report")
MONTHS = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                          "september", "october", "november", "december"])}


class Held(SystemExit):
    def __init__(self, reason):
        print(f"[royal_commissions] HELD: {reason}; last good snapshot kept", flush=True)
        super().__init__(3)


class ManualMissing(Exception):
    """A manually supplied publisher PDF is not in this machine's cache (the weekly VM never has them)."""


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def atomic_json(path: Path, value, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":")) + "\n")
    os.replace(tmp, path)


def url_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:24]


def registry(path: Path = REGISTRY):
    return json.loads(path.read_text())


def iso_date(text):
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text or "")
    if not m or m.group(2).lower() not in MONTHS:
        return None
    return f"{int(m.group(3)):04d}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"


def html_text(page_html: str) -> str:
    m = re.search(r"<main\b.*?</main>", page_html, re.S | re.I)
    text = re.sub(r"<(script|style)\b.*?</\1>|<!--.*?-->", " ", m.group(0) if m else page_html, flags=re.S | re.I)
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", text))).strip()


def element_text(page_html: str, pattern: str):
    m = re.search(pattern, page_html, re.S)
    if not m:
        return None
    return pr.clean(htmllib.unescape(re.sub(r"<!--.*?-->|<[^>]+>", " ", m.group(1), flags=re.S)))


# ---- robots (RFC 9309: repeated matching groups merge; longest match wins; allow wins ties) ----

def robots_rules(text, agent):
    groups, agents, rules = [], [], []
    for line in text.splitlines() + ["User-agent: __end__"]:
        key, sep, value = line.split("#", 1)[0].partition(":")
        if not sep:
            continue
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if rules:
                groups.append((agents, rules))
                agents, rules = [], []
            agents.append(value.lower())
        elif agents and key in {"allow", "disallow", "crawl-delay"}:
            rules.append((key, value))
    token = agent.split("/", 1)[0].lower()
    matches = [(a, r) for a, r in groups if any(x == "*" or x == token for x in a)]
    specific = [(a, r) for a, r in matches if any(x == token for x in a)]
    return [rule for _, rules in (specific or matches) for rule in rules]


def robots_allowed(url, rules):
    parts = urlsplit(url)
    path = parts.path + ("?" + parts.query if parts.query else "")
    best = (0, True)
    for key, value in rules:
        if key not in {"allow", "disallow"} or not value:
            continue
        pattern = re.escape(value).replace(r"\*", ".*")
        if pattern.endswith(r"\$"):
            pattern = pattern[:-2] + "$"
        if re.match(pattern, path):
            cand = (len(value.replace("*", "")), key == "allow")
            if cand[0] > best[0] or (cand[0] == best[0] and cand[1]):
                best = cand
    return best[1]


def crawl_delay(rules):
    delays = [float(v) for k, v in rules if k == "crawl-delay" and re.fullmatch(r"\d+(?:\.\d+)?", v)]
    return max(delays, default=0.0)


# ---- fetch ------------------------------------------------------------------------------

class Fetcher:
    def __init__(self, out: Path, max_requests=MAX_REQUESTS):
        self.out = out
        self.session = source_http.Session()
        self.count = 0
        self.max = max_requests
        self.robots = {}
        self.receipts = []

    def _spend(self):
        if self.count >= self.max:
            raise Held(f"request budget of {self.max} reached before the run completed")
        self.count += 1

    def _policy(self, url):
        host = urlsplit(url).netloc
        if host not in self.robots:
            robots_url = f"https://{host}/robots.txt"
            self._spend()
            source_http.pace(robots_url, INTERVAL)
            response = self.session.get(robots_url, allow_redirects=False, timeout=180)
            if response.status_code == 200:
                rules = robots_rules(response.text, source_http.USER_AGENT)
            elif 400 <= response.status_code < 500:
                rules = []  # RFC 9309: an unavailable robots file places no restriction
            else:
                raise Held(f"robots policy for {host} unavailable (HTTP {response.status_code})")
            self.robots[host] = {"rules": rules, "delay": max(INTERVAL, crawl_delay(rules)),
                                 "sha256": hashlib.sha256(response.content).hexdigest(), "status": response.status_code}
        return self.robots[host]

    def get(self, url, *, binary=False):
        policy = self._policy(url)
        if not robots_allowed(url, policy["rules"]):
            raise Held(f"robots policy disallows {url}")
        self._spend()
        source_http.pace(url, policy["delay"])
        response = self.session.get(url, allow_redirects=False, timeout=300)
        self.receipts.append({"url": url, "status": response.status_code, "at": now()})
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise Held(f"HTTP {response.status_code} for {url}")
        if binary and not response.content.startswith(b"%PDF-"):
            raise Held(f"expected a PDF from {url}")
        return response


def pdf_path(url: str, cache: Path = CACHE) -> Path:
    return cache / "pdf" / (url_key(url) + ".pdf")


def manual_path(sha256: str, cache: Path = CACHE) -> Path:
    return cache / "manual" / (sha256 + ".pdf")


def page_path(run: Path, url: str) -> Path:
    return run / "pages" / (url_key(url) + ".html")


def fetch_pdf(f: Fetcher, url: str):
    path = pdf_path(url)
    if path.exists() and path.stat().st_size > 0:
        return path
    response = f.get(url, binary=True)
    if response is None:
        raise Held(f"{url} missing (404)")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(response.content)
    os.replace(tmp, path)
    return path


def fetch_page(f: Fetcher, url: str, required=True):
    response = f.get(url)
    if response is None:
        if required:
            raise Held(f"{url} missing (404)")
        return None
    path = page_path(f.out, url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(response.text)
    return response.text


def tabled_pdf_urls(page_html: str, paper_id: int):
    found = re.findall(r"(?:https://www\.parliament\.vic\.gov\.au)?(/[0-9a-f]{6}/globalassets/tabled-paper-documents/"
                       r"tabled-paper-%d/[^\"'\s<>]+?\.pdf)" % paper_id, page_html)
    seen, out = set(), []
    for path in found:
        url = PV + htmllib.unescape(path)
        name = url.rsplit("/", 1)[-1]
        if name not in seen:
            seen.add(name)
            out.append(url)
    return out


def doc_pdf_urls(doc, page_html):
    if doc["source"] == "parliament_vic":
        return [u for u in tabled_pdf_urls(page_html or "", doc["tabled_paper"])
                if re.search(doc.get("files", "."), u.rsplit("/", 1)[-1], re.I)]
    if doc["source"] == "manual":
        return [doc["url"]]
    return [doc["url"]] if doc["url"].lower().endswith(".pdf") else []


def tracker_urls(f: Fetcher, tracker):
    """Pages under a vic.gov.au prefix, listed from the site's own sitemap."""
    urls = []
    for n in range(1, 11):
        response = f.get(VIC + f"/sitemap.xml?page={n}")
        if response is None:
            break
        locs = re.findall(r"<loc>([^<]+)</loc>", response.text)
        if not locs:
            break
        urls += [u for u in locs if u.startswith(VIC + "/" + tracker["prefix"] + "/")]
    urls = sorted(set(urls))
    if len(urls) < tracker.get("min_pages", 1):
        raise Held(f"tracker {tracker['prefix']}: only {len(urls)} pages listed")
    return urls


def fetch(args):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = CACHE / "raw" / stamp
    out.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("OPAX_SOURCE_NAME", SOURCE_NAME)
    f = Fetcher(out, args.max_requests)
    pdfs = pages = 0
    trackers = {}
    for rc in registry()["commissions"]:
        for doc in rc["documents"]:
            page_html = None
            if doc["source"] == "manual":
                continue  # supplied by the maintainer; never fetched (see docs/DATA-ROYAL-COMMISSIONS.md)
            if doc["source"] == "parliament_vic":
                page_html = fetch_page(f, DETAIL + str(doc["tabled_paper"]))
                pages += 1
            elif not doc["url"].lower().endswith(".pdf"):
                fetch_page(f, doc["url"])
                pages += 1
            if doc.get("page"):
                fetch_page(f, doc["page"])
                pages += 1
            for url in doc_pdf_urls(doc, page_html):
                fetch_pdf(f, url)
                pdfs += 1
        for ref in rc.get("reference_pages", []):
            if ref.get("fetch"):
                fetch_page(f, ref["url"])
                pages += 1
        tracker = rc.get("tracker")
        if tracker:
            urls = tracker_urls(f, tracker)
            for url in urls:
                fetch_page(f, url, required=False)
            trackers[rc["id"]] = urls
            pages += len(urls)
    atomic_json(out / "trackers.json", trackers)
    atomic_json(out / "receipts.json", f.receipts)
    atomic_json(out / "manifest.json", {
        "schema": SCHEMA, "fetched_at": now(), "requests": f.count, "pdfs": pdfs, "pages": pages,
        "robots": {h: {k: v for k, v in p.items() if k != "rules"} for h, p in f.robots.items()}, "complete": True}, indent=2)
    print(f"[royal_commissions] fetched {pdfs} PDFs and {pages} pages in {f.count} requests -> {out}", flush=True)


# ---- build ------------------------------------------------------------------------------

def latest_run(cache: Path = CACHE) -> Path:
    runs = sorted(p for p in (cache / "raw").glob("*") if (p / "manifest.json").exists()
                  and json.loads((p / "manifest.json").read_text()).get("complete"))
    if not runs:
        raise Held("no complete raw run in the cache")
    return runs[-1]


def detail_fields(page_html):
    """Title, tabled dates, authority and notes from a tabled-document details page."""
    text = html_text(page_html)
    title = element_text(page_html, r"<h1\b[^>]*>(.*?)</h1>")
    i = text.find(" Details ")
    block = text[i:].split(" Documents ")[0].split(" View all Tabled Documents")[0] if i >= 0 else ""
    stop = r"(?=Tabled in the|Released on|Authority:|Section:|Notes\b|$)"

    def field(label):
        f = re.search(re.escape(label) + r"\s*(.*?)\s*" + stop, block)
        return f.group(1).strip() if f else None
    notes = re.search(r"\bNotes\s+(.*)$", block)
    return {"title": title, "tabled_la": iso_date(field("Tabled in the LA:")), "tabled_lc": iso_date(field("Tabled in the LC:")),
            "released": iso_date(field("Released on a non-sitting day:")), "authority": field("Authority:"),
            "notes": (notes.group(1).strip() or None) if notes else None}


def page_title(page_html):
    return element_text(page_html, r"<h1\b[^>]*>(.*?)</h1>") or element_text(page_html, r"<title>(.*?)</title>")


def updated_date(page_html):
    m = re.search(r"\bUpdated\s+(\d{1,2} [A-Z][a-z]+ \d{4})", html_text(page_html))
    return iso_date(m.group(1)) if m else None


def cite(url, document, page=None, section=None):
    c = {"url": url, "document": pr.clean(document)}
    if page is not None:
        c["page"] = int(page)
    if section:
        c["section"] = section
    return c


class Texts:
    """PDF bytes, page texts and page lines, read once per file."""

    def __init__(self, cache: Path):
        self.cache, self._data, self._texts, self._lines = cache, {}, {}, {}
        self.manual = {}  # publisher URL -> sha256 of a manually supplied copy

    def data(self, url):
        if url not in self._data:
            sha = self.manual.get(url)
            path = manual_path(sha, self.cache) if sha else pdf_path(url, self.cache)
            if not path.exists():
                if sha:
                    raise ManualMissing(url)
                raise Held(f"PDF not in the cache: {url}")
            data = path.read_bytes()
            if sha and hashlib.sha256(data).hexdigest() != sha:
                raise Held(f"manual copy of {url} does not match its recorded sha256")
            self._data[url] = data
        return self._data[url]

    def texts(self, url):
        if url not in self._texts:
            self._texts[url] = pr.page_texts(self.data(url), self.cache)
        return self._texts[url]

    def lines(self, url):
        if url not in self._lines:
            self._lines[url] = pr.page_lines(self.data(url))
        return self._lines[url]


def fv_status(page_html):
    """Number, status, lead agency and update date from a vic.gov.au family violence recommendation page."""
    number = element_text(page_html, r'data-cy="hero-summary"[^>]*>(.*?)</p>')
    m = re.fullmatch(r"Recommendation\s+0*(\d{1,3})", number or "")
    status = element_text(page_html, r'class="tide-fv-recommendation-status__name[^"]*"[^>]*>(.*?)</')
    text = html_text(page_html)
    lead = re.search(r"Who is leading the change (.+?) (?:The Victorian Government|Victoria Police|The|That|Open all)\b", text)
    if not m or not status:
        return None
    return {"number": m.group(1), "as_published": status, "lead": pr.clean(lead.group(1)) if lead else None,
            "updated": updated_date(page_html)}


def check_fact(fact, docs, texts):
    """A registry fact whose quote is verbatim on the cited page of one of the commission's PDFs."""
    doc = docs.get(fact["doc"])
    if not doc or not doc["files"]:
        raise Held(f"fact cites document {fact['doc']!r}, which has no PDF")
    url = doc["files"][fact.get("file", 0)]["url"]
    page = int(fact["page"])
    if not pr.verbatim(fact["quote"], texts.texts(url)[page - 1]):
        raise Held(f"fact quote not found on {url} page {page}: {fact['quote'][:80]!r}")
    return cite(url, doc["title"], page)


def build_commission(rc, run: Path, texts: Texts, trackers):
    docs, reports, responses, transcripts, recs = {}, [], [], [], []
    notes, gaps = list(rc.get("notes", [])), list(rc.get("gaps", []))
    if rc.get("inquiry_type") not in INQUIRY_TYPES:
        raise Held(f"{rc['id']}: unknown inquiry type {rc.get('inquiry_type')!r}")
    for doc in rc["documents"]:
        if doc["kind"] not in DOC_KINDS or doc["source"] not in SOURCES:
            raise Held(f"{rc['id']}/{doc['key']}: unknown document kind or source")
        if doc["source"] == "manual":
            # A publisher PDF supplied by the OPAX maintainer, cited to the publisher's own URL.
            texts.manual[doc["url"]] = doc["sha256"]
            page_url, page_html, title = doc.get("page") or doc["url"], None, doc["title"]
            date = basis = None
            source = cite(page_url, title)
            extra = {"acquisition": doc["acquisition"], "document_kind": doc["document_kind"], "rights": doc["rights"]}
        elif doc["source"] == "parliament_vic":
            page_url = DETAIL + str(doc["tabled_paper"])
            path = page_path(run, page_url)
            if not path.exists():
                raise Held(f"{rc['id']}: tabled paper {doc['tabled_paper']} details not in the run")
            page_html = path.read_text()
            d = detail_fields(page_html)
            title = doc.get("title") or d["title"]
            tabled = [x for x in (d["tabled_la"], d["tabled_lc"]) if x]
            date, basis = (min(tabled), "tabled_vic") if tabled else ((d["released"], "published") if d["released"] else (None, None))
            source = cite(page_url, "Parliament of Victoria tabled documents database, tabled paper " + str(doc["tabled_paper"]))
            extra = {"tabled_paper": doc["tabled_paper"], "tabled_la": d["tabled_la"], "tabled_lc": d["tabled_lc"],
                     "released": d["released"], "parliament_notes": d["notes"], "acquisition": OPAXBOT}
        else:
            page_url = doc.get("page") or doc["url"]
            page_html = page_path(run, page_url).read_text() if page_path(run, page_url).exists() else None
            if page_html is None and not doc["url"].lower().endswith(".pdf"):
                raise Held(f"{rc['id']}: {page_url} not in the run")
            title = doc.get("title") or (page_title(page_html) if page_html else None)
            date, basis = (updated_date(page_html), "updated") if page_html else (None, None)
            if not date:
                basis = None
            source = cite(page_url, title)
            extra = {"acquisition": OPAXBOT}
        if not title:
            raise Held(f"{rc['id']}/{doc['key']}: no title")
        files = []
        for url in doc_pdf_urls(doc, page_html if doc["source"] == "parliament_vic" else None):
            data = texts.data(url)
            files.append({"url": url, "name": url.rsplit("/", 1)[-1], "pages": len(texts.texts(url)),
                          "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        if doc["source"] == "parliament_vic" and not files and doc.get("files", ".") != "^$":
            notes.append(f"The Parliament lists {title} without a matching online document.")
        if doc.get("date_quote"):
            # A date printed on the document itself, checked verbatim on the cited page.
            quote, page = doc["date_quote"], int(doc["date_page"])
            url = files[doc.get("date_file", 0)]["url"] if files else None
            if not url or not pr.verbatim(quote, texts.texts(url)[page - 1]) or iso_date(quote) != doc.get("date"):
                raise Held(f"{rc['id']}/{doc['key']}: date {doc['date']} is not the date in its quote on page {page}")
            date, basis = doc["date"], "stated"
            extra["date_cite"] = cite(url, title, page)
            extra["date_quote"] = quote
        if doc.get("hearing"):
            extra["hearing"] = doc["hearing"]
        record = {"key": doc["key"], "kind": doc["kind"], "title": title, "date": date, "date_basis": basis,
                  "page_url": page_url, "files": files, "cite": source, **extra}
        docs[doc["key"]] = record

        rule = doc.get("recommendations")
        if rule and doc["kind"] in REPORT_KINDS:
            url = files[rule.get("file", 0)]["url"] if files else None
            if not url:
                raise Held(f"{rc['id']}/{doc['key']}: recommendations rule but no PDF")
            lines = texts.lines(url)
            heading = re.compile(rule["heading"], re.I) if rule.get("heading") else pr.HEADING
            noise = [re.compile(p, re.I) for p in rule.get("noise", [])]
            rows = pr.recommendations(lines, heading, noise, rule.get("first_page", 1), rule.get("last_page"),
                                      rule.get("any_order", False), rule.get("title_size"), rule.get("heading_size"))
            labels = [n for n, *_ in rows]
            if len(set(labels)) != len(rows) or len(rows) != rule["count"]:
                raise Held(f"{rc['id']}/{doc['key']}: parsed {len(rows)} recommendations, registry records {rule['count']}")
            if not rule.get("any_order") and not pr.complete(rows, lines, heading):
                raise Held(f"{rc['id']}/{doc['key']}: a heading after recommendation {labels[-1]} was not read")
            if not pr.verified(rows, texts.texts(url)):
                raise Held(f"{rc['id']}/{doc['key']}: a recommendation line is not verbatim on its page")
            bad = [n for n, t, *_ in rows if not (20 <= len(t) <= rule.get("max_chars", 6000))]
            if bad:
                raise Held(f"{rc['id']}/{doc['key']}: recommendation length out of range for {bad[:5]}")
            for n, text, page, _ in rows:
                recs.append({"number": n, "report": doc["key"], "text": text, "cite": cite(url, title, page), "status": None})
            record["recommendations"] = len(rows)
            record["recommendations_status"] = "extracted"
        elif doc["kind"] in REPORT_KINDS:
            record["recommendations"] = None
            record["recommendations_status"] = "not_extracted"
        if doc["kind"] in REPORT_KINDS:
            reports.append(record)
        elif doc["kind"] == "hearing_transcript":
            transcripts.append(record)
        else:
            responses.append(record)

    tracker = None
    if rc.get("tracker"):
        tr = rc["tracker"]
        urls = trackers.get(rc["id"]) or []
        statuses = {}
        for url in urls:
            path = page_path(run, url)
            if not path.exists():
                continue
            s = fv_status(path.read_text()) if tr["kind"] == "vic_gov_pages" and tr.get("format") == "fv_status" else None
            if s:
                s["cite"] = cite(url, "Victorian Government, " + (page_title(path.read_text()) or "recommendation page"),
                                 section="status")
                statuses.setdefault(s["number"], s)
        target = [r for r in recs if r["report"] == tr.get("report")] if tr.get("report") else []
        matched = 0
        for r in target:
            s = statuses.get(r["number"])
            if s:
                r["status"] = {k: s[k] for k in ("as_published", "lead", "updated", "cite")}
                matched += 1
        if tr.get("format") == "fv_status" and matched < tr.get("min_matched", 1):
            raise Held(f"{rc['id']}: only {matched} recommendation statuses matched from the tracker")
        tracker = {"kind": tr["kind"], "name": tr.get("name"), "url": tr.get("url"), "pages": len(urls),
                   "statuses_matched": matched if tr.get("format") == "fv_status" else None}

    facts = {"established": None, "commissioners": []}
    for fact in rc.get("facts", []):
        c = check_fact(fact, docs, texts)
        if fact.get("instrument") and fact["instrument"].lower() not in fact["quote"].lower():
            raise Held(f"{rc['id']}: fact instrument {fact['instrument']!r} is not in its quote")
        if fact["field"] != "established" and pr._norm(fact["value"]) not in pr._norm(fact["quote"]):
            raise Held(f"{rc['id']}: fact value {fact['value']!r} is not in its quote")
        if fact["field"] == "established" and iso_date(fact["quote"]) != fact["value"]:
            raise Held(f"{rc['id']}: established date {fact['value']} is not the date in its quote")
        if fact["field"] == "established":
            facts["established"] = {"date": fact["value"], "instrument": fact.get("instrument"), "quote": fact["quote"], "cite": c}
        elif fact["field"] == "commissioner":
            facts["commissioners"].append({"name": fact["value"], "role": fact.get("role", "Commissioner"),
                                           "quote": fact["quote"], "cite": c})
        else:
            raise Held(f"{rc['id']}: unknown fact field {fact['field']!r}")
    for kind in ("interim_report", "final_report"):
        dated = [r for r in reports if r["kind"] == kind and r["date"]]
        facts[kind] = min((r["date"] for r in dated), default=None)
    court = []
    for item in rc.get("court_context", []):
        # Court rulings on parts of a report, quoted exactly as the cited official page states them.
        path = page_path(run, item["url"])
        if not path.exists():
            raise Held(f"{rc['id']}: court context page {item['url']} not in the run")
        if not pr.verbatim(item["quote"], html_text(path.read_text())):
            raise Held(f"{rc['id']}: court context quote not on {item['url']}: {item['quote'][:80]!r}")
        court.append({"text": item["quote"], "applies_to": item["applies_to"], "cite": cite(item["url"], item["document"])})
    if court and not reports:
        raise Held(f"{rc['id']}: court context without a report it applies to")
    return {"id": rc["id"], "name": rc["name"], "inquiry_type": rc["inquiry_type"], "jurisdiction": rc["jurisdiction"],
            "jurisdiction_name": JURISDICTIONS[rc["jurisdiction"]], "site": rc.get("site"), "established": facts["established"],
            "commissioners": facts["commissioners"], "interim_report_date": facts["interim_report"],
            "final_report_date": facts["final_report"], "reports": reports, "responses": responses,
            "transcripts": transcripts, "court_context": court, "reference_pages": rc.get("reference_pages", []),
            "recommendations": recs, "recommendations_status": (
                "no_report" if not reports
                else "extracted" if all(r["recommendations_status"] == "extracted" for r in reports)
                else "partial" if recs else "not_extracted"),
            "status_source": tracker, "notes": notes, "gaps": gaps}


def carried(rc, cache: Path = CACHE):
    """The last built record of a commission whose manual PDFs this machine does not hold.

    The weekly refresh runs where the maintainer-supplied PDFs are absent; their records were
    built where the PDFs were present and are carried forward unchanged, from the previous
    snapshot or, failing that, the published export in git.
    """
    snap = cache / "snapshot.json"
    if snap.exists():
        for c in json.loads(snap.read_text()).get("commissions", []):
            if c["id"] == rc["id"]:
                return c
    published = ROOT / "portal" / "public" / "royal-commissions" / f"commission-{rc['id']}.json"
    if published.exists():
        return json.loads(published.read_text())["commission"]
    raise Held(f"{rc['id']}: a manually supplied PDF is absent and no earlier record exists to carry forward")


def build(args, run_name=None):
    cache = CACHE
    run = cache / "raw" / run_name if run_name else latest_run(cache)
    reg = registry()
    trackers = json.loads((run / "trackers.json").read_text()) if (run / "trackers.json").exists() else {}
    texts = Texts(cache)
    commissions, kept = [], []
    for rc in reg["commissions"]:
        try:
            commissions.append(build_commission(rc, run, texts, trackers))
        except ManualMissing:
            commissions.append(carried(rc, cache))
            kept.append(rc["id"])
    if kept:
        print(f"[royal_commissions] carried forward (manual PDFs not on this machine): {', '.join(kept)}", flush=True)
    total = sum(len(c["recommendations"]) for c in commissions)
    snapshot_path = cache / "snapshot.json"
    if snapshot_path.exists() and not getattr(args, "allow_shrink", False):
        old = json.loads(snapshot_path.read_text())
        old_total = sum(len(c["recommendations"]) for c in old.get("commissions", []))
        if len(commissions) < len(old.get("commissions", [])) or total < old_total * 0.9:
            raise Held(f"snapshot would shrink from {old_total} to {total} recommendations (use --allow-shrink)")
    manifest = json.loads((run / "manifest.json").read_text())
    atomic_json(snapshot_path, {"schema": SCHEMA, "built_at": now(), "run": run.name, "fetched_at": manifest.get("fetched_at"),
                                "robots": manifest.get("robots"), "gaps": reg.get("gaps", []), "commissions": commissions})
    print(f"[royal_commissions] built {len(commissions)} commissions, {total} recommendations -> {snapshot_path}", flush=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("fetch", "build", "refresh"):
        p = sub.add_parser(name)
        p.add_argument("--max-requests", type=int, default=MAX_REQUESTS)
        p.add_argument("--run", help="build from this raw run (default: the latest complete run)")
        p.add_argument("--allow-shrink", action="store_true")
    args = ap.parse_args(argv)
    if args.cmd in ("fetch", "refresh"):
        fetch(args)
    if args.cmd in ("build", "refresh"):
        build(args, args.run if args.cmd == "build" else None)


if __name__ == "__main__":
    main()
