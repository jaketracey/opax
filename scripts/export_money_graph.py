#!/usr/bin/env python3
"""Export the OPAX Money Map graph from parli.db (AEC donations data).

Run on the box that holds the database (read-only; never locks the file):

    ssh desktop python3 - < scripts/export_money_graph.py > portal/public/graph/money.json

Produces a JSON graph of donor -> party flows:
  nodes: the ~11 canonical parties + the top N donors by lifetime total
  edges: donor->party aggregates (total dollars, donation count, year span,
         and the per-year cells behind them)

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

Every node and edge also carries `byYear`: {year: [dollars, count]} keyed by
that same first year, plus an `undated` cell for the rows without one, so the
portal's year scrub can re-sum totals, counts and spans for any window
instead of only testing whether a lifetime span overlaps it.
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


def year_cells() -> dict:
    """The per-year tally every aggregate carries: {year: [dollars, count]}
    for the rows with a year, plus the undated remainder."""
    return {"byYear": defaultdict(lambda: [0.0, 0]), "undated": [0.0, 0]}


def tally(agg: dict, year: int | None, amount: float) -> None:
    """Add one row to an aggregate's total, count and per-year cell."""
    agg["total"] += amount
    agg["count"] += 1
    cell = agg["byYear"][year] if year else agg["undated"]
    cell[0] += amount
    cell[1] += 1


def year_fields(agg: dict) -> dict:
    """firstYear/lastYear and the per-year map behind them (meta.by_year)."""
    years = sorted(agg["byYear"])
    out = {
        "firstYear": years[0] if years else None,
        "lastYear": years[-1] if years else None,
        "byYear": {str(y): [round(agg["byYear"][y][0]), agg["byYear"][y][1]] for y in years},
    }
    if agg["undated"][1]:
        out["undated"] = [round(agg["undated"][0]), agg["undated"][1]]
    return out


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


# ── the grants layer (parli.ingest.grant_recipients + the grant tables) ──────
# For the donors on the map: what public money they received, by year, so the
# map can draw a "grants" flow from a central grantor node out to each of them.
# Never summed with donations: it is a different kind of money going the other
# way, and the node totals stay donations only.

GRANTOR = {
    "federal": {"id": "grantor:federal", "label": "Commonwealth grants", "source": "grantconnect",
                "note": "GrantConnect grant awards (Department of Finance), CC BY 3.0 AU",
                "explorer": "federal"},
    "qld": {"id": "grantor:qld", "label": "Queensland grants", "source": "qld_expenditure",
            "note": "Queensland Government Investment Portal expenditure (data.qld.gov.au), CC BY 4.0",
            "explorer": "qld"},
}
GRANTOR_COLOUR = "#2A7F76"


def _file_key(rid: str) -> str:
    kind, _, rest = rid.partition(":")
    s = re.sub(r"[^a-z0-9]+", "-", rest.lower()).strip("-") or "x"
    return f"{kind}-{s}"


def grants_layer(db, jur: str, eid_to_node: dict) -> dict | None:
    """{donor node id: aggregate} for the map's donors that are grant recipients."""
    import zlib
    cfg = GRANTOR.get(jur)
    if not cfg:
        return None
    have = {r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN "
        "('ext_grant_recipients','ext_grant_recipient_keys','ext_grants','ext_grant_details','government_grants')")}
    if not {"ext_grant_recipients", "ext_grant_recipient_keys"} <= have:
        return None
    rid_to_node = {}
    for rid, eid in db.execute(
            "SELECT recipient_id, donor_entity_id FROM ext_grant_recipients WHERE donor_entity_id IS NOT NULL"):
        node = eid_to_node.get(eid)
        if node:
            rid_to_node[rid] = node
    if not rid_to_node:
        return None
    keys = {}
    for kt, kv, rid in db.execute(
            "SELECT key_type, key_value, recipient_id FROM ext_grant_recipient_keys WHERE source = ?", (cfg["source"],)):
        if rid in rid_to_node:
            keys[(kt, kv)] = rid
    per: dict = {}

    def agg_for(node_id):
        a = per.get(node_id)
        if a is None:
            a = per[node_id] = {"total": 0.0, "count": 0, **year_cells(),
                                "programs": defaultdict(float), "rids": defaultdict(float)}
        return a

    def add(rid, value, fy, program):
        node_id = rid_to_node[rid]
        a = agg_for(node_id)
        y = int(fy[:4]) if fy and fy[:4].isdigit() else None
        v = float(value or 0)
        tally(a, y, v)
        a["programs"][program or ""] += v
        a["rids"][rid] += v

    if jur == "federal" and "ext_grants" in have:
        details = {}
        if "ext_grant_details" in have:
            details = {r[0]: r[1] for r in db.execute(
                "SELECT ga_id, recipient_abn FROM ext_grant_details WHERE recipient_abn IS NOT NULL")}
        for ga, name, value, fy, activity, aggregate in db.execute(
                "SELECT ga_id, recipient_name, value, financial_year, activity, aggregate FROM ext_grants"):
            if aggregate:
                continue
            abn = details.get(ga)
            rid = (keys.get(("abn", abn)) if abn else None) or keys.get(("name", (name or "").strip()))
            if rid:
                add(rid, value, fy, activity)
    elif jur == "qld" and "government_grants" in have:
        for abn, name, amount, fy, program, title in db.execute(
                "SELECT recipient_abn, recipient, amount, financial_year, program, title FROM government_grants "
                "WHERE source = 'qld_expenditure'"):
            abn = re.sub(r"\D", "", abn or "")
            rid = (keys.get(("abn", abn)) if abn and abn != "0" else None) or keys.get(("name", (name or "").strip()))
            if rid:
                add(rid, amount, fy, program or title)
    if not per:
        return None
    for node_id, a in per.items():
        top_rid = max(a["rids"].items(), key=lambda kv: kv[1])[0]
        a["rid"] = top_rid
        a["sh"] = zlib.crc32(_file_key(top_rid).encode("utf-8")) % 40
        # Program names are sometimes a whole purpose sentence; the card wants a title.
        a["top"] = [[(p if len(p) <= 90 else p[:88].rstrip() + "…"), round(v)]
                    for p, v in sorted(a["programs"].items(), key=lambda kv: -kv[1])[:3] if p]
    return per


