"""Resumable acquisition of complete, stage-specific federal bill text.

Only observed billhome version identifiers are followed. The section walker
never treats an error or a configured cap as an end-of-document signal. Each
successful section commits independently; a restart reuses those sections.
"""
from __future__ import annotations

import hashlib
import fcntl
import os
import json
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.words_parlinfo import parse_billhome, parse_display, page_title
from parli.ingest.words_common import parse_date

HOST = "https://parlinfo.aph.gov.au"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
VERSION_RE = re.compile(r"^[rs]\d+_[a-z0-9-]+$")
BILL_KEY_RE = re.compile(r"^au-federal-[a-z0-9-]+$")
STAGE_LABELS = {"first": "As introduced", "first-reps": "First reading — House of Representatives", "first-senate": "First reading — Senate", "third-reps": "Third reading — House of Representatives", "third-senate": "Third reading — Senate", "aspassed": "As passed by both houses"}
STAGE_ORDER = {"aspassed": 60, "third-senate": 50, "third-reps": 40, "first-senate": 30, "first-reps": 20, "first": 10}
LICENCE = "Australian parliamentary bill text; source site terms apply. Plain-text extraction preserves the source wording."


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def digest(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def display_url(source_id):
    return HOST + "/parlInfo/search/display/display.w3p;query=" + urllib.parse.quote('Id:"' + source_id + '"')


def source_code(doc):
    """Join only via canonical billhome source identity, never fuzzy titles."""
    codes = set()
    for source in doc.get("sources") or []:
        if source.get("kind") == "billhome":
            match = re.search(r"legislation/billhome/([rs]\d+)", urllib.parse.unquote(source.get("url", "")))
            if match:
                codes.add(match[1])
    direct = re.fullmatch(r"au-federal-([rs]\d+)", doc["key"])
    if direct:
        codes.add(direct[1])
    if len(codes) != 1:
        return None
    return next(iter(codes))


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(path)


def open_state(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=60)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS bill_text_bills (
      bill_key TEXT PRIMARY KEY, title TEXT NOT NULL, code TEXT,
      doc_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      note TEXT, discovered_at TEXT
    );
    CREATE TABLE IF NOT EXISTS bill_text_versions (
      bill_key TEXT NOT NULL, source_version TEXT NOT NULL, stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', note TEXT, terminal_json TEXT,
      updated_at TEXT, PRIMARY KEY(bill_key,source_version)
    );
    CREATE TABLE IF NOT EXISTS bill_text_identity_links (
      bill_key TEXT PRIMARY KEY, code TEXT NOT NULL, evidence_json TEXT NOT NULL, verified_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bill_text_publications (
      slug TEXT PRIMARY KEY, content_hash TEXT NOT NULL, published_at TEXT NOT NULL, outcome TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bill_text_sections (
      bill_key TEXT NOT NULL, source_version TEXT NOT NULL, section_no INTEGER NOT NULL,
      title TEXT, body TEXT NOT NULL, source_url TEXT NOT NULL, source_date TEXT,
      source_sha256 TEXT NOT NULL, fetched_at TEXT NOT NULL,
      PRIMARY KEY(bill_key,source_version,section_no)
    );
    """)
    return db


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class SourceUnavailable(RuntimeError):
    """An expected source gap; retry is bounded and it never proves completeness."""


class SourceBlocked(RuntimeError):
    pass


class SourceFetcher:
    """Cache source bytes, pace every request, and stop on repeated refusals."""
    def __init__(self, cache_dir, rate=0.7, browser_ua=False, timeout=45):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.interval = 1 / rate if rate > 0 else 1 / 0.7
        self.browser_ua = browser_ua
        self.timeout = timeout
        self.last_request = 0
        self.refusals = 0
        self.opener = urllib.request.build_opener(NoRedirect())

    def invalidate(self, url):
        """A200 error page must not poison every future resumed acquisition."""
        (self.cache_dir / (digest(url) + ".json")).unlink(missing_ok=True)

    def get(self, url, refresh=False):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != "parlinfo.aph.gov.au" or not parsed.path.startswith("/parlInfo/search/display/"):
            raise ValueError("Only ParlInfo display pages are supported; downloads are not requested")
        path = self.cache_dir / (digest(url) + ".json")
        if path.exists() and not refresh:
            return json.loads(path.read_text())
        if not self.browser_ua:
            raise ValueError("Network acquisition requires explicit --browser-ua; cached operation remains available")
        wait = self.last_request + self.interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self.last_request = time.monotonic()
        try:
            with self.opener.open(urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html", "Accept-Language": "en-AU,en;q=0.9"}), timeout=self.timeout) as response:
                raw = response.read()
                result = {"status": response.status, "url": url, "body": raw.decode("utf-8", "replace"), "location": None, "sha256": digest(raw), "fetched_at": now()}
        except urllib.error.HTTPError as error:
            result = {"status": error.code, "url": url, "body": "", "location": error.headers.get("Location"), "sha256": None, "fetched_at": now()}
        if result["status"] == 403:
            self.refusals += 1
            if self.refusals >= 5:
                raise SourceBlocked("Five consecutive ParlInfo403 responses; stopped without marking sections complete")
        else:
            self.refusals = 0
        # Never cache transient HTTP errors or unverified redirect terminals.
        if result["status"] == 200:
            atomic_json(path, result)
        return result


def terminal_redirect(response):
    if response.get("status") not in (301, 302, 303, 307, 308):
        return False
    location = urllib.parse.urljoin(response["url"], response.get("location") or "")
    parsed = urllib.parse.urlparse(location)
    return parsed.hostname == "parlinfo.aph.gov.au" and parsed.path.startswith("/parlInfo/search/summary/")


def load_documents(bills_dir, keys=None, parliaments=None):
    paths = [Path(bills_dir) / f"{key}.json" for key in keys] if keys else sorted(Path(bills_dir).glob("*.json"))
    docs = []
    for path in paths:
        if path.name == "index.json":
            continue
        doc = json.loads(path.read_text())
        if doc.get("jurisdiction") != "federal" or not BILL_KEY_RE.fullmatch(doc.get("key", "")):
            continue
        if parliaments and doc.get("parliament") not in parliaments:
            continue
        docs.append(doc)
    return sorted(docs, key=lambda d: (d.get("introduced") or "", d["key"]), reverse=True)


def register_documents(db, documents):
    for doc in documents:
        db.execute("INSERT INTO bill_text_bills(bill_key,title,code,doc_json) VALUES(?,?,?,?) ON CONFLICT(bill_key) DO UPDATE SET title=excluded.title,code=coalesce(excluded.code,(SELECT code FROM bill_text_identity_links WHERE bill_key=excluded.bill_key)),doc_json=excluded.doc_json", (doc["key"], doc["title"], source_code(doc), json.dumps(doc, ensure_ascii=False)))
    db.commit()


def discover(db, doc, fetcher, home_cache=None, refresh=False):
    key, code = doc["key"], source_code(doc)
    if not code:
        identity = db.execute("SELECT code FROM bill_text_identity_links WHERE bill_key=?", (key,)).fetchone()
        code = identity["code"] if identity else None
    if not code:
        db.execute("UPDATE bill_text_bills SET status='unavailable',note=?,discovered_at=? WHERE bill_key=?", ("No unambiguous canonical ParlInfo billhome identity", now(), key))
        db.commit()
        return []
    cached = Path(home_cache) / f"{code}.html" if home_cache else None
    if cached and cached.exists() and not refresh:
        source = cached.read_text(errors="replace")
    else:
        response = fetcher.get(display_url("legislation/billhome/" + code), refresh=refresh)
        if response["status"] != 200:
            raise SourceUnavailable(f"Billhome HTTP{response['status']}")
        source = response["body"]
    versions = [v for v in parse_billhome(source)[0] if VERSION_RE.fullmatch(v) and v.startswith(code + "_")]
    # A blocked/fallback document must remain retryable; no-version billhome is
    # only a known absence when the source actually identifies this billhome.
    if not versions and "bills-progress" not in source:
        raise SourceUnavailable("Billhome page did not contain a recognisable registry document")
    for version in versions:
        db.execute("INSERT OR IGNORE INTO bill_text_versions(bill_key,source_version,stage) VALUES(?,?,?)", (key, version, version.split("_", 1)[1]))
    db.execute("UPDATE bill_text_bills SET status=?,note=?,discovered_at=? WHERE bill_key=?", ("discovered" if versions else "unavailable", None if versions else "No inline bill text versions linked by the billhome", now(), key))
    db.commit()
    return versions


def walk_version(db, bill_key, version, fetcher, max_sections=1000):
    row = db.execute("SELECT * FROM bill_text_versions WHERE bill_key=? AND source_version=?", (bill_key, version)).fetchone()
    if row and row["status"] == "complete" and version_document(db, bill_key, version)["complete"]:
        return "unchanged"
    db.execute("UPDATE bill_text_versions SET status='incomplete',note='Acquisition in progress',updated_at=? WHERE bill_key=? AND source_version=?", (now(), bill_key, version))
    db.commit()
    try:
        for number in range(max_sections):
            exists = db.execute("SELECT 1 FROM bill_text_sections WHERE bill_key=? AND source_version=? AND section_no=?", (bill_key, version, number)).fetchone()
            if exists:
                continue
            pid = f"legislation/bills/{version}/{number:04d}"
            url = display_url(pid)
            response = fetcher.get(url)
            if terminal_redirect(response) and number > 0:
                db.execute("UPDATE bill_text_versions SET status='complete',note=?,terminal_json=?,updated_at=? WHERE bill_key=? AND source_version=?", (f"All {number} contiguous source sections acquired; next section redirects to source summary", json.dumps({"section": number, "status": response["status"], "location": response["location"], "checked_at": response["fetched_at"]}), now(), bill_key, version))
                db.commit()
                return "complete"
            if response["status"] != 200:
                raise SourceUnavailable(f"Section{number:04d}: HTTP{response['status']} is not a verified end-of-document")
            fields, body = parse_display(response["body"])
            identity = fields.get("System Id") or fields.get("System ID")
            if not identity or identity.strip() != pid:
                if hasattr(fetcher, "invalidate"): fetcher.invalidate(url)
                raise SourceUnavailable(f"Section{number:04d}: missing or mismatched source identity")
            if not body:
                if hasattr(fetcher, "invalidate"): fetcher.invalidate(url)
                raise SourceUnavailable(f"Section{number:04d}: no readable source text; retained as incomplete")
            db.execute("INSERT INTO bill_text_sections VALUES(?,?,?,?,?,?,?,?,?)", (bill_key, version, number, page_title(response["body"]) or fields.get("Title") or f"Section{number:04d}", body, url, parse_date(fields.get("Date")), response.get("sha256") or digest(response["body"]), response["fetched_at"]))
            db.commit()
        raise SourceUnavailable(f"Reached configured{max_sections}-section cap without verified end-of-document")
    except Exception as error:
        db.execute("UPDATE bill_text_versions SET status='incomplete',note=?,updated_at=? WHERE bill_key=? AND source_version=?", (str(error), now(), bill_key, version))
        db.commit()
        if not isinstance(error, (SourceUnavailable, urllib.error.URLError, TimeoutError)):
            raise
        return "incomplete"


def version_document(db, bill_key, version):
    bill = db.execute("SELECT * FROM bill_text_bills WHERE bill_key=?", (bill_key,)).fetchone()
    row = db.execute("SELECT * FROM bill_text_versions WHERE bill_key=? AND source_version=?", (bill_key, version)).fetchone()
    sections = [dict(s) for s in db.execute("SELECT * FROM bill_text_sections WHERE bill_key=? AND source_version=? ORDER BY section_no", (bill_key, version))]
    try:
        terminal = json.loads(row["terminal_json"] or "{}")
    except (TypeError, ValueError):
        terminal = {}
    terminal_valid = terminal.get("section") == len(sections) and terminal_redirect({**terminal, "url": display_url(f"legislation/bills/{version}/{len(sections):04d}")})
    complete = row["status"] == "complete" and terminal_valid and bool(sections) and [s["section_no"] for s in sections] == list(range(len(sections)))
    blocks = [{"id": f"section-{s['section_no']:04d}", "title": s["title"], "text": s["body"], "source_url": s["source_url"], "sha256": s["source_sha256"]} for s in sections]
    text = "\n\n".join(s["text"] for s in blocks)
    identifier = version.replace("_", "-")
    dates = sorted({s["source_date"] for s in sections if s["source_date"]})
    meta = {"id": identifier, "source_version": version, "stage": row["stage"], "stage_label": STAGE_LABELS.get(row["stage"], row["stage"]), "date": dates[0] if len(dates) == 1 else None,
            "source_url": display_url(f"legislation/bills/{version}/0000"), "format": "html", "status": "complete" if complete else "incomplete" if sections else "unavailable", "text_url": f"/bill-texts/{bill_key}/{identifier}.json" if sections else None,
            "characters": len(text), "pages": None, "sections": len(blocks), "coverage_note": row["note"], "sha256": digest(text), "fetched_at": row["updated_at"]}
    return {"bill_key": bill_key, "title": bill["title"], "version": meta, "text": text, "sections": blocks, "complete": complete}


def _export_snapshot(db, output_dir):
    output = Path(output_dir)
    summary = {"generated_at": now(), "bills": 0, "bills_with_text": 0, "versions": 0, "complete_versions": 0, "incomplete_versions": 0, "characters": 0, "records": []}
    for bill in db.execute("SELECT * FROM bill_text_bills ORDER BY bill_key"):
        versions = []
        for row in db.execute("SELECT source_version FROM bill_text_versions WHERE bill_key=?", (bill["bill_key"],)):
            doc = version_document(db, bill["bill_key"], row["source_version"])
            meta = doc["version"]
            if meta["text_url"]:
                atomic_json(output / bill["bill_key"] / (meta["id"] + ".json"), doc)
            versions.append(meta)
            summary["versions"] += 1
            summary["complete_versions" if doc["complete"] else "incomplete_versions"] += 1
            summary["characters"] += meta["characters"]
        versions.sort(key=lambda v: (STAGE_ORDER.get(v["stage"], 0), v["date"] or "", v["source_version"]), reverse=True)
        complete = [v for v in versions if v["status"] == "complete"]
        default = (complete or [v for v in versions if v["text_url"]] or [None])[0]
        manifest = {"bill_key": bill["bill_key"], "title": bill["title"], "generated_at": now(), "status": "complete" if complete and len(complete) == len(versions) else "incomplete" if versions else "unavailable", "versions": versions, "default_version_id": default["id"] if default else None,
                    "coverage_note": "Each version is a separate source stage. Complete means every contiguous inline source section was acquired and the next section redirected to the source summary. Incomplete versions are not full bill text.", "discovery_note": bill["note"]}
        atomic_json(output / bill["bill_key"] / "index.json", manifest)
        summary["bills"] += 1
        summary["bills_with_text"] += bool(complete)
        summary["records"].append({"bill_key": bill["bill_key"], "status": manifest["status"], "complete_versions": len(complete), "versions": len(versions)})
    atomic_json(output / "index.json", summary)
    return summary


def export_state(db, output_dir):
    """One consistent DB snapshot, with all filesystem exporters serialized.

    A separate `export` command may run while the crawler writes sections. WAL
    readers do not block acquisition, and manifests cannot race body writers.
    """
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    with (output / ".export.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        own_transaction = not db.in_transaction
        if own_transaction:
            db.execute("BEGIN")
        try:
            return _export_snapshot(db, output)
        finally:
            if own_transaction:
                db.rollback()  # read-only snapshot; leave no open transaction
            fcntl.flock(lock, fcntl.LOCK_UN)


def resource_body(doc, registry):
    if not doc["complete"] or doc["version"]["status"] != "complete":
        raise ValueError("Incomplete source versions must not be published as bill_text")
    version = doc["version"]
    title = f"{doc['title']} — {version['stage_label']}"
    slug = f"bill-text-{doc['bill_key']}-{version['stage']}"
    labels = [{"labelset": "bill_key", "label": doc["bill_key"]}, {"labelset": "kind", "label": "bill_text"}, {"labelset": "state", "label": "federal"}, {"labelset": "bill_stage", "label": version["stage"]}]
    if registry.get("parliament"):
        labels.append({"labelset": "parliament", "label": str(registry["parliament"])})
    date = version["date"] or registry.get("introduced")
    if date:
        labels.append({"labelset": "decade", "label": date[:3] + "0s"})
    if doc["text"] != "\n\n".join(section["text"] for section in doc["sections"]):
        raise ValueError("Full text must exactly equal the complete section sequence")
    sections, offset = [], 0
    for section in doc["sections"]:
        length = len(section["text"].encode("utf-16-le")) // 2
        sections.append({**{key: section[key] for key in ("id", "title", "source_url", "sha256")}, "start": offset, "end": offset + length})
        offset += length + 2  # exact two-newline separator; JavaScript string offsets
    metadata = {"title": doc["title"], "stage_label": version["stage_label"], "characters": len(doc["text"]), "section_offset_unit": "utf16", "bill_key": doc["bill_key"], "source_version": version["source_version"], "version_id": version["id"], "stage": version["stage"], "date": version["date"], "source_url": version["source_url"], "page": f"/bill/{doc['bill_key']}?text-version={version['id']}#bill-full-text", "text_url": version["text_url"], "complete": True, "section_count": len(doc["sections"]), "source_text_sha256": version["sha256"], "licence": LICENCE,
                "sections": sections}
    metadata["content_hash"] = digest(json.dumps({"title": title, "text": doc["text"], "labels": labels, "metadata": metadata}, sort_keys=True, ensure_ascii=False))
    return {"slug": slug, "title": title, "texts": {"body": {"body": doc["text"], "format": "PLAIN"}}, "origin": {"source_id": "opax-bill-text", "url": version["source_url"], **({"created": date + "T00:00:00Z"} if date else {})}, "usermetadata": {"classifications": labels}, "extra": {"metadata": metadata}}


def publish_resource(db, kb, body, limiter, push, verify=False, publication_scope=""):
    """Skip proven successful writes locally; --verify rechecks the remote KB."""
    slug, content_hash = publication_scope + ":" + body["slug"], body["extra"]["metadata"]["content_hash"]
    previous = db.execute("SELECT content_hash FROM bill_text_publications WHERE slug=?", (slug,)).fetchone()
    if not verify and previous and previous["content_hash"] == content_hash:
        return "cached"
    outcome = push(kb, body, False, limiter)
    if outcome in ("created", "updated", "unchanged"):
        db.execute("INSERT INTO bill_text_publications(slug,content_hash,published_at,outcome) VALUES(?,?,?,?) ON CONFLICT(slug) DO UPDATE SET content_hash=excluded.content_hash,published_at=excluded.published_at,outcome=excluded.outcome", (slug, content_hash, now(), outcome))
        db.commit()
    return outcome
