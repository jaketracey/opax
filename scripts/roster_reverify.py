#!/usr/bin/env python3
"""Re-verify the current federal members and senators against OpenAustralia's public member files. Read-only.

The shipped roster (portal/public/parliamentarians.json) and the federal seat roster in the electorate release
(portal/public/electorates/) say who sits now, where, and for which party. This compares both with the members
OpenAustralia's files list as still in office, and prints what differs. It changes nothing: a real difference goes
into scripts/roster_accept.json as a reviewed group (read scripts/roster_accept.py), never into the roster by hand.

The source files are fetched by hand, politely, and kept outside the repo (docs/roster-reverify-2026-11-16.md has
the commands): people.xml, representatives.xml and senators.xml from https://data.openaustralia.org.au/members/.
This script makes no network request.

  python3 scripts/roster_reverify.py --source ~/opax-work/roster-cache/oa [--json out.json]

Who is compared:
  - the roster's current federal people: `current`, federal among `states`, and no dated federal service that
    has ended (a sitting state member who once sat federally keeps `current` for the state seat). A row with no
    federal house in `representation` is compared too, and shows as a missing house and seat;
  - the seat roster's current federal seats (the electorate release's people file, `current` seats).
People are matched on the OpenAustralia person id (the roster's `pid`, the seat roster's `legacy_person_id`), never
on name alone; a person found only by name is listed apart, as unverified.

What the source cannot say: the state of a House seat (its files name the division only), and anything after its
own last change. Its party is the party room for Queensland LNP members and an office string (SPK, PRES, DPRES)
for presiding officers; those are listed as label differences, not as changes.
"""
import argparse
import glob
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://data.openaustralia.org.au/members/"
FILES = ("people.xml", "representatives.xml", "senators.xml")
IN_OFFICE = "9999-12-31"
HOUSES = ("representatives", "senate")
# OpenAustralia's party names as the roster writes them; anything else is kept as given.
PARTY = {"Australian Labor Party": "Labor", "Liberal Party": "Liberal", "National Party": "Nationals",
         "Liberal National Party": "LNP", "Australian Greens": "Greens", "Pauline Hanson's One Nation Party": "One Nation"}
# The same party under two labels inside OPAX.
SAME_PARTY = {"JLN": "Jacqui Lambie Network"}
OFFICES = {"SPK", "PRES", "DPRES", "CWM"}
PARTY_ROOMS = {"Liberal", "Nationals", "LNP"}
STATES = {"NSW": "New South Wales", "Victoria": "Victoria", "Queensland": "Queensland", "WA": "Western Australia",
          "SA": "South Australia", "Tasmania": "Tasmania", "ACT": "Australian Capital Territory", "NT": "Northern Territory"}
STATE_CODES = {"New South Wales": "NSW", "Victoria": "VIC", "Queensland": "QLD", "Western Australia": "WA",
               "South Australia": "SA", "Tasmania": "TAS", "Australian Capital Territory": "ACT", "Northern Territory": "NT"}


def read_source(folder):
    """({pid: member in office}, facts about the files) from a folder holding FILES."""
    folder = Path(folder)
    person = {}
    for p in ET.parse(folder / "people.xml").getroot():
        pid = p.get("id").rsplit("/", 1)[1]
        for office in p:
            person[office.get("id")] = (pid, p.get("latestname"))
    current, changes, orphans = {}, [], []
    for name in FILES[1:]:
        for m in ET.parse(folder / name).getroot():
            row = m.attrib
            changes.append(row["fromdate"])
            if row["todate"] != IN_OFFICE:
                changes.append(row["todate"])
                continue
            if row["id"] not in person:
                orphans.append(f'{row["firstname"]} {row["lastname"]}')
                continue
            pid, latest = person[row["id"]]
            senate = row["house"] == "senate"
            current.setdefault(pid, []).append({
                "pid": pid, "name": latest, "house": row["house"], "since": row["fromdate"],
                "seat": STATES.get(row["division"], row["division"]) if senate else row["division"],
                "party": PARTY.get(row["party"], row["party"])})
    doubled = sorted(pid for pid, rows in current.items() if len(rows) > 1)
    facts = {"files": {n: hashlib.sha256((folder / n).read_bytes()).hexdigest() for n in FILES},
             "last_change": max(changes), "in_office": len(current),
             "houses": {h: sum(1 for rows in current.values() if rows[0]["house"] == h) for h in HOUSES},
             "without_person": orphans, "two_seats": doubled}
    return {pid: rows[0] for pid, rows in current.items()}, facts


