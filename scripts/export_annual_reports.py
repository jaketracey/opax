#!/usr/bin/env python3
"""Public projection of the Transparency Portal snapshot (no source requests).

Reads ~/.cache/autoresearch/transparency/snapshot.json (parli.ingest.transparency_portal)
and writes portal/public/annual-reports/:

  index.json                bodies, their reports by year and one headline row per
                            body-year (staff numbers, consultancy and non-consultancy
                            contract spend, departmental statement of comprehensive income)
  remuneration-<year>.json  key management personnel (one row per person as published),
                            senior executive and other highly paid staff bands
  suppliers-<year>.json     organisations receiving reportable consultancy and
                            non-consultancy contract expenditure
  manifest.json             counts, snapshot dates, source, licences and caveats

Every row keeps the Portal's item id (stable GUID), its last-modified time, the API
URL that returns it and the report page it belongs to. Values stay as published;
`*_value` numbers are set only where the whole cell is a number.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest.transparency_portal import CACHE, LICENCE_NCE, LICENCE_OWN, SITE, number, clean  # noqa: E402
from parli.ingest.transparency_legacy import DATASETS_PAGE, SNAPSHOT as LEGACY_SNAPSHOT  # noqa: E402

OUT = ROOT / "portal" / "public" / "annual-reports"
SCHEMA = 1
KMP_COLUMNS = [("base_salary", "base_salary"), ("bonuses", "bonuses"), ("other_benefits", "other_benefits_and_allowances"),
               ("superannuation", "superannuation_contributions"), ("long_service_leave", "long_service_leave"),
               ("other_long_term", "other_long_term_benefits"), ("termination", "termination_benefits"),
               ("total", "total_remunerations")]
BAND_COLUMNS = [("base_salary", "average_base_salary"), ("bonuses", "average_bonuses"),
                ("other_benefits", "average_other_benefits_and_allowances"),
                ("superannuation", "average_superannuation_contributions"), ("long_service_leave", "average_long_service_leave"),
                ("other_long_term", "average_other_long_term_benefits"), ("termination", "average_termination_benefits"),
                ("total", "average_total_remuneration")]
CAVEATS = [
    "Figures are as each entity published them on the Transparency Portal under the PGPA Rule. OPAX does not audit or adjust them.",
    "Key management personnel remuneration is reported on an accrual basis for the period each person held the role, so part-year amounts are not annual salaries.",
    "Senior executive and other highly paid staff rows are bands with a count and averages, not individuals. Never multiply or add averages across bands, bodies or years.",
    "Contract spend is in thousands of dollars, GST inclusive, as published. Total expenses come from the departmental statement of comprehensive income extract; administered items are excluded.",
    "Staff numbers are headcounts as published in the all ongoing and all non-ongoing employee tables, not full-time equivalents.",
    "Key management personnel, band and supplier rows for 2018-19 to 2021-22 come from the files on the Portal's Data sets page; later years and all headline figures come from its structured annual report tables (2022-23 onward). 2025-26 reports are still being tabled.",
    "Supplier spend before 2022-23 is stated in each file's own unit: dollars for 2020-21 and thousands of dollars for 2021-22. Organisations paid were not published as a table before 2020-21.",
    "Older-year rows are matched to a body only where the published entity name, or one of the Portal's listed names for it, matches exactly. Other entity names are kept as published.",
]


# Components may be rounded (often to the nearest thousand), so a gap within half a per cent is not flagged.
TOTAL_ROW = re.compile(r"^\s*(sub-?\s*)?totals?\b", re.I)
# Average reportable contract value (in $'000) above which a published thousands-of-dollars
# figure is flagged as possibly entered in dollars. Flagged figures are kept as published.
SCALE_LIMIT = {"consultancy": 5_000, "non_consultancy": 50_000}


def scale_flags(headline_rows):
    """Flag contract spend that is implausible as thousands of dollars: an average per
    contract above SCALE_LIMIT, or 100 times or more the body's own median across years."""
    by = defaultdict(list)
    for h in headline_rows:
        for k in SCALE_LIMIT:
            c = h.get(k)
            if c and c.get("expenditure_thousands") is not None:
                by[(h["body_id"], k)].append(c)
    for (body, k), items in by.items():
        vals = sorted(c["expenditure_thousands"] for c in items if c["expenditure_thousands"] > 0)
        med = vals[len(vals) // 2] if vals else None
        for c in items:
            e, n = c["expenditure_thousands"], c.get("contracts")
            reasons = []
            if n and e / n > SCALE_LIMIT[k]:
                reasons.append(f"average above ${SCALE_LIMIT[k] // 1000} million per contract")
            if med and len(vals) >= 3 and e >= 100 * vals[0] and e > med * 10:
                reasons.append("100 times or more this body's figure in another year")
            if reasons:
                c["scale_check"] = ("Possibly entered in dollars rather than thousands of dollars ("
                                    + "; ".join(reasons) + "). Shown as published; check the annual report.")


def atomic(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return hashlib.sha256(data).hexdigest(), len(data)


def norm_name(value):
    v = (value or "").lower().replace("&", " and ")
    v = re.sub(r"^the\s+", "", v)
    return re.sub(r"[^a-z0-9]+", " ", v).strip()


def norm_label(label):
    v = (label or "").lower()
    v = re.sub(r"^(expenses?|income)\s*-\s*", "", v)
    return re.sub(r"[^a-z]+", " ", v).strip()


def cell(cells, key):
    return (cells.get(key) or [None, None])[1]


def money_cols(cells, columns):
    """Numbers where the whole cell is a number; the published text is kept in `as_published`
    whenever it is not exactly that number's plain digits (or is not a number at all)."""
    out, raw_cells = {}, {}
    for name, key in columns:
        raw = cell(cells, key)
        value = number(raw)
        out[name] = value
        if raw is not None and (value is None or raw != str(value)):
            raw_cells[name] = raw
    if raw_cells:
        out["as_published"] = raw_cells
    return out


def field_by_label(fields, *labels):
    want = {norm_label(l) for l in labels}
    for key, (label, value) in fields.items():
        if norm_label(label) in want:
            return value
    return None


def unit_for(table):
    if table["content_type"] == "dt_extract_dept_statement_comp_income_nce_24":
        return "$'000", "Portal template for this table type; the table item itself does not state a unit"
    return "$'000", "stated in the table"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", default=str(CACHE / "snapshot.json"))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--legacy", default=str(LEGACY_SNAPSHOT), help="2018-19 to 2021-22 file snapshot (parli.ingest.transparency_legacy)")
    ap.add_argument("--no-legacy", action="store_true", help="publish without the 2018-19 to 2021-22 rows")
    args = ap.parse_args(argv)
    snap = json.loads(Path(args.snapshot).read_text())
    out = Path(args.out)
    stamp = re.sub(r"\D", "", snap["fetched_at"])[:8]

    agencies = json.loads((ROOT / "portal" / "public" / "agencies.json").read_text())["agencies"]
    agency_by_name = {norm_name(a["name"]): a["id"] for a in agencies}

    bodies = {}
    for code, b in sorted(snap["bodies"].items(), key=lambda kv: kv[1]["name"].lower()):
        kind = {"Non-Corporate Commonwealth Entity": "NCE", "Corporate Commonwealth Entity": "CCE",
                "Commonwealth Company": "CC"}.get((b["type_as_published"] or [None])[0])
        bodies[code] = {
            "id": code, "name": b["name"], "type": kind, "type_as_published": (b["type_as_published"] or [None])[0],
            "acronyms": b["acronyms"], "status": b["status"],
            "portfolio": next((r["portfolio"] for r in reversed(b["reports"]) if r.get("portfolio")), None),
            "austender_agency_id": agency_by_name.get(norm_name(b["name"])),
            "reports": {r["year"]: {"title": r["title"], "published_on": r["published_on"], "portfolio": r.get("portfolio"),
                                    "url": f"{SITE}/publications/{r['portfolio_slug']}/{code}/{r['web_url']}" if r.get("portfolio_slug") and r.get("web_url") else None}
                        for r in b["reports"]},
        }

    tables_by_year = defaultdict(dict)

    def base(table, row=None):
        """Row fields; table-level metadata is stored once per file under `tables`."""
        body = bodies[table["body_id"]]
        tables_by_year[table["year"]][table["id"]] = {
            "body_id": body["id"], "body": body["name"], "body_type": body["type"], "title": table["title"],
            "codename": table["codename"], "last_modified": table["last_modified"],
            "report_url": (body["reports"].get(table["year"]) or {}).get("url"),
            "licence": (LICENCE_NCE if body["type"] == "NCE" else LICENCE_OWN)["status"]}
        return {"table_id": table["id"]}

    headline = defaultdict(dict)
    remuneration = defaultdict(list)
    suppliers = defaultdict(list)
    dup = Counter()
    for t in snap["tables"]:
        if t["body_id"] not in bodies:
            continue
        key = (t["body_id"], t["year"])
        fam = t["family"]
        if fam == "kmp":
            for r in t["rows"]:
                c = r["cells"]
                name = cell(c, "name_")
                if TOTAL_ROW.match(name or ""):
                    kind = "kmp_total"  # a table's own total line, not a person
                else:
                    kind = "kmp"
                cols = money_cols(c, KMP_COLUMNS)
                parts = [cols.get(k) for k, _ in KMP_COLUMNS[:-1]]
                checks = []
                if cols.get("total") is not None and all(p is not None for p in parts) and abs(sum(parts) - cols["total"]) > max(2, 0.005 * abs(cols["total"])):
                    checks.append("components_do_not_sum_to_total")
                remuneration[t["year"]].append({**base(t, r), "kind": kind, **({"checks": checks} if checks else {}), "record_id": f"tp-{t['year']}-" + r["id"].replace("-", ""),
                    "name": name, "position": cell(c, "position_title"), "order": r["order"], **cols})
        elif fam in ("senior_executives", "highly_paid"):
            count_key = "number_of_senior_executives" if fam == "senior_executives" else next(
                (k for k in (r_ for row in t["rows"] for r_ in row["cells"]) if k.startswith("number_of")), "number_of_other_highly_paid_staff")
            for r in t["rows"]:
                c = r["cells"]
                count_raw = cell(c, count_key) if cell(c, count_key) is not None else next((v for k, (l, v) in c.items() if k.startswith("number_of")), None)
                remuneration[t["year"]].append({**base(t, r), "kind": "senior_executive_band" if fam == "senior_executives" else "highly_paid_band",
                    "record_id": f"tp-{t['year']}-" + r["id"].replace("-", ""), "band": cell(c, "remuneration_band"), "order": r["order"],
                    "count": number(count_raw), **({"count_as_published": count_raw} if count_raw is not None and str(number(count_raw)) != count_raw else {}),
                    "averages": money_cols(c, BAND_COLUMNS)})
        elif fam in ("consultancy_orgs", "non_consultancy_orgs"):
            for r in t["rows"]:
                c = r["cells"]
                spend = next((v for k, (l, v) in c.items() if k.startswith("expenditure")), None)
                abn = re.sub(r"\D", "", cell(c, "organisation_abn") or "") or None
                suppliers[t["year"]].append({**base(t, r), "kind": "consultancy" if fam == "consultancy_orgs" else "non_consultancy",
                    "record_id": f"tp-{t['year']}-" + r["id"].replace("-", ""), "organisation": cell(c, "name_of_organisation"),
                    "abn": abn if abn and len(abn) == 11 else None,
                    "expenditure_thousands": number(spend), **({"expenditure_as_published": spend} if spend is not None and str(number(spend)) != spend else {})})
        else:
            h = headline[key]
            dup[(key, fam)] += 1
            if dup[(key, fam)] > 1:
                h.setdefault("duplicate_tables", []).append(fam)
                continue
            f = t["fields"]
            src = {"source_item_id": t["id"], "codename": t["codename"], "source_last_modified": t["last_modified"]}
            if fam in ("consultancy", "non_consultancy"):
                num = field_by_label(f, "Total | Number")
                spend = field_by_label(f, "Total | Expenditure $'000 (GST inc)")
                h[fam] = {"contracts": number(num), "expenditure_thousands": number(spend),
                          **({"as_published": {"contracts": num, "expenditure_thousands": spend}} if (num is not None and str(number(num)) != num) or (spend is not None and str(number(spend)) != spend) else {}),
                          "new_contracts": number(field_by_label(f, "New contracts | Number")),
                          "ongoing_contracts": number(field_by_label(f, "Ongoing contracts | Number")), **src}
            elif fam in ("ongoing", "non_ongoing"):
                total = (f.get("total_total") or [None, None])[1]
                h[fam + "_staff"] = {"headcount": number(total), **({"as_published": total} if total is not None and str(number(total)) != total else {}), **src}
            elif fam == "income":
                unit, basis = unit_for(t)
                vals = {
                    "total_expenses": field_by_label(f, "Total Expenses|Current Year", "Total Expenses|Current Year"),
                    "employee_benefits": field_by_label(f, "Employee benefits expense|Current Year"),
                    "suppliers": field_by_label(f, "Suppliers expense|Current Year"),
                    "own_source_income": field_by_label(f, "Total own-source income|Current Year"),
                    "revenue_from_government": field_by_label(f, "Revenue from Government|Current Year"),
                }
                raw = {k: v for k, v in vals.items() if v is not None and str(number(v)) != v}
                h["income_statement"] = {**{k: number(v) for k, v in vals.items()}, **({"as_published": raw} if raw else {}),
                                         "unit": unit, **({"unit_basis": basis} if "template" in basis else {}), **src}

    legacy_path = Path(args.legacy)
    if not args.no_legacy and not legacy_path.exists():
        sys.exit(f"[export_annual_reports] {legacy_path} is missing; run parli.ingest.transparency_legacy refresh or pass --no-legacy")
    legacy = None if args.no_legacy else json.loads(legacy_path.read_text())
    legacy_bodies = {}
    if legacy:
        # Exact name keys only: the Portal name, that name without a trailing "(...)", and any listed
        # alternative name of two words or more. A key shared by two bodies is dropped.
        keys = defaultdict(set)
        for b in bodies.values():
            names = [b["name"], re.sub(r"\s*\([^)]*\)\s*$", "", b["name"])]
            names += [a for a in re.split(r",", b["acronyms"] or "") if len(a.split()) >= 2]
            for n in names:
                if norm_name(n):
                    keys[norm_name(n)].add(b["id"])
                    keys[norm_name(n).replace(" limited", " ltd")].add(b["id"])
        by_key = {k: next(iter(v)) for k, v in keys.items() if len(v) == 1}

        def legacy_body(entity):
            k = norm_name(entity)
            hit = by_key.get(k) or by_key.get(k.replace(" limited", " ltd"))
            if hit:
                return bodies[hit]
            if k not in legacy_bodies:
                legacy_bodies[k] = {"id": "legacy_" + re.sub(r"[^a-z0-9]+", "_", k).strip("_")[:150], "name": entity, "type": None,
                                    "type_as_published": None, "acronyms": None, "status": "Name as published in the Portal's older data files; not matched to a current Portal body",
                                    "portfolio": None, "austender_agency_id": agency_by_name.get(k), "reports": {}}
            return legacy_bodies[k]

        titles = {"kmp": "Information about remuneration for key management personnel",
                  "senior_executive_band": "Information about remuneration for senior executives",
                  "highly_paid_band": "Information about remuneration for other highly paid staff",
                  "consultancy": "Organisations receiving a share of reportable consultancy contract expenditure",
                  "non_consultancy": "Organisations receiving a share of reportable non-consultancy contract expenditure"}

        def legacy_table(r, kind):
            body = legacy_body(r["entity"])
            tid = "lg-" + hashlib.md5("|".join([r["year"], body["id"], kind, r["source_file"]]).encode()).hexdigest()[:16]
            tables_by_year[r["year"]].setdefault(tid, {
                "body_id": body["id"], "body": body["name"], "body_type": body["type"], "title": titles[kind],
                "entity_as_published": r["entity"], "source_url": r["source_url"], "source_file": r["source_file"],
                "source_page": DATASETS_PAGE, "last_modified": None, "report_url": None,
                "licence": (LICENCE_NCE if body["type"] == "NCE" else LICENCE_OWN)["status"]})
            return {"table_id": tid}

        for r in legacy["kmp"]:
            cols = {k: r.get(k) for k, _ in KMP_COLUMNS}
            parts = [cols.get(k) for k, _ in KMP_COLUMNS[:-1]]
            checks = ["components_do_not_sum_to_total"] if cols.get("total") is not None and all(p is not None for p in parts) and abs(sum(parts) - cols["total"]) > max(2, 0.005 * abs(cols["total"])) else []
            remuneration[r["year"]].append({**legacy_table(r, "kmp"), "kind": "kmp_total" if TOTAL_ROW.match(r["name"] or "") else "kmp",
                **({"checks": checks} if checks else {}), "record_id": f"tp-{r['year']}-{r['id']}", "name": r["name"], "position": r["position"],
                "order": r["source_row"], "source_row": r["source_row"], **cols, **({"as_published": r["as_published"]} if r.get("as_published") else {})})
        for r in legacy["bands"]:
            remuneration[r["year"]].append({**legacy_table(r, r["kind"]), "kind": r["kind"], "record_id": f"tp-{r['year']}-{r['id']}",
                "band": r["band"], "order": r["source_row"], "source_row": r["source_row"], "source_column": r["source_column"],
                "count": r["count"], "averages": r["averages"], **({"as_published": r["as_published"]} if r.get("as_published") else {})})
        for r in legacy["suppliers"]:
            money = {k: r[k] for k in ("expenditure_thousands", "expenditure_dollars") if k in r}
            suppliers[r["year"]].append({**legacy_table(r, r["kind"]), "kind": r["kind"], "record_id": f"tp-{r['year']}-{r['id']}",
                "organisation": r["organisation"], "abn": r["abn"], "source_row": r["source_row"], **money,
                **({"organisation_as_published": r["organisation_as_published"]} if r.get("organisation_as_published") else {}),
                **({"expenditure_as_published": r["expenditure_as_published"]} if r.get("expenditure_as_published") else {}),
                "unit_as_published": r["unit_as_published"]})
        for k, b in legacy_bodies.items():
            bodies[b["id"]] = b

    headline_rows = []
    for (body_id, year), h in sorted(headline.items()):
        body = bodies[body_id]
        headline_rows.append({"record_id": f"tp-{body_id}-{year}", "body_id": body_id, "year": year, **h})

    scale_flags(headline_rows)
    years = sorted(set(remuneration) | set(suppliers) | {r["year"] for r in headline_rows})
    files = {}
    for y in years:
        rows = sorted(remuneration.get(y, []), key=lambda r: (tables_by_year[y][r["table_id"]]["body"].lower(), r["kind"], r["order"]))
        used = {r["table_id"] for r in rows}
        files[f"remuneration-{y}.json"] = atomic(out / f"remuneration-{y}.json", {"year": y,
            "tables": {k: v for k, v in tables_by_year[y].items() if k in used}, "rows": rows})
        srows = sorted(suppliers.get(y, []), key=lambda r: (tables_by_year[y][r["table_id"]]["body"].lower(), r["kind"], -(r.get("expenditure_thousands") or r.get("expenditure_dollars") or 0)))
        used = {r["table_id"] for r in srows}
        files[f"suppliers-{y}.json"] = atomic(out / f"suppliers-{y}.json", {"year": y,
            "unit": "dollars GST inclusive" if any("expenditure_dollars" in r for r in srows) else "$'000 GST inclusive",
            "tables": {k: v for k, v in tables_by_year[y].items() if k in used}, "rows": srows})

    counts = {
        "bodies": len(bodies), "bodies_with_data": len({r["body_id"] for r in headline_rows}),
        "years": years, "reports": sum(len(b["reports"]) for b in bodies.values()),
        "kmp_rows": sum(1 for y in remuneration for r in remuneration[y] if r["kind"] == "kmp"),
        "kmp_total_rows": sum(1 for y in remuneration for r in remuneration[y] if r["kind"] == "kmp_total"),
        "kmp_component_mismatches": sum(1 for y in remuneration for r in remuneration[y] if r.get("checks")),
        "band_rows": sum(1 for y in remuneration for r in remuneration[y] if r["kind"] not in ("kmp", "kmp_total")),
        "scale_flags": sum(1 for h in headline_rows for k in SCALE_LIMIT if (h.get(k) or {}).get("scale_check")),
        "supplier_rows": sum(len(v) for v in suppliers.values()), "headline_rows": len(headline_rows),
        "by_year": {y: {"kmp_rows": sum(1 for r in remuneration.get(y, []) if r["kind"] == "kmp"),
                        "kmp_bodies": len({tables_by_year[y][r["table_id"]]["body_id"] for r in remuneration.get(y, []) if r["kind"] == "kmp"}),
                        "supplier_rows": len(suppliers.get(y, [])),
                        "bodies": len({r["body_id"] for r in headline_rows if r["year"] == y})} for y in years},
        "legacy_bodies_unmatched": len(legacy_bodies),
    }
    coverage = {
        "remuneration": sorted(y for y in remuneration if any(r["kind"] == "kmp" for r in remuneration[y])),
        "bands": sorted(y for y in remuneration if any(r["kind"].endswith("_band") for r in remuneration[y])),
        "suppliers": sorted(y for y in suppliers if suppliers[y]),
        "headline": sorted({r["year"] for r in headline_rows}),
    }
    counts["coverage"] = coverage
    meta = {"schema": SCHEMA, "generated": snap["built_at"], "fetched_at": snap["fetched_at"], "snapshot_at": stamp,
            "source": "Transparency Portal, Department of Finance", "source_url": SITE, "api": snap["source"]["api"],
            "api_item_url": snap["source"]["api"] + "?system.codename={codename}&depth=1",
            "licences": {"cc-by-4.0": LICENCE_NCE, "entity-copyright": LICENCE_OWN}, "caveats": CAVEATS, "counts": counts,
            **({"legacy_files": {"page": DATASETS_PAGE, "built_at": legacy["built_at"], "files": legacy["files"]}} if legacy else {})}
    body_list = list(bodies.values())
    atomic(out / "index.json", {"meta": meta, "bodies": body_list, "headline": headline_rows})
    content = hashlib.sha256(json.dumps([body_list, headline_rows], sort_keys=True).encode()).hexdigest()
    # Content hashes only (no stamps), so a week with no new disclosures leaves every file as committed.
    atomic(out / "manifest.json", {"schema": SCHEMA, "generated": snap["built_at"], "counts": counts,
                                   "files": {"index.json": {"content_sha256": content},
                                             **{k: {"sha256": v[0], "bytes": v[1]} for k, v in sorted(files.items())}}})
    print(json.dumps(counts))


if __name__ == "__main__":
    main()