def grants_nodes_edges(jur: str, per: dict, nodes: list) -> tuple[list, list, dict]:
    """Attach `grants` to each donor node it concerns; return (grantor nodes, grant edges, meta)."""
    cfg = GRANTOR[jur]
    total = {"total": 0.0, "count": 0, **year_cells()}
    edges = []
    by_node = {n["id"]: n for n in nodes}
    for node_id, a in sorted(per.items(), key=lambda kv: -kv[1]["total"]):
        n = by_node.get(node_id)
        if not n:
            continue
        n["grants"] = {"total": round(a["total"]), "count": a["count"], **year_fields(a),
                       "top": a["top"], "rid": a["rid"], "sh": a["sh"], "jur": cfg["explorer"]}
        edges.append({"source": cfg["id"], "target": node_id, "total": round(a["total"]), "count": a["count"],
                      **year_fields(a), "grant": True})
        total["total"] += a["total"]
        total["count"] += a["count"]
        for y, (v, c) in a["byYear"].items():
            total["byYear"][y][0] += v
            total["byYear"][y][1] += c
        total["undated"][0] += a["undated"][0]
        total["undated"][1] += a["undated"][1]
    grantor = {"id": cfg["id"], "label": cfg["label"], "kind": "grantor", "industry": "public money",
               "group": "parties", "colour": GRANTOR_COLOUR, "total": round(total["total"]),
               "count": total["count"], **year_fields(total), "recipients": len(edges),
               "explorer": cfg["explorer"]}
    meta = {"grants_source": cfg["note"], "grantor_nodes": 1, "donors_with_grants": len(edges),
            "grant_dollars_to_map_donors": round(total["total"]),
            "grants_note": ("Grant flows run from the grantor node out to the donors on this map that the "
                            "grant register resolves to the same entity (parli.ingest.grant_recipients: ABN, "
                            "then unique name). They are public money going the other way and are never "
                            "summed with donations; node totals stay donations only. byYear keys are the "
                            "first year of the financial year the grant started.")}
    return [grantor], edges, meta


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
                "eid": eid,
                "canonical": ent["name"] if ent else None,
                "entity_kind": ent["kind"] if ent else None,
                "names": defaultdict(float),
                "total": 0.0,
                "count": 0,
                **year_cells(),
                "industries": defaultdict(float),
                "parties": defaultdict(lambda: {"total": 0.0, "count": 0, **year_cells()}),
            }
        amt = float(r["amount"])
        d["names"][name] += amt
        y = year_of(r["financial_year"])
        if not y:
            rows_without_year += 1
        tally(d, y, amt)
        d["industries"][r["industry"] or "other"] += amt
        tally(d["parties"][r["party"]], y, amt)

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
    party_totals = defaultdict(lambda: {"total": 0.0, "count": 0, **year_cells()})
    for r in rows:
        name = (r["donor_name"] or "").strip()
        if PUBLIC_FUNDING_RE.search(name):
            continue  # public funding inflates party totals misleadingly
        tally(party_totals[r["party"]], year_of(r["financial_year"]), float(r["amount"]))

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
            **year_fields(pt),
        })

    eid_to_node: dict = {}
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
            **year_fields(d),
            "aliases": others,
        })
        for party, p in sorted(d["parties"].items(), key=lambda kv: -kv[1]["total"]):
            edges.append({
                "source": node_id,
                "target": f"party:{party}",
                "total": round(p["total"]),
                "count": p["count"],
                **year_fields(p),
            })
        if d.get("eid"):
            eid_to_node[d["eid"]] = node_id

    grants_meta = {}
    per_grants = grants_layer(db, "federal", eid_to_node)
    if per_grants:
        g_nodes, g_edges, grants_meta = grants_nodes_edges("federal", per_grants, nodes)
        nodes.extend(g_nodes)
        edges.extend(g_edges)

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
            "by_year": (
                "byYear maps the first year of each financial year (2023 for 2023-24; "
                "election returns by polling year) to [dollars, donations] for that node "
                "or flow; undated holds the rows with no year. The cells sum to total and "
                "count up to rounding, so a year window can re-sum every figure."
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
            **grants_meta,
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
