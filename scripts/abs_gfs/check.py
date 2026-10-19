#!/usr/bin/env python3
"""Read-only staged projection gate; optionally verify every original XLSX cell."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.abs_gfs.parse import key, permitted
from scripts.abs_gfs.stage import load, projection
from scripts.abs_gfs import functions


def checked_projection(stage, verify_originals=False):
    inventory, hub = load(stage / "inventory.json"), load(stage / "hub.json")
    rows = [json.loads(line) for line in (stage / "series.jsonl").read_text().splitlines() if line]
    ledger = {r["url"]: r for r in load(stage / "receipts.json")}
    checks = load(stage / "reconciliation.json")
    function_path = stage / "function-series.jsonl"
    function_rows = [json.loads(line) for line in function_path.read_text().splitlines() if line] if function_path.exists() else None
    if function_rows is not None:
        if not function_rows or len({functions.key(r) for r in function_rows}) != len(function_rows):
            raise ValueError("Empty function series or duplicate observation identity")
        function_checks = functions.reconcile(function_rows, rows)
        if (load(stage / "function-reconciliation.json") != function_checks
                or any(c["status"] != "pass" for c in function_checks)):
            raise ValueError("Function reconciliation mismatch or failure")
        verified = load(stage / "function-receipts.json")
        expected = [{"workbook": d["id"] + ".xlsx", "url": d["url"], **d["receipt"], "hash_matches": True}
                    for d in inventory["workbooks"]]
        if verified != {"new_source_requests": 0, "verified": expected}:
            raise ValueError("Reused function receipts mismatch")
    if not rows or len({key(row) for row in rows}) != len(rows):
        raise ValueError("Empty series or duplicate observation identity")
    if any(c["status"] == "fail" for c in checks) or not checks:
        raise ValueError("Failed or absent reconciliation")
    if (projection(inventory, rows, function_rows) != hub or len(hub["rows"]) != len(rows)
            or function_rows is not None and len(hub["function_rows"]) != len(function_rows)):
        raise ValueError("Projection does not exactly match cleared source rows")
    documents = {d["id"] + ".xlsx": d for d in inventory["workbooks"] if permitted(d)}
    for document in documents.values():
        receipt = ledger.get(document["url"], {})
        if any(document["receipt"].get(k) != receipt.get(k) for k in ("status", "challenge", "snapshot", "sha256")):
            raise ValueError("Workbook receipt mismatch")
    if verify_originals:
        from openpyxl import load_workbook
        root = stage.parents[2]
        for workbook, document in documents.items():
            path = root / document["original_path"]
            if hashlib.sha256(path.read_bytes()).hexdigest() != document["receipt"]["sha256"]:
                raise ValueError("Original hash mismatch: " + workbook)
            source = load_workbook(path, data_only=True)
            for row in (r for r in rows + (function_rows or []) if r["workbook"] == workbook):
                actual = source[row["sheet"]][row["cell"]].value
                expected = row["source_marker"] if row["value"] is None else row["value"]
                if actual != expected:
                    raise ValueError("Original cell mismatch: " + workbook + "!" + row["cell"])
            if function_rows is not None:
                reparsed = [r for sheet in source if functions.dimensions(document, sheet.title)
                            for r in functions.parse_sheet(list(sheet.values), sheet.title, document)]
                if reparsed != [r for r in function_rows if r["workbook"] == workbook]:
                    raise ValueError("Original function labels/layout mismatch: " + workbook)
            source.close()
    return hub, {"documents": len(documents), "rows": len(rows), "years": sorted({r["reference_year"] for r in rows}),
                 "reconciliation": dict(Counter(c["status"] for c in checks)),
                 **({"function_rows": len(function_rows), "function_reconciliation": dict(Counter(c["status"] for c in function_checks))} if function_rows is not None else {})}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", required=True)
    parser.add_argument("--verify-originals", action="store_true")
    args = parser.parse_args()
    _, counts = checked_projection(ROOT / "data/staged/abs-gfs", args.verify_originals)
    print(json.dumps({"mode": "dry-run", "writes": 0, **counts}))
