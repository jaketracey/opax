#!/usr/bin/env python3
"""Export the "Who gets the grants" data: one index per jurisdiction plus a
detail file per listed recipient, from parli.db on the database host.

    .venv/bin/python scripts/export_grants.py federal
    .venv/bin/python scripts/export_grants.py qld
    .venv/bin/python scripts/export_grants.py federal --out-dir /tmp/x   # anywhere else

Writes (default --out-dir portal/public):

    graph/grants.<jur>.json           the index the explore module opens on:
                                      meta, the listed recipients (the largest by
                                      dollars plus every donor among them), the
                                      programs, the electorates, the years, the
                                      kinds
    grants/<jur>/shard-NN.json        the listed recipients' files, bundled into 40
                                      shards by crc32 of the file key (the index
                                      entry carries `sh`): each file has the
                                      recipient's grants (largest first), its ABR
                                      record, its donor-register entity with
                                      disclosed donations by party and year (AEC
                                      and each exposed state register, never
                                      summed), and a pointer to its grants in the
                                      other jurisdiction
    grants/<jur>/programs/<key>.json  one file per listed program (the index row
                                      carries `key`): totals, selection mix, seat
                                      holders and government / opposition /
                                      crossbench split at the grant date, seat
                                      margins at the latest prior election,
                                      election timing, top recipients and the
                                      grants themselves (largest first, at most
                                      600). See docs/DATA-GRANTS.md "Program
                                      files" for the rules.

The heavy lifting runs on the DB host: the REMOTE string below is streamed to
`ssh desktop python3 -` (stdlib only there), and the JSON it prints is split
into files here. Tables read: ext_grants + ext_grant_details (Commonwealth,
GrantConnect), government_grants (Queensland), ext_grant_recipients +
ext_grant_recipient_keys (parli.ingest.grant_recipients), ext_donor_entities /
ext_donor_aliases, donations (AEC), ext_donations (state registers: only the
jurisdictions the site already exposes -- qld, vic, tas), members, electorates,
postcode_electorates.

Rules the numbers follow (repeated in each file's meta.caveats):
  * Grant totals are the awarded values as published; a varied award counts at
    its current value. Aggregate awards (many small recipients bundled) sit in
    the "not disclosed" bucket, as do awards whose recipient was withheld.
  * A recipient is a donor when ext_grant_recipients ties it to a donor-register
    entity (ABN, or a unique name match); people are never matched by name.
  * AEC donations and state-register gifts are reported side by side and never
    summed (AEC returns already include state branch receipts).
  * A donor receiving a grant is a fact about the public record, not a finding
    of wrongdoing: most grant programs are open and competitive, and the
    selection process is shown wherever GrantConnect records it.
"""

from __future__ import annotations

import argparse
import inspect
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DEFAULT_OUT = ROOT / "portal" / "public"
DB_HOST = os.environ.get("OPAX_DB_HOST", "desktop")


# -- shared rules: run here (tests, file writing) and on the DB host ----------
# Everything between here and REMOTE_BODY is stdlib only and is streamed to the
# DB host verbatim (see remote_program), so the tests exercise the same code
# the export runs.

ELECTIONS = {
    "federal": ["2013-09-07", "2016-07-02", "2019-05-18", "2022-05-21", "2025-05-03"],
    "qld": ["2015-01-31", "2017-11-25", "2020-10-31", "2024-10-26"],
}
BLOCS = {"Liberal": "Coalition", "Nationals": "Coalition", "LNP": "Coalition",
         "Country Liberal Party": "Coalition", "Labor": "Labor"}
GOVERNMENT = {
    "federal": [["2013-09-18", "2022-05-23", "Coalition"], ["2022-05-23", None, "Labor"]],
    "qld": [["2012-03-26", "2015-02-14", "LNP"], ["2015-02-14", "2024-10-28", "Labor"], ["2024-10-28", None, "LNP"]],
}
# Federal House by-elections since the 2019 election: [seat, polling day, winner, party].
# The electorates table only records general-election winners, so these six are
# applied on top for the term they fall in.
BY_ELECTIONS = {"federal": [
    ["Eden-Monaro", "2020-07-04", "Kristy McBain", "Labor"], ["Groom", "2020-11-28", "Garth Hamilton", "LNP"],
    ["Aston", "2023-04-01", "Mary Doyle", "Labor"], ["Fadden", "2023-07-15", "Cameron Caldwell", "LNP"],
    ["Dunkley", "2024-03-02", "Jodie Belyea", "Labor"], ["Cook", "2024-04-13", "Simon Kennedy", "Liberal"],
]}
# Party spellings the roster and the election results use for the same party.
PARTY_ALIASES = {"A.L.P.": "Labor", "ALP": "Labor", "LP": "Liberal", "NAT": "Nationals", "NP": "Nationals",
                 "CLP": "Country Liberal Party", "Queensland Greens": "Greens", "The Greens": "Greens",
                 "Australian Greens": "Greens", "KAP": "Katter's Australian Party"}
PROGRAM_GRANTS_MAX = 600
PROGRAM_RECIPIENTS_MAX = 60
SEAT_BLOCS = ("gov", "opp", "cross", "unknown")
MARGIN_TYPES = ("marginal", "fairly_safe", "safe", "unknown")
APPROVAL_BUCKETS = ("before_approval", "0_30", "31_90", "91_365", "over_365")
ELECTION_BUCKETS = ("0_3", "3_6", "6_12", "12_24", "over_24", "unknown")
ISO_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}")


def iso_day(s):
    """The YYYY-MM-DD prefix of an ISO date or datetime string, else None.

    The sources carry a few non-dates ('unknown', a run of hash marks): they
    read as no date rather than as a date that sorts somewhere.
    """
    if not s or not isinstance(s, str) or not ISO_DAY.match(s):
        return None
    return s[:10]


def program_key(pid):
    """File key for a program id: lowercase, every run of non-alphanumerics -> '-',
    trimmed of leading/trailing '-', at most 80 chars. 'GO3141' -> 'go3141';
    'activity:Some title' -> 'activity-some-title'."""
    k = re.sub(r"[^a-z0-9]+", "-", (pid or "").lower()).strip("-")
    return k[:80].rstrip("-") or "x"


def government_at(periods, day):
    """Who governed on day, from [[start, end | None, bloc], ...] (end exclusive)."""
    if not day:
        return None
    for start, end, who in periods:
        if day >= start and (end is None or day < end):
            return who
    return None


def bloc_for(party, day, blocs, government):
    """gov / opp / cross / unknown for a seat holder's party on a grant date.

    The party maps through blocs (Liberal, Nationals, LNP, CLP -> Coalition;
    Labor -> Labor); a party outside the table is the crossbench. gov when the
    bloc governed on the day, opp when it is the other major bloc, unknown when
    the party or the day is missing or no government is recorded for the day.
    """
    if not party or not day:
        return "unknown"
    mine = blocs.get(party)
    if mine is None:
        return "cross"
    gov = government_at(government, day)
    if gov is None:
        return "unknown"
    return "gov" if mine == blocs.get(gov, gov) else "opp"


