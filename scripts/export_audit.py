#!/usr/bin/env python3
"""Bounded QAO catalogue from a reconciled worktree snapshot; no source requests."""
from collections import defaultdict
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest.qao_reports import Held, ID, INDEX, LICENCE, COPYRIGHT, SAFE_MARKUP, guard_count, local_path, public_body, source_url

MAX_FILES, MAX_BYTES, CHUNK_ROWS = 40, 10_000_000, 100
SOURCE = "Source: Queensland Audit Office, CC BY 4.0"


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def check_budget(payloads):
    size = sum(len(value) for value in payloads.values())
    if len(payloads) > MAX_FILES or size > MAX_BYTES:
        raise Held(f"Audit asset budget exceeded: {len(payloads)} files, {size} bytes")
    return len(payloads), size


def validate_record(row):
    if not ID.fullmatch(row["id"]) or not row["title"] or row["id"] != f"qao-{row['year']}-{row['number']}":
        raise Held("Invalid report identity")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["tabled_date"]): raise Held("Missing tabled date")
    if not source_url(row["canonical_url"]).startswith("https://www.qao.qld.gov.au/reports-resources/"): raise Held("Missing authoritative report URL")
    if row.get("pdf_url"): source_url(row["pdf_url"])
    licence = row["licence"]
    if licence.get("checked") is not True or licence.get("licence_url") != LICENCE:
        raise Held("Per-report licence review missing")
    if licence.get("status") not in ("exception", "cc-by-4.0"):
        raise Held("Unknown report licence status")
    if licence["status"] == "exception" and (not licence.get("body_skipped") or row["recommendations"] or row["entities"]):
        raise Held("Excepted report body must be skipped")
    if any(not public_body(entity) for entity in row["entities"]): raise Held("Non-public audited entity")
    for rec in row["recommendations"]:
        if (rec["number"] is not None and (type(rec["number"]) is not int or rec["number"] < 1)) or not rec["text"] or rec.get("source_text") != "QAO's text":
            raise Held("Incomplete source recommendation")
        # Only text and the narrow formatting subset produced by the loader.
        markup = SAFE_MARKUP.sub("", rec.get("html", ""))
        if "<" in markup or ">" in markup: raise Held("Unsafe recommendation markup")


def plan_export(snapshot, agencies=()):
    rows = snapshot["reports"]
    guard_count(len(rows), snapshot["listed"])
    if snapshot.get("complete") is not True or snapshot["count"] != len(rows) or len({r["id"] for r in rows}) != len(rows):
        raise Held("Unreconciled audit snapshot")
    for row in rows: validate_record(row)
    names = defaultdict(list)
    for agency in agencies:
        # Commonwealth and Queensland departments can have identical names.
        # Exact spelling never overrides the registry's source jurisdiction.
        if agency.get("jurisdiction") == "qld" and agency.get("id") and agency.get("name"):
            names[agency["name"]].append(agency["id"])
    payloads, chunks, lookup, catalogue = {}, [], {}, []
    # Exact source strings only. Ambiguous exact names remain plain text.
    records = [{**row, "entity_links": {name: "/subject/agency/" + str(names[name][0])
                for name in row["entities"] if len(names[name]) == 1}} for row in sorted(rows, key=lambda r: r["id"])]
    for offset in range(0, len(records), CHUNK_ROWS):
        batch = records[offset:offset + CHUNK_ROWS]
        filename = f"reports-{1 + offset // CHUNK_ROWS}.json"
        chunk = len(chunks)
        for row in batch:
            lookup[row["id"]] = chunk
            catalogue.append({k: row[k] for k in ("id", "number", "year", "report_label", "title", "tabled_date", "sectors", "entities", "canonical_url")})
        body = encoded({"records": batch}); payloads[filename] = body
        chunks.append({"path": "/audit/" + filename, "count": len(batch), "bytes": len(body)})
    catalogue.sort(key=lambda r: (r["tabled_date"], r["number"], r["id"]), reverse=True)
    payloads["index.json"] = encoded({"records": catalogue})
    manifest = {"schema": 1, "complete": True, "phase": 1, "count": len(rows), "listed": snapshot["listed"],
                "generated_at": snapshot["generated_at"], "index_url": "/audit/index.json", "lookup": lookup, "chunks": chunks,
                "recommendations": sum(len(r["recommendations"]) for r in rows),
                "licence_exceptions": [r["id"] for r in rows if r["licence"]["body_skipped"]],
                "facets": {"year": sorted({r["year"] for r in rows}, reverse=True),
                           "sector": sorted({s for r in rows for s in r["sectors"]}),
                           "entity": sorted({e for r in rows for e in r["entities"]})},
                "attribution": {"source": SOURCE, "source_url": INDEX, "licence_url": LICENCE, "copyright_url": COPYRIGHT,
                    "copyright_notice": snapshot["policy"]["copyright_notice"], "owner": "State of Queensland (Queensland Audit Office)",
                    "changes": "Report metadata arranged into a catalogue. Recommendations reproduce QAO's words with HTML formatting simplified; no model summaries. Responses and PDF bodies are excluded.",
                    "exceptions": "Report pages checked individually. Recommendations and body-derived entities are withheld for licence exceptions. Images, logos and multimedia are excluded.",
                    "endorsement": "No endorsement by the State of Queensland or Queensland Audit Office is implied."},
                "limitations": ["Index + HTML recommendations only; PDF bodies and entity responses are phase 2.",
                    "Audited public bodies are included only where the HTML explicitly identifies audit scope; missing names stay unknown.",
                    "Generic recommendation addressees remain source text, not audited entities. No person entities or joins."]}
    payloads["manifest.json"] = encoded(manifest)
    payloads["ready.json"] = encoded({"complete": True, "count": manifest["count"], "listed": manifest["listed"], "export_date": manifest["generated_at"][:10]})
    check_budget(payloads)
    return payloads, manifest


def export(snapshot_path, out):
    snapshot_path, out = local_path(snapshot_path), local_path(out)
    snapshot = json.loads(snapshot_path.read_text())
    old = json.loads((out / "manifest.json").read_text()) if (out / "manifest.json").exists() else {}
    guard_count(snapshot["count"], snapshot["listed"], old.get("count", 0))
    agency_index = json.loads((ROOT / "portal/public/agencies.json").read_text())
    jurisdiction = {"Commonwealth": "federal", "Queensland": "qld"}.get(agency_index.get("meta", {}).get("scope"))
    agencies = [{**a, "jurisdiction": a.get("jurisdiction", jurisdiction)} for a in agency_index["agencies"]]
    payloads, manifest = plan_export(snapshot, agencies)
    out.mkdir(parents=True, exist_ok=True)
    for name, body in payloads.items():
        path = out / name
        if path.exists() and path.read_bytes() == body: continue
        tmp = out / (name + ".tmp"); tmp.write_bytes(body); tmp.replace(path)
    for path in out.glob("*.json"):
        if path.name not in payloads: path.unlink()
    files, size = check_budget(payloads)
    print(json.dumps({"reports": manifest["count"], "recommendations": manifest["recommendations"], "files": files, "bytes": size}))
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", default=str(ROOT / "scripts/state/qao/snapshot.json"))
    parser.add_argument("--out", default=str(ROOT / "portal/public/audit"))
    args = parser.parse_args()
    try: export(args.snapshot, args.out)
    except (Held, OSError, ValueError, KeyError) as error:
        print(f"QAO EXPORT HELD: {error}", file=sys.stderr); sys.exit(3)
