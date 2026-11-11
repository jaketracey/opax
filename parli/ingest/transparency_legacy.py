"""Transparency Portal annual report files for 2018-19 to 2021-22.

Before 2022-23 the Portal published annual report tables only as files on its Data sets
page: one ZIP of every dataset for 2018-19, 2019-20 and 2020-21, and one CSV per dataset
for 2021-22. These files do not change, so the asset URLs are pinned here. This loader
reads three table families from them:

  key management personnel   one row per person (long form)
  senior executive and other highly paid staff bands
                             wide form, one block of columns per entity
  organisations paid         reportable consultancy and non-consultancy contract
                             expenditure by organisation (2020-21 and 2021-22 only;
                             2020-21 states dollars, 2021-22 states thousands of dollars)

Every row keeps the asset URL, the CSV file name and its 1-based line number. Values stay
as published; `number()` is applied only where the whole cell is a number.

  python -m parli.ingest.transparency_legacy fetch    # download any asset not yet cached
  python -m parli.ingest.transparency_legacy build    # parse the cache into legacy-snapshot.json
  python -m parli.ingest.transparency_legacy refresh  # both

Exit 3 (held) keeps the last good snapshot when a download fails or a file's shape is
not what this parser expects. Requests use the OPAXBot identity through parli.ingest.http.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone

from parli.ingest import http as source_http
from parli.ingest.transparency_portal import CACHE, INTERVAL, Held, atomic_json, clean, footnote_free_name, number

BASE = "https://previewapi.transparency.gov.au/delivery/assets/80a82ed1-3e33-027b-b7e0-6493f97f18f8/"
DATASETS_PAGE = "https://www.transparency.gov.au/data-sets"
ASSETS = {
    "2018-19": {"zip": BASE + "e1dad9d9-ef6d-4c38-bd20-31defd724a95/Transparency%20Portal%20Export%20-%20All%20datasets%2C%20All%20entities%2C%202018-19.zip"},
    "2019-20": {"zip": BASE + "8d78efdc-1b4e-42ef-b5b7-4fdb21d9aa92/Transparency%20Portal%20Export%20-%20All%20datasets%2C%20All%20entities%2C%202019-20.zip"},
    "2020-21": {"zip": BASE + "16868ee8-474c-4da2-b735-1c57e38cd3b7/Transparency%20Portal%20Export%20-%20All%20datasets%2C%20All%20entities%2C%202020-21.zip"},
    "2021-22": {
        "kmp": BASE + "16bb3155-9903-4db7-b09d-38121b167b6c/Information%20about%20remuneration%20for%20key%20management%20personnel%20-%20%202021-22.csv",
        "senior_executives": BASE + "c9bc3ac5-fe54-4179-a839-c0b9e850d713/Information%20about%20remuneration%20for%20senior%20executives%20-%20%202021-22.csv",
        "highly_paid": BASE + "25277e53-8776-40a5-b9e4-fa707464cebe/Information%20about%20remuneration%20for%20other%20highly%20paid%20staff%20-%20%202021-22.csv",
        "consultancy_orgs": BASE + "aad9b9cb-331d-4142-8c10-81da1b05225e/Organisations%20Receiving%20a%20Share%20of%20Reportable%20Consultancy%20Contract%20Expenditure%20-%20%202021-22.csv",
        "non_consultancy_orgs": BASE + "8b379a3c-58fb-404d-95dc-c39dfd44acf0/Organisations%20Receiving%20a%20Share%20of%20Reportable%20Non-Consultancy%20Contract%20Expenditure%20-%20%202021-22.csv",
    },
}
# Which CSV inside each ZIP holds each family (matched on the file name, case-insensitive).
ZIP_FILES = {
    "kmp": re.compile(r"remuneration for key management personnel", re.I),
    "senior_executives": re.compile(r"remuneration for senior executives", re.I),
    "highly_paid": re.compile(r"remuneration for other highly paid staff", re.I),
    "consultancy_orgs": re.compile(r"organisations receiving a share of reportable consultancy", re.I),
    "non_consultancy_orgs": re.compile(r"organisations receiving a share of reportable non-consultancy", re.I),
}
LEGACY = CACHE / "legacy"
SNAPSHOT = CACHE / "legacy-snapshot.json"
KMP_HEADER = ["", "entity", "position title", "base salary", "bonuses", "other benefits and allowances",
              "superannuation contributions", "long service leave", "other long term benefits", "termination benefits",
              "total remuneration"]
KMP_FIELDS = ["base_salary", "bonuses", "other_benefits", "superannuation", "long_service_leave", "other_long_term",
              "termination", "total"]
BAND_FIELDS = ["count", "base_salary", "bonuses", "other_benefits", "superannuation", "long_service_leave",
               "other_long_term", "termination", "total"]
ABN = re.compile(r"\(\s*(?:ABN[.:]?\s*)?([\d\s]{11,20})\s*\)\s*$", re.I)
PLACEHOLDER = {None, "0", "-", "n/a", "na", "nil"}
NO_DATA = re.compile(r"^source data not available", re.I)
HEADING = re.compile(r"^(notes?\b|\(|\*|former\b|non-executive board members|executive\b)", re.I)


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_name(url):
    return re.sub(r"%[0-9A-F]{2}", "_", url.rsplit("/", 1)[1])


def fetch(args):
    LEGACY.mkdir(parents=True, exist_ok=True)
    session = source_http.Session()
    fetched = 0
    for year, assets in ASSETS.items():
        for kind, url in assets.items():
            path = LEGACY / local_name(url)
            if path.exists() and path.stat().st_size:
                continue
            source_http.pace(url, INTERVAL)
            response = session.get(url, allow_redirects=False)
            fetched += 1
            if response.status_code != 200 or not response.content:
                raise Held(f"HTTP {response.status_code} for {url}")
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_bytes(response.content)
            tmp.replace(path)
    print(f"[transparency_legacy] fetched {fetched} file(s); cache {LEGACY}", flush=True)


def norm_header(cells):
    return [" ".join(re.sub(r"[^a-z ]+", " ", (c or "").lower()).split()) for c in cells]


def year_files(year):
    """(family, csv name, source url, rows) for every family available in one year."""
    assets = ASSETS[year]
    out = []
    if "zip" in assets:
        url = assets["zip"]
        z = zipfile.ZipFile(LEGACY / local_name(url))
        for family, pattern in ZIP_FILES.items():
            names = [n for n in z.namelist() if pattern.search(n)]
            if len(names) > 1:
                raise Held(f"{year}: {len(names)} files match {family}")
            if names:
                text = z.read(names[0]).decode("utf-8-sig", "replace")
                out.append((family, names[0], url, list(csv.reader(io.StringIO(text)))))
    else:
        for family, url in assets.items():
            text = (LEGACY / local_name(url)).read_bytes().decode("utf-8-sig", "replace")
            out.append((family, local_name(url).replace("_", " "), url, list(csv.reader(io.StringIO(text)))))
    return out


def row_id(year, family, file, line, *parts):
    return hashlib.md5("|".join([year, family, file, str(line), *map(str, parts)]).encode()).hexdigest()


def parse_kmp(year, file, url, rows):
    if norm_header(rows[1])[:11] != KMP_HEADER:
        raise Held(f"{year} {file}: unexpected key management personnel header {rows[1][:11]}")
    out, skipped, no_data = [], 0, []
    for line, r in enumerate(rows[2:], start=3):
        r = (r + [""] * 11)[:11]
        name, entity, position = clean(r[0]), clean(r[1]), clean(r[2])
        values = r[3:11]
        if name and NO_DATA.match(name):
            # The file ends with the entities that published no table; they are listed, not people.
            no_data += [clean(x[1]) for x in rows[line:] if len(x) > 1 and clean(x[1])]
            break
        blank = all(clean(v) is None for v in values)
        if not entity or (str(name).lower() in PLACEHOLDER and all(number(v) in (None, 0) for v in values)) or \
                (blank and (not position or not name or name.endswith(":") or HEADING.match(name))):
            skipped += 1  # placeholder lines, notes and sub-headings inside a table, not people
            continue
        cols = {k: number(v) for k, v in zip(KMP_FIELDS, values)}
        raw = {k: clean(v) for k, v in zip(KMP_FIELDS, values) if clean(v) is not None and str(cols[k]) != clean(v)}
        # A footnote reference glued to the name ("Christine Holgate1") is not part of it; the cell is kept.
        plain, marker = footnote_free_name(name)
        out.append({"year": year, "entity": entity, "name": plain, **({"name_as_published": name} if marker is not None else {}), "position": position, **cols,
                    **({"as_published": raw} if raw else {}), "source_url": url, "source_file": file, "source_row": line,
                    "id": row_id(year, "kmp", file, line, entity, name, position)})
    return out, skipped, no_data


def parse_bands(year, family, file, url, rows):
    head, labels = rows[0], norm_header(rows[1])
    starts = [i for i, c in enumerate(head) if i and clean(c)]
    if not starts or not labels[starts[0]].startswith("number of"):
        raise Held(f"{year} {file}: unexpected band layout")
    width = 9
    out, skipped = [], 0
    for start in starts:
        if not labels[start].startswith("number of") or not labels[start + 8].startswith("average total"):
            raise Held(f"{year} {file}: column block for {head[start]!r} is not the expected nine fields")
        entity = clean(head[start])
        for line, r in enumerate(rows[2:], start=3):
            band = clean(r[0]) if r else None
            if not band:
                continue
            cells = (r + [""] * (start + width))[start:start + width]
            vals = {k: number(v) for k, v in zip(BAND_FIELDS, cells)}
            # The wide files carry every band for every entity; bands with no one in them are left out.
            if not vals["count"] and all(not vals[k] for k in BAND_FIELDS[1:]):
                skipped += 1
                continue
            raw = {k: clean(v) for k, v in zip(BAND_FIELDS, cells) if clean(v) is not None and str(vals[k]) != clean(v)}
            out.append({"year": year, "entity": entity, "band": band, "count": vals.pop("count"), "averages": vals,
                        **({"as_published": raw} if raw else {}), "source_url": url, "source_file": file, "source_row": line,
                        "source_column": start + 1, "id": row_id(year, family, file, line, entity, band)})
    return out, skipped


def parse_orgs(year, family, file, url, rows):
    header = rows[1]
    labels = norm_header(header)
    if labels[1] != "entity" or not labels[2].startswith("expenditure"):
        raise Held(f"{year} {file}: unexpected supplier header {header[:4]}")
    thousands = "'000" in header[2] or "’000" in header[2]
    out, skipped = [], 0
    for line, r in enumerate(rows[2:], start=3):
        r = r + [""] * 4
        org_raw, entity = clean(r[0]), clean(r[1])
        spend_raw = next((clean(v) for v in r[2:] if clean(v)), None)
        if not org_raw or not entity:
            skipped += 1
            continue
        m = ABN.search(org_raw)
        digits = re.sub(r"\D", "", m.group(1)) if m else ""
        org = clean(org_raw[:m.start()]) if m else org_raw
        value = number(spend_raw)
        row = {"year": year, "entity": entity, "kind": "consultancy" if family == "consultancy_orgs" else "non_consultancy",
               "organisation": org, "abn": digits if len(digits) == 11 else None,
               **({"organisation_as_published": org_raw} if org != org_raw else {}),
               ("expenditure_thousands" if thousands else "expenditure_dollars"): value,
               **({"expenditure_as_published": spend_raw} if spend_raw is not None and str(value) != spend_raw else {}),
               "unit_as_published": clean(header[2]), "source_url": url, "source_file": file, "source_row": line,
               "id": row_id(year, family, file, line, entity, org_raw)}
        out.append(row)
    return out, skipped


def build(args):
    snap = {"built_at": now(), "source": {"page": DATASETS_PAGE, "assets": ASSETS}, "kmp": [], "bands": [], "suppliers": [],
            "files": {}, "skipped": {}}
    for year in ASSETS:
        for family, file, url, rows in year_files(year):
            if len(rows) < 3:
                raise Held(f"{year} {file}: only {len(rows)} lines")
            if family == "kmp":
                got, skipped, no_data = parse_kmp(year, file, url, rows)
                snap["kmp"] += got
                snap.setdefault("no_kmp_table", {})[year] = no_data
            elif family in ("senior_executives", "highly_paid"):
                got, skipped = parse_bands(year, family, file, url, rows)
                for g in got:
                    g["kind"] = "senior_executive_band" if family == "senior_executives" else "highly_paid_band"
                snap["bands"] += got
            else:
                got, skipped = parse_orgs(year, family, file, url, rows)
                snap["suppliers"] += got
            snap["files"][f"{year}/{family}"] = {"file": file, "url": url, "rows": len(got)}
            snap["skipped"][f"{year}/{family}"] = skipped
    per_year = {y: sum(1 for r in snap["kmp"] if r["year"] == y) for y in ASSETS}
    if any(n < args.min_kmp for n in per_year.values()):
        raise Held(f"key management personnel rows by year below {args.min_kmp}: {per_year}")
    atomic_json(SNAPSHOT, snap)
    print(json.dumps({"kmp_by_year": per_year, "bands": len(snap["bands"]), "suppliers": len(snap["suppliers"]),
                      "skipped": snap["skipped"]}), flush=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fetch")
    for name in ("build", "refresh"):
        p = sub.add_parser(name)
        p.add_argument("--min-kmp", type=int, default=1000)
    args = ap.parse_args(argv)
    if args.cmd in ("fetch", "refresh"):
        fetch(args)
    if args.cmd in ("build", "refresh"):
        build(args)


if __name__ == "__main__":
    main()