def holder_at(members, day):
    """The member row [name, party, entered, left] whose dates span day.

    A missing entered or left date is an open end; a row whose dates are both
    unreadable ('unknown') spans nothing. A member with no dates at all (some
    current members in the roster) is taken as the holder only once every dated
    member of the seat has left and only when there is exactly one such member.
    None when nobody spans the day.
    """
    if not day or not members:
        return None
    best = None
    best_entered = ""
    undated = []
    last_left = None
    for m in members:
        entered, left = iso_day(m[2]), iso_day(m[3])
        if entered is None and left is None:
            if m[2] is None and m[3] is None:
                undated.append(m)
            continue   # dates that are not dates at all ('unknown') span nothing
        if left and (last_left is None or left > last_left):
            last_left = left
        if entered and day < entered:
            continue
        if left and day > left:
            continue
        if best is None or (entered or "") > best_entered:
            best, best_entered = m, entered or ""
    if best:
        return best
    if len(undated) == 1 and (last_left is None or day > last_left):
        return undated[0]
    return None


def canonical_party(party):
    """One spelling per party across the roster and the election results."""
    if not party:
        return None
    return PARTY_ALIASES.get(party, party)


def pretty_name(name):
    """'Bridget Kathleen ARCHER' -> 'Bridget Archer' (first given name + surname)."""
    parts = (name or "").replace(",", " ").split()
    if not parts:
        return name
    if len(parts) == 1:
        return parts[0].title()
    return f"{parts[0].title()} {parts[-1].title()}"


def seat_holder(seat, day, seat_members, margins, current_seats=None):
    """[name, party] of the member holding a federal seat on day, or None.

    The roster's service dates are unreliable for a tenth of the seats, so the
    recorded election winner (the electorates table: 2019 and 2022, with the
    candidate at index 4 of each margins row) decides the term after each of
    those elections, with BY_ELECTIONS applied; from the last listed federal
    election on, current_seats (the portal's current roster) decides; before
    May 2019, and wherever the tables have no row, the roster's dates decide
    (holder_at). When the winner is the same person as the roster's holder the
    roster's spelling of the name is kept.
    """
    if not day or not seat:
        return None
    roster = holder_at(seat_members.get(seat) if seat_members else None, day)
    roster_out = [roster[0], canonical_party(roster[1])] if roster else None
    elections = ELECTIONS["federal"]
    if day >= elections[-1]:
        cur = (current_seats or {}).get(seat)
        return [cur[0], canonical_party(cur[1])] if cur else roster_out
    term = None
    for e in elections:
        if e <= day:
            term = e
    if term:
        latest = None
        for s, d, name, party in BY_ELECTIONS["federal"]:
            if s == seat and term <= d <= day and (latest is None or d > latest[0]):
                latest = (d, name, party)
        if latest:
            return [latest[1], canonical_party(latest[2])]
        row = (margins or {}).get(seat, {}).get(term[:4])
        if row and len(row) > 4 and row[4]:
            surname = row[4].replace(",", " ").split()[-1].lower()
            roster_name = roster[0].lower() if roster else ""
            if roster and (surname in roster_name.replace("-", " ").split() or roster_name.endswith(surname)):
                return roster_out
            return [pretty_name(row[4]), canonical_party(row[1])]
    return roster_out


def margin_type_for(margins, day, elections):
    """Seat type (marginal / fairly_safe / safe) at the latest election on or
    before day that has a row in margins ({"2019": [pct, party, type, ...]}),
    else None. The electorates table only holds 2019 and 2022, so a grant
    before 18 May 2019 has no margin type."""
    if not day or not margins:
        return None
    best = None
    for e in elections:
        row = margins.get(e[:4])
        if row and e <= day and (best is None or e > best[0]):
            best = (e, row)
    return best[1][2] if best else None


def months_to_election_bucket(day, elections):
    """Bucket of months from day to the next election in elections (sorted ISO
    days). A day after the last listed election is 'unknown'."""
    if not day:
        return "unknown"
    nxt = next((e for e in elections if e >= day), None)
    if nxt is None:
        return "unknown"
    try:
        days = (date.fromisoformat(nxt) - date.fromisoformat(day)).days
    except ValueError:
        return "unknown"
    months = days / 30.4375
    for limit, name in ((3, "0_3"), (6, "3_6"), (12, "6_12"), (24, "12_24")):
        if months < limit:
            return name
    return "over_24"


def approval_bucket(start, approval):
    """Bucket of (start date minus approval date) in days; None when either is missing."""
    if not start or not approval:
        return None
    try:
        d = (date.fromisoformat(start) - date.fromisoformat(approval)).days
    except ValueError:
        return None
    if d < 0:
        return "before_approval"
    if d <= 30:
        return "0_30"
    if d <= 90:
        return "31_90"
    if d <= 365:
        return "91_365"
    return "over_365"