def federal_now(row):
    """The federal house seats of a roster row that sits federally now ([] when it records none), else None:
    `current`, federal among its states, and no dated federal service that has ended."""
    if not row.get("current") or "federal" not in (row.get("states") or []):
        return None
    dated = [a for a in row.get("affiliations") or [] if a.get("jurisdiction") == "federal"]
    if dated and all(a.get("end") for a in dated):
        return None
    return [r for r in row.get("representation") or [] if r.get("jurisdiction") == "federal" and r.get("chamber") in HOUSES]


def read_roster(root=ROOT):
    """[(row, federal seats)] for the shipped roster's current federal people."""
    people = json.loads((Path(root) / "portal/public/parliamentarians.json").read_text(encoding="utf-8"))["people"]
    return [(p, federal_now(p)) for p in people if federal_now(p) is not None]


def read_seats(root=ROOT):
    """({id: seat}, roster dates) for the electorate release's current federal seats."""
    public = Path(root) / "portal/public"
    manifest = json.loads((public / "electorates/manifest.json").read_text(encoding="utf-8"))
    people = json.loads((public / manifest["people_url"].split("?")[0].lstrip("/")).read_text(encoding="utf-8"))["people"]
    seats = {}
    for p in people:
        for e in p.get("electorates") or []:
            if e.get("current") and e.get("jurisdiction") == "federal":
                seats[p.get("legacy_person_id") or p["person_id"]] = {
                    "name": p["name"], "house": e["chamber"], "seat": e["name"], "party": e.get("party"), "as_of": e.get("as_of")}
    return seats, manifest["coverage"]["jurisdictions"]["federal"].get("roster_dates", [])


def fold(name):
    return " ".join(name.lower().replace("’", "'").split())


def party_note(ours, theirs):
    """Why two party labels differ without a change of party, or None when it would be one."""
    if theirs in OFFICES:
        return "the source records the presiding office, not a party"
    if ours in PARTY_ROOMS and theirs in PARTY_ROOMS and "LNP" in (ours, theirs):
        return "Queensland LNP: one side records the party, the other the party room"
    return None


def compare(ours, source, label):
    """The three lists for one OPAX list `ours` ({id: {name, house, seat, party, state?}}) against `source`."""
    names = {}
    for pid, s in source.items():
        names.setdefault(fold(s["name"]), []).append(pid)
    by_id = sorted(ours.keys() & source.keys())
    only_ours, name_only = [], []
    for key in sorted(ours.keys() - source.keys()):
        hits = [pid for pid in names.get(fold(ours[key]["name"]), []) if pid not in ours]
        (name_only if len(hits) == 1 else only_ours).append({"id": key, **ours[key], **({"source_id": hits[0]} if len(hits) == 1 else {})})
    taken = {n["source_id"] for n in name_only}
    only_source = [source[pid] for pid in sorted(source.keys() - ours.keys() - taken)]
    differs, labels = [], []
    for pid in by_id:
        a, b = ours[pid], source[pid]
        for field in ("house", "seat"):
            if a[field] != b[field]:
                differs.append({"id": pid, "name": a["name"], "field": field, "opax": a[field], "source": b[field]})
        if a.get("state") and b["house"] == "senate" and a["state"] != STATE_CODES.get(b["seat"]):
            differs.append({"id": pid, "name": a["name"], "field": "state", "opax": a["state"], "source": STATE_CODES.get(b["seat"])})
        mine = SAME_PARTY.get(a["party"], a["party"])
        if mine != b["party"]:
            why = party_note(mine, b["party"])
            (labels if why else differs).append({"id": pid, "name": a["name"], "field": "party", "opax": a["party"],
                                                 "source": b["party"], **({"why": why} if why else {})})
    return {"list": label, "people": len(ours), "matched_by_id": len(by_id), "name_only": name_only,
            "opax_not_in_source": only_ours, "source_not_in_opax": only_source, "differs": differs, "party_labels": labels}


