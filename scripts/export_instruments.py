#!/usr/bin/env python3
"""Bounded FRL metadata catalogue. No source requests, DB or KB access."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import json
import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest.frl_instruments import Held, ID, LICENCE, SCOPE, guard_count, local_path, validate_title

MAX_FILES, MAX_BYTES, CHUNK_ROWS = 400, 25_000_000, 512
SOURCE = "Source: Federal Register of Legislation (legislation.gov.au), CC BY 4.0"


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def instrument_type(row):
    principal = row.get("isPrincipal")
    return " · ".join(filter(None, [row.get("subCollection"),
                                   "Principal" if principal is True else "Amending" if principal is False else None])) or "Not supplied"


def packer(rows):
    """Shared object-field dictionary removes repeated keys, preserving values.

    Original arrays stay arrays; original objects become {o: schema, v: values}.
    Repeated strings use {s: index}, preserving source text without duplication.
    Decode with portal/public/instruments.js. No compression dependency needed.
    """
    schemas, by_fields, counts = [], {}, Counter()
    def count_strings(value):
        if isinstance(value, dict):
            for v in value.values(): count_strings(v)
        elif isinstance(value, list):
            for v in value: count_strings(v)
        elif isinstance(value, str): counts[value] += 1
    for row in rows: count_strings(row)
    # Conservative threshold covers a six-digit reference plus table overhead.
    strings = sorted(v for v, n in counts.items() if n > 1 and (n - 1) * len(encoded(v)) > n * 14 + 1)
    by_string = {v: i for i, v in enumerate(strings)}

    def pack(value):
        if isinstance(value, dict):
            fields = tuple(sorted(value))
            if fields not in by_fields:
                by_fields[fields] = len(schemas); schemas.append(list(fields))
            return {"o": by_fields[fields], "v": [pack(value[k]) for k in fields]}
        if isinstance(value, list): return [pack(v) for v in value]
        if isinstance(value, str) and value in by_string: return {"s": by_string[value]}
        return value
    return schemas, strings, pack


def plan_export(snapshot):
    rows = snapshot["titles"]
    guard_count(len({r["id"] for r in rows}), snapshot["odata_count"])
    if snapshot.get("scope") != SCOPE or not snapshot.get("metadata_only"):
        raise Held("Only reconciled in-force metadata snapshots may be exported")
    if len(rows) != snapshot["count"]: raise Held("Duplicate or mismatched staged rows")
    coverage = snapshot.get("metadata_coverage", {})
    if coverage.get("expanded_titles") != len(rows) or coverage.get("missing_expansion_ids") != []:
        raise Held("Incomplete expanded metadata: every title must have source-returned relationships")
    for row in rows:
        validate_title(row)
        if not all(isinstance(row.get(k), list) for k in ("versions", "administeringDepartments")):
            raise Held("Incomplete expanded metadata fields")
        if "_opax_metadata" in row:
            raise Held("Legacy incomplete metadata must be reacquired")
    generated = snapshot.get("downloaded_at") or snapshot["generated_at"]
    date = datetime.fromisoformat(generated.replace("Z", "+00:00")).strftime("%-d %B %Y")
    attribution = {
        "source": SOURCE, "source_url": "https://www.legislation.gov.au/",
        "licence_url": LICENCE,
        "dated": f"Based on content from the Federal Register of Legislation at {date}. For the latest information on Australian Government legislation please go to https://www.legislation.gov.au.",
        "changes": "Metadata arranged into a catalogue; bounded version metadata selected. Titles reproduced verbatim. OPAX shows metadata only.",
        "exceptions": "Commonwealth Coat of Arms and content marked as third party are excluded from the CC BY 4.0 licence.",
        "endorsement": "No endorsement by the Federal Register of Legislation is implied.",
    }
    groups = defaultdict(list)
    for r in rows:
        if not ID.fullmatch(r["id"]): raise Held("Invalid FRL identifier")
        year = (r.get("makingDate") or "")[:4]
        if not re.fullmatch(r"\d{4}", year): year = "unknown"
        groups[year].append(r)
    records = {r["id"]: {"source": dict(r), "opax": {
        "canonical_url": f"https://www.legislation.gov.au/{r['id']}/latest"
    }} for r in rows}
    schemas, strings, pack = packer(list(records.values()))
    chunks, lookup, catalogue, payloads = [], {}, [], {}
    portfolios, types, statuses, commencement_years = set(), set(), set(), set()
    for year, items in sorted(groups.items()):
        for offset in range(0, len(items), CHUNK_ROWS):
            batch = items[offset:offset + CHUNK_ROWS]
            filename = f"catalogue-{year}-{offset // CHUNK_ROWS + 1}.json"
            chunk_index = len(chunks)
            projected = []
            for r in batch:
                # Version start/status start are not an instrument's commencement.
                commenced = r.get("commencementDate")
                portfolio = sorted({d["portfolio"] for d in r.get("administeringDepartments", []) if d.get("portfolio")})
                kind, status = instrument_type(r), r.get("status") or "Not supplied"
                catalogue.append([r["id"], r["name"], portfolio, kind, commenced, status, chunk_index])
                lookup[r["id"]] = chunk_index
                portfolios.update(portfolio); types.add(kind); statuses.add(status)
                commencement_years.add(commenced[:4] if commenced else "unknown")
                projected.append(pack(records[r["id"]]))
            body = encoded({"records": projected})
            payloads[filename] = body
            chunks.append({"path": "/instruments/" + filename, "year": year, "count": len(batch), "bytes": len(body)})
    catalogue.sort(key=lambda r: (r[1].casefold(), r[0]))
    payloads["index.json"] = encoded({"fields": ["id", "title", "portfolios", "type", "commenced", "status", "chunk"], "records": catalogue})
    manifest = {"schema": 1, "complete": True, "generated_at": generated, "downloaded_at": generated, "count": len(rows),
                "odata_count": snapshot["odata_count"], "scope": SCOPE, "metadata_only": True,
                "index_url": "/instruments/index.json", "attribution": attribution,
                "schemas": schemas, "strings": strings, "lookup": lookup, "chunks": chunks,
                "facets": {"portfolio": sorted(portfolios), "type": sorted(types),
                           "status": sorted(statuses), "commencement_year": sorted(commencement_years)},
                "metadata_coverage": snapshot.get("metadata_coverage", {}),
                "version_scope": snapshot.get("version_scope", "Source-returned version metadata"),
                "version_coverage": {"titles_with_latest": sum(any(v.get("isLatest") for v in r.get("versions", [])) for r in rows),
                                     "titles_with_current": sum(any(v.get("isCurrent") for v in r.get("versions", [])) for r in rows)},
                "limitations": ["InForce includes legislation made but not yet commenced.",
                                 "The titles/version API does not supply a whole-instrument commencement date; missing dates stay unknown.",
                                 "Unbounded/bulk filtered version expansions timed out; combined latest/current filtering and combined relationship expansion failed source probes. No relationships inferred.",
                                 "Plain and expanded pages are independently matched by id. Any omitted title or expansion field holds publication; explicit source-returned empty arrays are retained.",
                                 "No document bodies, model summaries, person entities or identity joins.",
                                 "One API-returned version per title is acquired. It is not necessarily current/latest; use the authoritative FRL latest link where a latest version was not returned. Full history is phase 2."]}
    payloads["manifest.json"] = encoded(manifest)
    check_budget(payloads)
    return payloads, manifest


def check_budget(payloads):
    size = sum(len(v) for v in payloads.values())
    if len(payloads) > MAX_FILES or size > MAX_BYTES:
        raise Held(f"Asset budget exceeded: {len(payloads)} files, {size} bytes")
    return len(payloads), size


def export(snapshot_path, out):
    snapshot_path, out = local_path(snapshot_path), local_path(out)
    snapshot = json.loads(snapshot_path.read_text())
    previous = json.loads((out / "manifest.json").read_text())["count"] if (out / "manifest.json").exists() else 0
    guard_count(snapshot["count"], snapshot["odata_count"], previous)
    payloads, manifest = plan_export(snapshot)
    # Validate the complete plan and budget before touching the last good export.
    out.mkdir(parents=True, exist_ok=True)
    for name, body in payloads.items():
        path = out / name
        if path.exists() and path.read_bytes() == body: continue
        tmp = out / (name + ".tmp"); tmp.write_bytes(body); tmp.replace(path)
    for p in out.glob("*.json"):
        if p.name not in payloads: p.unlink()
    files, size = check_budget(payloads)
    print(json.dumps({"rows": manifest["count"], "files": files, "bytes": size}))
    return manifest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--snapshot", default=str(ROOT / "scripts/state/frl/snapshot.json"))
    p.add_argument("--out", default=str(ROOT / "portal/public/instruments"))
    args = p.parse_args()
    try: export(args.snapshot, args.out); return 0
    except (Held, OSError, ValueError, KeyError) as e:
        print(f"FRL EXPORT HELD: {e}", file=sys.stderr); return 3


if __name__ == "__main__": sys.exit(main())
