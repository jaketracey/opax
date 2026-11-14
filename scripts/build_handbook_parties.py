#!/usr/bin/env python3
"""Dated Senate party records from the Parliamentary Handbook API (backlog A9).

TheyVoteForYou's federal Senate division rows give each senator's latest party on
every date (Cory Bernardi as Australian Conservatives in 2007). The Handbook's
records of service hold every parliamentarian's party periods with dates
(recordsofservice, ROSTypeID 11: Value1 the party, DateStart1 and DateEnd1, an
end of 1900-01-01 meaning the period is open). This script fetches them once,
caches the raw responses, and writes the reviewed evidence file the division
export reads (scripts/vote_parties.py, source "handbook-term"):

    scripts/handbook_party_service.json

Fetching: the Handbook API only (never www.aph.gov.au or ParlInfo), with the
shared honest user agent (parli.ingest.http), at most one request a second, one
attempt per request. A refusal, a rate limit or a challenge stops the run with
nothing written (parli.ingest.http.SourceRefused): it is reported, not retried.

    python3 scripts/build_handbook_parties.py --db ~/.cache/autoresearch/parli.db
    python3 scripts/build_handbook_parties.py --db ... --refresh   # fetch again

Who is kept: everyone the Handbook lists as a senator whose service reaches 2006
or later (the division record starts in 2006). Each person is matched to an
OPAX person id by parli.ingest.handbook.match_person (same chamber, surname and
first name, narrowed by state); an unmatched person keeps their names only and
is matched on the division row by exact full name.

Periods: a record with neither date (the Handbook gives most people one undated
party, and it is not kept up to date: Fatima Payman's still reads Labor) is left
out, so those rows keep the source label. A record with an end but no start is
the person's first party and runs from the start of their service
(ServiceHistory_Start: Jacqui Lambie's Palmer United period). An open period runs
to the end of the person's service, or to the fetch date while they still sit.
A record that names no party is left out. The parties of records with neither date
are kept in `undated`: they date nothing, but one that differs from a row's source
label shows the senator changed party on a date the Handbook does not give
(vote_parties keeps that row's label and marks it party_undated). Party names stay as the Handbook spells them in
`handbook_party`; `party` is the label the division pages use (PARTY_NAMES).
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest import http as source_http  # noqa: E402
from parli.ingest import handbook  # noqa: E402

HANDBOOK = "https://handbookapi.aph.gov.au/api/"   # as scripts/build_pay.py
PAGE = 100                                          # the API refuses $top above 100
INTERVAL = 1.1                                      # seconds between requests: under one a second
CACHE = Path.home() / ".cache" / "autoresearch" / "handbook"
OUT = ROOT / "scripts" / "handbook_party_service.json"
PARTY_TYPE = 11                                     # recordsofservice: parliamentary party
FIRST_YEAR = "2006-01-01"
UNDATED = "1900-01-01"

# Handbook party names, as the division pages label them. A name not listed is
# kept as the Handbook spells it (and reported by --check).
PARTY_NAMES = {
    "Australian Labor Party": "Labor",
    "Liberal Party of Australia": "Liberal",
    "National Party of Australia": "Nationals",
    "The Nationals": "Nationals",
    "Australian Greens": "Greens",
    "Liberal National Party of Queensland": "LNP",
    "Country Liberal Party": "Country Liberal Party",
    "Independent": "Independent",
    "Pauline Hanson's One Nation": "One Nation",
    "Pauline Hanson's One Nation Party": "One Nation",
    "One Nation": "One Nation",
    "Australian Democrats": "Australian Democrats",
    "Family First Party": "Family First",
    "Family First": "Family First",
    "Nick Xenophon Team": "Nick Xenophon Team",
    "Centre Alliance": "Centre Alliance",
    "Palmer United Party": "Palmer United Party",
    "United Australia Party": "United Australia Party",
    "United Australia Party [2018]": "United Australia Party",
    "Jacqui Lambie Network": "Jacqui Lambie Network",
    "Australian Conservatives": "Australian Conservatives",
    "Democratic Labor Party": "Democratic Labor Party",
    "Democratic Labour Party": "Democratic Labor Party",
    "Liberal Democratic Party": "Liberal Democratic Party",
    "Liberal Democrats": "Liberal Democratic Party",
    "Australian Motoring Enthusiast Party": "Australian Motoring Enthusiast Party",
    "Derryn Hinch's Justice Party": "Derryn Hinch's Justice Party",
    "Australia's Voice": "Australia's Voice",
}


# ---- fetching ---------------------------------------------------------------------------------

_last = [0.0]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        fp.close()
        source_http.refuse_unchecked_redirect(newurl)


_opener = urllib.request.build_opener(_NoRedirect())


def get_json(path: str, query: dict) -> dict:
    """One paced attempt. Refusal, rate limit, challenge or redirect: SourceRefused (stop)."""
    url = HANDBOOK + path + "?" + urllib.parse.urlencode(query, quote_via=urllib.parse.quote)
    source_http.ensure_allowed(url)
    wait = _last[0] + INTERVAL - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.monotonic()
    req = source_http.Request(url, headers={"Accept": "application/json"})
    try:
        with _opener.open(req, timeout=90) as res:
            body = res.read()
            source_http.check_response(res.geturl(), res.getcode(), body, res.headers, expected_json=True)
    except urllib.error.HTTPError as err:
        source_http.check_response(url, err.code, err.read(), err.headers)
        if err.code in (429, 503):
            raise source_http.SourceRefused(url, f"HTTP {err.code}; rate limited, not retried") from None
        raise
    return json.loads(body)


def fetch(cache: Path = CACHE, refresh: bool = False, say=print) -> dict:
    """The raw Handbook responses: from the cache, else fetched once and cached."""
    path = cache / "party_records.json"
    if path.is_file() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))
    raw = {"fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"), "source": HANDBOOK}
    raw["individuals"] = get_json("individuals", {"$select": handbook.FIELDS})["value"]
    say(f"  individuals: {len(raw['individuals'])}")
    rows, skip = [], 0
    while True:
        page = get_json("recordsofservice", {"$filter": f"ROSTypeID eq {PARTY_TYPE}", "$top": PAGE,
                                             "$skip": skip, "$orderby": "PHID,OBY"})["value"]
        rows += page
        if len(page) < PAGE:
            break
        skip += PAGE
    raw["party_records"] = rows
    say(f"  party records: {len(rows)}")
    cache.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)
    return raw


# ---- distilling -------------------------------------------------------------------------------

def day(value) -> str | None:
    value = str(value or "")[:10]
    return None if not value or value == UNDATED else value


def names_of(ind: dict, member: dict | None) -> list[str]:
    family = " ".join(w.capitalize() if w.isupper() else w for w in str(ind.get("FamilyName") or "").split())
    family = "-".join(p[:1].upper() + p[1:] for p in family.split("-")) if family.isupper() else family
    given = str(ind.get("GivenName") or "").split(" ")[0].strip()
    preferred = str(ind.get("PreferredName") or "").strip("() ")
    out = [f"{n} {family}" for n in (preferred, given) if n and family]
    if member and member.get("full_name"):
        out.insert(0, member["full_name"])
    seen, kept = set(), []
    for n in out:
        if n.casefold() not in seen:
            seen.add(n.casefold())
            kept.append(n)
    return kept


def service_metadata(ind: dict, fetched: str) -> dict:
    """Current-person ServiceHistory_End is a synthesised observation cutoff.

    The cached API gives the fetch day even for people still in Parliament.
    Keep that day out of the service-end field, including on future rebuilds.
    InCurrentParliament describes the person, not necessarily their Senate seat.
    """
    current = str(ind.get("InCurrentParliament")).lower() == "true"
    if current:
        return {"service_end": None, "observed_through": fetched,
                "service_end_basis": "open-current-person; synthesised cutoff is observation only"}
    return {"service_end": day(ind.get("ServiceHistory_End"))}


def build(raw: dict, members: list[dict]) -> dict:
    fetched = str(raw["fetched"])[:10]
    by_phid: dict[str, list[dict]] = {}
    for row in raw["party_records"]:
        by_phid.setdefault(str(row["PHID"]), []).append(row)
    member_by_pid = {m["person_id"]: m for m in members}
    people, unmatched, unlabelled = [], [], set()
    for ind in raw["individuals"]:
        if "senate" not in handbook._chambers(ind):
            continue
        end = day(ind.get("ServiceHistory_End"))
        current = str(ind.get("InCurrentParliament")).lower() == "true"
        if not current and (not end or end < FIRST_YEAR):
            continue
        pid, basis = handbook.match_person(ind, members)
        if not pid:
            unmatched.append(f"{ind.get('DisplayName')} ({ind['PHID']}): {basis}")
        periods, undated = [], []
        for row in sorted(by_phid.get(str(ind["PHID"]), []), key=lambda r: (str(r.get("DateStart1")), r.get("OBY") or 0)):
            start, stop = day(row.get("DateStart1")), day(row.get("DateEnd1"))
            if not start and stop:
                start = day(ind.get("ServiceHistory_Start"))
            name = str(row.get("Value1") or "").strip()
            if name and not start and not stop:
                undated.append(PARTY_NAMES.get(name, name))
            if not start or not name:
                continue
            label = PARTY_NAMES.get(name)
            if not label:
                unlabelled.add(name)
                label = name
            periods.append({"party": label, "handbook_party": name, "start": start, "end": stop,
                            "through": None if stop else (fetched if current else end)})
        people.append({"phid": str(ind["PHID"]), "pid": pid, "match": basis if pid else None,
                       "name": names_of(ind, member_by_pid.get(pid))[0] if names_of(ind, member_by_pid.get(pid)) else ind.get("DisplayName"),
                       "names": names_of(ind, member_by_pid.get(pid)), "current": current,
                       **service_metadata(ind, fetched), "periods": periods, "undated": sorted(set(undated))})
    people.sort(key=lambda p: (p["name"], p["phid"]))
    return {"source": "Parliamentary Handbook API, records of service (ROSTypeID 11, parliamentary party)",
            "url": HANDBOOK + f"recordsofservice?$filter=ROSTypeID eq {PARTY_TYPE}",
            "fetched": fetched,
            "chamber": "senate",
            "from": FIRST_YEAR,
            "note": ("Party periods for every senator whose service reaches 2006 or later. `from` to `fetched` is the dated range: Senate divisions inside it are checked against these records. A period runs from start "
                     "to the day before end; an open period runs to `through` (the end of service, or the fetch "
                     "date while the senator still sits). A record with neither date gives no period (its party is listed in `undated`); one with only an end runs from the start of service. Built by "
                     "scripts/build_handbook_parties.py; read by scripts/vote_parties.py. Current-person "
                     "ServiceHistory_End cutoffs are synthesised observations: service_end is null and "
                     "observed_through holds the fetch day. Current means the person is in Parliament, "
                     "not necessarily still in the Senate."),
            "people": people}, unmatched, sorted(unlabelled)


def dump(doc: dict) -> str:
    """One person per line, so a review diff reads person by person."""
    head = {k: v for k, v in doc.items() if k != "people"}
    text = json.dumps(head, ensure_ascii=False, indent=2)[:-2].rstrip() + ',\n  "people": [\n'
    text += ",\n".join("    " + json.dumps(p, ensure_ascii=False, sort_keys=True) for p in doc["people"])
    return text + "\n  ]\n}\n"


def federal_members(db_path: Path) -> list[dict]:
    with sqlite3.connect(f"file:{db_path.resolve()}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        return [dict(r) for r in db.execute(
            "SELECT person_id, first_name, last_name, full_name, chamber, electorate FROM members "
            "WHERE state = 'federal' ORDER BY person_id")]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", type=Path, required=True, help="parli.db, for the OPAX person ids (read only)")
    ap.add_argument("--refresh", action="store_true", help="fetch the Handbook again instead of using the cache")
    ap.add_argument("--cache", type=Path, default=CACHE)
    ap.add_argument("--out", type=Path, default=OUT)
    a = ap.parse_args(argv)
    raw = fetch(a.cache, a.refresh)
    doc, unmatched, unlabelled = build(raw, federal_members(a.db))
    a.out.write_text(dump(doc), encoding="utf-8")
    dated = sum(bool(p["periods"]) for p in doc["people"])
    print(f"{len(doc['people'])} senators, {dated} with dated party periods, "
          f"{sum(len(p['periods']) for p in doc['people'])} periods; {len(unmatched)} without an OPAX person id")
    for line in unmatched:
        print(f"  unmatched: {line}")
    for name in unlabelled:
        print(f"  party name kept as the Handbook spells it: {name}")


if __name__ == "__main__":
    main()
