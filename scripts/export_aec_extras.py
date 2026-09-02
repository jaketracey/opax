#!/usr/bin/env python3
"""Export the AEC Transparency Register extras (debts, discretionary benefits,
return headline totals, the associated-entity / third-party roster) from
parli.db's ext_aec_* tables to one static JSON file for the portal.

Run on the box that holds the database (read-only; self-contained so it can be
piped over ssh like the other exports):

    ssh desktop python3 - < scripts/export_aec_extras.py > portal/public/graph/aec-extras.json

Shape (amounts are whole dollars; year arrays are compact and documented in
`meta.year_columns`):

  meta      source, licence (CC BY 4.0), coverage, latest_year, counts, notes
  parties   { "<canonical party>": {
                returns:  per-year headline totals summed over every branch that
                          lodged a Political Party Return under that name
                debts:    latest year's creditors (aggregated across branches,
                          top N) plus a per-year total series
                benefits: latest year's discretionary benefits (top providers)
                          plus a per-year series
                associated_entities: the entities whose own return names this
                          party, with their latest headline totals (top N) } }
  entities  the roster of associated entities, significant third parties,
            political campaigners and third parties: one entry per normalised
            name with the register's return types, associated parties and a
            per-year series of their own headline totals. Capped per kind by
            peak annual receipts / expenditure (see meta.caps); donors and MP
            returns are not exported (donors already have the money map).

Rules
  1. `parties` only carries rows whose return IS a party return
     (kind='party'); an associated entity's debts stay with the entity and
     reach the party block only through `associated_entities`.
  2. Debts are balances owed at 30 June as listed on the lodger's return --
     trade creditors and tax owed sit beside bank loans; the register's
     Financial / Non-financial flag is carried as `type` and summed as
     `financial_total`.
  3. Names are aggregated with the money map's norm_key (case, punctuation
     and company suffixes) and no deeper; the display spelling is the most
     recent year's.
"""

import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone

DB_PATH = "/home/jake/.cache/autoresearch/parli.db"
AEC_ANNUAL_URL = "https://transparency.aec.gov.au/Download/AllAnnualData"
REGISTER_URL = "https://transparency.aec.gov.au/"
LICENCE_URL = "https://www.aec.gov.au/footer/Copyright.htm"

TOP_LENDERS = 12          # per party, latest year
TOP_PROVIDERS = 8         # discretionary benefits per party, latest year
TOP_ASSOCIATED = 12       # associated entities per party
ROSTER_CAPS = {           # entities per kind, ranked by peak annual receipts (or expenditure)
    "associated_entity": 150,
    "significant_third_party": 150,
    "political_campaigner": 150,
    "third_party": 80,
}
ROSTER_FLOOR = 100_000    # an entity never above this in any year is left out

# Same as scripts/export_money_graph.norm_key (copied: this file is piped over ssh alone).
SUFFIX_TOKENS = {"pty", "ltd", "limited", "proprietary", "inc", "incorporated", "co", "the", "atf", "trust", "holdings"}


def norm_key(name: str) -> str:
    s = re.sub(r"[^a-z0-9 ]+", " ", (name or "").lower())
    return " ".join(t for t in s.split() if t not in SUFFIX_TOKENS)


ACRONYMS = {"ATO", "NAB", "ANZ", "CBA", "NSW", "QLD", "VIC", "WA", "SA", "NT", "ACT", "TAS", "ALP", "LNP",
            "CFMEU", "CEPU", "CPSU", "AMWU", "AWU", "ANMF", "ASU", "ETU", "MUA", "TWU", "HSU", "NTEU", "SDA",
            "ACTU", "RSL", "GST", "ABN", "ACN", "MAPS"}
SMALL_WORDS = {"of", "and", "the", "for", "in", "at", "on", "to", "as", "by"}


def display(name: str) -> str:
    """Title-case ALL-CAPS filings for readability, keeping acronyms and
    lower-casing the small words; mixed-case names pass through."""
    d = re.sub(r"\s+", " ", (name or "").strip())
    if d.isupper() and " " in d:
        words = []
        for i, w in enumerate(d.split(" ")):
            core = re.sub(r"[^A-Z]", "", w)
            if core in ACRONYMS or (len(core) <= 3 and core.lower() not in SMALL_WORDS):
                words.append(w)
            elif core.lower() in SMALL_WORDS and i > 0:
                words.append(w.lower())
            else:
                words.append(w.title())
        d = " ".join(words)
    d = re.sub(r"\bPTY\b", "Pty", d)
    d = re.sub(r"\bLTD\b", "Ltd", d)
    d = re.sub(r"\bINC\b", "Inc", d)
    return re.sub(r"\bLIMITED\b", "Limited", d)


def R(x) -> int | None:
    return None if x is None else int(round(float(x)))


