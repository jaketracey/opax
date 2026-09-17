#!/usr/bin/env python3
"""
Build portal/public/pay.json: what federal parliamentarians are paid for the
posts they hold, over time. Runs on the Mac, no database:

  python3 scripts/build_pay.py            # cached Handbook snapshot, else fetch
  python3 scripts/build_pay.py --refresh  # re-download the Handbook records

Two public sources, joined:

  WHO HELD WHAT, WHEN   the Parliamentary Handbook API (handbookapi.aph.gov.au):
                        service, ministries, shadow ministries, parliamentary
                        positions and party positions, each with dates.
  WHAT THE POST PAYS    the Remuneration Tribunal: the parliamentary base salary
                        and the additional salary of each office as a percentage
                        of it (scripts/pay_registry/*.json, every row sourced).

Nothing here is a payslip. A salary is an entitlement set by an instrument, so
the figure for a person on a day is: base salary on that day, plus the loading
of the office they held. The rules, from the determinations themselves:

  - A Minister is paid the one ministerial rate that applies (the highest).
    Ministerial salary is an exact percentage of base.
  - Other office holders are paid the SUM of the percentages of the offices
    they hold, rounded up to the next $10 (MP Determination 2026 s 9).
  - A shadow minister is paid a flat rate INSTEAD of that sum, and only when
    named in the Opposition Leader's notice to the Clerks, which is capped and
    not published. Every shadow minister in the Handbook is assumed named, so
    their rows carry `assumed`.
  - Committee chairs (3-16%) are NOT included: the Handbook API gives no dates
    for a chair, only for membership. meta.not_covered says so to the reader.

Output (whole dollars):

  {"meta": {...sources, method, not_covered, as_of, from...},
   "base": [{"from": "2025-07-01", "amount": 239270, "source": ..., "url": ...}],
   "offices": {"pm": {"label": "Prime Minister", "pct": 160.0, "kind": "ministerial"}},
   "current": [{"id": "R36", "name": ..., "party": ..., "chamber": ...,
                "post": "Prime Minister", "pct": 160.0, "salary": 622102}],
   "names": {"anthony albanese": "R36"},
   "people": {"R36": {"name", "pid", "party", "chamber", "from", "to", "sitting",
                      "now": {"post", "pct", "salary", "since"} | null,
                      "peak": {"post", "pct", "salary", "year"},
                      "total": <sum of by_year>,
                      "spells": [[from, to, post, pct, assumed]],
                      "by_year": [[fy_start_year, dollars]]}}}

`people` is keyed by the Handbook's PHID; `pid` is the OPAX person id where the
person is in the roster (OpenAustralia's people.csv carries the APH id).
"""

import argparse
import csv
import io
import json
import math
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "scripts" / "pay_registry"
OUT = ROOT / "portal" / "public" / "pay.json"
ROSTER = ROOT / "portal" / "public" / "parliamentarians.json"
CACHE = Path.home() / ".cache" / "autoresearch" / "pay"
HANDBOOK = "https://handbookapi.aph.gov.au/api/"
OA_PEOPLE = "https://raw.githubusercontent.com/openaustralia/openaustralia-parser/master/data/people.csv"
# aph.gov.au turns away clients that identify as scripts.
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
PAGE = 100  # the API refuses $top above 100
OPEN = date(9999, 12, 31)

# Record-of-service types worth having: 8 parliamentary positions, 9 service,
# 7 parliamentary party positions.
ROS_TYPES = {"positions": 8, "service": 9, "partypositions": 7}


# --- fetching ----------------------------------------------------------------

