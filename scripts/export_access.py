#!/usr/bin/env python3
"""Export the money <-> access join for OPAX subject pages -> portal/public/access.json

Joins the 250 AEC donors on the money map (portal/public/graph/money.json) to two
disclosure sources in parli.db, and summarises each minister's disclosed diary:

  ext_ministerial_meetings   NSW Cabinet Office + QLD Cabinet ministerial diary disclosures
  ext_lobbyist_clients       the six lobbyist registers (federal, NSW, QLD, VIC, SA, WA)

Run on the box that holds the database (read-only, never locks the file). The two
portal inputs travel with the run because parli.db lives on `desktop`:

    ssh desktop mkdir -p /tmp/opax-access
    scp portal/public/graph/money.json portal/public/speakers.json desktop:/tmp/opax-access/
    ssh desktop python3 - /tmp/opax-access/money.json /tmp/opax-access/speakers.json \\
        < scripts/export_access.py > portal/public/access.json

Output shape:

  donors:    { money.json label: { meetings: [{minister, page, jurisdiction, date, purpose}] (newest 8),
                                   meetings_total, lobbyists: [{firm, jurisdiction, registered, ceased}] (8),
                                   lobbyists_total } }        -- only donors with at least one match
  ministers: { person-page key: { name, page, surname_key, jurisdiction, meetings_total, external_total,
                                  by_org: [[org, n]] (top 8), recent: [{date, org, purpose}] (8), latest_pdf } }
  aliases:   { other normalised spellings of a minister: person-page key }
  meta:      generation notes and the match counts printed to stderr

Method, so the numbers can be defended:

1. Donor <-> organisation/client matching is EXACT after normalisation: lower-case,
   punctuation to spaces, and the tokens pty/ltd/limited/the/inc/co/holdings/group/
   australia/proprietary/incorporated dropped. "Tabcorp Holdings Limited" therefore meets
   "Tabcorp Holdings" but not "Tabcorp" (a separate key). No fuzzy or prefix matching, so
   a company that discloses under several trading names is UNDER-counted, never
   over-counted. Donors whose key collapses to one short or generic word ("Australia",
   "Group", "Trust") are skipped: they would match everything.
2. Minister names: QLD diaries name the person, so nickname variants ("Dan"/"Daniel
   Purdie") are merged on surname within the jurisdiction. NSW diaries name the OFFICE;
   a surname is only recovered from the file name for Minns-government ministers, and
   is mapped to the full name with the hand table NSW_SURNAMES below. NSW office-only
   rows are attributed to a person in two ways: (a) inside the Minns government, when
   the same office title appears elsewhere with a surname (unique per government);
   (b) for the Premier, Deputy Premier, Treasurer, Attorney General and a few
   single-holder portfolios, the hand-curated NSW_OFFICES date table. Anything else
   stays as the office title on donor pages and is not indexed under a minister.
3. Minister keys are the OPAX person-page name (speakers.json) normalised the way
   app.js normName() does: the full name where the corpus has one (NSW), else the bare
   surname (QLD Hansard speakers are surnames). `surname_key` marks the latter so the
   client can require the person's chamber to match the jurisdiction before showing a
   diary under a bare surname.
4. Minister by_org / recent exclude internal government meetings (ministerial and
   departmental staff, cabinet, other ministers and MPs, directors-general): the
   diaries are dominated by them and they are not "access". meetings_total keeps
   every disclosed row; external_total is what the lists summarise.
"""

import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

DB_PATH = "/home/jake/.cache/autoresearch/parli.db"
MAX_ITEMS = 8
PURPOSE_MAX = 160

STRIP_TOKENS = {"pty", "ltd", "limited", "the", "inc", "co", "holdings", "group", "australia",
                "proprietary", "incorporated"}
# A donor whose whole normalised key is one of these would match half the register.
GENERIC_SINGLE = {"australia", "australian", "group", "trust", "foundation", "association", "club",
                  "company", "services", "service", "investments", "nominees", "family", "fund", "bank",
                  "union", "party", "council", "institute", "national", "international", "enterprises",
                  "corporation", "industries", "pacific", "capital", "management", "partners",
                  "consulting", "finance", "dept", "department", "office", "government"}
