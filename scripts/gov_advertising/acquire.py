"""Explicit Victorian advertising acquisition; sequential, identifying and fail closed.

Only the series, its linked advertising pages/attachments, robots and copyright.
No retries, automatic redirects, alternate identities or production writes.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

from parli.ingest.http import is_challenge
from scripts.vic_gifts.acquire import NoRedirect, robots_allowed, robots_rules

ROOT = Path(__file__).resolve().parents[2]
UA = "OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)"
INDEX = "https://www.vic.gov.au/advertising-plans-and-spend"


def fetch(url, name, root=ROOT):
    stage, cache = root / "data/staged/vic-advertising", root / "portal/private/vic-advertising/source"
    stage.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    path = stage / "receipts.json"
    ledger = json.loads(path.read_text()) if path.exists() else []
    if any(r.get("held") for r in ledger):
        raise ValueError("STOP: source held; no further acquisition in this run")
    p = urllib.parse.urlsplit(url)
    if p.scheme != "https" or p.netloc != "www.vic.gov.au" or Path(name).name != name or name.startswith('.'):
        raise ValueError("Unapproved source or cache path")
    allowed = {INDEX, "https://www.vic.gov.au/robots.txt", "https://www.vic.gov.au/copyright"}
    links = stage / "discovery.json"
    if links.exists():
        allowed.update(json.loads(links.read_text()))
    if url not in allowed:
        raise ValueError("Only advertising index links and their published attachments are allowed")
    delay = 5.1
    if p.path != "/robots.txt":
        rules = robots_rules((cache / "robots.txt").read_text(), UA)
        if not robots_allowed(url, rules):
            raise ValueError("Disallowed by robots; no request made")
        # The publisher excludes document extension families. Do not use the
        # inconsistent case of some published links as a route around that hold.
        if p.path.startswith('/sites/default/files/') and not robots_allowed(url.lower(), rules):
            raise ValueError("Document extension family held by robots; no request made")
        delay = max([delay] + [float(v) for k, v in rules if k == "crawl-delay"])
    if any(r["url"] == url for r in ledger):
        raise ValueError("Already requested; use the retained snapshot")
    if ledger:
        time.sleep(max(0, delay - (time.time() - datetime.fromisoformat(ledger[-1]["completed_at"]).timestamp())))
    receipt = {"url": url, "snapshot": datetime.now(timezone.utc).isoformat(), "user_agent": UA}
    body, headers = b"", {}
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as response:
            body, headers = response.read(), dict(response.headers)
            receipt.update(status=response.status, content_type=response.headers.get("Content-Type"))
    except urllib.error.HTTPError as error:
        body, headers = error.read(), dict(error.headers)
        receipt.update(status=error.code, location=error.headers.get("Location"))
    except Exception as error:
        # Includes resets, TLS failures and truncated/aborted HTTP streams.
        # Preserve a compact stop receipt, never retry the request.
        receipt.update(status=None, error=type(error).__name__)
    challenge = is_challenge(body) or any(k.lower() == "cf-mitigated" and v.lower() == "challenge" for k, v in headers.items())
    receipt.update(sha256=hashlib.sha256(body).hexdigest(), bytes=len(body), challenge=challenge,
                   robots_allowed=True, completed_at=datetime.now(timezone.utc).isoformat())
    receipt["held"] = receipt["status"] != 200 or challenge
    receipt["body_retained"] = not receipt["held"]
    if not receipt["held"]:
        (cache / name).write_bytes(body)
        receipt["local_path"] = str((cache / name).relative_to(root))
    ledger.append(receipt)
    path.write_text(json.dumps(ledger, indent=2) + "\n")
    if receipt["held"]:
        raise ValueError(f"STOP: source held, HTTP {receipt['status']}; compact receipt retained")
    return receipt


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("url")
    cli.add_argument("cache_filename")
    args = cli.parse_args()
    print(json.dumps(fetch(args.url, args.cache_filename)))
