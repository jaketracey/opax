"""Vote-date affiliation evidence; never read the undated members party.

TVFY detail member objects belong to that division, rather than to today's
roster. Keep those facts separately for future runs; old fetched divisions can
use the raw detail cache. Where TVFY omits party, only an unambiguous federal
Hansard membership observation on the division's actual date is admissible.
Without dated evidence the affiliation stays unknown.
"""
from __future__ import annotations

import json
from pathlib import Path
import sqlite3

DDL = """CREATE TABLE IF NOT EXISTS tvfy_vote_parties (
 division_id INTEGER NOT NULL, person_id TEXT NOT NULL, date TEXT NOT NULL,
 house TEXT NOT NULL, vote TEXT NOT NULL, party TEXT NOT NULL,
 PRIMARY KEY (division_id, person_id))"""


def source_parties(detail: dict) -> dict[str, tuple[str, str]]:
    from .tvfy_refresh import PARTY_CANONICAL, vote_value
    out = {}
    for vote in detail.get("votes") or []:
        member = vote.get("member") or {}
        pid = (member.get("person") or {}).get("id") or member.get("id")
        party = vote.get("party") or member.get("party")
        if pid is not None and isinstance(party, str) and party.strip():
            party = party.strip()
            out[str(pid)] = (vote_value(vote.get("vote")), PARTY_CANONICAL.get(party.casefold(), party))
    return out


def store_parties(db: sqlite3.Connection, detail: dict) -> None:
    db.execute(DDL)
    db.executemany("INSERT OR REPLACE INTO tvfy_vote_parties VALUES (?,?,?,?,?,?)",
                   [(detail["id"], pid, detail["date"], detail["house"], vote, party)
                    for pid, (vote, party) in source_parties(detail).items()])


class FederalAffiliations:
    def __init__(self, db: sqlite3.Connection, cache: Path | None = None):
        self.db = db
        self.cache = cache if cache is not None else Path.home() / ".cache/autoresearch/tvfy/division"
        self.tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.dated = {}
        self.has_dated = False
        if "speeches" in self.tables:
            columns = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
            self.has_dated = {"person_id", "date", "party_canonical", "state"} <= columns

    def for_division(self, division) -> dict[str, tuple[str, str]]:
        parties = {}
        if "tvfy_vote_parties" in self.tables:
            parties = {str(pid): (vote, party) for pid, vote, party in self.db.execute(
                "SELECT person_id,vote,party FROM tvfy_vote_parties WHERE division_id=? AND date=? AND house=?",
                (division["division_id"], division["date"], division["house"]))}
        try:
            detail = json.loads((self.cache / f"{division['division_id']}.json").read_text())
        except (OSError, ValueError):
            return parties
        from .tvfy_refresh import complete_detail
        if complete_detail(detail, division["division_id"]) and detail["date"] == division["date"] \
                and detail["house"] == division["house"]:
            parties.update(source_parties(detail))
        return parties

    def at(self, parties, pid, vote, day) -> str | None:
        fact = parties.get(str(pid))
        if fact and fact[0] == vote:
            return fact[1]
        # Most votes have complete TVFY evidence. Query a fallback sitting day
        # only when needed, rather than scanning the entire Hansard history.
        if day not in self.dated:
            people = {}
            if self.has_dated:
                for person, party in self.db.execute(
                    "SELECT DISTINCT person_id,party_canonical FROM speeches WHERE state='federal' AND date=? "
                    "AND person_id IS NOT NULL AND party_canonical IS NOT NULL AND party_canonical != ''", (day,)):
                    people.setdefault(str(person), set()).add(party)
            self.dated[day] = people
        dated = self.dated[day].get(str(pid), set())
        return next(iter(dated)) if len(dated) == 1 else None
