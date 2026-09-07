"""
parli.ingest.state_rosters -- full names for the state hansards' surname-only members.

The Queensland, South Australian, Victorian and (rarely) New South Wales
hansards name a member at the microphone by surname alone: "Mr PERRETT",
"The Hon. K.J. MAHER". The loader made one member stub per surname
(`qld_perrett`, full_name "Perrett") and the site showed a person called
"Perrett" with 39 speeches and no first name. This module gives every such
stub the member's full name from Wikidata's roster of each chamber.

  fetch    one SPARQL query per chamber (members whose term ended in 2010 or
           later, or has not ended; the dead excluded): name, given and family
           names, electoral district, party, term dates, gender, birth year.
           Written to `ext_state_roster`.
  resolve  each surname-only stub that has speeches is matched to the roster
           of its own chamber: same surname, a term that overlaps the stub's
           speeches, then (when more than one remains) the stub's electorate,
           the initials in the raw speaker string ("K.J. MAHER"), and the
           honorific's gender. Exactly one survivor: the stub gets the full
           name (first_name, last_name, party and electorate where it had
           none), every speech on it gets speaker_name_clean = full name and
           is queued for the knowledge box, and the change is recorded in
           `ext_committee_relinks`. Ambiguous or unmatched stubs are listed
           and left alone. The stub's person_id does not change: the site
           addresses people by name, not id.

    PYTHONPATH=. python3 -m parli.ingest.state_rosters fetch   --db ~/.cache/autoresearch/parli.db
    PYTHONPATH=. python3 -m parli.ingest.state_rosters resolve --db ~/.cache/autoresearch/parli.db [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

SOURCE = "state_rosters"
UA = "OPAX research (https://opax.com.au; contact jake.tracey@noice.work)"
SPARQL = "https://query.wikidata.org/sparql"

# (state, chamber) as parli.db names them -> the Wikidata position item.
POSITIONS = {
    ("qld", "qld_la"): "Q18526194",
    ("sa", "sa_ha"): "Q18220900",
    ("sa", "sa_lc"): "Q18662245",
    ("vic", "vic_la"): "Q18534408",
    ("vic", "vic_lc"): "Q19185341",
    ("nsw", "nsw_la"): "Q19202748",
    ("nsw", "nsw_lc"): "Q18810377",
}

# Wikidata party labels -> the corpus's canonical labels (parli.ingest.speech_hygiene).
PARTY_RULES = [
    (re.compile(r"liberal national", re.I), "LNP"),
    (re.compile(r"labor", re.I), "Labor"),
    (re.compile(r"country liberal", re.I), "Country Liberal Party"),
    (re.compile(r"liberal", re.I), "Liberal"),
    (re.compile(r"national", re.I), "Nationals"),
    (re.compile(r"greens?", re.I), "Greens"),
    (re.compile(r"one nation", re.I), "One Nation"),
    (re.compile(r"katter", re.I), "Katter's Australian Party"),
    (re.compile(r"independent", re.I), "Independent"),
    (re.compile(r"family first", re.I), "Family First"),
    (re.compile(r"animal justice", re.I), "Animal Justice Party"),
    (re.compile(r"shooters", re.I), "Shooters, Fishers and Farmers"),
    (re.compile(r"legalise cannabis", re.I), "Legalise Cannabis"),
    (re.compile(r"sa-?best", re.I), "SA-Best"),
]


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def canonical_party(label: str | None) -> str | None:
    if not label:
        return None
    for rx, canon in PARTY_RULES:
        if rx.search(label):
            return canon
    return label.strip()


def norm(s: str | None) -> str:
    """Letters only, lower-case: 'McGUIRE' == 'Mcguire', "O’Brien" == "O'Brien"."""
    return re.sub(r"[^a-z]", "", (s or "").lower().replace("’", "'"))


DDL = """
CREATE TABLE IF NOT EXISTS ext_state_roster (
    qid TEXT NOT NULL, state TEXT NOT NULL, chamber TEXT NOT NULL,
    full_name TEXT NOT NULL, given_name TEXT, family_name TEXT, district TEXT, party TEXT,
    term_start TEXT, term_end TEXT, gender TEXT, born TEXT, fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_state_roster_chamber ON ext_state_roster (state, chamber);
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


# ── fetch ────────────────────────────────────────────────────────────────────

def sparql(query: str, tries: int = 4) -> list[dict]:
    url = SPARQL + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=240) as resp:
                return json.load(resp)["results"]["bindings"]
        except Exception as e:  # noqa: BLE001
            if attempt == tries - 1:
                raise
            log(f"  wikidata {e!s:.80}; retrying in {5 * (attempt + 1)}s")
            time.sleep(5 * (attempt + 1))
    return []


