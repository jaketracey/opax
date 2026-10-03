"""Bounded federal interests refresh. Only facts go to ext_interests; no KB writes.

www.aph.gov.au is fetched through Firecrawl, never with a disguised user agent.
PDFs retain their bytes and geometry for the existing parser (including OCR caveats).
"""
from __future__ import annotations

import base64
from contextlib import closing
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import requests

from parli.ingest import conduct_interests_federal as federal

MAX_CREDITS = 100
STATUS_PATH = Path("~/.cache/autoresearch/pipeline/interests-status.json").expanduser()


class FetchError(Exception):
    """Safe to log: never contains response bodies, headers, or credentials."""


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    tmp.replace(path)


class Firecrawl:
    def __init__(self, cap=MAX_CREDITS, session=None):
        if not 0 <= cap <= MAX_CREDITS:
            raise ValueError(f"credit cap must be between 0 and {MAX_CREDITS}")
        self.cap = cap
        self.requests = self.credits = 0
        self.unknown = 0
        self.key = os.environ.get("FIRECRAWL_API_KEY", "")
        self.session = session or requests.Session()
        self.unavailable = None

    def scrape(self, url, pdf=False, wait_for=3000):
        if not self.key:
            raise FetchError("Firecrawl unavailable: FIRECRAWL_API_KEY is missing")
        if self.unavailable:
            raise FetchError(self.unavailable)
        if self.requests >= self.cap:
            raise FetchError(f"Firecrawl per-run credit cap reached ({self.cap})")
        # Reserve one credit BEFORE the request, even on timeouts/error documents. No
        # hidden retries, paid extraction, PDF parsing, crawl, or proxy escalation.
        self.requests += 1
        payload = {"url": url, "formats": ["rawBase64" if pdf else "rawHtml"], "onlyMainContent": False,
                   "proxy": "basic", "maxAge": 0, "waitFor": wait_for,
                   "parsers": [], "timeout": 60000, "skipTlsVerification": False}
        try:
            r = self.session.post("https://api.firecrawl.dev/v2/scrape", json=payload,
                                  headers={"Authorization": "Bearer " + self.key}, timeout=90)
            result = r.json()
        except (requests.RequestException, ValueError):
            self.unknown += 1
            self.unavailable = "Firecrawl unavailable: request failed (credit reserved; billing unknown)"
            raise FetchError(self.unavailable) from None
        if not isinstance(result, dict) or not isinstance(result.get("data", {}), (dict, type(None))):
            self.unknown += 1
            self.unavailable = "Firecrawl unavailable: invalid response (credit reserved; billing unknown)"
            raise FetchError(self.unavailable)
        data = result.get("data") or {}
        meta = data.get("metadata") or {}
        if not isinstance(meta, dict):
            self.unknown += 1
            self.unavailable = "Firecrawl unavailable: invalid metadata (credit reserved; billing unknown)"
            raise FetchError(self.unavailable)
        charge = meta.get("creditsUsed")
        # The documented one-credit raw scrape can return an error document. Some
        # responses omit creditsUsed; account reconciliation is done by the operator.
        self.credits += charge if isinstance(charge, int) else int(bool(data))
        if isinstance(charge, int) and charge > 1:
            self.unavailable = "Firecrawl unavailable: unexpected credit charge; further requests stopped"
            raise FetchError(self.unavailable)
        if r.status_code == 402:
            self.unavailable = "Firecrawl out of credits (HTTP 402)"
            raise FetchError(self.unavailable)
        if r.status_code in (401, 403, 429):
            self.unavailable = f"Firecrawl unavailable (HTTP {r.status_code})"
            raise FetchError(self.unavailable)
        if r.status_code >= 500:
            # A rendering failure can be URL-specific. Preserve this statement,
            # then try the next one within the same conservative budget.
            raise FetchError(f"Firecrawl unavailable for this page (HTTP {r.status_code})")
        if not r.ok or not result.get("success") or meta.get("statusCode") != 200:
            raise FetchError(f"Firecrawl fetch failed (HTTP {r.status_code}, source {meta.get('statusCode')})")
        if pdf:
            try:
                content = base64.b64decode(data.get("rawBase64", ""), validate=True)
            except (ValueError, TypeError):
                raise FetchError("Firecrawl returned invalid PDF bytes") from None
            if not content.startswith(b"%PDF-"):
                raise FetchError("Firecrawl returned no PDF bytes")
        else:
            content = data.get("rawHtml")
            if not isinstance(content, str) or not content:
                raise FetchError("Firecrawl returned no HTML")
        print(f"[firecrawl] source=200 bytes={len(content)} credits={charge if charge is not None else '1 (inferred)'} proxy=basic", flush=True)
        return content


