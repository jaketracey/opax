"""
parli.ingest.votes_state -- PROTOTYPE division (recorded vote) fetchers for the
state parliaments, plus a mapping of the existing federal table, all emitting
one unified schema. Survey, results and the ingestion plan: docs/VOTES.md.

Sources
  nsw      NSW Parliament Hansard API (no auth). The daily table-of-contents XML
           carries a structured <division> per vote: ayes/noes <count>, one
           <aye>/<noe> per member, <pairs>. From 2016 members are <id>s (names
           resolve through the TOC's <talker> elements, which carry id + name);
           1991-2015 TOCs carry surname-only <name>s with id 0. The topic's
           fragment adds the motion text and a surname+initial table.
  vic      Parliament of Victoria daily Hansard PDF (the JSON search API lists
           sitting days). Plain text: "Assembly divided on motion:" then
           "Ayes (50): Full Name, Full Name, ..." / "Noes (29): ...".
  qld      Queensland Record of Proceedings PDF: "Division: Question put—...",
           "AYES, 51:", party groups "LNP, 51—Surname, Surname, ...",
           "Pair: A, B.", "Resolved in the affirmative." Surnames only.
  federal  The existing parli.db divisions/votes/members tables (TheyVoteForYou),
           read directly -- run this one on `desktop` where parli.db lives.

Unified output (JSON; one file per run, `merge` combines them)
  division  id, jurisdiction, house, date, number, name, question, bill_ref,
            ayes_count, noes_count, result, source, source_url, extra
  vote      division_id, person_name, person_raw, person_id, vote, party
            person_name is speaker_names.normalize_speaker(person_raw), i.e. the
            same form the KB stores in origin.collaborators, so a speaker filter
            on a name catches both speeches and divisions.
            vote is 'aye' | 'no' | 'paired' (pairs are recorded, not counted).

Usage
  python -m parli.ingest.votes_state nsw --year 2025 --days 3 --out scripts/harness_runs/votes_nsw.json
  python -m parli.ingest.votes_state vic --days 2 --out scripts/harness_runs/votes_vic.json
  python -m parli.ingest.votes_state qld --pdf ~/.cache/autoresearch/qld_parliament/pdfs/2026-03-04.pdf --out ...
  python -m parli.ingest.votes_state qld --date 2026-03-04 --out ...        # downloads the PDF
  python -m parli.ingest.votes_state federal --db ~/.cache/autoresearch/parli.db --since 2025-01-01 --days 6 --out ...
  python -m parli.ingest.votes_state merge a.json b.json --out scripts/harness_runs/votes_sample.json
  python -m parli.ingest.votes_state load scripts/harness_runs/votes_sample.json          # -> ext_divisions / ext_votes on `desktop`
  python -m parli.ingest.votes_state load votes_nsw.json --db ~/.cache/autoresearch/parli.db   # when running on the box
  python -m parli.ingest.votes_state render scripts/harness_runs/votes_sample.json --limit 3   # print the KB documents, push nothing

Every fetcher also takes `--load` to write straight into the ext_ tables after
the JSON is written. Loads are a per-source, per-chamber-day replace (DELETE
the (house, date) pairs the run covered, INSERT the fresh rows), so re-running
a day picks up a corrected Hansard without disturbing the rest of the table
and nothing here ever touches the legacy `divisions` / `votes` tables.

Fetching and parsing is stdlib only, so it runs under the system python3 on
`desktop`. PDF text comes from the `pdftotext` binary (poppler) with
pdfminer.six as the fallback -- neither is on `desktop`, so run VIC/QLD on the
laptop. `load` imports parli.ingest.ext_common (needs `requests`, present on
both machines).
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from parli.ingest.speaker_names import normalize_speaker

USER_AGENT = "OPAX research (opax.com.au)"
CACHE_DIR = Path("~/.cache/autoresearch/votes_state").expanduser()
REPO_ROOT = Path(__file__).resolve().parents[2]
SPEAKERS_JSON = REPO_ROOT / "portal" / "public" / "speakers.json"

NSW_API = "https://api.parliament.nsw.gov.au/api/hansard/search"
NSW_VIEWER = "https://www.parliament.nsw.gov.au/Hansard/Pages/HansardResult.aspx#/docid/"
NSW_CHAMBERS = {"Legislative Assembly": "nsw_la", "Legislative Council": "nsw_lc"}

VIC_BASE = "https://www.parliament.vic.gov.au"
VIC_HOUSES = {"la": ("10", "vic_la", "Assembly"), "lc": ("20", "vic_lc", "Council")}

QLD_PDF_BASE = "https://documents.parliament.qld.gov.au/events/han"
QLD_PARTIES = {
    "LNP": "LNP", "ALP": "Labor", "Grn": "Greens", "Greens": "Greens",
    "KAP": "Katter's Australian Party", "PHON": "One Nation", "ON": "One Nation",
    "Ind": "Independent", "Independent": "Independent",
}

BILL_RE = re.compile(
    r"([A-Z][^.;:\n]*?\bBill\b(?:\s*\(No\.?\s*\d+\))?\s*\d{4}(?:\s*\[\d{4}\])?)"
)


# ---------------------------------------------------------------------------
# Unified schema
# ---------------------------------------------------------------------------


@dataclass
class Division:
    id: str
    jurisdiction: str           # federal | nsw | vic | qld | sa | wa | tas | act | nt
    house: str                  # corpus chamber code: representatives, senate, nsw_la, vic_lc, qld_la ...
    date: str                   # ISO
    number: Optional[int]       # ordinal within the sitting day where the source has one
    name: str                   # short label (topic / bill / motion)
    question: Optional[str]     # the motion text as put, when recoverable
    bill_ref: Optional[str]
    ayes_count: Optional[int]
    noes_count: Optional[int]
    result: Optional[str]       # affirmative | negative | None
    source: str
    source_url: str
    extra: dict = field(default_factory=dict)


@dataclass
class Vote:
    division_id: str
    person_name: Optional[str]  # normalize_speaker form == KB origin.collaborators value
    person_raw: Optional[str]
    person_id: Optional[str]    # source-scoped: tvfy_10007, nsw_97 ...
    vote: str                   # aye | no | paired (| abstention | absent from TVFY)
    party: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get(url: str, accept: str = "*/*", delay: float = 0.15,
         cache_key: Optional[str] = None, retries: int = 3) -> bytes:
    if cache_key:
        p = CACHE_DIR / cache_key
        if p.exists():
            return p.read_bytes()
    req = urllib_request(url, accept)
    data = b""
    for attempt in range(retries):
        try:
            time.sleep(delay)
            import urllib.request
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            break
        except Exception as e:  # noqa: BLE001 - retry anything transient
            if attempt == retries - 1:
                raise
            print(f"  retry {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(2 ** (attempt + 1))
    if cache_key:
        p = CACHE_DIR / cache_key
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    return data


def urllib_request(url: str, accept: str):
    import urllib.request
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})


def bill_ref(*texts: Optional[str]) -> Optional[str]:
    for t in texts:
        if t:
            m = BILL_RE.search(t)
            if m:
                return re.sub(r"\s+", " ", m.group(1)).strip()
    return None


def pdf_text(pdf: Path) -> str:
    if shutil.which("pdftotext"):
        out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"],
                             check=True, capture_output=True)
        return out.stdout.decode("utf-8", "replace")
    try:
        from pdfminer.high_level import extract_text  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise SystemExit("need `pdftotext` (poppler) on PATH or pdfminer.six") from e
    return extract_text(str(pdf))


def result_from_text(t: Optional[str]) -> Optional[str]:
    if not t:
        return None
    s = t.lower()
    if "affirmative" in s or "agreed to" in s or "passed" in s or "carried" in s:
        return "affirmative"
    if "negative" in s or "negatived" in s or "defeated" in s or "not agreed" in s:
        return "negative"
    return None


def _split_names(blob: str) -> list[str]:
    blob = re.sub(r"-\s+", "-", blob.replace("\n", " "))   # PDF wrap inside 'Mary-Anne'
    return [n.strip(" .") for n in re.split(r",\s*", blob) if n.strip(" .")]


def person_key(name: Optional[str]) -> Optional[str]:
    """Join key that survives the variants the sources disagree on: case of
    particles ('de Vietri' / 'De Vietri'), hyphen casing, curly vs straight
    apostrophes, diacritics. NOT an identity -- two people with one name still
    collide -- but it lets a vote find its speaker's collaborator value."""
    if not name:
        return None
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("’", "'").replace("‘", "'").casefold()
    s = re.sub(r"[^a-z0-9' -]+", " ", s)
    return re.sub(r"\s+", " ", s).strip() or None