def build_program_file(pid, key, jur, gs, ctx):
    """The program file (docs/DATA-GRANTS.md "Program files") for one program.

    gs: the program's grant dicts as the remote program builds them (id, rid,
    v, n, ag, cat, fy, s, a, pbs, sel, el, elst, adhoc, guid, desc, raw).
    ctx: recips (rid -> {canonical_name, kind, donor_entity_id}), seat_members
    (seat -> [[name, party, entered, left], ...]), margins (seat -> {year:
    [pct, party, type, state, candidate]}), current_seats (seat -> [name,
    party], optional), blocs, government, elections (the file's own
    jurisdiction, for the election timing; seat holders always follow the
    federal calendar), agency_label (callable), generated (iso timestamp).
    Federal-only fields (pbs, seats, margins, bloc, mt, a, approval timing,
    electorate gov/opp/cross) are null in a QLD file: QLD electorates are
    federal divisions and state money against federal seats would mislead.
    """
    federal = jur == "federal"
    recips = ctx["recips"]
    seat_members = ctx["seat_members"]
    margins = ctx["margins"]
    current_seats = ctx.get("current_seats")
    blocs, government, elections = ctx["blocs"], ctx["government"], ctx["elections"]
    label = ctx["agency_label"]

    def pair():
        return [0.0, 0]

    def add(p, v):
        p[0] += v
        p[1] += 1

    def out_pair(p):
        return [round(p[0]), p[1]]

    agencies = Counter()
    cats = Counter()
    pbs = Counter()
    sel = defaultdict(pair)
    sel_known = pair()
    by = defaultdict(pair)
    el_known = pair()
    seats = {k: pair() for k in SEAT_BLOCS}
    margin_mix = {k: pair() for k in MARGIN_TYPES}
    approval_known = pair()
    ab = {k: pair() for k in APPROVAL_BUCKETS}
    mte = {k: pair() for k in ELECTION_BUCKETS}
    el_rows = defaultdict(lambda: {"t": 0.0, "c": 0, "gov": 0.0, "opp": 0.0, "cross": 0.0,
                                   "st": Counter(), "holders": Counter()})
    recipients = {}
    donor_rids = set()
    dt = 0.0
    adhoc = 0.0
    fys = set()
    rows = []
    for g in gs:
        v = g["v"] or 0.0
        s = iso_day(g.get("s"))
        a = iso_day(g.get("a")) if federal else None
        day = s or a
        rec = recips.get(g["rid"]) if g.get("rid") else None
        rkey = g.get("rid") or ("name:" + (g.get("raw") or ""))
        r = recipients.get(rkey)
        if r is None:
            r = recipients[rkey] = [g.get("rid"), (rec["canonical_name"] if rec else g.get("raw")) or "Recipient not recorded",
                                    (rec["kind"] if rec else None), 0.0, 0, bool(rec and rec.get("donor_entity_id"))]
        r[3] += v
        r[4] += 1
        if r[5]:
            dt += v
            donor_rids.add(rkey)
        agencies[label(g.get("ag"))] += v
        cats[g.get("cat") or "Not categorised"] += v
        if federal and g.get("pbs"):
            pbs[g["pbs"]] += v
        if g.get("sel"):
            add(sel[g["sel"]], v)
            add(sel_known, v)
        if g.get("fy"):
            add(by[g["fy"]], v)
            fys.add(g["fy"])
        if g.get("adhoc"):
            adhoc += v
        el = g.get("el")
        holder = seat_holder(el, day, seat_members, margins, current_seats) if el else None
        holder_out = holder
        bloc = mt = None
        if federal:
            bloc = bloc_for(holder[1], day, blocs, government) if (el and holder) else "unknown"
            mt = margin_type_for(margins.get(el), day, elections) if el else None
            add(seats[bloc], v)
            add(margin_mix[mt or "unknown"], v)
            if a:
                add(approval_known, v)
            b = approval_bucket(s, a)
            if b:
                add(ab[b], v)
        add(mte[months_to_election_bucket(day, elections)], v)
        if el:
            add(el_known, v)
            e = el_rows[el]
            e["t"] += v
            e["c"] += 1
            if g.get("elst"):
                e["st"][g["elst"]] += 1
            if federal and bloc in ("gov", "opp", "cross"):
                e[bloc] += v
            if holder:
                e["holders"][(holder[0], holder[1])] += v
        row = {"id": g["id"], "v": round(v), "n": g.get("n"), "rid": g.get("rid"), "rn": r[1], "k": r[2],
               "fy": g.get("fy"), "s": s, "a": a, "sel": g.get("sel"), "el": el, "elst": g.get("elst") if el else None,
               "holder": holder_out, "bloc": bloc, "mt": mt, "adhoc": 1 if g.get("adhoc") else 0, "guid": g.get("guid")}
        rows.append((v, row))
    rows.sort(key=lambda x: -x[0])
    total = sum(v for v, _ in rows)
    fys_sorted = sorted(fys, key=fy_key)
    electorates = []
    for name, e in sorted(el_rows.items(), key=lambda kv: -kv[1]["t"]):
        st = e["st"].most_common(1)[0][0] if e["st"] else None
        if not st:
            m = margins.get(name) or {}
            st = next((v[3] for v in m.values() if len(v) > 3 and v[3]), None)
        row = {"n": name, "st": st, "t": round(e["t"]), "c": e["c"]}
        if federal:
            row.update({"gov": round(e["gov"]), "opp": round(e["opp"]), "cross": round(e["cross"])})
        # one row per member: the roster and the election results can spell the
        # same member's party differently (Nationals vs Liberal for an LNP seat)
        by_member = {}
        for (n, p), v in e["holders"].most_common():
            m = by_member.setdefault(n, {"t": 0.0, "parties": Counter()})
            m["t"] += v
            m["parties"][p] += v
        row["holders"] = [[n, m["parties"].most_common(1)[0][0], round(m["t"])]
                          for n, m in sorted(by_member.items(), key=lambda kv: -kv[1]["t"])]
        electorates.append(row)
    top_recipients = sorted(recipients.values(), key=lambda r: -r[3])[:PROGRAM_RECIPIENTS_MAX]
    names = Counter()
    for g in gs:
        names[g.get("pr") or g.get("n") or pid] += 1
    return {
        "id": pid, "key": key, "n": names.most_common(1)[0][0] if names else pid, "jur": jur,
        "ag": agencies.most_common(1)[0][0] if agencies else "Agency not recorded",
        "agencies": [[a_, round(v)] for a_, v in agencies.most_common(6)],
        "t": round(total), "c": len(rows), "r": len(recipients), "dt": round(dt), "dr": len(donor_rids), "adhoc": round(adhoc),
        "y0": fys_sorted[0] if fys_sorted else None, "y1": fys_sorted[-1] if fys_sorted else None,
        "cats": [[c, round(v)] for c, v in cats.most_common(8)],
        "pbs": ([[p_, round(v)] for p_, v in pbs.most_common(6)] if federal else None),
        "sel": {k: out_pair(v) for k, v in sorted(sel.items(), key=lambda kv: -kv[1][0])},
        "sel_known": out_pair(sel_known),
        "by": {fy: out_pair(by[fy]) for fy in fys_sorted},
        "el_known": out_pair(el_known),
        "seats": ({k: out_pair(v) for k, v in seats.items()} if federal else None),
        "margins": ({k: out_pair(v) for k, v in margin_mix.items()} if federal else None),
        "electorates": electorates,
        "recipients": [[r[0], r[1], r[2], round(r[3]), r[4], r[5]] for r in top_recipients],
        "timing": {
            "approval_known": out_pair(approval_known) if federal else None,
            "approval_to_start_days": ({k: out_pair(v) for k, v in ab.items()} if federal else None),
            "months_to_election": {k: out_pair(v) for k, v in mte.items()},
        },
        "grants": [row for _, row in rows[:PROGRAM_GRANTS_MAX]],
        "grants_total": len(rows), "grants_listed": min(len(rows), PROGRAM_GRANTS_MAX),
        "generated": ctx["generated"],
    }


def fy_key(fy):
    return int(fy[:4]) if fy and fy[:4].isdigit() else -1


def program_index_extras(pf, jur):
    """The fields a programs[] index row gains from its program file."""
    out = {"key": pf["key"], "cnc": pf["sel"].get("Closed Non-Competitive", [0, 0])[0], "selk": pf["sel_known"][0]}
    if jur == "federal":
        out.update({"gov": pf["seats"]["gov"][0], "elk": pf["el_known"][0], "marg": pf["margins"]["marginal"][0]})
    return out


SHARED_FUNCTIONS = (iso_day, program_key, government_at, bloc_for, holder_at, canonical_party, pretty_name, seat_holder,
                    margin_type_for, months_to_election_bucket, approval_bucket, build_program_file, fy_key,
                    program_index_extras)
SHARED_CONSTANTS = ("ELECTIONS", "BLOCS", "GOVERNMENT", "BY_ELECTIONS", "PARTY_ALIASES", "PROGRAM_GRANTS_MAX",
                    "PROGRAM_RECIPIENTS_MAX", "SEAT_BLOCS", "MARGIN_TYPES", "APPROVAL_BUCKETS", "ELECTION_BUCKETS")


def current_seats_from_roster(path: Path) -> dict:
    """seat -> [name, party] for the current federal House from portal/public/parliamentarians.json
    (the APH current list; when a seat has two current rows the one with more speeches wins)."""
    if not path.exists():
        return {}
    people = json.loads(path.read_text(encoding="utf-8")).get("people", [])
    best: dict = {}
    for p in people:
        if not p.get("current"):
            continue
        for r in p.get("representation", []):
            if r.get("jurisdiction") == "federal" and r.get("chamber") == "representatives" and r.get("electorate"):
                seat = r["electorate"]
                cand = (p.get("speeches") or 0, p["name"], p.get("party_now") or p.get("party"))
                if seat not in best or cand[0] > best[seat][0]:
                    best[seat] = cand
    return {seat: [name, party] for seat, (_, name, party) in sorted(best.items())}