# Mirrors normName() in portal/public/app.js exactly; used for person-page keys.
JS_STRIP = {"pty", "ltd", "limited", "the", "inc", "co", "holdings"}

# Internal-government counterparties in the diaries (not access to be counted), plus the
# placeholder cells ("Invited guests", "Member of Public") and first lines that are only a
# job title because the organisation sits on the next line of the PDF cell.
INTERNAL_RX = re.compile(
    r"ministerial staff|cabinet|\bcbrc\b|\bqdmc\b|members? of parliament|departmental|director[- ]general|\bdg\b|"
    r"assistant minister|government ministers?|government members|chief of staff|\bthe hon\b|\bhon\b|honourable|"
    r"\bmp\b|\bmlc\b|\bmla\b|\bsenator\b|\bpremier\b|\bminister for\b|\bministers?\b|\btreasurer\b|"
    r"board of treasurers|council for the australian federation|\bdepartment of\b|\bdept\b|deputy director|"
    r"\bsecretary\b|senior ministerial|\bstaff\b|\bcaucus\b|parliament|legislative assembly|\bestimates\b|"
    r"\badvis[eo]rs?\b|\bmember for\b|swearing[- ]in|standing council|ministers'? council|"
    r"commonwealth, state|recovery and resilience group|"
    r"her excellency|\bgovernor\b|budget review committee|executive council|disaster management|"
    r"state disaster coordinator|\bdirector,|\bdirector[-–]?\s*$|\bcommissioner\b|"
    r"chief executive officer, department|\ba/director|acting director|"
    r"invited guests?|other invited|members? of (the )?public|\bindividuals?\b|\bconstituents?\b|"
    r"\bdeputations?\b|dignitaries|stakeholders|victim of crime|advisory council members|"
    r"^(acting |interim |a/)?(chief executive( officer)?|ceo|chair(man|person)?|general manager|"
    r"managing director|executive director|president|deputy secretary)[,;\s]*$",
    re.I,
)

MINNS_START = "2023-03-28"

# NSW file-name surnames -> full names (Minns government, 2023-). Source: NSW ministry lists.
NSW_SURNAMES = {
    "Aitchison": "Jenny Aitchison", "Catley": "Yasmin Catley", "Chanthivong": "Anoulack Chanthivong",
    "Cotsis": "Sophie Cotsis", "Daley": "Michael Daley", "Dib": "Jihad Dib", "Graham": "John Graham",
    "Harris": "David Harris", "Harrison": "Jodie Harrison", "Haylen": "Jo Haylen", "Hoenig": "Ron Hoenig",
    "Houssos": "Courtney Houssos", "Jackson": "Rose Jackson", "Kamper": "Steve Kamper",
    "Moriarty": "Tara Moriarty", "Park": "Ryan Park", "Saffin": "Janelle Saffin", "Scully": "Paul Scully",
    "Sharpe": "Penny Sharpe", "Washington": "Kate Washington", "Whan": "Steve Whan",
    "Minns": "Chris Minns", "Mookhey": "Daniel Mookhey", "Car": "Prue Car",
}

# NSW office-only diaries -> holder by date. Half-open [start, end). Only offices whose
# holder for the whole span is beyond doubt; everything else stays as the office title.
NSW_OFFICES = [
    (re.compile(r"^(nsw )?premier( of nsw)?$", re.I), [
        ("2017-01-23", "2021-10-05", "Gladys Berejiklian"),
        ("2021-10-05", "2023-03-28", "Dominic Perrottet"),
        ("2023-03-28", "2099-01-01", "Chris Minns"),
    ]),
    (re.compile(r"^(nsw )?treasurer\b", re.I), [
        ("2017-01-30", "2021-10-05", "Dominic Perrottet"),
        ("2021-10-05", "2023-03-28", "Matt Kean"),
        ("2023-03-28", "2099-01-01", "Daniel Mookhey"),
    ]),
    (re.compile(r"^(nsw )?deputy premier\b", re.I), [
        ("2016-11-16", "2021-10-06", "John Barilaro"),
        ("2021-10-06", "2023-03-28", "Paul Toole"),
        ("2023-03-28", "2099-01-01", "Prue Car"),
    ]),
    (re.compile(r"^attorney[- ]general\b", re.I), [
        ("2017-01-30", "2023-03-28", "Mark Speakman"),
        ("2023-03-28", "2099-01-01", "Michael Daley"),
    ]),
    (re.compile(r"^minister for energy and environment$", re.I), [
        ("2019-04-02", "2021-10-05", "Matt Kean"),
    ]),
    (re.compile(r"^minister for health( and (minister for )?medical research)?$", re.I), [
        ("2017-01-30", "2023-03-28", "Brad Hazzard"),
    ]),
    (re.compile(r"^minister for planning and public spaces$", re.I), [
        ("2019-04-02", "2021-12-21", "Rob Stokes"),
    ]),
    (re.compile(r"^minister for education and early childhood learning$", re.I), [
        ("2019-04-02", "2021-12-21", "Sarah Mitchell"),
    ]),
    (re.compile(r"^minister for customer service( and digital( government)?)?$", re.I), [
        ("2019-04-02", "2023-03-28", "Victor Dominello"),
    ]),
    (re.compile(r"^minister for transport and roads$", re.I), [
        ("2019-04-02", "2021-10-05", "Andrew Constance"),
    ]),
]