# ---------------------------------------------------------------------------
# NSW -- Hansard API, structured <division> elements
# ---------------------------------------------------------------------------


def nsw_sitting_days(year: int) -> list[dict]:
    raw = _get(f"{NSW_API}/year/{year}", accept="application/json",
               cache_key=f"nsw/year_{year}.json")
    days = []
    for d in json.loads(raw):
        for ev in d.get("Events", []):
            house = NSW_CHAMBERS.get(ev.get("Chamber", ""))
            if house and ev.get("TocDocId"):
                days.append({"date": d["date"], "house": house, "toc": ev["TocDocId"],
                             "pdf": ev.get("PdfDocId"), "uncorrected": ev.get("Uncorrected")})
    return sorted(days, key=lambda x: (x["date"], x["house"]))


def nsw_toc(toc_id: str) -> ET.Element:
    return ET.fromstring(_get(f"{NSW_API}/daily/tableofcontents/{toc_id}",
                              accept="application/xml", cache_key=f"nsw/toc/{toc_id}.xml"))


def nsw_fragment(uid: str) -> ET.Element:
    return ET.fromstring(_get(f"{NSW_API}/daily/fragment/{uid}",
                              accept="application/xml", cache_key=f"nsw/frag/{uid}.xml"))


def nsw_members_path() -> Path:
    return CACHE_DIR / "nsw" / "members.json"


# A member in the chair is printed with the office run straight into the name:
# 'The DEPUTY PRESIDENTMs Abigail Boyd', 'The DEPUTY PRESIDENTThe Hon. Peter Primrose'.
_NSW_ROLE_RUNON = re.compile(
    r"^(?:The\s+)?(?:DEPUTY\s+|ACTING\s+|TEMPORARY\s+|ASSISTANT\s+)?(?:PRESIDENT|SPEAKER|CHAIR)\s*"
    r"(?=(?:The\s+Hon|Mr|Mrs|Ms|Miss|Dr|Rev)\b)", re.IGNORECASE)


def nsw_clean_talker_name(raw: str) -> str:
    return _NSW_ROLE_RUNON.sub("", raw).strip()


def nsw_update_member_map(root: ET.Element, members: dict) -> None:
    """id -> {name, normalized, electorate} from every <talker> in a TOC.
    Prefer the fullest name seen for an id ('Mr RON HOENIG' over 'Mr HOENIG')."""
    for t in root.iter("talker"):
        tid = (t.findtext("id") or "").strip()
        raw = nsw_clean_talker_name((t.findtext("name") or "").strip())
        if not tid or tid == "0" or not raw:
            continue
        norm = normalize_speaker(raw)
        if not norm:
            continue
        cur = members.get(tid)
        if cur is None or len(norm.split()) > len(cur["normalized"].split()):
            members[tid] = {"name": raw, "normalized": norm,
                            "electorate": (t.findtext("electorate") or "").strip()}


def nsw_load_member_map() -> dict:
    """The cached id->name map, re-cleaned so a map built before a parser fix
    doesn't have to be rebuilt from 100+ TOC fetches."""
    mp = nsw_members_path()
    if not mp.exists():
        return {}
    members = json.loads(mp.read_text())
    for tid, rec in list(members.items()):
        raw = nsw_clean_talker_name(rec["name"])
        norm = normalize_speaker(raw)
        if not norm:
            del members[tid]
            continue
        rec["name"], rec["normalized"] = raw, norm
    return members


XH = "{http://www.w3.org/1999/xhtml}"
_NSW_NAME_CELL = re.compile(
    r"[A-Z][A-Za-z'’\-]+(?: [A-Z][A-Za-z'’\-]+)*, [A-Z][A-Za-z.\- ]*(?: \((?:teller|Teller)\))?"
)


def nsw_fragment_blocks(frag: ET.Element) -> list[dict]:
    """One dict per 'The House divided.' block in a fragment, in document order:
    the motion text put (nearest preceding 'That ...' paragraph), the outcome
    paragraph, and the surname+initial cells under the AYES/NOES/PAIRS headings."""
    ft = frag.find(".//fragment.text")
    if ft is None:
        return []
    paras = [p for p in ft.iter() if p.tag in (f"{XH}p", "p")]
    texts = [re.sub(r"\s+", " ", "".join(p.itertext())).strip() for p in paras]
    classes = [p.get("class", "") for p in paras]
    blocks = []
    for k, t in enumerate(texts):
        if not re.fullmatch(r"The (House|Council|Committee) divided\.?", t):
            continue
        question = None
        for b in range(k - 1, max(-1, k - 60), -1):
            if texts[b].startswith("That "):
                question = texts[b]
                break
        names: dict[str, list[str]] = {"aye": [], "no": [], "paired": []}
        side = None
        result_text = None
        for j in range(k + 1, min(len(texts), k + 300)):
            tj, cj = texts[j], classes[j]
            if not tj or cj.startswith("DivisionSummary"):
                continue
            if cj.startswith("DivisionHeading") or tj.upper() in ("AYES", "NOES", "PAIRS", "PAIR"):
                side = {"AYES": "aye", "NOES": "no", "PAIRS": "paired", "PAIR": "paired"}.get(tj.upper(), side)
                continue
            if side and (cj.startswith("Division") or _NSW_NAME_CELL.fullmatch(tj)):
                names[side].append(tj)
                continue
            result_text = tj
            break
        blocks.append({"question": question, "result_text": result_text, "names": names})
    return blocks


