#!/usr/bin/env python3
"""Public projection of the royal commissions snapshot (no source requests).

Reads ``<cache>/snapshot.json`` (written by ``parli.ingest.royal_commissions build``) and
writes ``portal/public/royal-commissions/``:

  index.json              commissions (jurisdiction, letters patent date, commissioners,
                          report dates, counts, status source) and the dataset's gaps
  commission-<id>.json    one commission in full: its reports and files, numbered
                          recommendations in the report's own words with page citations,
                          official status where a government tracker publishes it, and
                          the government responses and implementation reports
  manifest.json           counts, snapshot dates and file hashes

Exit 3 keeps the last good export when a guard fails (a record without a citation, or a
recommendation count falling more than 10% against the published files).
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest import royal_commissions as rc  # noqa: E402

OUT = ROOT / "portal" / "public" / "royal-commissions"
SCHEMA = 1
JURISDICTION_ORDER = ["Cth", "NSW", "Vic", "Qld", "WA", "SA", "Tas", "ACT", "NT"]
CAVEATS = [
    "Recommendations are the commission's own words, cut at the report's own numbered headings, with the PDF and page each was read from.",
    "A commission's findings and recommendations are not findings of criminal or civil liability.",
    "Status appears only where a government publishes an official status for that recommendation, in the government's own words. Where none is published the status is unknown, not unimplemented.",
    "A government response or implementation report is listed as a document; OPAX does not grade whether a recommendation was accepted or implemented.",
    "Commissions listed with recommendations not_extracted may still have made recommendations; OPAX could not read them reliably from an official copy it can reach.",
    "Hearing transcripts are evidence given to a commission, not its findings. OPAX lists them as documents; where the publisher licenses them under CC BY 4.0 (Robodebt, Antisemitism and Social Cohesion, NSW Healthcare Funding) their text is searchable under /transcripts/, except that a transcript recording a non-publication order or a pseudonymous witness is pointed to by page and not quoted.",
    "Where a court has ruled on parts of a report, the ruling is recorded in court_context exactly as the cited official page states it, and travels with the report.",
    "Documents marked as a manual publisher download were supplied by the OPAX maintainer from the publisher's own site, where that host refuses OPAX's automated agent. Each is cited to the publisher's URL and checked against its recorded SHA-256.",
    "Boards and commissions of inquiry are listed with royal commissions as comparable public inquiries; inquiry_type gives each body's actual type.",
]


class Held(SystemExit):
    def __init__(self, reason):
        print(f"[export_royal_commissions] HELD: {reason}; last good export kept", flush=True)
        super().__init__(3)


def atomic(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return hashlib.sha256(data).hexdigest(), len(data)


def has_cite(c):
    return bool(c) and str(c.get("url", "")).startswith("https://") and bool(c.get("document"))


def check(c):
    for key in ("id", "name", "inquiry_type", "jurisdiction", "reports", "recommendations", "responses", "transcripts", "court_context"):
        if key not in c:
            raise Held(f"commission {c.get('id')} lacks {key}")
    if c["jurisdiction"] not in JURISDICTION_ORDER:
        raise Held(f"commission {c['id']} has jurisdiction {c['jurisdiction']}")
    for doc in c["reports"] + c["responses"] + c["transcripts"]:
        if not has_cite(doc.get("cite")) or not doc.get("acquisition"):
            raise Held(f"commission {c['id']} document {doc.get('key')} has no citation or acquisition")
    keys = {r["key"] for r in c["reports"]}
    for item in c["court_context"]:
        if not has_cite(item.get("cite")) or not item.get("text") or item.get("applies_to") not in keys:
            raise Held(f"commission {c['id']} has court context without a citation or report")
    for r in c["recommendations"]:
        if not r.get("text") or not has_cite(r.get("cite")) or not r["cite"].get("page"):
            raise Held(f"commission {c['id']} recommendation {r.get('number')} lacks text or a page citation")
        if r.get("status") and not has_cite(r["status"].get("cite")):
            raise Held(f"commission {c['id']} recommendation {r['number']} has a status without a citation")
    for fact in ([c["established"]] if c.get("established") else []) + c.get("commissioners", []):
        if not has_cite(fact.get("cite")) or not fact.get("quote"):
            raise Held(f"commission {c['id']} has a fact without a quote and citation")


def summary(c, file):
    statuses = Counter(r["status"]["as_published"] for r in c["recommendations"] if r.get("status"))
    return {
        "id": c["id"], "name": c["name"], "inquiry_type": c["inquiry_type"], "jurisdiction": c["jurisdiction"], "jurisdiction_name": c["jurisdiction_name"],
        "established": (c["established"] or {}).get("date"),
        "commissioners": [{"name": x["name"], "role": x["role"]} for x in c["commissioners"]],
        "interim_report_date": c["interim_report_date"], "final_report_date": c["final_report_date"],
        "reports": [{"key": r["key"], "kind": r["kind"], "title": r["title"], "date": r["date"], "date_basis": r["date_basis"], "page_url": r["page_url"],
                     "recommendations": r["recommendations"], "recommendations_status": r["recommendations_status"],
                     "acquisition": r["acquisition"]} for r in c["reports"]],
        "counts": {"reports": len(c["reports"]), "recommendations": len(c["recommendations"]),
                   "with_status": sum(1 for r in c["recommendations"] if r.get("status")), "responses": len(c["responses"]),
                   "transcripts": len(c["transcripts"]), "court_context": len(c["court_context"])},
        "status_as_published": dict(sorted(statuses.items())),
        "recommendations_status": c["recommendations_status"],
        "status_source": c["status_source"], "file": "/royal-commissions/" + file,
    }


def full_text():
    """(commission, key) -> {url, quote_policy} for transcripts with public text (scripts/build_transcript_fulltext.py)."""
    path = OUT.parent / "transcripts" / "index.json"
    if not path.exists():
        return {}
    ix = json.loads(path.read_text(encoding="utf-8"))
    return {(d["commission"], d["key"]): {"url": d["file"], "quote_policy": d["quote_policy"]} for d in ix["docs"]}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", default=str(rc.CACHE / "snapshot.json"))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--allow-shrink", action="store_true")
    args = ap.parse_args(argv)
    snap_path, out = Path(args.snapshot), Path(args.out)
    if not snap_path.exists():
        raise Held(f"no snapshot at {snap_path}")
    snap = json.loads(snap_path.read_text())
    if snap.get("schema") != rc.SCHEMA:
        raise Held(f"snapshot schema {snap.get('schema')}, expected {rc.SCHEMA}")
    commissions = snap["commissions"]
    ids = [c["id"] for c in commissions]
    if not commissions or len(ids) != len(set(ids)):
        raise Held("no commissions, or duplicate commission ids")
    for c in commissions:
        check(c)
    old = json.loads((out / "manifest.json").read_text()) if (out / "manifest.json").exists() else {}
    total = sum(len(c["recommendations"]) for c in commissions)
    prev = (old.get("counts") or {}).get("recommendations")
    if prev and total < prev * 0.9 and not args.allow_shrink:
        raise Held(f"recommendations would fall from {prev} to {total}")

    commissions.sort(key=lambda c: (JURISDICTION_ORDER.index(c["jurisdiction"]), -int((c["established"] or {}).get("date", "0000")[:4] or 0),
                                    c["final_report_date"] or c["interim_report_date"] or "", c["id"]))
    text = full_text()
    for c in commissions:
        for t in c["transcripts"]:
            if (c["id"], t["key"]) in text:
                t["full_text"] = text[(c["id"], t["key"])]
    files, rows = {}, []
    for c in commissions:
        name = f"commission-{c['id']}.json"
        sha, size = atomic(out / name, {"schema": SCHEMA, "snapshot_at": snap["built_at"], "commission": c})
        files[name] = {"sha256": sha, "bytes": size}
        rows.append(summary(c, name))
    by_j = Counter(c["jurisdiction"] for c in commissions)
    recs_j = Counter()
    for c in commissions:
        recs_j[c["jurisdiction"]] += len(c["recommendations"])
    counts = {"commissions": len(commissions), "recommendations": total,
              "with_status": sum(r["counts"]["with_status"] for r in rows),
              "responses": sum(r["counts"]["responses"] for r in rows),
              "commissions_with_recommendations": sum(1 for c in commissions if c["recommendations"]),
              "commissions_with_status": sum(1 for r in rows if r["counts"]["with_status"]),
              "commissions_with_responses": sum(1 for r in rows if r["counts"]["responses"]),
              "transcripts": sum(r["counts"]["transcripts"] for r in rows),
              "manual_documents": sum(1 for c in commissions for d in c["reports"] + c["responses"] + c["transcripts"]
                                      if d["acquisition"] != rc.OPAXBOT),
              "by_inquiry_type": dict(sorted(Counter(c["inquiry_type"] for c in commissions).items())),
              "by_jurisdiction": {j: {"commissions": by_j[j], "recommendations": recs_j[j]} for j in JURISDICTION_ORDER if by_j[j]}}
    meta = {"schema": SCHEMA, "built_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "snapshot_at": snap["built_at"], "fetched_at": snap.get("fetched_at"), "caveats": CAVEATS,
            "counts": counts, "gaps": snap.get("gaps", [])}
    sha, size = atomic(out / "index.json", {"meta": meta, "commissions": rows})
    files["index.json"] = {"sha256": sha, "bytes": size}
    for stale in out.glob("commission-*.json"):
        if stale.name not in files:
            stale.unlink()
    atomic(out / "manifest.json", {"schema": SCHEMA, "built_at": meta["built_at"], "counts": counts, "files": files})
    print(f"[export_royal_commissions] {json.dumps(counts)}", flush=True)


if __name__ == "__main__":
    main()
