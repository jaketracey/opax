#!/usr/bin/env python3
"""Public projection of agency annual report documents and the figures read from them (no source requests).

Reads ``data/agency-reports/intake-*.json`` (one row per publisher PDF) and
``data/agency-reports/facts/<report_id>.json`` (figures, each with its PDF page and a short
verbatim quote), re-checks every figure against the page text in the local cache, and writes
``portal/public/agency-reports/``:

  index.json          meta (counts, caveats, metric and unit definitions) and one row per
                      document: agency, year, kind, edition, publisher and catalogue links,
                      links to the integrity and Transparency Portal datasets, rights notes,
                      the number of figures read and the metrics the reader did not find
  facts-<jur>.json    every figure for one jurisdiction, with its label, column, unit, period,
                      page, quote and a page-anchored link to the publisher's PDF
  manifest.json       counts and file hashes

A figure that fails its check stops the export (exit 1). ``--skip-verify`` exports without
the page text, for a machine that does not hold the intake cache; it is never used to get a
failing figure through.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest import agency_reports as ar  # noqa: E402

OUT = ROOT / "portal" / "public" / "agency-reports"
SCHEMA = 1
# the display codes the integrity and royal commission datasets use
JUR = {"Cth": "Cth", "NSW": "NSW", "VIC": "Vic", "QLD": "Qld", "WA": "WA", "SA": "SA", "TAS": "Tas", "ACT": "ACT", "NT": "NT"}
ORDER = list(JUR.values())
EXTRA = ("name", "position", "band", "counterparty", "purpose", "note", "extraction")
CAVEATS = [
    "Each figure is as the report prints it: no adding, scaling, rounding or conversion. value is null when the report prints a band, a range or a word.",
    "Units differ by report (dollars, $'000, $ million); the unit field says which, and figures in different units must not be compared without it.",
    "Reports define staff, executives and remuneration differently (headcount or FTE, at 30 June or over the year, packages or salary), so figures are not comparable across agencies or jurisdictions without reading each label.",
    "A metric in not_found was looked for and not found in that document; it may be published elsewhere (for example a separate financial statements file or website table).",
    "Commonwealth bodies on the Transparency Portal keep their pay, staffing and finance figures in the annual_reports dataset; their PDFs here are linked to it and carry operational figures only.",
    "A figure with an extraction field comes from a scan with no text layer: it was read by on-device OCR (Apple Vision, with a local vision model as a second reader) and checked against the page image; its quote is the OCR text.",
    "Integrity commission annual reports here carry their operational counts, staffing and finance figures. Findings and recommendations are in the integrity reports dataset, quoted there; nothing here is an allegation or a finding about any person.",
]


def atomic(path: Path, obj) -> tuple[str, int]:
    data = (json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)
    return hashlib.sha256(data).hexdigest(), len(data)


def has_text(row) -> bool:
    path = ar.CACHE / "text" / (row["sha256"] + ".json")
    if not path.exists():
        return True  # unknown here; the intake records scanned files in file_note
    return any(p.strip() for p in json.loads(path.read_text()))


def page_link(url: str, page: int) -> str:
    return url if "#" in url else f"{url}#page={page}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--skip-verify", action="store_true", help="export without re-checking quotes against the page text cache")
    args = ap.parse_args(argv)

    intakes = sorted(ar.DATA.glob("intake-*.json"))
    if not intakes:
        print("no intake files", file=sys.stderr)
        return 1
    snapshot = max(json.loads(f.read_text())["as_of"] for f in intakes)
    rows = ar.intake_rows()

    docs, facts_by_jur, errors = [], defaultdict(list), 0
    for rid, row in rows.items():
        jur = JUR[row["jurisdiction"]]
        doc = ar.load_facts(rid)
        facts = (doc or {}).get("facts", [])
        if facts and not args.skip_verify:
            pages = ar.page_text(row)
            for i, f in enumerate(facts):
                errs = ar.check_fact(f, pages, row)
                if errs:
                    errors += 1
                    print(f"{rid} fact {i}: " + "; ".join(errs), file=sys.stderr)
        if doc is not None:
            status = "read"
        elif not has_text(row):
            status = "not_read_no_text"
        else:
            status = "not_read"
        companions = sorted(r["report_id"] for r in rows.values() if r.get("companion_of") == rid)
        docs.append({
            "id": rid, "jurisdiction": jur, "agency": row["agency"], "reporting_year": row["reporting_year"],
            "kind": row["document_kind"], "edition": row["edition"],
            **({"edition_note": row["edition_note"]} if row.get("edition_note") else {}),
            "source_url": row["source_url"], "catalogue_url": row.get("catalogue_url"),
            "pages": row["pages"], "sha256": row["sha256"], "bytes": row["bytes"], "acquisition": row.get("acquisition"),
            **({"text_source": "ocr"} if any(f.get("extraction") for f in facts) else {}),
            "status": status, "facts": len(facts), "not_found": sorted((doc or {}).get("not_found", [])),
            **({"companion_of": row["companion_of"]} if row.get("companion_of") else {}),
            **({"companions": companions} if companions else {}),
            **({"integrity_body": row["integrity_body"]} if row.get("integrity_body") else {}),
            **({"integrity_record": row["integrity_record"]} if row.get("integrity_record") else {}),
            **({"portal_body_id": row["portal_body_id"]} if row.get("portal_body_id") else {}),
            **{k: row[k] for k in ("tabled", "corrigendum_url", "file_note", "rights_note", "reuse_terms_url", "attribution") if row.get(k)},
            "facts_file": f"/agency-reports/facts-{jur.lower()}.json" if facts else None,
        })
        for i, f in enumerate(facts):
            facts_by_jur[jur].append({
                "id": f"{rid}#{i + 1}", "report_id": rid, "agency": row["agency"], "reporting_year": row["reporting_year"],
                "edition": docs[-1]["edition"], "metric": f["metric"], "label": f["label_as_published"],
                "column": f.get("column_as_published"), "value": f.get("value"), "value_as_published": f["value_as_published"],
                "unit": f["unit"], "period": f.get("period"), "page": f["page"], "quote": f["quote"],
                **{k: f[k] for k in EXTRA if f.get(k)},
                "source_url": page_link(row["source_url"], f["page"]),
            })
    if errors:
        print(f"{errors} figures failed their check; nothing written", file=sys.stderr)
        return 1

    docs.sort(key=lambda d: (ORDER.index(d["jurisdiction"]), d["agency"], d["reporting_year"], d["kind"]))
    by_jur = {j: {"documents": sum(d["jurisdiction"] == j for d in docs),
                  "agencies": len({d["agency"] for d in docs if d["jurisdiction"] == j}),
                  "facts": len(facts_by_jur.get(j, []))} for j in ORDER if any(d["jurisdiction"] == j for d in docs)}
    metric_counts = Counter(f["metric"] for fs in facts_by_jur.values() for f in fs)
    meta = {
        "snapshot_at": snapshot, "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "counts": {"documents": len(docs), "documents_read": sum(d["status"] == "read" for d in docs),
                   "agencies": len({(d["jurisdiction"], d["agency"]) for d in docs}),
                   "facts": sum(len(v) for v in facts_by_jur.values()), "by_jurisdiction": by_jur, "by_metric": dict(sorted(metric_counts.items()))},
        "metrics": ar.METRICS, "units": sorted(ar.UNITS), "caveats": CAVEATS,
        "source": "Publisher PDFs of agency annual reports, downloaded by the OPAX maintainer and checked by SHA-256; every figure cites its PDF page.",
    }
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    files = {}
    for jur, fs in sorted(facts_by_jur.items(), key=lambda kv: ORDER.index(kv[0])):
        name = f"facts-{jur.lower()}.json"
        sha, size = atomic(out / name, {"schema": SCHEMA, "jurisdiction": jur, "snapshot_at": snapshot, "facts": fs})
        files[name] = {"sha256": sha, "bytes": size, "facts": len(fs)}
    for stale in out.glob("facts-*.json"):
        if stale.name not in files:
            stale.unlink()
    sha, size = atomic(out / "index.json", {"schema": SCHEMA, "meta": meta, "documents": docs})
    files["index.json"] = {"sha256": sha, "bytes": size}
    atomic(out / "manifest.json", {"schema": SCHEMA, "built_at": meta["built_at"], "snapshot_at": snapshot, "counts": meta["counts"], "files": files})
    print(json.dumps({"documents": len(docs), "facts": meta["counts"]["facts"], "by_jurisdiction": by_jur}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