def nsw_parse_day(day: dict, members: dict, fetch_fragments: bool = True
                  ) -> tuple[list[Division], list[Vote]]:
    root = nsw_toc(day["toc"])
    nsw_update_member_map(root, members)
    parents = {c: p for p in root.iter() for c in p}
    divisions: list[Division] = []
    votes: list[Vote] = []
    per_topic: Counter = Counter()
    frag_blocks: dict[str, list[dict]] = {}
    seq = 0
    for div in root.iter("division"):
        seq += 1
        topic = div
        while topic in parents and topic.tag != "topic":
            topic = parents[topic]
        uid = topic.get("uid") if topic.tag == "topic" else None
        title = ""
        ti = topic.find("topicinfo") if topic.tag == "topic" else None
        if ti is not None:
            title = "; ".join(t.text.strip() for t in ti.iter("text") if t.text and t.text.strip())
        k = per_topic[uid]
        per_topic[uid] += 1

        block = None
        if fetch_fragments and uid:
            if uid not in frag_blocks:
                try:
                    frag_blocks[uid] = nsw_fragment_blocks(nsw_fragment(uid))
                except Exception as e:  # noqa: BLE001
                    print(f"  fragment {uid}: {e}", file=sys.stderr)
                    frag_blocks[uid] = []
            blocks = frag_blocks[uid]
            block = blocks[k] if k < len(blocks) else None

        def count(el: Optional[ET.Element]) -> Optional[int]:
            if el is None:
                return None
            c = (el.findtext("count") or "").strip()
            if c.isdigit():
                return int(c)
            m = re.search(r"(\d+)", el.findtext("text") or "")
            return int(m.group(1)) if m else None

        ayes_el, noes_el = div.find("ayes"), div.find("noes")
        ayes_n, noes_n = count(ayes_el), count(noes_el)
        result = result_from_text(div.findtext("questionresolved")) \
            or (result_from_text(block["result_text"]) if block else None)
        if result is None and ayes_n is not None and noes_n is not None:
            result = "affirmative" if ayes_n > noes_n else "negative"

        div_id = f"nsw-{day['house'][-2:]}-{day['date']}-{seq}"
        unresolved = 0
        tellers: list[str] = []

        def emit(el: Optional[ET.Element], tag: str, vote: str) -> int:
            nonlocal unresolved
            n = 0
            if el is None:
                return 0
            for m in el.iter(tag):
                mid = (m.findtext("id") or "").strip()
                raw = (m.findtext("name") or "").strip() or None
                if (not raw) and mid and mid != "0":
                    raw = (members.get(mid) or {}).get("name")
                if (m.findtext("teller") or "").strip().lower() == "true" and raw:
                    tellers.append(raw)
                name = normalize_speaker(raw) if raw else None
                if name is None:
                    unresolved += 1
                votes.append(Vote(div_id, name, raw, f"nsw_{mid}" if mid and mid != "0" else None, vote))
                n += 1
            return n

        n_aye = emit(ayes_el, "aye", "aye")
        n_no = emit(noes_el, "noe", "no")
        n_pair = emit(div.find("pairs"), "pair", "paired")

        question = block["question"] if block else None
        divisions.append(Division(
            id=div_id, jurisdiction="nsw", house=day["house"], date=day["date"], number=seq,
            name=title or (question or "")[:160] or f"Division {seq}",
            question=question, bill_ref=bill_ref(title, question),
            ayes_count=ayes_n, noes_count=noes_n, result=result,
            source="nsw_hansard_api",
            source_url=f"{NSW_API}/daily/fragment/{uid}" if uid else f"{NSW_API}/daily/tableofcontents/{day['toc']}",
            extra={
                "viewer_url": f"{NSW_VIEWER}{uid}" if uid else None,
                "toc_id": day["toc"], "topic_uid": uid, "uncorrected": day.get("uncorrected"),
                "members_listed": {"aye": n_aye, "no": n_no, "paired": n_pair},
                "unresolved_names": unresolved, "tellers": tellers,
                "table_names": block["names"] if block else None,
            },
        ))
    return divisions, votes


def run_nsw(args) -> tuple[list[Division], list[Vote], dict]:
    members = nsw_load_member_map()
    mp = nsw_members_path()
    days = nsw_sitting_days(args.year)
    if args.house != "both":
        days = [d for d in days if d["house"] == f"nsw_{args.house}"]
    print(f"[nsw] {args.year}: {len(days)} chamber-days listed", file=sys.stderr)

    # Build the id->name map from every TOC of the year (cached after first run):
    # a member who never speaks in the sampled days still votes in them.
    if not args.no_map:
        for i, d in enumerate(days, 1):
            try:
                nsw_update_member_map(nsw_toc(d["toc"]), members)
            except Exception as e:  # noqa: BLE001
                print(f"  toc {d['toc']}: {e}", file=sys.stderr)
            if i % 20 == 0:
                print(f"  member map: {i}/{len(days)} TOCs, {len(members)} ids", file=sys.stderr)
        mp.parent.mkdir(parents=True, exist_ok=True)
        mp.write_text(json.dumps(members, indent=1, ensure_ascii=False))
    print(f"[nsw] member map: {len(members)} ids", file=sys.stderr)

    sample = sorted(days, key=lambda x: x["date"], reverse=True)[: args.days]
    divisions, votes = [], []
    for d in sample:
        dv, vt = nsw_parse_day(d, members, fetch_fragments=not args.no_fragments)
        print(f"  {d['date']} {d['house']}: {len(dv)} divisions, {len(vt)} votes", file=sys.stderr)
        divisions += dv
        votes += vt
    meta = {"year": args.year, "sampled_days": [(d["date"], d["house"]) for d in sample],
            "member_map_size": len(members)}
    return divisions, votes, meta


# ---------------------------------------------------------------------------
# VIC -- daily Hansard PDF
# ---------------------------------------------------------------------------

VIC_DIVIDED_RE = re.compile(r"^\s*(Assembly|Council) divided on ([a-z][^:]*):?\s*$")
VIC_SIDE_RE = re.compile(r"^\s*(Ayes|Noes|Pairs?)\s*\((\d+)\)\s*:\s*(.*)$")
VIC_FURNITURE_RE = re.compile(
    r"^\s*(\d+\s+Legislative (?:Assembly|Council)\b|.*Legislative (?:Assembly|Council)\s+[–-]\s|[A-Z][A-Z ,'’]{3,}$|"
    r"(?:Mon|Tues|Wednes|Thurs|Fri)day,? \d{1,2} \w+ \d{4}\s*$)"
)
VIC_RESULT_RE = re.compile(
    r"^\s*(?:Motion|Question|Amendment|Amendments|Bill|Clause|Motion,? as amended,?|Question, as amended,?)\b"
    r".*?\b(agreed to|defeated|negatived|passed|not agreed to|carried)\.?\s*$"
)


