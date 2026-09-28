"""
parli.ingest.committee_hearings -- Ingest Australian federal committee hearing transcripts from ParlInfo:
Senate Estimates (`estimate`), other Senate committees (`commsen`), House committees (`commrep`) and Joint
committees (`commjnt`).

Data source: parlinfo.aph.gov.au (the Firefox user agent below is required: the WAF refuses honest ones).

  discovery   the ParlInfo summary listing for a date window (one row per transcript fragment, all four datasets in one
              query). The RSS feed gives 15 items and the estimates schedule page only estimates, so neither is used
              by default. A window that returns more than one page of results is split in half until each piece fits.
  sync        per hearing: the TOC (fragment 0000: Proof / Final status), every fragment (cached, gzip, under
              $OPAX_ATTENDANCE_CACHE so `committee_witnesses fetch` reads the same copy instead of asking again),
              parsed into turns (parli.ingest.committee_transcript) and stored as `speeches` rows with the label the
              transcript prints, the parser's speaker_type and the member's Parliamentary Handbook id.
  refresh     a hearing is published as a Proof transcript and replaced by the Final some weeks or months later, and the
              two can differ. A hearing whose status is not Final is fetched again weekly for 60 days after it was first
              seen; each re-fetched fragment is compared by content hash and, when it changed, its turns are matched to
              the stored rows (same speaker and text, then the closest text) and updated IN PLACE, so the speech ids
              (and the knowledge box's `speech-<id>` slugs) do not change. Turns the Final adds are inserted as new rows.
              The knowledge-box copy of a changed row is updated by a text-only PATCH, queued in
              `ext_kb_patch_queue` with reason 'text:proof_to_final' (sent at the end of the run when OPAX_SYNC_KB=1).

Who is speaking is decided later by parli.ingest.committee_witnesses.

Usage (the nightly runs it with no arguments: the last 45 days plus due refreshes):
    python -m parli.ingest.committee_hearings
    python -m parli.ingest.committee_hearings --since 2025-07-01            # backfill the 48th Parliament
    python -m parli.ingest.committee_hearings --since 2025-07-01 --adopt-legacy   # also check estimates rows stored before this ingest
    python -m parli.ingest.committee_hearings --set commrep --limit 5 --db /tmp/scratch.db
    OPAX_COMMITTEES_SINCE=2025-07-01 python -m parli.ingest.committee_hearings    # same, for scripts that cannot pass flags
Legacy discovery is still available: --schedule (estimates schedule page), --discover --id-start N --id-end M.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import html as htmlmod
import os
import re
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, unquote

import requests

from parli.ingest.committee_store import (
    PARSER_VERSION, ensure_speech_columns, ensure_tables, read_cached_page, write_cached_page,
)
from parli.ingest.committee_transcript import (  # noqa: F401  (re-exported: other code imports these from here)
    CHAMBER_MAP, COMMITTEE_SOURCES, DATASET_MAP, DATASETS, HearingMetadata, SpeechRecord, fragment_hash,
    fragment_url, group_listing, hearing_hash, listing_url, parse_fragment, parse_listing, parse_toc,
    parse_witness_list, toc_url,
)
from parli.ingest.committee_witnesses import ATT_DDL, CACHE_DIR as ATTENDANCE_CACHE_DIR, QUEUE_DDL
from parli.ingest.dedup import LazyDateSeen
from parli.schema import get_db, init_db

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PARLINFO_BASE = "https://parlinfo.aph.gov.au"
ESTIMATES_SCHEDULE_URL = (
    "https://www.aph.gov.au/Parliamentary_Business/Hansard/"
    "Estimates_Transcript_Schedule"
)

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
)

RATE_LIMIT_SECS = 1.0  # Minimum seconds between requests
REQUEST_TIMEOUT = 45   # Seconds
BATCH_SIZE = 200

DEFAULT_DAYS_BACK = 45      # nightly discovery window
REFRESH_DAYS = 60           # a non-Final hearing is re-checked for this long after it was first seen ...
REFRESH_EVERY_DAYS = 7      # ... at most this often
RETRY_INCOMPLETE_EVERY_DAYS = 1
LISTING_PAGE_SIZE = 100

REFRESH_REASON = "text:proof_to_final"

HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"[ \t]+")


def page_text(resp) -> str:
    """The response body as UTF-8. ParlInfo sends `content-type: text/html` with no charset, which `requests` reads as
    ISO-8859-1, so a raw non-ASCII character (a name like Zoë) would come out as mojibake."""
    content = getattr(resp, "content", None)
    if isinstance(content, (bytes, bytearray)):
        return bytes(content).decode("utf-8", errors="replace")
    return resp.text


class SourceBlocked(RuntimeError):
    """ParlInfo answered 403 / 429 repeatedly: stop, do not hammer it."""


def log(*a) -> None:
    print(*a, flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Rate-limited HTTP session
# ---------------------------------------------------------------------------

class RateLimitedSession:
    """HTTP session with automatic rate limiting, retries on network errors / 5xx, and a stop on repeated 403/429."""

    def __init__(self, rate_limit: float = RATE_LIMIT_SECS, retries: int = 3, session=None,
                 sleep=time.sleep, clock=time.time):
        self.session = session or requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml",
        })
        self.rate_limit = rate_limit
        self.retries = retries
        self._sleep = sleep
        self._clock = clock
        self._last_request_time = 0.0
        self.blocked = 0
        self.requests = 0

    def get(self, url: str, **kwargs) -> requests.Response:
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        backoff = 2.0
        for attempt in range(self.retries):
            elapsed = self._clock() - self._last_request_time
            if elapsed < self.rate_limit:
                self._sleep(self.rate_limit - elapsed)
            self._last_request_time = self._clock()
            self.requests += 1
            try:
                resp = self.session.get(url, **kwargs)
            except requests.RequestException:
                if attempt == self.retries - 1:
                    raise
                self._sleep(backoff)
                backoff *= 2
                continue
            if resp.status_code in (403, 429):
                self.blocked += 1
                if self.blocked >= 3:
                    raise SourceBlocked(f"ParlInfo answered {resp.status_code} {self.blocked} times running; stopping")
                return resp
            self.blocked = 0
            if resp.status_code >= 500 and attempt < self.retries - 1:
                self._sleep(backoff)
                backoff *= 2
                continue
            return resp
        raise requests.RequestException(f"gave up on {url}")


# ---------------------------------------------------------------------------
# Raw page cache (gzip). committee_witnesses reads the same files.
# ---------------------------------------------------------------------------

class FragmentCache:
    """Raw ParlInfo pages, one gzip file per fragment: <dir>/committees-commrep-29882-0001.html.gz."""

    def __init__(self, path: str | Path | None = None):
        self.dir = Path(path or ATTENDANCE_CACHE_DIR).expanduser()

    def read(self, base: str, frag: str) -> str | None:
        return read_cached_page(self.dir, base, frag)

    def write(self, base: str, frag: str, page: str) -> None:
        write_cached_page(self.dir, base, frag, page)

    def get(self, http: RateLimitedSession, base: str, frag: str, refresh: bool = False) -> str | None:
        """The page from the cache, or from ParlInfo (and cached) when absent or `refresh`. None when it cannot be had."""
        if not refresh:
            cached = self.read(base, frag)
            if cached:
                return cached
        url = toc_url(base) if frag == "0000" else fragment_url(base, frag)
        try:
            resp = http.get(url)
        except requests.RequestException as e:
            log(f"    Error fetching {base}/{frag}: {e}")
            return None
        # a fragment page always carries the transcript container; an error page or a stub does not
        text = page_text(resp)
        if resp.status_code != 200 or (frag != "0000" and "documentContent" not in text):
            log(f"    {base}/{frag}: HTTP {resp.status_code}")
            return None
        self.write(base, frag, text)
        return text


# ---------------------------------------------------------------------------
# Schema migration
# ---------------------------------------------------------------------------

def migrate_committee_columns(db: sqlite3.Connection) -> None:
    """Add the committee-related columns to the speeches table if needed."""
    ensure_speech_columns(db, say=log)


def ensure_schema(db: sqlite3.Connection) -> None:
    init_db(db)
    migrate_committee_columns(db)
    ensure_tables(db)
    db.executescript(ATT_DDL)
    db.executescript(QUEUE_DDL)
    db.commit()


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def _get_listing(http: RateLimitedSession, start: date, end: date, page: int, datasets, res_count: int):
    resp = http.get(listing_url(start, end, page=page, datasets=tuple(datasets), res_count=res_count))
    resp.raise_for_status()
    return parse_listing(page_text(resp))


def _list_window(http, start: date, end: date, datasets, res_count: int, out: dict) -> None:
    """Every fragment result dated start..end. A window whose total exceeds one page is cut into equal parts sized to
    fill about 60% of a page each (a listing page takes ~3 s, so a plain halving would cost twice the requests), and
    each part is listed the same way. Paging one long query is not used: results tie on fragment number, so pages of a
    single query can repeat or skip an entry."""
    page = _get_listing(http, start, end, 0, datasets, res_count)
    if page.total == 0 and not page.entries:
        return
    if page.total <= len(page.entries):
        for e in page.entries:
            out[(e.hearing_id, e.fragment)] = e
        return
    span = (end - start).days + 1
    if span > 1:
        parts = min(span, max(2, -(-page.total // max(1, int(res_count * 0.6)))))
        step = -(-span // parts)
        lo = start
        while lo <= end:
            hi = min(end, lo + timedelta(days=step - 1))
            _list_window(http, lo, hi, datasets, res_count, out)
            lo = hi + timedelta(days=1)
        return
    # one day with more results than a page: page through it and warn if the count does not add up
    day: dict = {(e.hearing_id, e.fragment): e for e in page.entries}
    n = 1
    while len(day) < page.total and n < 50:
        nxt = _get_listing(http, start, end, n, datasets, res_count)
        if not nxt.entries:
            break
        day.update({(e.hearing_id, e.fragment): e for e in nxt.entries})
        n += 1
    out.update(day)
    if len(day) < page.total:
        log(f"  WARNING: {start} lists {page.total} results but only {len(day)} were read")


def discover_from_listing(http: RateLimitedSession, since: date, until: date,
                          datasets: tuple[str, ...] = DATASETS, res_count: int = LISTING_PAGE_SIZE) -> list[HearingMetadata]:
    """The hearings dated since..until (inclusive) from the ParlInfo summary listing."""
    log(f"Discovering hearings {since} .. {until} from the ParlInfo listing ({', '.join(datasets)})...")
    found: dict = {}
    _list_window(http, since, until, datasets, res_count, found)
    hearings = group_listing(list(found.values()))
    log(f"  {len(found)} fragments in {len(hearings)} hearings")
    return hearings


def discover_from_estimates_schedule(http: RateLimitedSession) -> list[HearingMetadata]:
    """Scrape the Estimates Transcript Schedule page for hearing links (the pre-2026-09 discovery; estimates only)."""
    log("Discovering hearings from Estimates Transcript Schedule...")
    resp = http.get(ESTIMATES_SCHEDULE_URL)
    resp.raise_for_status()
    html = resp.text
    pattern = re.compile(
        r'href="((?:https?://)?parlinfo\.aph\.gov\.au/parlInfo/search/display/'
        r'display\.w3p[^"]*)"',
        re.IGNORECASE,
    )
    hearings: dict[str, HearingMetadata] = {}
    for match in pattern.finditer(html):
        url = match.group(1)
        if not url.startswith("http"):
            url = PARLINFO_BASE + url
        id_match = re.search(r'committees/(estimate|commsen|commrep|commjnt)/(\d+)/(\d+)', url)
        if not id_match:
            id_match = re.search(r'committees/(estimate|commsen|commrep|commjnt)/(\d+)/(\d+)', unquote(url))
        if not id_match:
            continue
        dataset, hearing_num = id_match.group(1), id_match.group(2)
        hearing_id = f"committees/{dataset}/{hearing_num}"
        if hearing_id not in hearings:
            hearings[hearing_id] = HearingMetadata(hearing_id=hearing_id, dataset=dataset, url=url)
    result = list(hearings.values())
    log(f"  Found {len(result)} hearings from Estimates Schedule")
    return result


def discover_by_id_range(http: RateLimitedSession, dataset: str = "estimate",
                         id_start: int = 29300, id_end: int = 29400) -> list[HearingMetadata]:
    """Discover hearings by probing ParlInfo with sequential IDs."""
    log(f"Probing ParlInfo for {dataset} IDs {id_start}-{id_end}...")
    hearings = []
    for i in range(id_start, id_end + 1):
        hearing_id = f"committees/{dataset}/{i}"
        try:
            resp = http.get(toc_url(hearing_id))
            if resp.status_code == 200 and "Not Found" not in resp.text[:500]:
                hearings.append(HearingMetadata(hearing_id=hearing_id, dataset=dataset, url=toc_url(hearing_id)))
                log(f"  Found: {hearing_id}")
        except requests.RequestException:
            pass
    log(f"  Found {len(hearings)} hearings by ID probing")
    return hearings


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def text_hash(text: str) -> str:
    """Short SHA-256 hex digest for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def build_dedup_index(db: sqlite3.Connection) -> LazyDateSeen:
    """Dedup keys of existing committee speeches, loaded a hearing date at a time as hearings are
    ingested (a key has the hearing's date, so no other date's rows can match)."""
    return LazyDateSeen(db, text_hash, sources=COMMITTEE_SOURCES)


