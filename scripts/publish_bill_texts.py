#!/usr/bin/env python3
"""Acquire, export and publish versioned federal bill text without rewriting summaries.

Examples (all commands are resumable):
  python scripts/publish_bill_texts.py crawl --browser-ua --limit 10
  python scripts/publish_bill_texts.py crawl --browser-ua
  python scripts/publish_bill_texts.py export
  python scripts/publish_bill_texts.py reconcile  # cached identity evidence only
  python scripts/publish_bill_texts.py finish-legacy  # only after main crawl stops
  python scripts/publish_bill_texts.py publish --dry-run
  python scripts/publish_bill_texts.py publish --env /path/to/.env --rate 1

Acquisition touches only the separate state DB/cache/output directory. Publishing
is a separate explicit command and writes only complete `kind/bill_text` records.
"""
from __future__ import annotations
import argparse
import json
import sys
import time
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.ingest.bill_texts import (
    SourceFetcher, SourceBlocked, SourceUnavailable, discover, export_state, load_documents, now,
    open_state, register_documents, resource_body, version_document, walk_version, publish_resource,
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STATE = Path.home() / ".cache/opax/bill-texts"


def options():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["crawl", "export", "publish", "status", "reconcile", "finish-legacy"])
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--bills-dir", type=Path, default=ROOT / "portal/public/bills")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "portal/public/bill-texts")
    parser.add_argument("--home-cache", type=Path, default=Path.home() / ".cache/autoresearch/bills_v2/billhome")
    parser.add_argument("--registry-db", type=Path, default=Path.home() / ".cache/autoresearch/parli.db")
    parser.add_argument("--reconcile-network", action="store_true", help="Reconcile only: fetch official listings/homepages; run separately from crawl to respect source pacing")
    parser.add_argument("--keys", help="Comma-separated canonical bill keys")
    parser.add_argument("--parliaments", help="Comma-separated parliament numbers")
    parser.add_argument("--limit", type=int, help="Newest N bills; omit to process the selected corpus")
    parser.add_argument("--source-attempts", type=int, default=3, help="Bounded attempts per source billhome/version before reporting a gap")
    parser.add_argument("--max-sections", type=int, default=1000)
    parser.add_argument("--browser-ua", action="store_true")
    parser.add_argument("--refresh-discovery", action="store_true", help="Recheck billhome pages for newly published stages")
    parser.add_argument("--source-rate", type=float, default=0.7)
    parser.add_argument("--export-every", type=int, default=25)
    parser.add_argument("--env", default=".env")
    parser.add_argument("--dry-run", action="store_true", help="For publish: make no KB calls, print local write plan")
    parser.add_argument("--verify", action="store_true", help="For publish: verify remote content even when a local successful hash matches")
    parser.add_argument("--rate", type=float, default=1, help="Publish operations/sec")
    return parser.parse_args()


def report(db):
    return {"bills": {r[0]: r[1] for r in db.execute("SELECT status,count(*) FROM bill_text_bills GROUP BY status")},
            "versions": {r[0]: r[1] for r in db.execute("SELECT status,count(*) FROM bill_text_versions GROUP BY status")},
            "sections": db.execute("SELECT count(*) FROM bill_text_sections").fetchone()[0]}


def crawl(args, db):
    documents = load_documents(args.bills_dir, args.keys.split(",") if args.keys else None,
                               [int(p) for p in args.parliaments.split(",")] if args.parliaments else None)
    if args.limit:
        documents = documents[:args.limit]
    register_documents(db, documents)
    fetcher = SourceFetcher(args.state_dir / "http-cache", rate=args.source_rate, browser_ua=args.browser_ua)
    failures = 0
    operational_failures = 0
    interrupted = False
    print(json.dumps({"selected_bills": len(documents), "state_dir": str(args.state_dir), "started_at": now()}), flush=True)
    try:
        for number, doc in enumerate(documents, 1):
            try:
                bill = db.execute("SELECT status FROM bill_text_bills WHERE bill_key=?", (doc["key"],)).fetchone()
                if bill["status"] == "discovered" and not args.refresh_discovery:
                    versions = [r[0] for r in db.execute("SELECT source_version FROM bill_text_versions WHERE bill_key=?", (doc["key"],))]
                else:
                    for attempt in range(args.source_attempts):
                        try:
                            versions = discover(db, doc, fetcher, args.home_cache, args.refresh_discovery)
                            break
                        except (SourceUnavailable, urllib.error.URLError, TimeoutError):
                            if attempt + 1 == args.source_attempts: raise
                outcomes = {}
                for version in versions:
                    for attempt in range(args.source_attempts):
                        outcome = walk_version(db, doc["key"], version, fetcher, args.max_sections)
                        if outcome != "incomplete": break
                    outcomes[version] = outcome
                failures += any(status == "incomplete" for status in outcomes.values())
                print(json.dumps({"bill": number, "of": len(documents), "bill_key": doc["key"], "outcomes": outcomes}), flush=True)
            except SourceBlocked:
                raise
            except Exception as error:
                failures += 1
                operational_failures += not isinstance(error, (SourceUnavailable, urllib.error.URLError, TimeoutError))
                db.execute("UPDATE bill_text_bills SET status='failed',note=? WHERE bill_key=?", (str(error), doc["key"]))
                db.commit()
                print(json.dumps({"bill_key": doc["key"], "error": str(error)}), flush=True)
            if number <= 3 or number % args.export_every == 0:
                export_state(db, args.output_dir)
    except (KeyboardInterrupt, SourceBlocked) as error:
        interrupted = True
        print(json.dumps({"stopped": type(error).__name__, "message": str(error)}), flush=True)
    finally:
        summary = export_state(db, args.output_dir)
        print(json.dumps({**report(db), "export": {k: v for k, v in summary.items() if k != "records"}}), flush=True)
    return 130 if interrupted else 1 if operational_failures else 2 if failures else 0


