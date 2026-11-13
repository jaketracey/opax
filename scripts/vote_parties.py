#!/usr/bin/env python3
"""Dated parties for division vote rows whose source gives none (portal audit F08).

State Hansards (NSW, Victoria) list division members without parties, and TVFY
leaves some federal rows without one. A row gets a party here only from dated
evidence the repo or the database already holds, and only for its own date:

  release-term     the electorate release's term party periods (federal House,
                   OpenAustralia service records): start <= date < end, or an
                   open period up to the release's observed_through date.
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

NAMESAKE_DAYS = 1461  # how near a dated list must be for its member to count as a possible namesake
ELECTIONS = ROOT / "scripts/general_elections.json"
RULES = ("pid", "full-name", "surname")
SOURCES = ("release-term", "release-roster", "official-list", "service", "wikidata-term", "bracket")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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
    """Dated observations, plus the general elections that bound them."""
    def __init__(self, items=(), elections=None):
        super().__init__(items)
        self.elections = load_elections() if elections is None else elections


def load_evidence(root: Path = ROOT, db: sqlite3.Connection | None = None, public: Path | None = None) -> Evidence:
    """Every source is optional: a missing or unreadable one is logged and gives
    nothing, so the division export never fails for want of evidence."""
    public = public or root / "portal/public"
    out = []
    for name, load in (("electorate release", lambda: release_evidence(public)),
                       ("official lists", lambda: official_evidence(root)),
                       ("service records", lambda: service_evidence(root)),
                       ("Wikidata terms", lambda: wikidata_evidence(db))):
        try:
            out.extend(load())
        except (OSError, ValueError, KeyError, TypeError, AttributeError, ImportError, sqlite3.Error) as e:
            log(f"{name} skipped ({type(e).__name__}: {e}); no party is filled from it")
    return Evidence(out, load_elections(root / "scripts/general_elections.json"))


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
        ids = {e["ident"]} if e["ident"][0] in ("wikidata", "release") else set()
        joined = [g for g in groups if g[0] & e["names"]]
        names, idents = set(e["names"]), set(ids)
        for g in joined:
            names |= g[0]
            idents |= g[1]
            groups.remove(g)
        groups.append((names, idents))
    out = []
    for names, idents in groups:
        # One name shared by two Wikidata people (or two release people) is two people.
        for scheme in ("wikidata", "release"):
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
        for e in evidence:
            self.by_chamber[e["chamber"]].append(e)

    def match(self, chamber: str, day: str, name: str, pid, voters: set[str]):
        """(rule, entries) for one sitting identity, or (reason, None)."""
        pool = self.by_chamber.get(chamber, [])
        key = fold(name)
        canonical = rules.canonical_person_id(pid)
        bare = canonical[5:] if canonical and canonical.startswith("tvfy_") else canonical
        if bare:
            hits = [e for e in pool if bare in e["pids"] or canonical in e["pids"]]
            if hits:
                return self._one(hits, day, "pid")
        if len(key.split()) >= 2 and not re.search(r"\b[a-z]\.", key):
            hits = [e for e in pool if key in e["names"]]
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

    @staticmethod
    def _one(hits, day, rule):
        # Two distinct people in one identity scheme, both able to sit that day: ambiguous.
        for scheme in ("wikidata", "release"):
            if len({e["ident"] for e in hits if e["ident"][0] == scheme and may_sit(e, day)}) > 1:
                return "ambiguous-identity", None
        return rule, hits

    def party_on(self, hits: list[dict], day: str):
        """(party, source, url) or (None, reason, None)."""
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
            if len(parties) == 1 and same_parliament(self.elections, chamber, lo[0]["start"], hi[0]["start"]):
                found.append((parties.pop(), "bracket", hi[0]["url"]))
            elif len(parties) > 1:
                return None, "conflicting", None
        if not found:
            if unconfirmed:
                return None, "wikidata-unconfirmed", None
            ended = any(e["party"] and e["start"] and e["start"] <= day for e in hits)
            return None, "evidence-ends-before-date" if ended else "no-dated-party", None
        parties = {p for p, _, _ in found}
        # A dated list inside a contributing term must agree with it.
        for e in hits:
            if e["point"] and e["party"] and e["party"] not in parties and any(
                    not h["point"] and h["party"] and covers(h, e["start"]) for h in hits if covers(h, day)):
                return None, "conflicting", None
        if len(parties) != 1:
            return None, "conflicting", None
        order = {s: i for i, s in enumerate(SOURCES)}
        party, source, url = min(found, key=lambda f: order[f[1]])
        return party, source, url


def voters_by_day(records) -> dict:
    out = defaultdict(set)
    for record in records:
        for member in record.get("members", []):
            out[(record.get("house"), record.get("date"))].add(fold(member.get("name")))
    return out


def clear_fills(records) -> None:
    """Remove every party this module set (marked by party_source); source parties stay."""
    for record in records:
        record.get("_meta", {}).pop("party_fill", None)
        for member in record.get("members", []):
            if member.pop("party_source", None):
                member.pop("party", None)


def resolve_records(records, evidence, apply=False):
    """Yield one outcome per row without a party; set it on the row when `apply`."""
    resolver = Resolver(evidence)
    records = list(records)
    if apply:
        # Recomputed every run: a previous fill never outlives its evidence.
        clear_fills(records)
    voters = voters_by_day(records)
    for record in records:
        day, house = iso(record.get("date")), record.get("house")
        filled = 0
        for member in record.get("members", []):
            if member.get("party") or not str(member.get("name") or "").strip():
                continue
            outcome = {"record": record, "member": member, "rule": None, "source": None, "party": None}
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
        if apply and filled:
            record.setdefault("_meta", {})["party_fill"] = {
                "rule": "dated-roster", "filled": filled,
                "note": "Rows without a party in the division source take the party a dated roster records for that date."}


def fill_dated_parties(records, evidence) -> Counter:
    """Apply in place (used by export_division_pages.py); returns counts by outcome."""
    return Counter(o["reason"] for o in resolve_records(records, evidence, apply=True))


# ---- dry run ----------------------------------------------------------------------------------

def era(day) -> str:
    year = int(str(day or "0")[:4] or 0)
    return "2026" if year >= 2026 else "2022-2025" if year >= 2022 else "2013-2021" if year >= 2013 else "2006-2012"


def dry_run(divisions: Path, evidence) -> dict:
    records = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(divisions.glob("division-*.json"))]
    out = Counter()
    samples = []
    for o in resolve_records(records, evidence):
        r = o["record"]
        office = "office" if o["member"].get("office") else "member"
        out[(r.get("jurisdiction"), r.get("house"), era(r.get("date")), office, o["rule"] or "-",
             o["source"] or "-", o["reason"])] += 1
        if o["party"] and len(samples) < 400:
            samples.append((r["slug"], o["member"]["name"], o["party"], o["source"], o["rule"]))
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
    print(f"total {sum(rows.values())}, filled {sum(n for k, n in rows.items() if k[-1] == 'filled')}")


if __name__ == "__main__":
    main()
