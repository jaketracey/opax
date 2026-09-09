"""Build a reproducible electorate reference bundle from cached public sources.

python -m parli.ingest.electorates --cache .cache/electorates --legacy snapshot.json --out bundle.json
Optional GIS dependencies: pip install 'opax[electorates]'. No legacy table is written.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import time
import zipfile
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests

from parli.electorates import SCHEMA_VERSION, TABLES, canonical_json, fold, stable_id, validate

STATES = {"1": "nsw", "2": "vic", "3": "qld", "4": "sa", "5": "wa", "6": "tas", "7": "nt", "8": "act"}
CHAMBERS = {"nsw": "nsw_la", "vic": "vic_la", "qld": "qld_la", "sa": "sa_ha", "wa": "wa_la", "tas": "tas_ha", "nt": "nt_la", "act": "act_la"}
EVENTS = [("24310", "2019-05-18"), ("27966", "2022-05-21"), ("31496", "2025-05-03")]
BY_ELECTIONS = [("25820", "2020-07-04"), ("25881", "2020-11-28"), ("28791", "2023-04-01"),
                ("29422", "2023-07-15"), ("29778", "2024-03-02"), ("29807", "2024-04-13"), ("31633", "2026-05-09")]


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def party(value):
    return {"ALP": "Labor", "Australian Labor Party": "Labor", "LIB": "Liberal", "LP": "Liberal",
            "NPA": "Nationals", "NP": "Nationals", "The Nationals": "Nationals", "IND": "Independent",
            "GRN": "Greens", "Australian Greens": "Greens", "PHON": "One Nation", "LNP": "LNP",
            "KAP": "Katter's Australian Party", "Liberal Party": "Liberal", "The Australian Greens - Victoria": "Greens", "The Greens": "Greens"}.get(value, value or "Unknown")


def csv_rows(raw: bytes, header: str) -> list[dict]:
    lines = raw.decode("utf-8-sig").splitlines()
    start = next((i for i, line in enumerate(lines) if line.startswith(header)), None)
    if start is None:
        raise ValueError(f"Missing CSV header {header}")
    return list(csv.DictReader(lines[start:]))


class Builder:
    def __init__(self, cache: Path, as_of: str, *, refresh=False):
        self.cache = cache
        self.cache.mkdir(parents=True, exist_ok=True)
        self.as_of = as_of
        self.refresh = refresh
        self.rows = {name: {} for name in TABLES}
        self.coverage = {"notes": ["Federal results: 2019, 2022, 2025 and indexed intervening by-elections.",
                                   "State election results require separate imports; empty timelines mean missing coverage.",
                                   "State boundaries are ABS statistical approximations. They are not address-allocation boundaries.",
                                   "Historical service is sourced independently of current-roster observations."]}

    def put(self, table, row):
        self.rows[table][row[TABLES[table][0]]] = row
        return row[TABLES[table][0]]

    def fetch(self, url, label, *, licence="See source terms"):
        sid = stable_id("source", url)
        path = self.cache / sid
        if self.refresh or not path.exists():
            response = requests.get(url, timeout=90, headers={"User-Agent": "Mozilla/5.0 (compatible; OPAX/1.0; +https://opax.com.au)"})
            response.raise_for_status()
            path.write_bytes(response.content)
            time.sleep(.15)
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        archive = self.cache / "raw" / digest
        archive.parent.mkdir(exist_ok=True)
        if not archive.exists():
            archive.write_bytes(raw)
        self.put("sources", {"source_id": sid, "label": label, "url": url, "licence": licence,
                             "fetched_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(timespec="seconds"),
                             "sha256": hashlib.sha256(raw).hexdigest()})
        return raw, sid

    def electorate(self, source, key, name, jurisdiction, chamber, state, sid, *, vintage=None, capacity=1, status="current"):
        keys = [k for k in self.rows["keys"].values() if k["source"] == source and k["source_key"] == str(key) and k.get("vintage") == vintage]
        if keys:
            return keys[0]["electorate_id"]
        # Reviewed legal continuity: AEC retained Corangamite in 2021 but
        # changed its results-system DivisionID from 207 to 328.
        if source == "aec_division" and str(key) == "328":
            prior = [k for k in self.rows["keys"].values() if k["source"] == source and k["source_key"] == "207"]
            if prior:
                _, evidence = self.fetch("https://www.aec.gov.au/media/2021/06-28.htm", "AEC retained Corangamite at the 2021 redistribution")
                self.key(prior[0]["electorate_id"], source, key, evidence)
                return prior[0]["electorate_id"]
        eid = stable_id("el", f"{jurisdiction}:{chamber}:{source}:{vintage or ''}:{key}")
        self.put("electorates", {"electorate_id": eid, "slug": slug(f"{jurisdiction}-{chamber}-{state}-{name}"),
                                "name": name, "jurisdiction": jurisdiction, "chamber": chamber, "state_code": state,
                                "kind": "multi_member" if capacity > 1 else "district", "status": status,
                                "capacity": capacity, "established": None, "abolished": None, "sources": [sid]})
        self.key(eid, source, key, sid, vintage=vintage)
        return eid

    def key(self, eid, source, key, sid, *, vintage=None, boundary=None):
        if boundary:
            for kid, existing in list(self.rows["keys"].items()):
                if existing["electorate_id"] == eid and existing["source"] == source and existing["source_key"] == str(key) and existing.get("vintage") == vintage and not existing.get("boundary_version_id"):
                    del self.rows["keys"][kid]
        self.put("keys", {"key_id": stable_id("key", f"{source}:{vintage}:{key}:{eid}"),
                          "source": source, "source_key": str(key), "vintage": vintage, "electorate_id": eid,
                          "boundary_version_id": boundary, "sources": [sid]})

    def by_name(self, name, jurisdiction, state=None, chamber=None):
        matches = [e for e in self.rows["electorates"].values() if fold(e["name"]) == fold(name)
                   and e["jurisdiction"] == jurisdiction and (not state or e["state_code"] == state)
                   and (not chamber or e["chamber"] == chamber)]
        return matches[0]["electorate_id"] if len(matches) == 1 else None

    def aec(self):
        for event, poll in sorted(EVENTS + BY_ELECTIONS, key=lambda x: x[1]):
            if poll > self.as_of:
                continue
            base = f"https://results.aec.gov.au/{event}/Website/Downloads/"
            # General-election CSVs include all vote types. Older by-elections
            # expose full totals in HTML; polling-place CSVs omit postal votes.
            raw, sid = self.fetch(base + f"HouseCandidatesDownload-{event}.csv", f"AEC {poll} candidates")
            candidates = csv_rows(raw, "StateAb,")
            if not candidates:
                raise ValueError(f"Empty AEC event {event}")
            event_id = stable_id("election", f"aec:{event}")
            self.put("elections", {"election_id": event_id, "jurisdiction": "federal", "name": f"{poll[:4]} federal {'by-election' if (event, poll) in BY_ELECTIONS else 'election'}",
                                  "poll_date": poll, "kind": "by_election" if (event, poll) in BY_ELECTIONS else "general", "sources": [sid]})
            vote_maps = {}
            if (event, poll) in BY_ELECTIONS:
                from bs4 import BeautifulSoup
                division = candidates[0]["DivisionID"]
                raw, vsid = self.fetch(f"https://results.aec.gov.au/{event}/Website/HouseDivisionPage-{event}-{division}.htm", f"AEC {poll} final division results")
                soup = BeautifulSoup(raw, "html.parser")
                for kind, table, label in [("primary", "fp", "fpCan"), ("tcp", "tcp", "tcpCnd")]:
                    parsed = {}
                    for tr in soup.select(f"#{table} tbody tr"):
                        namecell = tr.select_one(f'[headers="{label}"]')
                        votecell = tr.select_one(f'[headers="{table}Vot"]')
                        if not namecell or not votecell:
                            continue
                        matches = [c for c in candidates if fold(c["Surname"] + " " + c["GivenNm"]) == fold(namecell.get_text(" ", strip=True))]
                        if not matches and not fold(namecell.text) and int(votecell.text.replace(",", "")) == 0:
                            continue  # Previous-election-only party row, not a candidacy.
                        if len(matches) != 1:
                            raise ValueError(f"AEC by-election candidate mismatch: {namecell.text}")
                        parsed[matches[0]["CandidateID"]] = {"TotalVotes": int(votecell.text.replace(",", "")), "BallotPosition": len(parsed) + 1}
                    if len(parsed) != (len(candidates) if kind == "primary" else 2):
                        raise ValueError(f"Incomplete {kind} results for AEC {event}")
                    vote_maps[kind] = (parsed, vsid)
            else:
                for kind, filename in [("primary", "HouseFirstPrefsByCandidateByVoteTypeDownload"), ("tcp", "HouseTcpByCandidateByVoteTypeDownload")]:
                    data, vsid = self.fetch(base + f"{filename}-{event}.csv", f"AEC {poll} {kind} votes")
                    rows = csv_rows(data, "StateAb,")
                    vote_maps[kind] = ({r["CandidateID"]: r for r in rows}, vsid)
            grouped = defaultdict(list)
            for r in candidates:
                grouped[r["DivisionID"]].append(r)
            for division, rows in grouped.items():
                r = rows[0]
                eid = self.electorate("aec_division", division, r["DivisionNm"], "federal", "representatives", r["StateAb"].lower(), sid, status="historical")
                if event == "31496":
                    self.rows["electorates"][eid]["status"] = "current"
                contest_id = stable_id("contest", f"aec:{event}:{division}:house")
                output = []
                totals = {kind: sum(int(vm[0].get(c["CandidateID"], {}).get("TotalVotes", 0)) for c in rows) for kind, vm in vote_maps.items()}
                for c in rows:
                    votes = []
                    for kind, (data, vsid) in vote_maps.items():
                        v = data.get(c["CandidateID"])
                        if v:
                            votes.append({"kind": kind, "votes": int(v["TotalVotes"]), "denominator": totals[kind], "sources": [vsid]})
                    primary = vote_maps["primary"][0].get(c["CandidateID"], {})
                    output.append({"candidate_id": f"aec-{event}-{c['CandidateID']}", "name": (c["GivenNm"] + " " + c["Surname"].title()).strip(),
                                   "party": party(c["PartyNm"]), "elected": c["Elected"] == "Y", "person_id": None,
                                   "ballot_position": int(primary.get("BallotPosition") or 0), "votes": votes})
                self.put("contests", {"contest_id": contest_id, "electorate_id": eid, "election_id": event_id,
                                      "boundary_version_id": None, "status": "final", "voting_system": "preferential",
                                      "vacancies": 1, "candidates": sorted(output, key=lambda c: c["ballot_position"]), "sources": [sid, *[v[1] for v in vote_maps.values()]]})
        print(f"AEC: {len(self.rows['contests'])} contests", flush=True)

    def geography(self):
        from shapely.geometry import shape, mapping
        for layer in ("CED", "SED"):
            url = f"https://geo.abs.gov.au/arcgis/rest/services/ASGS2025/{layer}/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&maxAllowableOffset=0.003&f=geojson"
            raw, sid = self.fetch(url, f"ABS {layer} 2025 statistical boundaries", licence="CC BY 4.0")
            data = json.loads(raw)
            if data.get("exceededTransferLimit") or "features" not in data:
                raise ValueError("Incomplete ABS geography response")
            # Tasmania's ABS SED units are intersections of lower and upper
            # house divisions. Union the component units for each constituency.
            if layer == "SED":
                from shapely.ops import unary_union
                from shapely import make_valid
                groups = defaultdict(list)
                keep = []
                for feature in data["features"]:
                    a = {k.lower(): v for k, v in feature["properties"].items()}
                    if str(a.get("state_code_2021")) == "6" and re.match(r"60[1-5]", str(a.get("sed_code_2025"))):
                        for chamber, code, title in [("tas_ha", str(a["sed_code_2025"])[:3], a["sed_name_2025"].split(" (")[0]),
                                                     ("tas_lc", "6LC" + str(a["sed_code_2025"])[3:], re.search(r"\((.+)\)", a["sed_name_2025"])[1])]:
                            groups[(chamber, code, title)].append(feature)
                    else:
                        keep.append(feature)
                for (chamber, code, title), fragments in groups.items():
                    keep.append({"properties": {"sed_code_2025": code, "sed_name_2025": title, "state_code_2021": "6", "derived_chamber": chamber,
                                                  "component_codes": [f["properties"].get("sed_code_2025") for f in fragments]},
                                 "geometry": mapping(unary_union([make_valid(shape(f["geometry"])) for f in fragments]).buffer(0))})
                data["features"] = keep
            for f in data["features"]:
                a = {k.lower(): v for k, v in f["properties"].items()}
                code, name = str(a[f"{layer.lower()}_code_2025"]), a[f"{layer.lower()}_name_2025"]
                state = STATES.get(str(a.get("state_code_2021")))
                if not state or "usual address" in name.lower() or "migratory" in name.lower():
                    continue
                region = re.search(r" \((.+)\)$", name)
                name = re.sub(r" \(.+\)$", "", name)
                if layer == "CED":
                    eid = self.by_name(name, "federal", state, "representatives")
                    if not eid:
                        raise ValueError(f"ABS/AEC crosswalk unresolved: {name}, {state}")
                else:
                    chamber = a.get("derived_chamber") or CHAMBERS[state]
                    capacity = 7 if chamber == "tas_ha" else 5 if state == "act" else 1
                    namespace = "opax_abs_sed_aggregate" if a.get("derived_chamber") else "abs_sed"
                    eid = self.electorate(namespace, code, name, state, chamber, state, sid, vintage="2025", capacity=capacity)
                bid = stable_id("boundary", f"abs:{layer}:2025:{code}")
                geom = mapping(shape(f["geometry"]).simplify(.002, preserve_topology=True)) if f.get("geometry") else None
                self.put("boundaries", {"boundary_version_id": bid, "electorate_id": eid, "vintage": "2025",
                                        "geometry_kind": "statistical", "effective_from": None, "effective_to": None,
                                        "capacity": self.rows["electorates"][eid]["capacity"], "crs": "EPSG:4326",
                                        "geometry": geom, "area_sqkm": a.get("area_albers_sqkm"), "sources": [sid],
                                        "note": "ABS statistical approximation, 2025 geography. Electoral effective dates are not established by this dataset."})
                if a.get("component_codes"):
                    self.rows["boundaries"][bid]["derivation"] = {"method": "union ABS SED intersection units", "component_codes": a["component_codes"]}
                    for component in a["component_codes"]:
                        self.key(eid, "abs_sed", component, sid, vintage="2025", boundary=bid)
                else:
                    self.key(eid, "abs_" + layer.lower(), code, sid, vintage="2025", boundary=bid)
                if region and state == "vic":
                    rid = self.electorate("vic_region", region[1], region[1], "vic", "vic_lc", "vic", sid, capacity=5)
                    self.put("relations", {"relation_id": stable_id("rel", f"{eid}:{rid}:2025"), "electorate_id": eid,
                                           "related_id": rid, "kind": "within_upper_house", "vintage": "2025", "sources": [sid]})
        self.official_federal_geometry()
        print(f"Geography: {len(self.rows['electorates'])} electorates", flush=True)

    def official_federal_geometry(self):
        import shapefile
        from shapely.geometry import shape, mapping
        raw, sid = self.fetch("https://www.aec.gov.au/Electorates/files/2025/AUS-March-2025-esri.zip", "AEC national boundaries used at the 2025 election")
        z = zipfile.ZipFile(io.BytesIO(raw))
        name = next(n[:-4] for n in z.namelist() if n.endswith(".shp"))
        reader = shapefile.Reader(**{ext: io.BytesIO(z.read(name + "." + ext)) for ext in ("shp", "shx", "dbf")})
        for row in reader.iterShapeRecords():
            a = row.record.as_dict()
            eid = self.by_name(a["Elect_div"], "federal", chamber="representatives")
            if not eid:
                raise ValueError(f"AEC geometry unmatched: {a['Elect_div']}")
            bid = stable_id("boundary", f"aec:2025:{eid}")
            geom = mapping(shape(row.shape.__geo_interface__).simplify(.002, preserve_topology=True))
            self.put("boundaries", {"boundary_version_id": bid, "electorate_id": eid, "vintage": "2025 election",
                                    "geometry_kind": "official", "effective_from": None, "effective_to": None, "applicable_election_date": "2025-05-03",
                                    "capacity": 1, "crs": "EPSG:4283", "geometry": geom, "display_simplified": True,
                                    "source_geometry_url": self.rows["sources"][sid]["url"], "area_sqkm": a["Area_SqKm"], "sources": [sid],
                                    "note": "Simplified display outline. Use the original AEC dataset for precise spatial joins. Used at the 2025 election. Legal effective dates are not inferred."})
            for c in self.rows["contests"].values():
                if c["electorate_id"] == eid and self.rows["elections"][c["election_id"]]["poll_date"] == "2025-05-03":
                    c["boundary_version_id"] = bid

    def legacy(self, path):
        data = json.loads(Path(path).read_text())
        roster_date = data.get("federal_roster_verified_as_of")
        if not roster_date:
            raise ValueError("Snapshot must declare federal_roster_verified_as_of; an open end date alone is not current membership")
        date.fromisoformat(roster_date)
        if roster_date > self.as_of:
            raise ValueError("Roster observation is later than the build date")
        sid = stable_id("source", "opax:aph-current-sweep:" + roster_date)
        self.put("sources", {"source_id": sid, "label": "OPAX federal roster reconciled against APH, " + roster_date,
                             "url": "https://www.aph.gov.au/Senators_and_Members", "fetched_at": roster_date,
                             "sha256": hashlib.sha256(canonical_json(data["members"]).encode()).hexdigest(), "licence": "See source terms"})
        current = [m for m in data["members"] if m.get("state") == "federal" and m.get("chamber") in ("representatives", "senate")
                   and not m.get("left_house") and (str(m["person_id"])[0].isdigit() or str(m["person_id"]).startswith("aph_"))]
        if len([m for m in current if m["chamber"] == "representatives"]) != 150:
            raise ValueError("Federal roster reconciliation changed; verify before export")
        identity_sid = stable_id("source", "opax:legacy-member-identities:" + self.as_of)
        self.put("sources", {"source_id": identity_sid, "label": "OPAX existing parliamentary person identifiers", "url": "https://opax.com.au/subject/person", "fetched_at": self.as_of, "sha256": hashlib.sha256(canonical_json(data["members"]).encode()).hexdigest()})
        for m in data["members"]:
            pid = stable_id("person", f"opax:{m['person_id']}")
            self.put("people", {"person_id": pid, "name": m.get("full_name") or " ".join([m.get("first_name") or "", m.get("last_name") or ""]).strip(),
                                "legacy_person_id": m["person_id"], "jurisdiction": m.get("state"), "aliases": [], "sources": [identity_sid]})
        for m in current:
            if m["chamber"] != "representatives":
                continue
            eid = self.by_name(m.get("electorate", ""), "federal", chamber="representatives")
            if not eid:
                raise ValueError(f"Current federal seat unresolved: {m.get('electorate')}")
            self.put("rosters", {"roster_id": stable_id("roster", f"aph:{roster_date}:{eid}"), "electorate_id": eid,
                                 "as_of": roster_date, "capacity": 1, "complete": True, "priority": 10,
                                 "members": [{"person_id": stable_id("person", f"opax:{m['person_id']}"), "party": m.get("party_canonical") or m.get("party")}], "sources": [sid]})
        names = {"nsw": "New South Wales", "vic": "Victoria", "qld": "Queensland", "sa": "South Australia", "wa": "Western Australia", "tas": "Tasmania", "nt": "Northern Territory", "act": "Australian Capital Territory"}
        senate = defaultdict(list)
        for m in current:
            if m["chamber"] != "senate":
                continue
            region = fold(m.get("electorate", ""))
            state = next((code for code, name in names.items() if region in (fold(code), fold(name))), None)
            if not state:
                raise ValueError(f"Unknown Senate constituency: {region}")
            senate[state].append({"person_id": stable_id("person", f"opax:{m['person_id']}"), "party": m.get("party_canonical") or m.get("party")})
        for state, members in senate.items():
            capacity = 2 if state in ("act", "nt") else 12
            if len(members) != capacity:
                raise ValueError(f"Senate roster needs review: {state}")
            eid = self.electorate("aph_senate", state, names[state], "federal", "senate", state, sid, capacity=capacity)
            self.rows["electorates"][eid]["kind"] = "statewide"
            self.put("rosters", {"roster_id": stable_id("roster", f"aph:{roster_date}:{eid}"), "electorate_id": eid,
                                 "as_of": roster_date, "capacity": capacity, "complete": True, "members": members, "sources": [sid]})
        dsid = stable_id("source", "opax:abs:2021")
        self.put("sources", {"source_id": dsid, "label": "ABS Census 2021 federal electorate profiles, OPAX import", "url": "https://www.abs.gov.au/census/find-census-data/datapacks",
                              "licence": "CC BY 4.0", "sha256": hashlib.sha256(canonical_json(data["electorate_demographics"]).encode()).hexdigest(), "fetched_at": self.as_of})
        for d in data["electorate_demographics"]:
            eid = self.by_name(d["electorate_name"], "federal", d.get("state", "").lower(), "representatives")
            if eid:
                self.put("demographics", {"profile_id": stable_id("profile", f"abs:2021:{eid}"), "electorate_id": eid, "year": 2021,
                                          "vintage": "2021 Census geography", "boundary_version_id": None,
                                          "indicators": {k: v for k, v in d.items() if k not in ("id", "electorate_name", "state", "year", "source", "created_at")},
                                          "note": "2021 Census geography; values have not been redistributed to current boundaries.", "sources": [dsid]})

    def person(self, name, source_key, sid, *, url=None, jurisdiction="federal"):
        # Exact full-name or first/last match, only when unambiguous.
        name = re.sub(r"^(Mr|Ms|Mrs|Dr|Hon)\.?\s+", "", name).strip()
        reviewed_aliases = {"Anthony Stephen Burke": "10081", "Alexander George Hawke": "10290", "Antonio Zappia": "10695", "Christopher Eyles Bowen": "10060", "Robert Carl Katter": "10352"}
        if jurisdiction == "federal" and name in reviewed_aliases:
            pid = stable_id("person", "opax:" + reviewed_aliases[name])
            if pid in self.rows["people"]:
                p = self.rows["people"][pid]
                if name not in p["aliases"]:
                    p["aliases"].append(name)
                if sid not in p["sources"]:
                    p["sources"].append(sid)
                return pid
        tokens = fold(name).split()
        def same(p):
            theirs = fold(p["name"]).split()
            return fold(p["name"]) == fold(name) or (len(theirs) >= 2 and len(tokens) >= 2 and (theirs[0], theirs[-1]) == (tokens[0], tokens[-1]))
        matches = [p for p in self.rows["people"].values() if p.get("jurisdiction") == jurisdiction and same(p)]
        if len(matches) == 1:
            p = matches[0]
            if name != p["name"] and name not in p["aliases"]:
                p["aliases"].append(name)
            if sid not in p["sources"]:
                p["sources"].append(sid)
            if url:
                p["source_url"] = url
            return p["person_id"]
        pid = stable_id("person", source_key)
        self.put("people", {"person_id": pid, "name": name, "jurisdiction": jurisdiction, "aliases": [], "source_url": url, "sources": [sid]})
        return pid

    def history(self):
        url = "https://raw.githubusercontent.com/openaustralia/openaustralia-parser/master/data/representatives.csv"
        raw, sid = self.fetch(url, "OpenAustralia parliamentary service records")
        rows = csv_rows(raw, "member count,")
        def day(s):
            if not s:
                return None
            return datetime.strptime(s.strip(), "%d.%m.%Y").date().isoformat()
        for r in rows:
            if not r.get("name") or str(r["member count"]).startswith("#"):
                continue
            start, end = day(r.get("Date of election")), day(r.get("Date ceased to be a Member"))
            if not start or (end and end < "1993-03-13"):
                continue
            state = {"nsw": "nsw", "vic": "vic", "qld": "qld", "sa": "sa", "wa": "wa", "tas": "tas", "act": "act", "nt": "nt"}.get(re.sub(r"[^a-z]", "", r["State/Territory"].lower()))
            eid = self.by_name(r["Division"], "federal", state, "representatives")
            if not eid:
                eid = self.electorate("oa_division", f"{state}:{r['Division']}", r["Division"], "federal", "representatives", state or "", sid, status="historical")
            pid = self.person(r["name"], "oa:" + r["name"], sid)
            if end and end <= start:
                continue
            self.put("terms", {"representation_id": stable_id("term", f"oa:{r['member count']}"), "electorate_id": eid, "person_id": pid,
                               "start": start, "end": end, "start_precision": "day", "end_precision": "day" if end else "open",
                               "observed_through": self.rows["sources"][sid]["fetched_at"][:10], "start_reason": r.get("Type of election") or "election", "end_reason": r.get("reason"),
                               "party_periods": [{"party": party(r["Most recent party"]), "start": start, "end": end}] if r["Most recent party"] != "SPK" else [], "source_party_label": r["Most recent party"], "sources": [sid]})
        # Link candidacies only when the same verified person held the same seat.
        for c in self.rows["contests"].values():
            for candidate in c["candidates"]:
                matches = {t["person_id"] for t in self.rows["terms"].values() if t["electorate_id"] == c["electorate_id"]
                           and fold(self.rows["people"][t["person_id"]]["name"]).split()[0:1] == fold(candidate["name"]).split()[0:1]
                           and fold(self.rows["people"][t["person_id"]]["name"]).split()[-1:] == fold(candidate["name"]).split()[-1:]}
                if len(matches) == 1:
                    candidate["person_id"] = next(iter(matches))

    def victoria(self):
        hits = []
        roster_sources = []
        sid = None
        for page in range(1, 30):
            raw, sid = self.fetch(f"https://www.parliament.vic.gov.au/api/search/members?member-status=current&page={page}&pageSize=100&sortType=2", "Victorian Parliament member directory")
            roster_sources.append(sid)
            data = json.loads(raw)["result"]
            batch = data["hits"]
            hits.extend(batch)
            if len(hits) >= data["totalMatching"]:
                break
            if not batch:
                raise ValueError("Incomplete Victorian member directory")
        current = [h for h in hits if h.get("subtitle") != "Former Member"]
        if len({h["id"] for h in hits}) != len(hits):
            raise ValueError("Victorian pagination repeated rows")
        grouped = defaultdict(list)
        for h in current:
            fields = {m["title"]: m["details"] for m in h["memberships"]}
            if not fields.get("Member for"):
                continue
            chamber = "vic_lc" if "Legislative Council" in fields.get("House", []) else "vic_la"
            eid = self.by_name(fields["Member for"][0], "vic", chamber=chamber)
            if not eid:
                raise ValueError(f"Victorian seat unresolved: {fields['Member for']}")
            pid = self.person(h["title"], "vic:" + h["id"], sid, url=urljoin("https://www.parliament.vic.gov.au", h["url"]), jurisdiction="vic")
            grouped[eid].append({"person_id": pid, "party": party((fields.get("Party") or [""])[0])})
        if sum(map(len, grouped.values())) != 128:
            raise ValueError(f"Victorian roster needs review: {sum(map(len, grouped.values()))} members")
        roster_date = min(self.rows["sources"][source]["fetched_at"][:10] for source in roster_sources)
        for eid, members in grouped.items():
            self.put("rosters", {"roster_id": stable_id("roster", f"vic:{roster_date}:{eid}"), "electorate_id": eid,
                                 "as_of": roster_date, "capacity": self.rows["electorates"][eid]["capacity"], "complete": True, "members": members, "sources": roster_sources})

    def statewide_councils(self):
        # Reviewed parliamentary descriptions, 9 September 2026. The checksum
        # covers this curated configuration, not an unretained web page.
        configs = [
            ("nsw", "New South Wales", 42, "https://www.parliament.nsw.gov.au/parliamentary-business/legislative-council"),
            ("sa", "South Australia", 22, "https://education.parliament.sa.gov.au/learn/history-of-parliament/"),
            ("wa", "Western Australia", 37, "https://www.boundaries.wa.gov.au/electoral-distribution/current-boundaries"),
        ]
        for state, name, capacity, url in configs:
            sid = stable_id("source", "reviewed-constituency:" + url)
            self.put("sources", {"source_id": sid, "label": name + " statewide Legislative Council constituency", "url": url,
                                 "fetched_at": "2026-09-09", "sha256": hashlib.sha256(canonical_json([state, name, capacity]).encode()).hexdigest(),
                                 "checksum_scope": "reviewed constituency configuration", "licence": "Factual parliamentary configuration"})
            eid = self.electorate("parliament_constituency", state + "_lc_statewide", name, state, state + "_lc", state, sid, capacity=capacity)
            self.rows["electorates"][eid]["kind"] = "statewide"
        # Capacity evidence is independent of the ABS geometry evidence.
        for chamber, capacity, url in [
            ("tas_ha", 7, "https://www.tec.tas.gov.au/house-of-assembly/index.html"),
            ("act_la", 5, "https://www.elections.act.gov.au/elections/our-electoral-system/electorate-boundaries/redistributions/2023-redistribution"),
        ]:
            sid = stable_id("source", "reviewed-capacity:" + url)
            self.put("sources", {"source_id": sid, "label": "Electoral commission constituency capacity: " + chamber,
                "url": url, "fetched_at": "2026-09-09", "checksum_scope": "reviewed constituency capacity",
                "sha256": hashlib.sha256(canonical_json([chamber, capacity]).encode()).hexdigest()})
            for e in self.rows["electorates"].values():
                if e["chamber"] == chamber:
                    e["sources"].append(sid)
                    for boundary in self.rows["boundaries"].values():
                        if boundary["electorate_id"] == e["electorate_id"]:
                            boundary["sources"].append(sid)
        upper = {(e["jurisdiction"], e["state_code"]): e for e in self.rows["electorates"].values() if e["kind"] == "statewide"}
        for e in self.rows["electorates"].values():
            u = upper.get((e["jurisdiction"], e["state_code"]))
            if u and e["kind"] != "statewide" and e["status"] == "current":
                self.put("relations", {"relation_id": stable_id("rel", f"{e['electorate_id']}:{u['electorate_id']}:2026"),
                    "electorate_id": e["electorate_id"], "related_id": u["electorate_id"], "kind": "within_upper_house", "vintage": "2026 source configuration", "sources": u["sources"]})

    def bundle(self):
        jurisdictions = {}
        for jurisdiction in sorted({e["jurisdiction"] for e in self.rows["electorates"].values()}):
            seats = {e["electorate_id"] for e in self.rows["electorates"].values() if e["jurisdiction"] == jurisdiction}
            rosters = [r for r in self.rows["rosters"].values() if r["electorate_id"] in seats]
            contests = [c for c in self.rows["contests"].values() if c["electorate_id"] in seats]
            jurisdictions[jurisdiction] = {"electorates": len(seats), "roster_constituencies": len(rosters),
                "roster_members": sum(len(r["members"]) for r in rosters), "roster_dates": sorted({r["as_of"] for r in rosters}),
                "contests": len(contests), "election_dates": sorted({self.rows["elections"][c["election_id"]]["poll_date"] for c in contests}),
                "terms": sum(t["electorate_id"] in seats for t in self.rows["terms"].values()),
                "demographic_profiles": sum(d["electorate_id"] in seats for d in self.rows["demographics"].values())}
        self.coverage["jurisdictions"] = jurisdictions
        self.coverage["notes"] += ["Senate and state Council results/history are not yet indexed. NSW, SA and WA Council roster data is not yet verified.",
                                    "State electorate status describes the 2025 ABS geography; it is not a verification of subsequent legal changes."]
        return {"schema_version": SCHEMA_VERSION, "coverage": self.coverage,
                **{name: list(rows.values()) for name, rows in self.rows.items()}}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cache", type=Path, default=Path(".cache/electorates"))
    p.add_argument("--legacy", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--as-of", default=date.today().isoformat())
    p.add_argument("--refresh", action="store_true", help="Refetch cached sources; observations retain their actual fetch dates")
    args = p.parse_args()
    b = Builder(args.cache, args.as_of, refresh=args.refresh)
    b.aec(); b.geography(); b.legacy(args.legacy); b.history(); b.victoria(); b.statewide_councils()
    bundle = b.bundle()
    validate(bundle)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(canonical_json(bundle) + "\n")
    print({k: len(v) for k, v in b.rows.items()})


if __name__ == "__main__":
    main()