def vic_sitting_days(house: str, page_size: int = 20) -> list[dict]:
    hid, chamber, label = VIC_HOUSES[house]
    raw = _get(f"{VIC_BASE}/api/search/debate?page=1&pageSize={page_size}&hansard-house={hid}",
               accept="application/json")
    out = []
    for h in json.loads(raw)["result"]["hits"]:
        pdf = (h.get("downloadButton") or {}).get("href")
        d = (h.get("date1") or "")[:10]
        if pdf and d:
            out.append({"date": d, "house": chamber, "label": label, "id": h.get("id"),
                        "status": h.get("status"), "pdf": VIC_BASE + pdf,
                        "online": VIC_BASE + ((h.get("onlineButton") or {}).get("href") or "")})
    return sorted(out, key=lambda x: x["date"], reverse=True)


def vic_parse_text(text: str, day: dict) -> tuple[list[Division], list[Vote]]:
    lines = text.splitlines()
    divisions: list[Division] = []
    votes: list[Vote] = []
    seq = 0
    i = 0
    while i < len(lines):
        m = VIC_DIVIDED_RE.match(lines[i])
        if not m:
            i += 1
            continue
        seq += 1
        sides: dict[str, list] = {}
        cur = None
        result_text = None
        j = i + 1
        while j < len(lines) and j < i + 120:
            ln = lines[j].strip()
            j += 1
            if not ln:
                continue
            sm = VIC_SIDE_RE.match(ln)
            if sm:
                cur = {"Ayes": "aye", "Noes": "no", "Pair": "paired", "Pairs": "paired"}[sm.group(1)]
                sides[cur] = [int(sm.group(2)), sm.group(3)]
                continue
            if VIC_FURNITURE_RE.match(ln) or BILL_RE.search(ln):
                continue
            rm = VIC_RESULT_RE.match(ln)
            if rm and cur:
                result_text = ln
                break
            if cur and ":" not in ln and not ln.endswith(".") and "(" not in ln:
                sides[cur][1] += " " + ln
                continue
            if cur:
                result_text = ln
            break

        # Motion text: nearest preceding indented 'That ...' paragraph (motions are
        # set in from the margin in the -layout text; speech lines are not).
        question = None
        for b in range(i - 1, max(-1, i - 60), -1):
            s = lines[b].strip()
            prev = next((lines[c].strip() for c in range(b - 1, max(-1, b - 3), -1) if lines[c].strip()), "")
            if s.startswith("That ") and (re.match(r"^\s{4,}", lines[b]) or prev.endswith(":")):
                q = [s]
                for c in range(b + 1, min(i, b + 6)):
                    nxt = lines[c].strip()
                    if not nxt or VIC_FURNITURE_RE.match(nxt):
                        break
                    q.append(nxt)
                    if nxt.endswith("."):
                        break
                question = " ".join(q)
                break
        # Bill: nearest centred heading naming a Bill; re-join a wrapped heading.
        ref = None
        for b in range(i - 1, max(-1, i - 200), -1):
            s = lines[b].strip()
            if re.match(r"^\s{8,}\S", lines[b]) and BILL_RE.search(s) and len(s) < 140 \
                    and not s.startswith("That ") and ":" not in s and not s.endswith("."):
                if s.count(")") > s.count("(") and b > 0 and re.match(r"^\s{8,}\S", lines[b - 1]):
                    s = lines[b - 1].strip() + " " + s
                ref = bill_ref(s)
                break

        div_id = f"vic-{day['house'][-2:]}-{day['date']}-{seq}"
        counts = {k: v[0] for k, v in sides.items()}
        listed = {}
        for side, (n, blob) in sides.items():
            names = _split_names(blob)
            listed[side] = len(names)
            for raw in names:
                votes.append(Vote(div_id, normalize_speaker(raw), raw, None, side))
        divisions.append(Division(
            id=div_id, jurisdiction="vic", house=day["house"], date=day["date"], number=seq,
            name=ref or (question or "")[:160] or f"{day['label']} divided on {m.group(2)}",
            question=question, bill_ref=ref,
            ayes_count=counts.get("aye"), noes_count=counts.get("no"),
            result=result_from_text(result_text), source="vic_hansard_pdf",
            source_url=day["pdf"],
            extra={"online_url": day.get("online"), "status": day.get("status"),
                   "divided_on": m.group(2), "members_listed": listed,
                   "result_text": result_text},
        ))
        i = j
    return divisions, votes


def run_vic(args) -> tuple[list[Division], list[Vote], dict]:
    houses = ["la", "lc"] if args.house == "both" else [args.house]
    days = []
    for h in houses:
        days += vic_sitting_days(h)
    days = sorted(days, key=lambda x: x["date"], reverse=True)[: args.days]
    divisions, votes = [], []
    for d in days:
        pdf_path = CACHE_DIR / "vic" / f"{d['id']}.pdf"
        if not pdf_path.exists():
            pdf_path.parent.mkdir(parents=True, exist_ok=True)
            pdf_path.write_bytes(_get(d["pdf"], accept="application/pdf", delay=1.0))
        dv, vt = vic_parse_text(pdf_text(pdf_path), d)
        print(f"  {d['date']} {d['house']} ({d['status']}): {len(dv)} divisions, {len(vt)} votes", file=sys.stderr)
        divisions += dv
        votes += vt
    return divisions, votes, {"sampled_days": [(d["date"], d["house"], d["status"]) for d in days]}


# ---------------------------------------------------------------------------
# QLD -- Record of Proceedings PDF
# ---------------------------------------------------------------------------

QLD_DIV_RE = re.compile(r"^\s*Division:\s*Question put—\s*(.*)$")
QLD_SIDE_RE = re.compile(r"^\s*(AYES|NOES),\s*(\d+):\s*$")
QLD_GROUP_RE = re.compile(r"^\s*([A-Za-z][A-Za-z'’ ]*?),\s*(\d+)—\s*(.*)$")
QLD_PAIR_RE = re.compile(r"^\s*Pairs?:\s*(.*)$")
QLD_RESULT_RE = re.compile(r"^\s*Resolved in the (affirmative|negative)\.?")
QLD_HDR_RE = re.compile(
    r"^\s*\d+\s{2,}(.*?)\s{2,}(\d{1,2} \w{3} \d{4})\s*$|^\s*(\d{1,2} \w{3} \d{4})\s{2,}(.*?)\s{2,}\d+\s*$"
)