JURIS = {"federal": "Federal", "nsw": "NSW", "qld": "QLD", "vic": "VIC", "sa": "SA", "wa": "WA"}
JUR_ORDER = {"federal": 0, "nsw": 1, "qld": 2, "vic": 3, "sa": 4, "wa": 5}


def log(*a):
    print(*a, file=sys.stderr)


def norm(s):
    s = re.sub(r"[^a-z0-9]+", " ", (s or "").lower())
    return " ".join(t for t in s.split() if t not in STRIP_TOKENS)


def norm_name(s):
    s = re.sub(r"[^a-z0-9]+", " ", (s or "").lower())
    return " ".join(t for t in s.split() if t not in JS_STRIP)


def generic_key(key):
    toks = key.split()
    return not toks or (len(toks) == 1 and (toks[0] in GENERIC_SINGLE or len(toks[0]) < 3))


def clean_purpose(s):
    s = re.sub(r"\s+", " ", (s or "")).strip()
    return s if len(s) <= PURPOSE_MAX else s[:PURPOSE_MAX - 1].rstrip() + "…"


def display_name(name):
    """'Samuel (Sam) O’Connor' -> 'Samuel O’Connor'; strips honorifics the diaries leak."""
    s = re.sub(r"\s*\([^)]*\)", "", name or "")
    s = re.sub(r"^(the hon\.?|hon\.?|dr\.?|mr\.?|ms\.?|mrs\.?)\s+", "", s, flags=re.I)
    s = re.sub(r"\s+(mp|mlc|mla)$", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()


def surname_of(name):
    toks = display_name(name).split()
    return toks[-1] if toks else ""


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: export_access.py money.json speakers.json  (see module docstring)")
    money = json.load(open(sys.argv[1]))
    speakers = json.load(open(sys.argv[2]))
    speaker_names = {n for n, _ in speakers}
    speaker_norm = {}
    for n in speaker_names:
        speaker_norm.setdefault(norm_name(n), n)

    donor_labels = [n["label"] for n in money["nodes"] if n.get("kind") == "donor"]
    donor_keys = {}
    skipped_generic = []
    for label in donor_labels:
        k = norm(label)
        if generic_key(k):
            skipped_generic.append(label)
            continue
        donor_keys[label] = k

    db = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row

    # ---- meetings ---------------------------------------------------------------------
    rows = db.execute(
        "SELECT jurisdiction, minister_name, minister_title, meeting_date, period_start, organisation, "
        "purpose, source_url FROM ext_ministerial_meetings").fetchall()

    # NSW: office title -> surname where the Minns-government diaries name one (unique per title).
    title_surname = defaultdict(Counter)
    for r in rows:
        if r["jurisdiction"] == "nsw" and r["minister_name"] and r["minister_title"]:
            title_surname[r["minister_title"].strip()][r["minister_name"].strip()] += 1
    title_to_surname = {t: c.most_common(1)[0][0] for t, c in title_surname.items() if len(c) == 1}

    # QLD: merge nickname variants on surname when the first initial agrees.
    qld_variants = defaultdict(Counter)
    for r in rows:
        if r["jurisdiction"] == "qld" and r["minister_name"]:
            d = display_name(r["minister_name"])
            qld_variants[(surname_of(d).lower(), d[:1].lower())][d] += 1
    qld_canon = {}
    for variants in qld_variants.values():
        canon = variants.most_common(1)[0][0]
        for v in variants:
            qld_canon[v] = canon

    stats = Counter()

    def resolve(r):
        """-> (person display name or None, office title). Person None = unattributed office."""
        jur = r["jurisdiction"]
        name = (r["minister_name"] or "").strip()
        title = (r["minister_title"] or "").strip()
        when = r["meeting_date"] or r["period_start"] or ""
        if jur == "qld":
            stats["qld_named"] += 1
            return qld_canon.get(display_name(name), display_name(name)) or None, title
        if name:
            full = NSW_SURNAMES.get(name)
            stats["nsw_surname_mapped" if full else "nsw_surname_unmapped"] += 1
            return full or name, title
        if when >= MINNS_START and title in title_to_surname:
            stats["nsw_office_by_title"] += 1
            sn = title_to_surname[title]
            return NSW_SURNAMES.get(sn, sn), title
        for rx, spans in NSW_OFFICES:
            if rx.search(title):
                for a, b, person in spans:
                    if a <= when < b:
                        stats["nsw_office_by_table"] += 1
                        return person, title
        stats["nsw_office_unresolved"] += 1
        return None, title

    by_org = defaultdict(list)          # norm(organisation) -> meeting dicts (for donors)
    ministers = {}                      # display name -> accumulator
    for r in rows:
        person, title = resolve(r)
        when = r["meeting_date"] or r["period_start"] or ""
        org = re.sub(r"\s+", " ", (r["organisation"] or "")).strip()
        internal = bool(INTERNAL_RX.search(org)) or not org
        m = {"minister": person or title, "jurisdiction": r["jurisdiction"], "date": when,
             "purpose": clean_purpose(r["purpose"]), "_person": person, "_org": org,
             "_internal": internal, "_pdf": r["source_url"]}
        if org:
            by_org[norm(org)].append(m)
        if person:
            acc = ministers.setdefault(person, {"jurisdiction": r["jurisdiction"], "rows": []})
            acc["rows"].append(m)

    # Minister keys: the person-page name (speakers.json) normalised like app.js normName().
    minister_out, aliases = {}, {}
    surname_count = Counter(surname_of(p).lower() for p in ministers)
    page_of = {}
    for person, acc in ministers.items():
        page, surname_key = None, False
        cands = [person, person.replace("’", "'"), person.replace("'", "’")]
        for c in cands:
            if c in speaker_names:
                page = c
                break
        if not page:
            sn = surname_of(person)
            for c in (sn, sn.replace("’", "'"), sn.replace("'", "’")):
                if c in speaker_names:
                    page, surname_key = c, True
                    break
        key = norm_name(page or person)
        if key in minister_out:            # two people collapsing onto one page: keep the busier
            if len(acc["rows"]) <= minister_out[key]["meetings_total"]:
                stats["minister_key_collision"] += 1
                continue
        page_of[person] = page
        ext = [m for m in acc["rows"] if not m["_internal"]]
        org_counter = defaultdict(Counter)
        for m in ext:
            org_counter[norm(m["_org"])][m["_org"]] += 1
        top = sorted(org_counter.items(), key=lambda kv: (-sum(kv[1].values()), kv[0]))[:MAX_ITEMS]
        recent = sorted(ext, key=lambda m: m["date"], reverse=True)[:MAX_ITEMS]
        latest = max(acc["rows"], key=lambda m: m["date"])
        minister_out[key] = {
            "name": person, "page": page, "surname_key": surname_key, "jurisdiction": acc["jurisdiction"],
            "meetings_total": len(acc["rows"]), "external_total": len(ext),
            "by_org": [[c.most_common(1)[0][0], sum(c.values())] for _, c in top],
            "recent": [{"date": m["date"], "org": m["_org"], "purpose": m["purpose"]} for m in recent],
            "latest_pdf": latest["_pdf"],
        }
        for alt in {norm_name(person)} | ({norm_name(surname_of(person))} if surname_count[surname_of(person).lower()] == 1 else set()):
            if alt and alt != key:
                aliases[alt] = key
    for variant, canon in qld_canon.items():
        k = norm_name(page_of.get(canon) or canon)
        if norm_name(variant) != k and k in minister_out:
            aliases.setdefault(norm_name(variant), k)

    # ---- lobbyist registers --------------------------------------------------------------
    crow = db.execute(
        "SELECT cl.jurisdiction, cl.lobbyist_name, cl.client_name, cl.active, cl.date_added, cl.date_ceased, "
        "l.trading_name FROM ext_lobbyist_clients cl LEFT JOIN ext_lobbyists l "
        "ON l.jurisdiction = cl.jurisdiction AND l.register_id = cl.lobbyist_register_id").fetchall()
    by_client = defaultdict(list)
    for c in crow:
        firm = (c["lobbyist_name"] or "").strip().rstrip(".")
        if firm.lower().startswith("the trustee for") and c["trading_name"]:
            firm = c["trading_name"].strip()
        ceased = (c["active"] == 0) or bool(c["date_ceased"])
        by_client[norm(c["client_name"])].append(
            {"firm": firm, "jurisdiction": c["jurisdiction"], "registered": c["date_added"], "ceased": ceased})

    # ---- donors ----------------------------------------------------------------------------
    donors_out = {}
    n_meet = n_lob = 0
    for label, key in donor_keys.items():
        ms = by_org.get(key, [])
        ls = by_client.get(key, [])
        if not ms and not ls:
            continue
        entry = {}
        if ms:
            n_meet += 1
            newest = sorted(ms, key=lambda m: m["date"], reverse=True)[:MAX_ITEMS]
            entry["meetings"] = [{"minister": m["minister"], "page": page_of.get(m["_person"]),
                                  "jurisdiction": m["jurisdiction"], "date": m["date"], "purpose": m["purpose"]}
                                 for m in newest]
            entry["meetings_total"] = len(ms)
        if ls:
            n_lob += 1
            firms = {}
            for l in ls:
                f = firms.setdefault(norm(l["firm"]), {"firm": l["firm"], "jurs": set(), "registered": None, "ceased": True})
                f["jurs"].add(l["jurisdiction"])
                f["ceased"] = f["ceased"] and l["ceased"]
                if l["registered"] and (f["registered"] is None or l["registered"] < f["registered"]):
                    f["registered"] = l["registered"]
            ordered = sorted(firms.values(), key=lambda f: (f["ceased"], -len(f["jurs"]), f["firm"].lower()))
            entry["lobbyists"] = [{"firm": f["firm"],
                                   "jurisdiction": ", ".join(JURIS[j] for j in sorted(f["jurs"], key=JUR_ORDER.get)),
                                   "registered": f["registered"], "ceased": f["ceased"]}
                                  for f in ordered[:MAX_ITEMS]]
            entry["lobbyists_total"] = len(firms)
        donors_out[label] = entry

    meta = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": ["ext_ministerial_meetings (NSW Cabinet Office, QLD Cabinet diaries)",
                    "ext_lobbyist_clients x ext_lobbyists (AGD, NSW EC, QLD Integrity, VPSC, SA DPC, WA PSC)"],
        "matching": "exact after normalisation; see scripts/export_access.py",
        "donors_in_map": len(donor_labels), "donors_skipped_generic": skipped_generic,
        "donors_with_meetings": n_meet, "donors_with_lobbyists": n_lob, "donors_with_either": len(donors_out),
        "meetings_rows": len(rows), "ministers": len(minister_out),
        "minister_resolution": dict(stats),
    }
    out = {"meta": meta, "donors": donors_out, "ministers": minister_out, "aliases": aliases}
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write(text + "\n")

    log(f"donors in map {len(donor_labels)}; skipped as generic {len(skipped_generic)}: {skipped_generic}")
    log(f"donors with meetings {n_meet}, with lobbyists {n_lob}, with either {len(donors_out)}")
    log(f"ministers indexed {len(minister_out)} (with a person page: "
        f"{sum(1 for m in minister_out.values() if m['page'])}), aliases {len(aliases)}")
    log("minister resolution:", dict(stats))
    log("no person page:", [m["name"] for m in minister_out.values() if not m["page"]])
    log(f"output {len(text.encode('utf-8')) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
