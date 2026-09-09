#!/usr/bin/env python3
"""Derive agency profiles from the published, deduplicated supplier export.

Run after export_suppliers.py: python3 scripts/export_agencies.py
Agency names remain separate as recorded; no assumed departmental succession.
"""
import argparse
import hashlib
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path


def agency_id(name):
    return "a-" + hashlib.sha256(name.encode()).hexdigest()[:20]


def build_agencies(profiles, meta):
    agencies = {}
    for supplier in profiles:
        for contract in supplier["contracts"]:
            name = contract.get("agency") or "Unspecified agency"
            aid = agency_id(name)
            a = agencies.setdefault(aid, dict(id=aid, name=name, total=Decimal(0), count=0,
                suppliers={}, years={}, undated=dict(total=Decimal(0), count=0), contracts=[]))
            value = Decimal(str(contract["amount"]))
            a["total"] += value
            a["count"] += 1
            s = a["suppliers"].setdefault(supplier["id"], dict(id=supplier["id"], name=supplier["name"],
                abn=supplier.get("abn"), total=Decimal(0), count=0, donor_links=supplier.get("donor_links", [])))
            s["total"] += value
            s["count"] += 1
            start = str(contract.get("start_date") or "")
            try:
                from datetime import date
                year = date.fromisoformat(start).year
                if not 1901 <= year <= 2099: year = None
            except ValueError:
                year = None
            y = a["years"].setdefault(year, dict(year=year, total=Decimal(0), count=0)) if year else a["undated"]
            y["total"] += value
            y["count"] += 1
            a["contracts"].append({k: contract.get(k) for k in (
                "id", "title", "amount", "start_date", "end_date", "published", "procurement_method", "url", "link_scope")}
                | dict(supplier_id=supplier["id"], supplier=supplier["name"]))
    directory = []
    for a in agencies.values():
        a["suppliers"] = sorted(a["suppliers"].values(), key=lambda s: (-s["total"], s["name"], s["id"]))
        a["years"] = sorted(a["years"].values(), key=lambda y: y["year"])
        for item in [a, *a["suppliers"], *a["years"], a["undated"]]: item["total"] = float(item["total"])
        a["contracts"].sort(key=lambda c: (c.get("start_date") or "", c["id"]), reverse=True)
        a["supplier_count"] = len(a["suppliers"])
        a["first_year"] = a["years"][0]["year"] if a["years"] else None
        a["last_year"] = a["years"][-1]["year"] if a["years"] else None
        directory.append({k: a[k] for k in ("id", "name", "total", "count", "supplier_count", "first_year", "last_year")}
            | {"profile_path": "/agencies/" + a["id"] + ".json"})
    directory.sort(key=lambda a: (-a["total"], a["name"]))
    return {"meta": meta | {"agency_count": len(directory)}, "agencies": directory}, agencies


def export_agencies(output):
    output = Path(output)
    index = json.loads((output / "suppliers.json").read_text())
    def profiles():
        for shard in sorted({s["profile_path"] for s in index["suppliers"]}):
            yield from json.loads((output / shard.lstrip("/")).read_text())["profiles"].values()
    directory, agencies = build_agencies(profiles(), index["meta"])
    (output / "agencies").mkdir(exist_ok=True)
    for path, data in [("agencies.json", directory), *[("agencies/" + k + ".json", v) for k, v in agencies.items()]]:
        target = output / path
        temporary = target.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n")
        temporary.replace(target)
    print(f"Exported {len(agencies)} agencies, {sum(a['count'] for a in agencies.values())} contracts")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("portal/public"))
    export_agencies(parser.parse_args().output)
