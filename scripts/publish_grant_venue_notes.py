#!/usr/bin/env python3
"""Build and optionally publish small, verified grant venue notes.

Location notes are derived evidence for an existing award or invitation. They
are separate KB resources and never create or re-count a funding record.
Dry-run is the default; ``--write`` requires an explicit receipt directory.
"""
import argparse
import json
import math
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _resource(slug, title, body, url, date, source, metadata):
    return {
        "slug": slug,
        "title": title,
        "texts": {"t-body": {"body": body, "format": "PLAIN"}},
        "origin": {"source_id": "opax-grants-research", "url": url, "created": date + "T00:00:00Z"},
        "usermetadata": {"classifications": [
            {"labelset": "kind", "label": "research_report"},
            {"labelset": "source", "label": source},
            {"labelset": "state", "label": "federal"},
            {"labelset": "topic", "label": "integrity-democracy"},
        ]},
        "extra": {"metadata": metadata | {"date": date, "licence": "Structured facts and derived venue evidence; original documents linked."}},
    }


def _load(path):
    data = json.loads(path.read_text())
    records = data.get("records", data) if isinstance(data, dict) else data
    if not isinstance(records, list):
        raise ValueError("locations input must be an array or an object with records")
    return records


def _check_record(record):
    if record.get("record_type") not in {"award", "invitation"}:
        raise ValueError(f"unsupported record_type for {record.get('id')}")
    if record.get("verification", {}).get("status") != "verified":
        raise ValueError(f"record is not verified: {record.get('id')}")
    if record.get("payment_verified") is not False:
        raise ValueError(f"payment verification must be false: {record.get('id')}")
    if not record.get("source_url") or not record.get("sites"):
        raise ValueError(f"record lacks source_url or sites: {record.get('id')}")
    for site in record["sites"]:
        v = site.get("verification", {})
        if site.get("site_precision") != "venue" or v.get("status") != "verified":
            raise ValueError(f"site is not a verified venue: {record.get('id')}")
        latitude = site.get("latitude")
        longitude = site.get("longitude")
        try:
            finite_coordinates = (
                not isinstance(latitude, bool)
                and not isinstance(longitude, bool)
                and math.isfinite(float(latitude))
                and math.isfinite(float(longitude))
            )
        except (TypeError, ValueError):
            finite_coordinates = False
        if not finite_coordinates or not (-44 < float(latitude) < -10 and 112 < float(longitude) < 154):
            raise ValueError(f"site lacks finite coordinates: {record.get('id')}")
        if not site.get("address") or not site.get("site_name") or not site.get("location_source_url"):
            raise ValueError(f"site lacks identity/source fields: {record.get('id')}")
        if not site.get("electorate_2025") or v.get("boundary", {}).get("election") != 2025:
            raise ValueError(f"site lacks 2025 boundary verification: {record.get('id')}")
        if not v.get("sources"):
            raise ValueError(f"site lacks source citations: {record.get('id')}")


