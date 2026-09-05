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
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DEFAULT_OUT = ROOT / "portal" / "public"
DB_HOST = os.environ.get("OPAX_DB_HOST", "desktop")

REMOTE = r'''
import json, re, sqlite3, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

JUR = sys.argv[1]
TOP_RECIPIENTS = int(sys.argv[2]) if len(sys.argv) > 2 else 1200
CAP_RECIPIENTS = int(sys.argv[3]) if len(sys.argv) > 3 else 3600
TOP_PROGRAMS = 300
GRANTS_PER_DETAIL = 40
DB = "/home/jake/.cache/autoresearch/parli.db"

db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
db.execute("PRAGMA busy_timeout = 600000")
db.row_factory = sqlite3.Row
q = lambda s, *p: db.execute(s, p).fetchall()
has = lambda t: bool(q("SELECT name FROM sqlite_master WHERE name = ?", t))

BLOCS = {"Liberal": "Coalition", "Nationals": "Coalition", "LNP": "Coalition",
         "Country Liberal Party": "Coalition", "Labor": "Labor"}
GOVERNMENT = {
    "federal": [["2013-09-18", "2022-05-23", "Coalition"], ["2022-05-23", None, "Labor"]],
    "qld": [["2012-03-26", "2015-02-14", "LNP"], ["2015-02-14", "2024-10-28", "Labor"], ["2024-10-28", None, "LNP"]],
}
EXPOSED_STATES = ("qld", "vic", "tas")

def fy_of(iso):
    if not iso or len(iso) < 7:
        return None
    y, m = int(iso[:4]), int(iso[5:7])
    s = y if m >= 7 else y - 1
    return f"{s}-{str(s + 1)[2:]}"

def fy_key(fy):
    return int(fy[:4]) if fy and fy[:4].isdigit() else -1

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
                   "recipient_postcode, delivery_state, recipient_state FROM ext_grant_details WHERE http_status = 200"):
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
import zlib
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

# programs
prog = defaultdict(lambda: {"t": 0.0, "c": 0, "r": set(), "dt": 0.0, "dr": set(), "adhoc": 0.0, "ag": Counter(), "names": Counter(), "fy": set()})
for g in grants:
    key = (g["go"] or "") if JUR == "federal" else (g["pr"] or "")
    if not key:
        key = "activity:" + (g["n"] or "")
    p = prog[key]
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
for key, p in sorted(prog.items(), key=lambda kv: -kv[1]["t"])[:TOP_PROGRAMS]:
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
for r in q("SELECT full_name, party_canonical, party, electorate, entered_house, left_house FROM members "
           "WHERE chamber = 'representatives' AND state = 'federal' AND electorate IS NOT NULL "
           "AND (left_house IS NULL OR left_house >= '2017-01-01') AND (entered_house IS NULL OR entered_house <= '2026-12-31')"):
    if not r["full_name"] or (r["entered_house"] is None and r["left_house"] is None and not r["party_canonical"]):
        continue
    mps[r["electorate"]].append([r["full_name"], r["party_canonical"] or r["party"], r["entered_house"], r["left_house"]])
margins = defaultdict(dict)
for r in q("SELECT electorate_name, state, year, margin_pct, winning_party, seat_type FROM electorates"):
    margins[r["electorate_name"]][str(r["year"])] = [r["margin_pct"], r["winning_party"], r["seat_type"], (r["state"] or "").lower()]
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
    "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "coverage": (f"awards published {min(g['s'] or '9999' for g in grants)[:10]} to {max((g['s'] or '') for g in grants)[:10]}"
                 if JUR == "federal" else f"financial years {all_years[0]} to {all_years[-1]}"),
    "years": all_years,
    "chart_years": [fy for fy in all_years if years[fy]["t"] >= max(v["t"] for v in years.values()) * 0.01],
    "shards": SHARDS,
    "government": GOVERNMENT[JUR], "blocs": BLOCS,
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
}
json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
'''


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("jurisdiction", choices=["federal", "qld"])
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT))
    ap.add_argument("--host", default=DB_HOST)
    ap.add_argument("--top", type=int, default=1200, help="largest recipients listed by dollars")
    ap.add_argument("--cap", type=int, default=3600, help="hard cap on listed recipients (donors fill up to it)")
    args = ap.parse_args()

    proc = subprocess.run(["ssh", args.host, "python3", "-", args.jurisdiction, str(args.top), str(args.cap)],
                          input=REMOTE, capture_output=True, text=True, timeout=3600)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr[-4000:])
        return 1
    data = json.loads(proc.stdout)
    out = Path(args.out_dir)
    graph = out / "graph"
    graph.mkdir(parents=True, exist_ok=True)
    index_path = graph / f"grants.{args.jurisdiction}.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(data["index"], f, ensure_ascii=False, separators=(",", ":"))
    ddir = out / "grants" / args.jurisdiction
    ddir.mkdir(parents=True, exist_ok=True)
    # Stale detail files (a recipient that fell off the list) are removed so
    # the directory is exactly the listed set.
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
    c = data["index"]["meta"]["counts"]
    size = index_path.stat().st_size
    total_detail = sum((ddir / n).stat().st_size for n in keep)
    n_detail = sum(len(b) for b in data["details"].values())
    print(f"{index_path} {size/1024:.0f} KB; {n_detail} recipient files in {len(keep)} shards ({total_detail/1024/1024:.1f} MB), {removed} stale files removed")
    print(f"  {c['grants']:,} grants, ${c['dollars']/1e9:.2f}B, {c['recipients']:,} recipients "
          f"({c['recipients_listed']:,} listed), donors: {c['donor_recipients']:,} recipients / "
          f"${c['donor_dollars']/1e9:.2f}B ({c['donor_share']*100:.1f}%); ABN known {c['abn_known_share']*100:.0f}% of dollars; "
          f"electorate known {c['electorate_known_share']*100:.0f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
