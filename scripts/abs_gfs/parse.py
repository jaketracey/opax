"""Parse published ABS cells without calculating government/sector totals."""
from __future__ import annotations

import re
from collections import defaultdict

CC = "https://creativecommons.org/licenses/by/4.0/"
TERMS = "https://www.abs.gov.au/website-privacy-copyright-and-disclaimer"
RELEASE = "https://www.abs.gov.au/statistics/economy/government/government-finance-statistics-annual/2024-25"
MEASURES = {
    "total gfs revenue": "revenue",
    "total gfs expenses": "expenses",
    "gfs net operating balance": "net_operating_balance",
    "gfs net lending(+)/borrowing(-)": "net_lending_borrowing",
    "gfs net worth": "net_worth",
    "total assets": "assets",
    "total liabilities": "liabilities",
    "total net acquisition of non-financial assets": "net_acquisition_non_financial_assets",
}
HEADLINES = {"revenue", "expenses", "net_operating_balance", "net_lending_borrowing", "net_worth", "net_debt_l2"}
SECTORS = {"1": "Public non-financial corporations", "2": "Public financial corporations",
           "3": "General government", "4": "Non-financial public sector", "9": "Total public sector"}
LEVELS = {"1": "Commonwealth", "2": "State", "3": "Local", "4": "Control n.f.d.",
          "5": "State and local", "9": "All levels of government"}
JURISDICTIONS = {"1": "New South Wales", "2": "Victoria", "3": "Queensland", "4": "South Australia",
                 "5": "Western Australia", "6": "Tasmania", "7": "Northern Territory", "8": "Australian Capital Territory"}


def normal(value):
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def classification(title):
    match = re.match(r"Table (\d{3})\.", title)
    if not match or match[1] == "000":
        return None
    level, sector, jurisdiction = match[1]
    level_name = LEVELS[level]
    jurisdiction_name = ("Australia" if level in "149" or jurisdiction == "9" else JURISDICTIONS[jurisdiction])
    return {"level_of_government": level_name, "jurisdiction": jurisdiction_name,
            "sector": SECTORS[sector], "consolidation": title}


def permitted(document):
    licence = document.get("licence", {})
    return (document.get("status") == "cleared" and licence.get("status") == "open"
            and licence.get("url") == CC and licence.get("workbook_reviewed") is True
            and not document.get("exceptions")
            and not document.get("held") and document.get("receipt", {}).get("status") == 200
            and not document.get("receipt", {}).get("challenge"))


def column_name(index):
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def parse_sheet(grid, sheet_name, document):
    """The official cube layout has row 4 title, row 5 fiscal years, row 6 units.

    Only exact measure labels from operating statements/balance sheets enter the
    core. Blank/suppressed values stay null; no imputation or cross-level sum.
    """
    if not permitted(document):
        return []
    dimensions = classification(document["title"])
    if not dimensions or len(grid) < 6:
        return []
    heading = normal(grid[3][0] if grid[3] else "")
    if not any(kind in heading for kind in ("operating statement", "balance sheet")):
        return []
    years = [(i, str(year)) for i, year in enumerate(grid[4]) if re.fullmatch(r"\d{4}-\d{2}", str(year))]
    if not years:
        raise ValueError(f"Unrecognised year layout: {document['id']} {sheet_name}")
    rows = []
    for ri, row in enumerate(grid[6:], 7):
        measure = MEASURES.get(normal(row[0] if row else None))
        if not measure:
            continue
        for ci, year in years:
            unit = grid[5][ci] if ci < len(grid[5]) else None
            if unit != "$m":
                raise ValueError(f"Unexpected unit {unit!r}")
            raw = row[ci] if ci < len(row) else None
            if isinstance(raw, bool) or (raw is not None and not isinstance(raw, (int, float)) and str(raw).strip() not in ("..", "np", "n.p.", "na", "n.a.", "-", "")):
                raise ValueError(f"Unrecognised value {raw!r} at {sheet_name}!{column_name(ci+1)}{ri}")
            value = raw if isinstance(raw, (int, float)) else None
            rows.append({**dimensions, "release": document["release"], "release_date": document["release_date"],
                         "measure": measure, "measure_as_published": str(row[0]).strip(), "reference_year": year,
                         "value": value, "source_marker": raw if value is None else None, "unit": "AUD million",
                         "prices_basis": "Current prices", "series_basis": "Original", "published": True,
                         "workbook": document["id"] + ".xlsx", "sheet": sheet_name, "cell": column_name(ci+1)+str(ri),
                         "source_url": document["url"], "release_url": RELEASE, **document["receipt"],
                         "licence": "CC BY 4.0", "licence_url": CC})
    return rows


def key(row):
    return tuple(row[field] for field in ("release", "level_of_government", "jurisdiction", "sector", "measure", "reference_year", "unit", "prices_basis"))


def reconcile(rows):
    """Compare published measures within one consolidation group, never sum groups."""
    groups = defaultdict(dict)
    for row in rows:
        group = tuple(row[field] for field in ("release", "level_of_government", "jurisdiction", "sector", "reference_year"))
        if row["measure"] in groups[group]:
            raise ValueError(f"Duplicate published measure: {key(row)}")
        groups[group][row["measure"]] = row
    identities = [("operating_balance", "revenue", "expenses", "net_operating_balance"),
                  ("net_lending_borrowing", "net_operating_balance", "net_acquisition_non_financial_assets", "net_lending_borrowing"),
                  ("net_worth", "assets", "liabilities", "net_worth")]
    results = []
    for group, measures in sorted(groups.items()):
        for name, a, b, c in identities:
            if not all(m in measures for m in (a, b, c)):
                continue
            source_rows = [measures[m] for m in (a, b, c)]
            available = all(r["value"] is not None for r in source_rows)
            delta = source_rows[0]["value"] - source_rows[1]["value"] - source_rows[2]["value"] if available else None
            results.append({"group": list(group), "identity": name, "delta_million": delta,
                            "tolerance_million": 1.5, "status": "pass" if available and abs(delta) <= 1.5 else "fail" if available else "unavailable",
                            "sources": [{k: r[k] for k in ("workbook", "sheet", "cell", "sha256")} for r in source_rows]})
    return results