def cached_json(path):
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def date_settled(revision, fetched_at):
    """A date-only revision can change again during that day. Recheck it once
    after the UTC date closes; opaque PDF revision hashes are already exact."""
    day = federal._iso(revision)
    if not day:
        return True
    try:
        return datetime.fromisoformat(fetched_at).date().isoformat() > day
    except (TypeError, ValueError):
        return False


def house_pdf(entry, dest, client, session):
    path = dest / entry["file"]
    meta = path.with_suffix(path.suffix + ".json")
    cached = cached_json(meta)
    if (path.exists() and path.read_bytes().startswith(b"%PDF-") and entry.get("rev")
            and cached.get("rev") == entry["rev"] and date_settled(entry["rev"], cached.get("fetched_at"))):
        return path, cached.get("fetched_at")
    try:
        r = session.get(entry["url"], timeout=90)
        print(f"[pdf] {entry['file']} status={r.status_code} bytes={len(r.content)}", flush=True)
        if not r.ok or not r.content.startswith(b"%PDF-"):
            raise FetchError("direct PDF unavailable")
        content = r.content
    except (requests.RequestException, FetchError):
        content = client.scrape(entry["url"], pdf=True)
    # Do not replace a cached PDF with a WAF page or a partially downloaded file.
    dest.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".pdf.tmp"); tmp.write_bytes(content); tmp.replace(path)
    fetched_at = stamp()
    write_json(meta, {**entry, "fetched_at": fetched_at})
    return path, fetched_at


def senate_page(entry, dest, client):
    path = dest / (entry["id"] + ".html")
    meta = path.with_suffix(".json")
    cached = cached_json(meta)
    # Old manual caches have no freshness metadata: fetch them once. An undated
    # entry is fetched every run, so a missing source date cannot freeze a statement.
    if (entry.get("last_updated") and cached.get("last_updated") == entry["last_updated"]
            and date_settled(entry["last_updated"], cached.get("fetched_at")) and path.exists()):
        html = path.read_text()
        if "interests-table-collapse" in html:
            return html, cached.get("fetched_at")
    html = client.scrape(entry["url"])
    if "interests-table-collapse" not in html:
        # Rendering occasionally returns the listing rather than the detail.
        # One basic-proxy retry with a longer wait remains inside the shared cap.
        html = client.scrape(entry["url"], wait_for=6000)
        if "interests-table-collapse" not in html:
            raise FetchError("source has no interests blocks after retry (statement unavailable)")
    dest.mkdir(parents=True, exist_ok=True)
    path.write_text(html)
    fetched_at = stamp()
    write_json(meta, {**entry, "fetched_at": fetched_at})
    return html, fetched_at


def retain_house_ids(entries, db_path):
    """The new APH API links must not create duplicate statements for existing people."""
    if not db_path or not Path(db_path).exists():
        return
    with closing(sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)) as conn:
        try:
            old = conn.execute("SELECT doc_id, member_name, electorate, source_url, last_updated FROM ext_interests_documents "
                               "WHERE chamber='house' AND parliament=?", (federal.PARLIAMENT,)).fetchall()
        except sqlite3.OperationalError:
            return
    by_name = {(name, electorate): (doc_id, url, updated) for doc_id, name, electorate, url, updated in old}
    # Preferred-name/spelling changes observed on the new index. Match a
    # canonical GIVEN name and a unique same-Parliament seat, never a surname
    # alone or a first initial (e.g. Antony -> Tony does not share an initial).
    aliases = {"antony": "tony", "anthony": "tony", "james": "jim", "patrick": "pat",
               "thomas": "tom", "llewellyn": "llew", "joshua": "josh", "rebeka": "rebekha"}
    def given(name):
        first = (name or "").split()[0].lower() if name else ""
        return aliases.get(first, first)
    for entry in entries:
        name = federal._normalize_name(f"{entry['surname']}, {entry['given']}") if entry.get("surname") else None
        found = by_name.get((name, entry.get("electorate")))
        if not found:
            candidates = [(doc_id, url, updated) for doc_id, old_name, elec, url, updated in old
                          if elec == entry.get("electorate") and old_name and name and given(old_name) == given(name)]
            found = candidates[0] if len(candidates) == 1 else None
        if found:
            entry["doc_id"] = found[0]
            # Stable across both old static URLs and new API URLs (which end in
            # /48 rather than a filename); otherwise day two redownloads all PDFs.
            entry["file"] = found[0] + ".pdf"
            entry["stored_updated"] = found[2]