def main() -> None:
    db = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    q = lambda sql, *p: db.execute(sql, p).fetchall()  # noqa: E731

    counts = {t: db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("ext_aec_debts", "ext_aec_benefits", "ext_aec_returns")}
    latest_year = db.execute("SELECT MAX(financial_year) FROM ext_aec_returns WHERE kind='party'").fetchone()[0]
    span = lambda t, w="1=1": tuple(db.execute(  # noqa: E731
        f"SELECT MIN(financial_year), MAX(financial_year) FROM {t} WHERE {w}").fetchone())

    # ── parties ──────────────────────────────────────────────────────────────
    parties: dict[str, dict] = {}

    def party(p: str) -> dict:
        return parties.setdefault(p, {"latest_year": None, "returns": [], "debts": None, "benefits": None,
                                      "associated_entities": [], "associated_entities_total": 0})

    for r in q("""SELECT entity_canonical AS p, financial_year AS fy, COUNT(*) AS branches,
                         SUM(total_receipts) AS rec, SUM(total_payments) AS pay, SUM(total_debts) AS debt,
                         SUM(itemised_donations) AS i_don, SUM(itemised_other_receipts) AS i_oth,
                         SUM(itemised_public_funding) AS i_pub
                  FROM ext_aec_returns WHERE kind='party' AND entity_canonical IS NOT NULL
                  GROUP BY 1, 2 ORDER BY 1, 2"""):
        d = party(r["p"])
        d["returns"].append([r["fy"], R(r["rec"]), R(r["pay"]), R(r["debt"]), r["branches"],
                             R(r["i_don"]), R(r["i_oth"]), R(r["i_pub"])])
        d["latest_year"] = max(d["latest_year"] or "", r["fy"])

    # Debts: per-year series, then the latest year's creditors aggregated across branches.
    debt_years: dict[str, list] = defaultdict(list)
    for r in q("""SELECT recipient_canonical AS p, financial_year AS fy, SUM(amount) AS total,
                         SUM(CASE WHEN lender_type='Financial' THEN amount ELSE 0 END) AS fin, COUNT(*) AS n
                  FROM ext_aec_debts WHERE kind='party' AND recipient_canonical IS NOT NULL
                  GROUP BY 1, 2 ORDER BY 1, 2"""):
        debt_years[r["p"]].append([r["fy"], R(r["total"]), R(r["fin"]), r["n"]])
    for p, series in debt_years.items():
        d = party(p)
        year = series[-1][0]
        agg: dict[str, dict] = {}
        for r in q("""SELECT lender_name, recipient, amount, lender_type FROM ext_aec_debts
                      WHERE kind='party' AND recipient_canonical=? AND financial_year=? ORDER BY amount DESC""", p, year):
            k = norm_key(r["lender_name"]) or r["lender_name"].lower()
            a = agg.setdefault(k, {"name": display(r["lender_name"]), "amount": 0, "type": r["lender_type"], "to": []})
            a["amount"] += R(r["amount"]) or 0
            if r["recipient"] not in a["to"]:
                a["to"].append(r["recipient"])
        top = sorted(agg.values(), key=lambda a: -a["amount"])
        d["debts"] = {
            "year": year, "total": series[-1][1], "financial_total": series[-1][2],
            "lenders": len(agg), "top": top[:TOP_LENDERS], "by_year": series,
        }

    # Discretionary benefits to the party itself (capital contributions only go to associated entities).
    ben_years: dict[str, list] = defaultdict(list)
    for r in q("""SELECT recipient_canonical AS p, financial_year AS fy, SUM(amount) AS total, COUNT(*) AS n
                  FROM ext_aec_benefits WHERE kind='party' AND benefit_type='discretionary_benefit'
                    AND recipient_canonical IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2"""):
        ben_years[r["p"]].append([r["fy"], R(r["total"]), r["n"]])
    for p, series in ben_years.items():
        d = party(p)
        year = series[-1][0]
        agg: dict[str, dict] = {}
        for r in q("""SELECT provider_name, amount FROM ext_aec_benefits WHERE kind='party'
                      AND benefit_type='discretionary_benefit' AND recipient_canonical=? AND financial_year=?""", p, year):
            k = norm_key(r["provider_name"]) or r["provider_name"].lower()
            a = agg.setdefault(k, {"name": display(r["provider_name"]), "amount": 0})
            a["amount"] += R(r["amount"]) or 0
        d["benefits"] = {"year": year, "total": series[-1][1],
                         "top": sorted(agg.values(), key=lambda a: -a["amount"])[:TOP_PROVIDERS], "by_year": series}

    # Associated entities: the latest return of each entity that names the party.
    assoc: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in q("""SELECT entity_name, financial_year AS fy, associated_party_canonical AS apc,
                         total_receipts, total_payments, total_debts
                  FROM ext_aec_returns WHERE kind='associated_entity' AND associated_party_canonical IS NOT NULL
                  ORDER BY financial_year"""):
        for p in r["apc"].split("; "):
            k = norm_key(r["entity_name"])
            assoc[p][k] = {"name": display(r["entity_name"]), "year": r["fy"], "receipts": R(r["total_receipts"]),
                           "payments": R(r["total_payments"]), "debts": R(r["total_debts"])}
    for p, ents in assoc.items():
        d = party(p)
        ranked = sorted(ents.values(), key=lambda e: -(e["receipts"] or 0))
        d["associated_entities"] = ranked[:TOP_ASSOCIATED]
        d["associated_entities_total"] = len(ents)

    # ── roster ───────────────────────────────────────────────────────────────
    ents: dict[str, dict] = {}
    for r in q("""SELECT financial_year AS fy, return_type, kind, entity_name, abn, associated_party_canonical AS apc,
                         total_receipts, total_payments, total_debts, electoral_expenditure, total_donations_received
                  FROM ext_aec_returns
                  WHERE kind IN ('associated_entity', 'significant_third_party', 'political_campaigner', 'third_party')
                  ORDER BY financial_year"""):
        k = norm_key(r["entity_name"])
        if not k:
            continue
        e = ents.setdefault(k, {"name": None, "kind": None, "return_types": [], "associated_parties": [],
                                "abn": None, "years": [], "peak": 0, "latest_year": None})
        e["name"] = display(r["entity_name"])  # rows arrive oldest first: the newest spelling wins
        e["kind"] = r["kind"]
        e["latest_year"] = r["fy"]
        if r["return_type"] not in e["return_types"]:
            e["return_types"].append(r["return_type"])
        for p in (r["apc"] or "").split("; "):
            if p and p not in e["associated_parties"]:
                e["associated_parties"].append(p)
        if r["abn"]:
            e["abn"] = r["abn"]
        e["years"].append([r["fy"], R(r["total_receipts"]), R(r["total_payments"]), R(r["total_debts"]),
                           R(r["electoral_expenditure"]), R(r["total_donations_received"])])
        e["peak"] = max(e["peak"], R(r["total_receipts"]) or 0, R(r["electoral_expenditure"]) or 0,
                        R(r["total_donations_received"]) or 0)

    roster = []
    per_kind: dict[str, int] = defaultdict(int)
    for e in sorted(ents.values(), key=lambda e: -e["peak"]):
        if e["peak"] < ROSTER_FLOOR:
            continue
        if per_kind[e["kind"]] >= ROSTER_CAPS.get(e["kind"], 0):
            continue
        per_kind[e["kind"]] += 1
        roster.append(e)
    roster.sort(key=lambda e: e["name"].lower())

    out = {
        "meta": {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "source": "AEC Transparency Register annual returns (AllAnnualData bundle) via parli.db ext_aec_debts / ext_aec_benefits / ext_aec_returns",
            "source_url": AEC_ANNUAL_URL,
            "register_url": REGISTER_URL,
            "licence": "CC BY 4.0 (Australian Electoral Commission)",
            "licence_url": LICENCE_URL,
            "latest_year": latest_year,
            "coverage": {
                "returns": "%s to %s" % span("ext_aec_returns"),
                "debts": "%s to %s" % span("ext_aec_debts"),
                "discretionary_benefits": "%s to %s" % span("ext_aec_benefits", "benefit_type='discretionary_benefit'"),
                "capital_contributions": "%s to %s" % span("ext_aec_benefits", "benefit_type='capital_contribution'"),
            },
            "year_columns": {
                "parties.returns": ["year", "receipts", "payments", "debts", "branches", "itemised_donations", "itemised_other_receipts", "itemised_public_funding"],
                "parties.debts.by_year": ["year", "total", "financial_institutions_total", "creditors"],
                "parties.benefits.by_year": ["year", "total", "lines"],
                "entities.years": ["year", "receipts", "payments", "debts", "electoral_expenditure", "gifts_received"],
            },
            "caps": {"top_lenders": TOP_LENDERS, "top_providers": TOP_PROVIDERS, "top_associated": TOP_ASSOCIATED,
                     "roster_per_kind": ROSTER_CAPS, "roster_floor": ROSTER_FLOOR},
            "counts": {"rows": counts, "parties": len(parties), "entities": len(roster),
                       "entities_before_cap": len(ents), "roster_by_kind": dict(per_kind)},
            "notes": [
                "Debts are balances owed at 30 June as listed on the lodger's own annual return: bank loans sit beside trade creditors and tax owed. The register's Financial / Non-financial institution flag is carried per creditor.",
                "Party figures sum every branch that lodged a Political Party Return under that party's name; state branches and the federal secretariat are separate returns.",
                "Discretionary benefits are payments from Commonwealth, state or local government other than public election funding; the register itemises them from 2018-19.",
                "Return totals are the lodger's own headline figures; itemised receipts cover only lines above the disclosure threshold, so they sum to less than total receipts.",
                "Names are matched on case, punctuation and company suffixes only; the same body under two spellings appears twice.",
            ],
        },
        "parties": dict(sorted(parties.items())),
        "entities": roster,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
