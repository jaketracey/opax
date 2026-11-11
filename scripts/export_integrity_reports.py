#!/usr/bin/env python3
"""Public projection of the integrity commission report snapshots (no source requests).

Reads ``<cache>/snapshots/<body>.json`` (written by ``parli.ingest.integrity.run``; any
body whose snapshot follows ``common.SCHEMA`` is included, so another adapter only has to
write its snapshot) and writes ``portal/public/integrity-reports/``:

  index.json            bodies (coverage, licence, gaps, counts) and one summary row per
                        report or statement, newest first
  reports-<body>.json   full records for one body: subjects, findings and opinions in the
                        report's own words and labels, numbered recommendations, agency
                        responses and implementation documents, each with its citation
  manifest.json         counts, snapshot dates and file hashes

Bodies with an adapter but no snapshot (a host that refuses the identifying agent) are
listed with status "gap" and their documented reasons. Exit 3 keeps the last good export
when a body's record count would fall more than 10% against the published file.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib
import json
import re
import os
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest.integrity import common  # noqa: E402
from parli.ingest.integrity.run import ADAPTERS  # noqa: E402
from parli.ingest.integrity import transcripts as tx  # noqa: E402

OUT = ROOT / "portal" / "public" / "integrity-reports"
SCHEMA = 1
JURISDICTION_ORDER = ["Cth", "NSW", "Vic", "Qld", "WA", "SA", "Tas", "ACT", "NT"]
CAVEATS = [
    "Each record is what the commission published. Findings, opinions and statements are quoted in the report's own words and carry the report's own label; OPAX does not summarise, grade or reword them.",
    "Allegations are not findings. A commission's finding or opinion of corrupt conduct or misconduct is not a finding that a person is guilty of a criminal offence, and the commissions say so in their reports.",
    "Commissions use different statutory terms (for example serious corrupt conduct in New South Wales, serious misconduct opinions in Western Australia). Do not compare counts across commissions as if the terms were the same.",
    "A list marked not_extracted is unknown, not empty: the report may contain findings or recommendations that OPAX could not extract reliably (scanned pages, unusual layouts). stated_none means the report itself says there are none.",
    "Bodies and public roles named in a report are recorded as the report names them. OPAX adds no names and does not create pages for private individuals.",
    "Responses and implementation status appear only where the commission publishes them; their absence does not mean an agency did not respond.",
]


TRANSCRIPT_CAVEATS = [
    "Hearing transcript: evidence, not findings. What a witness, counsel or a commissioner says in a hearing is evidence, submission or questioning; a finding is only what a commission's report states.",
    "Transcripts are listed as the publisher released them, with its redactions, page numbers and any publication orders noted for them. OPAX links the publisher's copy and does not republish the text.",
    "Titles are neutral (case, document type and date). Witnesses are not recorded as fields.",
]
TRANSCRIPT_BODIES = {"nsw_lecc": {"name": "Law Enforcement Conduct Commission", "short": "NSW LECC", "jurisdiction": "NSW",
                                  "site": "https://www.lecc.nsw.gov.au/"}}


def case_key(text):
    """Operation Belcarra: Reforming ... -> belcarra; Taskforce Flaxton -> flaxton; otherwise the folded name."""
    m = re.search(r"\b(?:operation|taskforce)\s+([a-z]+)", str(text or ""), re.I)
    return m.group(1).lower() if m else re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def export_transcripts(out: Path, bodies_by_code: dict, records_by_body: dict, files: dict):
    """transcripts-<body>.json per body, and a summary on each report record whose operation the transcripts share."""
    reg = tx.load()
    groups = {}
    for t in reg["transcripts"]:
        groups.setdefault(t["body"], []).append(t)
    summary = {"label": tx.LABEL, "caveats": TRANSCRIPT_CAVEATS, "intake": reg.get("intake"), "built_at": reg.get("built_at"),
               "counts": {}, "files": {}, "bodies": {}, "gaps": reg.get("gaps", [])}
    for code, items in sorted(groups.items()):
        # the publisher's link label can name a witness: it stays in the registry for provenance, out of the public file
        items = sorted(({k: v for k, v in t.items() if k != "title_as_listed"} for t in items),
                       key=lambda t: (t["hearing_date"], t.get("transcript_pages", ""), t["title"]), reverse=True)
        records = records_by_body.get(code, [])
        cases = []
        for case in sorted({t["case"] for t in items}):
            mine = [t for t in items if t["case"] == case]
            reports = [r["id"] for r in records if r.get("operation") and case_key(r["operation"]) == case_key(case)]
            dates = sorted(t["hearing_date"] for t in mine)
            cases.append({"case": case, "count": len(mine), "first_date": dates[0], "last_date": dates[-1],
                          "pages": sum(t["pages"] for t in mine), "report_ids": reports})
            for r in records:
                if r["id"] in reports:
                    r["transcripts"] = {"label": tx.LABEL, "case": case, "count": len(mine), "first_date": dates[0],
                                        "last_date": dates[-1], "file": f"/integrity-reports/transcripts-{code.replace('_', '-')}.json"}
        view_only = [v for v in reg.get("publisher_view_only", []) if v["body"] == code]
        body = bodies_by_code.get(code) or TRANSCRIPT_BODIES[code]
        name = f"transcripts-{code.replace('_', '-')}.json"
        sha, size = atomic(out / name, {"schema": SCHEMA, "body": code, "name": body["name"], "short": body["short"],
                                        "jurisdiction": body["jurisdiction"], "label": tx.LABEL, "caveats": TRANSCRIPT_CAVEATS,
                                        "snapshot_at": reg.get("built_at"), "cases": cases, "transcripts": items,
                                        "publisher_view_only": view_only})
        files[name] = {"sha256": sha, "bytes": size}
        summary["counts"][code] = len(items)
        summary["files"][code] = "/integrity-reports/" + name
        summary["bodies"][code] = {"name": body["name"], "short": body["short"], "jurisdiction": body["jurisdiction"],
                                   "cases": len(cases), "view_only": len(view_only)}
    summary["total"] = sum(summary["counts"].values())
    return summary


class Held(SystemExit):
    def __init__(self, reason):
        print(f"[export_integrity_reports] HELD: {reason}; last good export kept", flush=True)
        super().__init__(3)


def atomic(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return hashlib.sha256(data).hexdigest(), len(data)


def adapter_bodies():
    out = {}
    for code in ADAPTERS:
        try:
            module = importlib.import_module(f"parli.ingest.integrity.{code}")
        except ModuleNotFoundError:
            continue
        out[code] = (module.BODY, list(getattr(module, "GAPS", [])))
    return out


def summary(r):
    kinds = Counter(f["kind"] for f in r["findings"])
    return {
        "id": r["id"], "body": r["body"], "jurisdiction": r["jurisdiction"], "title": r["title"],
        "operation": r["operation"], "report_type": r["report_type"], "type_as_published": r["type_as_published"],
        "date": r["date"], "date_basis": r["date_basis"], "page_url": r["page_url"], "pdf_url": r["pdf_url"],
        "subjects": [{"name": s["name"], "kind": s["kind"]} for s in r["subjects"]],
        "counts": {"findings": len(r["findings"]), "recommendations": len(r["recommendations"]),
                   "responses": len(r["responses"])},
        "finding_kinds": dict(sorted(kinds.items())),
        "findings_status": r["findings_status"], "recommendations_status": r["recommendations_status"],
        "responses_status": r["responses_status"],
        **({"acquisition": r["acquisition"]} if r.get("acquisition") else {}),
        **({"period": r["period"]} if r.get("period") else {}),
    }


LIGATURES = {"\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl", "\ufb05": "st", "\ufb06": "st"}


def tidy(text):
    """Typographic ligatures become their letters and symbol-font bullets (private use area
    code points from PDF text layers) become a plain bullet, so search and display work.
    The wording is unchanged."""
    if not isinstance(text, str):
        return text
    out = "".join(LIGATURES.get(ch, "\u2022" if "\ue000" <= ch <= "\uf8ff" else ch) for ch in text)
    return re.sub(r"[ \t]{2,}", " ", out)


def tidy_record(r):
    r = dict(r)
    for key in ("title", "summary", "operation"):
        r[key] = tidy(r.get(key))
    for part in ("findings", "recommendations", "responses", "subjects", "documents"):
        r[part] = [{k: tidy(v) if k in ("text", "label", "title", "name") else v for k, v in x.items()} for x in r.get(part) or []]
    return r


def check_record(r):
    """The public projection only carries records that still meet the schema."""
    for key in ("id", "body", "title", "page_url", "report_type", "findings", "recommendations", "responses"):
        if key not in r:
            raise Held(f"record {r.get('id')} lacks {key}")
    if r["report_type"] not in common.REPORT_TYPES:
        raise Held(f"record {r['id']} has report_type {r['report_type']}")
    for item in r["findings"] + r["recommendations"]:
        c = item.get("cite") or {}
        if not str(c.get("url", "")).startswith("https://") or not c.get("document"):
            raise Held(f"record {r['id']} has an item without a citation")
        if not item.get("text"):
            raise Held(f"record {r['id']} has an item without text")
    for f in r["findings"]:
        if f["kind"] not in common.FINDING_KINDS or not f.get("label"):
            raise Held(f"record {r['id']} has an unlabelled finding")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshots", default=str(common.CACHE / "snapshots"))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--allow-shrink", action="store_true")
    args = ap.parse_args(argv)
    snap_dir, out = Path(args.snapshots), Path(args.out)

    adapters = adapter_bodies()
    snapshots = {}
    for path in sorted(snap_dir.glob("*.json")):
        snap = json.loads(path.read_text())
        if snap.get("schema") != common.SCHEMA:
            raise Held(f"{path.name} has schema {snap.get('schema')}, expected {common.SCHEMA}")
        snapshots[snap["body"]] = snap
    if not snapshots:
        raise Held("no snapshots")

    old_manifest = {}
    if (out / "manifest.json").exists():
        old_manifest = json.loads((out / "manifest.json").read_text())

    bodies, rows, files, totals = [], [], {}, Counter()
    loaded = {}
    codes = sorted(set(snapshots) | set(adapters),
                   key=lambda c: (JURISDICTION_ORDER.index((snapshots.get(c) or {}).get("jurisdiction") or adapters[c][0].jurisdiction), c))
    for code in codes:
        snap = snapshots.get(code)
        if snap is None:
            continue
        records = [tidy_record(r) for r in snap["records"]]
        for r in records:
            check_record(r)
        loaded[code] = (snap, records)
    transcripts = export_transcripts(out, {c: {"name": s["name"], "short": s["short"], "jurisdiction": s["jurisdiction"]} for c, (s, _) in loaded.items()},
                                     {c: recs for c, (_, recs) in loaded.items()}, files)
    for code in codes:
        snap = snapshots.get(code)
        if snap is None:
            body, gaps = adapters[code]
            bodies.append({"code": code, "name": body.name, "short": body.short, "jurisdiction": body.jurisdiction,
                           "site": body.site, "status": "gap", "gaps": gaps, "licence": body.licence,
                           "counts": {"records": 0, "findings": 0, "recommendations": 0, "responses": 0},
                           "snapshot_at": None, "file": None})
            continue
        records = loaded[code][1]
        prev = ((old_manifest.get("bodies") or {}).get(code) or {}).get("records")
        if prev and len(records) < prev * 0.9 and not args.allow_shrink:
            raise Held(f"{code} records would fall from {prev} to {len(records)}")
        dated = sorted(r["date"] for r in records if r["date"])
        by_type = Counter(r["report_type"] for r in records)
        kinds = Counter(f["kind"] for r in records for f in r["findings"])
        status = {k: dict(Counter(r[k] for r in records)) for k in ("findings_status", "recommendations_status", "responses_status")}
        counts = {"records": len(records), "findings": sum(len(r["findings"]) for r in records),
                  "recommendations": sum(len(r["recommendations"]) for r in records),
                  "responses": sum(len(r["responses"]) for r in records),
                  "by_type": dict(sorted(by_type.items())), "finding_kinds": dict(sorted(kinds.items())),
                  "status": status,
                  "with_findings": sum(1 for r in records if r["findings"]),
                  "with_recommendations": sum(1 for r in records if r["recommendations"]),
                  "with_responses": sum(1 for r in records if r["responses"])}
        name = f"reports-{code.replace('_', '-')}.json"
        sha, size = atomic(out / name, {"schema": SCHEMA, "body": code, "name": snap["name"], "short": snap["short"],
                                        "jurisdiction": snap["jurisdiction"], "licence": snap["licence"],
                                        "snapshot_at": snap["built_at"], "records": records})
        files[name] = {"sha256": sha, "bytes": size}
        gaps = list(snap.get("gaps") or [])
        bodies.append({"code": code, "name": snap["name"], "short": snap["short"], "jurisdiction": snap["jurisdiction"],
                       "site": snap["site"], "status": "loaded", "gaps": gaps, "licence": snap["licence"],
                       "counts": counts, "earliest": dated[0] if dated else None, "latest": dated[-1] if dated else None,
                       "snapshot_at": snap["built_at"], "file": "/integrity-reports/" + name})
        rows += [summary(r) for r in records]
        for k in ("records", "findings", "recommendations", "responses"):
            totals[k] += counts[k]

    rows.sort(key=lambda r: (r["date"] or (r.get("period") or {}).get("value") or "", r["id"]), reverse=True)
    ids = [r["id"] for r in rows]
    if len(ids) != len(set(ids)):
        raise Held("duplicate record ids across bodies")
    meta = {"schema": SCHEMA, "built_at": common.now(), "caveats": CAVEATS,
            "counts": {**totals, "bodies_loaded": sum(1 for b in bodies if b["status"] == "loaded"),
                       "bodies_gap": sum(1 for b in bodies if b["status"] == "gap")},
            "report_types": list(common.REPORT_TYPES), "finding_kinds": list(common.FINDING_KINDS),
            "snapshot_at": max(b["snapshot_at"] for b in bodies if b["snapshot_at"])}
    sha, size = atomic(out / "index.json", {"meta": meta, "bodies": bodies, "reports": rows, "transcripts": transcripts})
    files["index.json"] = {"sha256": sha, "bytes": size}
    for stale in [*out.glob("reports-*.json"), *out.glob("transcripts-*.json")]:
        if stale.name not in files:
            stale.unlink()
    atomic(out / "manifest.json", {"schema": SCHEMA, "built_at": meta["built_at"], "counts": meta["counts"],
                                   "bodies": {b["code"]: {"status": b["status"], **{k: b["counts"][k] for k in ("records", "findings", "recommendations", "responses")}} for b in bodies},
                                   "transcripts": transcripts["counts"], "files": files})
    print(f"[export_integrity_reports] {json.dumps(meta['counts'])}", flush=True)


if __name__ == "__main__":
    main()
