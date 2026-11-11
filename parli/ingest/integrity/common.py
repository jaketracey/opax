"""Shared transport, PDF text, verbatim guards and the record schema for integrity reports.

Source policy (docs/SOURCES-ACCESS.md): every request uses the single OPAXBot identity
through ``parli.ingest.http.Session`` (no proxy, no browser identity), is paced per host
at the larger of ``Body.interval`` and the host's robots ``Crawl-delay``, and is checked
against robots.txt (RFC 9309 groups and wildcards, parsed here because the standard
library parser drops rules after blank lines). Redirects are followed only after the
destination passes the same host and robots checks. A 401/403 or challenge page raises
``parli.ingest.http.SourceRefused`` (exit 4) before the response can be used.

Raw pages and PDFs go to ``~/.cache/autoresearch/integrity-commissions/raw/<body>/``
(override with ``OPAX_INTEGRITY_CACHE``), never into git. PDFs are fetched once per URL
and reused; listing and report pages are fetched each run.

Record rules: text is the report's own words. ``verbatim`` refuses any finding or
recommendation text that does not appear on the cited page of the extracted PDF or
HTML text. Unknown stays unknown: ``*_status`` says whether a list was extracted, stated
as none by the report, or not extracted.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urljoin, urlsplit, unquote

from parli.ingest import http as source_http

CACHE = Path(os.environ.get("OPAX_INTEGRITY_CACHE", "~/.cache/autoresearch/integrity-commissions")).expanduser()
SCHEMA = 1
UA = source_http.USER_AGENT
UA_TOKEN = "opaxbot"

REPORT_TYPES = ("investigation_report", "special_report", "public_inquiry_report",
                "prevention_research_report", "statement", "other")
DATE_BASES = ("tabled", "published", "dated")
FINDING_KINDS = ("finding", "opinion", "no_finding", "prosecution_statement", "other")
LIST_STATUS = ("extracted", "stated_none", "not_extracted")
RESPONSE_KINDS = ("agency_response", "action_plan", "progress_report", "implementation_report",
                  "recommendation_status", "other")
SUBJECT_KINDS = ("body", "public_role")


class Held(SystemExit):
    """Keep the last good snapshot (exit 3)."""
    def __init__(self, reason):
        print(f"[integrity] HELD: {reason}; last good snapshot kept", flush=True)
        self.reason = reason
        super().__init__(3)


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def atomic_json(path: Path, value, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=indent,
                              separators=None if indent else (",", ":")) + "\n")
    os.replace(tmp, path)


def clean(value):
    """Collapse whitespace (including non-breaking and zero-width spaces); keep the words."""
    if value is None:
        return None
    text = re.sub(r"[\s ​  ]+", " ", str(value)).strip()
    return text or None


def slug(value, limit=80):
    v = unquote(str(value or "")).lower().replace("&", " and ")
    v = re.sub(r"[^a-z0-9]+", "-", v).strip("-")
    return v[:limit].rstrip("-")


@dataclass(frozen=True)
class Body:
    code: str                 # e.g. "nsw_icac"
    name: str                 # official name
    short: str                # e.g. "NSW ICAC"
    jurisdiction: str         # "Cth", "NSW", "Vic", "Qld", "WA", "SA", "Tas", "ACT", "NT"
    site: str                 # https://host
    hosts: tuple = ()         # every host the adapter may request (site host is added)
    interval: float = 2.0     # minimum seconds between requests to one host
    max_requests: int = 900
    licence: dict = field(default_factory=dict)  # {"status", "url", "attribution"}

    @property
    def id_prefix(self):
        return self.code.replace("_", "-")


# ---- robots (RFC 9309) ------------------------------------------------------------------

class Robots:
    """Groups by user agent; longest match wins, Allow wins a tie; * and $ wildcards."""

    def __init__(self, text: str | None):
        self.groups = []  # (agents, rules[(allow, pattern)], crawl_delay)
        agents, rules, delay, in_rules = [], [], None, False
        for raw in (text or "").splitlines():
            line = raw.split("#", 1)[0].strip()
            if not line or ":" not in line:
                continue
            key, value = (p.strip() for p in line.split(":", 1))
            key = key.lower()
            if key == "user-agent":
                if in_rules:
                    self.groups.append((agents, rules, delay))
                    agents, rules, delay, in_rules = [], [], None, False
                agents.append(value.lower())
            elif key in ("allow", "disallow"):
                in_rules = True
                if value or key == "allow":
                    rules.append((key == "allow", value))
            elif key == "crawl-delay":
                in_rules = True
                try:
                    delay = float(value)
                except ValueError:
                    pass
        if agents:
            self.groups.append((agents, rules, delay))

    def _group(self):
        for want in (UA_TOKEN, "*"):
            hits = [g for g in self.groups if any(a == want or (want != "*" and a and want.startswith(a)) for a in g[0])]
            if hits:
                return [r for g in hits for r in g[1]], max((g[2] or 0) for g in hits) or None
        return [], None

    @staticmethod
    def _matches(pattern, path):
        regex = "".join(".*" if ch == "*" else ("$" if ch == "$" and i == len(pattern) - 1 else re.escape(ch))
                        for i, ch in enumerate(pattern))
        return re.match(regex, path) is not None

    def allowed(self, url):
        parts = urlsplit(url)
        path = (parts.path or "/") + ("?" + parts.query if parts.query else "")
        rules, _ = self._group()
        best = None
        for allow, pattern in rules:
            if pattern and self._matches(pattern, path):
                length = len(pattern)
                if best is None or length > best[0] or (length == best[0] and allow):
                    best = (length, allow)
        return True if best is None else best[1]

    def crawl_delay(self):
        return self._group()[1]


# ---- client -----------------------------------------------------------------------------

class Client:
    """Paced, robots-checked GETs for one body, with a raw cache outside git."""

    def __init__(self, body: Body, cache: Path = CACHE, max_requests=None, refetch_pdfs=False, offline=False):
        self.body = body
        self.cache = cache / "raw" / body.code
        self.cache.mkdir(parents=True, exist_ok=True)
        self.session = None if offline else source_http.Session()
        self.offline = offline
        self.max = max_requests or body.max_requests
        self.count = 0
        self.refetch_pdfs = refetch_pdfs
        self.robots: dict[str, Robots] = {}
        self.hosts = {urlsplit(body.site).hostname, *body.hosts}
        self.log = []  # receipts: {url, status, at, bytes}
        os.environ["OPAX_SOURCE_NAME"] = "integrity_" + body.code

    def _key(self, url):
        return hashlib.sha256(url.encode()).hexdigest()[:24]

    def _raw(self, url, allow_missing=False):
        """One wire GET (no redirects followed). Returns (status, headers, bytes)."""
        if self.offline:
            raise Held(f"offline client asked for {url}")
        if self.count >= self.max:
            raise Held(f"{self.max}-request run ceiling reached for {self.body.code}")
        self.count += 1
        interval = max(self.body.interval, self.robots.get(_origin(url), Robots(None)).crawl_delay() or 0)
        source_http.pace(url, interval)
        response = self.session.get(url, allow_redirects=False, timeout=120)
        self.log.append({"url": url, "status": response.status_code, "at": now(), "bytes": len(response.content)})
        return response.status_code, response.headers, response.content

    def _robots(self, url):
        origin = _origin(url)
        if origin not in self.robots:
            self.robots[origin] = Robots("")  # placeholder so pacing has a value
            status, headers, body = self._raw(origin + "/robots.txt")
            if status == 200:
                self.robots[origin] = Robots(body.decode("utf-8", "replace"))
            elif status in (404, 410):
                self.robots[origin] = Robots("")  # no policy supplied: allowed (RFC 9309 2.3.1.3)
            else:
                # A redirect or server error leaves the policy unknown: do not fetch from this origin.
                self.robots[origin] = Robots("User-agent: *\nDisallow: /")
                self.log.append({"url": origin + "/robots.txt", "status": status, "at": now(),
                                 "note": "robots policy unavailable; origin not fetched"})
        return self.robots[origin]

    def check(self, url):
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.hostname not in self.hosts:
            raise Held(f"{url} is outside the hosts allowed for {self.body.code}")
        if not self._robots(url).allowed(url):
            return False
        return True

    def get(self, url, kind="html"):
        """Body bytes, or None when the page is missing (404/410) or robots disallows it.

        Same-origin and allowed-host redirects are followed after the destination passes
        the host and robots checks (at most five). PDFs are cached by URL and reused.
        """
        url = _quote(url)
        path = self.cache / (self._key(url) + (".pdf" if kind == "pdf" else ".html"))
        meta = path.with_suffix(".json")
        if kind == "pdf" and path.exists() and meta.exists() and not self.refetch_pdfs:
            return path.read_bytes()
        if self.offline:
            return path.read_bytes() if path.exists() else None
        current = url
        for _ in range(6):
            if not self.check(current):
                self.log.append({"url": current, "status": None, "at": now(), "note": "robots.txt disallows"})
                return None
            status, headers, body = self._raw(current)
            if status in (301, 302, 303, 307, 308) and headers.get("Location"):
                current = _quote(urljoin(current, headers["Location"]))
                continue
            if status in (404, 410):
                return None
            if status != 200:
                raise Held(f"HTTP {status} for {current}")
            if kind == "pdf" and not body.startswith(b"%PDF-"):
                self.log.append({"url": current, "status": status, "at": now(), "note": "not a PDF"})
                return None
            path.write_bytes(body)
            atomic_json(meta, {"url": url, "final_url": current, "status": status, "fetched_at": now(),
                               "sha256": hashlib.sha256(body).hexdigest(),
                               "content_type": headers.get("Content-Type"), "last_modified": headers.get("Last-Modified")})
            return body
        raise Held(f"too many redirects from {url}")

    def receipt(self, url):
        meta = self.cache / (self._key(_quote(url)) + ".json")
        return json.loads(meta.read_text()) if meta.exists() else None

    def html(self, url):
        body = self.get(url, "html")
        return body.decode("utf-8", "replace") if body is not None else None


def _origin(url):
    p = urlsplit(url)
    return f"{p.scheme}://{p.netloc}"


def _quote(url):
    # Spaces and other unsafe characters appear raw in some commission hrefs.
    return re.sub(r"[ \"<>|{}\\^`]", lambda m: "%{:02X}".format(ord(m.group())), url.strip())


# ---- PDF text ---------------------------------------------------------------------------

def pdf_pages(data: bytes, cache: Path = CACHE) -> list[str]:
    """Per-page text of a PDF (physical page order, page 1 first). Cached by content hash.

    PyMuPDF text layer (the project's pinned PDF library); pdftotext as a fallback. No OCR:
    a scanned page without a text layer stays empty, and the record says not_extracted.
    """
    digest = hashlib.sha256(data).hexdigest()
    path = cache / "text" / (digest + ".json")
    if path.exists():
        return json.loads(path.read_text())
    pages = None
    try:
        import pymupdf
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            pages = [p.get_text("text") for p in doc]
    except Exception:  # noqa: BLE001 - fall back to poppler
        pages = None
    if pages is None:
        out = subprocess.run(["pdftotext", "-enc", "UTF-8", "-", "-"], input=data, capture_output=True, timeout=300)
        if out.returncode != 0:
            raise Held("pdftotext failed")
        pages = out.stdout.decode("utf-8", "replace").split("\f")
        if pages and not pages[-1].strip():
            pages = pages[:-1]
    atomic_json(path, pages)
    return pages


def flat(text: str) -> str:
    """One-line form of extracted text: hyphenated line breaks joined, whitespace collapsed."""
    text = re.sub(r"(\w)-\s*\n\s*(?=\w)", r"\1-", text or "")
    text = text.replace("­", "")
    return clean(text) or ""


def _norm(text: str) -> str:
    t = flat(text)
    t = t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    t = t.replace("–", "-").replace("\u2014", "-").replace("\u2011", "-")
    return re.sub(r"\s+", " ", t).lower()


def verbatim(text: str, source: str) -> bool:
    """True when ``text`` appears in ``source`` (same words, whitespace and quotes normalised)."""
    t = _norm(text)
    return bool(t) and t in _norm(source)


# ---- record schema ----------------------------------------------------------------------

def cite(url, document, page=None, section=None):
    c = {"url": url, "document": clean(document)}
    if page is not None:
        c["page"] = int(page)
    if section:
        c["section"] = clean(section)
    return c


def subject(name, kind, citation):
    if kind not in SUBJECT_KINDS:
        raise ValueError(f"subject kind {kind!r}")
    return {"name": clean(name), "kind": kind, "cite": citation}


def finding(label, kind, text, citation, source_text, n=None):
    if kind not in FINDING_KINDS:
        raise ValueError(f"finding kind {kind!r}")
    text = flat(text)
    if not verbatim(text, source_text):
        raise ValueError(f"finding text is not verbatim on the cited page: {text[:120]!r}")
    out = {"label": clean(label), "kind": kind, "text": text, "cite": citation}
    if n is not None:
        out["n"] = n
    return out


def recommendation(number, text, citation, source_text):
    text = flat(text)
    if not verbatim(text, source_text):
        raise ValueError(f"recommendation text is not verbatim on the cited page: {text[:120]!r}")
    return {"number": clean(str(number)) if number is not None else None, "text": text, "cite": citation}


def response(kind, title, url, date=None, recommendation=None, status_as_published=None, text=None, citation=None):
    if kind not in RESPONSE_KINDS:
        raise ValueError(f"response kind {kind!r}")
    out = {"kind": kind, "title": clean(title), "url": url, "date": date}
    if recommendation is not None:
        out["recommendation"] = clean(str(recommendation))
    if status_as_published is not None:
        out["status_as_published"] = clean(status_as_published)
    if text is not None:
        out["text"] = flat(text)
    if citation is not None:
        out["cite"] = citation
    return out


def document(role, title, url, data: bytes | None = None, pages: int | None = None, status="ready"):
    out = {"role": role, "title": clean(title), "url": url, "status": status}
    if data is not None:
        out["sha256"] = hashlib.sha256(data).hexdigest()
        out["bytes"] = len(data)
    if pages is not None:
        out["pages"] = pages
    return out


DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def report_record(body: Body, *, title, page_url, report_type, date=None, date_basis=None, operation=None,
                  type_as_published=None, pdf_url=None, documents=(), subjects=(), findings=None,
                  findings_status="not_extracted", recommendations=None, recommendations_status="not_extracted",
                  responses=None, responses_status="not_checked", notes=(), key=None, summary=None):
    """One report or statement as the commission published it. Raises on a schema breach."""
    if report_type not in REPORT_TYPES:
        raise ValueError(f"report_type {report_type!r}")
    if date is not None and not DATE.match(date):
        raise ValueError(f"date {date!r}")
    if date_basis is not None and date_basis not in DATE_BASES:
        raise ValueError(f"date_basis {date_basis!r}")
    if (date is None) != (date_basis is None):
        raise ValueError("date and date_basis go together")
    for s in (findings_status, recommendations_status):
        if s not in LIST_STATUS:
            raise ValueError(f"status {s!r}")
    if responses_status not in ("published", "none_found", "not_checked"):
        raise ValueError(f"responses_status {responses_status!r}")
    findings, recommendations, responses = list(findings or []), list(recommendations or []), list(responses or [])
    if findings and findings_status != "extracted":
        raise ValueError("findings present but status is not extracted")
    if recommendations and recommendations_status != "extracted":
        raise ValueError("recommendations present but status is not extracted")
    if findings_status == "extracted" and not findings:
        raise ValueError("findings status extracted with no findings; use stated_none or not_extracted")
    if recommendations_status == "extracted" and not recommendations:
        raise ValueError("recommendations status extracted with none; use stated_none or not_extracted")
    title = clean(title)
    if not title or not page_url:
        raise ValueError("title and page_url are required")
    rid = f"{body.id_prefix}-{date or 'undated'}-{slug(key or operation or title, 60)}"
    for i, f in enumerate(findings, 1):
        f.setdefault("n", i)
    return {
        "id": rid, "body": body.code, "jurisdiction": body.jurisdiction, "title": title,
        "operation": clean(operation), "report_type": report_type, "type_as_published": clean(type_as_published),
        "date": date, "date_basis": date_basis, "page_url": page_url, "pdf_url": pdf_url,
        "summary": flat(summary) if summary else None,
        "documents": list(documents), "subjects": list(subjects),
        "findings": findings, "findings_status": findings_status,
        "recommendations": recommendations, "recommendations_status": recommendations_status,
        "responses": responses, "responses_status": responses_status,
        "notes": [clean(n) for n in notes if clean(n)],
    }


def write_snapshot(body: Body, records: list[dict], client: Client | None, gaps=(), min_records=1,
                   allow_shrink=False, cache: Path = CACHE):
    """Validate ids, guard completeness and shrinkage, and write snapshots/<body>.json."""
    ids = [r["id"] for r in records]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        raise Held(f"{body.code}: duplicate record ids {dupes[:5]}")
    if len(records) < min_records:
        raise Held(f"{body.code}: {len(records)} records (minimum {min_records})")
    path = cache / "snapshots" / f"{body.code}.json"
    if path.exists() and not allow_shrink:
        old = json.loads(path.read_text())
        if len(records) < len(old.get("records", [])) * 0.9:
            raise Held(f"{body.code}: records fell from {len(old['records'])} to {len(records)}")
    snap = {
        "schema": SCHEMA, "body": body.code, "name": body.name, "short": body.short, "jurisdiction": body.jurisdiction,
        "site": body.site, "licence": body.licence, "built_at": now(),
        "requests": client.count if client else 0, "gaps": list(gaps),
        "counts": {"records": len(records),
                   "findings": sum(len(r["findings"]) for r in records),
                   "recommendations": sum(len(r["recommendations"]) for r in records),
                   "responses": sum(len(r["responses"]) for r in records)},
        "records": sorted(records, key=lambda r: (r["date"] or "", r["id"]), reverse=True),
        "fetch_log_tail": (client.log[-50:] if client else []),
    }
    atomic_json(path, snap)
    print(f"[integrity] {body.code}: {json.dumps(snap['counts'])}", flush=True)
    return snap
