"""
parli.ingest.speaker_hygiene -- who a speech is attributed to, made honest.

Three loops over `speeches`, each idempotent, each logged to
`ext_committee_relinks` (the same audit table the committee resolver writes)
and queued for the knowledge box in `ext_kb_patch_queue`:

  jurisdiction  a speech may only link to a member of its own parliament.
                Surname matching had tied federal speeches to state stubs
                ("Mark Latham" the NSW MLC for 1998-2004 House speeches; Senator
                Shoebridge's 2025 speeches to his NSW stub) and state speeches
                to historical federal stubs ("Thomas" in the Victorian Assembly
                to `wragge_thomas`). Where a same-parliament member with the same
                full name exists the row is relinked to it; where a same-
                parliament member is the only holder of that surname it is
                relinked to that; otherwise the link is cleared. speaker_name_clean
                follows the member's full name.
  fullname      a row whose clean name is a bare surname but whose member has a
                full name gets the full name, so "Teague" and "Josh Teague" are
                one person on the site. A surname-only stub (`vic_thomas`) whose
                state has exactly one full-name member with that surname
                (`vic_maryanne_thomas`, Mary-Anne Thomas) is folded into it.
  junk          speaker strings that are not names: a bare honorific ("Mr",
                "Senator"), a timestamp (":42"), an HTML entity ("&#10;"), a role
                glued to a name ("The Deputy PRESIDENTMs Abigail Boyd", kept as
                the name), or a whole sentence captured as the speaker (cleared).
                An entity inside a real name is unescaped ("Joldi&#263;" ->
                "Joldić").

Run on the box that holds parli.db, after parli.ingest.committee_witnesses:

    PYTHONPATH=. python3 -m parli.ingest.speaker_hygiene --db ~/.cache/autoresearch/parli.db --dry-run
    PYTHONPATH=. python3 -m parli.ingest.speaker_hygiene --db ~/.cache/autoresearch/parli.db
    ... --loops jurisdiction,junk            # a subset
"""

from __future__ import annotations

import argparse
import html
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

SOURCE = "speaker_hygiene"
KB_SOURCES_EXCLUDED = ("wragge_xml",)   # never in the knowledge box; left alone

HONORIFIC_ONLY = {"mr", "ms", "mrs", "miss", "dr", "senator", "hon", "the hon", "prof", "professor", "madam", "sir"}
NOT_A_NAME = {"on", "er", "ch", "de", "):", "(", ")", "-", "—", "the", "a", "an", "of", "and", "in", "to"}
ROLE_GLUE_RE = re.compile(r"^(?:the\s+)?(?:deputy\s+|acting\s+|temporary\s+)?(?:president|speaker|chair(?:man)?)\s*(?=(?:the\s+hon\.?\s+|mr\s+|ms\s+|mrs\s+|dr\s+|senator\s+)?[A-Z])", re.I)
TIMESTAMP_RE = re.compile(r"^:?\d{1,2}(?::\d{2})?$")
ENTITY_RE = re.compile(r"&#\d+;|&#x[0-9a-f]+;|&[a-z]+;", re.I)


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def is_numeric_id(pid) -> bool:
    return pid is not None and str(pid).isdigit()


def state_of(row_state) -> str:
    return (row_state or "federal").lower()


# ── members ──────────────────────────────────────────────────────────────────

class Members:
    def __init__(self, db: sqlite3.Connection):
        self.by_id: dict[str, dict] = {}
        for r in db.execute("SELECT person_id, first_name, last_name, full_name, state, chamber FROM members"):
            self.by_id[r["person_id"]] = dict(r)
        self.by_state_fullname: dict[tuple, list] = defaultdict(list)
        self.by_state_surname: dict[tuple, list] = defaultdict(list)
        for m in self.by_id.values():
            st = state_of(m["state"])
            full = (m["full_name"] or "").strip()
            if " " in full:
                self.by_state_fullname[(st, full.lower())].append(m)
            sur = (m["last_name"] or full.split()[-1] if full else "").strip().lower()
            if sur:
                self.by_state_surname[(st, sur)].append(m)

    def full_named(self, st: str, full: str) -> dict | None:
        c = self.by_state_fullname.get((st, full.lower()), [])
        # prefer a real (numeric) id, then the one entry
        real = [m for m in c if is_numeric_id(m["person_id"])]
        pool = real or c
        return pool[0] if len(pool) == 1 or (len(pool) > 1 and real and len(real) == 1) else None

    def unique_surname(self, st: str, surname: str) -> dict | None:
        c = [m for m in self.by_state_surname.get((st, surname.lower()), []) if " " in (m["full_name"] or "")]
        names = {m["full_name"].lower() for m in c}
        if len(names) == 1:
            real = [m for m in c if is_numeric_id(m["person_id"])]
            return (real or c)[0]
        return None


# ── loops ────────────────────────────────────────────────────────────────────

