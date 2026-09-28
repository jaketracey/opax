"""
parli.ingest.handbook -- Parliamentary Handbook people, to turn the id in a transcript's member link into a person_id.

A committee transcript prints every parliamentarian's label inside a link to `handbook/allmps/<PHID>` (Ed Husic is
91219). The Handbook API (handbookapi.aph.gov.au, an honest user agent is welcome) lists the people behind those ids:
name, chamber, seat or state, party, the parliaments they sat in. This module fetches that list (one request, under
1 MB) and matches each person to a row of `members`, the table every other OPAX page keys people by:

    ext_handbook_people   phid, display_name, family/given name, chamber, seat or state, party, in_current, person_id, match_basis

`committee_witnesses fetch` refreshes it weekly; `committee_witnesses resolve` reads it. A member turn whose PHID is
unmapped keeps person_id NULL. It is never guessed from the surname (the reason for all of this: a bare surname such as
"Mr Kennedy" names one MP in the House and a hearing witness in the room next door).

The match: same chamber, surname equal (particles like "de" tolerated), and a first name the Handbook and `members` agree
on (given name, or the "(Tony)" preferred name); several candidates are narrowed by seat (House) or state (Senate). One
candidate left = accepted, with the reason in `match_basis`. Stub members (`wragge_*`, other non-numeric ids) never match.
"""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timedelta, timezone

API = "https://handbookapi.aph.gov.au/api"
USER_AGENT = "OPAX research (opax.com.au)"
FIELDS = ("PHID,GivenName,MiddleNames,FamilyName,PreferredName,DisplayName,Party,Electorate,SenateState,StateAbbrev,State,"
          "InCurrentParliament,MPorSenator,RepresentedParliaments,ServiceHistory_Start,ServiceHistory_End,Gender")
MIN_PARLIAMENT = 46          # people who sat in the 46th Parliament or later (covers the 47th and 48th)

DDL = """
CREATE TABLE IF NOT EXISTS ext_handbook_people (
    phid          TEXT PRIMARY KEY,
    display_name  TEXT,
    family_name   TEXT,
    given_name    TEXT,
    chamber       TEXT,          -- representatives | senate | both
    seat          TEXT,          -- electorate (House) or state (Senate)
    party         TEXT,
    in_current    INTEGER,
    service_start TEXT,
    service_end   TEXT,
    person_id     TEXT,          -- members.person_id, NULL when the match was not unique
    match_basis   TEXT,
    fetched_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ext_handbook_people_person ON ext_handbook_people(person_id);
"""

_STATES = {
    "new south wales": "nsw", "victoria": "vic", "queensland": "qld", "western australia": "wa",
    "south australia": "sa", "tasmania": "tas", "australian capital territory": "act", "northern territory": "nt",
}


def _key(s: str | None) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", (s or "").lower().replace("’", "'").replace("'", "")).strip()


def _state_key(s: str | None) -> str:
    k = _key(s)
    return _STATES.get(k, k)


def _surname_ok(handbook_family: str, member_last: str) -> bool:
    a, b = _key(handbook_family), _key(member_last)
    if not a or not b:
        return False
    return a == b or a.endswith(" " + b) or b.endswith(" " + a) or a.replace(" ", "") == b.replace(" ", "")


def _first_names(ind: dict) -> set[str]:
    given = _key((ind.get("GivenName") or "").split(" ")[0] if (ind.get("GivenName") or "").strip() else "")
    preferred = _key(re.sub(r"[()]", "", ind.get("PreferredName") or ""))
    return {n for n in (given, preferred) if n}


def _first_ok(ind: dict, member_first: str) -> bool:
    m = _key(member_first)
    if not m:
        return False
    for n in _first_names(ind):
        if n == m or (len(n) >= 3 and len(m) >= 3 and (n.startswith(m) or m.startswith(n))):
            return True
    return False


def _chambers(ind: dict) -> set[str]:
    kinds = ind.get("MPorSenator") or []
    if isinstance(kinds, str):
        kinds = [kinds]
    out = set()
    for k in kinds:
        k = str(k).lower()
        if k.startswith("member"):
            out.add("representatives")
        elif k.startswith("senator"):
            out.add("senate")
    return out


def keep(ind: dict) -> bool:
    """A person worth mapping: in the current Parliament, or sat in the 46th or later."""
    if str(ind.get("InCurrentParliament")).lower() == "true":
        return True
    parl = [p for p in (ind.get("RepresentedParliaments") or []) if isinstance(p, int)]
    return bool(parl) and max(parl) >= MIN_PARLIAMENT


