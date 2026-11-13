#!/usr/bin/env python3
"""Dated parties for division vote rows whose source gives none (portal audit F08).

State Hansards (NSW, Victoria) list division members without parties, and TVFY
leaves some federal rows without one. A row gets a party here only from dated
evidence the repo or the database already holds, and only for its own date:

  release-term     the electorate release's term party periods (federal House,
                   OpenAustralia service records): start <= date < end, or an
                   open period up to the release's observed_through date.
  accepted-record  a reviewed per-record correction in scripts/roster_accept.json
                   ("vote_party_periods"), each citing its primary source. It
                   replaces the release periods it names, and only while the
                   release still holds exactly those periods.
  handbook-term    the Parliamentary Handbook's dated party periods for
                   senators (scripts/handbook_party_service.json, built by
                   scripts/build_handbook_parties.py): start <= date < end, or
                   an open period up to the end of service. The federal Senate
                   only: it is the dated record for Senate source labels.
                   A senator's undated Handbook party ("undated") dates
                   nothing; where it differs from the source label and no
                   dated period covers the date, the label is kept and marked
                   party_undated, because the senator changed party on a date
                   no record held gives (the page says so).
  release-roster   a verified seat roster in the release, on its as_of date.
  official-list    an official chamber list in scripts/roster_state_evidence.json,
                   on its as_of date.
  service          a reviewed service record in scripts/roster_service.json
                   (service and history entries with ISO start and end dates).
  wikidata-term    ext_state_roster: a Wikidata position-held term with a start
                   date and one parliamentary group, up to its end date, or up
                   to the fetch date while the term is open, and only when an
                   official dated list later in the same term (on or after the
                   division date, with no general election in between)
                   records the same party, and no dated list in that
                   parliament names another: Wikidata's group is not dated
                   inside a term, lags party changes, and its "term" can span
                   several parliaments. Groups that
                   name no single party ("Liberal-National Coalition") give none.
  bracket          the nearest dated list observations before and after the
                   date name the same party, with no general election for the
                   chamber between them (scripts/general_elections.json).

Identity, in this order, inside the row's own chamber: the person id, then the
exact full name (or a listed alias), then a bare surname print only when that
surname belongs to exactly one sitting member that day and to no other name
recorded voting in that chamber that day. Every applicable contribution must
agree, and no list observation inside a contributing term may disagree. Two
people with the same name sitting on that date, conflicting evidence, a party
code that is an office (Speaker, President) or evidence that ends before the
date all leave the row without a party. Nothing carries forward from the latest
observation: a later division waits for later evidence.

Rows the source does give a party are checked against the same evidence, because
some sources (TheyVoteForYou's federal rows) give a member's latest party on every
date: Katter's Australian Party on votes from before it existed. Parties are
compared in substance (same_party): a naming variant (ALP and Labor, an LNP
member the record files as Liberal or Nationals, NXT and Centre Alliance) is
never rewritten. Where dated evidence covers the date and names a different
party, the row takes the dated party and keeps the source label in
party_source.source_party. Where the dated evidence conflicts, the label is held
back (party_withheld) rather than shown from the wrong period. Where no dated
evidence covers the date, or the identity is ambiguous, the source label stays.
Corrections and holds are recomputed from the source label on every run.

A dated record that does not load on a night (the electorate release for the
House, the Handbook file for the Senate) recomputes nothing for its chamber:
the export keeps that chamber's published fills and corrections
(keep_published_parties) and logs one WARNING line. Without the release
nothing is recomputed at all, as before.

The nightly applies this inside scripts/export_division_pages.py, which reads
ext_state_roster from the same read-only snapshot as the votes. Dry run against
the committed pages:

    python3 scripts/vote_parties.py --dry-run [--db ~/.cache/autoresearch/parli.db]
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date as Date
import json
from pathlib import Path
import re
import sqlite3
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))
import division_rules as rules  # noqa: E402
from parli.ingest.tvfy_refresh import PARTY_CANONICAL  # noqa: E402

NAMESAKE_DAYS = 1461  # how near a dated list must be for its member to count as a possible namesake
ELECTIONS = ROOT / "scripts/general_elections.json"
RULES = ("pid", "full-name", "surname")
SOURCES = ("accepted-record", "release-term", "handbook-term", "release-roster", "official-list", "service", "wikidata-term", "bracket")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Kept source labels that no dated period covers: an undated record naming another party marks them.
UNDATED_KEPT = ("label-kept-no-match", "label-kept-no-dated-party", "label-kept-evidence-ends-before-date")
HANDBOOK = ROOT / "scripts/handbook_party_service.json"
ACCEPT = ROOT / "scripts/roster_accept.json"
SENATE = ("federal", "senate")


def fold(value) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[‘’ʼ`]", "'", text)
    return " ".join(text.casefold().split())


def surname(name) -> str:
    parts = fold(name).split()
    return parts[-1] if parts else ""


def iso(value) -> str | None:
    value = str(value or "")[:10]
    if not ISO.match(value):
        return None
    try:
        Date.fromisoformat(value)
    except ValueError:
        return None
    return value


# Short codes in the release's service records, as the division pages spell them.
# Historical names stay historical: the Palmer United Party is not relabelled UAP.
ABBREVIATIONS = {"nats": "Nationals", "clp": "Country Liberal Party", "ca": "Centre Alliance",
                 "nxt": "Nick Xenophon Team", "pup": "Palmer United Party", "uap": "United Australia Party",
                 "cdp": "Christian Democratic Party"}


def label(party) -> str | None:
    """One display label, never an office code."""
    if not isinstance(party, str) or not party.strip() or rules.office_code(party):
        return None
    return ABBREVIATIONS.get(party.strip().casefold()) or rules.party_label(party)


# Names PARTY_CANONICAL (the repo's party aliases) does not hold.
EXTRA_ALIASES = {"liberal national party of queensland": "LNP", "liberal national": "LNP",
                 "country liberal": "Country Liberal Party", "the greens": "Greens",
                 "australian greens": "Greens", "national party of australia": "Nationals"}
# One party in substance under two names. Liberal National Party (Queensland) and
# Country Liberal Party (NT) members sit federally in the Liberal or the Nationals
# party room, and dated records file them either way. Liberal and Nationals are
# still two parties to each other.
MERGED_PARTIES = {"LNP": frozenset({"Liberal", "Nationals"}),
                  "Country Liberal Party": frozenset({"Liberal", "Nationals"})}


def canonical_party(party) -> str | None:
    """One name per party for comparison only; display labels stay as they are."""
    text = label(party)
    if not text:
        return None
    key = text.casefold()
    return PARTY_CANONICAL.get(key) or EXTRA_ALIASES.get(key) or text


def same_party(a, b) -> bool:
    """Two labels name one party in substance (never an office code)."""
    a, b = canonical_party(a), canonical_party(b)
    if not a or not b:
        return False
    return a == b or b in MERGED_PARTIES.get(a, ()) or a in MERGED_PARTIES.get(b, ())


def entry(source, chamber, ident, names, party, start, end=None, through=None, *, pids=(), url=None, point=False):
    """One dated observation. Intervals are start <= d < end, or start <= d <= through when open."""
    folded = {fold(n) for n in names if fold(n)}
    return {"source": source, "chamber": chamber, "ident": ident, "names": folded,
            "surnames": {surname(n) for n in folded}, "pids": {str(p) for p in pids if p},
            "party": label(party), "start": start, "end": end, "through": through,
            "url": url, "point": point}


# ---- evidence loaders -------------------------------------------------------------------------

def release_evidence(public: Path) -> list[dict]:
    manifest = json.loads((public / "electorates/manifest.json").read_text(encoding="utf-8"))
    index = json.loads((public / manifest["index_url"].lstrip("/")).read_text(encoding="utf-8"))
    people = {p["person_id"]: p for p in json.loads(
        (public / manifest["people_url"].lstrip("/")).read_text(encoding="utf-8")).get("people", [])}
    out = []
    for seat in index.get("electorates", []):
        as_of = iso(seat.get("representation_as_of"))
        if seat.get("representation_status") == "verified" and as_of:
            for rep in seat.get("representatives") or []:
                member = rep.get("person") or {}
                out.append(entry("release-roster", seat["chamber"], ("release", rep.get("person_id")),
                                 [member.get("name"), *(member.get("aliases") or [])], rep.get("party"),
                                 as_of, as_of, as_of, pids=[member.get("legacy_person_id")],
                                 url=member.get("source_url") or seat.get("url"), point=True))
        detail_url = seat.get("detail_url")
        if not detail_url:
            continue
        path = public / detail_url.lstrip("/")
        if not path.is_file():
            continue
        detail = json.loads(path.read_text(encoding="utf-8"))
        for term in detail.get("terms") or []:
            person = people.get(term.get("person_id")) or {}
            names = [person.get("name"), *(person.get("aliases") or [])]
            for period in term.get("party_periods") or []:
                start, end = iso(period.get("start")), iso(period.get("end"))
                through = iso(term.get("observed_through")) if period.get("end") is None else None
                if not start or not (end or through):
                    continue
                out.append(entry("release-term", seat["chamber"], ("release", term.get("person_id")), names,
                                 period.get("party"), start, end, through,
                                 pids=[person.get("legacy_person_id")], url=seat.get("url")))
    return out


def official_evidence(root: Path) -> list[dict]:
    state = json.loads((root / "scripts/roster_state_evidence.json").read_text(encoding="utf-8"))
    out = []
    for snapshot in state.get("snapshots", []):
        for member in snapshot.get("members", []):
            as_of = iso(member.get("as_of") or snapshot.get("as_of"))
            if as_of and member.get("party"):
                out.append(entry("official-list", snapshot["chamber"], ("name", fold(member["name"])),
                                 [member["name"], *member.get("aliases", [])], member["party"],
                                 as_of, as_of, as_of, url=snapshot.get("source_url"), point=True))
    return out


def service_evidence(root: Path) -> list[dict]:
    out = []
    service = json.loads((root / "scripts/roster_service.json").read_text(encoding="utf-8"))
    for row in [*service.get("service", []), *service.get("history", [])]:
        start, end = iso(row.get("start")), iso(row.get("end"))
        if start and end and row.get("party"):
            out.append(entry("service", row["chamber"], ("name", fold(row["name"])), [row["name"]], row["party"],
                             start, end, url=row.get("source_url")))
    return out


def handbook_range(path: Path) -> dict:
    """The dated range of the Handbook file: Senate divisions from `from` to `fetched`."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    start, through = iso(doc.get("from")), iso(doc.get("fetched"))
    if not start or not through:
        raise ValueError("no dated range")
    return {"record": "handbook", "from": start, "through": through, "url": doc.get("url")}


