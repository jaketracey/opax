#!/usr/bin/env python3
"""Explicit, sequential ABS download acquisition. Never runs during staging.

Only release/rights pages and release-listed XLSX/CSV files; no Data API.
An access refusal permanently holds this run. Challenge bodies are not saved.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

ROOT = Path(__file__).resolve().parents[2]
UA = "OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch(url, name, root=ROOT):
    stage, cache = root / "data/staged/abs-gfs", root / "portal/private/abs-gfs"
    ledger_path = stage / "receipts.json"
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else []
    if any(r.get("held") for r in ledger):
        raise ValueError("Source held; no further acquisition authorised")
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc != "www.abs.gov.au" or parsed.scheme != "https" or "/" in name or name.startswith("."):
        raise ValueError("Unreviewed host/path")
    if parsed.path != "/robots.txt":
        policy = urllib.robotparser.RobotFileParser()
        policy.parse((cache / "robots.txt").read_text().splitlines())
        if not policy.can_fetch(UA, url):
            raise ValueError("Disallowed by robots")
        inventory_path = stage / "inventory.json"
        downloads = {d["url"] for d in json.loads(inventory_path.read_text())["workbooks"]} if inventory_path.exists() else set()
        pages = {"https://www.abs.gov.au/website-privacy-copyright-and-disclaimer", "https://www.abs.gov.au/how-cite-abs-sources",
                 "https://www.abs.gov.au/websitedbs/d3310114.nsf/Home/Attributing+ABS+Material",
                 "https://www.abs.gov.au/statistics/economy/government/government-finance-statistics-annual/latest-release",
                 "https://www.abs.gov.au/statistics/economy/government/government-finance-statistics-annual/2024-25"}
        if url not in pages | downloads:
            raise ValueError("Only reviewed release pages and their published downloads are allowed")
    if ledger:
        completed = max(datetime.datetime.fromisoformat(r.get("completed_at", r["snapshot"])).timestamp() for r in ledger)
        time.sleep(max(0, 5.1 - (time.time() - completed)))
    receipt = {"url": url, "snapshot": datetime.datetime.now(datetime.timezone.utc).isoformat(), "user_agent": UA}
    try:
        opener = urllib.request.build_opener(NoRedirect)
        with opener.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=45) as response:
            body = response.read()
            receipt.update(status=response.status, content_type=response.headers.get("Content-Type"))
    except urllib.error.HTTPError as error:
        body = error.read()
        receipt.update(status=error.code, location=error.headers.get("Location"))
    except Exception as error:
        body = b""
        receipt.update(status=None, error=type(error).__name__ + ": " + str(error))
    receipt.update(sha256=hashlib.sha256(body).hexdigest(), completed_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    receipt["challenge"] = any(marker in body.lower() for marker in (b"cf-chl-", b"captcha", b"access denied", b"challenge-platform", b"akamai bot"))
    receipt["redirect"] = receipt["status"] in (301, 302, 303, 307, 308) and urllib.parse.urlparse(receipt.get("location", "")).netloc == "www.abs.gov.au"
    receipt["held"] = (receipt["status"] != 200 and not receipt["redirect"]) or receipt["challenge"]
    if receipt["status"] == 200 and not receipt["held"]:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / name).write_bytes(body)
        receipt["local_path"] = str((cache / name).relative_to(root))
    ledger.append(receipt)
    stage.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")
    if receipt["held"]:
        raise ValueError(f"STOP: source held, HTTP {receipt['status']}; compact receipt retained")
    if receipt["redirect"]:
        # Explicit next request: same host and the existing robots policy apply.
        return fetch(receipt["location"], name, root)
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("cache_filename")
    args = parser.parse_args()
    print(json.dumps(fetch(args.url, args.cache_filename), indent=2))