def remote_program(current_seats: dict | None = None) -> str:
    """The stdlib-only program streamed to the DB host: shared rules + REMOTE_BODY."""
    head = ["from __future__ import annotations",
            "import json, re, sqlite3, sys, zlib",
            "from collections import Counter, defaultdict",
            "from datetime import date, datetime, timezone",
            "ISO_DAY = re.compile(r'^\\d{4}-\\d{2}-\\d{2}')"]
    for name in SHARED_CONSTANTS:
        head.append(f"{name} = {globals()[name]!r}")
    head.append(f"CURRENT_SEATS = {current_seats or {}!r}")
    return "\n".join(head) + "\n\n" + "\n\n".join(inspect.getsource(f) for f in SHARED_FUNCTIONS) + "\n" + REMOTE_BODY

REMOTE_BODY = r'''
JUR = sys.argv[1]
TOP_RECIPIENTS = int(sys.argv[2]) if len(sys.argv) > 2 else 3800
CAP_RECIPIENTS = int(sys.argv[3]) if len(sys.argv) > 3 else 6000
FORCE_ABNS = [a for a in sys.argv[4].split(",")] if len(sys.argv) > 4 and sys.argv[4] else []
TOP_PROGRAMS = int(sys.argv[5]) if len(sys.argv) > 5 else 500
GRANTS_PER_DETAIL = 40
DB = "/home/jake/.cache/autoresearch/parli.db"

db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
db.execute("PRAGMA busy_timeout = 600000")
db.row_factory = sqlite3.Row
q = lambda s, *p: db.execute(s, p).fetchall()
has = lambda t: bool(q("SELECT name FROM sqlite_master WHERE name = ?", t))

EXPOSED_STATES = ("qld", "vic", "tas")

def fy_of(iso):
    if not iso or len(iso) < 7:
        return None
    y, m = int(iso[:4]), int(iso[5:7])
    s = y if m >= 7 else y - 1
    return f"{s}-{str(s + 1)[2:]}"

def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s or "x"

def file_key(rid):
    kind, _, rest = rid.partition(":")
    return f"{kind}-{slug(rest)}"

# ── recipients + keys ────────────────────────────────────────────────────────
recips = {r["recipient_id"]: dict(r) for r in q("SELECT * FROM ext_grant_recipients")}
keys = {}
for r in q("SELECT source, key_type, key_value, recipient_id FROM ext_grant_recipient_keys"):
    keys[(r["source"], r["key_type"], r["key_value"])] = r["recipient_id"]

def rid_for(source, abn, name):
    if abn:
        rid = keys.get((source, "abn", abn))
        if rid:
            return rid
    return keys.get((source, "name", (name or "").strip()))

# ── postcode -> electorate ───────────────────────────────────────────────────
pc_el = {}
for r in q("SELECT postcode, electorate_name, state, ratio FROM postcode_electorates ORDER BY ratio"):
    pc_el[r["postcode"]] = (r["electorate_name"], (r["state"] or "").lower())   # highest ratio wins (sorted asc)

# ── grants ───────────────────────────────────────────────────────────────────
grants = []   # dicts: id, rid, v, n(title), ag, pr, cat, fy, s, e, adhoc, sel, el, elst, url, abn
if JUR == "federal":
    details = {}
    if has("ext_grant_details"):
        for r in q("SELECT ga_id, guid, recipient_abn, selection_process, program, delivery_postcode, "
                   "recipient_postcode, delivery_state, recipient_state, approval_date, pbs_program "
                   "FROM ext_grant_details WHERE http_status = 200"):
            details[r["ga_id"]] = r
    for r in q("SELECT ga_id, activity, agency, category, publish_date, start_date, end_date, financial_year, "
               "value, go_id, recipient_name, ad_hoc, aggregate FROM ext_grants"):
        d = details.get(r["ga_id"])
        abn = d["recipient_abn"] if d else None
        name = r["recipient_name"]
        rid = rid_for("grantconnect", abn, name)
        if r["aggregate"]:
            rid = "undisclosed:federal"
        el = elst = None
        if d:
            pc = d["delivery_postcode"] or d["recipient_postcode"]
            if pc and pc in pc_el:
                el, elst = pc_el[pc]
        grants.append({
            "id": r["ga_id"], "rid": rid, "v": r["value"] or 0.0, "n": r["activity"], "ag": r["agency"],
            "pr": (d["program"] if d and d["program"] else None), "go": r["go_id"], "cat": r["category"],
            "fy": r["financial_year"] or fy_of(r["publish_date"]), "s": r["start_date"], "e": r["end_date"],
            "adhoc": int(r["ad_hoc"] or 0), "sel": (d["selection_process"] if d else None),
            "el": el, "elst": elst, "abn": abn, "raw": name,
            "guid": (d["guid"] if d and d["guid"] else None),
            "a": (d["approval_date"] if d else None), "pbs": (d["pbs_program"] if d else None),
        })
    src_meta = {
        "jurisdiction": "federal", "label": "Commonwealth", "sourceShort": "GrantConnect grant awards",
        "source": "GrantConnect (Department of Finance), Grant Award records, via parli.db ext_grants / ext_grant_details",
        "source_url": "https://www.grants.gov.au/Ga/List",
        "licence": "CC BY 3.0 AU (GrantConnect, Department of Finance)",
        "threshold": "Every Commonwealth grant award must be published on GrantConnect within 21 days of the agreement taking effect (mandatory since 31 December 2017). Aggregate awards bundle many small recipients and are shown as not disclosed.",
    }
else:
    for r in q("SELECT grant_id, title, description, recipient, recipient_abn, amount, agency, program, electorate, "
               "start_date, end_date, grant_type, source_url, category, recipient_type, financial_year "
               "FROM government_grants WHERE source = 'qld_expenditure'"):
        abn = re.sub(r"\D", "", r["recipient_abn"] or "")
        rid = rid_for("qld_expenditure", abn if abn not in ("", "0") else None, r["recipient"])
        grants.append({
            "id": f"qld-{r['grant_id']}", "rid": rid, "v": r["amount"] or 0.0, "n": r["title"] or r["program"],
            "ag": r["agency"], "pr": r["program"], "go": None, "cat": r["category"],
            "fy": r["financial_year"] or fy_of(r["start_date"]), "s": r["start_date"], "e": r["end_date"],
            "adhoc": 1 if r["grant_type"] in ("discretionary", "one_off") else 0,
            "sel": {"formula": "Formula or entitlement", "discretionary": "Discretionary",
                    "one_off": "One-off", "multi_year": "Multi-year agreement"}.get(r["grant_type"]),
            "el": r["electorate"], "elst": "qld" if r["electorate"] else None,
            "abn": abn if abn not in ("", "0") else None, "raw": r["recipient"],
            "guid": None,
            "desc": ((r["description"] or "")[:120] if (r["description"] or "").lower()[:40] != (r["title"] or "").lower()[:40] else None) or None,
        })
    src_meta = {
        "jurisdiction": "qld", "label": "Queensland", "sourceShort": "QLD Government Investment Portal",
        "source": "Queensland Government Investment Portal consolidated expenditure data (data.qld.gov.au), via parli.db government_grants",
        "source_url": "https://www.data.qld.gov.au/dataset/queensland-government-investment-portal-expenditure",
        "licence": "CC BY 4.0 (Queensland Government, data.qld.gov.au)",
        "threshold": "Annual expenditure lines per funding agreement for grants, service agreements and other assistance; a multi-year agreement appears once per financial year it was paid. 'Multiple' recipients are shown as not disclosed.",
    }

# ── agency short names (QLD publishes codes) ────────────────────────────────
QLD_AGENCIES = {
    "DTMR": "Transport and Main Roads", "QRA": "Queensland Reconstruction Authority",
    "DESBT": "Employment, Small Business and Training", "DoE": "Education", "QH": "Queensland Health",
    "DHPW": "Housing and Public Works", "DJAG": "Justice and Attorney-General",
    "DCSYW": "Child Safety, Youth and Women", "DES": "Environment and Science",
    "DCDSS": "Communities, Disability Services and Seniors", "QT": "Queensland Treasury",
    "DCSSDS": "Child Safety, Seniors and Disability Services", "DCHDE": "Communities, Housing and Digital Economy",
    "DCYJMA": "Children, Youth Justice and Multicultural Affairs", "DLGRMA": "Local Government, Racing and Multicultural Affairs",
    "DAF": "Agriculture and Fisheries", "DSDMIP": "State Development, Manufacturing, Infrastructure and Planning",
    "DSDILGP": "State Development, Infrastructure, Local Government and Planning", "DTIS": "Tourism, Innovation and Sport",
    "DITID": "Innovation, Tourism Industry Development", "DATSIP": "Aboriginal and Torres Strait Islander Partnerships",
    "DSDSATSIP": "Seniors, Disability Services and Aboriginal and Torres Strait Islander Partnerships",
    "DPC": "Premier and Cabinet", "QFES": "Queensland Fire and Emergency Services", "QPS": "Queensland Police Service",
    "DNRME": "Natural Resources, Mines and Energy", "DNRM": "Natural Resources and Mines", "DEPW": "Energy and Public Works",
    "DRDMW": "Regional Development, Manufacturing and Water", "DTATSIPCA": "Treaty, Aboriginal and Torres Strait Islander Partnerships, Communities and the Arts",
    "DYJESBT": "Youth Justice, Employment, Small Business and Training", "DHLGPPW": "Housing, Local Government, Planning and Public Works",
    "DCSODSFB": "Customer Services, Open Data and Small and Family Business", "DPI": "Primary Industries",
    "DETSI": "Environment, Tourism, Science and Innovation", "DSDIP": "State Development, Infrastructure and Planning",
    "DLGWV": "Local Government, Water and Volunteers", "DFSDSCS": "Families, Seniors, Disability Services and Child Safety",
    "DWSSA": "Women, Seniors and Social Affairs", "DoH": "Housing", "DJ": "Justice", "DSSC": "Sport, Racing and Olympic and Paralympic Games",
}

def agency_label(a):
    if JUR == "qld" and a and a in QLD_AGENCIES:
        return f"{QLD_AGENCIES[a]} ({a})"
    return a or "Agency not recorded"

# ── donor money per donor entity ────────────────────────────────────────────
alias_to_entity = {}
for r in q("SELECT alias_raw, entity_id, seen_in FROM ext_donor_aliases"):
    alias_to_entity[r["alias_raw"]] = r["entity_id"]
donor_entities = {r["entity_id"]: dict(r) for r in q("SELECT entity_id, canonical_name, kind, abn FROM ext_donor_entities")}
needed = {v["donor_entity_id"] for v in recips.values() if v.get("donor_entity_id")}
donor_money = {}   # eid -> {"aec": {...}, "state": {jur: {...}}}
def dm(eid):
    d = donor_money.get(eid)
    if d is None:
        d = donor_money[eid] = {"aec": {"total": 0.0, "count": 0, "party": Counter(), "py": defaultdict(Counter), "y0": None, "y1": None},
                                "state": {}}
    return d
for r in q("SELECT donor_name, recipient_canonical, amount, financial_year, donation_type FROM donations "
           "WHERE recipient_canonical IS NOT NULL AND amount > 0 AND donation_type NOT IN ('flagged_review')"):
    eid = alias_to_entity.get(r["donor_name"])
    if eid not in needed:
        continue
    d = dm(eid)["aec"]
    amt = r["amount"] or 0.0
    d["total"] += amt
    d["count"] += 1
    d["party"][r["recipient_canonical"]] += amt
    fy = r["financial_year"] or ""
    m = re.match(r"(\d{4})", fy)
    fyk = f"{m.group(1)}-{str(int(m.group(1)) + 1)[2:]}" if m else "undated"
    d["py"][r["recipient_canonical"]][fyk] += amt
    for k in ("y0", "y1"):
        pass
    if m:
        d["y0"] = m.group(1) if d["y0"] is None or m.group(1) < d["y0"] else d["y0"]
        d["y1"] = m.group(1) if d["y1"] is None or m.group(1) > d["y1"] else d["y1"]
for r in q("SELECT donor_name, jurisdiction, recipient_party, amount, financial_year, disclosure_type FROM ext_donations "
           "WHERE recipient_party IS NOT NULL AND amount > 0"):
    j = (r["jurisdiction"] or "").lower()
    if j not in EXPOSED_STATES:
        continue
    if (r["disclosure_type"] or "").lower() in ("loan", "compulsory party levy"):
        continue
    eid = alias_to_entity.get(r["donor_name"])
    if eid not in needed:
        continue
    st = dm(eid)["state"].setdefault(j, {"total": 0.0, "count": 0, "party": Counter(), "py": defaultdict(Counter)})
    amt = r["amount"] or 0.0
    st["total"] += amt
    st["count"] += 1
    st["party"][r["recipient_party"]] += amt
    st["py"][r["recipient_party"]][r["financial_year"] or "undated"] += amt

def donor_block(rec, full=False):
    eid = rec.get("donor_entity_id")
    if not eid:
        return None
    ent = donor_entities.get(eid, {})
    money = donor_money.get(eid)
    out = {"e": eid, "n": ent.get("canonical_name") or eid, "m": rec.get("donor_method"),
           "conf": rec.get("donor_confidence"), "on": rec.get("donor_matched_on")}
    if money:
        a = money["aec"]
        out["aec"] = round(a["total"])
        out["p"] = {k: round(v) for k, v in a["party"].most_common()}
        out["y0"], out["y1"] = a["y0"], a["y1"]
        if a["py"]:
            out["py"] = {p: {fy: round(v) for fy, v in ys.items()} for p, ys in a["py"].items()}
        if money["state"]:
            out["st"] = {j: {"t": round(s["total"]), "c": s["count"], "p": {k: round(v) for k, v in s["party"].most_common()},
                             **({"py": {p: {fy: round(v) for fy, v in ys.items()} for p, ys in s["py"].items()}} if full else {})}
                         for j, s in money["state"].items()}
    else:
        out["aec"] = 0
        out["p"] = {}
    return out

# ── aggregate ────────────────────────────────────────────────────────────────
agencies = Counter()
categories = Counter()
by_rid = defaultdict(list)
years = defaultdict(lambda: {"t": 0.0, "c": 0, "dt": 0, "adhoc": 0.0})
for g in grants:
    by_rid[g["rid"] or "unresolved"].append(g)
    agencies[agency_label(g["ag"])] += g["v"]
    categories[g["cat"] or "Not categorised"] += g["v"]
agency_idx = {a: i for i, (a, _) in enumerate(agencies.most_common())}
cat_idx = {c: i for i, (c, _) in enumerate(categories.most_common())}

total_dollars = sum(g["v"] for g in grants)
recipient_rows = []
for rid, gs in by_rid.items():
    rec = recips.get(rid)
    t = sum(g["v"] for g in gs)
    if rec is None:
        continue
    recipient_rows.append((rid, rec, gs, t))
recipient_rows.sort(key=lambda x: -x[3])
donor_rids = [x for x in recipient_rows if x[1].get("donor_entity_id")]
listed = []
seen = set()
for x in recipient_rows[:TOP_RECIPIENTS]:
    if x[1]["kind"] == "undisclosed":
        continue
    listed.append(x); seen.add(x[0])
for x in donor_rids:
    if x[0] in seen:
        continue
    if len(listed) >= CAP_RECIPIENTS:
        break
    listed.append(x); seen.add(x[0])
# A recipient listed in the other jurisdiction's export (matched by ABN) is
# always listed here too, when it has any grants in this jurisdiction, so the
# "pointer to its grants in the other jurisdiction" in the shard files is
# never dangling. This overrides both --top and --cap.
if FORCE_ABNS:
    rows_by_rid = {x[0]: x for x in recipient_rows}
    for abn in FORCE_ABNS:
        rid = f"abn:{abn}"
        if rid in seen:
            continue
        x = rows_by_rid.get(rid)
        if x is None or x[1]["kind"] == "undisclosed":
            continue
        listed.append(x); seen.add(x[0])
listed.sort(key=lambda x: -x[3])

all_years = sorted({g["fy"] for g in grants if g["fy"]}, key=fy_key)
kinds = defaultdict(lambda: {"t": 0.0, "c": 0, "r": 0, "dt": 0.0, "dr": 0})
for rid, rec, gs, t in recipient_rows:
    k = kinds[rec["kind"]]
    k["t"] += t; k["c"] += len(gs); k["r"] += 1
    if rec.get("donor_entity_id"):
        k["dt"] += t; k["dr"] += 1
undisclosed_total = sum(t for rid, rec, gs, t in recipient_rows if rec["kind"] == "undisclosed")
unresolved = by_rid.get("unresolved", [])

def by_year(gs):
    out = defaultdict(lambda: [0.0, 0])
    for g in gs:
        if g["fy"]:
            out[g["fy"]][0] += g["v"]; out[g["fy"]][1] += 1
    return {fy: [round(v), n] for fy, (v, n) in out.items()}

def by_year_cells(gs):
    """Aligned to meta.years: [[dollars, count] | 0, ...]."""
    b = by_year(gs)
    return [b[fy] if fy in b else 0 for fy in all_years]

SHARDS = 40
def shard_of(key):
    return zlib.crc32(key.encode("utf-8")) % SHARDS

index_recipients = []
details_out = {}
for rid, rec, gs, t in listed:
    is_donor = bool(rec.get("donor_entity_id"))
    ag = Counter(); cat = Counter(); sel = Counter(); el = Counter(); pr = Counter()
    adhoc = 0.0
    for g in gs:
        ag[agency_idx[agency_label(g["ag"])]] += g["v"]
        cat[cat_idx[g["cat"] or "Not categorised"]] += g["v"]
        if g["sel"]:
            sel[g["sel"]] += g["v"]
        if g["el"]:
            el[g["el"]] += g["v"]
        if g["adhoc"]:
            adhoc += g["v"]
        pr[g["pr"] or g["n"] or ""] += g["v"]
    fys = sorted({g["fy"] for g in gs if g["fy"]}, key=fy_key)
    fkey = file_key(rid)
    # Lean on purpose: the file key, first/last year, ABN, selection mix and
    # electorates are all derivable from `id` and `by` or live in the shard.
    entry = {
        "id": rid, "sh": shard_of(fkey), "n": rec["canonical_name"], "k": rec["kind"],
        "t": round(t), "c": len(gs), "ag": [i for i, _ in ag.most_common(2)],
        "adhoc": round(adhoc), "by": by_year_cells(gs),
    }
    d = donor_block(rec)
    if d:
        top = sorted(d.get("p", {}).items(), key=lambda kv: -kv[1])[:3]
        entry["d"] = {"e": d["e"], "n": d["n"], "m": d["m"], "aec": d.get("aec", 0), "p": dict(top)}
        if d.get("st"):
            entry["d"]["st"] = {j: {"t": v["t"]} for j, v in d["st"].items()}
    index_recipients.append(entry)
    # detail file
    gs_sorted = sorted(gs, key=lambda g: -g["v"])
    other_jur = "qld" if JUR == "federal" else "federal"
    other_total = rec.get("qld_total") if JUR == "federal" else rec.get("federal_total")
    other_count = rec.get("qld_count") if JUR == "federal" else rec.get("federal_count")
    details_out.setdefault(f"shard-{entry['sh']:02d}", {})[fkey] = {
        "id": rid, "n": rec["canonical_name"], "k": rec["kind"], "jur": JUR,
        "abn": rec.get("abn"), "abn_method": rec.get("abn_method"),
        "abr": ({"name": rec.get("abr_name"), "status": rec.get("abr_status"), "etype": rec.get("abr_etype"),
                 "state": rec.get("abr_state"), "postcode": rec.get("abr_postcode")} if rec.get("abr_name") else None),
        "aliases": json.loads(rec.get("aliases") or "[]"),
        "t": round(t), "c": len(gs), "y0": fys[0] if fys else None, "y1": fys[-1] if fys else None, "adhoc": round(adhoc),
        "by": by_year(gs),
        "agencies": [[a, round(v)] for a, v in ((list(agency_idx)[i], v) for i, v in ag.most_common(6))],
        "programs": [[p, round(v)] for p, v in pr.most_common(8)],
        "sel": ({k: round(v) for k, v in sel.most_common()} or None), "el": [[e, round(v)] for e, v in el.most_common(6)] or None,
        "grants": [{k: v for k, v in {
            "id": g["id"], "v": round(g["v"]), "n": g["n"], "ag": agency_label(g["ag"]),
            "pr": (g["pr"] if g["pr"] != g["n"] else None), "cat": g["cat"],
            "fy": g["fy"], "s": g["s"], "adhoc": g["adhoc"], "sel": g["sel"], "el": g["el"],
            "guid": g.get("guid"), "desc": g.get("desc"),
        }.items() if v not in (None, "", 0)} for g in gs_sorted[:GRANTS_PER_DETAIL]],
        "more": max(0, len(gs) - GRANTS_PER_DETAIL),
        "d": donor_block(rec, full=True),
        "other": ({"jur": other_jur, "t": round(other_total or 0), "c": other_count or 0, "f": file_key(rid)}
                  if (other_total or 0) > 0 else None),
    }

# programs. 136k federal awards carry no GO id in the register; when a fetched
# detail page names a program that only one GO id uses, the award files under
# that GO id (GA34203, Community Development Grants -> GO3141). Otherwise an
# award without a GO id is its own "activity:<title>" program, as before.
go_by_name = {}
if JUR == "federal":
    name_gos = defaultdict(Counter)
    for g in grants:
        if g["go"] and g["pr"]:
            name_gos[" ".join(g["pr"].split()).lower()][g["go"]] += 1
    # A name maps to the GO id that holds nearly all of its awards: the harvest
    # can tag a few awards of a sibling program with the same name (two GO6048
    # awards say "Community Development Grants"), which must not orphan GA34203.
    go_by_name = {n: c.most_common(1)[0][0] for n, c in name_gos.items()
                  if c.most_common(1)[0][1] >= 0.9 * sum(c.values())}
prog = defaultdict(lambda: {"t": 0.0, "c": 0, "r": set(), "dt": 0.0, "dr": set(), "adhoc": 0.0, "ag": Counter(), "names": Counter(), "fy": set(), "grants": []})
for g in grants:
    if JUR == "federal":
        key = g["go"] or (go_by_name.get(" ".join(g["pr"].split()).lower()) if g["pr"] else None) or ""
    else:
        key = " ".join((g["pr"] or "").split())
    if not key:
        key = "activity:" + (g["n"] or "")
    p = prog[key]
    p["grants"].append(g)
    p["t"] += g["v"]; p["c"] += 1
    if g["rid"]:
        p["r"].add(g["rid"])
        rec = recips.get(g["rid"])
        if rec and rec.get("donor_entity_id"):
            p["dt"] += g["v"]; p["dr"].add(g["rid"])
    if g["adhoc"]:
        p["adhoc"] += g["v"]
    p["ag"][agency_idx[agency_label(g["ag"])]] += g["v"]
    p["names"][(g["pr"] or g["n"] or key)] += 1
    if g["fy"]:
        p["fy"].add(g["fy"])
programs = []
listed_programs = sorted(prog.items(), key=lambda kv: -kv[1]["t"])[:TOP_PROGRAMS]
for key, p in listed_programs:
    fys = sorted(p["fy"], key=fy_key)
    programs.append({"id": key, "n": p["names"].most_common(1)[0][0], "ag": p["ag"].most_common(1)[0][0],
                     "t": round(p["t"]), "c": p["c"], "r": len(p["r"]), "dt": round(p["dt"]), "dr": len(p["dr"]),
                     "adhoc": round(p["adhoc"]), "y0": fys[0] if fys else None, "y1": fys[-1] if fys else None})

# electorates
el_rows = defaultdict(lambda: {"t": 0.0, "c": 0, "r": set(), "dt": 0.0, "dr": set(), "adhoc": 0.0, "st": Counter()})
el_known = 0.0
for g in grants:
    if not g["el"]:
        continue
    el_known += g["v"]
    e = el_rows[g["el"]]
    e["t"] += g["v"]; e["c"] += 1
    if g["elst"]:
        e["st"][g["elst"]] += 1
    if g["rid"]:
        e["r"].add(g["rid"])
        rec = recips.get(g["rid"])
        if rec and rec.get("donor_entity_id"):
            e["dt"] += g["v"]; e["dr"].add(g["rid"])
    if g["adhoc"]:
        e["adhoc"] += g["v"]
mps = defaultdict(list)
seat_members = defaultdict(list)
for r in q("SELECT full_name, party_canonical, party, electorate, entered_house, left_house FROM members "
           "WHERE chamber = 'representatives' AND state = 'federal' AND electorate IS NOT NULL "
           "AND (left_house IS NULL OR left_house >= '2010-01-01') AND (entered_house IS NULL OR entered_house <= '2026-12-31')"):
    if not r["full_name"] or (r["entered_house"] is None and r["left_house"] is None and not r["party_canonical"]):
        continue
    row = [r["full_name"], r["party_canonical"] or r["party"], r["entered_house"], r["left_house"]]
    seat_members[r["electorate"]].append(row)
    if r["left_house"] is None or r["left_house"] >= "2017-01-01":
        mps[r["electorate"]].append(row)
margins = defaultdict(dict)
for r in q("SELECT electorate_name, state, year, margin_pct, winning_party, seat_type, winning_candidate FROM electorates"):
    margins[r["electorate_name"]][str(r["year"])] = [r["margin_pct"], r["winning_party"], r["seat_type"], (r["state"] or "").lower(),
                                                     r["winning_candidate"]]

# program files (one per listed program) and the index row extras
generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
program_ctx = {"recips": recips, "seat_members": seat_members, "margins": margins, "current_seats": CURRENT_SEATS,
               "blocs": BLOCS, "government": GOVERNMENT[JUR], "elections": ELECTIONS[JUR], "agency_label": agency_label,
               "generated": generated}
programs_out = {}
for row, (key, p) in zip(programs, listed_programs):
    fkey = program_key(key)
    if fkey in programs_out:   # two ids that slug the same way: the larger keeps the clean key
        n = 2
        while f"{fkey}-{n}" in programs_out:
            n += 1
        fkey = f"{fkey}-{n}"
    pf = build_program_file(key, fkey, JUR, p["grants"], program_ctx)
    programs_out[fkey] = pf
    row.update(program_index_extras(pf, JUR))
electorates = []
for name, e in sorted(el_rows.items(), key=lambda kv: -kv[1]["t"]):
    st = e["st"].most_common(1)[0][0] if e["st"] else (next(iter(margins.get(name, {}).values()), [None, None, None, None])[3])
    electorates.append({"n": name, "st": st, "t": round(e["t"]), "c": e["c"], "r": len(e["r"]), "dt": round(e["dt"]),
                        "dr": len(e["dr"]), "adhoc": round(e["adhoc"]),
                        "mps": sorted(mps.get(name, []), key=lambda m: m[2] or ""),
                        "margin": {y: v[:3] for y, v in margins.get(name, {}).items()}})

for g in grants:
    y = years[g["fy"] or "undated"]
    y["t"] += g["v"]; y["c"] += 1
    if g["adhoc"]:
        y["adhoc"] += g["v"]
    rec = recips.get(g["rid"]) if g["rid"] else None
    if rec and rec.get("donor_entity_id"):
        y["dt"] += g["v"]

donor_total = sum(t for rid, rec, gs, t in recipient_rows if rec.get("donor_entity_id"))
donor_count = sum(1 for rid, rec, gs, t in recipient_rows if rec.get("donor_entity_id"))
abn_known = sum(g["v"] for g in grants if g["abn"])
details_fetched = sum(1 for g in grants if JUR == "federal" and g["sel"] is not None)
sel_mix = Counter()
for g in grants:
    if g["sel"]:
        sel_mix[g["sel"]] += g["v"]

meta = dict(src_meta)
meta.update({
    "generated": generated,
    "coverage": (f"awards published {min(g['s'] or '9999' for g in grants)[:10]} to {max((g['s'] or '') for g in grants)[:10]}"
                 if JUR == "federal" else f"financial years {all_years[0]} to {all_years[-1]}"),
    "years": all_years,
    "chart_years": [fy for fy in all_years if years[fy]["t"] >= max(v["t"] for v in years.values()) * 0.01],
    "shards": SHARDS,
    "government": GOVERNMENT[JUR], "blocs": BLOCS, "elections": ELECTIONS[JUR],
    "counts": {
        "grants": len(grants), "dollars": round(total_dollars),
        "recipients": len(recipient_rows), "recipients_listed": len(index_recipients),
        "top_listed": TOP_RECIPIENTS, "cap_listed": CAP_RECIPIENTS,
        "donor_recipients": donor_count, "donor_dollars": round(donor_total),
        "donor_share": round(donor_total / total_dollars, 4) if total_dollars else 0,
        "undisclosed_dollars": round(undisclosed_total), "unresolved_rows": len(unresolved),
        "abn_known_share": round(abn_known / total_dollars, 4) if total_dollars else 0,
        "electorate_known_share": round(el_known / total_dollars, 4) if total_dollars else 0,
        "details_fetched": details_fetched,
        "agencies": len(agency_idx), "programs_total": len(prog), "programs_listed": len(programs),
        "program_files": len(programs_out),
    },
    "selection_mix": {k: round(v) for k, v in sel_mix.most_common()},
    "caveats": [
        "Grant totals are awarded values as published; a varied award counts at its current value. Aggregate awards and awards whose recipient was withheld sit in the not-disclosed bucket.",
        "A recipient counts as a donor when its ABN, or a unique organisation name, matches an entity in the donor register (AEC returns and the exposed state registers). People are never matched by name.",
        "AEC donations and state-register gifts are shown side by side and never summed: AEC returns already include state branch receipts.",
        "A donor receiving a grant is a fact about the public record, not a finding: most programs are open and competitive, and the selection process is shown wherever the source records it.",
    ] + ([
        "Recipient ABNs, locations and selection processes come from each award's detail page; the share of dollars with a detail page fetched is in counts.electorate_known_share and counts.abn_known_share. Electorates are mapped from the delivery or recipient postcode and are approximate where a postcode straddles a boundary or a redistribution moved it.",
    ] if JUR == "federal" else [
        "Electorates are the federal divisions the Queensland data records for each funding line; the government of the day for these grants is the Queensland Government.",
    ]),
})

out = {
    "index": {
        "meta": meta,
        "agencies": [a for a in agency_idx],
        "categories": [c for c in cat_idx],
        "recipients": index_recipients,
        "programs": programs,
        "electorates": electorates,
        "years": {fy: {"t": round(v["t"]), "c": v["c"], "dt": round(v["dt"]), "adhoc": round(v["adhoc"])} for fy, v in years.items()},
        "kinds": {k: {"t": round(v["t"]), "c": v["c"], "r": v["r"], "dt": round(v["dt"]), "dr": v["dr"]} for k, v in sorted(kinds.items(), key=lambda kv: -kv[1]["t"])},
    },
    "details": details_out,   # shard name -> {file key -> detail}
    "programs": programs_out,   # file key -> program file
}
json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
'''