def handbook_evidence(path: Path) -> list[dict]:
    """The Handbook's dated Senate party periods (scripts/handbook_party_service.json)."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    if doc.get("chamber") != "senate" or not isinstance(doc.get("people"), list):
        raise ValueError("not a Senate party service file")
    handbook_range(path)
    out = []
    for person in doc["people"]:
        for period in person.get("periods") or []:
            start, end, through = iso(period.get("start")), iso(period.get("end")), iso(period.get("through"))
            if not start or not (end or through) or not label(period.get("party")):
                continue
            out.append(entry("handbook-term", "senate", ("handbook", str(person["phid"])),
                             [person.get("name"), *(person.get("names") or [])], period["party"], start, end,
                             None if end else through, pids=[person.get("pid")],
                             url=f"https://handbookapi.aph.gov.au/api/recordsofservice?$filter=PHID eq "
                                 f"'{person['phid']}' and ROSTypeID eq 11"))
    return out


def handbook_undated(path: Path) -> dict:
    """{("senate", pid or folded name): undated Handbook parties} for senators who have any."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    out = {}
    for person in doc.get("people") or []:
        parties = [label(p) for p in person.get("undated") or [] if label(p)]
        if not parties:
            continue
        for key in [person.get("pid"), *(fold(n) for n in [person.get("name"), *(person.get("names") or [])])]:
            if key:
                out[("senate", str(key))] = parties
    return out


