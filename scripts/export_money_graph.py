#!/usr/bin/env python3
"""Export the OPAX Money Map graph from parli.db (AEC donations data).

Run on the box that holds the database (read-only; never locks the file):

    ssh desktop python3 - < scripts/export_money_graph.py > portal/public/graph/money.json

Produces a JSON graph of donor -> party flows:
  nodes: the ~11 canonical parties + the top N donors by lifetime total
  edges: donor->party aggregates (total dollars, donation count, year span)

Methodology / exclusion rules (all documented in the output's `meta` block):

1. Only rows with `recipient_canonical` set are used. Rows without it are
   receipts reported by unions, foundations and other associated entities --
   money flowing *between* non-party actors -- not donations to parties.
2. `donation_type = 'flagged_review'` rows are dropped (33 rows, ~$780m:
   data-quality outliers awaiting review; the average row is $23m, which is
   not a plausible single receipt).
3. Public electoral funding is not a donation: any donor whose name matches
   an electoral commission / public funding body / tax office pattern is
   excluded, regardless of its (often wrong) industry classification.
4. Internal party transfers are excluded from the donor list: rows with
   industry = 'party_internal', plus any donor whose name contains a party
   name word (labor, liberal, greens, ...) -- these are party investment
   vehicles (Labor Holdings, Cormack Foundation via classification, LNP
   Nominees, state branches donating to their federal party, etc.).
5. Donors with industry in ('other', NULL, 'unidentified') are excluded from
   the top list unless their lifetime total clears $5m -- they carry no
   industry signal for the map's colour/cluster grammar, so only the huge
   ones earn a place (shown under 'other'). A donor's industry is the biggest
   CLASSIFIED tag across its rows: 'other'/'unidentified' mean "not
   classified" and never outvote a real tag, or a merged donor's untagged
   spellings could drag a classified donor off the map.
6. Donations are aggregated per CANONICAL DONOR ENTITY, not per spelling.
   `ext_donor_aliases` maps every raw `donor_name` to an entity in
   `ext_donor_entities` (parli.ingest.donor_entities), so the seven ways the
   AEC spells Westpac are one donor with one total. The node's `label` is the
   canonical name and `aliases` lists the other spellings behind it, biggest
   first. A donor_name with no alias row (a return loaded after the resolver
   last ran) falls back to the old light normalisation and is counted in
   meta.donors_unresolved.
7. Entities whose kind is 'government' or 'party_unit' are dropped. This is
   what finally removes "Dept of Finance" and "Dept Finance" -- two spellings
   of one department that the rule-3 name regex missed (it looks for
   "department of", not "dept of") and that carried a bogus
   industry='individual' tag.

`financial_year` is not always a year: AEC election returns store the event
name, and by-election events ("Wentworth by-election") carry no digits at all.
`year_of` reads the first 4-digit year and falls back to BY_ELECTION_YEAR for
the named by-elections, so those rows contribute to firstYear/lastYear instead
of silently dropping out. Rows still without a year are counted in
meta.rows_without_year.
"""

import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import date, datetime, timezone

DB_PATH = "/home/jake/.cache/autoresearch/parli.db"
TOP_DONORS = 250
OTHER_INDUSTRY_FLOOR = 5_000_000  # rule 5

# Rule 3: public funding / government bodies. Matched against the donor name;
# donors whose dominant industry is 'government' are excluded wholesale too.
PUBLIC_FUNDING_RE = re.compile(
    r"electoral commission|election funding|electoral office|"
    r"tax(ation)?\s+(office|authority)|\bato\b|\baec\b|\becq\b|"
    r"department of|australian agency|commonwealth of australia|"
    r"electoral comm\b",
    re.I,
)

# Rule 4: party-name words that mark a donor as an internal party vehicle.
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

# The map clusters/colours by a coarser `group` than the raw industry tag:
# 25+ raw industries fragment the ring into unreadable slivers, so related
# ones share a territory. The raw industry stays on each node for the info
# card and the parliament ask-link.
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

# Conventional-but-neutral, accessibility-minded party colours.
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
}


def norm_key(name: str) -> str:
    """Aggregation key: case/punctuation/suffix-insensitive (rule 6)."""
    s = re.sub(r"[^a-z0-9 ]+", " ", name.lower())
    tokens = [t for t in s.split() if t not in SUFFIX_TOKENS]
    return " ".join(tokens)


# `financial_year` holds the AEC event name for election returns, and a
# by-election event carries no year at all. Polling days, for the record:
# Braddon and Wentworth 2018, Eden-Monaro 2020, Fadden 2023.
BY_ELECTION_YEAR = {
    "braddon by-election": 2018,
    "wentworth by-election": 2018,
    "eden-monaro by-election": 2020,
    "fadden by-election": 2023,
}


