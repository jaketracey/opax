"""
parli.ingest.committee_witnesses -- who the committee witnesses are.

A Senate estimates transcript names a witness the way the Hansard reporter
does at the microphone: "Ms Lopez", "Mr Betts", "Rear Adm. Sonter". The
committee ingest (parli.ingest.committee_hearings) kept that string, the
speaker linker then matched some of those surnames to members of parliament
("Ms Hall" -> Jill Hall, "Mr Cook" -> Trish Cook: departmental officials filed
under MPs), and the portal dressed the rest as parliamentarians. Senators in
the same transcripts were cut down to a surname ("Senator HENDERSON" ->
"Henderson"), a second person beside "Sarah Henderson".

Every transcript opens with an **In Attendance** block that names everyone
properly: the minister representing, then each department and agency with its
officials, "Ms Margaret Lopez, Acting First Assistant Secretary". This module

  fetch    pulls fragment 0001 of every hearing in `speeches` from ParlInfo
           (cached under ~/.cache/autoresearch/committee_attendance/), parses
           the attendance block and writes `ext_committee_attendance`:
           one row per listed person with honorific, name, surname,
           post-nominals, position, organisation and group heading, and
           whether they are a minister or an official.
  resolve  walks every committee speech and
             - rows the committee ingest wrote with its own speaker_type (parli.ingest.committee_hearings, hearings with
               a row in ext_committee_hearings at parser_version >= 2) are TRUSTED: the type comes from the transcript's
               markup, not from an honorific. A `member` row is linked to a person by the Parliamentary Handbook id in
               its label (ext_handbook_people, parli.ingest.handbook) and never by a surname; a `witness` row is
               matched against the hearing's witness list (or In Attendance block) by surname, honorific breaking ties;
               a `chair` row stays a chair. This is what makes House and Joint hearings safe, where MPs are also printed
               as "Mr KENNEDY" and a surname alone cannot tell an MP from a witness.
             - older rows (the estimates ingest before 2026-09-29) keep the honorific rule:
               a "Senator X" row linked to a member gets the member's full name as `speaker_name_clean`;
               a row with any other honorific (Mr, Ms, Dr, Prof, a rank) is a
               witness: matched against the hearing's attendance list by
               surname (honorific breaks ties), it gets the full name, position
               and organisation; matched or not, its `person_id` is cleared,
               because a witness is never a member of parliament;
             - `speaker_type` is set on every row (member | witness | chair | unknown).
           The changed rows go to `ext_kb_patch_queue`, which
           scripts/arag_patch_speakers.py drains against the knowledge box.

Run on the box that holds parli.db (stdlib + requests):

    PYTHONPATH=. python3 -m parli.ingest.committee_witnesses fetch --db ~/.cache/autoresearch/parli.db
    PYTHONPATH=. python3 -m parli.ingest.committee_witnesses resolve --db ~/.cache/autoresearch/parli.db
    PYTHONPATH=. python3 -m parli.ingest.committee_witnesses resolve --db ... --dry-run   # counts only

Licence: ParlInfo transcripts are Commonwealth of Australia, published under
the Parliament's copyright terms as the existing committee ingest relies on.
"""

from __future__ import annotations

import argparse
import html as htmlmod
import os
import re
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.committee_store import COMMITTEE_SOURCES_SQL, read_cached_page, write_cached_page

PARLINFO_BASE = "https://parlinfo.aph.gov.au"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
CACHE_DIR = Path(os.environ.get("OPAX_ATTENDANCE_CACHE", "~/.cache/autoresearch/committee_attendance")).expanduser()
DELAY = 1.0
SOURCE = "committee_attendance"

TAG_RE = re.compile(r"<[^>]+>")
PARA_RE = re.compile(r'<p class="HPS-Normal"([^>]*)>(.*?)</p>', re.S)
SPEAKER_SPAN_RE = re.compile(r'class="HPS-(?:OfficeCommittee|MemberContinuation|MemberInterjecting|MemberWitness|WitnessName|MemberQuestion)"')