def accepted_periods(path: Path) -> list[dict]:
    """Reviewed per-record party periods (scripts/roster_accept.json, "vote_party_periods")."""
    doc = json.loads(Path(path).read_text(encoding="utf-8")).get("vote_party_periods") or {}
    people = doc.get("people") or []
    if not isinstance(people, list):
        raise ValueError('"vote_party_periods.people" is not a list')
    return people


def apply_accepts(evidence: list[dict], accepts: list[dict]) -> list[dict]:
    """Install each reviewed record: drop the release periods it replaces, add its periods.

    A record applies only while every period it `replaces` is still in the
    evidence exactly (same person, chamber, party, start and end); otherwise the
    evidence has moved since the review and the record is held, with a log
    line. A record that is not well formed is held too."""
    out = list(evidence)
    for acc in accepts:
        try:
            chamber, pid, name = acc["chamber"], str(acc["pid"]), acc["name"]
            url, replaces, periods = acc["url"], acc.get("replaces") or [], acc["periods"]
            wanted = [(label(r["party"]), iso(r["start"]), iso(r["end"])) for r in replaces]
            new = [(p["party"], iso(p["start"]), iso(p["end"])) for p in periods]
            if not url or not new or any(not (p and a and b and a < b) for p, a, b in new) \
                    or any(not (p and a and b) for p, a, b in wanted):
                raise ValueError("a period without a party, a start before its end, or a source")
        except (KeyError, TypeError, ValueError, AttributeError) as e:
            log(f"accepted party record held ({type(e).__name__}: {e})")
            continue
        mine = [e for e in out if e["chamber"] == chamber and pid in e["pids"] and not e["point"]]
        drop = []
        for party, start, end in wanted:
            hit = [e for e in mine if e["party"] == party and e["start"] == start and e["end"] == end]
            if not hit:
                break
            drop.extend(hit)
        else:
            ids = {id(e) for e in drop}
            out = [e for e in out if id(e) not in ids]
            out.extend(entry("accepted-record", chamber, ("accepted", pid), [name, *(acc.get("aliases") or [])],
                             party, start, end, pids=[pid], url=url) for party, start, end in new)
            continue
        log(f"accepted party record for {name} held: the periods it replaces have changed since the review")
    return out