def qld_parse_text(text: str, sitting_date: Optional[str], source_url: str
                   ) -> tuple[list[Division], list[Vote]]:
    lines = text.splitlines()
    if not sitting_date:
        for ln in lines:
            m = QLD_HDR_RE.match(ln)
            if m:
                ds = m.group(2) or m.group(3)
                sitting_date = datetime.strptime(ds, "%d %b %Y").date().isoformat()
                break
    if not sitting_date:
        raise SystemExit("could not infer the sitting date; pass --date")

    divisions: list[Division] = []
    votes: list[Vote] = []
    per_day: dict[str, int] = {}
    seq = 0
    i = 0
    while i < len(lines):
        m = QLD_DIV_RE.match(lines[i])
        if not m or "...." in lines[i]:          # skip the table-of-contents entries
            i += 1
            continue
        seq += 1
        question = m.group(1).strip()
        j = i + 1
        while not question.endswith(".") and j < len(lines) and lines[j].strip() \
                and not QLD_SIDE_RE.match(lines[j]):
            question += " " + lines[j].strip()
            j += 1
        counts: dict[str, int] = {}
        groups: list[tuple[str, str, int, str]] = []   # side, party, n, names blob
        pairs_blob = ""
        result = None
        cur_side = None
        while j < len(lines) and j < i + 80:
            ln = lines[j].rstrip()
            j += 1
            if not ln.strip() or QLD_HDR_RE.match(ln) or "...." in ln:
                continue
            sm = QLD_SIDE_RE.match(ln)
            if sm:
                cur_side = "aye" if sm.group(1) == "AYES" else "no"
                counts[cur_side] = int(sm.group(2))
                continue
            gm = QLD_GROUP_RE.match(ln)
            if gm and cur_side:
                groups.append((cur_side, gm.group(1).strip(), int(gm.group(2)), gm.group(3).strip()))
                continue
            pm = QLD_PAIR_RE.match(ln)
            if pm:
                pairs_blob = pm.group(1).strip()
                continue
            rm = QLD_RESULT_RE.match(ln)
            if rm:
                result = rm.group(1)
                break
            if groups and not groups[-1][3].endswith("."):
                s, p, n, blob = groups[-1]
                groups[-1] = (s, p, n, blob + " " + ln.strip())
                continue
            if pairs_blob and not pairs_blob.endswith("."):
                pairs_blob += " " + ln.strip()
                continue
            if ln.strip().startswith("Motion") or ln.strip().startswith("Non-government"):
                break

        # Running page headers carry the debate title and the sitting date; a
        # WEEKLY PDF spans several days, so date each division from the nearest one.
        ref = None
        div_date = sitting_date
        for b in range(i, max(-1, i - 400), -1):
            hm = QLD_HDR_RE.match(lines[b])
            if hm:
                if div_date == sitting_date and b < i:
                    try:
                        div_date = datetime.strptime(hm.group(2) or hm.group(3), "%d %b %Y").date().isoformat()
                    except ValueError:
                        pass
                title = (hm.group(1) or hm.group(4) or "").strip()
                if "Bill" in title:
                    ref = bill_ref(title) or title
                    break
        per_day[div_date] = per_day.get(div_date, 0) + 1
        seq_for_id = per_day[div_date]
        div_id = f"qld-la-{div_date}-{seq_for_id}"
        listed: Counter = Counter()
        for side, party, n, blob in groups:
            names = _split_names(blob)
            listed[side] += len(names)
            for raw in names:
                votes.append(Vote(div_id, normalize_speaker(raw), raw, None, side,
                                  QLD_PARTIES.get(party, party)))
        for grp in re.split(r";\s*", pairs_blob.rstrip(".")):
            for raw in _split_names(grp):
                votes.append(Vote(div_id, normalize_speaker(raw), raw, None, "paired"))
        divisions.append(Division(
            id=div_id, jurisdiction="qld", house="qld_la", date=div_date, number=seq_for_id,
            name=ref or question[:160], question=question, bill_ref=ref,
            ayes_count=counts.get("aye"), noes_count=counts.get("no"), result=result,
            source="qld_record_of_proceedings_pdf", source_url=source_url,
            extra={"members_listed": dict(listed),
                   "party_groups": [{"side": s, "party": QLD_PARTIES.get(p, p), "count": n} for s, p, n, _ in groups],
                   "pairs_raw": pairs_blob or None},
        ))
        i = j
    return divisions, votes


def qld_download(sitting_date: str) -> tuple[Path, str]:
    d = date.fromisoformat(sitting_date)
    for suffix in ("_A", "_WEEKLY", "_B", "_C", ""):
        url = f"{QLD_PDF_BASE}/{d.year}/{d.strftime('%Y_%m_%d')}{suffix}.PDF"
        try:
            data = _get(url, accept="application/pdf", delay=1.0)
        except Exception:  # noqa: BLE001 - 404 -> try the next suffix
            continue
        if len(data) > 1000:
            p = CACHE_DIR / "qld" / f"{sitting_date}{suffix}.pdf"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
            return p, url
    raise SystemExit(f"no Record of Proceedings PDF found for {sitting_date}")


def run_qld(args) -> tuple[list[Division], list[Vote], dict]:
    if args.pdf:
        pdf, url = Path(args.pdf).expanduser(), args.pdf_url or f"{QLD_PDF_BASE}/(cached: {Path(args.pdf).name})"
    else:
        pdf, url = qld_download(args.date)
    divisions, votes = qld_parse_text(pdf_text(pdf), args.date, url)
    print(f"  qld {pdf.name}: {len(divisions)} divisions, {len(votes)} votes", file=sys.stderr)
    return divisions, votes, {"pdf": str(pdf)}


# ---------------------------------------------------------------------------
# Federal -- existing parli.db (TheyVoteForYou)
# ---------------------------------------------------------------------------


