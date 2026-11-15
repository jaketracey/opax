"""
parli.ingest.vic_divisions -- every division of a Victorian Parliament, from the daily Hansard PDFs.

The sampled Victorian path (`votes_state.py vic`) reads the newest few sitting
days. This module walks a whole Parliament with the same source, the same ids
(`vic-{la|lc}-{date}-{n}`) and the same unified Division / Vote rows, in two
steps that never mix:

  fetch   the sitting-day listing (`/api/search/debate`) and each day's Hansard
          PDF, from www.parliament.vic.gov.au only, into a cache outside the
          repository. robots.txt is read first and obeyed; one request at a
          time, at least two seconds apart; a refusal (HTTP 403 or 429, any
          other non-200 answer, a challenge page, a body that is not what was
          asked for) stops the run and is never retried or worked around. A
          file already in the cache is not requested again.

  parse   reads the cache only. A division is published only when all of this
          holds, and otherwise goes on the mismatch list with its Hansard link,
          the stated and the parsed counts, and the reason:
            - the names parsed for each side equal the tally Hansard prints
              ("Ayes (14):"), and Hansard prints a result line;
            - the result line agrees with the tally;
            - every name is one person of that house in the committed roster
              (the electorate release's seat roster and portal/public/
              parliamentarians.json); a name the roster does not hold, or holds
              twice, is never guessed;
            - its number on the chamber-day does not dispute a record already
              published under that id.
          Text is kept as Hansard prints it: `question` is the motion or
          amendment only where Hansard prints it directly before the division
          (see `question_before`), and otherwise the division line itself
          ("Council divided on amendment"); `name` is the heading the division
          sits under. Nothing is summarised or reworded.

  unified writes the reconciled divisions in the `votes_state` JSON shape, for
          `votes_state load` on the refresh box (not run here).

PDF text comes from PyMuPDF (`pip install pymupdf`), which gives each line's
position and typeface: Hansard sets the division line and its result in bold,
the side labels in italic and quoted motions in smaller indented type, so the
parser reads the page structure, not its spacing.

Reuse of Victorian Hansard is by permission of the Parliament of Victoria
(docs/SOURCES-ACCESS.md, 13 October 2026): fair, accurate, not misleading, free
to read. Every division keeps its Hansard link and date.

    python3 -m parli.ingest.vic_divisions fetch --cache ~/opax-work/vic-hansard-cache --from 2022-12-20
    python3 -m parli.ingest.vic_divisions parse --cache ~/opax-work/vic-hansard-cache --out data/staged/vic-divisions
    python3 -m parli.ingest.vic_divisions unified --staged data/staged/vic-divisions --out /tmp/votes_vic_60.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
import urllib.robotparser
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from parli.ingest import http as source_http
from parli.ingest.speaker_names import normalize_speaker
from parli.ingest.votes_state import BILL_RE, VIC_BASE, VIC_HOUSES, Division, Vote, person_key, write_out

HOST = "www.parliament.vic.gov.au"
REPO_ROOT = Path(__file__).resolve().parents[2]
ROSTER = REPO_ROOT / "portal" / "public" / "parliamentarians.json"
MIN_INTERVAL = 2.0
SOURCE = "vic_hansard_pdf"


# ---------------------------------------------------------------------------
# fetch
# ---------------------------------------------------------------------------


class Refused(SystemExit):
    """The source said no. Exit 4, as the refresh runners expect; nothing is retried."""

    def __init__(self, url: str, reason: str):
        print(f"STOPPED: {reason}: {url}", file=sys.stderr, flush=True)
        super().__init__(4)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
        return None  # a redirect is an answer we did not ask for: surfaces as an HTTPError


class Fetcher:
    """One host, one identity, one request at a time, everything logged and cached."""

    def __init__(self, cache: Path, user_agent: str, interval: float = MIN_INTERVAL, budget: int = 3000):
        if interval < MIN_INTERVAL:
            raise ValueError(f"the interval may not be under {MIN_INTERVAL} seconds")
        self.cache, self.user_agent, self.interval, self.budget = cache, user_agent, interval, budget
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
        self.log = cache / "requests.log"
        self.last = 0.0
        self.made = 0
        self.robots: urllib.robotparser.RobotFileParser | None = None
        cache.mkdir(parents=True, exist_ok=True)

    def _request(self, url: str, accept: str) -> bytes:
        if urlsplit(url).scheme != "https" or urlsplit(url).hostname != HOST:
            raise ValueError(f"only https://{HOST} is fetched: {url}")
        if self.made >= self.budget:
            raise Refused(url, f"request budget of {self.budget} reached")
        wait = self.last + self.interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": self.user_agent, "Accept": accept})
        status, body = None, b""
        try:
            with self.opener.open(req, timeout=180) as resp:
                status, body = resp.getcode(), resp.read()
        except urllib.error.HTTPError as error:
            status = error.code
        finally:
            self.last = time.monotonic()
            self.made += 1
            with self.log.open("a", encoding="utf-8") as log:
                log.write(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {status} {len(body)} GET {url}\n")
        if status != 200:
            raise Refused(url, f"HTTP {status}")
        if source_http.is_challenge(body):
            raise Refused(url, "challenge or block page")
        return body

    def allow(self, url: str) -> None:
        """robots.txt, read once a run before any content request, and obeyed."""
        if self.robots is None:
            text = self._request(f"https://{HOST}/robots.txt", "text/plain").decode("utf-8", "replace")
            (self.cache / "meta").mkdir(exist_ok=True)
            (self.cache / "meta" / "robots.txt").write_text(text, encoding="utf-8")
            self.robots = urllib.robotparser.RobotFileParser()
            self.robots.parse(text.splitlines())
        if not self.robots.can_fetch(self.user_agent, url):
            raise Refused(url, "robots.txt disallows this path")

    def get(self, url: str, path: Path, accept: str, check) -> bytes:
        """The cached file, or one request for it. `check(body)` says the body is what was asked for."""
        if path.is_file():
            return path.read_bytes()
        self.allow(url)
        body = self._request(url, accept)
        if not check(body):
            raise Refused(url, "the answer is not the document asked for")
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".part")
        tmp.write_bytes(body)
        tmp.replace(path)
        return body


def _is_json(body: bytes) -> bool:
    try:
        return isinstance(json.loads(body)["result"]["hits"], list)
    except (ValueError, KeyError, TypeError):
        return False


def listing(fetcher: Fetcher | None, cache: Path, house: str, start: str, end: str, refresh: bool = False) -> list[dict]:
    """Sitting days of one house from `start` to `end`, newest first, from the listing pages.

    The listing is newest first, so paging stops at the first page that ends
    before `start`. With no fetcher (parse) only cached pages are read."""
    hid, chamber, label = VIC_HOUSES[house]
    days, page = {}, 1
    while True:
        path = cache / "listing" / f"{house}-p{page:03d}.json"
        if refresh and fetcher and path.is_file() and page == 1:
            path.unlink()  # the first page is the only one that changes as the House sits
        if not path.is_file() and fetcher is None:
            break
        url = f"{VIC_BASE}/api/search/debate?page={page}&pageSize=20&hansard-house={hid}"
        hits = json.loads(fetcher.get(url, path, "application/json", _is_json) if fetcher else path.read_bytes())["result"]["hits"]
        dates = []
        for h in hits:
            d = (h.get("date1") or "")[:10]
            pdf = (h.get("downloadButton") or {}).get("href")
            if not d or not pdf or not h.get("id"):
                continue
            dates.append(d)
            if start <= d <= end:
                days.setdefault((d, h["id"]), {
                    "date": d, "house": chamber, "label": label, "id": h["id"], "status": h.get("status"),
                    "pdf": VIC_BASE + pdf,
                    "online": VIC_BASE + ((h.get("onlineButton") or {}).get("href") or "")})
        if not hits or (dates and max(dates) < start):
            break
        page += 1
    return sorted(days.values(), key=lambda d: (d["date"], d["id"]), reverse=True)


def pdf_path(cache: Path, day: dict) -> Path:
    return cache / "pdf" / day["house"][-2:] / f"{day['date']}-{day['id']}.pdf"


def run_fetch(args) -> None:
    cache = Path(args.cache).expanduser()
    fetcher = Fetcher(cache, args.user_agent, args.interval, args.max_requests)
    only = set(args.dates or [])
    todo = []
    for house in ("la", "lc"):
        days = listing(None if args.cached_listing else fetcher, cache, house, args.start, args.end,
                       refresh=args.refresh_listing)
        todo += [d for d in days if not only or d["date"] in only]
    missing = [d for d in todo if not pdf_path(cache, d).is_file()]
    print(f"{len(todo)} sitting days listed, {len(missing)} PDFs to fetch, {fetcher.made} requests so far", file=sys.stderr)
    if args.estimate:
        return
    for n, day in enumerate(sorted(missing, key=lambda d: (d["date"], d["house"])), 1):
        body = fetcher.get(day["pdf"], pdf_path(cache, day), "application/pdf", lambda b: b[:5] == b"%PDF-")
        print(f"  [{n}/{len(missing)}] {day['date']} {day['house']} {day['status']} {len(body):,} bytes", file=sys.stderr, flush=True)
    print(f"done: {fetcher.made} requests this run", file=sys.stderr)


# ---------------------------------------------------------------------------
# parse
# ---------------------------------------------------------------------------

# "divided on motion:"; Hansard has also printed "Assembly divided question:" (14 May 2024).
DIVIDED_RE = re.compile(r"^(Assembly|Council|House|Committee) divided (?:on )?(.+?):?$")
SIDE_RE = re.compile(r"^(Ayes|Noes)\s*\((\d+)\)\s*:\s*(.*)$")
RESULT_RE = re.compile(r"\b(agreed to|defeated|negatived|passed|not agreed to|carried|resolved in the (?:affirmative|negative))\b", re.I)
NEGATIVE_RE = re.compile(r"\b(defeated|negatived|not agreed to|resolved in the negative)\b", re.I)
BODY_TOP, BODY_BOTTOM = 100.0, 790.0      # the running head sits above, the page foot below

def pdf_lines(path: Path) -> list[dict]:
    """The body lines of a Hansard PDF in reading order, each with its page, position and typeface.

    Pieces PyMuPDF reports separately on one baseline (an amendment's number and
    its text) are one line. `bold` and `italic` describe the first piece, `allbold`
    every piece; `quote` is the smaller type Hansard sets motions and amendments in;
    `centred` an indented line with the same space either side; `heading` a centred bold one."""
    try:
        import pymupdf  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise SystemExit("parse needs PyMuPDF: pip install pymupdf") from e
    out = []
    with pymupdf.open(path) as doc:
        for pno, page in enumerate(doc):
            width = page.rect.width
            rows: dict[int, list] = {}
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    spans = [s for s in line["spans"] if s["text"].strip()]
                    if spans and BODY_TOP <= line["bbox"][1] <= BODY_BOTTOM:
                        rows.setdefault(round(line["bbox"][1] / 3), []).append((line["bbox"], spans))
            for key in sorted(rows):
                parts = sorted(rows[key], key=lambda r: r[0][0])
                first = parts[0][1][0]
                x0, x1 = parts[0][0][0], parts[-1][0][2]
                fonts = [s["font"] for _, spans in parts for s in spans]
                text = re.sub(r"\s+", " ", " ".join("".join(s["text"] for s in spans) for _, spans in parts)).strip()
                allbold, quote = all("Bold" in f for f in fonts), first["size"] < 9.6
                even = abs(x0 - (width - x1)) < 12      # the same space either side
                out.append({
                    "page": pno + 1, "x": x0, "y": parts[0][0][1], "text": text,
                    "bold": "Bold" in first["font"], "italic": "Italic" in first["font"],
                    "allbold": allbold, "quote": quote,
                    "centred": x0 > 100 and even,
                    # A heading is centred bold type. One that fills the line starts at the margin like a
                    # procedural line ("Debate resumed."), which ends in a stop or a colon; a heading does not.
                    "heading": allbold and not quote and even and (x0 > 100 or not text.endswith((".", ":"))),
                })
    return out


MEMBER_CELL_RE = re.compile(r"^[A-Za-z][A-Za-z’' -]*, [A-Z]")


def member_list(path: Path) -> list[tuple[str, str | None]]:
    """(surname, district or region) for each member in the list Hansard prints at the front of the day's PDF.

    The list is the House's own record of who its members are in that Parliament
    as the day was printed ("Bach, Matthew | North-Eastern Metropolitan | Lib").
    A row whose seat cannot be read keeps its surname and has no seat."""
    try:
        import pymupdf  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise SystemExit("parse needs PyMuPDF: pip install pymupdf") from e
    out = []
    with pymupdf.open(path) as doc:
        for page in list(doc)[:8]:
            spans = []
            for block in page.get_text("dict")["blocks"]:
                for ln in block.get("lines", []):
                    for s in ln["spans"]:
                        # Two cells can arrive as one piece of text ("Greens  Payne, Rachel"): split on the gap.
                        width = (s["bbox"][2] - s["bbox"][0]) / max(len(s["text"]), 1)
                        for piece in re.finditer(r"\S+(?: \S+)*", s["text"]):
                            spans.append((s["bbox"][0] + width * piece.start(), s["bbox"][1], piece.group()))
            seats = sorted(x for x, _, t in spans if t in ("District", "Region"))
            top = min((y for _, y, t in spans if t == "Member"), default=None)
            if top is None or not seats:
                continue
            for x, y, text in spans:
                # A member cell sits left of its seat column: "Surname, Given", with footnote marks after it.
                column = next((k for k, sx in enumerate(seats) if x < sx and (k == 0 or x > seats[k - 1] + 40)), None)
                if column is None or y <= top or not MEMBER_CELL_RE.match(text):
                    continue
                near = sorted((abs(sy - y), t) for sx, sy, t in spans if abs(sx - seats[column]) < 12 and abs(sy - y) < 7)
                out.append((text.split(",")[0].strip(), near[0][1] if near else None))
    return out


def _heading(lines: list[dict], i: int) -> tuple[str | None, str | None]:
    """(heading, stage) the line at i sits under: the nearest centred bold heading above it, with the lines
    of a heading set over two or three joined, and the centred italic stage line below it ("Third reading")."""
    stage = None
    b = i - 1
    while b >= 0:
        ln = lines[b]
        if ln["centred"] and ln["italic"] and not ln["quote"] and stage is None:
            stage = ln["text"]
        if ln["heading"]:
            parts = [ln["text"]]
            while b > 0 and lines[b - 1]["heading"] and lines[b - 1]["page"] == ln["page"] \
                    and 0 < ln["y"] - lines[b - 1]["y"] < 16:
                b -= 1
                ln = lines[b]
                parts.insert(0, ln["text"])
            return " ".join(parts), stage
        b -= 1
    return None, None


def question_before(lines: list[dict], i: int, tail_allowed: bool = True) -> tuple[str | None, str | None, int]:
    """The motion or amendment Hansard prints directly before the division line at i, verbatim, or None.

    Hansard sets a motion as put in smaller indented type under a line that ends
    with a colon ("I move:", "Debate resumed on motion of ...:", "And ...'s
    amendment:", "The question is:"). The text is taken only when that block is
    the last thing before the division, or when the Chair's own turn that states
    the question runs on for at most three lines after it ("Those supporting the
    amendment ... should vote no."). Anything else between the two (a speech, a
    reply, another vote) means the source does not tie the text to this division
    here, and none is given. Returns (text, the line that introduces it, that line's index)."""
    b = i - 1
    tail = 0
    while tail_allowed and b >= 0 and not lines[b]["quote"] and not lines[b]["bold"] and not lines[b]["italic"] and tail < 3:
        b -= 1
        tail += 1
    if b < 0 or not lines[b]["quote"]:
        return None, None, -1
    end = b
    while b >= 0 and lines[b]["quote"]:
        b -= 1
    lead = lines[b]["text"] if b >= 0 else ""
    if not lead.endswith(":"):
        return None, None, -1
    if tail and not lead.endswith("The question is:"):
        return None, None, -1
    text = " ".join(ln["text"] for ln in lines[b + 1:end + 1]).strip()
    return (text or None), lead, b


def motion_after_amendment(lines: list[dict], i: int, previous: dict | None) -> tuple[str | None, str | None]:
    """The motion, where the division at i is on the motion and follows at once a lost division on its amendment.

    Hansard prints the pair once, above the first division: "Debate resumed on
    motion of A:" and the motion, then "And B's amendment:" and the amendment.
    The amendment having been lost, the motion is put as printed."""
    if not previous or previous["end"] != i or previous["result"] != "negative" \
            or previous["divided_on"] not in ("amendment", "amendments"):
        return None, None
    _, lead, at = question_before(lines, previous["start"], tail_allowed=False)
    if at < 0 or not re.search(r"\bamendments?:$", lead or ""):
        return None, None
    text, lead, _ = question_before(lines, at, tail_allowed=False)
    if text and re.search(r"\bmotion of\b.*:$", lead or ""):
        return text, lead
    return None, None


class Roster:
    """Who a printed name is: one person of that house in the committed records, or nobody.

    The electorate release's verified seat roster carries person ids; the people
    directory (portal/public/parliamentarians.json) carries everyone with speeches
    in the corpus, by name and house. A printed name resolves when exactly one
    person of that house has it. The same name in both files is one person."""

    def __init__(self, public: Path):
        self.by_key: dict[tuple[str, str], dict[str, dict]] = {}
        self.by_seat: dict[tuple[str, str], dict[str, dict]] = {}
        manifest = json.loads((public / "electorates/manifest.json").read_text(encoding="utf-8"))
        index = json.loads((public / manifest["index_url"].lstrip("/")).read_text(encoding="utf-8"))
        for seat in index.get("electorates", []):
            if seat.get("jurisdiction") != "vic" or seat.get("representation_status") != "verified":
                continue
            for rep in seat.get("representatives") or []:
                person = rep.get("person") or {}
                record = {"person_id": rep.get("person_id"), "basis": "release-roster",
                          "as_of": seat.get("representation_as_of")}
                for name in [person.get("name"), *(person.get("aliases") or [])]:
                    self._add(seat["chamber"], name, person.get("name"), record)
                self._seat(seat["chamber"], seat.get("name"), person.get("name"), record)
        people = json.loads((public / "parliamentarians.json").read_text(encoding="utf-8"))["people"]
        for person in people:
            houses = {c for c in person.get("chambers", []) if c.startswith("vic_")} | {
                r.get("chamber") for r in person.get("representation", []) if r.get("jurisdiction") == "vic"}
            if " " not in person["name"].strip():
                continue  # a surname print is not a person's name
            for house in houses:
                for name in [person["name"], *(person.get("aliases") or [])]:
                    self._add(house, name, person["name"], {"person_id": None, "basis": "people-directory"})
            for r in person.get("representation", []):
                if r.get("jurisdiction") == "vic":
                    self._seat(r.get("chamber"), r.get("electorate"), person["name"],
                               {"person_id": None, "basis": "people-directory"})

    @staticmethod
    def _seat_key(seat) -> str:
        return re.sub(r"[^a-z]+", " ", str(seat or "").casefold()).strip()

    def _seat(self, house, seat, canonical, record):
        if house and self._seat_key(seat) and canonical:
            held = self.by_seat.setdefault((house, self._seat_key(seat)), {})
            identity = person_key(canonical)
            if identity not in held:
                held[identity] = {"name": canonical, **record}
            elif record["basis"] == "people-directory":
                held[identity]["name"] = canonical  # the directory's spelling is the one person pages use

    def _add(self, house, name, canonical, record):
        key = person_key(name)
        if not key or not canonical:
            return
        held = self.by_key.setdefault((house, key), {})
        identity = person_key(canonical)
        if identity in held:
            if not held[identity].get("person_id") and record.get("person_id"):
                held[identity].update(record)
            return
        held[identity] = {"name": canonical, **record}

    def resolve(self, house: str, printed: str, members: list[tuple[str, str | None]]) -> dict | None:
        """The one person a printed name is on that day, or None.

        Either the roster holds exactly that name in that house, or (Hansard
        having printed another form of the given name than the roster holds,
        "Nicholas McGowan" for "Nick McGowan") the member list Hansard prints at
        the front of that day's PDF has one member of that surname, and the
        roster has one person of that surname in that member's seat. The list is
        not required to hold the name: it lags a by-election by some weeks."""
        key = person_key(printed) or ""
        listed = [(s, seat) for s, seat in members if _has_surname(key, s)]
        held = self.by_key.get((house, key), {})
        if len(held) == 1:
            return next(iter(held.values()))
        if held or len(listed) != 1 or not listed[0][1]:
            return None
        surname, seat = listed[0]
        seated = [who for identity, who in self.by_seat.get((house, self._seat_key(seat)), {}).items()
                  if _has_surname(identity, surname)]
        if len(seated) != 1:
            return None
        return {**seated[0], "basis": "hansard-member-list:" + seated[0]["basis"]}


def _has_surname(name_key: str, surname: str) -> bool:
    s = person_key(surname) or ""
    return bool(s) and (name_key == s or name_key.endswith(" " + s))


def parse_day(lines: list[dict], day: dict, roster: Roster, members: list[tuple[str, str | None]]
              ) -> tuple[list[dict], list[dict]]:
    """(reconciled divisions, mismatches) for one chamber-day. Every division line takes a number, so the
    ids do not move when a mismatch is later resolved."""
    good, bad = [], []
    seq = 0
    previous = None
    consumed = set()
    i = 0
    while i < len(lines):
        m = DIVIDED_RE.match(lines[i]["text"]) if lines[i]["bold"] else None
        if not m:
            i += 1
            continue
        seq += 1
        start = i
        sides: dict[str, tuple[int, str]] = {}
        j = i + 1
        # A long division line runs over two or three bold lines, the last ending in the colon.
        line_text = lines[start]["text"]
        while not line_text.endswith(":") and j < len(lines) and j < start + 4 and lines[j]["allbold"] \
                and not SIDE_RE.match(lines[j]["text"]):
            line_text += " " + lines[j]["text"]
            j += 1
        m = DIVIDED_RE.match(line_text)
        while j < len(lines):
            sm = SIDE_RE.match(lines[j]["text"])
            if not sm or sm.group(1) in sides:
                break
            consumed.add(j)
            blob = [sm.group(3)]
            j += 1
            while j < len(lines) and not lines[j]["bold"] and not lines[j]["italic"] and not lines[j]["quote"] \
                    and not SIDE_RE.match(lines[j]["text"]):
                blob.append(lines[j]["text"])
                j += 1
            sides[sm.group(1)] = (int(sm.group(2)), " ".join(blob))
        result_text = None
        if j < len(lines) and lines[j]["allbold"] and RESULT_RE.search(lines[j]["text"]) \
                and not DIVIDED_RE.match(lines[j]["text"]):
            result_text = lines[j]["text"]
            j += 1
        i = max(j, start + 1)

        div_id = f"vic-{day['house'][-2:]}-{day['date']}-{seq}"
        url = f"{day['pdf']}#page={lines[start]['page']}"
        stated = {k.lower(): v[0] for k, v in sides.items()}
        names = {k.lower(): _names(v[1]) for k, v in sides.items()}
        parsed = {k: len(v) for k, v in names.items()}
        reasons = []
        if set(sides) != {"Ayes", "Noes"}:
            reasons.append("no-tally")
        elif stated != parsed:
            reasons.append("count-mismatch")
        if not result_text:
            reasons.append("no-result-line")
        result = None
        if result_text:
            result = "negative" if NEGATIVE_RE.search(result_text) else "affirmative"
            a, n = stated.get("ayes"), stated.get("noes")
            if a is not None and n is not None and a != n and (a > n) != (result == "affirmative"):
                reasons.append("result-contradicts-tally")
        votes, unresolved, seen = [], [], Counter()
        for side, vote in (("ayes", "aye"), ("noes", "no")):
            for raw in names.get(side, []):
                who = roster.resolve(day["house"], raw, members)
                seen[person_key(raw)] += 1
                if not who:
                    unresolved.append(raw)
                # The printed name is kept unless Hansard printed another form of it than the roster holds.
                listed_form = bool(who) and who["basis"].startswith("hansard-member-list")
                votes.append({"person_raw": raw, "person_name": who["name"] if listed_form else normalize_speaker(raw),
                              "vote": vote, "roster_person_id": who and who.get("person_id"),
                              "roster_basis": who and who["basis"]})
        if unresolved:
            reasons.append("unresolved-name")
        if any(count > 1 for count in seen.values()):
            reasons.append("name-listed-twice")
        heading, stage = _heading(lines, start)
        question, lead, _ = question_before(lines, start)
        basis = "printed-before-division" if question else "division-line"
        if not question and m.group(2) == "motion":
            question, lead = motion_after_amendment(lines, start, previous)
            basis = "printed-before-amendment-division" if question else basis
        previous = {"start": start, "end": j, "divided_on": m.group(2), "result": result}
        printed_line, line_text = line_text, line_text.rstrip(":")
        bill = heading if heading and BILL_RE.fullmatch(heading) else None
        record = {
            "id": div_id, "jurisdiction": "vic", "house": day["house"], "date": day["date"], "number": seq,
            "name": heading or line_text, "question": question or line_text, "bill_ref": bill,
            "ayes_count": stated.get("ayes"), "noes_count": stated.get("noes"), "result": result,
            "source": SOURCE, "source_url": url,
            "extra": {"online_url": day.get("online"), "status": day.get("status"), "page": lines[start]["page"],
                      "division_line": printed_line, "divided_on": m.group(2), "stage": stage,
                      "question_basis": basis,
                      "question_lead": lead, "result_text": result_text, "members_listed": parsed},
            "votes": votes,
        }
        if reasons:
            bad.append({"id": div_id, "date": day["date"], "house": day["house"], "source_url": url,
                        "online_url": day.get("online"), "division_line": printed_line,
                        "stated": {"ayes": stated.get("ayes"), "noes": stated.get("noes")},
                        "parsed": {"ayes": parsed.get("ayes"), "noes": parsed.get("noes")},
                        "reasons": reasons, "unresolved_names": sorted(set(unresolved))})
        else:
            good.append(record)
    # A tally line no division line claimed would be a division the parser did not see.
    for k, ln in enumerate(lines):
        if k not in consumed and ln["italic"] and SIDE_RE.match(ln["text"]):
            bad.append({"id": None, "date": day["date"], "house": day["house"],
                        "source_url": f"{day['pdf']}#page={ln['page']}", "online_url": day.get("online"),
                        "division_line": ln["text"][:80], "stated": {"ayes": None, "noes": None},
                        "parsed": {"ayes": None, "noes": None}, "reasons": ["tally-without-division-line"],
                        "unresolved_names": []})
    return good, bad


def _names(blob: str) -> list[str]:
    blob = re.sub(r"(?<=\w)-\s+(?=\w)", "-", blob)          # a line break inside "Mary-Anne"
    return [n.strip(" .") for n in re.split(r",\s*", blob) if n.strip(" .")]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_parse(args) -> None:
    cache = Path(args.cache).expanduser()
    out = Path(args.out)
    roster = Roster(REPO_ROOT / "portal" / "public")
    only = set(args.dates or [])
    days = [d for house in ("la", "lc") for d in listing(None, cache, house, args.start, args.end)]
    days = sorted((d for d in days if not only or d["date"] in only), key=lambda d: (d["date"], d["house"]))
    good, bad, files, missing, members_short = [], [], [], [], []
    for day in days:
        path = pdf_path(cache, day)
        if not path.is_file():
            missing.append({"date": day["date"], "house": day["house"], "source_url": day["pdf"]})
            continue
        members = member_list(path)
        if len(members) < (80 if day["house"] == "vic_la" else 38):
            members_short.append({"date": day["date"], "house": day["house"], "listed": len(members)})
        g, b = parse_day(pdf_lines(path), day, roster, members)
        good += g
        bad += b
        files.append({"date": day["date"], "house": day["house"], "id": day["id"], "status": day["status"],
                      "source_url": day["pdf"], "sha256": sha256(path), "divisions": len(g) + sum(bool(x["id"]) for x in b),
                      "reconciled": len(g)})
        print(f"  {day['date']} {day['house']}: {len(g)} reconciled, {len(b)} on the mismatch list", file=sys.stderr, flush=True)
    good, renumbered = hold_published_conflicts(good, REPO_ROOT / "portal" / "public" / "divisions")
    bad += renumbered
    reasons = Counter(r for b in bad for r in b["reasons"])
    log = cache / "requests.log"
    manifest = {
        "source": f"https://{HOST}/parliamentary-activity/hansard/",
        "permission": "docs/SOURCES-ACCESS.md (Parliament of Victoria, 13 October 2026)",
        "from": args.start, "to": max((d["date"] for d in days), default=None),
        "sitting_days_listed": len(days), "sitting_days_parsed": len(files), "sitting_days_missing": missing,
        "divisions_found": len(good) + sum(bool(b["id"]) for b in bad), "reconciled": len(good),
        "mismatch_list": len(bad), "mismatch_divisions_by_reason": dict(sorted(reasons.items())),
        "votes": sum(len(g["votes"]) for g in good),
        "member_lists_short": members_short,
        "name_basis": dict(sorted(Counter(v["roster_basis"] for g in good for v in g["votes"]).items())),
        "question_basis": dict(sorted(Counter(g["extra"]["question_basis"] for g in good).items())),
        "requests_made": sum(1 for _ in log.open(encoding="utf-8")) if log.is_file() else None,
        "files": files,
    }
    if args.report_only:
        print(json.dumps({k: v for k, v in manifest.items() if k != "files"}, indent=1, ensure_ascii=False))
        return
    out.mkdir(parents=True, exist_ok=True)
    with (out / "divisions.jsonl").open("w", encoding="utf-8") as f:
        for g in good:
            f.write(json.dumps(g, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    (out / "mismatches.json").write_text(json.dumps(bad, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in manifest.items() if k != "files"}, indent=1, ensure_ascii=False))


def hold_published_conflicts(good: list[dict], published: Path) -> tuple[list[dict], list[dict]]:
    """Take out the divisions whose number an already published record of that chamber-day disputes.

    Ids count the divisions of a chamber-day in order. Where an earlier import
    published a day and missed a division, the numbers after it differ: the id
    this parse gives a division is published with other tallies, or is new on a
    day whose later numbers are taken. Those go on the mismatch list (reason
    `numbering-differs-from-published`) for a reviewed renumbering; nothing
    published is replaced and no second copy of a published division is added."""
    held = {}
    for path in published.glob("division-vic-*.json"):
        record = json.loads(path.read_text(encoding="utf-8"))
        held[record["key"]] = (record.get("ayes"), record.get("noes"))
    days = {key.rsplit("-", 1)[0] for key in held}
    disputed = {g["id"].rsplit("-", 1)[0] for g in good
                if g["id"] in held and held[g["id"]] != (g["ayes_count"], g["noes_count"])}
    keep, out = [], []
    for g in good:
        day = g["id"].rsplit("-", 1)[0]
        differs = g["id"] in held and held[g["id"]] != (g["ayes_count"], g["noes_count"])
        if differs or (day in disputed and day in days and g["id"] not in held):
            out.append({"id": g["id"], "date": g["date"], "house": g["house"], "source_url": g["source_url"],
                        "online_url": g["extra"].get("online_url"), "division_line": g["extra"]["division_line"],
                        "stated": {"ayes": g["ayes_count"], "noes": g["noes_count"]},
                        "parsed": dict(g["extra"]["members_listed"]),
                        "reasons": ["numbering-differs-from-published"], "unresolved_names": [],
                        "published": {"ayes": held[g["id"]][0], "noes": held[g["id"]][1]} if g["id"] in held else None})
        else:
            keep.append(g)
    return keep, out


def read_staged(staged: Path) -> tuple[list[Division], list[Vote]]:
    """The reconciled divisions as the unified rows `votes_state` loads and the exporters read."""
    divisions, votes = [], []
    for line in (staged / "divisions.jsonl").read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        rows = row.pop("votes")
        divisions.append(Division(**row))
        votes += [Vote(row["id"], v["person_name"], v["person_raw"], None, v["vote"]) for v in rows]
    return divisions, votes


def run_unified(args) -> None:
    divisions, votes = read_staged(Path(args.staged))
    write_out(args.out, divisions, votes, {"source": SOURCE, "staged": str(args.staged)})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    f = sub.add_parser("fetch", help="listing pages and Hansard PDFs into the cache")
    f.add_argument("--cache", required=True)
    f.add_argument("--from", dest="start", default="2022-12-20", help="first sitting day (the 60th Parliament opened 20 December 2022)")
    f.add_argument("--to", dest="end", default="9999-12-31")
    f.add_argument("--dates", nargs="*", help="only these sitting dates (a pilot week)")
    f.add_argument("--cached-listing", action="store_true", help="read the listing from the cache only")
    f.add_argument("--refresh-listing", action="store_true", help="ask for the first listing page again")
    f.add_argument("--estimate", action="store_true", help="list the days and count the PDFs still to fetch, then stop")
    f.add_argument("--interval", type=float, default=MIN_INTERVAL)
    f.add_argument("--max-requests", type=int, default=3000)
    f.add_argument("--user-agent", default=source_http.USER_AGENT)
    f.set_defaults(run=run_fetch)
    p = sub.add_parser("parse", help="cache -> reconciled divisions and the mismatch list (no requests)")
    p.add_argument("--cache", required=True)
    p.add_argument("--out", default=str(REPO_ROOT / "data" / "staged" / "vic-divisions"))
    p.add_argument("--from", dest="start", default="2022-12-20")
    p.add_argument("--to", dest="end", default="9999-12-31")
    p.add_argument("--dates", nargs="*")
    p.add_argument("--report-only", action="store_true", help="print the counts, write nothing")
    p.set_defaults(run=run_parse)
    u = sub.add_parser("unified", help="staged divisions -> the votes_state JSON shape")
    u.add_argument("--staged", default=str(REPO_ROOT / "data" / "staged" / "vic-divisions"))
    u.add_argument("--out", required=True)
    u.set_defaults(run=run_unified)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