def roster_list(rows):
    """{pid or name: comparable row} for read_roster()'s rows (a row may list more than one federal seat)."""
    out = {}
    for row, seats in rows:
        seat = ({} if not seats else seats[0] if len(seats) == 1 else
                next((s for s in seats if s["chamber"] in row["chambers"][:1]), seats[0]))
        state = str(seat.get("state") or "").upper()
        out[row.get("pid") or row["name"]] = {
            "name": row.get("full") or row["name"], "house": seat.get("chamber"), "seat": seat.get("electorate"),
            "state": STATE_CODES.get(state.title(), state) or None, "party": row.get("party_now") or row.get("party")}
    return out


def divisions_since(day, seats, root=ROOT):
    """What OPAX's own federal divisions from `day` on show: voters outside the seat roster, and seats with no vote."""
    last, voters, latest = {}, set(), {}
    for path in glob.glob(str(Path(root) / "portal/public/divisions/division-federal-*.json")):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        if d.get("house") not in HOUSES or not d.get("date"):
            continue
        for m in d.get("members") or []:
            key = str(m.get("person_id") or "").replace("tvfy_", "") or m.get("name")
            if d["date"] > last.get(key, ("",))[0]:
                last[key] = (d["date"], d["house"], m.get("name"))
            if d["date"] >= day:
                voters.add(key)
        if d["date"] >= day:
            latest[d["house"]] = max(latest.get(d["house"], ""), d["date"])
    return {"from": day, "latest": latest,
            "voters_not_in_seat_roster": sorted([key, *last[key]] for key in voters - seats.keys()),
            "seats_without_a_vote": sorted([key, seats[key]["name"], seats[key]["house"], last.get(key, (None,))[0]]
                                           for key in seats.keys() - voters)}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, required=True, help="folder holding the OpenAustralia files")
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--json", type=Path, help="also write the full result here")
    a = ap.parse_args(argv)
    source, facts = read_source(a.source)
    seats, dates = read_seats(a.root)
    result = {"source": {"url": SOURCE_URL, **facts}, "seat_roster_dates": dates,
              "roster": compare(roster_list(read_roster(a.root)), source, "parliamentarians.json, current federal"),
              "seats": compare(seats, source, "electorate release, current federal seats"),
              "divisions": divisions_since(min(dates) if dates else facts["last_change"], seats, a.root)}
    if a.json:
        a.json.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f'source: {facts["in_office"]} in office ({facts["houses"]}), last change {facts["last_change"]}')
    for key in ("roster", "seats"):
        r = result[key]
        print(f'{r["list"]}: {r["people"]} people, {r["matched_by_id"]} matched by id, {len(r["name_only"])} by name only; '
              f'(a) OPAX not in source {len(r["opax_not_in_source"])}, (b) source not in OPAX {len(r["source_not_in_opax"])}, '
              f'(c) differs {len(r["differs"])}, party labels {len(r["party_labels"])}')
        for kind in ("name_only", "opax_not_in_source", "source_not_in_opax", "differs", "party_labels"):
            for item in r[kind]:
                print(f"  {kind}\t" + json.dumps(item, ensure_ascii=False))
    d = result["divisions"]
    print(f'divisions from {d["from"]} to {d["latest"]}: {len(d["voters_not_in_seat_roster"])} voter(s) outside the seat roster, '
          f'{len(d["seats_without_a_vote"])} seat(s) without a vote')
    for kind in ("voters_not_in_seat_roster", "seats_without_a_vote"):
        for item in d[kind]:
            print(f"  {kind}\t" + json.dumps(item, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