def wikidata_evidence(db: sqlite3.Connection | None) -> list[dict]:
    if db is None or not db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ext_state_roster'").fetchone():
        return []
    from parli.ingest.state_rosters import canonical_party
    out = []
    for qid, chamber, full, given, family, party, start, end, fetched in db.execute(
            "SELECT qid, chamber, full_name, given_name, family_name, party, term_start, term_end, fetched_at "
            "FROM ext_state_roster ORDER BY qid, chamber, term_start, party"):
        start, end, fetched = iso(start), iso(end), iso(fetched)
        names = [full, f"{given} {family}" if given and family else None]
        # A term with no start cannot place anyone on a date; it still counts
        # as a possible namesake for the surname rule (party None).
        canon = canonical_party(party)
        out.append(entry("wikidata-term", chamber, ("wikidata", qid), names, canon,
                         start, end, None if end else fetched,
                         url=f"https://www.wikidata.org/wiki/{qid}" if qid else None))
    return out


def log(message: str) -> None:
    print(f"[vote-parties] {message}", file=sys.stderr)


def load_elections(path: Path = ELECTIONS) -> dict[str, list[str]]:
    """Polling days by chamber; unreadable means none, and no evidence crosses a parliament."""
    try:
        chambers = json.loads(Path(path).read_text(encoding="utf-8"))["chambers"]
        return {c: sorted(d for d in days if iso(d)) for c, days in chambers.items()}
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        log(f"general elections unreadable ({type(e).__name__}); no bracket or Wikidata confirmation this run")
        return {}


class Evidence(list):
    """Dated observations, plus the general elections that bound them.

    `check_labels` is False when the electorate release did not load. The
    release is the dated record for federal House source labels, so the
    division export then recomputes nothing and keeps the previous run's fills
    and corrections as published (keep_published_parties). `frozen` holds the
    (jurisdiction, house) pairs whose own dated record did not load (the
    federal Senate without the Handbook file): only those records keep what was
    published, and the rest are recomputed. `dated` maps a (jurisdiction,
    house) to the dated range of its own party record: a record inside it is
    marked _meta.party_dated, so its page can say its labels were checked.
    `undated` maps (chamber, person id or folded name) to a person's undated
    parties in that chamber's record (undated_change)."""
    def __init__(self, items=(), elections=None, check_labels=True, frozen=(), dated=None, undated=None):
        super().__init__(items)
        self.undated = dict(undated or {})
        self.elections = load_elections() if elections is None else elections
        self.check_labels = check_labels
        self.frozen = frozenset(frozen)
        self.dated = dict(dated or {})

    def undated_change(self, house: str, member: dict) -> list[str] | None:
        """The undated record parties when none is the source label's party: a change no record dates."""
        pid = rules.canonical_person_id(member.get("person_id"))
        pid = pid[5:] if pid and pid.startswith("tvfy_") else pid
        parties = self.undated.get((house, str(pid))) or self.undated.get((house, fold(member.get("name"))))
        if parties and not any(same_party(p, member.get("party")) for p in parties):
            return parties
        return None

    def dated_range(self, record: dict) -> dict | None:
        rng = self.dated.get((record.get("jurisdiction"), record.get("house")))
        day = iso(record.get("date"))
        return rng if rng and day and rng["from"] <= day <= rng["through"] else None

    def is_frozen(self, record: dict) -> bool:
        return (record.get("jurisdiction"), record.get("house")) in self.frozen