def roster_query(qid: str) -> str:
    return f"""
SELECT ?p ?pLabel ?givenLabel ?familyLabel ?districtLabel ?partyLabel ?start ?end ?genderLabel ?born WHERE {{
  ?p p:P39 ?st . ?st ps:P39 wd:{qid} .
  OPTIONAL {{ ?st pq:P580 ?start }} OPTIONAL {{ ?st pq:P582 ?end }}
  OPTIONAL {{ ?st pq:P768 ?district }} OPTIONAL {{ ?st pq:P4100 ?party }}
  OPTIONAL {{ ?p wdt:P735 ?given }} OPTIONAL {{ ?p wdt:P734 ?family }} OPTIONAL {{ ?p wdt:P21 ?gender }}
  OPTIONAL {{ ?p wdt:P569 ?born }} OPTIONAL {{ ?p wdt:P570 ?died }}
  FILTER(!BOUND(?died))
  FILTER(!BOUND(?end) || ?end >= "2010-01-01T00:00:00Z"^^xsd:dateTime)
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en" . }}
}}"""


def fetch(db: sqlite3.Connection) -> None:
    db.executescript(DDL)
    stamp = now_iso()
    rows = []
    for (state, chamber), qid in POSITIONS.items():
        got = sparql(roster_query(qid))
        v = lambda r, k: (r.get(k) or {}).get("value")  # noqa: E731
        n = 0
        for r in got:
            label = re.sub(r"\s*\(.*?\)\s*$", "", v(r, "pLabel") or "").strip()
            if not label or re.match(r"^Q\d+$", label):
                continue
            rows.append((v(r, "p").rsplit("/", 1)[-1], state, chamber, label, v(r, "givenLabel"), v(r, "familyLabel"),
                         v(r, "districtLabel"), v(r, "partyLabel"), (v(r, "start") or "")[:10] or None,
                         (v(r, "end") or "")[:10] or None, v(r, "genderLabel"), (v(r, "born") or "")[:4] or None, stamp))
            n += 1
        log(f"  {state}/{chamber}: {n} term rows")
        time.sleep(1)
    cur = db.cursor()
    cur.execute("BEGIN")
    cur.execute("DELETE FROM ext_state_roster")
    cur.executemany("INSERT INTO ext_state_roster VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("ext_state_roster", SOURCE, len(rows), 0, stamp, "wikidata P39 terms, end >= 2010 or open, living"))
    cur.execute("COMMIT")
    log(f"wrote {len(rows):,} roster rows")


# ── resolve ──────────────────────────────────────────────────────────────────

INITIALS_RE = re.compile(r"^(?:the\s+)?(?:hon\.?\s+)?(?:mr|mrs|ms|miss|dr)?\.?\s*((?:[A-Z]\.?\s?){1,3})\s+[A-Za-z]", re.I)
HONORIFIC_RE = re.compile(r"^(?:the\s+hon\.?\s+)?(mr|mrs|ms|miss|dr)\b", re.I)


def initials_of(raw: str) -> str:
    """'The Hon. K.J. MAHER' -> 'kj'; 'Mr BROWN' -> ''."""
    m = INITIALS_RE.match(raw or "")
    if not m:
        return ""
    ini = re.sub(r"[^a-z]", "", m.group(1).lower())
    # "Mr M BROWN" is an initial; "Mr MARSHALL" is not (the regex needs a following word)
    return ini


def gender_of(raw: str) -> str | None:
    m = HONORIFIC_RE.match(raw or "")
    if not m:
        return None
    h = m.group(1).lower()
    return "male" if h == "mr" else ("female" if h in ("mrs", "ms", "miss") else None)


def surname_forms(r: dict) -> set[str]:
    """The surnames a roster row answers to: the family name, the last token,
    and the last two or three tokens joined ("van Holst Pellekaan", "Nampijinpa
    Price"). Whole tokens only: a fragment such as "FFIN" matches nobody."""
    toks = (r["full_name"] or "").split()
    forms = {norm(r["family_name"])} if r["family_name"] else set()
    for k in (1, 2, 3):
        if len(toks) >= k + 1:
            forms.add(norm(" ".join(toks[-k:])))
    return {f for f in forms if f}


def overlaps(term_start, term_end, d0, d1) -> bool | None:
    """True/False when the term is dated; None when Wikidata has no dates for it."""
    if not term_start and not term_end:
        return None
    if term_start and term_start > d1:
        return False
    if term_end and term_end < d0:
        return False
    return True


def resolve(db: sqlite3.Connection, dry_run: bool) -> None:
    db.executescript(DDL)
    roster = defaultdict(list)   # (state, chamber) -> rows
    for r in db.execute("SELECT * FROM ext_state_roster"):
        roster[(r["state"], r["chamber"])].append(dict(r))
    if not roster:
        sys.exit("ext_state_roster is empty: run fetch first")
    stubs = db.execute(
        "SELECT m.person_id, m.full_name, m.state, m.chamber, m.electorate, m.party, m.party_canonical, m.gender, "
        "COUNT(s.speech_id) AS n, MIN(s.date) AS d0, MAX(s.date) AS d1 "
        "FROM members m JOIN speeches s ON s.person_id = m.person_id "
        "WHERE NOT (m.person_id GLOB '[0-9]*') AND m.full_name NOT LIKE '% %' AND m.full_name != '' "
        "AND m.state IN ('qld', 'sa', 'vic', 'nsw') GROUP BY m.person_id").fetchall()
    stats = Counter()
    matched: list[tuple] = []     # (stub row, roster row, how)
    unmatched: list[tuple] = []
    for st in stubs:
        sur = norm(st["full_name"])
        raws = db.execute("SELECT speaker_name, COUNT(*) n FROM speeches WHERE person_id = ? GROUP BY 1 ORDER BY n DESC LIMIT 6",
                          (st["person_id"],)).fetchall()
        raw_top = raws[0]["speaker_name"] if raws else ""
        ini = next((initials_of(r["speaker_name"]) for r in raws if initials_of(r["speaker_name"])), "")
        gen = next((gender_of(r["speaker_name"]) for r in raws if gender_of(r["speaker_name"])), None)
        statewide = [r for k, rows in roster.items() if k[0] == st["state"] for r in rows]
        pool = roster.get((st["state"], st["chamber"])) or statewide
        cands = [r for r in pool if len(sur) >= 3 and sur in surname_forms(r)]
        if not cands and pool is not statewide:   # a member who moved between the houses
            cands = [r for r in statewide if len(sur) >= 3 and sur in surname_forms(r)]
        # a term overlapping the stub's speeches; undated terms only if nothing dated overlaps
        dated = [r for r in cands if overlaps(r["term_start"], r["term_end"], st["d0"], st["d1"]) is True]
        undated = [r for r in cands if overlaps(r["term_start"], r["term_end"], st["d0"], st["d1"]) is None]
        cands = dated or undated
        how = "surname+term" if dated else "surname"
        people = {r["qid"] for r in cands}
        if len(people) > 1 and st["electorate"]:
            narrowed = [r for r in cands if norm(r["district"]) == norm(st["electorate"])]
            if narrowed:
                cands, how = narrowed, how + "+district"
                people = {r["qid"] for r in cands}
        if len(people) > 1 and ini:
            narrowed = [r for r in cands if norm(r["given_name"] or r["full_name"].split()[0])[:1] == ini[:1]]
            if narrowed:
                cands, how = narrowed, how + "+initial"
                people = {r["qid"] for r in cands}
        if len(people) > 1 and gen:
            narrowed = [r for r in cands if (r["gender"] or "") == gen]
            if narrowed:
                cands, how = narrowed, how + "+gender"
                people = {r["qid"] for r in cands}
        if len(people) == 1:
            # prefer the dated term row for party/district
            best = sorted(cands, key=lambda r: (r["term_start"] or "", r["district"] or ""), reverse=True)[0]
            matched.append((st, best, how))
            stats["matched_" + how] += 1
        else:
            unmatched.append((st, sorted({r["full_name"] for r in cands}), raw_top))
            stats["ambiguous" if people else "unmatched"] += 1
    stats["stubs"] = len(stubs)
    stats["speeches_renamed"] = sum(st["n"] for st, _, _ in matched)

    # Full-name stubs that shout ("Bev McARTHUR", "Mcguire") take the roster's spelling.
    by_norm = defaultdict(set)
    for rows in roster.values():
        for r in rows:
            by_norm[(r["state"], norm(r["full_name"]))].add(r["full_name"])
    recased: list[tuple] = []
    for m in db.execute("SELECT person_id, full_name, state FROM members WHERE NOT (person_id GLOB '[0-9]*') "
                        "AND full_name LIKE '% %' AND state IN ('qld', 'sa', 'vic', 'nsw')"):
        names = by_norm.get((m["state"], norm(m["full_name"])), set())
        if len(names) == 1 and next(iter(names)) != m["full_name"]:
            recased.append((m["person_id"], m["full_name"], next(iter(names))))
    stats["recased"] = len(recased)

    # Fragment stubs: a surname that is only the tail of a real surname ("KINGHAM",
    # "SON", "FFIN") or too short to be one, from hansard lines the loader split.
    surnames = {f for rows in roster.values() for r in rows for f in surname_forms(r)}
    junk: list[tuple] = []
    for st in stubs:
        sur = norm(st["full_name"])
        if any(st["person_id"] == m[0]["person_id"] for m in matched):
            continue
        fragment = len(sur) < 3 or (sur not in surnames and any(f.endswith(sur) and f != sur for f in surnames))
        if fragment:
            junk.append((st["person_id"], st["full_name"], st["n"]))
    stats["fragment_stubs"] = len(junk)
    stats["fragment_speeches"] = sum(n for _, _, n in junk)
    log("  " + ", ".join(f"{k}={v:,}" for k, v in sorted(stats.items())))
    for st, names, raw in sorted(unmatched, key=lambda x: -x[0]["n"])[:40]:
        log(f"    left: {st['person_id']} ({st['n']:,} speeches {st['d0']}..{st['d1']}, {raw!r}) -> {names or 'no roster surname'}")
    if dry_run:
        shown = [m for m in matched if m[2] != "surname+term"] + sorted(matched, key=lambda x: -x[0]["n"])[:12]
        for st, r, how in shown:
            log(f"    {st['person_id']}: {st['full_name']!r} -> {r['full_name']!r} [{r['district']}, {canonical_party(r['party'])}, "
                f"{r['term_start']}..{r['term_end']}] {st['n']:,} speeches {st['d0']}..{st['d1']} ({how})")
        for pid, old_name, new_name in recased[:15]:
            log(f"    recase {pid}: {old_name!r} -> {new_name!r}")
        for pid, name, n in sorted(junk, key=lambda x: -x[2])[:15]:
            log(f"    fragment {pid}: {name!r} ({n} speeches) -> cleared")
        return

    stamp = now_iso()
    cur = db.cursor()
    cur.execute("BEGIN")
    renamed = 0
    for st, r, how in matched:
        full = r["full_name"]
        first = r["given_name"] or full.split()[0]
        last = r["family_name"] or full.split()[-1]
        party = st["party_canonical"] or st["party"] or canonical_party(r["party"])
        cur.execute("UPDATE members SET full_name = ?, first_name = ?, last_name = ?, party = COALESCE(NULLIF(party, ''), ?), "
                    "party_canonical = COALESCE(party_canonical, ?), electorate = COALESCE(NULLIF(electorate, ''), ?), "
                    "gender = COALESCE(gender, ?) WHERE person_id = ?",
                    (full, first, last, party, party, r["district"], {"male": "M", "female": "F"}.get(r["gender"] or ""), st["person_id"]))
        rows = cur.execute("SELECT speech_id, speaker_name_clean FROM speeches WHERE person_id = ? "
                           "AND COALESCE(speaker_type, '') != 'witness'", (st["person_id"],)).fetchall()
        for s in rows:
            cur.execute("UPDATE speeches SET speaker_name_clean = ? WHERE speech_id = ?", (full, s["speech_id"]))
            cur.execute("INSERT OR REPLACE INTO ext_committee_relinks VALUES (?,?,?,?,?,?,?,?)",
                        (s["speech_id"], st["person_id"], s["speaker_name_clean"], full, "member", r["qid"], "roster_full_name", stamp))
            cur.execute("INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?, 'roster_full_name', 'pending', ?) "
                        "ON CONFLICT(slug) DO UPDATE SET status = 'pending', reason = excluded.reason, queued_at = excluded.queued_at",
                        (f"speech-{s['speech_id']}", stamp))
            renamed += 1
    for pid, old_name, new_name in recased:
        cur.execute("UPDATE members SET full_name = ?, first_name = ?, last_name = ? WHERE person_id = ?",
                    (new_name, new_name.split()[0], new_name.split()[-1], pid))
        for sp in cur.execute("SELECT speech_id, speaker_name_clean FROM speeches WHERE person_id = ? "
                              "AND COALESCE(speaker_type, '') != 'witness' AND speaker_name_clean != ?", (pid, new_name)).fetchall():
            cur.execute("UPDATE speeches SET speaker_name_clean = ? WHERE speech_id = ?", (new_name, sp["speech_id"]))
            cur.execute("INSERT OR REPLACE INTO ext_committee_relinks VALUES (?,?,?,?,?,?,?,?)",
                        (sp["speech_id"], pid, sp["speaker_name_clean"], new_name, "member", None, "roster_recased", stamp))
            cur.execute("INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?, 'roster_recased', 'pending', ?) "
                        "ON CONFLICT(slug) DO UPDATE SET status = 'pending', reason = excluded.reason, queued_at = excluded.queued_at",
                        (f"speech-{sp['speech_id']}", stamp))
            renamed += 1
    cleared = 0
    for pid, name, n in junk:
        for sp in cur.execute("SELECT speech_id, speaker_name_clean FROM speeches WHERE person_id = ?", (pid,)).fetchall():
            cur.execute("UPDATE speeches SET person_id = NULL, speaker_name_clean = NULL, speaker_type = 'unknown' WHERE speech_id = ?",
                        (sp["speech_id"],))
            cur.execute("INSERT OR REPLACE INTO ext_committee_relinks VALUES (?,?,?,?,?,?,?,?)",
                        (sp["speech_id"], pid, sp["speaker_name_clean"], None, "unknown", None, "fragment_cleared", stamp))
            cur.execute("INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?, 'fragment_cleared', 'pending', ?) "
                        "ON CONFLICT(slug) DO UPDATE SET status = 'pending', reason = excluded.reason, queued_at = excluded.queued_at",
                        (f"speech-{sp['speech_id']}", stamp))
            cleared += 1
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("members", SOURCE, len(matched) + len(recased), 0, stamp, ", ".join(f"{k}={v}" for k, v in sorted(stats.items()))))
    cur.execute("COMMIT")
    q = db.execute("SELECT COUNT(*) FROM ext_kb_patch_queue WHERE status = 'pending'").fetchone()[0]
    log(f"  named {len(matched):,} members, recased {len(recased):,}, renamed {renamed:,} speeches, "
        f"cleared {cleared:,} fragment rows; {q:,} slugs pending for the knowledge box")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["fetch", "resolve"])
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    db = sqlite3.connect(args.db, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.row_factory = sqlite3.Row
    if args.command == "fetch":
        fetch(db)
    else:
        resolve(db, args.dry_run)


if __name__ == "__main__":
    main()
