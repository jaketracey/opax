"""Dedup-key sets for the speech loaders, read from a bounded slice of `speeches`.

Every loader skips a speech whose key `speaker|date|sha256(text)[:16]` it has seen. The key contains
the speech's date, and a run only inserts rows dated inside its own window (`--since`, `--start`, the
hearings it is about to fetch), so only stored rows in that window can ever match. Reading the whole
table to build the set (the loaders used to: `SELECT speaker_name, date, text FROM speeches` into a
list) puts every speech's text in memory (1.3M rows, 4.6 GB of text, 6.4 GB resident) and reads the
29 GB table end to end, which is a minute on a desktop NVMe and a night on a small network-disk box.

    seen = build_seen(db, text_hash, sources=["nsw_hansard"], since="2026-08-29")
    seen = LazyDateSeen(db, text_hash, sources=[...])   # loads each date's keys the first time it is asked

Rows are streamed from the cursor, never `fetchall()`ed. Without a window the result is the same as
before (a full read), just without the intermediate list.

Windows need indexes to be cheap: (source, date) for `sources=` and (date) for a windowed read across
all sources; scripts/ensure_db_indexes.py creates them.
"""
from __future__ import annotations

from typing import Callable, Iterable


def key_of(speaker: str | None, date: str, text_hash: Callable[[str], str], text: str) -> str:
    return f"{speaker or ''}|{date}|{text_hash(text)}"


def build_seen(db, text_hash: Callable[[str], str], *, sources: Iterable[str] | None = None,
               since: str | None = None) -> set[str]:
    """Keys of stored speeches, optionally only these sources and only dated `since` or later."""
    where: list[str] = []
    params: list[str] = []
    sources = list(sources or [])
    if sources:
        where.append("source IN (%s)" % ",".join("?" * len(sources)))
        params += sources
    if since:
        where.append("date >= ?")
        params.append(str(since))
    sql = "SELECT speaker_name, date, text FROM speeches"
    if where:
        sql += " WHERE " + " AND ".join(where)
    seen: set[str] = set()
    for row in db.execute(sql, params):
        seen.add(key_of(row[0], row[1], text_hash, row[2]))
    return seen


class LazyDateSeen:
    """A set of dedup keys that loads each date's stored rows the first time a key for that date is
    tested. For a loader that only learns which dates it will write as it fetches them."""

    def __init__(self, db, text_hash: Callable[[str], str], *, sources: Iterable[str] | None = None):
        self.db = db
        self.text_hash = text_hash
        self.sources = list(sources or [])
        self.keys: set[str] = set()
        self.loaded: set[str] = set()

    def _load(self, day: str) -> None:
        if day in self.loaded:
            return
        self.loaded.add(day)
        sql = "SELECT speaker_name, date, text FROM speeches WHERE date = ?"
        params: list[str] = [day]
        if self.sources:
            sql += " AND source IN (%s)" % ",".join("?" * len(self.sources))
            params += self.sources
        for row in self.db.execute(sql, params):
            self.keys.add(key_of(row[0], row[1], self.text_hash, row[2]))

    @staticmethod
    def _date_of(key: str) -> str:
        # speaker|date|hash: the speaker may itself contain '|', the last two fields never do
        return key.rsplit("|", 2)[1]

    def __contains__(self, key: str) -> bool:
        self._load(self._date_of(key))
        return key in self.keys

    def add(self, key: str) -> None:
        self._load(self._date_of(key))
        self.keys.add(key)

    def __len__(self) -> int:
        return len(self.keys)