def year_of(fy: str | None) -> int | None:
    """First 4-digit year in a financial_year string ('1998-99', '2004 Federal
    Election'), or the polling year of a named by-election."""
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
        sys.stderr.write("export_money_graph: no ext_donor_* tables; "
                         "falling back to per-spelling aggregation\n")
        return {}, {}
    ents = {r["entity_id"]: {"name": r["canonical_name"], "kind": r["kind"]}
            for r in db.execute("SELECT entity_id, canonical_name, kind FROM ext_donor_entities")}
    alias = {r["alias_raw"]: r["entity_id"] for r in db.execute(
        "SELECT alias_raw, entity_id FROM ext_donor_aliases")}
    return alias, ents


def main() -> None:
    db = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    alias_to_entity, entities = load_canonical(db)

    rows = db.execute(
        """
        SELECT donor_name, recipient_canonical AS party, amount, financial_year,
               industry, donor_type
        FROM donations
        WHERE recipient_canonical IS NOT NULL AND recipient_canonical != ''
          AND donation_type != 'flagged_review'
          AND amount > 0
        """
    ).fetchall()
    used_rows = len(rows)

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
        # rule 7: the resolver knows a department or a party unit when it sees one
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

    # Rank donors; rule 5 for industry-less donors.
    def dominant_industry(d: dict) -> str:
        # A union is a union. Rolling branches up can let one oddly-tagged branch
        # (a CFMEU building fund tagged 'property') outweigh the rest and recolour
        # the whole union on the map, so the resolver's kind wins for unions.
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
    for d in ranked:
        ind = dominant_industry(d)
        if ind == "government":
            continue  # rule 3: a government body is not a donor
        if ind == "other" and d["total"] < OTHER_INDUSTRY_FLOOR:
            continue
        picked.append(d)
        if len(picked) >= TOP_DONORS:
            break

    # Party aggregates over the FULL cleaned row set (not just top donors).
    party_totals = defaultdict(lambda: {"total": 0.0, "count": 0, "years": []})
    for r in rows:
        name = (r["donor_name"] or "").strip()
        if PUBLIC_FUNDING_RE.search(name):
            continue  # public funding inflates party totals misleadingly
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
            # unresolved: fall back to the biggest-dollar spelling, tidied
            display = max(d["names"].items(), key=lambda kv: kv[1])[0]
            # Title-case ALL-CAPS AEC filings for readability; keep acronyms.
            if display.isupper():
                display = display.title()
            display = re.sub(r"\bPTY\b", "Pty", display)
            display = re.sub(r"\bLTD\b", "Ltd", display)
            display = re.sub(r"\bLIMITED\b", "Limited", display)
        # Every other spelling the map should still answer to, biggest first.
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

    out = {
        "meta": {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "source": "AEC donation returns via parli.db `donations` table",
            "coverage": "financial years 1998-99 to 2025-26",
            "methodology": (
                "Donor->party flows from rows with a canonical party recipient; "
                "amounts aggregated per (canonical donor entity, party) using "
                "ext_donor_aliases, so every spelling of a donor counts once. Top "
                f"{TOP_DONORS} donors by lifetime total shown."
            ),
            "entity_resolution": (
                "parli.ingest.donor_entities resolves each raw donor_name to an entity in "
                "ext_donor_entities (exact-normalised, rule-based suffix/branch stripping, "
                "then the hand-curated parli/ingest/donor_aliases.json). Node label is the "
                "canonical name; node.aliases lists the other spellings it answers to."
            ),
            "year_derivation": (
                "financial_year is the AEC event name on election returns; the first 4-digit "
                "year is used, and named by-elections fall back to their polling year "
                "(Braddon/Wentworth 2018, Eden-Monaro 2020, Fadden 2023)."
            ),
            "exclusions": [
                "rows without a canonical party recipient (receipts of unions/associated entities)",
                "donation_type='flagged_review' rows (data-quality outliers)",
                "public electoral funding (AEC / state electoral commissions / ATO / Dept of Finance)",
                "donor entities resolved to kind='government' or kind='party_unit'",
                "internal party transfers (industry='party_internal' or donor named after a party)",
                "donors with industry other/unknown under $5m lifetime",
            ],
            "rows_considered": used_rows,
            "rows_excluded_public_funding": excluded["public_funding"],
            "rows_excluded_party_internal": excluded["party_internal"],
            "rows_excluded_government_entity": excluded["government_entity"],
            "rows_without_year": rows_without_year,
            "donors_unresolved": len(unresolved),
            "donor_nodes": len(picked),
            "party_nodes": len(party_totals),
            "edge_count": len(edges),
            "party_totals_note": (
                "Party node totals cover all cleaned rows except public funding, "
                "unchanged by entity resolution."
            ),
        },
        "nodes": nodes,
        "edges": edges,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