# Honorifics as the attendance list writes them (long forms) and as the
# transcript abbreviates them at the microphone (short forms). One class per
# family so "Mr" and "Ms" break a surname tie but "Rear Adm." and "Rear
# Admiral" are the same person.
HONORIFICS = [
    # (regex, class)
    (r"Senator the Hon\.?", "senator"), (r"Senator", "senator"),
    (r"The Hon\.?", "hon"), (r"Hon\.?", "hon"),
    (r"Mr", "mr"), (r"Mrs", "mrs"), (r"Ms", "ms"), (r"Miss", "miss"), (r"Mx", "mx"),
    (r"Dr", "dr"), (r"(?:Associate|Adjunct|Emeritus|Distinguished|Clinical|Honorary) Professor", "prof"),
    (r"(?:Associate|Adjunct|Emeritus|Distinguished|Clinical) Prof\.?", "prof"), (r"Professor", "prof"), (r"Prof\.?", "prof"),
    (r"Aunty", "elder"), (r"Uncle", "elder"), (r"Judge", "judge"), (r"Justice", "judge"), (r"Pastor", "rev"),
    (r"Air Chief Marshal", "rank"), (r"Air Vice-?Marshal", "rank"), (r"Air Marshal", "rank"), (r"Air Commodore", "rank"),
    (r"Air Cdre\.?", "rank"), (r"AVM", "rank"),
    (r"Vice Admiral", "rank"), (r"Vice Adm\.?", "rank"), (r"Rear Admiral", "rank"), (r"Rear Adm\.?", "rank"),
    (r"Admiral", "rank"), (r"Adm\.?", "rank"), (r"Commodore", "rank"), (r"Cdre\.?", "rank"), (r"Captain", "rank"), (r"Capt\.?", "rank"),
    (r"Commander", "rank"), (r"Cmdr\.?", "rank"),
    (r"Lieutenant General", "rank"), (r"Lt Gen\.?", "rank"), (r"Major General", "rank"), (r"Major Gen\.?", "rank"), (r"Maj Gen\.?", "rank"),
    (r"Brigadier", "rank"), (r"Brig\.?", "rank"), (r"Lieutenant Colonel", "rank"), (r"Lt Col\.?", "rank"), (r"Colonel", "rank"), (r"Col\.?", "rank"),
    (r"General", "rank"), (r"Gen\.?", "rank"), (r"Major", "rank"), (r"Lieutenant", "rank"), (r"Lt\.?", "rank"),
    (r"Group Captain", "rank"), (r"Wing Commander", "rank"), (r"Squadron Leader", "rank"), (r"Warrant Officer", "rank"),
    (r"Chief Petty Officer", "rank"), (r"Commissioner", "commissioner"), (r"Deputy Commissioner", "commissioner"),
    (r"Assistant Commissioner", "commissioner"), (r"Superintendent", "rank"), (r"Inspector", "rank"),
    (r"Cr", "cr"), (r"Sir", "sir"), (r"Dame", "dame"), (r"Rev\.?", "rev"), (r"Fr", "rev"), (r"Sr", "sr"), (r"Bishop", "rev"),
]
HON_RE = re.compile(r"^(?:" + "|".join(p for p, _ in HONORIFICS) + r")(?=\s)", re.I)
HON_CLASS = [(re.compile(r"^(?:" + p + r")(?=\s)", re.I), c) for p, c in HONORIFICS]