def run_federal(args) -> tuple[list[Division], list[Vote], dict]:
    db = sqlite3.connect(f"file:{Path(args.db).expanduser()}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    # Whole chamber-days only: the ext_ load replaces per (house, date), so a
    # run must never carry half a sitting day.
    days = db.execute(
        "SELECT house, date FROM divisions WHERE COALESCE(state,'federal')='federal' AND date >= ? "
        "GROUP BY house, date ORDER BY date DESC, house LIMIT ?", (args.since, args.days)).fetchall()
    rows = []
    for d in days:
        rows += db.execute(
            "SELECT * FROM divisions WHERE COALESCE(state,'federal')='federal' AND house = ? AND date = ? "
            "ORDER BY number, division_id", (d["house"], d["date"])).fetchall()
    divisions: list[Division] = []
    votes: list[Vote] = []
    for d in rows:
        house = d["house"]
        url = f"https://theyvoteforyou.org.au/divisions/{house}/{d['date']}" + \
              (f"/{d['number']}" if d["number"] else "")
        summary = re.sub(r"<[^>]+>", " ", html.unescape(d["summary"] or ""))
        summary = re.sub(r"\s+", " ", summary).strip()
        result = None
        if d["aye_votes"] is not None and d["no_votes"] is not None:
            result = "affirmative" if d["aye_votes"] > d["no_votes"] else "negative"
        div_id = f"federal-{house}-{d['division_id']}"
        for v in db.execute(
                "SELECT v.person_id, v.vote, m.full_name, m.party_canonical, m.party "
                "FROM votes v LEFT JOIN members m ON m.person_id = v.person_id "
                "WHERE v.division_id = ?", (d["division_id"],)):
            raw = v["full_name"]
            votes.append(Vote(div_id, normalize_speaker(raw) if raw else None, raw,
                              f"tvfy_{v['person_id']}", v["vote"],
                              v["party_canonical"] or v["party"]))
        divisions.append(Division(
            id=div_id, jurisdiction="federal", house=house, date=d["date"], number=d["number"],
            name=d["name"] or "", question=(summary[:2000] or None), bill_ref=bill_ref(d["name"]),
            ayes_count=d["aye_votes"], noes_count=d["no_votes"], result=result,
            source="theyvoteforyou", source_url=url,
            extra={"tvfy_division_id": d["division_id"], "possible_turnout": d["possible_turnout"],
                   "rebellions": d["rebellions"]},
        ))
    return divisions, votes, {"db": args.db, "since": args.since,
                              "sampled_days": [(d["date"], d["house"]) for d in days]}


# ---------------------------------------------------------------------------
# ext_divisions / ext_votes (parli.db, additive) and the KB document shape
# ---------------------------------------------------------------------------

EXT_DDL = """
CREATE TABLE IF NOT EXISTS ext_divisions (
    id            TEXT PRIMARY KEY,          -- federal-senate-10113 | nsw-la-2025-12-22-3 | vic-lc-... | qld-la-...
    jurisdiction  TEXT NOT NULL,             -- federal | nsw | vic | qld | sa | wa | tas | act | nt
    house         TEXT NOT NULL,             -- corpus chamber code: representatives, senate, nsw_la, vic_lc, qld_la ...
    date          TEXT NOT NULL,             -- ISO
    number        INTEGER,                   -- ordinal within the sitting day
    name          TEXT,
    question      TEXT,
    bill_ref      TEXT,
    ayes_count    INTEGER,
    noes_count    INTEGER,
    result        TEXT,                      -- affirmative | negative
    source        TEXT NOT NULL,             -- theyvoteforyou | nsw_hansard_api | vic_hansard_pdf | qld_record_of_proceedings_pdf
    source_url    TEXT,
    extra         TEXT,                      -- JSON: source ids, pairs, tellers, party groups, name tables
    ingested_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ext_divisions_day ON ext_divisions (source, house, date);
CREATE INDEX IF NOT EXISTS ix_ext_divisions_bill ON ext_divisions (bill_ref);

CREATE TABLE IF NOT EXISTS ext_votes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    division_id   TEXT NOT NULL,             -- ext_divisions.id
    jurisdiction  TEXT NOT NULL,
    house         TEXT NOT NULL,             -- denormalised with date/source so a chamber-day replace needs no join
    date          TEXT NOT NULL,
    source        TEXT NOT NULL,
    person_name   TEXT,                      -- speaker_names.normalize_speaker(person_raw) == KB origin.collaborators value
    person_key    TEXT,                      -- relaxed join key (casefold, apostrophes, diacritics); not an identity
    person_raw    TEXT,                      -- as printed
    person_id     TEXT,                      -- source-scoped: tvfy_10007, nsw_2256; NULL for PDF sources
    vote          TEXT NOT NULL,             -- aye | no | paired
    party         TEXT                       -- where the source gives it (federal via members, QLD inline)
);
CREATE INDEX IF NOT EXISTS ix_ext_votes_division ON ext_votes (division_id);
CREATE INDEX IF NOT EXISTS ix_ext_votes_person ON ext_votes (person_key, date);
CREATE INDEX IF NOT EXISTS ix_ext_votes_day ON ext_votes (source, house, date);
"""

DIVISION_COLUMNS = ["id", "jurisdiction", "house", "date", "number", "name", "question", "bill_ref",
                    "ayes_count", "noes_count", "result", "source", "source_url", "extra", "ingested_at"]
VOTE_COLUMNS = ["division_id", "jurisdiction", "house", "date", "source", "person_name", "person_key",
                "person_raw", "person_id", "vote", "party"]

HOUSE_NAMES = {
    "representatives": "House of Representatives", "senate": "Senate",
    "nsw_la": "NSW Legislative Assembly", "nsw_lc": "NSW Legislative Council",
    "vic_la": "Victorian Legislative Assembly", "vic_lc": "Victorian Legislative Council",
    "qld_la": "Queensland Legislative Assembly",
    "sa_ha": "South Australian House of Assembly", "sa_lc": "South Australian Legislative Council",
    "wa_la": "WA Legislative Assembly", "wa_lc": "WA Legislative Council",
    "tas_ha": "Tasmanian House of Assembly", "tas_lc": "Tasmanian Legislative Council",
    "act_la": "ACT Legislative Assembly", "nt_la": "NT Legislative Assembly",
}


def load_ext(divisions: list[Division], votes: list[Vote], writer, notes: Optional[str] = None) -> list[dict]:
    """Replace, per source, every (house, date) chamber-day present in `divisions`."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    by_source: dict[str, list[Division]] = {}
    for d in divisions:
        by_source.setdefault(d.source, []).append(d)
    div_source = {d.id: d.source for d in divisions}
    results = []
    for source, divs in by_source.items():
        days = sorted({(d.house, d.date) for d in divs})
        where = "source = ? AND (house || ' ' || date) IN (%s)" % ",".join("?" for _ in days)
        params = [source] + [f"{h} {dt}" for h, dt in days]
        by_id = {d.id: d for d in divs}
        vote_rows = [
            (v.division_id, by_id[v.division_id].jurisdiction, by_id[v.division_id].house,
             by_id[v.division_id].date, source, v.person_name, person_key(v.person_name),
             v.person_raw, v.person_id, v.vote, v.party)
            for v in votes if div_source.get(v.division_id) == source
        ]
        div_rows = [
            (d.id, d.jurisdiction, d.house, d.date, d.number, d.name, d.question, d.bill_ref,
             d.ayes_count, d.noes_count, d.result, d.source, d.source_url,
             json.dumps(d.extra, ensure_ascii=False, default=str), now)
            for d in divs
        ]
        results.append(writer.replace("ext_votes", EXT_DDL, VOTE_COLUMNS, vote_rows, source=source,
                                      delete_where=where, delete_params=params, notes=notes))
        results.append(writer.replace("ext_divisions", EXT_DDL, DIVISION_COLUMNS, div_rows, source=source,
                                      delete_where=where, delete_params=params, notes=notes))
    return results


def _long_date(iso: str) -> str:
    d = date.fromisoformat(iso[:10])
    return f"{d.day} {d.strftime('%B %Y')}"


def _join_names(names: list[str]) -> str:
    return ", ".join(names) if names else "none recorded"


def division_document(d: Division, votes: list[Vote]) -> dict:
    """The KB resource a division becomes (kind=division). Third-person prose --
    the speaker-filter provenance-turn invariant in MIGRATION-ARAG.md is about
    first-person Hansard and does not apply. Every voter is a collaborator so
    the existing speaker filter finds a member's votes beside their speeches.
    Nothing here pushes; see docs/VOTES.md GATE 3."""
    ayes = [v.person_name or v.person_raw for v in votes if v.vote == "aye" and (v.person_name or v.person_raw)]
    noes = [v.person_name or v.person_raw for v in votes if v.vote == "no" and (v.person_name or v.person_raw)]
    paired = [v.person_name or v.person_raw for v in votes if v.vote == "paired" and (v.person_name or v.person_raw)]
    house = HOUSE_NAMES.get(d.house, d.house)
    when = _long_date(d.date)
    subject = (d.name or d.bill_ref or "").strip()
    divided_on = (d.extra.get("divided_on") or "").strip()
    if not subject or re.match(r"^(Assembly|Council) divided on ", subject):
        # VIC prints only "Council divided on amendment" when no heading names a bill
        what = divided_on or "a question"
        article = "an" if what[:1].lower() in "aeiou" else "a"
        lead = f"On {when} the {house} divided on {article} {what}."
    elif subject.startswith("That "):
        lead = f"On {when} the {house} divided on the question: {subject.rstrip('.')}."
    else:
        lead = f"On {when} the {house} divided on {subject.rstrip('.')}."
    parts = [lead]
    question = (d.question or "").strip()
    question = re.sub(r"^[A-Z][\w'’. -]{2,40}? I move:\s*", "", question)  # TVFY summaries open with the mover
    if len(question) > 600:
        question = question[:600].rsplit(" ", 1)[0].rstrip(" ,;:") + " …"
    if question and question.rstrip(".") != subject.rstrip(".") and not subject.startswith("That "):
        parts.append(f"Question: {question.rstrip('.')}.")
    parts.append(f"Ayes {d.ayes_count if d.ayes_count is not None else len(ayes)}: {_join_names(ayes)}.")
    parts.append(f"Noes {d.noes_count if d.noes_count is not None else len(noes)}: {_join_names(noes)}.")
    if paired:
        parts.append(f"Paired (recorded, not counted): {_join_names(paired)}.")
    if d.result:
        margin = ""
        if d.ayes_count is not None and d.noes_count is not None:
            margin = f" ({d.ayes_count}–{d.noes_count})"
        parts.append(f"The question was resolved in the {d.result}{margin}.")
    if d.bill_ref and d.bill_ref != subject:
        parts.append(f"Bill: {d.bill_ref}.")
    reb = d.extra.get("rebellions")
    if reb:
        parts.append(f"{reb} member{'s' if reb != 1 else ''} crossed the floor.")
    decade = f"{d.date[:3]}0s"
    collaborators = sorted({n for n in ayes + noes + paired})
    return {
        "slug": f"division-{d.id}",
        "title": f"{house} division, {when}: {subject}"[:200],
        "text": " ".join(parts),
        "origin": {"source_id": d.source, "url": d.source_url, "created": d.date,
                   "collaborators": collaborators},
        "labels": {"kind": ["division"], "source": [d.source], "state": [d.jurisdiction],
                   "chamber": [d.house], "decade": [decade],
                   **({"result": [d.result]} if d.result else {})},
        "extra": {"division_id": d.id, "ayes_count": d.ayes_count, "noes_count": d.noes_count,
                  "result": d.result, "bill_ref": d.bill_ref, "ayes": ayes, "noes": noes, "paired": paired,
                  **{k: v for k, v in d.extra.items() if k in ("tvfy_division_id", "topic_uid", "viewer_url",
                                                                  "rebellions", "possible_turnout", "status",
                                                                  "uncorrected", "party_groups")}},
    }


def _read_unified(paths: list[str]) -> tuple[list[Division], list[Vote], dict]:
    """Read unified JSON files. Overlapping samples are common (two runs that
    both covered a chamber-day), so a division id seen again replaces the
    earlier copy -- the later file wins, together with its votes."""
    by_id: dict[str, Division] = {}
    votes_by_id: dict[str, list[Vote]] = {}
    meta: dict = {}
    for f in paths:
        doc = json.loads(Path(f).read_text())
        fresh: dict[str, list[Vote]] = {}
        for v in doc["votes"]:
            vote = Vote(**v)
            fresh.setdefault(vote.division_id, []).append(vote)
        for d in doc["divisions"]:
            div = Division(**d)
            by_id[div.id] = div
            votes_by_id[div.id] = fresh.get(div.id, [])
        meta[f] = {k: v for k, v in doc["meta"].items() if k not in ("generated", "schema")}
    divisions = list(by_id.values())
    votes = [v for d in divisions for v in votes_by_id[d.id]]
    return divisions, votes, meta


def run_load(args) -> None:
    from parli.ingest.ext_common import writer_from_args
    divisions, votes, meta = _read_unified(args.inputs)
    writer = writer_from_args(args)
    print(f"[load] {len(divisions)} divisions / {len(votes)} votes from {len(args.inputs)} file(s) -> {writer.describe()}",
          file=sys.stderr)
    for r in load_ext(divisions, votes, writer, notes=json.dumps(meta, default=str)[:2000]):
        print(json.dumps(r))


def run_render(args) -> None:
    divisions, votes, _ = _read_unified(args.inputs)
    by_div: dict[str, list[Vote]] = {}
    for v in votes:
        by_div.setdefault(v.division_id, []).append(v)
    picked = divisions
    if args.jurisdiction:
        picked = [d for d in picked if d.jurisdiction == args.jurisdiction]
    picked = picked[: args.limit]
    docs = [division_document(d, by_div.get(d.id, [])) for d in picked]
    sizes = [len(x["text"].encode("utf-8")) for x in docs]
    if args.json:
        print(json.dumps(docs, indent=1, ensure_ascii=False))
    else:
        for x in docs:
            print(f"--- {x['slug']}  [{len(x['text'].encode('utf-8'))} B, {len(x['origin']['collaborators'])} collaborators]")
            print(x["title"])
            print(x["text"])
            print("labels:", json.dumps(x["labels"], ensure_ascii=False))
            print()
    if sizes:
        print(f"[render] {len(docs)} documents, body bytes min/avg/max = {min(sizes)}/{sum(sizes)//len(sizes)}/{max(sizes)}",
              file=sys.stderr)


# ---------------------------------------------------------------------------
# Stats / output
# ---------------------------------------------------------------------------


def load_speakers() -> Optional[set[str]]:
    if SPEAKERS_JSON.exists():
        return {row[0] for row in json.loads(SPEAKERS_JSON.read_text())}
    return None


def compute_stats(divisions: list[Division], votes: list[Vote]) -> dict:
    speakers = load_speakers()
    out: dict = {}
    by_j: dict[str, list[Division]] = {}
    for d in divisions:
        by_j.setdefault(d.jurisdiction, []).append(d)
    for j, divs in by_j.items():
        ids = {d.id for d in divs}
        vs = [v for v in votes if v.division_id in ids]
        names = {v.person_name for v in vs if v.person_name}
        n_named = sum(1 for v in vs if v.person_name)
        mismatches = 0
        for d in divs:
            n_aye = sum(1 for v in vs if v.division_id == d.id and v.vote == "aye")
            n_no = sum(1 for v in vs if v.division_id == d.id and v.vote == "no")
            if (d.ayes_count is not None and n_aye and n_aye != d.ayes_count) or \
               (d.noes_count is not None and n_no and n_no != d.noes_count):
                mismatches += 1
        st = {
            "divisions": len(divs),
            "votes": len(vs),
            "paired": sum(1 for v in vs if v.vote == "paired"),
            "votes_with_name": n_named,
            "distinct_names": len(names),
            "with_question": sum(1 for d in divs if d.question),
            "with_bill_ref": sum(1 for d in divs if d.bill_ref),
            "count_mismatch_divisions": mismatches,
            "date_range": [min(d.date for d in divs), max(d.date for d in divs)],
        }
        if speakers is not None:
            hit = {n for n in names if n in speakers}
            st["names_in_corpus_speakers"] = len(hit)
            st["names_in_corpus_speakers_pct"] = round(100 * len(hit) / len(names), 1) if names else None
            st["names_not_in_corpus_sample"] = sorted(names - hit)[:12]
            speaker_keys = {person_key(s) for s in speakers}
            relaxed = {n for n in names if person_key(n) in speaker_keys}
            st["names_in_corpus_relaxed_key"] = len(relaxed)
            st["names_in_corpus_relaxed_key_pct"] = round(100 * len(relaxed) / len(names), 1) if names else None
        out[j] = st
    out["_speakers_json"] = str(SPEAKERS_JSON) if speakers is not None else None
    return out


def write_out(path: str, divisions: list[Division], votes: list[Vote], meta: dict) -> None:
    stats = compute_stats(divisions, votes)
    doc = {
        "meta": {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "schema": "opax-votes-v0", **meta},
        "stats": stats,
        "divisions": [asdict(d) for d in divisions],
        "votes": [asdict(v) for v in votes],
    }
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(doc, indent=1, ensure_ascii=False))
    print(json.dumps(stats, indent=1, ensure_ascii=False))
    print(f"wrote {p} ({len(divisions)} divisions, {len(votes)} votes)")


def run_merge(args) -> None:
    divisions, votes, sources = _read_unified(args.inputs)
    write_out(args.out, divisions, votes, {"merged_from": args.inputs, "sources": sources})


def _add_writer_args(p) -> None:
    # Mirrors ext_common.add_writer_args without importing it: the fetch path
    # must stay stdlib-only for the system python3 on `desktop`.
    p.add_argument("--db", default=None, help="write to this local SQLite file instead of the remote parli.db")
    p.add_argument("--host", default="desktop", help="ssh host holding parli.db (default: %(default)s)")
    p.add_argument("--remote-db", default="/home/jake/.cache/autoresearch/parli.db", help="parli.db path on --host")
    p.add_argument("--dry-run", action="store_true", help="fetch and parse but write nothing")


def _add_load_args(p) -> None:
    p.add_argument("--load", action="store_true", help="after writing --out, load into ext_divisions / ext_votes")
    _add_writer_args(p)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("nsw")
    p.add_argument("--year", type=int, default=date.today().year)
    p.add_argument("--days", type=int, default=2, help="latest N chamber-days to parse")
    p.add_argument("--house", choices=["la", "lc", "both"], default="both")
    p.add_argument("--no-fragments", action="store_true", help="skip motion text / name tables")
    p.add_argument("--no-map", action="store_true", help="don't refresh the id->name map from all TOCs")
    p.add_argument("--out", required=True)
    _add_load_args(p)

    p = sub.add_parser("vic")
    p.add_argument("--days", type=int, default=2)
    p.add_argument("--house", choices=["la", "lc", "both"], default="both")
    p.add_argument("--out", required=True)
    _add_load_args(p)

    p = sub.add_parser("qld")
    p.add_argument("--pdf", help="local Record of Proceedings PDF (e.g. the qld_parliament cache)")
    p.add_argument("--pdf-url", help="source URL to record when --pdf is a local file")
    p.add_argument("--date", help="sitting date YYYY-MM-DD (downloads when --pdf absent)")
    p.add_argument("--out", required=True)
    _add_load_args(p)

    p = sub.add_parser("federal")
    p.add_argument("--db", default="~/.cache/autoresearch/parli.db", help="parli.db to READ divisions/votes from")
    p.add_argument("--since", default="2025-01-01")
    p.add_argument("--days", type=int, default=6, help="newest N chamber-days (whole days, never partial)")
    p.add_argument("--out", required=True)
    p.add_argument("--load", action="store_true", help="after writing --out, load into ext_divisions / ext_votes in the same DB")
    p.add_argument("--dry-run", action="store_true")

    p = sub.add_parser("merge")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--out", required=True)

    p = sub.add_parser("load", help="load unified JSON file(s) into ext_divisions / ext_votes")
    p.add_argument("inputs", nargs="+")
    _add_writer_args(p)

    p = sub.add_parser("render", help="print the KB documents divisions would become; pushes nothing")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--jurisdiction")
    p.add_argument("--json", action="store_true")

    args = ap.parse_args()
    if args.cmd == "merge":
        run_merge(args)
        return
    if args.cmd == "load":
        run_load(args)
        return
    if args.cmd == "render":
        run_render(args)
        return
    if args.cmd == "qld" and not (args.pdf or args.date):
        ap.error("qld needs --pdf or --date")
    runner = {"nsw": run_nsw, "vic": run_vic, "qld": run_qld, "federal": run_federal}[args.cmd]
    divisions, votes, meta = runner(args)
    write_out(args.out, divisions, votes, {"jurisdiction": args.cmd, **meta})
    if getattr(args, "load", False):
        from parli.ingest.ext_common import ExtWriter, writer_from_args
        if args.cmd == "federal":
            # federal reads parli.db directly, so it is on the box: write to the same file
            writer = ExtWriter(db_path=args.db, dry_run=args.dry_run)
        else:
            writer = writer_from_args(args)
        print(f"[load] -> {writer.describe()}", file=sys.stderr)
        for r in load_ext(divisions, votes, writer, notes=json.dumps(meta, default=str)[:2000]):
            print(json.dumps(r))


if __name__ == "__main__":
    main()
