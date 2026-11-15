"""Versioned electorate reference data. No dependency on funding or the legacy schema.

Bundles are portable JSON; import is transactional and validates the entire resulting
database. Source IDs are namespaced, dates are ISO, and service intervals are half-open.
Unknown dates never imply current membership: that comes from dated roster observations.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from datetime import date
from pathlib import Path

SCHEMA_VERSION = 1
EXPORT_VERSION = 1
NAMESPACE = uuid.UUID("7521c722-5b6e-4c5a-950d-8856790bf391")
JURISDICTIONS = {"federal", "nsw", "vic", "qld", "sa", "wa", "tas", "act", "nt"}
# JSON preserves source-specific evidence while indexed columns enforce the joins.
TABLES = {
    "sources": ("source_id", {}),
    "electorates": ("electorate_id", {}),
    "boundaries": ("boundary_version_id", {"electorate_id": "electorates"}),
    "keys": ("key_id", {"electorate_id": "electorates"}),
    "people": ("person_id", {}),
    "terms": ("representation_id", {"electorate_id": "electorates", "person_id": "people"}),
    "rosters": ("roster_id", {"electorate_id": "electorates"}),
    "elections": ("election_id", {}),
    "contests": ("contest_id", {"electorate_id": "electorates", "election_id": "elections"}),
    "demographics": ("profile_id", {"electorate_id": "electorates"}),
    "relations": ("relation_id", {"electorate_id": "electorates", "related_id": "electorates"}),
}


def stable_id(kind: str, source_key: str) -> str:
    """Mint once from a durable source key, never from display text alone."""
    return f"{kind}_{uuid.uuid5(NAMESPACE, kind + ':' + source_key).hex[:24]}"


def canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def fold(value: str) -> str:
    return re.sub(r"[^\w]+", " ", (value or "").casefold()).strip()


def init_db(db: sqlite3.Connection) -> None:
    db.execute("PRAGMA foreign_keys=ON")
    for name, (key, refs) in TABLES.items():
        columns = [f"{key} TEXT PRIMARY KEY", "document TEXT NOT NULL CHECK(json_valid(document))"]
        for column, target in refs.items():
            target_key = TABLES[target][0]
            columns.append(f"{column} TEXT NOT NULL REFERENCES ext_electorate_{target}({target_key}) DEFERRABLE INITIALLY DEFERRED")
        db.execute(f"CREATE TABLE IF NOT EXISTS ext_electorate_{name} ({','.join(columns)})")
        for column in refs:
            db.execute(f"CREATE INDEX IF NOT EXISTS idx_el_{name}_{column} ON ext_electorate_{name}({column})")
    db.execute("CREATE TABLE IF NOT EXISTS ext_electorate_imports (digest TEXT PRIMARY KEY, imported_at TEXT NOT NULL, source TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS ext_electorate_metadata (key TEXT PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document)))")
    db.commit()


def read_bundle(db: sqlite3.Connection) -> dict:
    return {"schema_version": SCHEMA_VERSION, **{r[0]: json.loads(r[1]) for r in db.execute("SELECT key, document FROM ext_electorate_metadata")}, **{
        name: [json.loads(r[0]) for r in db.execute(f"SELECT document FROM ext_electorate_{name} ORDER BY {key}")]
        for name, (key, _) in TABLES.items()
    }}


def _iso(value) -> None:
    if value is not None and (not isinstance(value, str) or date.fromisoformat(value).isoformat() != value):
        raise ValueError(f"Invalid ISO date: {value!r}")


def validate(bundle: dict) -> None:
    if bundle.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("Unsupported electorate schema_version")
    maps = {}
    for name, (key, _) in TABLES.items():
        rows = bundle.get(name, [])
        maps[name] = {r[key]: r for r in rows}
        if len(maps[name]) != len(rows):
            raise ValueError(f"Duplicate {key}")
        for row in rows:
            if not re.fullmatch(r"[A-Za-z0-9_-]+", row[key]):
                raise ValueError(f"Unsafe {key}")
            for field in ("start", "end", "as_of", "poll_date", "effective_from", "effective_to", "established", "abolished", "observed_through", "applicable_election_date"):
                _iso(row.get(field))
            for start, end in (("start", "end"), ("effective_from", "effective_to")):
                if row.get(start) and row.get(end) and row[end] <= row[start]:
                    raise ValueError(f"Invalid interval in {name}: {row[key]}")
            for source in row.get("sources", []):
                if source not in {s["source_id"] for s in bundle.get("sources", [])}:
                    raise ValueError(f"Unknown source {source}")
    for name, (_, refs) in TABLES.items():
        for row in bundle.get(name, []):
            for column, target in refs.items():
                if row.get(column) not in maps[target]:
                    raise ValueError(f"Dangling {name}.{column}: {row.get(column)}")
    def check_sources(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "sources" and isinstance(child, list) and all(isinstance(x, str) for x in child):
                    if any(x not in maps["sources"] for x in child):
                        raise ValueError("Unknown nested source")
                else:
                    check_sources(child)
        elif isinstance(value, list):
            for child in value:
                check_sources(child)
    check_sources(bundle)
    for name in ("keys", "demographics"):
        for row in maps[name].values():
            bid = row.get("boundary_version_id")
            if bid and (bid not in maps["boundaries"] or maps["boundaries"][bid]["electorate_id"] != row["electorate_id"]):
                raise ValueError("Crosswalk/profile boundary mismatch")
    chambers = {(e.get("jurisdiction"), e.get("chamber")) for e in maps["electorates"].values()}
    for record in bundle.get("dissolutions", []):
        if not isinstance(record, dict) or (record.get("jurisdiction"), record.get("chamber")) not in chambers:
            raise ValueError("Dissolution names no house in this bundle")
        for field in ("dissolved_on", "election_day"):
            if not isinstance(record.get(field), str):
                raise ValueError(f"Dissolution needs {field}")
            _iso(record[field])
        if record["election_day"] <= record["dissolved_on"]:
            raise ValueError("A house is dissolved before its election day")
        if not str(record.get("source_url", "")).startswith("https://"):
            raise ValueError("Dissolution needs an https source_url")
        if record.get("seated_on") is not None:
            if not isinstance(record["seated_on"], str):
                raise ValueError("Dissolution seated_on is a date")
            _iso(record["seated_on"])
            # Strictly after: a roster refetched on election day still lists the old members, and a
            # seated_on equal to it would let that refetch clear every seat.
            if record["seated_on"] <= record["election_day"]:
                raise ValueError("Members are seated after election day")
    slugs = set()
    for e in maps["electorates"].values():
        if not isinstance(e.get("capacity", 1), int) or e.get("capacity", 1) < 1:
            raise ValueError("Electorate capacity must be a positive integer")
        if e.get("jurisdiction") not in JURISDICTIONS or not e.get("chamber"):
            raise ValueError("Electorate needs a jurisdiction and chamber")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", e.get("slug", "")) or e["slug"] in slugs:
            raise ValueError("Duplicate or invalid electorate slug")
        slugs.add(e["slug"])
    for b in maps["boundaries"].values():
        if b.get("capacity", 0) < 1:
            raise ValueError("Boundary capacity must be positive")
        if b.get("geometry_kind") not in ("official", "statistical", "unavailable"):
            raise ValueError("Boundary needs geometry_kind")
    for roster in maps["rosters"].values():
        if not roster.get("as_of"):
            raise ValueError("Roster needs as_of")
        ids = [m["person_id"] for m in roster.get("members", [])]
        if len(ids) != len(set(ids)) or any(i not in maps["people"] for i in ids):
            raise ValueError("Invalid roster members")
        if len(ids) > roster.get("capacity", 1):
            raise ValueError("Roster exceeds capacity")
    for t in maps["terms"].values():
        if t.get("start_precision") not in ("day", "unknown") or t.get("end_precision") not in ("day", "open", "unknown"):
            raise ValueError("Term requires explicit date precision")
        if t["start_precision"] == "day" and not t.get("start"):
            raise ValueError("Day-precision term requires start date")
        if (t["end_precision"] == "day" and not t.get("end")) or (t["end_precision"] == "open" and t.get("end")):
            raise ValueError("Term endpoint contradicts precision")
        for p in t.get("party_periods", []):
            _iso(p.get("start")); _iso(p.get("end"))
            if p.get("start") and p.get("end") and p["end"] <= p["start"]:
                raise ValueError("Invalid party interval")
            if t.get("start") and p.get("start") and p["start"] < t["start"]:
                raise ValueError("Party period starts outside service")
            if t.get("end") and p.get("end") and p["end"] > t["end"]:
                raise ValueError("Party period ends outside service")
    for c in maps["contests"].values():
        event = maps["elections"][c["election_id"]]
        if event.get("jurisdiction") and event["jurisdiction"] != maps["electorates"][c["electorate_id"]]["jurisdiction"]:
            raise ValueError("Contest/election jurisdiction mismatch")
        if c.get("status") not in ("final", "provisional", "partial"):
            raise ValueError("Contest requires result status")
        if c.get("boundary_version_id"):
            b = maps["boundaries"].get(c["boundary_version_id"])
            if not b or b["electorate_id"] != c["electorate_id"]:
                raise ValueError("Contest boundary mismatch")
        candidates = c.get("candidates", [])
        if len({x["candidate_id"] for x in candidates}) != len(candidates):
            raise ValueError("Duplicate candidacy")
        if any(x.get("person_id") and x["person_id"] not in maps["people"] for x in candidates):
            raise ValueError("Unknown candidate person")
        if sum(bool(x.get("elected")) for x in candidates) > c.get("vacancies", 1):
            raise ValueError("Too many elected candidates")
        for x in candidates:
            kinds = [(v["kind"], v.get("round"), v.get("vote_type")) for v in x.get("votes", [])]
            if len(kinds) != len(set(kinds)):
                raise ValueError("Duplicate candidate vote stage")
            for v in x.get("votes", []):
                if v["kind"] not in ("primary", "tcp", "tpp", "preference") or v["votes"] < 0:
                    raise ValueError("Invalid candidate vote count")
                if v.get("denominator") is not None and v["denominator"] < v["votes"]:
                    raise ValueError("Vote count exceeds denominator")


def import_bundle(db: sqlite3.Connection, bundle: dict, *, imported_at: str, source: str) -> str:
    """Upsert a bundle, validate combined state, roll back every row on failure."""
    _iso(imported_at)
    init_db(db)
    if bundle.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("Unsupported electorate schema_version")
    digest = hashlib.sha256(canonical_json(bundle).encode()).hexdigest()
    with db:
        db.execute("PRAGMA defer_foreign_keys=ON")
        for name, (key, refs) in TABLES.items():
            seen = set()
            for row in bundle.get(name, []):
                if row[key] in seen:
                    raise ValueError(f"Duplicate {key}")
                seen.add(row[key])
                columns = [key, "document", *refs]
                values = [row[key], canonical_json(row), *[row[r] for r in refs]]
                db.execute(f"INSERT INTO ext_electorate_{name} ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)}) "
                           f"ON CONFLICT({key}) DO UPDATE SET " + ','.join(f"{c}=excluded.{c}" for c in columns[1:]), values)
        for key in ("coverage", "dissolutions"):
            if key in bundle:
                db.execute("INSERT INTO ext_electorate_metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document", (key, canonical_json(bundle[key])))
        validate(read_bundle(db))
        db.execute("INSERT OR IGNORE INTO ext_electorate_imports VALUES (?,?,?)", (digest, imported_at, source))
    return digest


class Registry:
    """Identical offline lookups for database builders and external consumers."""

    def __init__(self, bundle: dict):
        validate(bundle)
        self.bundle = bundle
        self.electorates = {e["electorate_id"]: e for e in bundle.get("electorates", [])}
        self.people = {p["person_id"]: p for p in bundle.get("people", [])}

    @staticmethod
    def result(rows: list, **extra) -> dict:
        return {"status": "matched" if len(rows) == 1 else "ambiguous" if rows else "unmatched", "matches": rows, **extra}

    def resolve(self, *, source: str, source_id: str, vintage: str | None = None,
                jurisdiction: str | None = None, chamber: str | None = None) -> dict:
        rows = [r for r in self.bundle.get("keys", []) if r["source"] == source and r["source_key"] == str(source_id)
                and (vintage is None or r.get("vintage") == vintage)
                and (jurisdiction is None or self.electorates[r["electorate_id"]]["jurisdiction"] == jurisdiction)
                and (chamber is None or self.electorates[r["electorate_id"]]["chamber"] == chamber)]
        # Different boundary vintages are intentionally distinct matches.
        return self.result(rows)

    def boundary_at(self, electorate_id: str, on: str, *, geometry_kind: str = "official") -> dict:
        _iso(on)
        rows = [r for r in self.bundle.get("boundaries", []) if r["electorate_id"] == electorate_id
                and r["geometry_kind"] == geometry_kind and r.get("effective_from")
                and r["effective_from"] <= on and (not r.get("effective_to") or on < r["effective_to"])]
        return self.result(rows)

    def representatives_at(self, electorate_id: str, on: str) -> dict:
        _iso(on)
        # A roster verifies a particular day, never all history or all future dates.
        observations = [r for r in self.bundle.get("rosters", []) if r["electorate_id"] == electorate_id and r["as_of"] == on]
        if observations:
            observations.sort(key=lambda r: r.get("priority", 0), reverse=True)
            r = observations[0]
            return {"status": "known" if r.get("complete") else "partial", "members": r["members"], "as_of": on, "sources": r.get("sources", [])}
        terms = [t for t in self.bundle.get("terms", []) if t["electorate_id"] == electorate_id
                 and t.get("start") and t["start"] <= on and t["start_precision"] == "day"
                 and ((t["end_precision"] == "day" and t.get("end") and on < t["end"])
                      or (t["end_precision"] == "open" and t.get("observed_through") and on <= t["observed_through"]))]
        terms = [dict(t, party=next((p["party"] for p in t.get("party_periods", [])
                 if p.get("start") and p["start"] <= on and (not p.get("end") or on < p["end"])), None)) for t in terms]
        capacity = self.electorates.get(electorate_id, {}).get("capacity", 1)
        return {"status": "conflicting" if len(terms) > capacity else "historical" if terms else "unknown", "members": terms, "as_of": on}

    def latest_prior_contest(self, electorate_id: str, on: str) -> dict:
        _iso(on)
        elections = {r["election_id"]: r for r in self.bundle.get("elections", [])}
        rows = [dict(c, poll_date=elections[c["election_id"]]["poll_date"]) for c in self.bundle.get("contests", [])
                if c["electorate_id"] == electorate_id and elections[c["election_id"]]["poll_date"] < on]
        latest = max((r["poll_date"] for r in rows), default=None)
        return self.result([r for r in rows if r["poll_date"] == latest], coverage="indexed contests only")


def covered_by_dissolution(electorate: dict, dissolutions: list) -> bool:
    """Whether a reviewed dissolution record names this seat's house."""
    return any((r["jurisdiction"], r["chamber"]) == (electorate["jurisdiction"], electorate["chamber"]) for r in dissolutions)