POSTNOMINALS = {
    "AC", "AO", "AM", "OAM", "PSM", "APM", "CSC", "CSM", "SC", "KC", "QC", "RAN", "RANR", "DSC", "DSM", "AFC", "MBE",
    "OBE", "CBE", "KBE", "CVO", "MVO", "FAICD", "GAICD", "MAICD", "FCPA", "CPA", "FCA", "CA", "PHD", "MP", "MLA", "MLC",
    "CSC", "OAM", "ASM", "ESM", "AFSM", "NSC", "GC", "VC", "MG", "MC", "DFC", "AVM", "ADC", "RFD", "BM", "OMI", "RN",
}
# A heading is an organisation (a department, agency, company or statutory
# body) rather than a group inside one ("Executive", "Enabling Services",
# "Enterprise Resource Planning Program", "Outcome 5") when it carries one of
# these. Weak words that group headings also use (program, group, services,
# branch, division) are deliberately absent.
ORG_HINT_RE = re.compile(
    r"\b(department|authority|agency|commission|commissioner|corporation|office of|council|board|bureau|"
    r"limited|ltd|pty|co limited|institute|museum|gallery|library|archives?|tribunal|ombudsman|regulator|"
    r"company|university|court|police|directorate|administration|memorial|inspector-general|"
    r"australia post|nbn co|csiro|abc\b|sbs\b|reserve bank|treasury|defence force|navy|army|air force|"
    r"border force|national parks|food standards|special broadcasting service|australian broadcasting|"
    r"organisation|organization|foundation|trust\b|fund\b|secretariat|registry|australia$)\b", re.I)
CHAIR_RE = re.compile(r"^(?:the\s+)?(?:acting\s+|deputy\s+)?(?:chair|president)\b", re.I)
SENATOR_RE = re.compile(r"^senator\b", re.I)
STOP_RE = re.compile(r"^(committee met|proceedings suspended|\[?\d{1,2}[:.]\d{2})", re.I)


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── honorific / name helpers ─────────────────────────────────────────────────

def split_honorific(text: str) -> tuple[str | None, str | None, str]:
    """('Ms', 'ms', 'Margaret Lopez, Acting First ...') or (None, None, text)."""
    t = text.strip()
    for rx, cls in HON_CLASS:
        m = rx.match(t)
        if m:
            return t[: m.end()].rstrip("."), cls, t[m.end():].strip()
    return None, None, t


def strip_postnominals(name: str) -> tuple[str, str]:
    toks = name.replace(",", " ").split()
    post = []
    while len(toks) > 1 and re.sub(r"[^A-Za-z]", "", toks[-1]).upper() in POSTNOMINALS and toks[-1].isupper():
        post.insert(0, toks.pop())
    return " ".join(toks), " ".join(post)


def surname_of(name: str) -> str:
    toks = name.split()
    if not toks:
        return ""
    # "La Rance", "De Silva", "Van Stralen", "St John": the particle belongs to the surname
    if len(toks) >= 3 and toks[-2].lower() in {"la", "le", "de", "da", "di", "du", "van", "von", "del", "della", "st", "mac", "mc", "o", "ten", "ter", "der"}:
        return " ".join(toks[-2:])
    return toks[-1]