def loop_jurisdiction(db, members: Members, stats: Counter):
    """-> [(speech_id, new_person_id, new_clean, reason, old_pid, old_clean)]"""
    out = []
    rows = db.execute(
        "SELECT s.speech_id, s.source, s.state, s.person_id, s.speaker_name, s.speaker_name_clean, "
        "m.full_name, m.state AS mstate FROM speeches s JOIN members m ON m.person_id = s.person_id "
        "WHERE COALESCE(s.state, 'federal') != COALESCE(m.state, 'federal') "
        "AND s.source NOT LIKE 'committee%' AND s.source NOT IN ('wragge_xml')").fetchall()
    for r in rows:
        st = state_of(r["state"])
        full = (r["full_name"] or "").strip()
        target = members.full_named(st, full) if " " in full else None
        if target is None:
            sur = full.split()[-1] if full else ""
            target = members.unique_surname(st, sur) if sur else None
        if target:
            new_pid = target["person_id"]
            new_clean = target["full_name"] if " " in (target["full_name"] or "") else r["speaker_name_clean"]
            stats["jurisdiction_relinked"] += 1
            reason = "jurisdiction_relink"
        else:
            new_pid = None
            new_clean = r["speaker_name_clean"]
            stats["jurisdiction_unlinked"] += 1
            reason = "jurisdiction_unlink"
        out.append((r["speech_id"], new_pid, new_clean, reason, r["person_id"], r["speaker_name_clean"]))
    return out


def not_witness(db, alias: str = "") -> str:
    """SQL clause excluding witnesses, or nothing before the resolver has added the column."""
    cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    return f"AND COALESCE({alias}speaker_type, '') != 'witness'" if "speaker_type" in cols else ""


def loop_fullname(db, members: Members, stats: Counter):
    out = []
    # 2a: bare surname, member has a full name
    rows = db.execute(
        "SELECT s.speech_id, s.person_id, s.speaker_name_clean, m.full_name FROM speeches s "
        "JOIN members m ON m.person_id = s.person_id "
        "WHERE s.speaker_name_clean IS NOT NULL AND s.speaker_name_clean NOT LIKE '% %' "
        "AND m.full_name LIKE '% %' AND s.source NOT IN ('wragge_xml') "
        + not_witness(db, "s.")).fetchall()
    for r in rows:
        full = r["full_name"].strip()
        if full.lower().split()[-1] != r["speaker_name_clean"].lower() and not full.lower().endswith(" " + r["speaker_name_clean"].lower()):
            stats["fullname_surname_disagrees"] += 1   # the link itself is doubtful; leave it
            continue
        out.append((r["speech_id"], r["person_id"], full, "member_full_name", r["person_id"], r["speaker_name_clean"]))
        stats["fullname_from_member"] += 1
    # 2b: surname-only stub folded into the state's one full-name holder
    stubs = db.execute(
        "SELECT person_id, full_name, state FROM members WHERE NOT (person_id GLOB '[0-9]*') "
        "AND full_name NOT LIKE '% %' AND full_name != ''").fetchall()
    fold = {}
    for m in stubs:
        st = state_of(m["state"])
        target = members.unique_surname(st, m["full_name"])
        if target and target["person_id"] != m["person_id"]:
            fold[m["person_id"]] = target
    if fold:
        ph = ",".join("?" for _ in fold)
        rows = db.execute(
            f"SELECT speech_id, person_id, speaker_name_clean FROM speeches WHERE person_id IN ({ph}) "
            "AND source NOT IN ('wragge_xml') " + not_witness(db), list(fold)).fetchall()
        for r in rows:
            t = fold[r["person_id"]]
            out.append((r["speech_id"], t["person_id"], t["full_name"], "stub_folded", r["person_id"], r["speaker_name_clean"]))
            stats["stub_folded_rows"] += 1
        stats["stub_folded_members"] = len(fold)
    return out


def junk_verdict(clean: str | None, raw: str | None) -> tuple[str, str | None] | None:
    """(action, new_clean) or None when the name is fine."""
    s = (clean or "").strip()
    if not s:
        return None
    if ENTITY_RE.search(s):
        fixed = html.unescape(s).strip()
        if fixed and fixed != s and not ENTITY_RE.search(fixed) and re.search(r"[A-Za-z]", fixed):
            return ("unescape", fixed)
        return ("clear", None)
    low = s.lower().rstrip(".")
    if low in HONORIFIC_ONLY or low in NOT_A_NAME or TIMESTAMP_RE.match(s):
        return ("clear", None)
    if len(s) > 60 or len(s.split()) > 6:
        return ("clear", None)
    m = ROLE_GLUE_RE.match(s)
    if m:
        rest = s[m.end():].strip()
        rest = re.sub(r"^(?:the\s+hon\.?\s+|mr\s+|ms\s+|mrs\s+|dr\s+|senator\s+)", "", rest, flags=re.I).strip()
        if rest and len(rest.split()) >= 2:
            return ("role_glue", rest)
        return ("clear", None)
    return None