INDEX_SIZE_LIMIT = 1_600_000   # bytes; over it the listed programs fall back to 300


def write_outputs(data: dict, out: Path, jur: str) -> dict:
    """Split the remote program's JSON into the index, the shards and the program files.

    Stale files (a recipient or program that fell off the list) are removed so
    each directory is exactly the listed set. Returns what was written.
    """
    graph = out / "graph"
    graph.mkdir(parents=True, exist_ok=True)
    index_path = graph / f"grants.{jur}.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(data["index"], f, ensure_ascii=False, separators=(",", ":"))
    ddir = out / "grants" / jur
    ddir.mkdir(parents=True, exist_ok=True)
    keep = set()
    for shard, bundle in data["details"].items():
        keep.add(f"{shard}.json")
        with open(ddir / f"{shard}.json", "w", encoding="utf-8") as f:
            json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
    removed = 0
    for p in ddir.glob("*.json"):
        if p.name not in keep:
            p.unlink()
            removed += 1
    pdir = ddir / "programs"
    pdir.mkdir(parents=True, exist_ok=True)
    keep_programs = set()
    for key, pf in data.get("programs", {}).items():
        keep_programs.add(f"{key}.json")
        with open(pdir / f"{key}.json", "w", encoding="utf-8") as f:
            json.dump(pf, f, ensure_ascii=False, separators=(",", ":"))
    for p in pdir.glob("*.json"):
        if p.name not in keep_programs:
            p.unlink()
            removed += 1
    return {
        "index_path": index_path, "index_size": index_path.stat().st_size,
        "shards": len(keep), "detail_files": sum(len(b) for b in data["details"].values()),
        "detail_bytes": sum((ddir / n).stat().st_size for n in keep),
        "program_files": len(keep_programs), "program_bytes": sum((pdir / n).stat().st_size for n in keep_programs),
        "removed": removed,
    }


