#!/usr/bin/env python3
"""Export charity-register, AIS and ATO tax-transparency rows for the organisations OPAX shows
-> portal/public/entities/tax-charity/  (index.json + one shard per last two digits of the ABN)

Joins the three tables loaded by parli.ingest.acnc_ato (ext_acnc_charities, ext_acnc_ais,
ext_ato_tax_transparency) to the ABNs of the organisations OPAX has a page or row for:

  suppliers         profiles in portal/public/suppliers/*.json           (AusTender, ABN in the profile)
  grant recipients  portal/public/grants/*/shard-*.json                  (ABN in the recipient file)
  donors            donor nodes in portal/public/graph/money*.json and access.json keys, resolved
                    to an entity in ext_donor_entities / ext_donor_aliases and taken at that
                    entity's ABN (attached from the ABN Bulk Extract by parli.ingest.donor_entities)
  lobbying clients  ext_lobbyist_clients.client_abn                      (the six lobbyist registers)
  FITS registrants  ext_fits_registrants.abn

The join is by ABN only. No name is ever matched to a charity or a taxpayer: a donor becomes an ABN
through its entity, and an entity with two ABNs among its labels is not linked ("no match on
ambiguity"). Only ABNs that have at least one charity, AIS or ATO row are written, so a shard is a
few tens of kilobytes.

Runs read-only against parli.db (`mode=ro`):

    python3 scripts/export_tax_charity.py --db $OPAX_DB --portal portal/public

Output (portal/public/entities/tax-charity/):

  index.json     { meta }: sources (dataset, licence, snapshot date, per-year records), counts,
                 per-entity-set match counts, the caveat sentences the page prints (~10 KB; every
                 page that shows the block fetches it)
  names.json     { by_name }: { app.js normName(name): abn } for donor labels (and their aliases),
                 lobbying clients and FITS registrants, so a page that only knows a name can find the
                 ABN. A key that maps to two ABNs is dropped. Only donor pages fetch it.
  <dd>.json      { abn: record } for ABNs ending in <dd>; a record is
                 { c?: charity, a?: [ais, ...] (latest first), t?: [ato, ...] (latest first), tn?: ATO name }

  charity c  { n name, sz Small|Medium|Large, pbi 1, hpc 1, reg registration date }
  ais a[]    { y AIS year, rev total revenue, gov revenue from government, don donations and
               bequests, exp total expenses, to reporting period end, sz, rs registration status
               (only when not "Registered"), rel 1 when a basic religious charity }
  ato t[]    { y income year, inc total income, tax taxable income, pay tax payable, prrt PRRT payable };
             a missing key means the ATO published no amount (it leaves a field blank when the amount
             is zero or less), it does NOT mean zero was reported.

Deterministic: rerunning against the same tables rewrites identical bytes.
"""

from __future__ import annotations

import argparse
import glob
import json
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

SCHEMA = 1
KEEP_AIS_YEARS = 3
GENERIC_SINGLE = {"australia", "australian", "group", "trust", "foundation", "association", "club", "company",
                  "services", "service", "investments", "nominees", "family", "fund", "bank", "union", "party",
                  "council", "institute", "national", "international", "enterprises", "corporation",
                  "industries", "pacific", "capital", "management", "partners", "consulting", "finance",
                  "dept", "department", "office", "government", "advisory", "strategies", "communications",
                  "media", "energy", "university"}
PLACEHOLDER_NAMES = {"n/a", "na", "n.a.", "none", "nil", "-", "--", "not applicable"}
# Mirrors normName() in portal/public/app.js exactly; the by_name keys use it.
JS_STRIP = {"pty", "ltd", "limited", "the", "inc", "co", "holdings"}

ATO_REPORT_PAGE = ("https://www.ato.gov.au/businesses-and-organisations/corporate-tax-measures-and-assurance/"
                   "large-business/corporate-tax-transparency/report-of-entity-tax-information")