def get_ingested_hearings(db: sqlite3.Connection, since: str | None = None) -> set[str]:
    """Hearing ids (committees/<dataset>/<n>) that already have rows: synced by this ingest, or stored by the older one.

    `since` limits the scan to rows dated that day or later so it uses the (source, date) index instead of reading
    every hearing_id in the 29 GB table."""
    known: set[str] = set()
    try:
        known |= {r[0] for r in db.execute("SELECT hearing_base FROM ext_committee_hearings")}
    except sqlite3.OperationalError:
        pass
    try:
        sql = "SELECT DISTINCT hearing_id FROM speeches WHERE source IN (%s) AND hearing_id IS NOT NULL" % ",".join("?" * len(COMMITTEE_SOURCES))
        params: list = list(COMMITTEE_SOURCES)
        if since:
            sql += " AND date >= ?"
            params.append(since)
        known |= {r[0].rsplit("/", 1)[0] for r in db.execute(sql, params) if r[0]}
    except sqlite3.OperationalError:
        pass
    return known


def _execute_with_retry(db: sqlite3.Connection, sql: str, params: tuple, retries: int = 15) -> None:
    """Execute SQL with retry on database lock."""
    for attempt in range(retries):
        try:
            db.execute(sql, params)
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < retries - 1:
                time.sleep(3 * (attempt + 1))
            else:
                raise


