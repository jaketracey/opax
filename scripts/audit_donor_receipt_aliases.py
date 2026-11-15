"""Measure receipt alias coverage offline, without publishing donor names.

python -m scripts.audit_donor_receipt_aliases --db cached.sqlite --out audit.json
The DB is read-only. Before uses the former entity/raw lookup; after uses the
exporter's conservative matcher. Neither path changes the map's node/edge cap.
"""
import argparse
import json
import sqlite3
from collections import Counter
from pathlib import Path

from parli.ingest.aec_receipts import normal_type
from scripts.aec_receipt_selection import load_selection
from scripts.receipt_donor_match import ReceiptDonorMatcher, reviewed_receipt_identities
from scripts.receipt_donor_match import has_receipt_annotation


def audit(db, graph):
    selection = load_selection(db)
    matcher = ReceiptDonorMatcher(graph["nodes"], selection, reviewed_receipt_identities(db, selection))
    old_entities, old_names = {}, {}
    for node in graph["nodes"]:
        if node["kind"] != "donor":
            continue
        for name in [node["label"], *node.get("aliases", [])]:
            old_names[name] = node["id"]
            entity = selection.entity(name)
            if entity:
                old_entities[entity] = node["id"]
    edges = {(e["source"], e["target"]) for e in graph["edges"] if not e.get("grant") and not e.get("flow")}
    counts, dollars = Counter(), Counter()
    donor_before, donor_after, rows_before, rows_after = Counter(), Counter(), Counter(), Counter()
    party_before, party_after = Counter(), Counter()
    for donor, recipient, amount, period, recipient_kind, receipt_type in db.execute(
        "SELECT donor_name,recipient,amount,financial_year,recipient_kind,receipt_type FROM aec_receipt_records WHERE record_side='recipient'"
    ):
        reason = selection.exclusion(donor, recipient, amount, period, recipient_kind)
        if reason:
            if reason == "flagged_review" and has_receipt_annotation(donor):
                counts["annotation_review"] += 1
                dollars["annotation_review"] += amount
            continue
        target = "party:" + selection.recipient_party[recipient]
        before = old_entities.get(selection.entity(donor)) or old_names.get(donor)
        match = matcher.match(donor)
        after = match.node_id
        buckets = ["eligible"]
        for stage, source, donor_totals, donor_rows, party_totals in [
            ("before", before, donor_before, rows_before, party_before),
            ("after", after, donor_after, rows_after, party_after),
        ]:
            if not source:
                buckets.append(stage + "_unmatched_node")
            elif (source, target) not in edges:
                buckets.append(stage + "_unmatched_edge")
            else:
                buckets.append(stage + "_exported_cells")
                if normal_type(receipt_type) != "public_funding":
                    buckets.append(stage + "_exported")
                    donor_totals[source] += amount
                    donor_rows[source] += 1
                    party_totals[target] += amount
        if not before and match.candidates:
            buckets.append("before_spelling_candidates")
        if not before and after:
            buckets.append("newly_matched_node")
            if (after, target) in edges and normal_type(receipt_type) != "public_funding":
                buckets.append("newly_exported")
        if not after and match.candidates:
            buckets.append("ambiguous")
            buckets.append("after_unmatched_" + match.method)
        if match.method == "state_mismatch":
            buckets.append("state_mismatch")
        if before and before != after:
            buckets.append("existing_match_changed")
        for bucket in buckets:
            counts[bucket] += 1
            dollars[bucket] += amount
    gains = donor_after - donor_before
    party_changes = [{"party": party.removeprefix("party:"), "before_aud": round(party_before[party], 2),
                      "after_aud": round(party_after[party], 2),
                      "gain_aud": round(party_after[party] - party_before[party], 2),
                      "percent": round(100 * (party_after[party] - party_before[party]) / party_before[party], 6)
                      if party_before[party] else None}
                     for party in sorted(party_before.keys() | party_after.keys())
                     if party_before[party] != party_after[party]]
    return {
        "scope": "Eligible recipient-side receipts, existing federal map nodes and edges. Before: entity/raw spelling. After: unique normalised/bracketless fallback with annotation review and state compatibility. Exported figures exclude Public Funding as in #355; exported_cells retains every typed cell for exporter coverage. No production calls.",
        "counts": {k: {"rows": counts[k], "aud": round(dollars[k], 2)} for k in sorted(counts)},
        "donors_gaining": len(gains),
        "top10_donor_gains": [{"before_aud": round(donor_before[node], 2), "after_aud": round(donor_after[node], 2),
                               "gain_aud": round(gain, 2), "before_rows": rows_before[node], "after_rows": rows_after[node]}
                              for node, gain in sorted(gains.items(), key=lambda item: (-item[1], item[0]))[:10]],
        "party_changes": party_changes,
        "party_changes_over_one_percent": [p for p in party_changes if p["percent"] is None or abs(p["percent"]) > 1],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--graph", default=Path("portal/public/graph/money.json"), type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    with sqlite3.connect(f"file:{args.db}?mode=ro", uri=True) as db:
        result = audit(db, json.loads(args.graph.read_text(encoding="utf-8")))
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