def match_person(ind: dict, members: list[dict]) -> tuple[str | None, str]:
    """(members.person_id, basis) for one Handbook individual, or (None, why not)."""
    chambers = _chambers(ind)
    cands = [m for m in members
             if str(m.get("person_id") or "").isdigit()              # never a wragge_* / state stub
             and m.get("chamber") in chambers
             and _surname_ok(ind.get("FamilyName") or "", m.get("last_name") or "")]
    if not cands:
        return None, "no member with that surname in that chamber"

    def seat_ok(m: dict) -> bool:
        seat = m.get("electorate") or ""
        if m.get("chamber") == "representatives":
            return bool(_key(seat)) and _key(seat) == _key(ind.get("Electorate"))
        return bool(_state_key(seat)) and _state_key(seat) in {_state_key(ind.get("SenateState")), _state_key(ind.get("StateAbbrev")),
                                                            _state_key(ind.get("State"))}

    named = [m for m in cands if _first_ok(ind, m.get("first_name") or "")]
    if len(named) == 1:
        return named[0]["person_id"], "surname + first name"
    if len(named) > 1:
        seated = [m for m in named if seat_ok(m)]
        if len(seated) == 1:
            return seated[0]["person_id"], "surname + first name + seat"
        return None, f"{len(named)} members share that name"
    seated = [m for m in cands if seat_ok(m)]
    if len(seated) == 1:
        return seated[0]["person_id"], "surname + seat"
    return None, "surname matches but first name and seat do not agree"


def match_people(individuals: list[dict], members: list[dict]) -> list[dict]:
    """One dict per kept individual: the ext_handbook_people columns."""
    out = []
    for ind in individuals:
        if not keep(ind):
            continue
        pid, basis = match_person(ind, members)
        chambers = _chambers(ind)
        chamber = "both" if len(chambers) > 1 else (next(iter(chambers)) if chambers else None)
        seat = ind.get("Electorate") or ind.get("SenateState") or ind.get("StateAbbrev") or None
        out.append({
            "phid": str(ind["PHID"]), "display_name": ind.get("DisplayName"), "family_name": ind.get("FamilyName"),
            "given_name": (ind.get("GivenName") or "").strip() or None, "chamber": chamber, "seat": seat,
            "party": ind.get("Party") or None, "in_current": 1 if str(ind.get("InCurrentParliament")).lower() == "true" else 0,
            "service_start": ind.get("ServiceHistory_Start") or None, "service_end": ind.get("ServiceHistory_End") or None,
            "person_id": pid, "match_basis": basis,
        })
    return out


def fetch_individuals(session=None) -> list[dict]:
    import requests
    s = session or requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    resp = s.get(f"{API}/individuals", params={"$select": FIELDS}, timeout=120)
    resp.raise_for_status()
    return resp.json()["value"]


def _members(db: sqlite3.Connection) -> list[dict]:
    prev = db.row_factory
    db.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in db.execute(
            "SELECT person_id, first_name, last_name, full_name, electorate, chamber FROM members "
            "WHERE chamber IN ('representatives', 'senate')")]
    finally:
        db.row_factory = prev


def store_people(db: sqlite3.Connection, people: list[dict], stamp: str) -> None:
    db.executescript(DDL)
    db.execute("DELETE FROM ext_handbook_people")
    db.executemany(
        "INSERT INTO ext_handbook_people (phid, display_name, family_name, given_name, chamber, seat, party, in_current, "
        "service_start, service_end, person_id, match_basis, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [(p["phid"], p["display_name"], p["family_name"], p["given_name"], p["chamber"], p["seat"], p["party"], p["in_current"],
          p["service_start"], p["service_end"], p["person_id"], p["match_basis"], stamp) for p in people])
    db.commit()


def ensure_people(db: sqlite3.Connection, max_age_days: int = 7, force: bool = False, session=None, say=print) -> int:
    """Fetch and map the Handbook people unless the table is younger than `max_age_days`. Returns rows mapped to a
    person_id (0 when the fetch failed and the old table, if any, was kept)."""
    db.executescript(DDL)
    row = db.execute("SELECT MAX(fetched_at), COUNT(*), SUM(person_id IS NOT NULL) FROM ext_handbook_people").fetchone()
    if not force and row and row[0] and row[1]:
        try:
            age = datetime.now(timezone.utc) - datetime.strptime(row[0], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            if age < timedelta(days=max_age_days):
                return int(row[2] or 0)
        except ValueError:
            pass
    try:
        individuals = fetch_individuals(session)
    except Exception as e:          # network or API trouble must not stop the nightly; the old table (if any) stays
        say(f"  Handbook people not refreshed: {e}")
        return int(row[2] or 0) if row else 0
    people = match_people(individuals, _members(db))
    store_people(db, people, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    mapped = sum(1 for p in people if p["person_id"])
    say(f"  Handbook people: {len(people)} kept, {mapped} matched to members, {len(people) - mapped} unmatched")
    return mapped


def load_people(db: sqlite3.Connection) -> dict[str, dict]:
    """phid -> {person_id, display_name, ...}. Empty when the table does not exist yet."""
    prev = db.row_factory
    db.row_factory = sqlite3.Row
    try:
        return {r["phid"]: dict(r) for r in db.execute("SELECT * FROM ext_handbook_people")}
    except sqlite3.OperationalError:
        return {}
    finally:
        db.row_factory = prev
