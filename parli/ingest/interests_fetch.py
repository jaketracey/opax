"""Bounded federal interests refresh. Only facts go to ext_interests; no KB writes.

All network requests use the shared honest agent. Refused sources are paused.
PDFs retain their bytes and geometry for the existing parser (including OCR caveats).
"""
from __future__ import annotations

from parli.ingest import http as source_http

from contextlib import closing
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from parli.ingest import conduct_interests_federal as federal

MAX_REQUESTS = 100
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


class DirectHTTP:
    """Bounded direct requests; no rendering, proxy or fallback service."""
    def __init__(self, cap=100, session=None):
        self.cap = cap
        self.requests = 0
        self.session = session or source_http.Session()

    def scrape(self, url, pdf=False):
        source_http.ensure_allowed(url)
        if self.requests >= self.cap:
            raise FetchError(f"Direct per-run request cap reached ({self.cap})")
        self.requests += 1
        try:
            r = self.session.get(url, headers={"User-Agent": source_http.USER_AGENT}, timeout=90)
        except requests.RequestException:
            raise FetchError("direct source request failed; existing data kept") from None
        source_http.check_response(url, r.status_code, r.content)
        if not r.ok:
            raise FetchError(f"direct source unavailable (HTTP {r.status_code})")
        if pdf and not r.content.startswith(b"%PDF-"):
            raise FetchError("direct source returned no PDF bytes")
        return r.content if pdf else r.text


def cached_json(path):
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def date_settled(revision, fetched_at):
    """A date-only revision can change again during that day. Recheck it once
    after the Sydney date closes; opaque PDF revision hashes are already exact."""
    day = federal._iso(revision)
    if not day:
        return True
    try:
        fetched = datetime.fromisoformat(fetched_at)
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        return fetched.astimezone(ZoneInfo("Australia/Sydney")).date().isoformat() > day
    except (TypeError, ValueError):
        return False


def house_pdf(entry, dest, client, session):
    path = dest / entry["file"]
    meta = path.with_suffix(path.suffix + ".json")
    cached = cached_json(meta)
    if (path.exists() and path.read_bytes().startswith(b"%PDF-") and entry.get("rev")
            and cached.get("rev") == entry["rev"] and date_settled(entry["rev"], cached.get("fetched_at"))):
        return path, cached.get("fetched_at")
    r = session.get(entry["url"], headers={"User-Agent": source_http.USER_AGENT}, timeout=90)
    source_http.check_response(entry["url"], r.status_code, r.content)
    if not r.ok or not r.content.startswith(b"%PDF-"):
        raise FetchError("direct PDF unavailable; existing data kept")
    content = r.content
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
        # One paced direct retry remains inside the shared request cap.
        html = client.scrape(entry["url"])
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
    try:
        with closing(sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)) as conn:
            old = conn.execute("SELECT doc_id, member_name, electorate, source_url, last_updated, member_name_raw FROM ext_interests_documents "
                               "WHERE chamber='house' AND parliament=?", (federal.PARLIAMENT,)).fetchall()
    except sqlite3.DatabaseError as e:
        if isinstance(e, sqlite3.OperationalError) and str(e) == "no such table: ext_interests_documents":
            return
        raise FetchError(f"House document ID retention unavailable ({type(e).__name__}); chamber preserved") from None
    # The recorded September index misspelled Alison Byrnes as Brynes, but its
    # original PDF filename and document ID are Byrnes. Correct only that verified
    # legacy identity for the exact lookup; never relax the surname fallback.
    for i, (doc_id, name, electorate, url, updated, raw) in enumerate(old):
        if (doc_id == "house-48-byrnes-48p" and name == "Alison Brynes" and electorate == "Cunningham"
                and url.split("?", 1)[0].rsplit("/", 1)[-1] == "Byrnes_48P.pdf"):
            old[i] = (doc_id, "Alison Byrnes", electorate, url, updated, raw.replace("Brynes,", "Byrnes,", 1))
    by_name = {(name, electorate): (doc_id, url, updated) for doc_id, name, electorate, url, updated, raw in old}
    # Preferred-name/spelling changes observed on the new index. Match a
    # canonical GIVEN name and a unique same-Parliament seat, never a surname
    # alone or a first initial (e.g. Antony -> Tony does not share an initial).
    aliases = {"antony": "tony", "anthony": "tony", "james": "jim", "patrick": "pat",
               "thomas": "tom", "llewellyn": "llew", "joshua": "josh", "rebeka": "rebekha"}
    def given(name):
        first = (name or "").split()[0].lower() if name else ""
        return aliases.get(first, first)

    def surname(name, raw=None):
        # The source's comma-separated surname preserves compound family names.
        # Older/synthetic records without it use the conservative full remainder.
        family = (federal._HONORIFIC_ANYWHERE.sub(" ", raw.split(",", 1)[0])
                  if raw and "," in raw else " ".join((name or "").split()[1:]))
        return federal._norm_ws(family).casefold().replace("’", "'")

    names = [federal._normalize_name(f"{e['surname']}, {e['given']}") if e.get("surname") else None for e in entries]
    exact = [by_name.get((name, e.get("electorate"))) for name, e in zip(names, entries)]
    # Reserve ALL exact matches before considering aliases, irrespective of index
    # order. Former and new members can both appear for one seat (e.g. Farrer).
    claimed = {match[0] for match in exact if match}
    for entry, name, found in zip(entries, names, exact):
        if not found:
            family = federal._norm_ws(entry.get("surname") or "").casefold().replace("’", "'")
            candidates = [(doc_id, url, updated) for doc_id, old_name, elec, url, updated, raw in old
                          if doc_id not in claimed and elec == entry.get("electorate") and old_name and name
                          and given(old_name) == given(name) and surname(old_name, raw) == family]
            found = candidates[0] if len(candidates) == 1 else None
        if found:
            claimed.add(found[0])
            entry["doc_id"] = found[0]
            # Stable across both old static URLs and new API URLs (which end in
            # /48 rather than a filename); otherwise day two redownloads all PDFs.
            entry["file"] = found[0] + ".pdf"
            entry["stored_updated"] = found[2]