def loop_junk(db, stats: Counter):
    out = []
    has_type = "speaker_type" in {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    rows = db.execute(
        f"SELECT speech_id, person_id, speaker_name, speaker_name_clean, {'speaker_type' if has_type else 'NULL AS speaker_type'} FROM speeches "
        "WHERE speaker_name_clean IS NOT NULL AND source NOT IN ('wragge_xml') AND ("
        "length(speaker_name_clean) <= 3 OR length(speaker_name_clean) > 60 OR speaker_name_clean LIKE '%&%;%' "
        "OR speaker_name_clean GLOB ':[0-9]*' OR speaker_name_clean LIKE 'The Deputy %' OR speaker_name_clean LIKE 'The Acting %' "
        "OR speaker_name_clean IN ('Senator','Hon','Mr','Ms','Mrs','Dr','Prof','Madam'))").fetchall()
    for r in rows:
        v = junk_verdict(r["speaker_name_clean"], r["speaker_name"])
        if not v:
            continue
        action, new_clean = v
        stats["junk_" + action] += 1
        new_type = "unknown" if action == "clear" else (r["speaker_type"] or None)
        out.append((r["speech_id"], None if action == "clear" else r["person_id"], new_clean, "junk_" + action,
                    r["person_id"], r["speaker_name_clean"], new_type))
    return out


# ── apply ────────────────────────────────────────────────────────────────────

RELINKS_DDL = """
CREATE TABLE IF NOT EXISTS ext_committee_relinks (
    speech_id INTEGER PRIMARY KEY, old_person_id TEXT, old_speaker_name_clean TEXT, new_speaker_name_clean TEXT,
    speaker_type TEXT, matched_name TEXT, reason TEXT, changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ext_kb_patch_queue (
    slug TEXT PRIMARY KEY, reason TEXT, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT, queued_at TEXT NOT NULL, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS ext_ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, source TEXT NOT NULL,
    rows_loaded INTEGER, rows_deleted INTEGER, loaded_at TEXT NOT NULL, notes TEXT
);
"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--loops", default="jurisdiction,fullname,junk")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    loops = [l.strip() for l in args.loops.split(",") if l.strip()]

    db = sqlite3.connect(args.db, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.row_factory = sqlite3.Row
    db.executescript(RELINKS_DDL)
    cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    if "speaker_type" not in cols:
        if args.dry_run:
            log("speaker_type column absent (run committee_witnesses resolve first); junk loop will not set a type")
        else:
            db.execute("ALTER TABLE speeches ADD COLUMN speaker_type TEXT")
            db.commit()
    members = Members(db)
    stats: Counter = Counter()
    changes: dict[int, tuple] = {}     # speech_id -> (pid, clean, reason, old_pid, old_clean, type|None)

    if "jurisdiction" in loops:
        for sid, pid, clean, reason, old_pid, old_clean in loop_jurisdiction(db, members, stats):
            changes[sid] = (pid, clean, reason, old_pid, old_clean, None)
    if "fullname" in loops:
        for sid, pid, clean, reason, old_pid, old_clean in loop_fullname(db, members, stats):
            if sid not in changes:
                changes[sid] = (pid, clean, reason, old_pid, old_clean, None)
    if "junk" in loops:
        for sid, pid, clean, reason, old_pid, old_clean, new_type in loop_junk(db, stats):
            changes[sid] = (pid, clean, reason, old_pid, old_clean, new_type)
    stats["rows_changed"] = len(changes)
    by_reason = Counter(v[2] for v in changes.values())
    log("  " + ", ".join(f"{k}={v:,}" for k, v in sorted(stats.items())))
    log("  by reason: " + ", ".join(f"{k}={v:,}" for k, v in by_reason.most_common()))
    if args.dry_run:
        sample = list(changes.items())[:12]
        for sid, (pid, clean, reason, old_pid, old_clean, t) in sample:
            log(f"    {sid}: {old_pid!r}/{old_clean!r} -> {pid!r}/{clean!r} ({reason})")
        return

    stamp = now_iso()
    cur = db.cursor()
    cur.execute("BEGIN")
    has_type = "speaker_type" in {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    for sid, (pid, clean, reason, old_pid, old_clean, new_type) in changes.items():
        if new_type and has_type:
            cur.execute("UPDATE speeches SET person_id = ?, speaker_name_clean = ?, speaker_type = ? WHERE speech_id = ?",
                        (pid, clean, new_type, sid))
        else:
            cur.execute("UPDATE speeches SET person_id = ?, speaker_name_clean = ? WHERE speech_id = ?", (pid, clean, sid))
        cur.execute("INSERT OR REPLACE INTO ext_committee_relinks VALUES (?,?,?,?,?,?,?,?)",
                    (sid, old_pid, old_clean, clean, new_type, None, reason, stamp))
        cur.execute("INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?, ?, 'pending', ?) "
                    "ON CONFLICT(slug) DO UPDATE SET status = 'pending', reason = excluded.reason, queued_at = excluded.queued_at",
                    (f"speech-{sid}", reason, stamp))
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("speeches", SOURCE, len(changes), 0, stamp, ", ".join(f"{k}={v}" for k, v in sorted(stats.items()))))
    cur.execute("COMMIT")
    q = db.execute("SELECT COUNT(*) FROM ext_kb_patch_queue WHERE status = 'pending'").fetchone()[0]
    log(f"  updated {len(changes):,} rows; {q:,} slugs pending for the knowledge box")


if __name__ == "__main__":
    main()
