#!/usr/bin/env python3
"""Export a STATE money map (money.<jurisdiction>.json) from parli.db `ext_donations`.

One file per jurisdiction, in exactly the node/edge shape of money.json (the
federal AEC export from export_money_graph.py), so the same 3D map, ledger and
subject-page code can load either. Run on the box that holds the database:

    ssh desktop python3 - qld < scripts/export_state_money.py > portal/public/graph/money.qld.json
    ssh desktop python3 - vic < scripts/export_state_money.py > portal/public/graph/money.vic.json

Western Australia is loaded in parli.db but WAEC asserts full Crown copyright
with no open licence, so it is a licence gate: the script refuses to export it
unless `--gated` is passed, and the result must not land under portal/public.

    ssh desktop python3 - wa --gated < scripts/export_state_money.py > /tmp/money.wa.json

NEVER merge these with money.json. AEC annual returns of federally registered
parties already include their state branches' receipts, so a QLD gift to the
LNP can appear in both `donations` and `ext_donations`; jurisdiction is a
filter, never a union (docs/DATA-MONEY.md section 3).

Methodology mirrors export_money_graph.py rule for rule, with the state twists
recorded in each file's `meta` block:

1. Only rows with a canonical `recipient_party` are used; gifts to candidates,
   committees, third parties and independents are not party donations.
2. amount > 0 only.
3. Public funding / government bodies are excluded (same name regex; donors whose
   dominant industry is 'government' are dropped wholesale).
4. Internal party transfers are excluded (industry = 'party_internal' or a party
   word in the donor name): the Greens' national body gifting its QLD branch, etc.
5. Donors with industry other/NULL/unidentified need a per-jurisdiction lifetime
   floor to earn a place (the federal $5m floor would empty a state file). A
   donor's industry is the biggest CLASSIFIED tag across its rows; 'other' and
   'unidentified' mean "not classified" and never outvote a real tag.
6. Donations are aggregated per CANONICAL DONOR ENTITY, exactly as the federal
   export does: ext_donor_aliases maps every raw donor_name to an entity in
   ext_donor_entities (parli.ingest.donor_entities), the node `label` is the
   canonical name and `aliases` lists the other spellings behind it. Entities
   resolved to kind='government' or kind='party_unit' are dropped. A donor_name
   with no alias row falls back to the old light normalisation and is counted in
   meta.donors_unresolved.
7. Per-source rows that are not gifts are dropped: VIC `loan` rows (repayable)
   and WA `compulsory party levy` rows (sitting members paying their own party).
   QLD lists every gift to a party and, since 2022-23, flags which ones the Act
   calls "political donations"; all gifts are kept and the flag counts are in meta.

This script is streamed to the database host over ssh stdin, so it cannot import
its sibling; the shared constants below are a deliberate copy of
export_money_graph.py and must be kept in step with it.
"""

import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone

DB_PATH = "/home/jake/.cache/autoresearch/parli.db"
TOP_DONORS = 250

NOT_SUMMED = (
    "State and federal returns are not summed: AEC returns already include "
    "state branch receipts, so a gift can appear in both a state file and money.json."
)