# The sentences the page prints. ATO wording is quoted or closely paraphrased from the ATO's own
# "Report of entity tax information" page (verified 2026-09-29); see docs/DATA-TAX-CHARITY.md.
CAVEATS = {
    "ato": ("Figures are as the ATO published them for that income year. Tax payable is the amount on the company "
            "tax return after offsets and credits; it is not tax paid. The ATO says the report does not by itself "
            "show whether an entity pays a high or low rate of tax, that a zero can have lawful reasons (losses, "
            "offsets), and that an entity may be one part of a larger group. A blank means the ATO left the field "
            "blank because the amount was zero or less."),
    "ais": ("Figures are as the charity reported them to the ACNC in its Annual Information Statement. Revenue from "
            "government covers Commonwealth, state, territory and local government funding, contracts and "
            "subsidies. Small charities report fewer items, and some charities publish no financial figures; a zero "
            "in the dataset can mean no figure was reported."),
    "register": ("Charity status is as shown on the ACNC Charity Register when the dataset was last updated. "
                 "PBI (Public Benevolent Institution) and HPC (Health Promotion Charity) are as the register "
                 "shows them; deductible gift recipient (DGR) status is not part of the ACNC dataset."),
}


def norm_js(s) -> str:
    s = re.sub(r"[^a-z0-9]+", " ", str(s or "").lower())
    return " ".join(t for t in s.split() if t not in JS_STRIP)


def usable_key(k: str) -> bool:
    toks = k.split()
    if not toks:
        return False
    if len(toks) == 1 and (toks[0] in GENERIC_SINGLE or len(toks[0]) < 4):
        return False
    return True


def abn_digits(v) -> str | None:
    d = re.sub(r"\D", "", str(v or ""))
    return d if len(d) == 11 else None


def money(v):
    """Whole dollars; None stays None."""
    if v is None:
        return None
    return int(round(float(v)))


def _strip(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None and v != ""}


# ── portal inputs ────────────────────────────────────────────────────────────


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def supplier_abns(portal: Path) -> dict[str, str]:
    """{abn: display name} from the supplier profile shards."""
    out = {}
    for f in sorted(glob.glob(str(portal / "suppliers" / "*.json"))):
        for p in ((load_json(f) or {}).get("profiles") or {}).values():
            a = abn_digits(p.get("abn"))
            if a:
                out.setdefault(a, p.get("name") or "")
    return out


def recipient_abns(portal: Path) -> dict[str, str]:
    out = {}
    for f in sorted(glob.glob(str(portal / "grants" / "*" / "shard-*.json"))):
        for p in (load_json(f) or {}).values():
            if isinstance(p, dict):
                a = abn_digits(p.get("abn"))
                if a:
                    out.setdefault(a, p.get("n") or "")
    return out


def donor_labels(portal: Path) -> list[tuple[str, list[str]]]:
    """[(label, [aliases])] for every donor the site shows: money-map nodes, then access.json keys."""
    out, seen = [], set()
    for f in sorted(glob.glob(str(portal / "graph" / "money*.json"))):
        for n in (load_json(f) or {}).get("nodes", []):
            if n.get("kind") == "donor" and n.get("label") and n["label"] not in seen:
                seen.add(n["label"])
                out.append((n["label"], list(n.get("aliases") or [])))
    for label in ((load_json(portal / "access.json") or {}).get("donors") or {}):
        if label not in seen:
            seen.add(label)
            out.append((label, []))
    return out


# ── database ─────────────────────────────────────────────────────────────────


def connect(path: str) -> sqlite3.Connection:
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=120)
    db.row_factory = sqlite3.Row
    return db


def has_table(db, name: str) -> bool:
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def donor_abn_index(db):
    """(name -> {entity_id}, entity_id -> abn) from ext_donor_entities / ext_donor_aliases."""
    by_name = defaultdict(set)
    abn_of = {}
    if not (has_table(db, "ext_donor_entities") and has_table(db, "ext_donor_aliases")):
        return by_name, abn_of
    for r in db.execute("SELECT entity_id, canonical_name, abn FROM ext_donor_entities"):
        by_name[r["canonical_name"]].add(r["entity_id"])
        abn_of[r["entity_id"]] = abn_digits(r["abn"])
    for r in db.execute("SELECT alias_raw, entity_id FROM ext_donor_aliases"):
        by_name[r["alias_raw"]].add(r["entity_id"])
    return by_name, abn_of


def resolve_donor(label: str, aliases: list[str], by_name, abn_of) -> tuple[str | None, str]:
    """(abn, why) for one donor node. None when there is no entity, no ABN, or two ABNs."""
    ents = set(by_name.get(label, ()))
    for a in aliases:
        ents |= by_name.get(a, set())
    if not ents:
        return None, "no_entity"
    abns = {abn_of.get(e) for e in ents} - {None}
    if not abns:
        return None, "no_abn"
    if len(abns) > 1:
        return None, "ambiguous_abn"
    return next(iter(abns)), "entity"