def load_evidence(root: Path = ROOT, db: sqlite3.Connection | None = None, public: Path | None = None) -> Evidence:
    """Every source is optional: a missing or unreadable one is logged and gives
    nothing, so the division export never fails for want of evidence. A dated
    record that does not load freezes its chamber (Evidence.frozen)."""
    public = public or root / "portal/public"
    out, loaded = [], set()
    for name, load in (("electorate release", lambda: release_evidence(public)),
                       ("Senate party records", lambda: handbook_evidence(root / "scripts/handbook_party_service.json")),
                       ("official lists", lambda: official_evidence(root)),
                       ("service records", lambda: service_evidence(root)),
                       ("Wikidata terms", lambda: wikidata_evidence(db))):
        try:
            out.extend(load())
            loaded.add(name)
        except (OSError, ValueError, KeyError, TypeError, AttributeError, ImportError, sqlite3.Error) as e:
            log(f"{name} skipped ({type(e).__name__}: {e}); no party is filled from it")
    release_loaded = "electorate release" in loaded
    frozen = set()
    dated, undated = {}, {}
    if "Senate party records" in loaded:
        dated[SENATE] = handbook_range(root / "scripts/handbook_party_service.json")
        undated = handbook_undated(root / "scripts/handbook_party_service.json")
    if not release_loaded:
        log("WARNING: the electorate release (the dated party record) did not load; "
            "no party is recomputed this run: the previous fills and corrections are kept as published")
    elif "Senate party records" not in loaded:
        frozen.add(SENATE)
        log("WARNING: the Senate party records (scripts/handbook_party_service.json) did not load; "
            "no federal Senate party is recomputed this run: the previous Senate fills and corrections are kept "
            "as published")
    try:
        out = apply_accepts(out, accepted_periods(root / "scripts/roster_accept.json"))
    except (OSError, ValueError, TypeError, AttributeError) as e:
        log(f"accepted party records skipped ({type(e).__name__}: {e}); none is applied")
    return Evidence(out, load_elections(root / "scripts/general_elections.json"), check_labels=release_loaded,
                    frozen=frozen, dated=dated, undated=undated)


def same_parliament(elections: dict, chamber: str, a: str, b: str) -> bool:
    """No general election for the chamber falls after the earlier date and on or
    before the later one. Dates before the first listed election are unknown
    territory: fail closed."""
    days = elections.get(chamber) or []
    lo, hi = sorted((a, b))
    if not days or lo < days[0]:
        return False
    return not any(lo < d <= hi for d in days)


# ---- resolution -------------------------------------------------------------------------------

def covers(e: dict, day: str) -> bool:
    if not e["start"] or e["start"] > day:
        return False
    if e["point"]:
        return e["start"] == day
    if e["end"]:
        return day < e["end"]
    return bool(e["through"]) and day <= e["through"]


def may_sit(e: dict, day: str) -> bool:
    """Generous on purpose: anyone who might sit that day counts as a namesake."""
    if e["point"]:
        return abs((Date.fromisoformat(e["start"]) - Date.fromisoformat(day)).days) <= NAMESAKE_DAYS
    if e["start"] and e["start"] > day:
        return False
    return not e["end"] or day < e["end"] or (e["through"] is None and not e["start"])


def wikidata_confirmed(term: dict, day: str, points: list[dict], elections: dict) -> bool:
    """A Wikidata term's group is not dated inside the term, and it lags party
    changes (it still gave two Victorian members their pre-2023 parties in
    September 2026). A Wikidata "term" can also span several parliaments. It
    counts only when an official dated list, later in the same term, on or
    after the division date and with no general election in between, records
    the same party; any dated list in that parliament naming another party
    vetoes it."""
    if any(p["source"] != "wikidata-term" and p["party"] != term["party"]
           and same_parliament(elections, term["chamber"], p["start"], day) for p in points):
        return False
    return any(p["source"] != "wikidata-term" and p["party"] == term["party"] and p["start"] >= day
               and p["start"] >= term["start"] and (not term["end"] or p["start"] < term["end"])
               and same_parliament(elections, term["chamber"], day, p["start"])
               for p in points)


def people_of(entries) -> list[set[str]]:
    """Group records into people: shared names join them, distinct ids keep them apart."""
    groups: list[tuple[set[str], set]] = []
    for e in entries:
        ids = {e["ident"]} if e["ident"][0] in ("wikidata", "release", "handbook") else set()
        joined = [g for g in groups if g[0] & e["names"]]
        names, idents = set(e["names"]), set(ids)
        for g in joined:
            names |= g[0]
            idents |= g[1]
            groups.remove(g)
        groups.append((names, idents))
    out = []
    for names, idents in groups:
        # One name shared by two Wikidata people (or two release or Handbook people) is two people.
        for scheme in ("wikidata", "release", "handbook"):
            if len({i for i in idents if i[0] == scheme}) > 1:
                out.extend([names, names])
                break
        else:
            out.append(names)
    return out