def build_row(record):
    _check_record(record)
    rid = record["id"]
    stage = record["record_type"]
    stage_label = "published award" if stage == "award" else "funding invitation"
    checked = record["verification"].get("checked_at") or ""
    date = checked[:10] or record.get("snapshot_date") or record.get("publish_date")
    if not date:
        raise ValueError(f"record lacks a verification/publication date: {rid}")
    snapshot_date = record.get("snapshot_date") or record.get("publish_date")
    if not snapshot_date:
        raise ValueError(f"record lacks an original snapshot date: {rid}")
    text = (f"Verified project venue evidence for {rid}: {record['title']}. "
            "Major and Local Community Infrastructure Program (MLCIP). "
            f"This is a derived location note for an existing {stage_label}, not a new award, payment or completion claim. "
            f"Recorded value: AUD {record['value']:,.2f}; status: {record.get('status', 'not recorded')}. "
            f"The whole record amount is counted once and is not apportioned across sites. ")
    for site in record["sites"]:
        text += (f"Venue: {site['site_name']}, {site['address']}; latitude {site['latitude']}, longitude {site['longitude']}. "
                 f"2025 AEC division of this venue point: {site['electorate_2025']}. "
                 "This point does not establish the full work footprint or allocate the record value to that division. "
                 + " ".join(site["verification"].get("notes", [])) + " "
                 + "Venue evidence: " + "; ".join(x["url"] for x in site["verification"].get("sources", [])) + ". ")
    text += f"Original source: {record['source_url']}. Original invitation snapshot: {snapshot_date}. Verification snapshot: {date}."
    metadata = {
        "record_type": "Derived grant venue evidence",
        "stage": "site_enrichment",
        "source_record_type": stage,
        "canonical_award_id": rid if stage == "award" else None,
        "canonical_invitation_id": rid if stage == "invitation" else None,
        "is_new_award": False,
        "counts_as_award": False,
        "counts_as_invitation": False,
        "source_record_value_aud": record["value"],
        "source_record_status": record.get("status"),
        "source_record_url": record["source_url"],
        "source_record_snapshot_date": snapshot_date,
        "sites": record["sites"],
        "invitation_ids": record.get("invitation_ids", []),
        "award_ids": record.get("award_ids", []),
        "payment_verified": False,
        "date_meaning": "Venue-evidence verification date, not award, invitation or payment date",
        "report_url": "https://opax.com.au/reports/grants-allocation",
    }
    source = "grantconnect" if stage == "award" else "departmental_grants_list"
    return _resource(f"grant-site-evidence-{rid.lower()}", f"{record['title']} — verified venue ({rid})", text, record["source_url"], date, source, metadata)


def publish(rows, receipt_dir):
    from parli.arag import AragConfig, AragError, KbClient
    receipt_dir.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(receipt_dir / "receipts.sqlite")
    db.execute("CREATE TABLE IF NOT EXISTS receipts(slug TEXT PRIMARY KEY,rid TEXT,status TEXT,verified_at TEXT)")
    kb = KbClient(AragConfig.from_env())
    try:
        for row in rows:
            try:
                kb.create_resource(row)
            except AragError as error:
                if error.status != 409:
                    raise
            current = kb.get_resource_by_slug(row["slug"], show="origin&show=extra")
            if current.get("origin", {}).get("source_id") != row["origin"]["source_id"]:
                raise RuntimeError(f"source identity mismatch: {row['slug']}")
            if current.get("origin", {}).get("url") != row["origin"]["url"]:
                raise RuntimeError(f"source URL mismatch: {row['slug']}")
            live = kb.get_resource_text(current["id"], "t-body")
            if live.get("value", {}).get("body") != row["texts"]["t-body"]["body"]:
                raise RuntimeError(f"body read-back mismatch: {row['slug']}")
            if current.get("extra") != row["extra"]:
                raise RuntimeError(f"metadata read-back mismatch: {row['slug']}")
            result = (row["slug"], current["id"], "verified", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
            db.execute("INSERT OR REPLACE INTO receipts VALUES (?,?,?,?)", result)
            db.commit()
    finally:
        db.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--locations", type=Path, required=True)
    parser.add_argument("--ids", nargs="+", help="Explicit record IDs to process")
    parser.add_argument("--receipt-dir", type=Path, help="Required with --write")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args(argv)
    if args.write and not args.receipt_dir:
        parser.error("--receipt-dir is required with --write")
    if args.write and not args.ids:
        parser.error("--ids is required with --write")
    records = _load(args.locations)
    selected = [r for r in records if not args.ids or r.get("id") in set(args.ids)]
    if args.ids and {r.get("id") for r in selected} != set(args.ids):
        raise SystemExit("requested ID is absent from locations input")
    rows = [build_row(r) for r in selected]
    if args.write:
        publish(rows, args.receipt_dir)
        print(json.dumps({"published_and_read_back": len(rows), "mode": "write"}))
    else:
        print(json.dumps({"ready": len(rows), "slugs": [r["slug"] for r in rows], "mode": "dry-run"}))


if __name__ == "__main__":
    main()