JURISDICTIONS = {
    "qld": {
        "label": "Queensland",
        "commission": "Electoral Commission of Queensland",
        "sourceShort": "ECQ gifts register",
        "source": (
            "Electoral Commission of Queensland, Electronic Disclosure System "
            "(gifts to registered political parties) via parli.db `ext_donations` (source qld_ecq)"
        ),
        "source_url": "https://disclosures.ecq.qld.gov.au/Map",
        "licence": (
            "CC BY 4.0 (data.qld.gov.au dataset 'Electronic Disclosure System - State and "
            "Local Election Funding and Donations')"
        ),
        "threshold": (
            "Gifts of $1,000 or more (cumulative per financial year) must be disclosed; "
            "smaller gifts are not reported. Real-time disclosure since 2017."
        ),
        "other_floor": 100_000,
        "drop_disclosure_types": (),
        "gated": False,
    },
    "vic": {
        "label": "Victoria",
        "commission": "Victorian Electoral Commission",
        "sourceShort": "VEC disclosures",
        "source": (
            "Victorian Electoral Commission, VEC Disclosures public portal "
            "(donations to registered political parties) via parli.db `ext_donations` (source vic_vec)"
        ),
        "source_url": "https://disclosures.vec.vic.gov.au/public-donations/",
        "licence": (
            "Crown copyright (State of Victoria); published under Electoral Act 2002 s 217; "
            "no explicit open licence is stated on the portal"
        ),
        "threshold": (
            "Donations above the indexed disclosure threshold (about $1,000 a year, indexed) "
            "must be disclosed within 21 days; smaller donations are not reported. "
            "The scheme began 25 November 2018; the public grid holds 2020-21 onwards."
        ),
        "other_floor": 10_000,
        "drop_disclosure_types": ("loan",),
        "gated": False,
    },
    "wa": {
        "label": "Western Australia",
        "commission": "Western Australian Electoral Commission",
        "sourceShort": "WAEC disclosures",
        "source": (
            "Western Australian Electoral Commission, Online Disclosure System "
            "via parli.db `ext_donations` (source wa_waec)"
        ),
        "source_url": "https://disclosures.elections.wa.gov.au/public-dashboard/",
        "licence": "Crown copyright, no open licence (WAEC copyright notice): NOT cleared for public exposure",
        "threshold": (
            "Gifts of $1,000 or more must be disclosed within 7 days; smaller gifts are not reported. "
            "Real-time disclosure since 1 July 2024; earlier years are PDF annual returns."
        ),
        "other_floor": 50_000,
        "drop_disclosure_types": ("compulsory party levy",),
        "gated": True,
    },
    # The three small jurisdictions (parli.ingest.money_small_jurisdictions;
    # docs/DATA-MONEY.md section 1.1). Tasmania is CC BY; the ACT and the NT are
    # licence gates exactly like WA.
    "tas": {
        "label": "Tasmania",
        "commission": "Tasmanian Electoral Commission",
        "sourceShort": "TEC disclosures",
        "source": (
            "Tasmanian Electoral Commission: the monthly and seven-day reportable political donation "
            "reports on tec.tas.gov.au (1 July 2025 to 2 July 2026 and continuing) together with the "
            "TEC Disclosures portal (disclosures lodged from 3 July 2026), via parli.db "
            "`ext_donations` (source tas_tec)"
        ),
        "source_url": "https://www.tec.tas.gov.au/disclosure-and-funding/registers-and-reports/",
        # The full quotation and the disclosures-subdomain caveat are in
        # docs/DATA-MONEY.md section 1.1; the fineprint keeps the house one-liner
        # plus the attribution the licence actually requires.
        "licence": (
            "CC BY 4.0 (TEC copyright statement, tec.tas.gov.au/info/Copyright.html); "
            "attribute '© Tasmanian Electoral Commission'"
        ),
        "threshold": (
            "Reportable political donations of $1,000 or more (single or aggregated within a financial year) "
            "under the Electoral Disclosure and Funding Act 2023, which commenced 1 July 2025: disclosed "
            "monthly outside an election period and within 7 days during one. Smaller donations are not "
            "reported, and nothing before 1 July 2025 is in scope, so this is a very short series."
        ),
        "other_floor": 1_000,
        # A reportable loan is repayable, not a gift (same call as VIC).
        "drop_disclosure_types": ("loan",),
        "gated": False,
    },
    "act": {
        "label": "Australian Capital Territory",
        "commission": "ACT Electoral Commission",
        "sourceShort": "Elections ACT gift returns",
        "source": (
            "ACT Electoral Commission (Elections ACT), returns of gifts received of $1,000 or more, "
            "one page per financial year, via parli.db `ext_donations` (source act_eact)"
        ),
        "source_url": "https://www.elections.act.gov.au/funding-disclosures-and-registers/gift-returns",
        "licence": (
            "No open licence. elections.act.gov.au/about-the-commission/copyright permits use \"for your "
            "personal use, educational use or for non-commercial use within your organisation\", \"in "
            "unaltered form only\", and adds: \"Except as permitted above you must not copy, adapt, publish, "
            "distribute or commercialise any material contained on this site without the permission of the "
            "ACT Electoral Commission.\" Publishing on opax.com.au is exactly that case: "
            "NOT cleared for public exposure"
        ),
        "threshold": (
            "Gifts of $1,000 or more (aggregated per donor within the financial year) received by party "
            "groupings and non-party candidate groupings must be returned; smaller gifts are not reported. "
            "Quarterly returns, 7-day returns in an election year."
        ),
        "other_floor": 10_000,
        "drop_disclosure_types": (),
        "gated": True,
    },
    "nt": {
        "label": "Northern Territory",
        "commission": "Northern Territory Electoral Commission",
        "sourceShort": "NTEC annual gift returns",
        "source": (
            "Northern Territory Electoral Commission, published annual returns (gifts received over the "
            "threshold) read from Internet Archive captures of ntec.nt.gov.au, via parli.db `ext_donations` "
            "(source nt_ntec)"
        ),
        "source_url": "https://ntec.nt.gov.au/financial-disclosure/published-annual-returns",
        "licence": (
            "No open licence. NTEC's footer points at the NT Government statement "
            "(nt.gov.au/page/copyright-disclaimer-and-privacy): \"No part of this website may be reproduced "
            "or reused for any purpose whatsoever, apart from: fair dealing for the purposes of private "
            "study, research, criticism or review, as permitted under the Act or where expressly provided "
            "under a Creative Commons licence.\" The financial-disclosure pages carry no Creative Commons "
            "marking, only '© 2026 NT Electoral Commission': NOT cleared for public exposure"
        ),
        "threshold": (
            "Gifts of $1,500 or more (aggregated per donor) must be itemised in annual returns; smaller gifts "
            "are not reported. Itemised gift returns exist from 2020-21; earlier annual returns list receipts "
            "of $1,500 or more of any kind and are not used here."
        ),
        "other_floor": 10_000,
        # 'receipt' = pre-2020-21 annual-return receipts of any kind (public funding,
        # membership, transfers); election-return rows repeat gifts already in the
        # annual returns and are dropped below (drop_election_rows).
        "drop_disclosure_types": ("receipt", "loan"),
        "drop_election_rows": True,
        "gated": True,
    },
}