def publish(args, db):
    # Existing publisher performs hash comparison, POST/PATCH and conflict recovery.
    from scripts.publish_bills import RateLimiter, push
    rows = db.execute("SELECT v.bill_key,v.source_version,b.doc_json FROM bill_text_versions v JOIN bill_text_bills b USING(bill_key) WHERE v.status='complete' ORDER BY b.bill_key,v.source_version").fetchall()
    if args.keys:
        keys = set(args.keys.split(",")); rows = [r for r in rows if r["bill_key"] in keys]
    if args.limit:
        rows = rows[:args.limit]
    if args.dry_run:
        for row in rows:
            body = resource_body(version_document(db, row["bill_key"], row["source_version"]), json.loads(row["doc_json"]))
            print(json.dumps({"slug": body["slug"], "characters": len(body["texts"]["body"]["body"]), "content_hash": body["extra"]["metadata"]["content_hash"]}))
        return 0
    from parli.arag import AragConfig, KbClient, load_dotenv
    load_dotenv(args.env)
    config = AragConfig.from_env()
    if not config.kb_configured:
        raise SystemExit("Missing knowledge-box configuration")
    kb, limiter = KbClient(config), RateLimiter(args.rate)
    outcomes = {}
    for row in rows:
        body = resource_body(version_document(db, row["bill_key"], row["source_version"]), json.loads(row["doc_json"]))
        outcome = publish_resource(db, kb, body, limiter, push, verify=args.verify, publication_scope=config.zone + "/" + config.kb_id)
        kind = outcome.split(":")[0]
        outcomes[kind] = outcomes.get(kind, 0) + 1
        print(json.dumps({"slug": body["slug"], "outcome": outcome}), flush=True)
    print(json.dumps(outcomes), flush=True)
    return 1 if outcomes.get("failed") else 0