def name_key(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", s.lower().replace("’", "'").replace("'", "")).strip()


# ── attendance parsing ───────────────────────────────────────────────────────

def clean_text(inner: str) -> str:
    t = htmlmod.unescape(TAG_RE.sub(" ", inner))
    return re.sub(r"\s+", " ", t).strip()


def parse_attendance(page: str) -> list[dict]:
    """The people named in a transcript's In Attendance block, in order."""
    start = page.find('class="docDiv"')
    doc = page[start:] if start >= 0 else page
    paras = PARA_RE.findall(doc)
    rows: list[dict] = []
    seen_head = False
    organisation = None
    group = None
    seq = 0
    for attrs, inner in paras:
        text = clean_text(inner)
        if not seen_head:
            if re.fullmatch(r"in attendance:?", text, re.I):
                seen_head = True
            continue
        if not text:
            continue
        if SPEAKER_SPAN_RE.search(inner) or STOP_RE.match(text) or CHAIR_RE.match(text):
            break
        bold = "font-weight:bold" in inner
        hon, cls, rest = split_honorific(text)
        if hon and cls:
            name_part, _, position = rest.partition(",")
            name, post = strip_postnominals(name_part.strip())
            if not name:
                continue
            position = re.sub(r"\s+", " ", position).strip(" ,")
            kind = "minister" if cls in ("senator", "hon") or re.search(r"\bminister\b", position, re.I) else "official"
            seq += 1
            rows.append({
                "seq": seq, "honorific": hon, "honorific_class": cls, "name": name, "surname": surname_of(name),
                "postnominals": post or None, "position": position or None, "organisation": organisation,
                "group_heading": group, "kind": kind,
            })
            continue
        # A heading: an organisation, or a group inside the current one.
        if bold or ORG_HINT_RE.search(text) or text.isupper():
            if ORG_HINT_RE.search(text) or text.isupper() or organisation is None:
                organisation = text
                group = None
            else:
                group = text
        else:
            group = text
        if seq > 600:
            break
    return rows


# ── fetch ────────────────────────────────────────────────────────────────────

def fragment_url(base: str, frag: str) -> str:
    from urllib.parse import quote
    q = quote(base, safe="").replace("/", "%2F")
    return (f"{PARLINFO_BASE}/parlInfo/search/display/display.w3p;db=COMMITTEES;"
            f"id={q}%2F{frag};query=Id%3A%22{q}%2F0000%22")


FRAG_LINK_RE = re.compile(r"id=committees(?:%2F|/)[a-z]+(?:%2F|/)\d+(?:%2F|/)(\d{4})", re.I)


def toc_url(base: str) -> str:
    from urllib.parse import quote
    return f"{PARLINFO_BASE}/parlInfo/search/display/display.w3p;query=Id%3A%22{quote(base, safe='')}/0000%22"


def _body(resp) -> str:
    """The response as UTF-8 (ParlInfo sends no charset, so `resp.text` would be read as ISO-8859-1)."""
    return resp.content.decode("utf-8", errors="replace")


def hearing_fragments(session, base: str) -> list[str]:
    """Every fragment id the hearing's table of contents links to, in order."""
    page = read_cached_page(CACHE_DIR, base, "0000")
    if not page or len(page) < 5000:
        time.sleep(DELAY)
        r = session.get(toc_url(base), timeout=60)
        if r.status_code != 200:
            return []
        page = _body(r)
        write_cached_page(CACHE_DIR, base, "0000", page)
    ids = sorted({m.group(1) for m in FRAG_LINK_RE.finditer(page)} - {"0000"})
    return ids


def fetch_page(session, base: str, frag: str) -> str | None:
    page = read_cached_page(CACHE_DIR, base, frag)
    if page and len(page) > 5000:
        return page
    time.sleep(DELAY)
    r = session.get(fragment_url(base, frag), timeout=60)
    if r.status_code != 200:
        return None
    page = _body(r)
    write_cached_page(CACHE_DIR, base, frag, page)
    return page


def witness_rows(page: str) -> list[dict]:
    """The structured witness list a House / Joint / Senate committee fragment opens with, as attendance rows."""
    from parli.ingest.committee_transcript import parse_witness_list     # lazy: committee_transcript imports this module
    rows = []
    for n, w in enumerate(parse_witness_list(page), 1):
        rows.append({"seq": n, "honorific": w.honorific, "honorific_class": w.honorific_class, "name": w.name,
                     "surname": w.surname, "postnominals": w.postnominals, "position": w.position,
                     "organisation": w.organisation, "group_heading": None, "kind": "witness"})
    return rows


ATT_DDL = """
CREATE TABLE IF NOT EXISTS ext_committee_attendance (
    hearing_base TEXT NOT NULL,
    seq INTEGER NOT NULL,
    honorific TEXT,
    honorific_class TEXT,
    name TEXT NOT NULL,
    surname TEXT,
    postnominals TEXT,
    position TEXT,
    organisation TEXT,
    group_heading TEXT,
    kind TEXT,
    fragment TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (hearing_base, seq)
);
CREATE INDEX IF NOT EXISTS idx_ext_att_surname ON ext_committee_attendance(surname);
CREATE TABLE IF NOT EXISTS ext_ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, source TEXT NOT NULL,
    rows_loaded INTEGER, rows_deleted INTEGER, loaded_at TEXT NOT NULL, notes TEXT
);
"""


def cmd_fetch(db_path: str, refetch: bool, limit: int | None) -> None:
    import requests
    db = sqlite3.connect(db_path, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.executescript(ATT_DDL)
    # who the members are: refresh the Handbook people (id in a transcript's member link -> person_id) weekly
    from parli.ingest import handbook
    handbook.ensure_people(db, say=log)
    bases = [r[0] for r in db.execute(
        "SELECT DISTINCT substr(hearing_id, 1, length(hearing_id) - 5) FROM speeches "
        f"WHERE source IN ({COMMITTEE_SOURCES_SQL}) AND hearing_id IS NOT NULL ORDER BY 1")]
    if limit:
        bases = bases[:limit]
    have = {r[0] for r in db.execute("SELECT DISTINCT hearing_base FROM ext_committee_attendance")}
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    log(f"{len(bases)} hearings; {len(have)} already parsed")
    stamp = now_iso()
    loaded = 0
    empty = []
    for i, base in enumerate(bases, 1):
        if base in have and not refetch:
            continue
        # A day's transcript opens each portfolio's session with its own In
        # Attendance block, so every fragment is read; the first one carries the
        # bulk, later ones the agencies that arrived after lunch.
        frags = hearing_fragments(session, base) or ["0001", "0002", "0003"]
        rows = []
        blocks = 0
        for frag in frags:
            page = fetch_page(session, base, frag)
            if not page:
                continue
            # Senate estimates open a portfolio's session with an In Attendance block; the other committees print a
            # structured witness list at the top of each fragment (normally written by the ingest already).
            found = parse_attendance(page) if ("In Attendance" in page or "In attendance" in page) else []
            if not found:
                found = witness_rows(page)
            if not found:
                continue
            blocks += 1
            for r in found:
                r["fragment"] = frag
                rows.append(r)
        if not rows:
            empty.append(base)
            log(f"  [{i}/{len(bases)}] {base}: no attendance block in {len(frags)} fragments")
            continue
        db.execute("DELETE FROM ext_committee_attendance WHERE hearing_base = ?", (base,))
        db.executemany(
            "INSERT INTO ext_committee_attendance VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(base, n + 1, r["honorific"], r["honorific_class"], r["name"], r["surname"], r["postnominals"],
              r["position"], r["organisation"], r["group_heading"], r["kind"], r["fragment"], stamp)
             for n, r in enumerate(rows)])
        db.commit()
        loaded += len(rows)
        log(f"  [{i}/{len(bases)}] {base}: {len(rows)} people from {blocks} attendance blocks in {len(frags)} fragments")
    db.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
               ("ext_committee_attendance", SOURCE, loaded, 0, stamp,
                f"hearings={len(bases)} no_block={len(empty)} {' '.join(empty[:20])}"))
    db.commit()
    total = db.execute("SELECT COUNT(*), COUNT(DISTINCT hearing_base) FROM ext_committee_attendance").fetchone()
    log(f"attendance: {total[0]:,} people across {total[1]} hearings; {len(empty)} hearings without a block")