# --- mirror of export_money_graph.py (keep in step) --------------------------

PUBLIC_FUNDING_RE = re.compile(
    r"electoral commission|election funding|electoral office|"
    r"tax(ation)?\s+(office|authority)|\bato\b|\baec\b|\becq\b|"
    r"department of|australian agency|commonwealth of australia|"
    r"electoral comm\b",
    re.I,
)

PARTY_WORD_RE = re.compile(
    r"\blabor\b|\bliberal\b|\bliberals\b|\bgreens\b|\bnationals\b|"
    r"\bone nation\b|\bunited australia\b|\bkatter\b|\bfamily first\b|"
    r"\bcentre alliance\b|\bcountry liberal\b|\blnp\b|\balp\b|"
    r"\bcormack foundation\b|\bjohn curtin house\b|\bfree enterprise foundation\b|"
    r"\bnational party\b|\bdemocrats\b",
    re.I,
)

SUFFIX_TOKENS = {
    "pty", "ltd", "limited", "proprietary", "inc", "incorporated",
    "co", "the", "atf", "trust", "holdings",
}

CLUSTER_OF = {
    "unions": "unions",
    "finance": "finance",
    "individual": "individuals",
    "property": "property",
    "mining": "mining & energy",
    "fossil_fuels": "mining & energy",
    "hospitality": "hospitality",
    "gambling": "gambling",
    "media": "media & tech",
    "tech": "media & tech",
    "telecom": "media & tech",
    "health": "health & pharma",
    "pharmacy": "health & pharma",
    "agriculture": "agriculture",
    "retail": "retail",
    "legal": "legal & lobbying",
    "lobbying": "legal & lobbying",
    "tobacco": "tobacco & alcohol",
    "alcohol": "tobacco & alcohol",
    "defence": "defence & security",
    "security": "defence & security",
}
FALLBACK_CLUSTER = "other"

PARTY_COLOURS = {
    "Labor": "#D93025",
    "Liberal": "#1565C0",
    "Greens": "#3C9A46",
    "Nationals": "#1B5E20",
    "LNP": "#4A90D9",
    "One Nation": "#E8710A",
    "United Australia Party": "#F0B429",
    "Katter's Australian Party": "#7B5142",
    "Family First": "#7B1FA2",
    "Centre Alliance": "#00838F",
    "Country Liberal Party": "#5C7A8A",
    # Parties the state registers surface that the federal file does not.
    "Animal Justice Party": "#2E7D6B",
    "Legalise Cannabis": "#6D8B3A",
    "Reason Party": "#C2185B",
    "Shooters, Fishers and Farmers": "#5D4037",
}


