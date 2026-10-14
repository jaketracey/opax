"""Polite source acquisition into staging, with a permanent stop on refusal.

Only reviewed parliament hosts are allowed. Documents are link-only: this
collector does not download PDFs or explanatory material.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import fcntl
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from scripts.vic_gifts.acquire import NoRedirect, is_challenge, robots_rules
from parli.ingest import http as source_http

ROOT = Path(__file__).resolve().parents[2]
ORIGINS = {"tas": "https://www.parliament.tas.gov.au", "act": "https://www.parliament.act.gov.au"}


def robots_allowed(url, rules):
    parsed = urlsplit(url)
    path = parsed.path + ("?" + parsed.query if parsed.query else "")
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


class Collector:
    def __init__(self, jurisdiction, root=ROOT, opener=None):
        self.root = root
        self.origin = ORIGINS[jurisdiction]
        self.stage = root / "data/staged" / ("bills-" + jurisdiction)
        (self.stage / "snapshots").mkdir(parents=True, exist_ok=True)
        self.path = self.stage / "receipts.json"
        self.ledger = json.loads(self.path.read_bytes()) if self.path.exists() else {"receipts": []}
        self.ua = json.loads((root / "parli/ingest/user-agent.json").read_bytes())["user_agent"]
        self.opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self.rules = None
        self.delay = 3.1
        self.robots = None

    def body(self, receipt):
        data = (self.root / receipt["snapshot_path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != receipt["sha256"]:
            raise ValueError("Snapshot hash mismatch")
        return data

    def get(self, url, kind):
        # A host-level lock also protects resumed CLI runs from stale ledgers.
        with (self.stage / ".acquire.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if self.path.exists():
                self.ledger = json.loads(self.path.read_bytes())
            return self._get(url, kind)

    def _get(self, url, kind):
        if self.ledger.get("stopped"):
            raise ValueError("Collection permanently stopped: " + str(self.ledger["stopped"]))
        if urlsplit(url).scheme != "https" or urlsplit(url).netloc != urlsplit(self.origin).netloc:
            raise ValueError("Unreviewed source host")
        document_path = urlsplit(url).path
        if document_path.lower().endswith((".pdf", ".doc", ".docx")) and not (
                kind == "registry-document" and document_path.rsplit("/", 1)[-1].startswith("Report-Bills-List")):
            raise ValueError("Document bodies are held; link only")
        existing = next((r for r in self.ledger["receipts"] if r["url"] == url), None)
        if existing:
            return existing
        if kind != "robots" and (self.rules is None or not robots_allowed(url, self.rules)):
            raise ValueError("Robots denies source URL: " + url)
        previous = self.ledger["receipts"][-1]["requested_at"] if self.ledger["receipts"] else None
        if previous:
            time.sleep(max(0, self.delay - (time.time() - datetime.fromisoformat(previous).timestamp())))
        started = datetime.now(timezone.utc).isoformat()
        status, headers, data, error = None, {}, b"", None
        try:
            source_http.ensure_allowed(url)
            with self.opener.open(source_http.Request(url, headers={"User-Agent": self.ua}), timeout=30) as response:
                status, headers, data = response.status, dict(response.headers), response.read()
        except urllib.error.HTTPError as exc:
            status, headers, data = exc.code, dict(exc.headers), exc.read()
        except (OSError, TimeoutError) as exc:
            error = type(exc).__name__
        sha = hashlib.sha256(data).hexdigest()
        extension = Path(urlsplit(url).path).suffix if kind == "registry-document" else ".txt" if kind == "robots" else ".html"
        path = self.stage / "snapshots" / (sha + extension)
        path.write_bytes(data)
        challenge = is_challenge(data, headers)
        receipt = {"url": url, "kind": kind, "requested_at": started,
            "snapshot": datetime.now(timezone.utc).isoformat(), "status": status,
            "sha256": sha, "bytes": len(data), "snapshot_path": str(path.relative_to(self.root)),
            "user_agent": self.ua, "previous_request_at": previous,
            "request_interval_seconds": datetime.fromisoformat(started).timestamp() - datetime.fromisoformat(previous).timestamp() if previous else None,
            "robots_receipt_sha256": self.robots["sha256"] if self.robots else None,
            "robots_allowed": kind == "robots" or robots_allowed(url, self.rules),
            "challenge": challenge, "error": error, "followed_redirect": False,
            "headers": {k: v for k, v in headers.items() if k.lower() in {"content-type", "location", "cf-mitigated", "x-sucuri-block"}}}
        self.ledger["receipts"].append(receipt)
        if status in {401, 403, 429} or challenge or status is None:
            self.ledger["stopped"] = {"url": url, "status": status, "reason": "challenge" if challenge else error or f"HTTP {status}", "receipt_sha256": sha}
        self.path.write_text(json.dumps(self.ledger, indent=2) + "\n")
        print(f"{kind}: HTTP {status}; {len(data)} bytes; {url}", flush=True)
        if self.ledger.get("stopped"):
            raise ValueError("Collection stopped; receipt retained")
        return receipt

    def policy(self):
        self.robots = self.get(self.origin + "/robots.txt", "robots")
        if self.robots["status"] != 200:
            raise ValueError("No usable robots policy")
        self.rules = robots_rules(self.body(self.robots).decode(), self.ua)
        self.delay = max([self.delay, *(float(v) for k, v in self.rules if k == "crawl-delay")])

    def inventory(self, jurisdiction):
        from bs4 import BeautifulSoup
        self.policy()
        if jurisdiction == "tas":
            self.get(self.origin + "/", "discovery")  # Publisher copyright notice.
            self.get(self.origin + "/bills", "index")
            urls = set()
            for year in (2024, 2025, 2026):
                r = self.get(self.origin + "/bills/bills-introduced-into-parliament-" + str(year), "registry")
                main = BeautifulSoup(self.body(r), "html.parser").find("main")
                urls.update(a["href"] for a in main.find_all("a", href=True) if "/bills/bills20" in a["href"] and "Bill" in a.get_text())
            for url in sorted(urls):
                self.get(url, "bill")
        else:
            self.get(self.origin + "/functions/footer/reuse-policy", "licence")
            base = self.origin + "/parliamentary-business/in-the-chamber/"
            self.get(base + "bills", "index")
            for prefix in (base + "bills/", base + "previous-assemblies/tenth-assembly/"):
                for page in ("bills_volume", "summary_of_bills", "bills_list"):
                    r = self.get(prefix + page, "registry")
                table = BeautifulSoup(self.body(r), "html.parser").find("table")
                url = next(a["href"] for a in table.find_all("a", href=True) if ".docx" in a["href"])
                self.get(url, "registry-document")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jurisdiction", choices=ORIGINS)
    parser.add_argument("url", nargs="?")
    parser.add_argument("--kind", default="discovery")
    args = parser.parse_args()
    c = Collector(args.jurisdiction)
    if args.url:
        c.policy()
        c.get(args.url, args.kind)
    else:
        c.inventory(args.jurisdiction)