# ── resolve ──────────────────────────────────────────────────────────────────

QUEUE_DDL = """
CREATE TABLE IF NOT EXISTS ext_kb_patch_queue (
    slug TEXT PRIMARY KEY,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    queued_at TEXT NOT NULL,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS ext_committee_relinks (
    speech_id INTEGER PRIMARY KEY,
    old_person_id TEXT,
    old_speaker_name_clean TEXT,
    new_speaker_name_clean TEXT,
    speaker_type TEXT,
    matched_name TEXT,
    reason TEXT,
    changed_at TEXT NOT NULL
);
"""


def ensure_columns(db: sqlite3.Connection) -> None:
    from parli.ingest.committee_store import ensure_speech_columns
    ensure_speech_columns(db, say=lambda *_: None)


def match_roster(tail: str, hon_class: str | None, roster: list[dict]) -> dict | None:
    """The one attendance row a microphone name ('Lopez', 'L Wood', 'La Rance') points at."""
    key = name_key(tail)
    if not key:
        return None
    toks = key.split()
    cands = []
    for r in roster:
        if r["kind"] == "minister":
            continue
        nk = name_key(r["name"])
        sk = name_key(r["surname"] or "")
        if len(toks) >= 2 and len(toks[0]) == 1:          # 'L Wood': initial + surname
            if sk == " ".join(toks[1:]) and nk.startswith(toks[0]):
                cands.append(r)
        elif nk == key or nk.endswith(" " + key) or sk == key:
            cands.append(r)
    if len(cands) > 1 and hon_class:
        same = [c for c in cands if c["honorific_class"] == hon_class]
        if same:
            cands = same
    # the same person listed twice (two roles) is one person
    names = {name_key(c["name"]) for c in cands}
    if len(names) == 1:
        return cands[0]
    return None