def norm_key(name: str) -> str:
    """Aggregation key: case/punctuation/suffix-insensitive (rule 6)."""
    s = re.sub(r"[^a-z0-9 ]+", " ", name.lower())
    tokens = [t for t in s.split() if t not in SUFFIX_TOKENS]
    return " ".join(tokens)


# Some registers put an event name where a financial year belongs, and a
# by-election event carries no digits at all (see export_money_graph.py).
BY_ELECTION_YEAR = {
    "braddon by-election": 2018,
    "wentworth by-election": 2018,
    "eden-monaro by-election": 2020,
    "fadden by-election": 2023,
}


def year_of(fy: str | None) -> int | None:
    """First 4-digit year in a financial_year string ('2012-13' -> 2012), or the
    polling year of a named by-election."""
    if not fy:
        return None
    m = re.search(r"\b(19|20)\d\d\b", fy)
    if m:
        return int(m.group(0))
    return BY_ELECTION_YEAR.get(fy.strip().lower())


def load_canonical(db) -> tuple[dict, dict]:
    """(alias_raw -> entity_id, entity_id -> {name, kind}) from the resolver tables.

    Returns empty maps if the tables are absent, so the export still runs on a
    database where parli.ingest.donor_entities has never been loaded.
    """
    have = {r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name IN ('ext_donor_entities','ext_donor_aliases')")}
    if len(have) < 2:
        sys.stderr.write("export_state_money: no ext_donor_* tables; "
                         "falling back to per-spelling aggregation\n")
        return {}, {}
    ents = {r["entity_id"]: {"name": r["canonical_name"], "kind": r["kind"]}
            for r in db.execute("SELECT entity_id, canonical_name, kind FROM ext_donor_entities")}
    alias = {r["alias_raw"]: r["entity_id"] for r in db.execute(
        "SELECT alias_raw, entity_id FROM ext_donor_aliases")}
    return alias, ents


# --- export -----------------------------------------------------------------

def usage(msg: str) -> None:
    sys.stderr.write(f"export_state_money: {msg}\n")
    sys.stderr.write(f"usage: python3 export_state_money.py {{{'|'.join(JURISDICTIONS)}}} [--gated]\n")
    sys.exit(2)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if len(args) != 1 or args[0] not in JURISDICTIONS:
        usage("pick one jurisdiction")
    jur = args[0]
    cfg = JURISDICTIONS[jur]
    if cfg["gated"] and "--gated" not in flags:
        usage(f"{cfg['label']} is behind a licence gate ({cfg['licence']}); pass --gated "
              "for a research copy and keep it out of portal/public")

    db = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    alias_to_entity, entities = load_canonical(db)

    rows = db.execute(
        """
        SELECT donor_name, recipient_party AS party, amount, financial_year,
               industry, donor_type, disclosure_type, is_political_donation, election
        FROM ext_donations
        WHERE jurisdiction = ?
          AND recipient_party IS NOT NULL AND recipient_party != ''
          AND amount > 0
        """,
        (jur,),
    ).fetchall()
    considered = len(rows)

    dropped_types = defaultdict(int)
    if cfg["drop_disclosure_types"]:
        kept = []
        for r in rows:
            if (r["disclosure_type"] or "") in cfg["drop_disclosure_types"]:
                dropped_types[r["disclosure_type"]] += 1
            else:
                kept.append(r)
        rows = kept

    # NT publishes an election return and an annual return covering the same
    # gifts, so the election-tagged copies are dropped (measured 2026-09-02:
    # 307 of 879 NT election rows repeat a non-election row donor-for-dollar).
    dropped_election = 0
    if cfg.get("drop_election_rows"):
        kept = [r for r in rows if not r["election"]]
        dropped_election = len(rows) - len(kept)
        rows = kept

    fys = sorted({r["financial_year"] for r in rows if r["financial_year"]})
    flag_counts = {"political_donation": 0, "gift_not_political_donation": 0, "unflagged": 0}
    for r in rows:
        v = r["is_political_donation"]
        if v is None:
            flag_counts["unflagged"] += 1
        elif int(v):
            flag_counts["political_donation"] += 1
        else:
            flag_counts["gift_not_political_donation"] += 1

    # Aggregate per canonical donor entity (rule 6).
    donors: dict[str, dict] = {}
    excluded = {"public_funding": 0, "party_internal": 0, "government_entity": 0}
    unresolved = set()
    rows_without_year = 0
    for r in rows:
        name = (r["donor_name"] or "").strip()
        if not name:
            continue
        eid = alias_to_entity.get(name)
        ent = entities.get(eid) if eid else None
        if ent is None:
            unresolved.add(name)
        if ent and ent["kind"] in ("government", "party_unit"):
            excluded["government_entity"] += 1
            continue
        key = eid or norm_key(name)
        if not key:
            continue
        if PUBLIC_FUNDING_RE.search(name) or PUBLIC_FUNDING_RE.search(norm_key(name)):
            excluded["public_funding"] += 1
            continue
        if r["industry"] == "party_internal" or PARTY_WORD_RE.search(name):
            excluded["party_internal"] += 1
            continue
        d = donors.get(key)
        if d is None:
            d = donors[key] = {
                "canonical": ent["name"] if ent else None,
                "entity_kind": ent["kind"] if ent else None,
                "names": defaultdict(float),
                "total": 0.0,
                "count": 0,
                "years": [],
                "industries": defaultdict(float),
                "parties": defaultdict(lambda: {"total": 0.0, "count": 0, "years": []}),
            }
        amt = float(r["amount"])
        d["names"][name] += amt
        d["total"] += amt
        d["count"] += 1
        y = year_of(r["financial_year"])
        if y:
            d["years"].append(y)
        else:
            rows_without_year += 1
        d["industries"][r["industry"] or "other"] += amt
        p = d["parties"][r["party"]]
        p["total"] += amt
        p["count"] += 1
        if y:
            p["years"].append(y)

    def dominant_industry(d: dict) -> str:
        # A union is a union: see export_money_graph.py for why rolled-up
        # branches must not be recoloured by one oddly-tagged branch.
        if d.get("entity_kind") == "union":
            return "unions"
        # 'other'/'unidentified' means "not classified", so it must not outvote a
        # real tag: a donor filed once as 'finance' and twice untagged is finance.
        # Rolling spellings up made this matter -- the untagged spellings of a
        # merged donor could otherwise push it into 'other' and out of the map.
        known = {k: v for k, v in d["industries"].items()
                 if k and k not in ("other", "unidentified")}
        if known:
            return max(known.items(), key=lambda kv: kv[1])[0]
        return "other"

    ranked = sorted(donors.values(), key=lambda d: -d["total"])
    picked = []
    skipped_other = 0
    for d in ranked:
        ind = dominant_industry(d)
        if ind == "government":
            continue  # rule 3: a government body is not a donor
        if ind == "other" and d["total"] < cfg["other_floor"]:
            skipped_other += 1
            continue
        picked.append(d)
        if len(picked) >= TOP_DONORS:
            break

    # Party aggregates over the FULL cleaned row set (not just top donors).
    party_totals = defaultdict(lambda: {"total": 0.0, "count": 0, "years": []})
    for r in rows:
        name = (r["donor_name"] or "").strip()
        if PUBLIC_FUNDING_RE.search(name):
            continue
        pt = party_totals[r["party"]]
        pt["total"] += float(r["amount"])
        pt["count"] += 1
        y = year_of(r["financial_year"])
        if y:
            pt["years"].append(y)

    nodes = []
    edges = []
    for party, pt in sorted(party_totals.items(), key=lambda kv: -kv[1]["total"]):
        nodes.append({
            "id": f"party:{party}",
            "label": party,
            "kind": "party",
            "industry": "parties",
            "group": "parties",
            "colour": PARTY_COLOURS.get(party, "#8A8F98"),
            "total": round(pt["total"]),
            "count": pt["count"],
            "firstYear": min(pt["years"]) if pt["years"] else None,
            "lastYear": max(pt["years"]) if pt["years"] else None,
        })

    for d in picked:
        display = d["canonical"]
        if not display:
            display = max(d["names"].items(), key=lambda kv: kv[1])[0]
            if display.isupper():
                display = display.title()
            display = re.sub(r"\bPTY\b", "Pty", display)
            display = re.sub(r"\bLTD\b", "Ltd", display)
            display = re.sub(r"\bLIMITED\b", "Limited", display)
        others = [n for n, _ in sorted(d["names"].items(), key=lambda kv: -kv[1])
                  if norm_key(n) != norm_key(display)]
        ind = dominant_industry(d)
        node_id = "donor:" + norm_key(display)
        nodes.append({
            "id": node_id,
            "label": display,
            "kind": "donor",
            "industry": ind,
            "group": CLUSTER_OF.get(ind, FALLBACK_CLUSTER),
            "total": round(d["total"]),
            "count": d["count"],
            "firstYear": min(d["years"]) if d["years"] else None,
            "lastYear": max(d["years"]) if d["years"] else None,
            "aliases": others,
        })
        for party, p in sorted(d["parties"].items(), key=lambda kv: -kv[1]["total"]):
            edges.append({
                "source": node_id,
                "target": f"party:{party}",
                "total": round(p["total"]),
                "count": p["count"],
                "firstYear": min(p["years"]) if p["years"] else None,
                "lastYear": max(p["years"]) if p["years"] else None,
            })

    floor_text = f"${cfg['other_floor'] / 1000:,.0f}k".replace(",", "")
    exclusions = [
        "gifts to candidates, committees, third parties and independents (no canonical party recipient)",
        "public electoral funding and government bodies (electoral commissions / ATO / departments; industry 'government')",
        "donor entities resolved to kind='government' or kind='party_unit'",
        "internal party transfers (industry='party_internal' or donor named after a party)",
        f"donors with industry other/unknown under {floor_text} lifetime in this jurisdiction",
    ]
    for t in cfg["drop_disclosure_types"]:
        exclusions.append(f"disclosure_type='{t}' rows ({dropped_types.get(t, 0)} rows)")
    if cfg.get("drop_election_rows"):
        exclusions.append(
            "gifts tagged to an election return, which repeat the same gifts in the "
            f"annual returns ({dropped_election} rows)")

    coverage = (
        f"financial years {fys[0]} to {fys[-1]}" if fys else "no dated rows"
    )

    out = {
        "meta": {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "jurisdiction": jur,
            "jurisdictionLabel": cfg["label"],
            "commission": cfg["commission"],
            "sourceShort": cfg["sourceShort"],
            "source": cfg["source"],
            "source_url": cfg["source_url"],
            "licence": cfg["licence"],
            "coverage": coverage,
            "threshold": cfg["threshold"],
            "not_summed": NOT_SUMMED,
            "methodology": (
                f"Donor->party flows from {cfg['commission']} disclosures with a canonical party "
                "recipient; amounts aggregated per (canonical donor entity, party) using "
                "ext_donor_aliases, so every spelling of a donor counts once. Top "
                f"{TOP_DONORS} donors by lifetime total in this jurisdiction shown. "
                "Same shape and rules as the federal money.json; the two are never combined."
            ),
            "entity_resolution": (
                "parli.ingest.donor_entities resolves each raw donor_name to an entity in "
                "ext_donor_entities (exact-normalised, rule-based suffix/branch stripping, "
                "then the hand-curated parli/ingest/donor_aliases.json). Node label is the "
                "canonical name; node.aliases lists the other spellings it answers to."
            ),
            "exclusions": exclusions,
            "rows_considered": considered,
            "rows_used": len(rows),
            "rows_excluded_public_funding": excluded["public_funding"],
            "rows_excluded_party_internal": excluded["party_internal"],
            "rows_excluded_government_entity": excluded["government_entity"],
            "rows_without_year": rows_without_year,
            "donors_unresolved": len(unresolved),
            "rows_dropped_by_disclosure_type": dict(dropped_types),
            "rows_dropped_election_duplicates": dropped_election or None,
            "political_donation_flag": flag_counts if jur == "qld" else None,
            "donors_skipped_other_floor": skipped_other,
            "donor_nodes": len(picked),
            "party_nodes": len(party_totals),
            "edge_count": len(edges),
        },
        "nodes": nodes,
        "edges": edges,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