def get_json(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as res:
                return json.load(res)
        except Exception as err:  # noqa: BLE001 - retried, then fatal
            print(f"  retry {attempt + 1}: {err}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise SystemExit(f"failed: {url}")


def all_rows(entity, flt=None):
    rows, skip = [], 0
    while True:
        query = {"$top": PAGE, "$skip": skip}
        if flt:
            query["$filter"] = flt
        page = get_json(HANDBOOK + entity + "?" + urllib.parse.urlencode(query, quote_via=urllib.parse.quote)).get("value", [])
        rows += page
        if len(page) < PAGE:
            return rows
        skip += PAGE
        time.sleep(0.25)


def handbook(refresh):
    path = CACHE / "handbook_raw.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    print("fetching the Parliamentary Handbook (about 200 requests)…", file=sys.stderr)
    raw = {"fetched": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    for entity in ("ministryrecords", "shadowministryrecords", "individuals"):
        raw[entity] = all_rows(entity)
        print(f"  {entity}: {len(raw[entity])}", file=sys.stderr)
    for name, type_id in ROS_TYPES.items():
        raw[name] = all_rows("recordsofservice", f"ROSTypeID eq {type_id}")
        print(f"  {name}: {len(raw[name])}", file=sys.stderr)
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw))
    return raw


def oa_people(refresh):
    """APH id -> (OpenAustralia person id, names). OPAX pids are OA's."""
    path = CACHE / "oa_people.csv"
    if not path.exists() or refresh:
        req = urllib.request.Request(OA_PEOPLE, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as res:
            CACHE.mkdir(parents=True, exist_ok=True)
            path.write_bytes(res.read())
    out = {}
    for row in csv.reader(io.StringIO(path.read_text(encoding="utf-8", errors="replace"))):
        if len(row) > 2 and row[0].strip().isdigit() and row[1].strip():
            names = [n.strip() for n in (row[2], *row[4:]) if n.strip()]
            out[row[1].strip().upper()] = (str(10000 + int(row[0])), names)
    return out


# --- dates -------------------------------------------------------------------

def parse(value):
    """A full ISO date, or None. The Handbook writes unknown as 1900-01-01 and
    a few early records as a bare year; neither can place a salary in time."""
    value = (value or "").strip()[:10]
    if len(value) != 10 or value.startswith("1900-01-01") or value.startswith("0001"):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def fy_start(day):
    return day.year if day.month >= 7 else day.year - 1


# --- the registry ------------------------------------------------------------

def load_registry():
    base = json.loads((REGISTRY / "base_salary.json").read_text())
    loadings = json.loads((REGISTRY / "loadings.json").read_text())
    steps = sorted(((date.fromisoformat(s["from"]), s) for s in base["steps"]), key=lambda pair: pair[0])
    offices = {}
    for office in loadings["offices"]:
        periods = [(date.fromisoformat(p["from"]), date.fromisoformat(p["to"]) if p.get("to") else OPEN, float(p["pct"]))
                   for p in office["periods"]]
        offices[office["id"]] = {**office, "periods": sorted(periods)}
    return base, loadings, steps, offices


def pct_on(office, day):
    for start, end, pct in office["periods"]:
        if start <= day < end:
            return pct
    return None  # the office carried no loading on that day


# --- mapping Handbook records to pay offices ----------------------------------

def clean(value):
    return re.sub(r"\s+", " ", (value or "")).strip()


def ministry_office(row, assistants_are_secretaries_from):
    role, entity = clean(row["Role"]), clean(row["Entity"])
    if role == "Prime Minister":
        return "pm", role
    if role == "Deputy Prime Minister":
        return "dpm", role
    if role == "Treasurer":
        return "treasurer", role
    if role == "Cabinet Minister":
        return "cabinet", "Cabinet Minister"
    title = clean(" ".join(filter(None, [role, clean(row["Prep"]), entity])))
    if role == "Parliamentary Secretary":
        return "parlsec", title
    if role == "Assistant Minister":
        # Abbott's Assistant Ministers were Ministers of State in the outer
        # ministry, beside his Parliamentary Secretaries; from Turnbull's
        # swearing-in the style is what a Parliamentary Secretary is called.
        started = parse(row["RDateStart"])
        return ("minister" if started and started < assistants_are_secretaries_from else "parlsec"), title
    if role in ("Minister", "Attorney-General", "Special Minister of State", "Assistant Treasurer", "Assistant Defence Minister"):
        return "minister", title
    # Vice-President of the Executive Council, Cabinet Secretary, Minister
    # Assisting: titles held beside a portfolio, which is what sets the rate.
    return None, title


def shadow_office(row):
    role, prep, entity = clean(row["Role"]), clean(row["Prep"]), clean(row["Entity"])
    title = clean(" ".join(filter(None, [role, prep, entity])))
    senate = entity == "Senate"
    if role in ("Leader", "Leader of the Opposition") and not senate and entity in ("Opposition", ""):
        return "loto", "Leader of the Opposition"
    if role == "Leader of the Opposition" and senate:
        return "loto_senate", title
    if role in ("Deputy Leader", "Deputy Leader of the Opposition"):
        if senate:
            return "deputy_loto_senate", title
        # "Deputy Leader of the Opposition in the House of Representatives" is a
        # courtesy title beside a senator who is the deputy; it has no loading.
        if entity in ("Opposition", ""):
            return "deputy_loto", "Deputy Leader of the Opposition"
    if role == "Manager of Opposition Business":
        return ("mob_senate" if senate else "mob_house"), title
    if role == "Shadow Cabinet Minister":
        return "shadow_cabinet", "Shadow Cabinet Minister"
    if role in ("Shadow Minister", "Shadow Treasurer", "Shadow Attorney-General", "Shadow Special Minister",
                "Shadow Assistant Treasurer"):
        return "shadow_minister", title
    return None, title


POSITION_OFFICES = {
    "Speaker of the House of Representatives": "speaker",
    "President of the Senate": "president",
    "Deputy Speaker": "deputy_speaker",
    "Deputy President of the Senate": "deputy_president",
    "Deputy President and Chair of Committees": "deputy_president",
    "Chair of Committees": "deputy_president",
    "Second Deputy Speaker": "second_deputy_speaker",
    "Member of the Speaker's Panel": "speakers_panel",
    "Temporary Chair of Committees": "temp_chair",
    "Temporary Chairman of Committees": "temp_chair",
}


def party_position_office(row):
    role, where = clean(row["Value1"]), clean(row["Value3"])
    title = clean(" ".join(filter(None, [role, clean(row["Value2"]), where])))
    senate, house = where == "Senate", where in ("House of Representatives", "House")
    if role == "Leader of the Government" and senate:
        return "lgs", title
    if role in ("Leader of the Nationals", "Leader of the National Party", "Leader of The Nationals") and senate:
        return "party_senate_head", title
    if role == "Leader" and where == "House":
        return "loh", "Leader of the House"
    if role == "Manager of Government Business" and senate:
        return "mgbs", title
    if role in ("Government Chief Whip", "Chief Government Whip"):
        return ("chief_govt_whip_senate" if senate else "chief_govt_whip_house"), title
    if role == "Chief Opposition Whip":
        return ("chief_opp_whip_senate" if senate else "chief_opp_whip_house"), title
    # Before "Chief" entered the Senate titles, its one whip was the chief.
    if role == "Government Whip":
        return ("chief_govt_whip_senate" if senate else "govt_whip_house" if house else None), title
    if role == "Opposition Whip":
        return ("chief_opp_whip_senate" if senate else "opp_whip_house" if house else None), title
    if role == "Government Deputy Whip":
        return ("govt_deputy_whip_senate" if senate else "govt_deputy_whip_house" if house else None), title
    if role == "Opposition Deputy Whip":
        return ("opp_deputy_whip_senate" if senate else "opp_deputy_whip_house" if house else None), title
    return None, title


# --- people --------------------------------------------------------------------

PARTY_NAMES = {
    "Australian Labor Party": "Labor", "Liberal Party of Australia": "Liberal", "The Nationals": "Nationals",
    "National Party of Australia": "Nationals", "Australian Greens": "Greens", "Liberal National Party of Queensland": "LNP",
    "Pauline Hanson's One Nation": "One Nation", "Pauline Hanson's One Nation Party": "One Nation", "Jacqui Lambie Network": "JLN", "Country Liberal Party": "Country Liberal Party",
    "Australian Democrats": "Democrats", "United Australia Party [2018]": "United Australia Party",
}


def party_name(value):
    value = clean(value)
    return PARTY_NAMES.get(value, value)


def fold(value):
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z' -]", "", text.replace("’", "'"))).strip()


def family_case(family):
    text = family.title()
    text = re.sub(r"\bMc([a-z])", lambda m: "Mc" + m.group(1).upper(), text)
    text = re.sub(r"\bMac([a-z])(?=[a-z]{3,})", lambda m: "Mac" + m.group(1), text)  # leave Mackay-style alone
    return re.sub(r"(['’-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), text)


def display_names(person):
    """Likely public names, best first: 'Tony Abbott' before 'Anthony Abbott'."""
    family = family_case(person["FamilyName"].strip())
    names = []
    nick = re.search(r"\(([^)]+)\)", person.get("DisplayName") or "")
    for given in (nick.group(1) if nick else "", person.get("PreferredName") or "", person.get("GivenName") or ""):
        given = given.strip()
        if given and f"{given} {family}" not in names:
            names.append(f"{given} {family}")
    return names or [family]


# --- the sweep -------------------------------------------------------------------

def merged(spans):
    out = []
    for start, end in sorted(spans):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out


def round_up_10(amount):
    return int(math.ceil(round(amount, 6) / 10.0) * 10)


def build(args, raw=None, oa=None, roster=None):
    """The three inputs can be handed in (scripts/test_build_pay.py does); the
    registry is always the real one, since its rules are what is under test."""
    base_doc, loading_doc, steps, offices = load_registry()
    start_day = date.fromisoformat(loading_doc["series_from"])
    as_of = date.fromisoformat(args.as_of) if args.as_of else date.today()
    raw = raw if raw is not None else handbook(args.refresh)
    oa = oa if oa is not None else oa_people(args.refresh)
    roster = roster if roster is not None else json.loads(ROSTER.read_text())["people"]
    assistants_are_secretaries_from = date.fromisoformat(loading_doc["assistant_minister_is_a_parliamentary_secretary_from"])

    def base_on(day):
        amount = None
        for step_day, step in steps:
            if step_day <= day:
                amount = step["amount"]
        return amount

    # Spells per person: service (end inclusive: a senator's term runs to 30
    # June and the next starts 1 July) and offices (end is the changeover day).
    service = defaultdict(list)
    chamber = {}
    for row in raw["service"]:
        start = parse(row["DateStart1"])
        if not start:
            continue
        end = parse(row["DateEnd1"])
        service[row["PHID"].upper()].append((start, end + timedelta(days=1) if end else OPEN))
        key = row["PHID"].upper()
        if key not in chamber or start >= chamber[key][0]:
            chamber[key] = (start, "senate" if row.get("MpOrSenator") == "Senator" else "representatives")

    held = defaultdict(list)  # phid -> [(start, end, office_id, title)]
    skipped = defaultdict(int)

    def hold(phid, start, end, office_id, title):
        if office_id and start and (end or OPEN) > start:
            held[phid.upper()].append((start, end or OPEN, office_id, title))

    for row in raw["ministryrecords"]:
        start = parse(row["RDateStart"])
        if not start:
            skipped["ministry rows without a full start date"] += 1
            continue
        # An open role in a ministry that has since ended stops with it.
        end = parse(row["RDateEnd"]) or parse(row["MDateEnd"])
        office_id, title = ministry_office(row, assistants_are_secretaries_from)
        hold(row["PHID"], start, end, office_id, title)
    for row in raw["shadowministryrecords"]:
        start = parse(row["RDateStart"])
        if not start:
            skipped["shadow ministry rows without a full start date"] += 1
            continue
        office_id, title = shadow_office(row)
        hold(row["PHID"], start, parse(row["RDateEnd"]) or parse(row["MDateEnd"]), office_id, title)
    for row in raw["positions"]:
        hold(row["PHID"], parse(row["DateStart1"]), parse(row["DateEnd1"]), POSITION_OFFICES.get(clean(row["Value1"])), clean(row["Value1"]))
    for row in raw["partypositions"]:
        office_id, title = party_position_office(row)
        hold(row["PHID"], parse(row["DateStart1"]), parse(row["DateEnd1"]), office_id, title)
    # Where the Handbook leaves a Cabinet rank off a Cabinet minister.
    for fix in loading_doc.get("cabinet_rank_missing_in_handbook", []):
        hold(fix["phid"], date.fromisoformat(fix["from"]), date.fromisoformat(fix["to"]), "cabinet", "Cabinet Minister")

    # Party leaders. The Nationals lead the third largest party in the House,
    # an office of its own; any other party outside the two blocs is a minority
    # party once it has five members, and its leader's rate turns on its size,
    # so a leader's spell is cut wherever the party room grew or shrank.
    membership = defaultdict(list)  # party -> [(start, end)] one per member's spell
    for person in raw["individuals"]:
        for term in person.get("PartyParliamentaryService") or []:
            seat = (parse(term.get("DateStart")), parse(term.get("DateEnd")))
            if not seat[0]:
                continue
            seat_end = seat[1] + timedelta(days=1) if seat[1] else OPEN
            for stint in term.get("SecondaryService") or []:
                a, b = parse(stint.get("DateStart")) or seat[0], parse(stint.get("DateEnd"))
                a, b = max(a, seat[0]), min(b + timedelta(days=1) if b else OPEN, seat_end)
                if b > a:
                    membership[party_name(stint.get("Value"))].append((a, b))
    for row in raw["partypositions"]:
        role, where = clean(row["Value1"]), clean(row["Value3"])
        if role != "Leader" or where in ("House", "Senate", ""):
            continue
        party = party_name(re.sub(r"^Federal Parliamentary ", "", where))
        start, end = parse(row["DateStart1"]), parse(row["DateEnd1"]) or OPEN
        if not start or party in ("Labor", "Liberal"):
            continue
        if party == "Nationals":
            hold(row["PHID"], start, end, "third_party_leader", "Leader of the Nationals")
            continue
        seats = membership.get(party, [])
        cuts = sorted({start, end, *(edge for span in seats for edge in span if start < edge < end)})
        label = where.replace("Federal Parliamentary ", "")
        title = f"Leader of {'the ' if label.startswith('Australian') else ''}{label}"
        pieces = []
        for a, b in zip(cuts, cuts[1:]):
            size = sum(1 for s0, s1 in seats if s0 <= a < s1)
            office_id = "minor_leader_large" if size > 10 else "minor_leader_small" if size >= 5 else None
            # A senator leaving and the replacement arriving share a day on
            # paper; a party room does not change size for an afternoon.
            if pieces and ((b - a).days < 3 or pieces[-1][2] == office_id):
                pieces[-1][1] = b
            else:
                pieces.append([a, b, office_id])
        for a, b, office_id in pieces:
            hold(row["PHID"], a, b, office_id, title)

    step_days = [day for day, _ in steps]
    period_days = {edge for office in offices.values() for a, b, _ in office["periods"] for edge in (a, b) if edge != OPEN}

    def rate(day, office_ids):
        """(pct, salary, office ids that set it, assumed) for the offices held on a day."""
        base = base_on(day)
        live = {oid: pct_on(offices[oid], day) for oid in office_ids}
        live = {oid: pct for oid, pct in live.items() if pct is not None}
        ministerial = {oid: pct for oid, pct in live.items() if offices[oid]["kind"] == "ministerial"}
        # Senate business manager and the two leaderships are ministerial rates
        # only in the hands of a minister.
        portfolio = [oid for oid in ministerial if oid in ("pm", "dpm", "treasurer", "cabinet", "minister", "parlsec")]
        if portfolio:
            options = dict(ministerial)
            if "mgbs" in options:
                rank = "cabinet" if {"cabinet", "pm", "dpm", "treasurer"} & set(portfolio) else "minister" if "minister" in portfolio else "parlsec"
                options[f"mgbs_{rank}"] = pct_on(offices[f"mgbs_{rank}"], day) or 0
                del options["mgbs"]
            best = max(options, key=lambda oid: options[oid])
            pct = options[best]
            return pct, int(round(base * (1 + pct / 100))), [best], False
        others = {oid: pct for oid, pct in live.items() if offices[oid]["kind"] == "office"}
        shadow = {oid: pct for oid, pct in live.items() if offices[oid]["kind"] == "shadow"}
        total = sum(others.values())
        if shadow and max(shadow.values()) >= total:
            best = max(shadow, key=lambda oid: shadow[oid])
            return shadow[best], base + round_up_10(base * shadow[best] / 100), [best], True
        if total:
            return total, base + round_up_10(base * total / 100), sorted(others, key=lambda oid: -others[oid]), False
        return 0.0, base, [], False

    # Roster matching: OA's APH id first, then an exact folded name among
    # federal people.
    # The roster keeps a row per spelling ("Albanese", "Anthony Albanese") under
    # one pid: the row with the most speeches is the person's page.
    by_pid = {}
    for p in roster:
        if p.get("pid") and "federal" in p.get("states", []) and " " in p["name"]:
            if p.get("speeches", 0) > by_pid.get(str(p["pid"]), {}).get("speeches", -1):
                by_pid[str(p["pid"])] = p
    by_name = defaultdict(list)
    for p in roster:
        if "federal" in p.get("states", []):
            for name in (p["name"], p.get("full")):
                if name:
                    by_name[fold(name)].append(p)

    people, names, current = {}, defaultdict(set), []
    for person in raw["individuals"]:
        phid = person["PHID"].upper()
        spans = [[max(a, start_day), min(b, as_of + timedelta(days=1))] for a, b in merged(service.get(phid, []))]
        spans = [span for span in spans if span[1] > span[0]]
        if not spans:
            continue
        mine = held.get(phid, [])
        edges = set()
        for a, b in spans:
            edges |= {a, b}
        for a, b, _, _ in mine:
            edges |= {a, b}
        edges |= set(step_days) | period_days
        first, last = spans[0][0], spans[-1][1]
        edges |= {date(year, 7, 1) for year in range(first.year, last.year + 2)}
        edges = sorted(edge for edge in edges if first <= edge <= last)

        spells, by_year = [], defaultdict(float)
        for a, b in zip(edges, edges[1:]):
            if not any(s <= a < e for s, e in spans):
                continue
            office_ids = {oid for s, e, oid, _ in mine if s <= a < e}
            pct, salary, setters, assumed = rate(a, office_ids)
            titles = []
            for oid in setters:
                source_id = "mgbs" if oid.startswith("mgbs_") else oid
                title = next((t for s, e, o, t in mine if o == source_id and s <= a < e), offices[oid]["label"])
                # "Cabinet Minister" says the rank and a Senate or House
                # leadership sets the rate; the portfolio says the job.
                job = next((t for s, e, o, t in mine if o == "minister" and s <= a < e), "")
                if oid.startswith("mgbs_"):
                    title = "Manager of Government Business in the Senate" + (f", {job}" if job else "")
                elif oid in ("lgs", "loh"):
                    title = title + (f", {job}" if job else "")
                elif oid == "cabinet":
                    title = f"{job} (Cabinet)" if job else "Cabinet Minister"
                elif oid == "shadow_cabinet":
                    shadow_job = next((t for s, e, o, t in mine if o == "shadow_minister" and s <= a < e), "")
                    title = f"{shadow_job} (Shadow Cabinet)" if shadow_job else "Shadow Cabinet Minister"
                titles.append(title)
            post = " + ".join(titles) if titles else ("Senator" if chamber.get(phid, (None, ""))[1] == "senate" else "Member of Parliament")
            year_days = (date(fy_start(a) + 1, 7, 1) - date(fy_start(a), 7, 1)).days
            by_year[fy_start(a)] += salary * (b - a).days / year_days
            if spells and spells[-1]["post"] == post and spells[-1]["pct"] == pct and spells[-1]["to"] == a:
                spells[-1]["to"] = b
                spells[-1]["salary"] = salary
            else:
                spells.append({"from": a, "to": b, "post": post, "pct": pct, "salary": salary, "assumed": assumed})

        sitting = spans[-1][1] > as_of
        opax = by_pid.get(oa.get(phid, ("", []))[0])
        candidates = display_names(person) + oa.get(phid, ("", []))[1]
        if not opax:
            found = {id(p): p for name in candidates for p in by_name.get(fold(name), [])}
            opax = next(iter(found.values())) if len(found) == 1 else None
        name = opax["name"] if opax else display_names(person)[0]
        party = party_name(person.get("Party")) or None
        # The roster's current-party sweep catches a defection before the
        # Handbook does; it says LNP where the Handbook names the party room.
        if opax and opax.get("party_now") and opax["party_now"] not in (party, "LNP", "Country Liberal Party"):
            party = opax["party_now"]
        peak = max(spells, key=lambda s: (s["salary"], s["to"]))
        last_spell = spells[-1]
        entry = {
            "name": name, "pid": str(opax["pid"]) if opax and opax.get("pid") else None, "party": party,
            "chamber": chamber.get(phid, (None, None))[1], "from": first.isoformat(),
            "to": None if sitting else (spans[-1][1] - timedelta(days=1)).isoformat(), "sitting": sitting,
            "now": {"post": last_spell["post"], "pct": last_spell["pct"], "salary": last_spell["salary"],
                    "since": last_spell["from"].isoformat(), **({"assumed": True} if last_spell["assumed"] else {})} if sitting else None,
            "peak": {"post": peak["post"], "pct": peak["pct"], "salary": peak["salary"], "year": fy_start(peak["to"] - timedelta(days=1))},
            "total": int(round(sum(by_year.values()))),
            "spells": [[s["from"].isoformat(), None if s["to"] > as_of else s["to"].isoformat(), s["post"], s["pct"], s["salary"], *([1] if s["assumed"] else [])]
                       for s in spells],
            "by_year": [[year, int(round(amount))] for year, amount in sorted(by_year.items())],
        }
        people[phid] = entry
        for candidate in [name, *candidates]:
            names[fold(candidate)].add(phid)
        if sitting:
            current.append({"id": phid, "name": name, "party": party, "chamber": entry["chamber"], "post": last_spell["post"],
                            "pct": last_spell["pct"], "salary": last_spell["salary"], **({"assumed": True} if last_spell["assumed"] else {})})

    current.sort(key=lambda row: (-row["salary"], row["name"]))
    office_view = {oid: {"label": office["label"], "kind": office["kind"], "pct": pct_on(office, as_of), "source": office.get("source")}
                   for oid, office in offices.items() if pct_on(office, as_of) is not None}
    out = {
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "as_of": as_of.isoformat(), "from": start_day.isoformat(), "handbook_fetched": raw.get("fetched"),
            "people": len(people), "sitting": len(current),
            "sources": base_doc["sources"] + loading_doc["sources"],
            "method": loading_doc["method"], "not_covered": loading_doc["not_covered"],
            "electorate_allowance": loading_doc["electorate_allowance"],
            "skipped": dict(skipped),
        },
        "base": [{"from": step["from"], "amount": step["amount"], "source": step["source"], "url": step.get("url")}
                 for _, step in steps if date.fromisoformat(step["from"]) <= as_of],
        "offices": office_view,
        "current": current,
        # A name two people share is left out rather than guessed.
        "names": {name: next(iter(ids)) for name, ids in sorted(names.items()) if len(ids) == 1 and name},
        "people": people,
    }
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--refresh", action="store_true", help="re-download the Handbook records and OA people list")
    parser.add_argument("--as-of", help="build as at this ISO date (default: today)")
    parser.add_argument("--out", default=str(OUT))
    args = parser.parse_args()
    out = build(args)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    top = ", ".join(f"{row['name']} ${row['salary']:,}" for row in out["current"][:3])
    print(f"{args.out}: {out['meta']['people']} people, {out['meta']['sitting']} sitting; top: {top}", file=sys.stderr)


if __name__ == "__main__":
    main()