def _commit_with_retry(db: sqlite3.Connection, retries: int = 5) -> None:
    for attempt in range(retries):
        try:
            db.commit()
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise


def save_speeches(db: sqlite3.Connection, speeches: list[SpeechRecord], seen) -> int:
    """Insert turns into `speeches`. Returns the number inserted. Turns under 50 characters and exact repeats
    (same label, date and text) are skipped."""
    count = 0
    for sp in speeches:
        if len(sp.text) < 50:
            continue
        dedup_key = f"{sp.speaker_name}|{sp.date}|{text_hash(sp.text)}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        source = DATASET_MAP.get(sp.dataset, "committee_senate")
        chamber = CHAMBER_MAP.get(sp.dataset, "senate_committee")
        witness_name = sp.speaker_name if sp.speaker_type == "witness" else None
        _execute_with_retry(
            db,
            """
            INSERT INTO speeches
            (person_id, speaker_name, party, electorate, chamber,
             date, topic, text, word_count, source, state,
             hearing_type, witness_name, hearing_id, speaker_type, handbook_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                None,                # person_id: committee_witnesses resolve links members by Handbook id
                sp.speaker_name,
                None,                # party
                None,                # electorate
                chamber,
                sp.date,
                sp.topic,
                sp.text,
                len(sp.text.split()),
                source,
                "federal",
                "estimates" if sp.dataset == "estimate" else "committee",
                witness_name,
                sp.hearing_id,
                sp.speaker_type,
                sp.handbook_id,
            ),
        )
        count += 1
    return count


# ---------------------------------------------------------------------------
# Matching stored rows to a re-parsed fragment
# ---------------------------------------------------------------------------

_TRAILING_PROCEDURE_RE = re.compile(
    r"\s*(?:Committee (?:met|adjourned) at [\d :.]+|Proceedings suspended from [\d :.]+ to [\d :.]+|"
    r"Proceedings resumed at [\d :.]+)\s*$", re.I)


def norm_text(text: str, speaker: str | None = None) -> str:
    """Text as compared between a stored row and a re-parse: entities unescaped, whitespace collapsed, and the speaker
    prefix the pre-2026-09-29 parser left in the text ("CHAIR: We'll ...", "Mr West : I'd ...") removed."""
    t = htmlmod.unescape(text or "")
    t = re.sub(r"\s+", " ", t.replace("\xa0", " ")).strip()
    if speaker:
        sp = re.sub(r"\s+", " ", speaker).strip()
        t = re.sub(rf"^{re.escape(sp)}\s*(?:\([^)]*\))?\s*:\s*", "", t, count=1, flags=re.I)
    t = t.lstrip(": ").strip()
    return _TRAILING_PROCEDURE_RE.sub("", t).strip()


def _speaker_key(name: str | None) -> str:
    return re.sub(r"\s+", " ", (name or "")).strip().casefold()


SIMILAR_TEXT = 0.6           # same speaker, edited text
SAME_TURN_TEXT = 0.9         # a different label on what is clearly the same words (a corrected name)


def align(stored: list[dict], turns: list[SpeechRecord]) -> list[tuple[dict | None, SpeechRecord | None]]:
    """Pair the rows stored for one fragment with its re-parsed turns.

    1. same speaker label and same text            -> unchanged
    2. same speaker label, closest text (>= 0.6)   -> the row's text was edited
    3. any label, near-identical text (>= 0.9)     -> the label was corrected as well
    4. a turn with no row                          -> new
       a row with no turn                          -> orphan (left alone)
    Order of the result: by turn, then orphans. `stored` items need 'speech_id', 'speaker_name', 'text'."""
    st_norm = [norm_text(s["text"], s["speaker_name"]) for s in stored]
    t_norm = [norm_text(t.text) for t in turns]
    used_s: set[int] = set()
    pair_of_turn: dict[int, int | None] = {}

    # 1. exact
    by_key: dict[tuple[str, str], list[int]] = {}
    for i, s in enumerate(stored):
        by_key.setdefault((_speaker_key(s["speaker_name"]), st_norm[i]), []).append(i)
    for j, t in enumerate(turns):
        cands = [i for i in by_key.get((_speaker_key(t.speaker_name), t_norm[j]), []) if i not in used_s]
        if cands:
            used_s.add(cands[0])
            pair_of_turn[j] = cands[0]

    def ratio(a: str, b: str) -> float:
        if not a or not b:
            return 0.0
        m = difflib.SequenceMatcher(None, a, b, autojunk=False)
        if m.real_quick_ratio() < 0.5 or m.quick_ratio() < 0.5:
            return 0.0
        return m.ratio()

    # 2. same speaker, edited text
    for j, t in enumerate(turns):
        if j in pair_of_turn:
            continue
        best, best_r = None, SIMILAR_TEXT
        for i, s in enumerate(stored):
            if i in used_s or _speaker_key(s["speaker_name"]) != _speaker_key(t.speaker_name):
                continue
            r = ratio(st_norm[i], t_norm[j])
            if r >= best_r:
                best, best_r = i, r
        if best is not None:
            used_s.add(best)
            pair_of_turn[j] = best

    # 3. corrected label on the same words
    for j, t in enumerate(turns):
        if j in pair_of_turn:
            continue
        best, best_r = None, SAME_TURN_TEXT
        for i, s in enumerate(stored):
            if i in used_s:
                continue
            r = ratio(st_norm[i], t_norm[j])
            if r >= best_r:
                best, best_r = i, r
        if best is not None:
            used_s.add(best)
            pair_of_turn[j] = best

    out: list[tuple[dict | None, SpeechRecord | None]] = []
    for j, t in enumerate(turns):
        i = pair_of_turn.get(j)
        out.append((stored[i] if i is not None else None, t))
    out.extend((s, None) for i, s in enumerate(stored) if i not in used_s)
    return out


def _load_stored(db: sqlite3.Connection, hearing: HearingMetadata, frag: str) -> list[dict]:
    """The rows stored for one fragment, in insertion order. Uses the (source, date) index, then filters."""
    source = DATASET_MAP[hearing.dataset]
    rows = db.execute(
        "SELECT speech_id, speaker_name, text FROM speeches WHERE source = ? AND date = ? AND hearing_id = ? ORDER BY speech_id",
        (source, hearing.date, f"{hearing.hearing_id}/{frag}")).fetchall()
    return [{"speech_id": r[0], "speaker_name": r[1], "text": r[2]} for r in rows]


def _has_rows(db: sqlite3.Connection, hearing: HearingMetadata) -> bool:
    source = DATASET_MAP[hearing.dataset]
    return db.execute("SELECT 1 FROM speeches WHERE source = ? AND date = ? AND hearing_id LIKE ? LIMIT 1",
                      (source, hearing.date, hearing.hearing_id + "/%")).fetchone() is not None


# ---------------------------------------------------------------------------
# Sync one hearing (new hearings and Proof -> Final refreshes are the same routine)
# ---------------------------------------------------------------------------

@dataclass
class SyncResult:
    hearing_id: str
    inserted: int = 0
    updated: int = 0                 # rows whose text (and possibly label) changed in place
    relabelled: int = 0              # of those, rows whose speaker label changed too
    orphaned: int = 0                # stored rows the re-parse no longer contains
    unchanged_fragments: int = 0
    fragments_expected: int = 0
    fragments_ok: int = 0
    failed_fragments: list[str] = field(default_factory=list)
    status: str | None = None
    status_changed: bool = False
    is_new: bool = False
    skipped: str | None = None
    queued: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.inserted or self.updated or self.status_changed)


def _write_witness_lists(db: sqlite3.Connection, base: str, witnesses: list[tuple[str, object]], stamp: str) -> None:
    """Replace the hearing's attendance rows with the witness lists printed at the top of its fragments."""
    db.execute("DELETE FROM ext_committee_attendance WHERE hearing_base = ?", (base,))
    rows = []
    for n, (frag, w) in enumerate(witnesses, 1):
        rows.append((base, n, w.honorific, w.honorific_class, w.name, w.surname, w.postnominals, w.position,
                     w.organisation, None, "witness", frag, stamp))
    db.executemany("INSERT INTO ext_committee_attendance VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)


def sync_hearing(http: RateLimitedSession, db: sqlite3.Connection, cache: FragmentCache, hearing: HearingMetadata,
                 seen, *, refresh: bool = False) -> SyncResult:
    """Bring one hearing up to date: fetch its TOC and fragments, store new turns, update changed ones in place.

    `refresh` fetches every page from ParlInfo again (a cached Proof page is exactly what must not be trusted)."""
    base = hearing.hearing_id
    res = SyncResult(hearing_id=base)
    stamp = now_iso()
    row = db.execute("SELECT * FROM ext_committee_hearings WHERE hearing_base = ?", (base,)).fetchone()
    res.is_new = row is None

    # TOC: status, committee, date, the fragment list
    toc_html = cache.get(http, base, "0000", refresh=True)   # the status changes: never trust a cached TOC
    toc = parse_toc(toc_html, base) if toc_html else None
    if toc:
        hearing.committee_name = hearing.committee_name or toc.committee_name
        hearing.date = hearing.date or toc.date
    # a TOC that could not be read, or printed no status, must not erase the status already recorded
    hearing.status = (toc.status if toc else None) or hearing.status or (row["status"] if row is not None else None)
    if row is not None:
        hearing.committee_name = hearing.committee_name or row["committee_name"] or ""
        hearing.inquiry_title = hearing.inquiry_title or row["inquiry_title"] or ""
        hearing.date = hearing.date or row["hearing_date"] or ""
    if not hearing.date:
        res.skipped = "no date"
        return res
    frag_rows = {r[0]: r[1] for r in db.execute(
        "SELECT fragment, content_hash FROM ext_committee_fragments WHERE hearing_base = ?", (base,))}
    frags = sorted(set(hearing.fragment_ids) | set(toc.fragment_ids if toc else ()) | set(frag_rows))
    if not frags:
        res.skipped = "no fragments"
        return res
    res.fragments_expected = len(frags)
    res.status = hearing.status

    legacy = res.is_new and _has_rows(db, hearing)          # stored by the older ingest: adopt, do not duplicate
    if res.is_new:
        db.execute(
            "INSERT INTO ext_committee_hearings (hearing_base, dataset, committee_name, inquiry_title, hearing_date, "
            "category, status, fragments_expected, fragments_ok, turns_stored, parser_version, first_seen) "
            "VALUES (?,?,?,?,?,?,?,?,0,0,?,?)",
            (base, hearing.dataset, hearing.committee_name, hearing.inquiry_title, hearing.date, hearing.category,
             hearing.status, len(frags), 1 if legacy else PARSER_VERSION, stamp))
        _commit_with_retry(db)
    load_stored = not res.is_new or legacy or bool(frag_rows)

    speech_cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    carry: SpeechRecord | None = None
    frag_hashes: dict[str, str] = {}
    witnesses: list[tuple[str, object]] = []
    turns_total = 0
    for frag in frags:
        page = cache.get(http, base, frag, refresh=refresh)
        if page is None:
            res.failed_fragments.append(frag)
            continue
        res.fragments_ok += 1
        turns = parse_fragment(page, hearing, frag, carry)
        if turns:
            carry = turns[-1]
        turns_total += len(turns)
        witnesses.extend((frag, w) for w in parse_witness_list(page))
        h = fragment_hash(turns)
        frag_hashes[frag] = h
        if frag_rows.get(frag) == h:
            res.unchanged_fragments += 1
            continue

        stored = _load_stored(db, hearing, frag) if load_stored else []
        new_turns: list[SpeechRecord] = []
        for s, t in align(stored, turns):
            if t is None:
                res.orphaned += 1
                continue
            if s is None:
                new_turns.append(t)
                continue
            same_text = norm_text(s["text"], s["speaker_name"]) == norm_text(t.text)
            same_label = _speaker_key(s["speaker_name"]) == _speaker_key(t.speaker_name)
            if same_text and same_label:
                continue
            _update_row(db, s["speech_id"], t, relabel=not same_label, cols=speech_cols)
            seen.add(f"{t.speaker_name}|{t.date}|{text_hash(t.text)}")
            res.updated += 1
            res.relabelled += 0 if same_label else 1
            res.queued.append(f"speech-{s['speech_id']}")
        res.inserted += save_speeches(db, new_turns, seen)
        db.execute("INSERT OR REPLACE INTO ext_committee_fragments VALUES (?,?,?,?,?)", (base, frag, h, len(turns), stamp))
        _commit_with_retry(db)

    # who the witnesses are: the lists printed in the fragments (estimates fragments have none: `committee_witnesses fetch`
    # reads their In Attendance blocks, and must re-read them when the transcript changed)
    if witnesses and (res.inserted or res.updated or res.is_new):
        _write_witness_lists(db, base, witnesses, stamp)
    elif not witnesses and (res.inserted or res.updated) and hearing.dataset == "estimate":
        db.execute("DELETE FROM ext_committee_attendance WHERE hearing_base = ?", (base,))

    if res.queued:
        db.executemany(
            "INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?, ?, 'pending', ?) "
            "ON CONFLICT(slug) DO UPDATE SET status = 'pending', reason = excluded.reason, queued_at = excluded.queued_at",
            [(slug, REFRESH_REASON, stamp) for slug in res.queued])

    prev_status = row["status"] if row is not None else None
    res.status_changed = (not res.is_new) and hearing.status != prev_status
    complete = not res.failed_fragments
    content = hearing_hash(frag_hashes) if complete else None
    changed_now = bool(res.inserted or res.updated or res.status_changed) and not res.is_new
    db.execute(
        "UPDATE ext_committee_hearings SET committee_name = ?, inquiry_title = ?, hearing_date = ?, category = ?, status = ?, "
        "fragments_expected = ?, fragments_ok = ?, turns_stored = ?, content_hash = ?, last_checked = ?, "
        "last_changed = CASE WHEN ? THEN ? ELSE last_changed END, "
        "final_seen = CASE WHEN ? = 'Final' AND final_seen IS NULL THEN ? ELSE final_seen END, "
        "refresh_count = refresh_count + ? WHERE hearing_base = ?",
        (hearing.committee_name, hearing.inquiry_title, hearing.date, hearing.category or (row["category"] if row else None),
         hearing.status, res.fragments_expected, res.fragments_ok, turns_total, content, stamp,
         1 if changed_now else 0, stamp, hearing.status, stamp, 0 if res.is_new else 1, base))
    _commit_with_retry(db)
    return res


def _update_row(db: sqlite3.Connection, speech_id: int, t: SpeechRecord, relabel: bool, cols: set[str]) -> None:
    """Rewrite a stored row's text (and, for a corrected label, who is speaking) in place.

    text_clean / text_clean_rules are derived from the text, so they are dropped and rebuilt on the next push or repair.
    The label-dependent columns are cleared so `committee_witnesses resolve` recomputes them."""
    sets = ["text = ?", "word_count = ?"]
    params: list = [t.text, len(t.text.split())]
    for c in ("text_clean", "text_clean_rules"):
        if c in cols:
            sets.append(f"{c} = NULL")
    if relabel:
        sets += ["speaker_name = ?", "speaker_type = ?", "handbook_id = ?", "witness_name = ?"]
        params += [t.speaker_name, t.speaker_type, t.handbook_id, t.speaker_name if t.speaker_type == "witness" else None]
        for c in ("person_id", "speaker_name_clean", "witness_position", "witness_organisation"):
            if c in cols:
                sets.append(f"{c} = NULL")
    params.append(speech_id)
    _execute_with_retry(db, f"UPDATE speeches SET {', '.join(sets)} WHERE speech_id = ?", tuple(params))


# ---------------------------------------------------------------------------
# Which stored hearings are due for another look
# ---------------------------------------------------------------------------

def _hearing_from_row(r: sqlite3.Row) -> HearingMetadata:
    return HearingMetadata(hearing_id=r["hearing_base"], dataset=r["dataset"], committee_name=r["committee_name"] or "",
                           inquiry_title=r["inquiry_title"] or "", date=r["hearing_date"] or "", category=r["category"] or "",
                           status=r["status"])


def refresh_candidates(db: sqlite3.Connection, now: datetime | None = None, days: int = REFRESH_DAYS,
                       every_days: int = REFRESH_EVERY_DAYS) -> list[HearingMetadata]:
    """Hearings to fetch again: not Final and due (weekly), or with fragments that failed last time (daily), each only
    for `days` after first being seen."""
    now = now or datetime.now(timezone.utc)
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    horizon = (now - timedelta(days=days)).strftime(fmt)
    weekly = (now - timedelta(days=every_days)).strftime(fmt)
    daily = (now - timedelta(days=RETRY_INCOMPLETE_EVERY_DAYS)).strftime(fmt)
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT * FROM ext_committee_hearings WHERE first_seen >= ? AND ("
        " ((fragments_ok IS NULL OR fragments_expected IS NULL OR fragments_ok < fragments_expected)"
        "   AND (last_checked IS NULL OR last_checked <= ?))"
        " OR (COALESCE(status, '') != 'Final' AND (last_checked IS NULL OR last_checked <= ?))"
        ") ORDER BY hearing_date DESC", (horizon, daily, weekly)).fetchall()
    return [_hearing_from_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Knowledge-box text patches
# ---------------------------------------------------------------------------

def patch_knowledge_box(db: sqlite3.Connection, slugs: list[str]) -> None:
    """Send the queued text updates to the box (only when the run is allowed to touch it: OPAX_SYNC_KB=1)."""
    if not slugs:
        return
    try:
        from parli.arag import AragConfig, KbClient, load_dotenv
        from parli.ingest.kb_patch import drain_text_patches
    except ImportError as e:            # pragma: no cover
        log(f"  cannot patch the knowledge box: {e}")
        return
    load_dotenv()
    cfg = AragConfig.from_env()
    if not cfg.kb_configured:
        log(f"  {len(slugs)} text updates stay queued in ext_kb_patch_queue: ARAG_KB_ID / ARAG_KB_TOKEN not set")
        return
    drain_text_patches(db, KbClient(cfg), slugs=slugs, say=log)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _parse_day(s: str) -> date:
    return date.fromisoformat(s)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Ingest Australian federal committee hearing transcripts from ParlInfo."
    )
    parser.add_argument("--set", choices=["estimate", "commsen", "commrep", "commjnt", "all"], default="all",
                        help="Dataset to ingest (default: all). 'estimate' = Senate Estimates.")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of new hearings to process.")
    parser.add_argument("--since", type=_parse_day, default=None,
                        help="First hearing date to discover (YYYY-MM-DD). Default: OPAX_COMMITTEES_SINCE, else today minus "
                             f"OPAX_COMMITTEES_DAYS (default {DEFAULT_DAYS_BACK}) days.")
    parser.add_argument("--until", type=_parse_day, default=None, help="Last hearing date to discover (default: today).")
    parser.add_argument("--no-refresh", action="store_true", help="Do not re-fetch Proof hearings that are due.")
    parser.add_argument("--refresh-limit", type=int, default=None, help="Maximum hearings to re-fetch this run.")
    parser.add_argument("--adopt-legacy", action="store_true",
                        help="Also sync hearings stored by the older ingest (no ext_committee_hearings row), comparing "
                             "their rows with the current transcript. Off in the nightly.")
    parser.add_argument("--patch-kb", dest="patch_kb", action="store_true", default=None,
                        help="Send text updates of already-pushed rows to the knowledge box (default: on when OPAX_SYNC_KB=1).")
    parser.add_argument("--no-patch-kb", dest="patch_kb", action="store_false")
    parser.add_argument("--dry-run", action="store_true", help="Discover and list what would be synced; fetch and write nothing.")
    parser.add_argument("--db", default=None, help="SQLite database (default: the corpus DB / OPAX_DB).")
    parser.add_argument("--cache-dir", default=None, help="Raw page cache (default: $OPAX_ATTENDANCE_CACHE).")
    parser.add_argument("--hearing", action="append", default=[], metavar="ID",
                        help="Sync this hearing only (committees/<dataset>/<n>, repeatable); no discovery. "
                             "Its committee, date and fragments come from ParlInfo's table-of-contents page.")
    parser.add_argument("--schedule", action="store_true",
                        help="Discover from the Estimates Transcript Schedule page instead of the listing (estimates only).")
    parser.add_argument("--discover", action="store_true", help="Use ID range probing to discover hearings (slow).")
    parser.add_argument("--id-start", type=int, default=29300)
    parser.add_argument("--id-end", type=int, default=29400)
    parser.add_argument("--skip-ingested", action="store_true", default=True,
                        help="Skip hearings already in the database (default: True).")
    parser.add_argument("--no-skip-ingested", action="store_false", dest="skip_ingested",
                        help="Sync hearings even if already in the database (rows already stored are matched, not duplicated).")
    args = parser.parse_args(argv)

    today = datetime.now(timezone.utc).date()
    until = args.until or today
    if args.since:
        since = args.since
    elif os.environ.get("OPAX_COMMITTEES_SINCE"):
        since = _parse_day(os.environ["OPAX_COMMITTEES_SINCE"])
    else:
        since = today - timedelta(days=int(os.environ.get("OPAX_COMMITTEES_DAYS", DEFAULT_DAYS_BACK)))
    datasets = DATASETS if args.set == "all" else (args.set,)

    db = get_db(args.db) if args.db else get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    ensure_schema(db)
    db.row_factory = sqlite3.Row
    seen = build_dedup_index(db)
    cache = FragmentCache(args.cache_dir)
    http = RateLimitedSession()
    known = get_ingested_hearings(db, since=since.isoformat()) if args.skip_ingested else set()
    in_table = {r[0] for r in db.execute("SELECT hearing_base FROM ext_committee_hearings")}
    if known:
        log(f"  {len(known)} hearings already ingested (since {since})")

    exit_code = 0
    total_ins = total_upd = 0
    touched: list[str] = []
    try:
        # --- discovery
        hearings: list[HearingMetadata]
        if args.hearing:
            hearings = []
            for hid in args.hearing:
                m = re.fullmatch(r"committees/(estimate|commsen|commrep|commjnt)/(\d+)", hid.strip())
                if not m:
                    parser.error(f"--hearing {hid!r}: expected committees/<estimate|commsen|commrep|commjnt>/<number>")
                hearings.append(HearingMetadata(hearing_id=hid.strip(), dataset=m.group(1)))
            args.skip_ingested = False
        elif args.discover:
            hearings = []
            for ds in datasets:
                hearings.extend(discover_by_id_range(http, ds, args.id_start, args.id_end))
        elif args.schedule:
            hearings = [h for h in discover_from_estimates_schedule(http) if h.dataset in datasets]
        else:
            hearings = discover_from_listing(http, since, until, datasets)

        legacy = [h for h in hearings if h.hearing_id in known and h.hearing_id not in in_table]
        fresh = [h for h in hearings if h.hearing_id not in known]
        if args.adopt_legacy:
            fresh = fresh + legacy
        elif legacy:
            log(f"  Skipping {len(legacy)} hearings stored by the older ingest (--adopt-legacy checks them against the transcript)")
        if args.skip_ingested is False:
            fresh = list(hearings)
        if args.limit:
            fresh = fresh[:args.limit]

        due: list[HearingMetadata] = []
        if not args.no_refresh:
            listed = {h.hearing_id for h in fresh}
            due = [h for h in refresh_candidates(db) if h.hearing_id not in listed and h.dataset in datasets]
            if args.refresh_limit:
                due = due[:args.refresh_limit]

        log(f"\nWill sync {len(fresh)} hearings and refresh {len(due)} stored ones")
        if args.dry_run:
            for h in fresh:
                log(f"  new     {h.hearing_id} {h.date} {h.committee_name} :: {h.inquiry_title}")
            for h in due:
                log(f"  refresh {h.hearing_id} {h.date} {h.committee_name} status={h.status}")
            return 0

        # --- sync
        for label, batch, refresh in (("new", fresh, False), ("refresh", due, True)):
            for i, hearing in enumerate(batch, 1):
                log(f"\n[{label} {i}/{len(batch)}] {hearing.hearing_id} {hearing.date} {hearing.committee_name}")
                r = sync_hearing(http, db, cache, hearing, seen, refresh=refresh)
                if r.skipped:
                    log(f"  skipped: {r.skipped}")
                    continue
                total_ins += r.inserted
                total_upd += r.updated
                touched.extend(r.queued)
                bits = [f"{r.fragments_ok}/{r.fragments_expected} fragments", f"status {r.status or '?'}",
                        f"+{r.inserted} rows"]
                if not r.is_new:
                    bits += [f"{r.updated} updated ({r.relabelled} relabelled)", f"{r.unchanged_fragments} fragments unchanged"]
                if r.orphaned:
                    bits.append(f"{r.orphaned} stored rows not in the transcript now")
                if r.failed_fragments:
                    bits.append("FAILED " + ",".join(r.failed_fragments))
                log("  " + ", ".join(bits))
    except SourceBlocked as e:
        log(f"\nSTOPPED: {e}")
        exit_code = 1
    finally:
        _commit_with_retry(db)

    do_patch = args.patch_kb if args.patch_kb is not None else os.environ.get("OPAX_SYNC_KB") == "1"
    if touched:
        if do_patch:
            patch_knowledge_box(db, touched)
        else:
            log(f"  {len(touched)} text updates queued in ext_kb_patch_queue (reason {REFRESH_REASON}); "
                "send them with scripts/arag_patch_speakers.py or rerun with OPAX_SYNC_KB=1")

    log(f"\n{'=' * 60}")
    log(f"Ingestion complete: {total_ins} speeches inserted, {total_upd} updated in place; {http.requests} requests")
    if total_upd:
        log(f"COMMITTEES_CHANGED rows_updated={total_upd}")
    total_committee = db.execute(
        "SELECT COUNT(*) FROM speeches WHERE source IN (%s)" % ",".join("?" * len(COMMITTEE_SOURCES)), COMMITTEE_SOURCES).fetchone()[0]
    log(f"Total committee speeches in DB: {total_committee}")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