def dissolved_for(electorate: dict, dissolutions: list, contests: list, roster: dict | None, on: str) -> str | None:
    """The election day a seat's house is dissolved for on `on`, or None.

    A dissolved lower house has no members: the roster still lists who held each seat, but nobody is
    the member until the result is declared. Readers (the app's Today) draw "Assembly dissolved ...
    Last member" from this field instead of a member's row, so it must never clear early.

    Written when a reviewed dissolution record (bundle["dissolutions"]) names the seat's jurisdiction
    and chamber and `on` is its `dissolved_on` or later.

    Cleared only by the post-result roster reload. The bundle can show that in two ways.

    By the reviewed record (the way a state house clears today: the bundle carries no state contests,
    so the pipeline cannot see a state result for itself). After the result is declared a person adds
    `seated_on` to the dissolution record: the day from which the parliament's own member list is the
    new house. The field clears once the seat's newest roster observation is complete and dated
    `seated_on` or later. A roster refetched before that day, or a `seated_on` with no reload after
    it, keeps the field.

    By the result itself, where the bundle has it, as all three together:
      1. the seat has a contest at that election (its poll_date is the record's `election_day`)
         with a candidate marked elected and linked to a person: the result is declared and imported;
      2. the seat's newest roster observation is complete and dated `election_day` or later;
      3. that roster seats every elected candidate.
    A roster refetched after election day with no declared result fails (1), and one that still
    lists the old member after the result fails (3): the field stays in both cases.
    """
    for record in sorted(dissolutions, key=lambda r: r["election_day"], reverse=True):
        if (record["jurisdiction"], record["chamber"]) != (electorate["jurisdiction"], electorate["chamber"]):
            continue
        if on < record["dissolved_on"]:
            continue
        elected = {c["person_id"] for contest in contests if contest["election"]["poll_date"] == record["election_day"]
                   for c in contest.get("candidates", []) if c.get("elected")}
        complete = bool(roster) and bool(roster.get("complete"))
        seated_on = record.get("seated_on")
        if seated_on and on >= seated_on and complete and roster["as_of"] >= seated_on:
            continue
        reloaded = complete and roster["as_of"] >= record["election_day"]
        if elected and None not in elected and reloaded and elected <= {m["person_id"] for m in roster["members"]}:
            continue
        return record["election_day"]
    return None