def compare_level_tables(workbook, document, rows):
    """Check the separate ABS latest-year comparison against the series cells."""
    if not permitted(document):
        return []
    index = {key(r): r for r in rows}
    sectors = {"General Government": "General government", "Non-financial Public Sector": "Non-financial public sector", "Total Public Sector": "Total public sector"}
    results = []
    for sheet in workbook:
        title = str(sheet.cell(4, 1).value or "")
        if not any(x in title for x in ("Operating Statement", "Balance Sheet")):
            continue
        sector = sectors[title.rsplit(" - ", 1)[-1]]
        for ri in range(8, sheet.max_row + 1):
            measure = MEASURES.get(normal(sheet.cell(ri, 1).value))
            if not measure:
                continue
            for ci in range(2, 7):
                level, year = sheet.cell(5, ci).value, sheet.cell(6, ci).value
                prototype = {"release": document["release"], "level_of_government": level, "jurisdiction": "Australia", "sector": sector,
                             "measure": measure, "reference_year": year, "unit": "AUD million", "prices_basis": "Current prices"}
                match = index.get(key(prototype))
                if match is None:
                    continue  # A held workbook remains outside this comparison.
                actual = sheet.cell(ri, ci).value
                delta = actual - match["value"] if isinstance(actual, (float, int)) and match["value"] is not None else None
                results.append({"group": [document["release"], level, "Australia", sector, year], "identity": "independent_ABS_level_table:" + measure,
                                "delta_million": delta, "tolerance_million": 0, "status": "pass" if delta == 0 else "fail",
                                "sources": [{"workbook": document["id"] + ".xlsx", "sheet": sheet.title, "cell": column_name(ci)+str(ri), "sha256": document["receipt"]["sha256"]},
                                            {k: match[k] for k in ("workbook", "sheet", "cell", "sha256")}]})
    return results


def parse_net_debt(workbook, document):
    """Read the six published L2 cells in the debt matrix, never derive a total.

    ABS's National general government column remains National, not Commonwealth.
    This matrix publishes a single stock date; no historical debt is invented.
    """
    if not permitted(document):
        return [], []
    sheet = workbook["Table_15"]
    if sheet.cell(4, 1).value != "Table 15 Matrix of net public sector debt and other liabilities" or sheet.cell(15, 1).value != "Equals L2":
        raise ValueError("Unrecognised net debt matrix layout")
    columns = [("National general government", "National", "General government"),
               ("Total state general government", "State", "General government"),
               ("Total local general government", "Local", "General government"),
               ("All Australia general government", "All levels of government", "General government"),
               ("All Australia non-financial public sector", "All levels of government", "Non-financial public sector"),
               ("All Australia total public sector", "All levels of government", "Total public sector")]
    rows, checks, dimensions = [], [], []
    for ci, (header, level, sector) in enumerate(columns, 2):
        if normal(sheet.cell(5, ci).value) != normal(header) or sheet.cell(7, ci).value != "$m":
            raise ValueError("Unrecognised net debt column/unit")
        end_year = str(int(document["release"][:4]) + 1)
        if end_year not in str(sheet.cell(6, ci).value):
            raise ValueError("Unrecognised net debt stock date")
        dim = {"level_of_government": level, "jurisdiction": "Australia", "sector": sector,
               "consolidation": sheet.cell(4, 1).value + " · " + header}
        dimensions.append(dim)
        value = sheet.cell(15, ci).value
        if not isinstance(value, (int, float)):
            raise ValueError("Unrecognised net debt value")
        row = {**dim, "release": document["release"], "release_date": document["release_date"], "reference_year": document["release"],
               "as_of": end_year + "-06-30", "measure": "net_debt_l2", "measure_as_published": "Equals L2", "value": value,
               "source_marker": None, "unit": "AUD million", "prices_basis": "Current prices", "series_basis": "Original", "published": True,
               "workbook": document["id"] + ".xlsx", "sheet": sheet.title, "cell": column_name(ci)+"15", "source_url": document["url"],
               "release_url": RELEASE, **document["receipt"], "licence": "CC BY 4.0", "licence_url": CC}
        rows.append(row)
        # Only components inside this exact ABS consolidation column are checked.
        component_rows = (11, 13, 14)
        delta = sum(sheet.cell(ri, ci).value for ri in component_rows) - value
        checks.append({"group": [document["release"], level, "Australia", sector, document["release"]], "identity": "net_debt_l2",
                       "formula": "Equals L1 + plus SDRs + plus Currency and deposits = Equals L2", "delta_million": delta,
                       "tolerance_million": 2, "status": "pass" if abs(delta) <= 2 else "fail",
                       "sources": [{"workbook": row["workbook"], "sheet": sheet.title, "cell": column_name(ci)+str(ri), "sha256": row["sha256"]} for ri in (*component_rows, 15)]})
    document["series_dimensions"] = dimensions
    return rows, checks