def refresh(args):
    client = Firecrawl(args.credit_cap)
    cache = Path(args.cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    summary = {"checked_at": stamp(), "complete": False, "chambers": {},
               "limitations": ["Federal interests refresh interrupted; existing disclosures were preserved."]}
    write_json(args.status, summary)  # a killed run must not leave yesterday's success
    docs, failures = [], []
    chambers = [args.chamber] if args.chamber else ["house", "senate"]
    for chamber in chambers:
        loaded = []
        try:
            url = federal.HOUSE_INDEX_URL if chamber == "house" else federal.SENATE_INDEX_URL
            html = client.scrape(url)
            (cache / f"{chamber}-index.latest.html").write_text(html)
            entries = federal.parse_house_index(html) if chamber == "house" else federal.parse_senate_index(html)
            minimum = 100 if chamber == "house" else 50
            if len(entries) < minimum:
                raise FetchError(f"source index incomplete ({len(entries)} entries)")
            (cache / f"{chamber}-index.html").write_text(html)
            if chamber == "house":
                retain_house_ids(entries, args.db)
            print(f"[{chamber}] index={len(entries)}", flush=True)
            dest = cache / chamber / f"{federal.PARLIAMENT}p"
            session = federal._session()
            for entry in entries:
                label = entry.get("file") or entry["id"]
                try:
                    if (entry.get("stored_updated") and entry.get("last_updated")
                            and entry["last_updated"] < entry["stored_updated"]):
                        raise FetchError("source index date older than stored statement")
                    if chamber == "house":
                        path, fetched_at = house_pdf(entry, dest, client, session)
                        doc = federal.parse_house_pdf(path, {**entry, "fetched_at": fetched_at})
                    else:
                        page, fetched_at = senate_page(entry, dest / "pages", client)
                        doc = federal.parse_senate_page(page, entry["url"], entry["id"])
                        doc.fetched_at = fetched_at
                        doc.last_updated = entry.get("last_updated") or doc.last_updated
                    if not doc.rows:
                        # A partial render/parse must be retried even if the
                        # source revision/date stays the same tomorrow.
                        meta = (dest / (entry["file"] + ".json") if chamber == "house"
                                else dest / "pages" / (entry["id"] + ".json"))
                        meta.unlink(missing_ok=True)
                        raise FetchError("no usable records parsed")
                    loaded.append(doc)
                    print(f"[{chamber}] {label} rows={len(doc.rows)} ocr={doc.ocr_pages} warnings={len(doc.warnings)}", flush=True)
                except FetchError as e:
                    failures.append(f"{chamber} {label}: {e}")
                    print(f"[preserved] {failures[-1]}", flush=True)
                except Exception as e:
                    # Parser errors are per-document, never blank the old statement.
                    failures.append(f"{chamber} {label}: parse/cache failed ({type(e).__name__})")
                    print(f"[preserved] {failures[-1]}", flush=True)
        except FetchError as e:
            failures.append(f"{chamber} index: {e}")
        summary["chambers"][chamber] = {"documents": len(loaded), "rows": sum(len(d.rows) for d in loaded)}
        docs.extend(loaded)
    if args.export_jsonl:
        Path(args.export_jsonl).write_text("".join(json.dumps(federal.doc_to_json(d), ensure_ascii=False) + "\n" for d in docs))
    if args.db and docs and not args.dry_run:
        federal._load_docs(docs, Path(args.db))
    reasons = sorted(set(f.split(": ", 1)[-1] for f in failures))
    summary.update(complete=not failures, failures=failures,
                   credits_used=client.credits, credits_reserved=client.requests,
                   credits_unknown=client.unknown, credit_cap=client.cap,
                   limitations=([f"Federal interests refresh incomplete: {'; '.join(reasons)}. "
                                 f"{len(failures)} unavailable statements/indexes; existing disclosures were preserved."] if failures else []))
    write_json(args.status, summary)
    print(f"[interests] documents={len(docs)} rows={sum(len(d.rows) for d in docs)} preserved={len(failures)} "
          f"credits={client.credits} reserved={client.requests}/{client.cap}", flush=True)
    for line in summary["limitations"]:
        print(line, flush=True)
    return 3 if failures else 0