def refresh(args):
    client = DirectHTTP(getattr(args, "request_cap", MAX_REQUESTS))
    cache = Path(args.cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    summary = {"checked_at": stamp(), "complete": False, "chambers": {}, "held_count": 0, "holds": [],
               "limitations": ["Federal interests refresh interrupted; existing disclosures were preserved."]}
    if args.status:
        write_json(args.status, summary)  # a killed run must not leave yesterday's success
    docs, failures, holds, paused = [], [], [], []
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
                        holds.append({"chamber": chamber, "document": label,
                                      "index_date": entry["last_updated"], "stored_date": entry["stored_updated"]})
                        print(f"[held] {chamber} {label}: source index date older than stored statement", flush=True)
                        continue
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
        except source_http.SourceRefused as e:
            paused.append(chamber)
            summary["paused_sources"] = list(paused)
        except FetchError as e:
            failures.append(f"{chamber} index: {e}")
        summary["chambers"][chamber] = {"documents": len(loaded), "rows": sum(len(d.rows) for d in loaded),
                                         "held": sum(h["chamber"] == chamber for h in holds)}
        docs.extend(loaded)
    if args.export_jsonl and docs:
        Path(args.export_jsonl).write_text("".join(json.dumps(federal.doc_to_json(d), ensure_ascii=False) + "\n" for d in docs))
    if args.db and docs and not args.dry_run:
        federal._load_docs(docs, Path(args.db))
    reasons = sorted(set(f.split(": ", 1)[-1] for f in failures))
    summary.update(complete=not failures and not paused, paused_sources=paused, failures=failures, held_count=len(holds), holds=holds,
                   requests=client.requests, request_cap=client.cap,
                   limitations=([f"Federal interests refresh incomplete: {'; '.join(reasons)}. "
                                 f"{len(failures)} unavailable statements/indexes; existing disclosures were preserved."] if failures else ([source_http.PAUSE_MESSAGE + "; existing disclosures were preserved."] if paused else [])))
    if args.status:
        write_json(args.status, summary)
    print(f"[interests] documents={len(docs)} rows={sum(len(d.rows) for d in docs)} preserved={len(failures)} "
          f"held={len(holds)} requests={client.requests}/{client.cap}", flush=True)
    for line in summary["limitations"]:
        if not line.startswith(source_http.PAUSE_MESSAGE):
            print(line, flush=True)
    return 3 if failures else (4 if paused else 0)