class Resolver:
    def __init__(self, evidence: list[dict]):
        self.elections = getattr(evidence, "elections", None)
        if self.elections is None:
            self.elections = load_elections()
        self.by_chamber = defaultdict(list)
        self.by_pid = defaultdict(list)
        self.by_name = defaultdict(list)
        self.order = {id(e): i for i, e in enumerate(evidence)}
        for e in evidence:
            self.by_chamber[e["chamber"]].append(e)
            for pid in e["pids"]:
                self.by_pid[(e["chamber"], pid)].append(e)
            for name in e["names"]:
                self.by_name[(e["chamber"], name)].append(e)

    def match(self, chamber: str, day: str, name: str, pid, voters: set[str]):
        """(rule, entries) for one sitting identity, or (reason, None)."""
        pool = self.by_chamber.get(chamber, [])
        key = fold(name)
        canonical = rules.canonical_person_id(pid)
        bare = canonical[5:] if canonical and canonical.startswith("tvfy_") else canonical
        if bare:
            hits = self._pid_hits(chamber, bare, canonical)
            if hits:
                return self._one(hits, day, "pid")
        if len(key.split()) >= 2 and not re.search(r"\b[a-z]\.", key):
            hits = list(self.by_name.get((chamber, key), ()))
            return self._one(hits, day, "full-name") if hits else ("no-match", None)
        if len(key.split()) == 1:
            others = {v for v in voters if v != key and surname(v) == key}
            if others:
                return "ambiguous-surname", None
            sitting = [e for e in pool if key in e["surnames"] and may_sit(e, day)]
            if not sitting:
                return "no-match", None
            people = people_of(sitting)
            if len(people) != 1:
                return "ambiguous-surname", None
            names = people[0]
            hits = [e for e in pool if names & e["names"]]
            return self._one(hits, day, "surname")
        return "no-match", None

    def _pid_hits(self, chamber, bare, canonical):
        """Evidence naming either spelling of the person id, in evidence order, once each."""
        seen, hits = set(), []
        for e in [*self.by_pid.get((chamber, bare), ()), *self.by_pid.get((chamber, canonical), ())]:
            if id(e) not in seen:
                seen.add(id(e))
                hits.append(e)
        return sorted(hits, key=lambda e: self.order[id(e)])

    @staticmethod
    def _one(hits, day, rule):
        # Two distinct people in one identity scheme, both able to sit that day: ambiguous.
        for scheme in ("wikidata", "release", "handbook"):
            if len({e["ident"] for e in hits if e["ident"][0] == scheme and may_sit(e, day)}) > 1:
                return "ambiguous-identity", None
        return rule, hits

    def party_on(self, hits: list[dict], day: str, same=None):
        """(party, source, url) or (None, reason, None).

        `same` decides when two labels are one party: exact by default (fills
        keep the name the evidence uses), same_party when checking a source label."""
        same = same or (lambda a, b: a == b)
        agree = lambda parties: all(same(a, b) for a in parties for b in parties)
        found, unconfirmed = [], False
        chamber = hits[0]["chamber"] if hits else None
        points = sorted((e for e in hits if e["point"] and e["party"]), key=lambda e: e["start"])
        for e in hits:
            if not e["party"] or not covers(e, day):
                continue
            if e["source"] == "wikidata-term" and not wikidata_confirmed(e, day, points, self.elections):
                unconfirmed = True
                continue
            found.append((e["party"], e["source"], e["url"]))
        before = [e for e in points if e["start"] < day]
        after = [e for e in points if e["start"] > day]
        if before and after:
            lo = [e for e in before if e["start"] == before[-1]["start"]]
            hi = [e for e in after if e["start"] == after[0]["start"]]
            parties = {e["party"] for e in lo + hi}
            # One parliament only: a party held at both ends of a term was held
            # between them unless someone left and came back inside one term.
            if agree(parties) and same_parliament(self.elections, chamber, lo[0]["start"], hi[0]["start"]):
                found.append((hi[0]["party"], "bracket", hi[0]["url"]))
            elif not agree(parties):
                return None, "conflicting", None
        if not found:
            if unconfirmed:
                return None, "wikidata-unconfirmed", None
            ended = any(e["party"] and e["start"] and e["start"] <= day for e in hits)
            return None, "evidence-ends-before-date" if ended else "no-dated-party", None
        parties = {p for p, _, _ in found}
        # A dated list inside a contributing term must agree with it.
        for e in hits:
            if e["point"] and e["party"] and not any(same(e["party"], p) for p in parties) and any(
                    not h["point"] and h["party"] and covers(h, e["start"]) for h in hits if covers(h, day)):
                return None, "conflicting", None
        if not agree(parties):
            return None, "conflicting", None
        order = {s: i for i, s in enumerate(SOURCES)}
        party, source, url = min(found, key=lambda f: (order[f[1]], f[0]))
        return party, source, url


def voters_by_day(records) -> dict:
    out = defaultdict(set)
    for record in records:
        for member in record.get("members", []):
            out[(record.get("house"), record.get("date"))].add(fold(member.get("name")))
    return out


