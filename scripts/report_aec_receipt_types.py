#!/usr/bin/env python3
"""Reconcile cached AEC receipts and publish review aggregates, without fetching."""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import zipfile

from parli.ingest.aec_receipts import normal_type, period_key
from parli.ingest.donations import _read_csv_text
from scripts.aec_receipt_selection import load_selection


def report(db, cache, graph):
    inventory = []
    for path in sorted(cache.glob("*.zip")):
        with zipfile.ZipFile(path) as z:
            files = []
            for name in sorted(z.namelist()):
                if not name.endswith(".csv"):
                    continue
                reader = csv.DictReader(io.StringIO(_read_csv_text(z, name)))
                columns = reader.fieldnames
                files.append({"file": name, "columns": columns, "rows": sum(1 for _ in reader)})
        inventory.append({"archive": path.name, "bytes": path.stat().st_size,
                          "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "files": files})
    rows_by_year = []
    for fy, kind, count, amount in db.execute(
        "SELECT financial_year,receipt_type,COUNT(*),SUM(amount) FROM aec_receipt_records "
        "WHERE source_file='Detailed Receipts.csv' GROUP BY financial_year,receipt_type ORDER BY financial_year,receipt_type"):
        rows_by_year.append({"financial_year": fy, "aec_receipt_type": kind, "normalised_type": normal_type(kind),
                             "rows": count, "aud": round(amount or 0, 2)})
    kinds = [dict(zip(("source", "recipient_kind", "return_type", "rows", "aud"), r)) for r in db.execute(
        "SELECT source,recipient_kind,return_type,COUNT(*),ROUND(SUM(amount),2) FROM aec_receipt_records "
        "WHERE record_side='recipient' GROUP BY source,recipient_kind,return_type ORDER BY source,recipient_kind,return_type")]
    recipient_keys = Counter((source, donor, recipient, amount, period_key(fy)) for source, donor, recipient, amount, fy in db.execute(
        "SELECT source,donor_name,recipient,amount,financial_year FROM aec_receipt_records WHERE record_side='recipient'"))
    cross_checks = []
    for archive, filename in db.execute("SELECT DISTINCT archive,source_file FROM aec_receipt_records WHERE record_side='cross_check' ORDER BY archive,source_file"):
        keys = Counter((source, donor, recipient, amount, period_key(fy)) for source, donor, recipient, amount, fy in db.execute(
            "SELECT source,donor_name,recipient,amount,financial_year FROM aec_receipt_records WHERE archive=? AND source_file=?", (archive, filename)))
        cross_checks.append({"archive": archive, "file": filename, "rows": sum(keys.values()),
                             "potential_exact_overlap_rows": sum((keys & recipient_keys).values())})
    selection = load_selection(db)
    industries = defaultdict(Counter)
    for donor, amount, industry in db.execute(
        "SELECT donor_name,amount,industry FROM donations "
        "WHERE source IN ('aec_annual','aec_election','aec_referendum')"):
        eid = selection.entity(donor) or donor
        if industry and industry not in ("other", "unidentified"):
            industries[eid][industry] += amount or 0
    tags = {eid: "unions" if selection.entity_kinds.get(eid) == "union" else max(tags, key=tags.get)
            for eid, tags in industries.items()}
    buckets = {s: {"all_types": Counter(), "donation_only": Counter()} for s in
               ("gambling", "mining", "property", "unions", "tobacco", "finance")}
    excluded = Counter()
    for donor, recipient, amount, fy, kind in db.execute(
        "SELECT donor_name,recipient,amount,financial_year,receipt_type FROM aec_receipt_records "
        "WHERE record_side='recipient' AND recipient_kind='political_party'"):
        reason = selection.exclusion(donor, recipient, amount, fy, "political_party", receipt_type=kind)
        if reason:
            excluded[reason] += 1
            continue
        eid = selection.entity(donor) or donor
        tag = tags.get(eid)
        if tag not in buckets:
            continue
        party = selection.recipient_party[recipient]
        buckets[tag]["all_types"][party] += amount
        if normal_type(kind) == "donation_received":
            buckets[tag]["donation_only"][party] += amount

    def rankings(values):
        values = Counter({name: amount for name, amount in values.items() if amount > 0})
        return {"aud": round(sum(values.values()), 2), "top5": [
            {"recipient": name, "aud": round(amount, 2)} for name, amount in values.most_common(5)]}

    graph_buckets = {s: {"all_types": Counter(), "donation_only": Counter()} for s in buckets}
    nodes = {n["id"]: n for n in graph["nodes"]}
    for e in graph["edges"]:
        source, target = nodes[e["source"]], nodes[e["target"]]
        tag = source.get("industry")
        if tag not in graph_buckets or target["kind"] != "party":
            continue
        # Public Funding stays as its own cell on the map (A35); like the uncapped side, no total counts it.
        graph_buckets[tag]["all_types"][target["label"]] += sum(v for k, v in e.get("by_type", {}).items() if k != "public_funding")
        graph_buckets[tag]["donation_only"][target["label"]] += e.get("by_type", {}).get("donation_received", 0)
    return {"fetches": [], "cached_archives": inventory, "annual_detailed_rows_by_type_and_financial_year": rows_by_year,
            "recipient_kinds": kinds,
            "donor_cross_checks": cross_checks,
            "cross_check_note": "Potential overlaps compare exact source, donor, recipient, amount and normalised financial year/event; annual detail has no gift date, so this is not proof of gift identity. Cross-check rows contribute zero to the typed measure.",
            "legacy_backfill": dict(db.execute("SELECT COALESCE(record_side,'unmatched'),COUNT(*) FROM donations WHERE source LIKE 'aec_%' GROUP BY record_side")),
            "full_party_receipts_scope": "All cached Political Party Return itemised recipient receipts, uncapped donors. Exact existing recipient-party mappings and existing canonical donor industry tags. No donor declarations, public bodies, internal party transfers, nonpositive amounts or reviewed outliers. Property is OPAX's broad property/construction tag, not a reviewed developer-only list. Mining excludes the separate fossil_fuels tag.",
            "selection_rule": "Both scopes use aec_receipt_selection.ReceiptSelection.exclusion, including per-name public-funding and party-name exclusions even when another alias of the entity is visible. The map additionally requires an existing donor-party edge. Visible industry tags remain the released graph node tags; uncapped tags follow industry_method.",
            "industry_method": "Resolve donor names with the existing exact alias index. Sum existing AEC-row amounts by classified industry for each donor entity, ignoring other/unidentified; largest tag wins. Resolver-kind union forces unions. No new industry labels are inferred from the CSV.",
            "full_party_receipts_exclusions": dict(excluded),
            "industries_full_party_receipts": {s: {measure: rankings(values) for measure, values in measures.items()} for s, measures in buckets.items()},
            "industries_visible_graph_receipts": {s: {measure: rankings(values) for measure, values in measures.items()} for s, measures in graph_buckets.items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--cache-dir", default=Path("~/.cache/autoresearch/donations").expanduser(), type=Path)
    parser.add_argument("--graph", default=Path("portal/public/graph/money.json"), type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    result = report(db, args.cache_dir, json.loads(args.graph.read_text()))
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
