#!/usr/bin/env python3
"""Promote reviewed hub snapshots offline; never acquire, push or deploy data.

After reviewing a new staged snapshot, update its review.json input digests in
the same reviewed change. Scheduled hubs then promote without a separate copy
step; annual ABS GFS, tax expenditures and advertising require explicit reviewed re-promotion.
Budget originals live in the acquisition cache: their reviewed hashes are joined
to the committed receipt ledger, not re-fetched or silently inferred here.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import redirect_stdout
import hashlib
from io import StringIO
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.budget_registry.parse import document_licence, permitted, METRICS
from scripts.budget_registry.stage import projection
from scripts.vic_gifts.stage import build as gifts_projection, exact_holder, CC
from scripts.state_bills.stage import build as state_bills_projection
from scripts.abs_gfs.check import checked_projection as gfs_projection
from scripts.tax_expenditures.check import checked_projection as tax_projection
from scripts.gov_advertising.victoria import checked_projection as advertising_projection

ASSETS = {"budget": "budget/data.json", "vic-gifts": "vic-gifts/data.json",
          "bills-tas": "bills-tas/data.json", "bills-act": "bills-act/data.json",
          "abs-gfs": "government-finance/data.json", "tax-expenditures": "tax-expenditures/data.json",
          "vic-advertising": "gov-advertising/data.json"}
# Annual ABS GFS, tax expenditures and advertising are opt-in, outside nightly.
# Existing default runs remain scoped to the four scheduled hubs.
DEFAULT_HUBS = ["budget", "vic-gifts", "bills-tas", "bills-act"]
INPUTS = {"budget": ["inventory.json", "receipts.json", "aggregates.json", "measures.json", "hub.json"],
          "vic-gifts": ["inventory.json", "receipts.json", "hub.json"],
          "bills-tas": ["inventory.json", "receipts.json", "hub.json", "acquisition-notes.json"],
          "bills-act": ["inventory.json", "receipts.json", "hub.json", "acquisition-notes.json"],
          "abs-gfs": ["inventory.json", "tables.json", "receipts.json", "series.jsonl", "reconciliation.json", "hub.json"],
          "tax-expenditures": ["inventory.json", "receipts.json", "series.jsonl", "reconciliation.json", "hub.json"],
          "vic-advertising": ["discovery.json", "inventory.json", "tables.json", "receipts.json", "reconciliation.json", "privacy-policy.json", "privacy-holds.json", "hub.json"]}
SHA = re.compile(r"[a-f0-9]{64}")


class PromotionError(ValueError):
    pass


def require(ok, check, detail):
    if not ok:
        raise PromotionError(f"{check}: {detail}")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_bytes())


def equal(actual, expected, check, detail):
    require(actual == expected, check, detail)


def unique(rows, key, detail):
    values = [r[key] for r in rows]
    require(len(set(values)) == len(values), "counts", f"duplicate {detail}")


def receipt_join(receipt, ledger, url, snapshot_key="snapshot"):
    source = ledger.get(url)
    require(source and source.get("status") == 200 and not source.get("challenge"), "source-receipt", url)
    require(SHA.fullmatch(receipt.get("sha256", "")) is not None, "hash", url)
    equal(receipt["sha256"], source.get("sha256"), "hash", url)
    equal(receipt.get("snapshot"), source.get(snapshot_key), "source-receipt", f"snapshot {url}")


def budget_item_held(item):
    statuses = ("held", "blocked", "restricted")
    return bool(item.get("held") or item.get("status") in statuses
                or any(isinstance(item.get(key), dict) and item[key].get("status") in statuses
                       for key in ("licence", "receipt", "access")))


def public_budget_projection(hub):
    # A held publisher index is excluded even when only its link was staged.
    # Documents/rows already pass the separate provenance and licence gates.
    return {**hub, "portfolio_indexes": [p for p in hub["portfolio_indexes"] if not budget_item_held(p)]}


def check_budget_output(output, inventory):
    held = [*inventory["held"],
            *(d for d in inventory["documents"] if not permitted(d)),
            *(p for p in inventory["portfolio_indexes"] if budget_item_held(p))]
    identities = {item[key] for item in held for key in ("id", "url") if item.get(key)}
    def no_held_items(value):
        if isinstance(value, dict):
            require(not budget_item_held(value), "held-output", "held item remains in public asset")
            for child in value.values():
                no_held_items(child)
        elif isinstance(value, list):
            for child in value:
                no_held_items(child)
    no_held_items(output)
    # Check every field, including nested receipts, incidental text and manifest
    # metadata. A held identity must not survive through a different reference.
    text = json.dumps(output, ensure_ascii=False, allow_nan=False)
    for identity in sorted(identities):
        require(identity not in text, "held-output", f"held ID or URL remains: {identity}")


def budget_checks(stage):
    inventory, hub = load(stage / "inventory.json"), load(stage / "hub.json")
    receipts = load(stage / "receipts.json")
    unique(receipts, "url", "budget receipts")
    ledger = {r["url"]: r for r in receipts}
    documents = inventory["documents"]
    unique(documents, "id", "budget document IDs")
    unique(documents, "url", "budget source URLs")
    unique(inventory["releases"], "id", "budget release IDs")
    aggregates, measures = load(stage / "aggregates.json"), load(stage / "measures.json")
    held = [d for d in documents if not permitted(d)]
    counts = {"documents": len(documents), "formats": dict(Counter(d["format"] for d in documents)),
              "consolidated_papers": sum(d["consolidated"] for d in documents),
              "portfolio_indexes": len(inventory["portfolio_indexes"]),
              "licences": dict(Counter(d["licence"]["name"] for d in documents)),
              "held_documents": len(held), "aggregate_rows": len(aggregates), "measure_rows": len(measures)}
    equal(inventory["counts"], counts, "counts", "budget inventory totals")
    equal({h["id"] for h in inventory["held"]}, {d["id"] for d in held}, "holds", "budget held document inventory")
    for release in inventory["releases"]:
        require(release.get("status") not in ("held", "blocked"), "held-period", release["id"])
    for d in documents:
        require(re.fullmatch(r"https://(?:archive\.budget\.gov\.au|budget\.gov\.au|treasury\.gov\.au)/[^\s]+", d["url"]), "source-receipt", d["url"])
        if d.get("index_receipt"):
            receipt_join(d["index_receipt"], ledger, d["index_url"])
        if d["receipt"]["status"] == 200:
            receipt_join(d["receipt"], ledger, d["url"])
        else:
            require(d["receipt"]["status"] == "not fetched" and permitted(d), "source-receipt", d["url"])
        if not permitted(d):
            continue  # Reviewed inventory hold: no document or rows may enter the public projection.
        rights = d["licence"]
        require(rights.get("exceptions"), "licence-receipt", d["id"])
        grant = ledger.get(rights.get("document_url", d["url"]))
        require(grant and grant.get("status") == 200 and SHA.fullmatch(grant.get("sha256", "")), "licence-receipt", d["id"])
        if rights.get("document_sha256"):
            equal(rights["document_sha256"], grant["sha256"], "hash", f"licence grant {d['id']}")
        if rights.get("evidence"):
            equal(document_licence(rights["evidence"])["url"], rights["url"], "licence-receipt", d["id"])
    by_id = {d["id"]: d for d in documents}
    for row in aggregates + measures:
        d = by_id.get(row["document_id"])
        require(d and permitted(d) and row.get("status") not in ("held", "blocked") and not row.get("held"), "held-row", row["document_id"])
        equal(row["sha256"], d["receipt"].get("sha256"), "hash", row["document_id"])
        for key, expected in {"source_url": d["url"], "snapshot": d["receipt"]["snapshot"],
                              "licence_url": d["licence"]["url"], "licence": d["licence"]["name"],
                              "release": d["release"], "release_year": d["year"]}.items():
            equal(row.get(key), expected, "row-provenance", f"{row['document_id']} {key}")
        require(not row.get("official") and not row.get("href"), "official-links", "budget rows have no person join")
    for row in aggregates:
        require(row["metric"] in METRICS and row["unit"] in ("AUD million", "AUD billion")
                and row["status"] in ("actual", "estimate", "projection")
                and isinstance(row["value"], (int, float)) and not isinstance(row["value"], bool)
                and math.isfinite(row["value"])
                and all(isinstance(row.get(k), str) for k in ("release", "release_year", "fiscal_year", "vintage", "paper", "table_id", "snapshot"))
                and re.fullmatch(r"20\d{2}-\d{2}", row["fiscal_year"])
                and type(row.get("publication_order")) in (int, float) and math.isfinite(row["publication_order"])
                and type(row["pdf_page"]) is int and row["pdf_page"] > 0, "asset-shape", "budget fiscal row")
    for d in documents:
        if d["consolidated"] and d["kind"] in ("bp1", "myefo") and permitted(d):
            metrics = {r["metric"] for r in aggregates if r["document_id"] == d["id"] and r["fiscal_year"] == d["year"]}
            equal(metrics, set(METRICS), "counts", f"headline metric coverage {d['id']}")
    expected = projection({**inventory, "aggregates": aggregates, "measures": measures})
    equal(hub, expected, "asset-shape", "budget hub differs from validated projection")
    public = public_budget_projection(hub)
    held_indexes = sum(budget_item_held(p) for p in inventory["portfolio_indexes"])
    return public, {"releases": len(public["releases"]), "documents": len(public["documents"]),
                    "aggregates": len(aggregates), "measures": len(measures), "held_documents_excluded": len(held),
                    "portfolio_indexes": len(public["portfolio_indexes"]),
                    "linked_portfolio_indexes": sum(bool(p.get("url")) for p in public["portfolio_indexes"]),
                    "held_portfolio_indexes_excluded": held_indexes}


def gifts_checks(stage, root):
    inventory, hub, receipts = (load(stage / (n + ".json")) for n in ("inventory", "hub", "receipts"))
    require(not receipts.get("stopped") and not hub.get("collection_stopped"), "source-receipt", "gift collection stopped")
    require(not inventory["holds"] and not hub["holds"], "held-period", "gift period inventory holds")
    unique(receipts["receipts"], "url", "gift receipts")
    ledger = {r["url"]: r for r in receipts["receipts"]}
    for r in ledger.values():
        require(r["status"] == 200 and not r.get("challenge") and not r.get("followed_redirect"), "source-receipt", r["url"])
        path = (root / r["snapshot_path"]).resolve()
        require(path.is_relative_to(stage.resolve() / "snapshots"), "source-receipt", "snapshot outside staging")
        equal(digest(path.read_bytes()), r["sha256"], "hash", r["url"])
    unique(inventory["documents"], "id", "gift periods")
    roster = load(root / "portal/public/parliamentarians.json")["people"]
    paths = json.loads((root / "portal/public/person-paths.js").read_text().split("export const PERSON_PATHS = ", 1)[1].strip().rstrip(";"))["exact"]
    equal([r["document"] for r in hub["registers"]], inventory["documents"], "counts", "gift periods/registers")
    files = sorted(p.name for p in (stage / "registers").glob("*.json"))
    equal(files, sorted(d["id"] + ".json" for d in inventory["documents"]), "counts", "gift register files")
    rows = []
    for register in hub["registers"]:
        d, entries = register["document"], register["rows"]
        require(d["status"] == "cleared" and d["licence"]["status"] == "open" and d["licence"]["url"] == CC, "held-period", d["id"])
        receipt_join(d["receipt"], ledger, d["url"], "checked_at")
        receipt_join(d["licence"]["policy_receipt"], ledger, d["licence"]["policy_url"], "checked_at")
        equal(register, load(stage / "registers" / (d["id"] + ".json")), "counts", d["id"] + " register/hub")
        equal(d["row_count"], len(entries), "counts", d["id"] + " rows")
        equal(d["role_counts"], dict(Counter(r["role"] for r in entries)), "counts", d["id"] + " roles")
        for row in entries:
            require(row.get("status") not in ("held", "blocked") and not row.get("held"), "held-row", row["id"])
            equal(row["sha256"], d["receipt"]["sha256"], "hash", row["id"])
            equal(row["official"], exact_holder(row["office_holder"], roster, paths), "official-links", row["id"])
        rows.extend(entries)
    unique(rows, "id", "gift row IDs")
    counts = {"periods": len(hub["registers"]), "html_pages": len(hub["registers"]), "tables": len(hub["registers"]) * 2,
              "rows": len(rows), "roles": dict(Counter(r["role"] for r in rows)),
              "linked_rows": sum(bool(r["official"]) for r in rows), "unlinked_rows": sum(not r["official"] for r in rows),
              "holds": 0, "source_receipts": len(ledger)}
    equal(inventory["counts"], counts, "counts", "gift inventory totals")
    # Reparse the retained source bytes and linked copyright notice offline. This
    # verifies table counts, all source fields and the applicable licence grant.
    with redirect_stdout(StringIO()):
        expected = gifts_projection(stage, root / "portal/public/parliamentarians.json", root / "portal/public/person-paths.js", dry_run=True, snapshot_root=root)
    equal(hub, expected, "licence/source-projection", "gift hub differs from retained source bytes")
    return hub, counts


def state_bills_checks(stage, root):
    jurisdiction = stage.name.removeprefix("bills-")
    ledger = load(stage / "receipts.json")
    require(not ledger.get("stopped"), "source-receipt", "bill collection stopped")
    unique(ledger["receipts"], "url", "bill receipts")
    identity = load(root / "parli/ingest/user-agent.json")["user_agent"]
    for r in ledger["receipts"]:
        require(r["status"] == 200 and not r.get("challenge") and not r.get("followed_redirect")
                and r.get("robots_allowed") and r.get("user_agent") == identity, "source-receipt", r["url"])
        path = (root / r["snapshot_path"]).resolve()
        require(path.is_relative_to(stage.resolve() / "snapshots"), "source-receipt", "snapshot outside staging")
        equal(digest(path.read_bytes()), r["sha256"], "hash", r["url"])
    expected, inventory = state_bills_projection(jurisdiction, root)
    equal(load(stage / "inventory.json"), inventory, "counts/licence", stage.name)
    equal(load(stage / "hub.json"), expected, "licence/source-projection", stage.name)
    unique(expected["bills"], "key", "bill keys")
    require(expected["bills"], "counts", "empty state bill registry")
    # The source-derived projection has a fixed metadata shape. Extra fields,
    # including held bodies slipped into a staged bill or link, fail equality.
    for bill in expected["bills"]:
        require(bill["licence"]["status"] == "metadata-only" and bill["licence"]["text_allowed"] is False,
                "licence", bill["key"])
        require(all(d["body_status"] == "held" for d in bill["sources"]), "held-output", bill["key"])
    return expected, expected["counts"]


def validated_asset(hub_name, root=ROOT):
    stage = root / "data/staged" / hub_name
    if hub_name == "budget":
        hub, counts = budget_checks(stage)
    elif hub_name == "vic-gifts":
        hub, counts = gifts_checks(stage, root)
    elif hub_name == "abs-gfs":
        hub, counts = gfs_projection(stage)
    elif hub_name == "tax-expenditures":
        hub, counts = tax_projection(stage)
    elif hub_name == "vic-advertising":
        hub, counts = advertising_projection(stage)
    else:
        hub, counts = state_bills_checks(stage, root)
    inputs = list(INPUTS[hub_name])
    if hub_name == "vic-gifts":
        inputs += sorted(str(p.relative_to(stage)) for p in (stage / "registers").glob("*.json"))
    hashes = {name: digest((stage / name).read_bytes()) for name in inputs}
    review = load(stage / "review.json")
    require(review.get("status") == "approved" and review.get("reviewed_commit"), "review", hub_name)
    equal(review.get("inputs"), hashes, "review-hash", f"{hub_name} inputs changed since review")
    manifest = {"counts": counts, "snapshot_date": hub["generated_at"][:10], "input_sha256": hashes["hub.json"],
                "inputs": hashes, "reviewed_commit": review["reviewed_commit"]}
    output = {**hub, "promotion": manifest}
    if hub_name == "budget":
        check_budget_output(output, load(stage / "inventory.json"))
    return (json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode(), manifest


def promote(hubs, root=ROOT, dry_run=False, check_public=False, votes_reference=None):
    votes_path = root / "portal/public/votes.json"
    votes = votes_path.read_bytes()
    equal(json.loads(votes).get("_meta", {}).get("schema"), 1, "votes", "schema 1 required")
    if votes_reference:
        baseline = subprocess.run(["git", "show", f"{votes_reference}:portal/public/votes.json"], cwd=root, capture_output=True, check=True).stdout
        equal(votes, baseline, "votes", f"bytes differ from {votes_reference}")
    failed = False
    for name in hubs:
        try:
            data, manifest = validated_asset(name, root)
            equal(votes_path.read_bytes(), votes, "votes", "bytes changed during promotion")
            target = root / "portal/public" / ASSETS[name]
            if check_public:
                equal(target.read_bytes(), data, "public-asset", str(target))
            elif not dry_run:
                target.parent.mkdir(parents=True, exist_ok=True)
                # Single atomic asset includes its manifest: failures never truncate
                # the last good hub or leave a separate manifest ahead of its data.
                fd, tmp = tempfile.mkstemp(prefix=".promote-", dir=target.parent)
                try:
                    with os.fdopen(fd, "wb") as out:
                        out.write(data)
                        os.fchmod(out.fileno(), 0o644)
                    os.replace(tmp, target)
                finally:
                    if os.path.exists(tmp):
                        os.unlink(tmp)
            print(json.dumps({"hub": name, "asset": "portal/public/" + ASSETS[name], "bytes": len(data),
                              "mode": "check-public" if check_public else "dry-run" if dry_run else "promote", **manifest}))
        except (ValueError, KeyError, OSError, TypeError) as error:
            failed = True
            detail = str(error) if isinstance(error, PromotionError) else f"input/asset-shape: {error}"
            print(f"FAIL {name}: {detail}", file=sys.stderr)
    equal(votes_path.read_bytes(), votes, "votes", "bytes changed during promotion")
    return 1 if failed else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hubs", nargs="*", help="reviewed hub names (default: four active hubs)")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true")
    modes.add_argument("--check-public", action="store_true")
    parser.add_argument("--votes-reference", help="Also require votes bytes to match this git ref (lane gates)")
    args = parser.parse_args()
    if any(name not in ASSETS for name in args.hubs):
        parser.error("hubs must be one of: " + ", ".join(ASSETS))
    try:
        return promote(args.hubs or DEFAULT_HUBS, dry_run=args.dry_run, check_public=args.check_public, votes_reference=args.votes_reference)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"FAIL votes: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