def export_bundle(bundle: dict, directory: Path, *, generated: str) -> dict:
    """Content-addressed release assets; publish manifest last. No truncation of data."""
    validate(bundle)
    _iso(generated)
    bundle = {**bundle, **{name: sorted(bundle.get(name, []), key=lambda r: r[key]) for name, (key, _) in TABLES.items()}}
    release_id = hashlib.sha256(canonical_json({"bundle": bundle, "generated": generated, "export_version": EXPORT_VERSION}).encode()).hexdigest()[:16]
    release = directory / "releases" / release_id
    release.mkdir(parents=True, exist_ok=True)
    base = f"/electorates/releases/{release_id}"
    registry = Registry(bundle)
    files = {}

    def write(name, value):
        body = canonical_json(value) + "\n"
        target = release / name
        if target.exists() and target.read_text() != body:
            raise ValueError("Refusing to overwrite an immutable release; bump EXPORT_VERSION after exporter layout changes")
        target.write_text(body)
        files[name] = hashlib.sha256(body.encode()).hexdigest()

    sources = {s["source_id"]: s for s in bundle["sources"]}
    elections = {s["election_id"]: s for s in bundle["elections"]}
    index = []
    person_links = {}
    for eid, e in sorted(registry.electorates.items(), key=lambda x: (x[1]["jurisdiction"], x[1]["name"])):
        related = {name: [r for r in bundle.get(name, []) if r.get("electorate_id") == eid]
                   for name in ("boundaries", "keys", "terms", "rosters", "contests", "demographics", "relations")}
        contests = [dict(c, election=elections[c["election_id"]]) for c in related["contests"]]
        contests.sort(key=lambda c: c["election"]["poll_date"], reverse=True)
        rosters = sorted(related["rosters"], key=lambda r: (r["as_of"], r.get("priority", 0)), reverse=True)
        roster = rosters[0] if rosters else None
        members = [dict(m, person=registry.people[m["person_id"]]) for m in roster["members"]] if roster else []
        summary = dict(e, url=f"/subject/electorate/{e['slug']}", detail_url=f"{base}/{eid}.json",
                       representatives=members, representation_as_of=roster["as_of"] if roster else None,
                       representation_status=("verified" if roster.get("complete") else "partial") if roster else "unknown",
                       latest_election=contests[0]["election"]["poll_date"] if contests else None,
                       election_count=len(contests), history_count=len(related["terms"]))
        # Written on every seat of a house a dissolution record speaks for: the election day while it is
        # dissolved, null when it is not. A row with no key is one the pipeline cannot speak for (or a
        # release from before the field), and readers then decide from their own election record.
        if covered_by_dissolution(e, bundle.get("dissolutions", [])):
            summary["dissolved_for"] = dissolved_for(e, bundle["dissolutions"], contests, roster, generated)
        index.append(summary)
        pids = {t["person_id"] for t in related["terms"]} | {m["person_id"] for r in rosters for m in r["members"]}
        for pid in sorted(pids):
            p = registry.people[pid]
            item = person_links.setdefault(pid, dict(p, electorates=[]))
            item["electorates"].append({"electorate_id": eid, "name": e["name"], "jurisdiction": e["jurisdiction"],
                                       "chamber": e["chamber"], "url": summary["url"],
                                       "current": any(m["person_id"] == pid for m in members),
                                       "party": next((m.get("party") for m in members if m["person_id"] == pid), None),
                                       "periods": [{"start": t.get("start"), "end": t.get("end")} for t in related["terms"] if t["person_id"] == pid],
                                       "as_of": summary["representation_as_of"]})
        related["relations"] = [dict(r, related=registry.electorates[r["related_id"]]) for r in related["relations"]]
        detail = dict(summary, **related, elections=contests,
                      people={pid: registry.people[pid] for pid in sorted(pids)})
        used = set()
        def collect(value):
            if isinstance(value, dict):
                for field, child in value.items():
                    if field == "sources":
                        used.update(child)
                    else:
                        collect(child)
            elif isinstance(value, list):
                for child in value:
                    collect(child)
        collect(detail)
        detail["sources"] = {sid: sources[sid] for sid in sorted(used)}
        write(f"{eid}.json", detail)
    meta = {"schema_version": SCHEMA_VERSION, "export_version": EXPORT_VERSION, "release_id": release_id, "generated": generated,
            "coverage": bundle.get("coverage", {}), "sources": list(sources.values())}
    write("index.json", {"meta": meta, "electorates": index})
    write("people.json", {"meta": meta, "people": list(person_links.values())})
    write("crosswalk.json", {"meta": meta, "keys": bundle.get("keys", [])})
    write("reference.json", bundle)
    manifest = dict(meta, index_url=f"{base}/index.json", people_url=f"{base}/people.json",
                    crosswalk_url=f"{base}/crosswalk.json", reference_url=f"{base}/reference.json", files=files)
    directory.mkdir(parents=True, exist_ok=True)
    # Atomic pointer replacement: old readers can finish on the old immutable release.
    temporary = directory / "manifest.json.tmp"
    temporary.write_text(canonical_json(manifest) + "\n")
    temporary.replace(directory / "manifest.json")
    return manifest
