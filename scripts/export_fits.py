#!/usr/bin/env python3
"""Export Foreign Influence Transparency Scheme matches for OPAX entry pages
-> portal/public/fits.json

Joins the FITS public register (ext_fits_* tables in parli.db, loaded by
parli.ingest.fits_register) to the entities OPAX has pages or rows for:

  donors           donor nodes in portal/public/graph/money*.json (+ access.json keys)
  lobbying firms   ext_lobbyists (the six lobbyist registers)
  parliamentarians portal/public/parliamentarians.json

Runs where parli.db lives (read-only) and needs the portal inputs beside it:

    ssh desktop mkdir -p /tmp/opax-fits/graph
    scp portal/public/graph/money*.json desktop:/tmp/opax-fits/graph/
    scp portal/public/access.json portal/public/parliamentarians.json desktop:/tmp/opax-fits/
    ssh desktop python3 - --portal /tmp/opax-fits < scripts/export_fits.py > portal/public/fits.json

Output shape (small: one list per matched entity):

  meta       generation notes, source, licence, table counts, match counts and the matched names
  by_entity  { app.js normName(label): [registration, ...] }  donors and lobbying firms
  people     { app.js normName(page name): [registration, ...] }  parliamentarians (past or present)

  registration = { registrant, registrant_id, registrant_type, occupation?, principal, country,
                   principal_type, activities: [type, ...], from, to, status (current|ceased), url }

Matching, so the numbers can be defended:

1. Organisations match EXACTLY after normalisation: lower-case, punctuation to spaces, and the
   tokens pty/ptd/ltd/limited/the/inc/co/holdings/group/australia/proprietary/incorporated
   dropped ("ptd" only because the donor returns misspell "Pty" that way: "Chevron Australia
   Ptd Ltd"). The registrant's registered name, trading name and "other names" are all tried
   against the donor label and the lobbying firm's entity and trading names — except for
   individuals, whose trading/other names are nicknames ("Josh", "Will") and would let a
   one-word donor label match a person. No fuzzy or prefix matching. Keys that collapse to one
   generic word ("Australia", "Group") or to a placeholder ("N/A", "none") are skipped.
2. Lobbying firms also match on ABN where both the register and the lobbyist register publish
   one (11 digits).
3. Parliamentarians match on surname plus first name, after dropping titles (Hon, Dr, Mr ...),
   post-nominals (AC, AO ...) and middle names, and after folding common short forms
   (Anthony/Tony, Patrick/Pat, Christopher/Chris ...). Person pages that are a bare surname
   (QLD Hansard speakers) never match: a namesake in another parliament must not inherit a
   registration. "Andrew Joyce" does not match "Barnaby Joyce"; "Anthony Abbott" matches
   "Tony Abbott".
4. Registration under the scheme is a disclosure the law requires of anyone undertaking
   registrable activities for a foreign principal; it is not a finding of wrongdoing. The
   export carries that sentence in meta so the client can print it.
"""

import argparse
import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = "/home/jake/.cache/autoresearch/parli.db"
SOURCE_URL = "https://foreigninfluence.ag.gov.au/"
LICENCE = "CC BY 4.0 (Attorney-General's Department, https://www.ag.gov.au/copyright-statement)"
DISCLAIMER = ("Registration under the Foreign Influence Transparency Scheme is a disclosure required by law "
              "of anyone undertaking registrable activities on behalf of a foreign principal; it is not a "
              "finding of wrongdoing.")
# The register's activity-type labels, shortened for the page (the long form is in ext_fits_activities).
ACTIVITY_SHORT = {
    "Other activity (former Cabinet Minister or recent designated position holder)": "Former Cabinet minister / designated position holder",
}

STRIP_TOKENS = {"pty", "ptd", "ltd", "limited", "the", "inc", "co", "holdings", "group", "australia",
                "proprietary", "incorporated"}