def read_rows(db):
    """Everything from the three tables, keyed by ABN (charities/AIS/ATO), plus source metadata."""
    charities = {}
    for r in db.execute("SELECT * FROM ext_acnc_charities ORDER BY id"):
        charities[r["abn"]] = dict(r)
    ais = defaultdict(dict)
    for r in db.execute("SELECT * FROM ext_acnc_ais ORDER BY ais_year, id"):
        ais[r["abn"]][r["ais_year"]] = dict(r)
    ato = defaultdict(dict)
    for r in db.execute("SELECT * FROM ext_ato_tax_transparency WHERE abn IS NOT NULL ORDER BY id"):
        cur = ato[r["abn"]].get(r["income_year"])
        # one row per entity per year: an income_tax row beats a prrt_only row; a later snapshot beats an earlier
        if cur is None or (cur["section"], cur["snapshot_date"] or "") < (r["section"], r["snapshot_date"] or "") \
                or (cur["section"] == "prrt_only" and r["section"] == "income_tax"):
            ato[r["abn"]][r["income_year"]] = dict(r)
    return charities, ais, ato


def source_meta(db) -> dict:
    def one(sql, *params):
        return [dict(r) for r in db.execute(sql, params)]

    reg = one("SELECT dataset_url, licence, licence_url, licence_note, snapshot_date, dataset_modified, "
              "MAX(ingested_at) AS loaded_at, COUNT(*) AS rows FROM ext_acnc_charities WHERE source='acnc_register'")
    ais = one("SELECT ais_year AS year, dataset_url, licence, licence_url, licence_note, snapshot_date, "
              "dataset_modified, COUNT(*) AS rows FROM ext_acnc_ais GROUP BY ais_year ORDER BY ais_year DESC")
    ato = one("SELECT income_year AS year, source_url AS record_url, dataset_url, licence, licence_url, licence_note, "
              "snapshot_date, dataset_modified, resource_id, COUNT(*) AS rows FROM ext_ato_tax_transparency "
              "WHERE section='income_tax' GROUP BY resource_id, income_year ORDER BY income_year DESC, rows DESC")
    # a workbook also lists late lodgers for earlier years (the 2016-17 file carries 43 rows for 2015-16):
    # the record for a year is the resource with the most rows for it, which is that year's own report
    seen, ato_years = set(), []
    for r in ato:
        if r["year"] in seen:
            continue
        seen.add(r["year"])
        ato_years.append(r)
    return {"register": reg[0] if reg and reg[0]["rows"] else None, "ais": ais, "ato": ato_years}


# ── build ────────────────────────────────────────────────────────────────────


def charity_record(row: dict) -> dict:
    return _strip({"n": row["legal_name"], "sz": row["size"], "pbi": 1 if row["pbi"] else None,
                   "hpc": 1 if row["hpc"] else None, "reg": row["registration_date"]})


def ais_record(row: dict) -> dict:
    status = row["registration_status"]
    # Basic religious charities report no financial information to the ACNC (AIS explanatory notes,
    # para 69), yet the dataset carries 0 as total revenue for 7,829 of the 8,449 of them. Those
    # zeros are placeholders, not reported figures, so they are not exported; a basic religious charity
    # that did report revenue keeps its figures.
    unreported = bool(row["basic_religious_charity"]) and not (row["total_revenue"] or 0) > 0
    money_fields = {} if unreported else {
        "rev": money(row["total_revenue"]), "gov": money(row["revenue_from_government"]),
        "don": money(row["donations_and_bequests"]), "exp": money(row["total_expenses"]), "to": row["fin_report_to"]}
    return _strip({"y": row["ais_year"], **money_fields, "sz": row["size"],
                   "rs": status if status and status != "Registered" else None,
                   "rel": 1 if row["basic_religious_charity"] else None,
                   "n": row["charity_name"]})


def ato_record(row: dict) -> dict:
    return _strip({"y": row["income_year"], "inc": money(row["total_income"]), "tax": money(row["taxable_income"]),
                   "pay": money(row["tax_payable"]), "prrt": money(row["prrt_payable"])})


def build_record(abn, charities, ais, ato) -> dict | None:
    rec = {}
    if abn in charities:
        rec["c"] = charity_record(charities[abn])
    if abn in ais:
        rows = [ais_record(ais[abn][y]) for y in sorted(ais[abn], reverse=True)[:KEEP_AIS_YEARS]]
        # the charity's name is carried once, on the newest AIS row
        for r in rows[1:]:
            r.pop("n", None)
        rec["a"] = rows
    if abn in ato:
        years = sorted(ato[abn], reverse=True)
        rec["t"] = [ato_record(ato[abn][y]) for y in years]
        rec["tn"] = ato[abn][years[0]]["entity_name"]
    return rec or None


