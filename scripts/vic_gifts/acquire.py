"""Polite, resumable Victorian source acquisition; staged receipts only.

Fresh runs use a new --out directory. A refusal permanently stops that run.
No proxies, browser fallback, automatic redirects or document-download bypass.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup
from parli.ingest import http as source_http

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = "https://www.vic.gov.au"
INDEX = ORIGIN + "/ministerial-gifts-benefits-and-hospitality-register"
IDENTITY = ROOT / "parli/ingest/user-agent.json"


def robots_rules(text, agent):
    """Combine repeated matching groups, including the publisher's two * groups."""
    groups, agents, rules = [], [], []
    for line in text.splitlines() + ["User-agent: __end__"]:
        key, sep, value = line.split("#", 1)[0].partition(":")
        if not sep:
            continue
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if rules:
                groups.append((agents, rules)); agents, rules = [], []
            agents.append(value.lower())
        elif agents and key in {"allow", "disallow", "crawl-delay"}:
            rules.append((key, value))
    matches = [(a, r) for a, r in groups if any(x == "*" or x in agent.lower() for x in a)]
    specific = [(a, r) for a, r in matches if any(x != "*" and x in agent.lower() for x in a)]
    return [rule for _, rules in (specific or matches) for rule in rules]


def robots_allowed(url, rules):
    path = urlsplit(url).path
    matches = []
    for key, value in rules:
        if key not in {"allow", "disallow"} or not value:
            continue
        pattern = re.escape(value).replace(r"\*", ".*")
        if pattern.endswith(r"\$"):
            pattern = pattern[:-2] + "$"
        if re.match(pattern, path):
            matches.append((len(value.replace("*", "")), key == "allow"))
    return max(matches, default=(0, True))[1]


def is_challenge(body, headers):
    from parli.ingest.http import is_challenge as shared_challenge
    return shared_challenge(body) or any(
        (k.lower() == "cf-mitigated" and v.lower() == "challenge") or k.lower() == "x-sucuri-block"
        for k, v in headers.items())


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


class Collector:
    def __init__(self, out):
        self.out = Path(out)
        (self.out / "snapshots").mkdir(parents=True, exist_ok=True)
        self.ledger_path = self.out / "receipts.json"
        self.ledger = json.loads(self.ledger_path.read_text()) if self.ledger_path.exists() else {"receipts": []}
        self.ua = json.loads(IDENTITY.read_bytes())["user_agent"]
        self.identity_hash = hashlib.sha256(IDENTITY.read_bytes()).hexdigest()
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self.rules = None
        self.robots = None
        self.delay = 2.1

    def save(self):
        self.ledger_path.write_text(json.dumps(self.ledger, indent=2) + "\n")

    def body(self, receipt):
        path = ROOT / receipt["snapshot_path"]
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != receipt["sha256"]:
            raise ValueError("Snapshot hash mismatch")
        return body

    def get(self, url, kind):
        if self.ledger.get("stopped"):
            raise SystemExit("Collection stopped: " + json.dumps(self.ledger["stopped"]))
        if urlsplit(url).netloc != "www.vic.gov.au":
            raise ValueError("Unreviewed source host")
        existing = next((r for r in self.ledger["receipts"] if r["url"] == url), None)
        if existing:
            return existing
        if kind != "robots" and (self.rules is None or not robots_allowed(url, self.rules)):
            raise ValueError("Robots policy denies URL: " + url)
        previous = self.ledger["receipts"][-1]["requested_at"] if self.ledger["receipts"] else None
        if previous:
            elapsed = time.time() - datetime.fromisoformat(previous).timestamp()
            time.sleep(max(0, self.delay - elapsed))
        started = datetime.now(timezone.utc).isoformat()
        headers, status, body, error = {}, None, b"", None
        try:
            source_http.ensure_allowed(url)
            r = self.opener.open(source_http.Request(url, headers={"User-Agent": self.ua}), timeout=30)
            status, headers, body = r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as exc:
            status, headers, body = exc.code, dict(exc.headers), exc.read()
        except (OSError, TimeoutError) as exc:
            error = type(exc).__name__
        sha = hashlib.sha256(body).hexdigest()
        path = self.out / "snapshots" / (sha + (".txt" if kind == "robots" else ".html"))
        path.write_bytes(body)
        challenge = is_challenge(body, headers)
        receipt = {"url": url, "kind": kind, "requested_at": started,
            "checked_at": datetime.now(timezone.utc).isoformat(), "status": status,
            "sha256": sha, "bytes": len(body), "snapshot_path": str(path.resolve().relative_to(ROOT)),
            "user_agent": self.ua, "identity_sha256": self.identity_hash,
            "previous_request_at": previous,
            "request_interval_seconds": datetime.fromisoformat(started).timestamp() - datetime.fromisoformat(previous).timestamp() if previous else None,
            "robots_receipt_sha256": self.robots["sha256"] if self.robots else None,
            "robots_allowed": kind == "robots" or robots_allowed(url, self.rules),
            "challenge": challenge, "error": error, "followed_redirect": False,
            "headers": {k: v for k, v in headers.items() if k.lower() in {"content-type", "location", "cf-mitigated", "x-sucuri-block"}}}
        self.ledger["receipts"].append(receipt)
        if status in {401, 403, 429} or challenge or status is None:
            self.ledger["stopped"] = {"url": url, "status": status,
                "reason": "challenge" if challenge else (error or f"HTTP {status}"), "receipt_sha256": sha}
        self.save()
        print(f"{kind}: HTTP {status}; {len(body)} bytes; {url}", flush=True)
        if self.ledger.get("stopped"):
            raise SystemExit("Collection stopped; receipt retained")
        return receipt

    def collect(self):
        self.robots = self.get(ORIGIN + "/robots.txt", "robots")
        if self.robots["status"] != 200:
            raise SystemExit("Usable robots policy unavailable; no content requests")
        self.rules = robots_rules(self.body(self.robots).decode(), self.ua)
        self.delay = max(2.1, *(float(v) for k, v in self.rules if k == "crawl-delay"))
        self.get(ORIGIN + "/copyright", "licence")
        index = self.get(INDEX, "index")
        if index["status"] != 200:
            raise SystemExit("Register index unavailable")
        self.get(ORIGIN + "/department-premier-and-cabinet", "owner")
        self.get(ORIGIN + "/disclaimer", "terms")
        soup = BeautifulSoup(self.body(index), "html.parser")
        main = soup.find("main")
        urls = list(dict.fromkeys(urljoin(INDEX, a["href"]) for a in main.find_all("a", href=True)
            if "Ministerial register of gifts" in a.get_text(" ", strip=True)))
        for url in urls:
            self.get(url, "period")
        print(f"Inventory discovery: {len(urls)} period URLs")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="data/staged/vic-gifts")
    args = parser.parse_args()
    Collector(args.out).collect()
