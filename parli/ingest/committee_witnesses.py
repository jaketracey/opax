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
             - a "Senator X" row linked to a member gets the member's full name
               as `speaker_name_clean`;
             - a row with any other honorific (Mr, Ms, Dr, Prof, a rank) is a
               witness: matched against the hearing's attendance list by
               surname (honorific breaks ties), it gets the full name, position
               and organisation; matched or not, its `person_id` is cleared,
               because a witness is never a member of parliament;
             - `speaker_type` is set on every row (member | witness | chair |
               unknown).
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
    (r"Dr", "dr"), (r"Professor", "prof"), (r"Prof\.?", "prof"),
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


def hearing_fragments(session, base: str) -> list[str]:
    """Every fragment id the hearing's table of contents links to, in order."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / (base.replace("/", "-") + "-0000.html")
    if path.exists() and path.stat().st_size > 5000:
        page = path.read_text(encoding="utf-8", errors="replace")
    else:
        time.sleep(DELAY)
        r = session.get(toc_url(base), timeout=60)
        if r.status_code != 200:
            return []
        page = r.text
        path.write_text(page, encoding="utf-8")
    ids = sorted({m.group(1) for m in FRAG_LINK_RE.finditer(page)} - {"0000"})
    return ids


def fetch_page(session, base: str, frag: str) -> str | None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / (base.replace("/", "-") + f"-{frag}.html")
    if path.exists() and path.stat().st_size > 5000:
        return path.read_text(encoding="utf-8", errors="replace")
    time.sleep(DELAY)
    r = session.get(fragment_url(base, frag), timeout=60)
    if r.status_code != 200:
        return None
    path.write_text(r.text, encoding="utf-8")
    return r.text


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
    bases = [r[0] for r in db.execute(
        "SELECT DISTINCT substr(hearing_id, 1, length(hearing_id) - 5) FROM speeches "
        "WHERE source LIKE 'committee%' AND hearing_id IS NOT NULL ORDER BY 1")]
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
            if not page or "In Attendance" not in page and "In attendance" not in page:
                continue
            found = parse_attendance(page)
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
    cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    for col in ("speaker_type", "witness_position", "witness_organisation"):
        if col not in cols:
            db.execute(f"ALTER TABLE speeches ADD COLUMN {col} TEXT")
    db.commit()


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


def cmd_resolve(db_path: str, dry_run: bool) -> None:
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
    cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    extra = ", speaker_type, witness_position, witness_organisation" if "speaker_type" in cols else ""
    rows = db.execute(
        f"SELECT speech_id, hearing_id, speaker_name, speaker_name_clean, person_id, witness_name{extra} "
        "FROM speeches WHERE source LIKE 'committee%'").fetchall()
    log(f"{len(rows):,} committee rows; attendance for {len(roster)} hearings; {len(members):,} members")

    stats = Counter()
    unmatched = Counter()
    updates = []     # (speaker_name_clean, person_id, witness_name, witness_position, witness_organisation, speaker_type, speech_id)
    relinks = []
    stamp = now_iso()
    for r in rows:
        name = (r["speaker_name"] or "").strip()
        base = (r["hearing_id"] or "").rsplit("/", 1)[0]
        old_clean = r["speaker_name_clean"]
        old_pid = r["person_id"]
        cur_type = r["speaker_type"] if "speaker_type" in r.keys() else None
        new = {"clean": old_clean, "pid": old_pid, "wname": r["witness_name"], "pos": None, "org": None, "type": None}
        if not name or name in ("&#10;", "M", "Lt", "Adm.", "Lt Gen.") or name.upper() == "UNKNOWN":
            new["type"] = "unknown"
            stats["unknown"] += 1
        elif CHAIR_RE.match(name) or name.upper() in ("CHAIR", "ACTING CHAIR", "DEPUTY CHAIR", "THE PRESIDENT"):
            new["type"] = "chair"
            stats["chair"] += 1
        elif SENATOR_RE.match(name):
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
                   (new["pos"] and new["pos"] != (r["witness_position"] if "witness_position" in r.keys() else None)) or
                   new["wname"] != r["witness_name"])
        if changed:
            updates.append((new["clean"], new["pid"], new["wname"], new["pos"], new["org"], new["type"], r["speech_id"]))
            if new["clean"] != old_clean or new["pid"] != old_pid:
                relinks.append((r["speech_id"], old_pid, old_clean, new["clean"], new["type"],
                                new["wname"] if new["type"] == "witness" else None,
                                "witness" if new["type"] == "witness" else "member_full_name", stamp))
    stats["rows_changed"] = len(updates)
    stats["rows_relinked"] = len(relinks)
    log("  " + ", ".join(f"{k}={v:,}" for k, v in sorted(stats.items())))
    log("  most frequent unmatched witnesses: " + "; ".join(f"{n} ({c})" for n, c in unmatched.most_common(15)))
    if dry_run:
        return
    cur = db.cursor()
    cur.execute("BEGIN")
    for i in range(0, len(updates), 5000):
        cur.executemany(
            "UPDATE speeches SET speaker_name_clean = ?, person_id = ?, witness_name = ?, witness_position = ?, "
            "witness_organisation = ?, speaker_type = ? WHERE speech_id = ?", updates[i:i + 5000])
    cur.executemany(
        "INSERT OR REPLACE INTO ext_committee_relinks VALUES (?,?,?,?,?,?,?,?)", relinks)
    cur.executemany(
        "INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?, ?, 'pending', ?) "
        "ON CONFLICT(slug) DO UPDATE SET status = 'pending', reason = excluded.reason, queued_at = excluded.queued_at",
        [(f"speech-{u[6]}", u[5], stamp) for u in updates])
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("speeches", SOURCE, len(updates), 0, stamp, ", ".join(f"{k}={v}" for k, v in sorted(stats.items()))))
    cur.execute("COMMIT")
    q = db.execute("SELECT COUNT(*) FROM ext_kb_patch_queue WHERE status = 'pending'").fetchone()[0]
    log(f"  updated {len(updates):,} rows; {q:,} slugs queued for the knowledge box")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("phase", choices=["fetch", "resolve"])
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--refetch", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.phase == "fetch":
        cmd_fetch(args.db, args.refetch, args.limit)
    else:
        cmd_resolve(args.db, args.dry_run)


if __name__ == "__main__":
    main()