def run_remote(host: str, jur: str, top: int, cap: int, force_abns: list[str], programs: int) -> dict | None:
    current = current_seats_from_roster(ROOT / "portal" / "public" / "parliamentarians.json")
    proc = subprocess.run(["ssh", host, "python3", "-", jur, str(top), str(cap), ",".join(force_abns), str(programs)],
                          input=remote_program(current), capture_output=True, text=True, timeout=3600)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr[-4000:])
        return None
    return json.loads(proc.stdout)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("jurisdiction", choices=["federal", "qld"])
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT))
    ap.add_argument("--host", default=DB_HOST)
    ap.add_argument("--top", type=int, default=3800, help="largest recipients listed by dollars")
    ap.add_argument("--cap", type=int, default=6000, help="hard cap on listed recipients (donors fill up to it)")
    ap.add_argument("--programs", type=int, default=500,
                    help="programs listed in the index, each with a file (falls back to 300 if the index passes 1.6 MB)")
    args = ap.parse_args()

    # A recipient listed in the *other* jurisdiction's export (by ABN) is
    # always forced into this one's listed set when it has any grants here,
    # so a shard file's pointer into the other jurisdiction never dangles.
    other_jur = "qld" if args.jurisdiction == "federal" else "federal"
    other_index = Path(args.out_dir) / "graph" / f"grants.{other_jur}.json"
    force_abns: list[str] = []
    if other_index.exists():
        other_data = json.loads(other_index.read_text(encoding="utf-8"))
        force_abns = sorted({
            rid.split(":", 1)[1]
            for rid in (r["id"] for r in other_data.get("recipients", []))
            if rid.startswith("abn:")
        })

    data = run_remote(args.host, args.jurisdiction, args.top, args.cap, force_abns, args.programs)
    if data is None:
        return 1
    out = Path(args.out_dir)
    w = write_outputs(data, out, args.jurisdiction)
    if w["index_size"] > INDEX_SIZE_LIMIT and args.programs > 300:
        print(f"index is {w['index_size']/1024:.0f} KB with {args.programs} programs; re-running with 300")
        data = run_remote(args.host, args.jurisdiction, args.top, args.cap, force_abns, 300)
        if data is None:
            return 1
        w = write_outputs(data, out, args.jurisdiction)
    c = data["index"]["meta"]["counts"]
    print(f"{w['index_path']} {w['index_size']/1024:.0f} KB; {w['detail_files']} recipient files in {w['shards']} shards "
          f"({w['detail_bytes']/1024/1024:.1f} MB); {w['program_files']} program files ({w['program_bytes']/1024/1024:.1f} MB); "
          f"{w['removed']} stale files removed")
    print(f"  {c['grants']:,} grants, ${c['dollars']/1e9:.2f}B, {c['recipients']:,} recipients "
          f"({c['recipients_listed']:,} listed), donors: {c['donor_recipients']:,} recipients / "
          f"${c['donor_dollars']/1e9:.2f}B ({c['donor_share']*100:.1f}%); ABN known {c['abn_known_share']*100:.0f}% of dollars; "
          f"electorate known {c['electorate_known_share']*100:.0f}%; programs listed {c['programs_listed']} of {c['programs_total']:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