def shard_of(abn: str) -> str:
    return abn[-2:]


def write_json(path: Path, obj) -> int:
    text = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def export(db_path: str, portal: Path, out_dir: Path, allow_shrink: bool = False, dry_run: bool = False) -> dict:
    db = connect(db_path)
    for t in ("ext_acnc_charities", "ext_acnc_ais", "ext_ato_tax_transparency"):
        if not has_table(db, t) or db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] == 0:
            raise SystemExit(f"export_tax_charity: {t} is empty or missing; run parli.ingest.acnc_ato first")
    charities, ais, ato = read_rows(db)
    have = set(charities) | set(ais) | set(ato)

    sets: dict[str, dict[str, str]] = {"suppliers": supplier_abns(portal), "grant_recipients": recipient_abns(portal)}

    # donors: node label -> entity -> ABN
    by_name_ent, abn_of = donor_abn_index(db)
    donors, donor_why = {}, defaultdict(int)
    name_to_abns = defaultdict(set)     # normName -> {abn}: the by_name index
    for label, aliases in donor_labels(portal):
        abn, why = resolve_donor(label, aliases, by_name_ent, abn_of)
        donor_why[why] += 1
        if abn:
            donors[abn] = label
            for nm in [label, *aliases]:
                k = norm_js(nm)
                if k and usable_key(k):
                    name_to_abns[k].add(abn)
    sets["donors"] = donors

    lobby = {}
    if has_table(db, "ext_lobbyist_clients"):
        for r in db.execute("SELECT DISTINCT client_name, client_abn FROM ext_lobbyist_clients "
                            "WHERE client_abn IS NOT NULL AND client_abn != ''"):
            a = abn_digits(r["client_abn"])
            if a:
                lobby.setdefault(a, r["client_name"])
                k = norm_js(r["client_name"])
                if k and usable_key(k) and str(r["client_name"]).strip().lower() not in PLACEHOLDER_NAMES:
                    name_to_abns[k].add(a)
    sets["lobbying_clients"] = lobby

    fits = {}
    if has_table(db, "ext_fits_registrants"):
        for r in db.execute("SELECT name, abn, registrant_type FROM ext_fits_registrants WHERE abn IS NOT NULL AND abn != ''"):
            a = abn_digits(r["abn"])
            if a:
                fits.setdefault(a, r["name"])
                k = norm_js(r["name"])
                if r["registrant_type"] != "Individual" and k and usable_key(k):
                    name_to_abns[k].add(a)
    sets["fits_registrants"] = fits

    universe = set().union(*[set(v) for v in sets.values()])
    wanted = universe & have
    records = {}
    for abn in sorted(wanted):
        rec = build_record(abn, charities, ais, ato)
        if rec:
            records[abn] = rec

    by_name, ambiguous = {}, []
    for k, abns in sorted(name_to_abns.items()):
        abns &= set(records)
        if len(abns) == 1:
            by_name[k] = next(iter(abns))
        elif len(abns) > 1:
            ambiguous.append(k)

    matches = {}
    for name, members in sets.items():
        ids = set(members)
        hit = ids & set(records)
        matches[name] = {
            "abns": len(ids), "matched": len(hit),
            "charity": sum(1 for a in hit if "c" in records[a]),
            "ais": sum(1 for a in hit if "a" in records[a]),
            "ato": sum(1 for a in hit if "t" in records[a]),
        }
    counts = {
        "abns_written": len(records),
        "charity": sum(1 for r in records.values() if "c" in r),
        "ais": sum(1 for r in records.values() if "a" in r),
        "ato": sum(1 for r in records.values() if "t" in r),
        "register_rows": len(charities), "ais_abns": len(ais), "ato_abns": len(ato),
        "by_name_keys": len(by_name), "by_name_ambiguous_dropped": len(ambiguous),
        "donor_nodes": sum(donor_why.values()), "donor_resolution": dict(sorted(donor_why.items())),
    }

    src = source_meta(db)
    latest_load = max([r[0] for r in db.execute(
        "SELECT MAX(ingested_at) FROM ext_acnc_charities UNION ALL SELECT MAX(ingested_at) FROM ext_acnc_ais "
        "UNION ALL SELECT MAX(ingested_at) FROM ext_ato_tax_transparency") if r[0]])
    meta = {
        "schema": SCHEMA,
        "data_as_of": latest_load,
        "sources": {
            "register": {
                "title": "ACNC Registered Charities", "publisher": "Australian Charities and Not-for-profits Commission (ACNC)",
                **(src["register"] or {}),
            },
            "ais": {
                "title": "ACNC Annual Information Statement data", "publisher": "Australian Charities and Not-for-profits Commission (ACNC)",
                "latest_year": str(src["ais"][0]["year"]) if src["ais"] else None,
                "years": {str(r["year"]): {k: v for k, v in r.items() if k != "year"} for r in src["ais"]},
            },
            "ato": {
                "title": "Corporate Tax Transparency: Report of entity tax information", "publisher": "Australian Taxation Office (ATO)",
                "guidance_url": ATO_REPORT_PAGE,
                "latest_year": src["ato"][0]["year"] if src["ato"] else None,
                "years": {r["year"]: {k: v for k, v in r.items() if k != "year"} for r in src["ato"]},
            },
        },
        "caveats": CAVEATS,
        "matching": ("By ABN only. Donors reach an ABN through their donor entity (ext_donor_entities); no name is matched "
                     "to a charity or taxpayer. See docs/DATA-TAX-CHARITY.md and scripts/export_tax_charity.py."),
        "counts": counts,
        "matches": matches,
        "shard": "last two digits of the ABN",
    }
    shards = defaultdict(dict)
    for abn, rec in records.items():
        shards[shard_of(abn)][abn] = rec

    # guard against publishing a smaller set by accident (a partial load, a wiped table)
    idx_path = out_dir / "index.json"
    prev = load_json(idx_path)
    if prev and not allow_shrink:
        old = ((prev.get("meta") or {}).get("counts") or {}).get("abns_written") or 0
        if old and len(records) < 0.9 * old:
            raise SystemExit(f"export_tax_charity: {len(records):,} ABNs against {old:,} published (under 90%); "
                             f"refusing (use --allow-shrink if that is right)")
    if not records:
        raise SystemExit("export_tax_charity: no ABN matched any OPAX entity; refusing to write an empty export")

    sizes = {}
    if not dry_run:
        # drop shards that no longer have any record so a shrinking set leaves no stale file
        for f in glob.glob(str(out_dir / "??.json")):
            if Path(f).stem not in shards:
                Path(f).unlink()
        for sh, body in shards.items():
            sizes[sh] = write_json(out_dir / f"{sh}.json", body)
        sizes["index"] = write_json(idx_path, {"meta": meta})
        sizes["names"] = write_json(out_dir / "names.json", {"by_name": by_name})
    return {"meta": meta, "records": records, "sets": sets, "sizes": sizes, "by_name": by_name,
            "ambiguous_names": ambiguous}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", required=True, help="parli.db (opened read-only)")
    ap.add_argument("--portal", default="portal/public", help="portal/public: suppliers/, grants/, graph/, access.json")
    ap.add_argument("--out", default=None, help="output directory (default <portal>/entities/tax-charity)")
    ap.add_argument("--allow-shrink", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="compute and report, write nothing")
    args = ap.parse_args(argv)
    portal = Path(args.portal)
    out = Path(args.out) if args.out else portal / "entities" / "tax-charity"
    res = export(args.db, portal, out, args.allow_shrink, args.dry_run)
    c, m = res["meta"]["counts"], res["meta"]["matches"]
    print(f"tax-charity: {c['abns_written']:,} ABNs written ({c['charity']:,} charity, {c['ais']:,} AIS, {c['ato']:,} ATO); "
          f"{c['by_name_keys']:,} name keys ({c['by_name_ambiguous_dropped']} ambiguous dropped)", file=sys.stderr)
    for name, x in m.items():
        print(f"  {name:<17} {x['abns']:>7,} ABNs -> {x['matched']:>5,} with a row "
              f"(charity {x['charity']:,}, AIS {x['ais']:,}, ATO {x['ato']:,})", file=sys.stderr)
    print(f"  donor nodes: {c['donor_nodes']:,} -> {c['donor_resolution']}", file=sys.stderr)
    if res["sizes"]:
        total = sum(v for k, v in res["sizes"].items())
        shard_sizes = {k: v for k, v in res["sizes"].items() if k not in ("index", "names")}
        print(f"  wrote {len(shard_sizes)} shards + index + names: {total:,} bytes total, "
              f"largest shard {max(shard_sizes.values()):,} bytes; index {res['sizes']['index']:,}, "
              f"names {res['sizes']['names']:,} bytes", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