def reconcile(args, db):
    """Resolve legacy identities with exact source title/year AND introduction date.

    Default is entirely offline. Network mode must be scheduled separately from
    the full-text crawl so their individual source limits are not combined.
    Registry source IDs and Act originating-bill links only nominate candidates;
    they never bypass verification against the official bill homepage.
    """
    import sqlite3
    import re
    from collections import defaultdict
    sys.path.insert(0, str(ROOT / "scripts/bills_registry"))
    import bills_fetch as registry
    import bills_common as common
    from parli.ingest.bill_texts import atomic_json, digest, display_url, source_code
    documents = load_documents(args.bills_dir, args.keys.split(",") if args.keys else None,
                               [int(p) for p in args.parliaments.split(",")] if args.parliaments else None)
    documents = [doc for doc in documents if not source_code(doc)]
    if args.limit:
        documents = documents[:args.limit]
    register_documents(db, documents)
    candidates = defaultdict(set)
    homes = {}
    for path in args.home_cache.glob("*.html"):
        if re.fullmatch(r"[rs]\d+", path.stem):
            homes[path.stem] = registry.parse_billhome(path.read_text(errors="replace"), path.stem)
    by_title = defaultdict(set)
    for code, home in homes.items():
        by_title[common.norm(home.get("short_title"))].add(code)
    listing_cache = args.home_cache.parent / "listing"
    for path in listing_cache.glob("*.html"):
        for row in registry.parse_listing(path.read_text(errors="replace")):
            if re.fullmatch(r"[rs]\d+", row["code"]):
                by_title[common.norm(row["title"])].add(row["code"])
    if args.registry_db.exists():
        connection = sqlite3.connect(args.registry_db.resolve().as_uri() + "?mode=ro", uri=True)
        try:
            for key, identity in connection.execute("SELECT bill_key,source_id FROM bills_v2"):
                match = re.fullmatch(r"(?:legislation/billhome/)?([rs]\d+)", identity or "")
                if match: candidates[key].add(match[1])
            for key, code in connection.execute("SELECT l.bill_key,a.bill_code FROM bill_links l JOIN ext_frl_acts a ON a.act_id=l.target_key WHERE l.kind='act' AND a.bill_code IS NOT NULL"):
                if re.fullmatch(r"[rs]\d+", code): candidates[key].add(code)
        finally:
            connection.close()
    if args.reconcile_network:
        # This explicit mode uses the registry's existing browser UA, cache and
        # fixed 0.7 req/s limiter for BOTH listings and homepages.
        common.CACHE = args.home_cache.parent
        common.RATE = 1 / args.source_rate
        for parliament in sorted({doc.get("parliament") for doc in documents if doc.get("parliament")}):
            for row in registry.enumerate_parliament(parliament):
                by_title[common.norm(row["title"])].add(row["code"])
    results = []
    for doc in documents:
        key = doc["key"]
        candidate_codes = candidates[key] | by_title[common.norm(doc["title"])]
        verified = []
        for code in sorted(candidate_codes):
            if code not in homes and args.reconcile_network:
                body, _, _ = common.fetch(display_url("legislation/billhome/" + code), "billhome", code)
                if body: homes[code] = registry.parse_billhome(body, code)
            home = homes.get(code)
            if not home: continue
            if exact_identity_match(doc, home, common.norm):
                verified.append(code)
        outcome = {"bill_key": key, "title": doc["title"], "introduced": doc.get("introduced"), "candidate_codes": sorted(candidate_codes), "verified_codes": verified}
        if len(verified) == 1:
            code = verified[0]
            path = args.home_cache / (code + ".html")
            evidence = {**outcome, "rule": "exact-normalized-title-year-and-introduction-date", "source_url": display_url("legislation/billhome/" + code), "source_sha256": digest(path.read_bytes()), "source_title": homes[code]["short_title"]}
            db.execute("INSERT INTO bill_text_identity_links VALUES(?,?,?,?) ON CONFLICT(bill_key) DO UPDATE SET code=excluded.code,evidence_json=excluded.evidence_json,verified_at=excluded.verified_at", (key, code, json.dumps(evidence), now()))
            db.execute("UPDATE bill_text_bills SET code=?,status=CASE WHEN status IN ('unavailable','failed') THEN 'pending' ELSE status END,note=NULL WHERE bill_key=?", (code, key))
            db.commit()
            outcome["status"] = "resolved"
        else:
            outcome["status"] = "ambiguous" if len(verified) > 1 else "unresolved"
        results.append(outcome)
    atomic_json(args.state_dir / "identity-reconciliation.json", {"generated_at": now(), "records": results})
    counts = {status: sum(row["status"] == status for row in results) for status in ("resolved", "unresolved", "ambiguous")}
    print(json.dumps({**counts, "network": args.reconcile_network, "report": str(args.state_dir / "identity-reconciliation.json")}))
    return 0


def exact_identity_match(doc, home, normalize):
    dates = [event["date"] for event in home["events"] if event["stage"] == "introduced"]
    return bool(doc.get("introduced") and dates and min(dates) == doc["introduced"]
                and normalize(home.get("short_title")) == normalize(doc["title"]))


def finish_legacy(args, db):
    """Run after the main crawler exits; reconcile then acquire verified legacy bills."""
    args.reconcile_network = True
    reconcile(args, db)
    report = json.loads((args.state_dir / "identity-reconciliation.json").read_text())
    keys = [row["bill_key"] for row in report["records"] if row["status"] == "resolved"]
    if not keys:
        print(json.dumps({"legacy_crawl": "No verified legacy bill identities", "unresolved": len(report["records"])}), flush=True)
        return 0
    args.keys = ",".join(keys)
    args.limit = None
    args.browser_ua = True
    args.refresh_discovery = False
    time.sleep(1 / args.source_rate)  # preserve pacing across the two source clients
    return crawl(args, db)


def main():
    args = options()
    if args.source_attempts < 1 or args.max_sections < 1 or args.export_every < 1 or args.source_rate <= 0 or args.source_rate > 0.7 or args.rate <= 0 or (args.limit is not None and args.limit < 1):
        raise SystemExit("Positive limits/rates required; source rate must not exceed0.7 requests/sec")
    db = open_state(args.state_dir / "state.sqlite")
    try:
        if args.command == "finish-legacy":
            return finish_legacy(args, db)
        if args.command == "reconcile":
            return reconcile(args, db)
        if args.command == "crawl":
            return crawl(args, db)
        if args.command == "publish":
            return publish(args, db)
        if args.command == "export":
            result = export_state(db, args.output_dir)
            print(json.dumps({k: v for k, v in result.items() if k != "records"}))
        else:
            print(json.dumps(report(db)))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
