#!/usr/bin/env python3
"""Read-only audit of published bill sponsors against the held roster periods.

    python3 scripts/audit_bill_sponsor_parties.py > /tmp/bill-sponsor-parties.json

No database, source acquisition or bill-file writes. Each class-c row is kept
even though the held data cannot establish a disagreement for it.
"""
import argparse
from collections import Counter
import json
from pathlib import Path

from export_bills import SponsorPartyRecords
from vote_parties import same_party

ROOT = Path(__file__).resolve().parents[1]


def audit(root: Path = ROOT) -> dict:
    public = root / "portal/public"
    from vote_parties import load_evidence
    records = SponsorPartyRecords(load_evidence(root=root, public=public))
    index = json.loads((public / "bills/index.json").read_text())
    counts, rows = Counter(), []
    for item in sorted(index["bills"], key=lambda b: b["key"]):
        bill = json.loads((public / "bills" / f"{item['key']}.json").read_text())
        if not all(bill.get(k) for k in ("sponsor", "sponsor_party", "introduced")):
            continue
        counts["eligible_bills"] += 1
        outcome = records.check(bill)
        row = {k: bill.get(k) for k in ("key", "sponsor", "sponsor_person_id", "introduced",
                                       "originating_house", "sponsor_party")}
        row.update(outcome)
        if outcome["reason"] == "corrected":
            category = "a"
        elif outcome["reason"] == "convention":
            category = "b"
        elif not outcome.get("dated_party"):
            category = "c"
        elif outcome["record_party"] != bill["sponsor_party"]:
            category = "alias"
        else:
            category = "agrees"
        counts[category] += 1
        # Reproduce the original 52: substantive comparisons before the two
        # person/period-specific naming conventions were reviewed.
        review = bool(outcome.get("record_party") and not same_party(
            bill["sponsor_party"], outcome["record_party"]))
        counts["review_bills"] += review
        rows.append({**row, "class": category, "original_review": review})
    return {"published_bills": len(index["bills"]), "counts": dict(counts), "rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    print(json.dumps(audit(args.root), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
