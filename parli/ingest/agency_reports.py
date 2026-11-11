"""Agency annual reports held as original files: intake, page text and fact checks.

Annual reports of Commonwealth, state and territory agencies that OPAX holds as the
publisher's own PDF. The Commonwealth's structured annual report tables come from the
Transparency Portal instead (parli.ingest.transparency_portal); a Commonwealth PDF here is
registered and linked to that body, and figures the Portal already publishes are not
extracted again. Integrity commission reports, findings and recommendations live in
portal/public/integrity-reports; a PDF that dataset already holds (same SHA-256) is
registered here as a link to that record, not as a second copy.

Layout (all in git except the PDFs and their page text):

  data/agency-reports/intake-<date>.json   one row per document: identity, kind, edition,
                                           source and catalogue URLs, hash, pages, rights
  data/agency-reports/facts/<id>.json      figures read from a document, each with its PDF
                                           page and a short verbatim quote holding the value
  ~/.cache/autoresearch/agency-reports/    files/<sha256>.pdf and text/<sha256>.json

  python -m parli.ingest.agency_reports stage --manifest <intake manifest.json>
  python -m parli.ingest.agency_reports verify [--id <report_id>]

`stage` checks every file's SHA-256 against the manifest before anything is kept. No
network requests are made here: an intake arrives as files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

from parli.ingest.integrity.common import pdf_pages, verbatim

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "agency-reports"
CACHE = Path(os.environ.get("OPAX_AGENCY_REPORTS_CACHE", "~/.cache/autoresearch/agency-reports")).expanduser()
INTEGRITY = ROOT / "portal" / "public" / "integrity-reports"
PORTAL = ROOT / "portal" / "public" / "annual-reports" / "index.json"

JURISDICTIONS = {"Cth": "cth", "NSW": "nsw", "VIC": "vic", "QLD": "qld", "WA": "wa", "SA": "sa", "TAS": "tas", "ACT": "act", "NT": "nt"}
# Integrity commissions OPAX already covers, by the agency name the intake uses.
INTEGRITY_BODIES = {
    ("Cth", "National Anti-Corruption Commission"): "nacc",
    ("NSW", "Independent Commission Against Corruption"): "nsw_icac",
    ("VIC", "Independent Broad-based Anti-corruption Commission"): "vic_ibac",
    ("QLD", "Crime and Corruption Commission"): "qld_ccc",
    ("WA", "Corruption and Crime Commission"): "wa_ccc",
    ("SA", "Independent Commission Against Corruption"): "sa_icac",
    ("TAS", "Integrity Commission Tasmania"): "tas_ic",
    ("ACT", "ACT Integrity Commission"): "act_ic",
    ("NT", "Integrity NT, Northern Territory Government"): "nt_icac",
}
PORTAL_BODIES = {
    "National Anti-Corruption Commission": "national_anti_corruption_commission",
    "Department of Finance": "department_of_finance",
    "The Treasury": "department_of_the_treasury",
    "Australian Public Service Commission and Merit Protection Commissioner": "australian_public_service_commission",
}

METRICS = {
    # pay
    "head_remuneration": "Remuneration of the agency head or accountable officer (an amount or a band)",
    "named_remuneration": "A named person's remuneration as printed (name and position required)",
    "executive_band": "Senior executives in one remuneration band or classification (band and count)",
    "executive_count": "Number of senior executives in total",
    "executive_remuneration_total": "Total remuneration paid to executives or key management personnel",
    "executive_average_remuneration": "Average remuneration of executives (overall or in one band)",
    # workforce
    "staff_fte": "Staff, full-time equivalent",
    "staff_headcount": "Staff, headcount",
    # money
    "total_expenses": "Total expenses",
    "total_income": "Total income or revenue",
    "employee_expenses": "Employee benefits or employee-related expenses",
    "net_result": "Net result, surplus or deficit",
    "consultancy_total": "Total consultancy spend",
    "consultancy": "One consultancy engagement (counterparty and amount)",
    # operations of oversight and integrity bodies
    "matters_received": "Complaints, notifications, reports or matters received",
    "investigations_commenced": "Investigations commenced",
    "investigations_finalised": "Investigations finalised or completed",
    "public_hearings": "Public hearings or examinations held",
    "referrals_to_prosecution": "Briefs or referrals to a prosecuting authority",
    "recommendations_made": "Recommendations made",
    "operational_other": "Another operational figure the report highlights (label required)",
}
# Pay, workforce and finance figures the Transparency Portal already publishes for a linked Commonwealth body.
PORTAL_METRICS = {"head_remuneration", "named_remuneration", "executive_band", "executive_count", "executive_remuneration_total",
                  "executive_average_remuneration", "staff_fte", "staff_headcount", "total_expenses", "total_income",
                  "employee_expenses", "net_result", "consultancy_total", "consultancy"}
UNITS = {"dollars", "thousands_of_dollars", "millions_of_dollars", "people", "fte", "count", "percent", "days"}
QUOTE_MAX = 320
NUMBER = re.compile(r"^\(?-?\$?\s?-?[\d,]+(?:\.\d+)?\)?\s?(?:m|million|k|bn|billion|%)?$", re.I)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def slug(value: str, limit=90) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower().replace("&", " and ").replace("'", "").replace("’", "")).strip("-")[:limit].strip("-")


def edition_of(row) -> tuple[str, str | None]:
    kind = row["document_kind"].lower()
    if "companion" in kind:
        return "statutory_companion", None
    if "statutory annual return" in kind:
        return "statutory_return", None
    if row["reporting_year"].replace("–", "-") != "2025-26":
        return "prior_edition", "Latest verified edition; the 2025-26 report was not available at intake."
    if "corrected" in kind:
        return "current_corrected", None
    return "current", None


def integrity_index():
    """Integrity documents by SHA-256, and integrity body codes."""
    by_sha = {}
    for f in INTEGRITY.glob("reports-*.json"):
        for r in json.loads(f.read_text())["records"]:
            for d in r.get("documents", []):
                if d.get("sha256"):
                    by_sha[d["sha256"]] = {"record_id": r["id"], "title": r["title"], "url": d["url"]}
    return by_sha


def stage(args):
    manifest = json.loads(Path(args.manifest).read_text())
    as_of = manifest["as_of"]
    by_sha = integrity_index()
    rows, seen = [], set()
    (CACHE / "files").mkdir(parents=True, exist_ok=True)
    for r in manifest["reports"]:
        path = Path(r["path"])
        digest = sha256(path)
        if digest != r["sha256"] or path.stat().st_size != r["bytes"]:
            sys.exit(f"[agency_reports] hash or size mismatch for {path}; nothing staged")
        juris = JURISDICTIONS[r["jurisdiction"]]
        year = r["reporting_year"].replace("–", "-")
        edition, edition_note = edition_of(r)
        kind_slug = "financial-statements" if edition == "statutory_companion" else "assumed-identities-return" if edition == "statutory_return" else \
            "information-statement" if "information statement" in r["document_kind"].lower() else "annual-report"
        rid = f"{juris}-{slug(r['agency'])}-{year}-{kind_slug}"
        if rid in seen:
            sys.exit(f"[agency_reports] duplicate report id {rid}")
        seen.add(rid)
        dest = CACHE / "files" / f"{digest}.pdf"
        if not dest.exists():
            shutil.copyfile(path, dest)
        row = {
            "report_id": rid, "jurisdiction": r["jurisdiction"], "agency": r["agency"], "reporting_year": year,
            "document_kind": r["document_kind"], "edition": edition, **({"edition_note": edition_note} if edition_note else {}),
            "source_url": r["source_url"], "catalogue_url": r.get("catalogue_url"), "sha256": digest, "bytes": r["bytes"],
            "pages": r["pages"], "acquisition": r["acquisition"], "intake": as_of,
        }
        if r.get("tabled"):
            row["tabled"] = r["tabled"]
        for k in ("corrigendum_url", "edition_note", "file_note", "rights_note", "reuse_terms_url", "attribution"):
            if r.get(k):
                row["intake_" + k if k == "edition_note" else k] = r[k]
        code = INTEGRITY_BODIES.get((r["jurisdiction"], r["agency"]))
        if code:
            row["integrity_body"] = code
        if digest in by_sha:
            row["integrity_record"] = by_sha[digest]
        if r["jurisdiction"] == "Cth" and r["agency"] in PORTAL_BODIES:
            row["portal_body_id"] = PORTAL_BODIES[r["agency"]]
        rows.append(row)
    # A statutory companion belongs to the same agency's annual report for the same year.
    for row in rows:
        if row["edition"] == "statutory_companion":
            main = [o for o in rows if o is not row and o["jurisdiction"] == row["jurisdiction"] and o["agency"] == row["agency"] and o["reporting_year"] == row["reporting_year"]
                    and o["edition"].startswith("current")]
            if len(main) != 1:
                sys.exit(f"[agency_reports] cannot pair companion {row['report_id']}")
            row["companion_of"] = main[0]["report_id"]
    batch = manifest.get("batch")
    out = DATA / (f"intake-{as_of}-{slug(batch, 40)}.json" if batch else f"intake-{as_of}.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"as_of": as_of, "source": manifest.get("source", "OPAX maintainer intake of publisher files"), "scope": manifest.get("scope"),
                               "reporting_body_roster": {k: v for k, v in manifest["reporting_body_roster"].items() if k != "path"},
                               "catalogues": manifest.get("catalogues", []), "reports": rows}, ensure_ascii=False, indent=1) + "\n")
    for row in rows:
        text = pdf_pages((CACHE / "files" / f"{row['sha256']}.pdf").read_bytes(), CACHE)
        if len(text) != row["pages"]:
            sys.exit(f"[agency_reports] {row['report_id']}: {len(text)} text pages, manifest says {row['pages']}")
    print(f"[agency_reports] staged {len(rows)} documents into {out.relative_to(ROOT)}; "
          f"{sum(1 for r in rows if 'integrity_record' in r)} already held as integrity records")


def intake_rows():
    rows = {}
    for f in sorted(DATA.glob("intake-*.json")):
        for r in json.loads(f.read_text())["reports"]:
            rows[r["report_id"]] = r
    return rows


def page_text(row) -> list[str]:
    path = CACHE / "text" / (row["sha256"] + ".json")
    if not path.exists():
        pdf_pages((CACHE / "files" / f"{row['sha256']}.pdf").read_bytes(), CACHE)
    return json.loads(path.read_text())


def parse_number(text):
    if text is None:
        return None
    t = text.strip().replace("−", "-").replace("–", "-")
    if not NUMBER.fullmatch(t):
        return None
    neg = t.startswith("(") and t.endswith(")") or "-" in t[:3]
    digits = re.sub(r"[^\d.]", "", t)
    try:
        v = float(digits)
    except ValueError:
        return None
    v = -v if neg else v
    return int(v) if v == int(v) and "." not in digits else v


def as_token(value: str, quote: str) -> bool:
    """``value`` appears in ``quote`` as a whole figure: not inside a longer number or word."""
    from parli.ingest.integrity.common import _norm
    v, q = _norm(value), _norm(quote)
    return bool(v) and re.search(r"(?<![\w.,])" + re.escape(v) + r"(?![\w]|[.,]\d)", q) is not None


def check_fact(fact, pages, row) -> list[str]:
    errs = []
    m = fact.get("metric")
    if m not in METRICS:
        errs.append(f"unknown metric {m!r}")
    if fact.get("unit") not in UNITS:
        errs.append(f"unknown unit {fact.get('unit')!r}")
    page = fact.get("page")
    if not isinstance(page, int) or not 1 <= page <= len(pages):
        return errs + [f"page {page!r} outside 1..{len(pages)}"]
    quote = fact.get("quote") or ""
    if not quote or len(quote) > QUOTE_MAX:
        errs.append(f"quote missing or longer than {QUOTE_MAX} characters")
    elif not verbatim(quote, pages[page - 1]):
        errs.append("quote is not verbatim on the cited page")
    vap = fact.get("value_as_published")
    if vap is None or not as_token(str(vap), quote):
        errs.append("value_as_published does not appear in the quote")
    if fact.get("value") is not None:
        parsed = parse_number(str(vap)) if vap is not None else None
        # Values stay as published: no scaling, no rounding. Suffixes like "m" stay in value_as_published.
        if parsed is None or abs(float(parsed) - float(fact["value"])) > 1e-9:
            errs.append(f"value {fact['value']!r} is not the number in value_as_published {vap!r}")
    if not fact.get("label_as_published") or not verbatim(fact["label_as_published"], pages[page - 1]):
        errs.append("label_as_published missing or not on the cited page")
    if m == "named_remuneration" and not (fact.get("name") and fact.get("position")):
        errs.append("named_remuneration needs name and position")
    if m == "executive_band" and not fact.get("band"):
        errs.append("executive_band needs band")
    if m == "consultancy" and not fact.get("counterparty"):
        errs.append("consultancy needs counterparty")
    if m == "operational_other" and not fact.get("label_as_published"):
        errs.append("operational_other needs label_as_published")
    for k in ("name", "position", "band", "counterparty", "column_as_published"):
        if fact.get(k) and not verbatim(str(fact[k]), pages[page - 1]):
            errs.append(f"{k} {fact[k]!r} is not on the cited page")
    if row.get("portal_body_id") and m in PORTAL_METRICS:
        errs.append("the Transparency Portal already publishes this figure for this body; link, do not duplicate")
    return errs


def load_facts(rid):
    path = DATA / "facts" / f"{rid}.json"
    return json.loads(path.read_text()) if path.exists() else None


def verify(args, quiet=False):
    rows = intake_rows()
    ids = [args.id] if getattr(args, "id", None) else sorted(rows)
    bad = 0
    summary = {}
    for rid in ids:
        doc = load_facts(rid)
        if doc is None:
            continue
        if doc.get("report_id") != rid:
            print(f"{rid}: report_id in file is {doc.get('report_id')!r}")
            bad += 1
            continue
        pages = page_text(rows[rid])
        for i, fact in enumerate(doc.get("facts", [])):
            errs = check_fact(fact, pages, rows[rid])
            if errs:
                bad += 1
                print(f"{rid} fact {i} ({fact.get('metric')}, p.{fact.get('page')}): " + "; ".join(errs))
        summary[rid] = len(doc.get("facts", []))
    if not quiet:
        print(json.dumps({"documents_with_facts": len(summary), "facts": sum(summary.values()), "errors": bad}))
    return bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("stage")
    s.add_argument("--manifest", required=True)
    v = sub.add_parser("verify")
    v.add_argument("--id")
    args = ap.parse_args(argv)
    if args.cmd == "stage":
        stage(args)
    else:
        sys.exit(1 if verify(args) else 0)


if __name__ == "__main__":
    main()