# Values registrants type into a name field when they mean "nothing here".
PLACEHOLDER_NAMES = {"n/a", "na", "n.a.", "none", "nil", "-", "--", "not applicable"}
# Mirrors normName() in portal/public/app.js exactly; the JSON keys use it.
JS_STRIP = {"pty", "ltd", "limited", "the", "inc", "co", "holdings"}
GENERIC_SINGLE = {"australia", "australian", "group", "trust", "foundation", "association", "club",
                  "company", "services", "service", "investments", "nominees", "family", "fund", "bank",
                  "union", "party", "council", "institute", "national", "international", "enterprises",
                  "corporation", "industries", "pacific", "capital", "management", "partners",
                  "consulting", "finance", "dept", "department", "office", "government", "advisory",
                  "strategies", "communications", "media", "energy", "university"}

TITLES = {"hon", "honourable", "the", "mr", "mrs", "ms", "miss", "dr", "professor", "prof", "sir", "dame",
          "senator", "rt", "right", "mx", "rev", "reverend"}
POSTNOMINALS = {"ac", "ao", "am", "oam", "qc", "sc", "kc", "mp", "mla", "mlc", "cmg", "obe", "mbe", "cbe",
                "psm", "ksj", "rfd", "csc", "afsm", "apm", "jp", "phd", "bmbs", "fracp", "fama", "frns"}
# Formal -> short form; both sides are folded before comparing first names.
NICKNAMES = {
    "anthony": "tony", "patrick": "pat", "christopher": "chris", "nicholas": "nick", "robert": "bob",
    "william": "bill", "james": "jim", "thomas": "tom", "joseph": "joe", "daniel": "dan", "matthew": "matt",
    "benjamin": "ben", "timothy": "tim", "jonathan": "jon", "andrew": "andrew", "edward": "ted",
    "alexander": "alex", "stephen": "steve", "steven": "steve", "peter": "peter", "joshua": "josh",
    "samuel": "sam", "gregory": "greg", "geoffrey": "geoff", "jeffrey": "jeff", "kenneth": "ken",
    "douglas": "doug", "ronald": "ron", "donald": "don", "lawrence": "larry", "frederick": "fred",
    "raymond": "ray", "philip": "phil", "phillip": "phil", "michael": "mike", "richard": "rick",
    "charles": "charlie", "david": "dave", "katherine": "kate", "kathryn": "kate", "catherine": "cathy",
    "elizabeth": "liz", "jennifer": "jenny", "margaret": "marg", "susan": "sue", "deborah": "deb",
    "rebecca": "bec", "jacqueline": "jackie", "victoria": "vicki", "penelope": "penny", "jessica": "jess",
    "alexandra": "alex", "gabrielle": "gabby", "kimberley": "kim", "kimberly": "kim", "christine": "chris",
    "christina": "chris", "melissa": "mel", "natasha": "tash", "nathaniel": "nat", "zachary": "zac",
    "harold": "harry", "henry": "harry", "albert": "bert", "leonard": "len", "terence": "terry",
    "maxwell": "max", "reginald": "reg", "russell": "russ", "vincent": "vince", "warwick": "warwick",
}


def norm(s):
    s = re.sub(r"[^a-z0-9]+", " ", (s or "").lower())
    return " ".join(t for t in s.split() if t not in STRIP_TOKENS)


def norm_js(s):
    s = re.sub(r"[^a-z0-9]+", " ", (s or "").lower())
    return " ".join(t for t in s.split() if t not in JS_STRIP)


def usable_org_key(k):
    toks = k.split()
    if not toks:
        return False
    if len(toks) == 1 and (toks[0] in GENERIC_SINGLE or len(toks[0]) < 4):
        return False
    return True


def person_key(name):
    """('tony', 'abbott') for 'Hon Anthony Abbott AC' / 'Tony Abbott'; None for bare surnames."""
    toks = [t for t in re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).split()]
    toks = [t for t in toks if t not in TITLES]
    while toks and toks[-1] in POSTNOMINALS:
        toks.pop()
    if len(toks) < 2:
        return None
    first, last = toks[0], toks[-1]
    if len(first) == 1:  # initials only ("J. Smith") cannot be matched safely
        return None
    return (NICKNAMES.get(first, first), last)


