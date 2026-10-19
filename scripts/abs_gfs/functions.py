"""Offline published purpose cells. Arithmetic below is validation only.

The workbooks publish labels, including combined groups, but no numeric COFOG-A
codes. Do not assign codes or split combined categories using another taxonomy.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
import math
import re

from scripts.abs_gfs.parse import CC, RELEASE, column_name, normal, permitted

DIVISIONS = (
    "General public services", "Defence", "Public order and safety", "Economic affairs",
    "Environmental protection", "Housing and community amenities", "Health",
    "Recreation, culture and religion", "Education", "Social protection", "Transport",
)
GROUPS = {
    "general public services": ("Public debt transactions", "Other general public services"),
    "public order and safety": ("Police services", "Civil and fire protection services", "Law courts, prisons and other public order and safety"),
    "health": ("Medical products, appliances and equipment", "Outpatient services", "Hospital services", "Community health services", "Public health services", "Other health"),
    "education": ("Pre-primary, primary and secondary education", "Tertiary education", "Other education"),
    "transport": ("Road transport", "Railway transport", "Other transport"),
}
EDUCATION = ("School education", "Tertiary education", "Other education", "Total operating expenses on education, by purpose")
DIMENSIONS = ("release", "level_of_government", "jurisdiction", "sector", "reference_year")


def dimensions(document, sheet):
    if sheet == "Table_4" and (document.get("dimensions") or {}).get("sector") == "General government":
        return document["dimensions"]
    if document["id"] != "55120DO095_202425":
        return None
    # Exact published sheet groups. ACT is State, not State and local.
    jurisdiction = {9: "New South Wales", 10: "Victoria", 11: "Queensland", 12: "South Australia",
                    13: "Western Australia", 14: "Tasmania", 15: "Northern Territory", 16: "Australian Capital Territory"}
    number = int(sheet.removeprefix("Table_")) if re.fullmatch(r"Table_\d+", sheet) else 0
    if number not in (1, *range(7, 18)):
        return None  # Includes private expenditure/GDP Table_19, grants and duplicate summaries.
    level = {1: "All levels of government", 7: "Commonwealth", 16: "State", 17: "Control n.f.d."}.get(number, "State and local")
    title = next(s["title"] for s in document["sheets"] if s["sheet"] == sheet)
    return {"level_of_government": level, "jurisdiction": jurisdiction.get(number, "Australia"),
            "sector": "General government", "consolidation": title.strip()}


def key(row):
    return tuple(row[k] for k in (*DIMENSIONS, "measure", "division", "group", "function_level", "unit", "prices_basis"))


def parse_sheet(grid, sheet, document):
    if not permitted(document):
        return []
    dim = dimensions(document, sheet)
    if not dim:
        return []
    education = document["id"] == "55120DO095_202425"
    if not education and "general government expenses by purpose" not in normal(grid[3][0]):
        return []
    year_row = 5 if education else 4
    years = [(i, y) for i, y in enumerate(grid[year_row]) if re.fullmatch(r"\d{4}-\d{2}", str(y))]
    if not years:
        raise ValueError("Unrecognised function year layout")
    for i, _ in years:
        if str(grid[year_row + 1][i]).strip() != "$m":
            raise ValueError("Unexpected function unit")
    rows, parent, members, closed = [], None, [], False
    for ri, cells in enumerate(grid[year_row + 2:], year_row + 3):
        label = str(cells[0] or "").strip() if cells else ""
        if not label:
            continue
        values = [cells[i] if i < len(cells) else None for i, _ in years]
        if education:
            if label == "Operating expenses on education, by purpose":
                continue
            if label not in EDUCATION:
                raise ValueError("Unrecognised education purpose row: " + label)
            division, group = "Education", label if label in EDUCATION[:3] else None
            grain = "group" if group else "division"
        elif normal(label) == "total expenses":
            if parent:
                raise ValueError("Missing published division total")
            division, group, grain = None, None, "total"
        elif normal(label) in {normal(d) for d in DIVISIONS}:
            if parent:
                raise ValueError("Unclosed function division")
            if all(v is None for v in values):
                parent, members = label, []
                continue
            division, group, grain = label, None, "division"
        elif parent and normal(label) == "total " + normal(parent):
            if [normal(m) for m in members] != [normal(m) for m in GROUPS.get(normal(parent), ())]:
                raise ValueError("Unrecognised published group layout: " + parent)
            division, group, grain = parent, None, "division"
            parent = None
        elif parent and normal(label) in {normal(g) for g in GROUPS.get(normal(parent), ())}:
            members.append(label)
            division, group, grain = parent, label, "group"
        else:
            raise ValueError("Unrecognised function row: " + label)
        for (ci, year), raw in zip(years, values):
            numeric = type(raw) in (int, float) and math.isfinite(raw)
            if not numeric and raw is not None and str(raw).strip() not in ("..", "np", "n.p.", "na", "n.a.", "-", ""):
                raise ValueError("Unrecognised function value")
            rows.append({**dim, "release": document["release"], "release_date": document["release_date"],
                         "reference_year": year, "measure": "education_operating_expenses" if education else "expenses_by_function",
                         "classification": "Education by purpose" if education else "COFOG-A (published purpose categories)",
                         "function_level": grain, "division": division, "group": group, "function_as_published": label,
                         "division_code": None, "group_code": None, "code_status": "Not published in workbook",
                         "value": raw if numeric else None, "source_marker": None if numeric else raw,
                         "unit": "AUD million", "prices_basis": "Current prices", "series_basis": "Original", "published": True,
                         "workbook": document["id"] + ".xlsx", "sheet": sheet, "cell": column_name(ci + 1) + str(ri),
                         "source_url": document["url"], "release_url": RELEASE, **document["receipt"],
                         "licence": "CC BY 4.0", "licence_url": CC})
        if grain == "total" or education and grain == "division":
            closed = True
            break  # Education economic transactions, assets, sales and GDP never enter.
    if not closed:
        raise ValueError("Missing published function total")
    return rows


def source(row):
    return {k: row[k] for k in ("workbook", "sheet", "cell", "sha256")}


def reconcile(rows, headlines):
    groups = defaultdict(list)
    for row in rows:
        groups[tuple(row[k] for k in (*DIMENSIONS, "measure"))].append(row)
    headline_index = {tuple(r[k] for k in DIMENSIONS): r for r in headlines if r["measure"] == "expenses"}
    functions = {tuple(r[k] for k in DIMENSIONS): r for r in rows if r["measure"] == "expenses_by_function" and normal(r["division"]) == "education" and r["function_level"] == "division"}
    results = []

    def compare(identity, group, components, total, add=False):
        available = total is not None and bool(components) and all(r["value"] is not None for r in [*components, total])
        delta = ((sum(r["value"] for r in components) if add else components[0]["value"]) - total["value"]) if available else None
        tolerance = (len(components) + 1) / 2 if add else 0
        results.append({"group": list(group), "identity": identity, "delta_million": delta,
                        "tolerance_million": tolerance, "status": "unavailable" if not available else "pass" if abs(delta) <= tolerance else "fail",
                        "basis": "Same published consolidation group, current prices, original series; transfers consolidated within that group.",
                        "sources": [source(r) for r in [*components, total] if r]})

    for group, values in sorted(groups.items()):
        education = group[-1] == "education_operating_expenses"
        if education:
            total = next(r for r in values if r["function_level"] == "division")
            compare("education_purposes_to_published_total", group, [r for r in values if r["function_level"] == "group"], total, True)
            match = functions.get(group[:-1])
            if match:
                compare("education_total_to_function_division", group, [total], match)
        else:
            total = next(r for r in values if r["function_level"] == "total")
            compare("function_divisions_to_published_total", group, [r for r in values if r["function_level"] == "division"], total, True)
            compare("function_total_to_headline_expenses", group, [total], headline_index.get(group[:-1]))
            for division in sorted({r["division"] for r in values if r["function_level"] == "group"}):
                compare("function_groups_to_published_division:" + division, group,
                        [r for r in values if r["function_level"] == "group" and r["division"] == division],
                        next(r for r in values if r["function_level"] == "division" and r["division"] == division), True)
    return results


def cleared(inventory, rows):
    docs = {d["id"] + ".xlsx": d for d in inventory["workbooks"] if permitted(d)}
    result = []
    for row in rows:
        d = docs.get(row.get("workbook"))
        dim = dimensions(d, row.get("sheet", "")) if d else None
        if (not dim or row.get("published") is not True
                or any(row.get(k) != v for k, v in dim.items())
                or any(row.get(k) != d.get(k) for k in ("release", "release_date"))
                or any(row.get(k) != d["receipt"].get(k) for k in ("sha256", "snapshot"))
                or row.get("source_url") != d["url"] or row.get("licence_url") != CC):
            continue
        result.append(row)
    return result


def build(root=None):
    from openpyxl import load_workbook
    from scripts.abs_gfs.stage import ROOT, load, projection, write
    root = root or ROOT
    stage = root / "data/staged/abs-gfs"
    inventory = load(stage / "inventory.json")
    rows, verified = [], []
    # Reuse the complete rights-reviewed inventory, without fetching any source.
    for d in inventory["workbooks"]:
        path = root / d["original_path"]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != d["receipt"]["sha256"]:
            raise ValueError("Original hash mismatch: " + d["id"])
        verified.append({"workbook": d["id"] + ".xlsx", "url": d["url"], **d["receipt"], "hash_matches": True})
        if not permitted(d):
            continue
        workbook = load_workbook(path, data_only=True)
        for sheet in workbook:
            if dimensions(d, sheet.title):
                rows.extend(parse_sheet(list(sheet.values), sheet.title, d))
        workbook.close()
    if not rows or len({key(r) for r in rows}) != len(rows):
        raise ValueError("Empty function series or duplicate identity")
    headlines = [json.loads(line) for line in (stage / "series.jsonl").read_text().splitlines()]
    checks = reconcile(rows, headlines)
    if any(c["status"] != "pass" for c in checks):
        raise ValueError("Function reconciliation did not pass")
    (stage / "function-series.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n" for r in rows))
    write(stage / "function-reconciliation.json", checks)
    write(stage / "function-receipts.json", {"new_source_requests": 0, "verified": verified})
    summary = {"release": inventory["release"], "rows": len(rows), "years": sorted({r["reference_year"] for r in rows}),
               "by_measure": dict(Counter(r["measure"] for r in rows)), "by_level": dict(Counter(r["level_of_government"] for r in rows)),
               "by_grain": dict(Counter(r["function_level"] for r in rows)), "reconciliation": dict(Counter(c["status"] for c in checks)),
               "checks_by_identity": dict(Counter(c["identity"].split(":")[0] for c in checks)),
               "numeric_codes": "Not published in workbooks; null, never inferred", "basis_differences": [],
               "excluded": ["Education Table_19 private expenditure/GDP", "Education economic-transaction, asset, sales and intergovernment-grant tables"],
               "transfers": "Education Table_2 explicitly deducts intra-sector transfers in its published all-level total. No cross-level sum is made; selected education totals equal the corresponding published function divisions."}
    write(stage / "function-summary.json", summary)
    write(stage / "hub.json", projection(inventory, headlines, rows))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    build()