def clear_fills(records) -> None:
    """Undo a previous run: fills go, and corrected or withheld rows get their
    source label back. Parties the source gave are never lost."""
    for record in records:
        meta = record.get("_meta", {})
        meta.pop("party_fill", None)
        meta.pop("party_check", None)
        meta.pop("party_dated", None)
        for member in record.get("members", []):
            fill = member.pop("party_source", None)
            if fill:
                if isinstance(fill, dict) and fill.get("source_party"):
                    member["party"] = fill["source_party"]
                else:
                    member.pop("party", None)
            member.pop("party_undated", None)
            held = member.pop("party_withheld", None)
            if isinstance(held, dict) and held.get("source_party") and not member.get("party"):
                member["party"] = held["source_party"]



def keep_published_parties(record: dict, published: dict) -> None:
    """Carry the previous run's fills, corrections and holds onto a fresh record.

    Used when no party can be recomputed (the dated release is missing): a
    night without evidence must not undo what earlier evidence established.
    A row takes the published result only while its source label is the one
    that result was made from; a row whose source label changed keeps the
    new source label."""
    key = lambda m: (fold(m.get("name")), m.get("vote"), rules.canonical_person_id(m.get("person_id")))
    old = {}
    for m in published.get("members", []):
        old.setdefault(key(m), m)
    counts = Counter()
    for member in record.get("members", []):
        prev = old.get(key(member))
        if not prev:
            continue
        undated = prev.get("party_undated")
        if isinstance(undated, dict) and member.get("party") == undated.get("source_party"):
            member["party_undated"] = dict(undated)
        fill, held = prev.get("party_source"), prev.get("party_withheld")
        if isinstance(fill, dict) and fill.get("source_party"):
            if member.get("party") == fill["source_party"]:
                member["party"], member["party_source"] = prev["party"], dict(fill)
                counts["corrected"] += 1
        elif isinstance(fill, dict):
            if not member.get("party") and prev.get("party"):
                member["party"], member["party_source"] = prev["party"], dict(fill)
                counts["filled"] += 1
        elif isinstance(held, dict) and held.get("source_party"):
            if member.get("party") == held["source_party"]:
                member.pop("party", None)
                member["party_withheld"] = dict(held)
                counts["withheld"] += 1
    meta, old_meta = record.setdefault("_meta", {}), published.get("_meta", {})
    meta.pop("party_fill", None)
    meta.pop("party_check", None)
    meta.pop("party_dated", None)
    if isinstance(old_meta.get("party_dated"), dict):
        meta["party_dated"] = dict(old_meta["party_dated"])
    if counts["filled"] and old_meta.get("party_fill"):
        meta["party_fill"] = {**old_meta["party_fill"], "filled": counts["filled"]}
    if (counts["corrected"] or counts["withheld"]) and old_meta.get("party_check"):
        meta["party_check"] = {**old_meta["party_check"], "corrected": counts["corrected"],
                               "withheld": counts["withheld"]}


def check_label(resolver, house, day, member, voters) -> dict:
    """A source label against dated evidence: keep, correct or hold back."""
    source = member["party"]
    out = {"rule": None, "source": None, "party": source, "source_party": source}
    if rules.office_code(source) or not label(source):
        return {**out, "reason": "label-not-a-party"}
    rule, hits = resolver.match(house, day, member["name"], member.get("person_id"), voters)
    if hits is None:
        return {**out, "reason": "label-kept-" + rule}
    out["rule"] = rule
    party, how, url = resolver.party_on(hits, day, same=same_party)
    if party is None:
        if how == "conflicting":
            return {**out, "party": None, "reason": "label-withheld-conflicting"}
        return {**out, "reason": "label-kept-" + how}
    out.update(source=how, url=url)
    if not same_party(party, source):
        return {**out, "party": party, "reason": "label-corrected"}
    if label(party) != label(source):
        return {**out, "reason": "label-kept-variant"}
    return {**out, "reason": "label-agrees"}