def trusted_hearings(db: sqlite3.Connection) -> set[str]:
    """Hearings whose rows the committee ingest wrote with a speaker_type read from the transcript's markup."""
    try:
        return {r[0] for r in db.execute("SELECT hearing_base FROM ext_committee_hearings WHERE parser_version >= 2")}
    except sqlite3.OperationalError:
        return set()


def pushed_checkpoint() -> int | None:
    """The highest speech_id the knowledge-box push has reached (arag_sync_state.json), or None when there is no state.
    Rows above it are not in the box yet: the push will send them with their fields already resolved, so there is
    nothing to patch."""
    import json
    path = Path(os.environ.get("OPAX_ARAG_STATE", "~/.cache/autoresearch/arag_sync_state.json")).expanduser()
    try:
        return int(json.loads(path.read_text())["tables"]["speeches"]["after"])
    except (OSError, ValueError, KeyError, TypeError):
        return None


def cmd_resolve(db_path: str, dry_run: bool, pushed_upto: int | None | str = "auto") -> None:
    from parli.ingest import handbook
    db = sqlite3.connect(db_path, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.row_factory = sqlite3.Row
    db.executescript(QUEUE_DDL)
    if not dry_run:
        ensure_columns(db)
    roster: dict[str, list[dict]] = defaultdict(list)
    for r in db.execute("SELECT * FROM ext_committee_attendance ORDER BY hearing_base, seq"):
        roster[r["hearing_base"]].append(dict(r))
    members = {r["person_id"]: r["full_name"] for r in db.execute(
        "SELECT person_id, full_name FROM members WHERE full_name IS NOT NULL AND full_name != ''")}
    mcols = {r[1] for r in db.execute("PRAGMA table_info(members)")}
    party_col = "COALESCE(party_canonical, party)" if "party_canonical" in mcols else "party"
    party_of = {r["person_id"]: (r["p"] or None) for r in db.execute(f"SELECT person_id, {party_col} AS p FROM members")}
    people = handbook.load_people(db)
    trusted = trusted_hearings(db)
    cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    extra = ", speaker_type, witness_position, witness_organisation" if "speaker_type" in cols else ""
    extra += ", handbook_id" if "handbook_id" in cols else ""
    extra += ", party_canonical" if "party_canonical" in cols else ""
    rows = db.execute(
        f"SELECT speech_id, hearing_id, speaker_name, speaker_name_clean, person_id, witness_name{extra} "
        f"FROM speeches WHERE source IN ({COMMITTEE_SOURCES_SQL})").fetchall()
    log(f"{len(rows):,} committee rows; attendance for {len(roster)} hearings; {len(members):,} members; "
        f"{len(people)} Handbook people ({sum(1 for p in people.values() if p['person_id'])} matched); "
        f"{len(trusted)} hearings with transcript-typed rows")
    if trusted and not people:
        log("  WARNING: no Handbook people loaded (run `committee_witnesses fetch`): members in House / Joint hearings stay unlinked")

    stats = Counter()
    unmatched = Counter()
    unmapped_phids = Counter()
    updates = []     # (speaker_name_clean, person_id, witness_name, witness_position, witness_organisation, speaker_type, speech_id)
    relinks = []
    party_updates = []   # (party_canonical, speech_id): the committee source records no party, the member's row does
    stamp = now_iso()
    keys = None
    for r in rows:
        if keys is None:
            keys = set(r.keys())
        name = (r["speaker_name"] or "").strip()
        base = (r["hearing_id"] or "").rsplit("/", 1)[0]
        old_clean = r["speaker_name_clean"]
        old_pid = r["person_id"]
        cur_type = r["speaker_type"] if "speaker_type" in keys else None
        phid = r["handbook_id"] if "handbook_id" in keys else None
        new = {"clean": old_clean, "pid": old_pid, "wname": r["witness_name"], "pos": None, "org": None, "type": None}
        typed = cur_type if (base in trusted and cur_type in ("chair", "member", "witness", "unknown")) else None
        if typed == "unknown" or (typed is None and (not name or name in ("&#10;", "M", "Lt", "Adm.", "Lt Gen.") or name.upper() == "UNKNOWN")):
            new["type"] = "unknown"
            stats["unknown"] += 1
        elif typed == "chair" or (typed is None and (CHAIR_RE.match(name) or name.upper() in ("CHAIR", "ACTING CHAIR", "DEPUTY CHAIR", "THE PRESIDENT"))):
            # A chair row stays unlinked, as the presiding-officer rows of every other source do: only the first turn of
            # a fragment names the chair ("CHAIR (Mr Husic):"), so linking would credit a person with a handful of
            # chair turns and not the rest. The id the transcript gave stays in speeches.handbook_id.
            new["type"] = "chair"
            stats["chair"] += 1
        elif typed == "member":
            new["type"] = "member"
            stats["member_rows"] += 1
            mapped = (people.get(str(phid)) or {}).get("person_id") if phid else None
            if mapped:
                new["pid"] = mapped
                stats["member_linked_by_handbook"] += 1
            elif phid:
                unmapped_phids[phid] += 1
                stats["member_phid_unmapped"] += 1
            else:
                stats["member_without_handbook_id"] += 1
            if new["pid"] and str(new["pid"]).isdigit() and members.get(new["pid"]):
                new["clean"] = members[new["pid"]]
                party = party_of.get(new["pid"])
                if party and "party_canonical" in keys and not r["party_canonical"]:
                    party_updates.append((party, r["speech_id"]))
        elif typed is None and SENATOR_RE.match(name):
            new["type"] = "member"
            stats["senator_rows"] += 1
            if old_pid and str(old_pid).isdigit() and members.get(old_pid):
                if old_clean != members[old_pid]:
                    new["clean"] = members[old_pid]
                    stats["senator_renamed"] += 1
        else:
            hon, cls, tail = split_honorific(name)
            new["type"] = "witness"
            stats["witness_rows"] += 1
            hit = match_roster(tail if hon else name, cls, roster.get(base, []))
            if hit:
                new["clean"] = hit["name"]
                new["wname"] = hit["name"]
                new["pos"] = hit["position"]
                new["org"] = hit["organisation"]
                stats["witness_matched"] += 1
            else:
                unmatched[name] += 1
                stats["witness_unmatched"] += 1
                if not new["clean"]:
                    new["clean"] = tail or name
            if old_pid is not None:
                stats["witness_unlinked_from_" + ("member" if str(old_pid).isdigit() else "stub")] += 1
                new["pid"] = None
        changed = (new["clean"] != old_clean or new["pid"] != old_pid or new["type"] != cur_type or
                   (new["pos"] and new["pos"] != (r["witness_position"] if "witness_position" in keys else None)) or
                   (new["org"] and new["org"] != (r["witness_organisation"] if "witness_organisation" in keys else None)) or
                   new["wname"] != r["witness_name"])
        if changed:
            updates.append((new["clean"], new["pid"], new["wname"], new["pos"], new["org"], new["type"], r["speech_id"]))
            if new["clean"] != old_clean or new["pid"] != old_pid:
                relinks.append((r["speech_id"], old_pid, old_clean, new["clean"], new["type"],
                                new["wname"] if new["type"] == "witness" else None,
                                "witness" if new["type"] == "witness" else "member_full_name", stamp))
    stats["rows_changed"] = len(updates)
    stats["rows_relinked"] = len(relinks)
    stats["party_filled"] = len(party_updates)
    log("  " + ", ".join(f"{k}={v:,}" for k, v in sorted(stats.items())))
    log("  most frequent unmatched witnesses: " + "; ".join(f"{n} ({c})" for n, c in unmatched.most_common(15)))
    if unmapped_phids:
        log("  Handbook ids with no members match: " + "; ".join(f"{p} ({c})" for p, c in unmapped_phids.most_common(15)))
    if dry_run:
        return
    if pushed_upto == "auto":
        pushed_upto = pushed_checkpoint()
    queued = [u for u in updates if pushed_upto is None or u[6] <= pushed_upto]
    cur = db.cursor()
    cur.execute("BEGIN")
    for i in range(0, len(updates), 5000):
        cur.executemany(
            "UPDATE speeches SET speaker_name_clean = ?, person_id = ?, witness_name = ?, witness_position = ?, "
            "witness_organisation = ?, speaker_type = ? WHERE speech_id = ?", updates[i:i + 5000])
    cur.executemany("UPDATE speeches SET party_canonical = ? WHERE speech_id = ? AND COALESCE(party_canonical, '') = ''",
                    party_updates)
    cur.executemany(
        "INSERT OR REPLACE INTO ext_committee_relinks VALUES (?,?,?,?,?,?,?,?)", relinks)
    # a queued text update (Proof -> Final) must survive: the speaker-field patch it would be replaced by never sends text
    cur.executemany(
        "INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?, ?, 'pending', ?) "
        "ON CONFLICT(slug) DO UPDATE SET status = 'pending', queued_at = excluded.queued_at, "
        "reason = CASE WHEN ext_kb_patch_queue.status = 'pending' AND ext_kb_patch_queue.reason LIKE 'text:%' "
        "THEN ext_kb_patch_queue.reason ELSE excluded.reason END",
        [(f"speech-{u[6]}", u[5], stamp) for u in queued])
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("speeches", SOURCE, len(updates), 0, stamp, ", ".join(f"{k}={v}" for k, v in sorted(stats.items()))))
    cur.execute("COMMIT")
    q = db.execute("SELECT COUNT(*) FROM ext_kb_patch_queue WHERE status = 'pending'").fetchone()[0]
    log(f"  updated {len(updates):,} rows; {len(queued):,} of them already in the knowledge box (speech_id <= "
        f"{pushed_upto}) queued for a patch; {q:,} slugs pending in all")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("phase", choices=["fetch", "resolve", "handbook"])
    ap.add_argument("--db", default=os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--refetch", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--pushed-upto", type=int, default=None,
                    help="Queue knowledge-box patches only for speech_id <= N (default: the push checkpoint in "
                         "arag_sync_state.json; every changed row when that file is absent).")
    args = ap.parse_args()
    if args.phase == "fetch":
        cmd_fetch(args.db, args.refetch, args.limit)
    elif args.phase == "handbook":
        from parli.ingest import handbook
        conn = sqlite3.connect(args.db, timeout=600)
        conn.execute("PRAGMA busy_timeout = 600000")
        handbook.ensure_people(conn, force=True, say=log)
    else:
        cmd_resolve(args.db, args.dry_run, args.pushed_upto if args.pushed_upto is not None else "auto")


if __name__ == "__main__":
    main()