def abn_digits(v):
    d = re.sub(r"\D", "", str(v or ""))
    return d if len(d) == 11 else None


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"warning: {path} missing", file=sys.stderr)
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--portal", default="portal/public", help="directory holding graph/money*.json, access.json, parliamentarians.json")
    ap.add_argument("--out", default="-", help="output path (default stdout)")
    args = ap.parse_args()
    portal = Path(args.portal)

    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True, timeout=120)
    db.row_factory = sqlite3.Row

    # ── the register ────────────────────────────────────────────────────────
    registrants = {r["registrant_id"]: dict(r) for r in db.execute(
        "SELECT registrant_id, name, title, postnominals, other_names, trading_name, abn, registrant_type, occupation, "
        "registered_from, registered_to, status, source_url FROM ext_fits_registrants")}
    regs_by_registrant = defaultdict(list)
    for r in db.execute(
            "SELECT rr.registrant_id, rr.principal_id, rr.principal_name, rr.country, rr.activity_types, rr.start_date, "
            "rr.end_date, rr.status, rr.source_url, p.principal_type "
            "FROM ext_fits_registrations rr LEFT JOIN ext_fits_principals p ON p.principal_id = rr.principal_id "
            "ORDER BY rr.status = 'current' DESC, rr.start_date DESC"):
        regs_by_registrant[r["registrant_id"]].append(dict(r))
    counts = {t: db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("ext_fits_registrants", "ext_fits_principals", "ext_fits_registrations", "ext_fits_activities")}
    loaded = db.execute("SELECT MAX(loaded_at) FROM ext_ingest_log WHERE table_name = 'ext_fits_registrants'").fetchone()[0]

    def entries(rid):
        reg = registrants[rid]
        out = []
        for rr in regs_by_registrant.get(rid, []):
            e = {
                "registrant": reg["name"], "principal": rr["principal_name"], "country": rr["country"],
                "activities": [ACTIVITY_SHORT.get(a, a) for a in (rr["activity_types"] or "").split("; ") if a],
                "from": rr["start_date"], "to": rr["end_date"], "status": rr["status"],
                # the registrant's profile, foreign-principals tab (the per-principal anchor is in the table)
                "url": (rr["source_url"] or "").split("#")[0] or reg["source_url"],
            }
            if reg["registrant_type"] == "Individual" and reg["occupation"]:
                e["occupation"] = reg["occupation"]
            out.append(e)
        if not out:  # a registrant with no principal on the public register still shows as registered
            out.append({"registrant": reg["name"], "principal": None, "country": None, "activities": [],
                        "from": reg["registered_from"], "to": reg["registered_to"], "status": reg["status"],
                        "url": reg["source_url"]})
        return out

    # registrant name keys (organisations and individuals alike) -> registrant ids
    org_index = defaultdict(set)
    abn_index = defaultdict(set)
    for rid, reg in registrants.items():
        # An individual's trading/other names are nicknames ("Josh" for Joshua Zwar): as
        # organisation keys they would let a one-word donor label match a person.
        variants = ((reg["name"],) if reg["registrant_type"] == "Individual"
                    else (reg["name"], reg["trading_name"], reg["other_names"]))
        for nm in variants:
            if not nm or nm.strip().lower() in PLACEHOLDER_NAMES:
                continue
            k = norm(nm)
            if k and usable_org_key(k):
                org_index[k].add(rid)
        if abn_digits(reg["abn"]):
            abn_index[abn_digits(reg["abn"])].add(rid)
    person_index = defaultdict(set)
    for rid, reg in registrants.items():
        if reg["registrant_type"] == "Individual":
            pk = person_key(reg["name"])
            if pk:
                person_index[pk].add(rid)

    by_entity = {}
    matched = {"donors": [], "lobbyists": [], "people": []}

    # ── donors ──────────────────────────────────────────────────────────────
    donor_labels = []
    for f in ("graph/money.json", "graph/money.qld.json", "graph/money.vic.json"):
        data = load_json(portal / f)
        for n in (data or {}).get("nodes", []):
            if n.get("kind") == "donor" and n.get("label"):
                donor_labels.append(n["label"])
    access = load_json(portal / "access.json") or {}
    donor_labels.extend((access.get("donors") or {}).keys())
    seen = set()
    for label in donor_labels:
        k = norm(label)
        if not k or k in seen or not usable_org_key(k):
            continue
        seen.add(k)
        rids = org_index.get(k)
        if not rids:
            continue
        key = norm_js(label)
        lst = by_entity.setdefault(key, [])
        for rid in sorted(rids):
            for e in entries(rid):
                if e not in lst:
                    lst.append(e)
        matched["donors"].append(label)

    # ── lobbying firms ──────────────────────────────────────────────────────
    try:
        lob = db.execute("SELECT DISTINCT entity_name, trading_name, abn, jurisdiction FROM ext_lobbyists").fetchall()
    except sqlite3.OperationalError as e:  # a test database without the lobbyist registers
        print(f"warning: ext_lobbyists unavailable ({e}); skipping lobbying-firm matches", file=sys.stderr)
        lob = []
    seen_firms = set()
    for row in lob:
        rids = set()
        a = abn_digits(row["abn"])
        if a and a in abn_index:
            rids |= abn_index[a]
        for nm in (row["entity_name"], row["trading_name"]):
            k = norm(nm)
            if k and usable_org_key(k) and k in org_index:
                rids |= org_index[k]
        if not rids:
            continue
        label = row["entity_name"]
        key = norm_js(label)
        if key in seen_firms:
            continue
        seen_firms.add(key)
        lst = by_entity.setdefault(key, [])
        for rid in sorted(rids):
            for e in entries(rid):
                if e not in lst:
                    lst.append(e)
        matched["lobbyists"].append(label)

    # ── parliamentarians ────────────────────────────────────────────────────
    people = {}
    parl = load_json(portal / "parliamentarians.json") or {}
    for p in parl.get("people", []):
        pk = person_key(p.get("name"))
        if not pk:
            continue
        rids = person_index.get(pk)
        if not rids:
            continue
        key = norm_js(p["name"])
        lst = people.setdefault(key, [])
        for rid in sorted(rids):
            for e in entries(rid):
                if e not in lst:
                    lst.append(e)
        matched["people"].append(f"{p['name']} = {', '.join(registrants[r]['name'] for r in sorted(rids))}")

    def sort_entries(lst):
        lst.sort(key=lambda e: (e["status"] != "current", e["from"] or ""), reverse=False)
        # current first, then newest first within each group
        lst.sort(key=lambda e: (0 if e["status"] == "current" else 1, -(int((e["from"] or "0000")[:4]))))

    for lst in list(by_entity.values()) + list(people.values()):
        sort_entries(lst)

    out = {
        "meta": {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "Foreign Influence Transparency Scheme Public Register, Attorney-General's Department",
            "source_url": SOURCE_URL,
            "licence": LICENCE,
            "register_loaded": loaded,
            "register_counts": {k.replace("ext_fits_", ""): v for k, v in counts.items()},
            "matching": ("exact normalised organisation names (registered, trading and other names) and ABN for "
                         "lobbying firms; surname + folded first name for parliamentarians; see scripts/export_fits.py"),
            "matches": {k: len(v) for k, v in matched.items()},
            "parliamentarians": sorted(matched["people"]),
            "disclaimer": DISCLAIMER,
        },
        "by_entity": by_entity,
        "people": people,
    }
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    if args.out == "-":
        sys.stdout.write(text)
    else:
        Path(args.out).write_text(text, encoding="utf-8")
    print(f"fits.json: {len(by_entity)} entities ({len(matched['donors'])} donors, {len(matched['lobbyists'])} lobbying firms), "
          f"{len(people)} parliamentarian pages; {len(text):,} bytes", file=sys.stderr)
    for k, v in matched.items():
        print(f"  {k}: {v}", file=sys.stderr)


if __name__ == "__main__":
    main()