def resolve_records(records, evidence, apply=False, check_labels=True):
    """Yield one outcome per row; set it on the row when `apply`.

    Rows without a source party are filled from dated evidence. Rows with one
    are checked against it (check_label) when `check_labels`."""
    resolver = Resolver(evidence)
    # A chamber whose dated record did not load is left as it is (Evidence.frozen).
    frozen = getattr(evidence, "is_frozen", None)
    records = [r for r in records if not (frozen and frozen(r))]
    # Without the dated release no label is checked: keep the source labels.
    check_labels = check_labels and getattr(evidence, "check_labels", True)
    if apply:
        # Recomputed every run: a previous fill or correction never outlives its evidence.
        clear_fills(records)
    voters = voters_by_day(records)
    for record in records:
        day, house = iso(record.get("date")), record.get("house")
        filled = corrected = withheld = 0
        for member in record.get("members", []):
            if not str(member.get("name") or "").strip():
                continue
            outcome = {"record": record, "member": member, "rule": None, "source": None, "party": None}
            if member.get("party"):
                if not check_labels or not day:
                    continue
                outcome.update(check_label(resolver, house, day, member, voters[(house, record.get("date"))]))
                if apply and outcome["reason"] == "label-corrected":
                    member["party"] = outcome["party"]
                    member["party_source"] = {"basis": outcome["source"], "url": outcome.get("url"),
                                              "source_party": outcome["source_party"]}
                    corrected += 1
                elif apply and outcome["reason"] == "label-withheld-conflicting":
                    member.pop("party", None)
                    member["party_withheld"] = {"source_party": outcome["source_party"], "reason": "conflicting"}
                    withheld += 1
                elif outcome["reason"] in UNDATED_KEPT and getattr(evidence, "undated_change", None):
                    # No dated period covers the date, and the chamber's record names another party
                    # without a date: the label stays, marked as possibly from another period.
                    parties = evidence.undated_change(house, member)
                    if parties:
                        outcome["reason"] = "label-kept-undated-change"
                        if apply:
                            member["party_undated"] = {"source_party": outcome["source_party"],
                                                       "record_parties": parties}
                yield outcome
                continue
            if not day:
                outcome["reason"] = "no-date"
                yield outcome
                continue
            rule, hits = resolver.match(house, day, member["name"], member.get("person_id"),
                                        voters[(house, record.get("date"))])
            if hits is None:
                outcome["reason"] = rule
                yield outcome
                continue
            party, source, url = resolver.party_on(hits, day)
            outcome.update(rule=rule)
            if party is None:
                outcome["reason"] = source
                yield outcome
                continue
            outcome.update(party=party, source=source, reason="filled")
            if apply:
                member["party"] = party
                member["party_source"] = {"basis": source, "url": url}
                filled += 1
            yield outcome
        rng = apply and check_labels and getattr(evidence, "dated_range", None) and evidence.dated_range(record)
        if rng:
            record.setdefault("_meta", {})["party_dated"] = {
                **rng, "note": "Party labels were checked against dated party records for this chamber and date."}
        if apply and filled:
            record.setdefault("_meta", {})["party_fill"] = {
                "rule": "dated-roster", "filled": filled,
                "note": "Rows without a party in the division source take the party a dated roster records for that date."}
        if apply and (corrected or withheld):
            record.setdefault("_meta", {})["party_check"] = {
                "rule": "dated-roster", "corrected": corrected, "withheld": withheld,
                "note": "Source party labels that dated records contradict for this date are replaced by the dated "
                        "party; labels the dated records leave unclear are held back."}


def fill_dated_parties(records, evidence) -> Counter:
    """Fill and check in place (used by export_division_pages.py); returns counts by outcome."""
    return Counter(o["reason"] for o in resolve_records(records, evidence, apply=True))


# ---- dry run ----------------------------------------------------------------------------------

def era(day) -> str:
    year = int(str(day or "0")[:4] or 0)
    return "2026" if year >= 2026 else "2022-2025" if year >= 2022 else "2013-2021" if year >= 2013 else "2006-2012"


def dry_run(divisions: Path, evidence) -> dict:
    records = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(divisions.glob("division-*.json"))]
    # Measure against the source labels, whatever an earlier export applied.
    clear_fills(records)
    out = Counter()
    samples = []
    for o in resolve_records(records, evidence):
        r = o["record"]
        office = "office" if o["member"].get("office") else "member"
        out[(r.get("jurisdiction"), r.get("house"), era(r.get("date")), office, o["rule"] or "-",
             o["source"] or "-", o["reason"])] += 1
        if o["reason"] in ("filled", "label-corrected", "label-withheld-conflicting") and len(samples) < 400:
            samples.append((r["slug"], r.get("date"), o["member"]["name"], o.get("source_party"), o["party"],
                            o["source"], o["rule"], o["reason"]))
    return {"rows": out, "samples": samples}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", required=True)
    ap.add_argument("--divisions", type=Path, default=ROOT / "portal/public/divisions")
    ap.add_argument("--db", type=Path)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    db = sqlite3.connect(f"file:{args.db.resolve()}?mode=ro", uri=True) if args.db else None
    evidence = load_evidence(ROOT, db)
    result = dry_run(args.divisions, evidence)
    rows = result["rows"]
    if args.json:
        print(json.dumps({"rows": [[*k, v] for k, v in sorted(rows.items())], "samples": result["samples"]}))
        return
    print("jurisdiction,chamber,era,row,rule,source,outcome,rows")
    for key, n in sorted(rows.items()):
        print(",".join(map(str, key)) + f",{n}")
    total = Counter()
    for key, n in rows.items():
        total[key[-1]] += n
    print("outcomes " + ", ".join(f"{k} {n}" for k, n in sorted(total.items())))


if __name__ == "__main__":
    main()
