"""Strict publication port of the real iOS voting decoder.

Source: origin/ios/app d6d99935272fa28edb9039d08415a694cbfa5bcd,
mobile/src/api/{catalog-decoders,validation,ids}.ts: decodeVotes, vote,
voteBill, votesMeta, recordsOfVoteNames, voteKey. The app can quarantine a
small number of malformed records; publication accepts zero such violations.
Metadata is required here even though the app accepts pre-metadata catalogs.
"""
from datetime import date, datetime, timezone
import math
import re

VOTE_KEY = re.compile(r"(?:\d+|(?:nsw|vic|qld|sa|wa|tas|act|nt):[a-z0-9]+(?:-[a-z0-9]+)*)", re.ASCII)
MAX_SAFE_INTEGER = 2**53 - 1


def require(ok: bool, path: str) -> None:
    if not ok:
        raise ValueError(f"votes.json mobile decoder contract violated: {path}")


def text(value, path, nonempty=False):
    require(isinstance(value, str) and (not nonempty or bool(value.strip())), path)


def count(value, path):
    require(type(value) in (int, float) and 0 <= value <= MAX_SAFE_INTEGER
            and math.isfinite(value) and value == int(value), path)


def dated(value, path):
    text(value, path, True)
    require(bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T.*)?", value, re.ASCII)), path)
    try:
        date.fromisoformat(value[:10])
        if len(value) > 10:
            stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
            utc = stamp.replace(tzinfo=timezone.utc) if stamp.tzinfo is None else stamp.astimezone(timezone.utc)
            require(utc.date().isoformat() == value[:10], path)
    except ValueError:
        raise ValueError(f"votes.json mobile decoder contract violated: {path}") from None


def validate_votes(doc):
    require(isinstance(doc, dict), "root object")
    require(isinstance(doc.get("_names"), dict), "_names object (required)")
    meta = doc.get("_meta")
    require(isinstance(meta, dict), "_meta object (required)")
    require(type(meta.get("schema")) is int and meta["schema"] == 1, "_meta.schema == 1")
    dated(meta.get("content_changed_at"), "_meta.content_changed_at")
    require("latest_division_date" in meta, "_meta.latest_division_date (required, nullable)")
    if meta["latest_division_date"] is not None:
        dated(meta["latest_division_date"], "_meta.latest_division_date")
    latest = meta.get("latest_division_date_by_jurisdiction")
    require(isinstance(latest, dict), "_meta.latest_division_date_by_jurisdiction")
    for jur, day in latest.items():
        text(jur, "metadata jurisdiction", True)
        if day is not None:
            dated(day, "metadata jurisdiction date")
    people = {k: v for k, v in doc.items() if k not in ("_names", "_meta")}
    for key, person in people.items():
        require(bool(VOTE_KEY.fullmatch(key)), "vote identity")
        require(isinstance(person, dict), f"{key} object")
        allowed = {"name", "party", "jurisdiction", "house", "ayes", "noes", "divisions_total", "years", "for", "against"}
        require(not set(person) - allowed, f"{key} schema 1 fields")
        for field in ("name", "jurisdiction", "house"):
            text(person.get(field), f"{key}.{field}", True)
        require("party" in person, f"{key}.party (required, nullable)")
        if person["party"] is not None:
            text(person["party"], f"{key}.party")
        for field in ("ayes", "noes", "divisions_total"):
            count(person.get(field), f"{key}.{field}")
        require(isinstance(person.get("years"), list), f"{key}.years")
        for year in person["years"]:
            count(year, f"{key}.years[]")
        for field in ("for", "against"):
            require(isinstance(person.get(field), list), f"{key}.{field}")
            for sample in person[field]:
                require(isinstance(sample, dict), f"{key}.{field}[] object")
                text(sample.get("name"), "sample.name", True)
                text(sample.get("stage"), "sample.stage")
                dated(sample.get("date"), "sample.date")
                if sample.get("jur") is not None:
                    text(sample["jur"], "sample.jur", True)
                if sample.get("rebels") is not None:
                    count(sample["rebels"], "sample.rebels")
    for name, keys in doc["_names"].items():
        text(name, "_names key", True)
        require(isinstance(keys, list), "_names identity array")
        for key in keys:
            require(isinstance(key, str) and bool(VOTE_KEY.fullmatch(key)) and key in people,
                    "_names reference to a valid vote record")
    return people
