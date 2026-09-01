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
   ones earn a place (shown under 'other').
6. Donor names are lightly normalised before aggregation (case folded,
   punctuation stripped, company suffixes like PTY/LTD/LIMITED dropped) so
   'Mineralogy Pty Ltd' and 'MINERALOGY PTY LTD' merge. No deeper entity
   resolution is attempted.
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


def year_of(fy: str | None) -> int | None:
    """First 4-digit year in a financial_year string ('1998-99', '2004 Federal Election')."""
    if not fy:
        return None
    m = re.search(r"\b(19|20)\d\d\b", fy)
    return int(m.group(0)) if m else None


def main() -> None:
    db = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row

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

    # Aggregate per normalised donor.
    donors: dict[str, dict] = {}
    excluded = {"public_funding": 0, "party_internal": 0}
    for r in rows:
        name = (r["donor_name"] or "").strip()
        if not name:
            continue
        key = norm_key(name)
        if not key:
            continue
        if PUBLIC_FUNDING_RE.search(name) or PUBLIC_FUNDING_RE.search(key):
            excluded["public_funding"] += 1
            continue
        if r["industry"] == "party_internal" or PARTY_WORD_RE.search(name):
            excluded["party_internal"] += 1
            continue
        d = donors.get(key)
        if d is None:
            d = donors[key] = {
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
        d["industries"][r["industry"] or "other"] += amt
        p = d["parties"][r["party"]]
        p["total"] += amt
        p["count"] += 1
        if y:
            p["years"].append(y)

    # Rank donors; rule 5 for industry-less donors.
    def dominant_industry(d: dict) -> str:
        ind = max(d["industries"].items(), key=lambda kv: kv[1])[0]
        return "other" if ind in ("other", "unidentified") else ind

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
        display = max(d["names"].items(), key=lambda kv: kv[1])[0]
        # Title-case ALL-CAPS AEC filings for readability; keep acronyms.
        if display.isupper():
            display = display.title()
        display = re.sub(r"\bPTY\b", "Pty", display)
        display = re.sub(r"\bLTD\b", "Ltd", display)
        display = re.sub(r"\bLIMITED\b", "Limited", display)
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
                "amounts aggregated per (normalised donor, party). Top "
                f"{TOP_DONORS} donors by lifetime total shown."
            ),
            "exclusions": [
                "rows without a canonical party recipient (receipts of unions/associated entities)",
                "donation_type='flagged_review' rows (data-quality outliers)",
                "public electoral funding (AEC / state electoral commissions / ATO / Dept of Finance)",
                "internal party transfers (industry='party_internal' or donor named after a party)",
                "donors with industry other/unknown under $5m lifetime",
            ],
            "rows_considered": used_rows,
            "rows_excluded_public_funding": excluded["public_funding"],
            "rows_excluded_party_internal": excluded["party_internal"],
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
