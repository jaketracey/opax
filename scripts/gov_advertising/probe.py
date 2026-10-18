"""Research-only, sequential source checks. Refusals stop the host permanently.

No document ingestion, retries, redirects, proxy, browser or production client.
Successful research pages stay in the ignored private evidence directory.
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from parli.ingest.http import USER_AGENT, is_challenge
from scripts.vic_gifts.acquire import NoRedirect, robots_allowed, robots_rules

ROOT = Path(__file__).resolve().parents[2]


class Probe:
    def __init__(self, ledger, cache):
        self.path, self.cache = Path(ledger), Path(cache)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.rows = json.loads(self.path.read_text()) if self.path.exists() else []
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self.rules = {}

    def get(self, url, kind="research"):
        host = urlsplit(url).netloc
        if any(r["host"] == host and r.get("stopped") for r in self.rows):
            return None
        previous = next((r for r in self.rows if r["url"] == url), None)
        if previous:
            return previous
        if kind != "robots":
            if host not in self.rules:
                policy = self.get("https://" + host + "/robots.txt", "robots")
                if not policy or policy["status"] != 200 or policy["stopped"]:
                    return None
                body = (self.cache / policy["sha256"]).read_text()
                self.rules[host] = robots_rules(body, USER_AGENT)
            if not robots_allowed(url, self.rules[host]):
                return None
        delay = max([5.1] + [float(v) for k, v in self.rules.get(host, []) if k == "crawl-delay"])
        if self.rows:
            time.sleep(max(0, delay - (time.time() - datetime.fromisoformat(self.rows[-1]["requested_at"]).timestamp())))
        started = datetime.now(timezone.utc).isoformat()
        body, status, error, headers = b"", None, None, {}
        try:
            response = self.opener.open(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=15)
            status, headers, body = response.status, dict(response.headers), response.read(4_000_001)
        except urllib.error.HTTPError as exc:
            status, headers, body = exc.code, dict(exc.headers), exc.read(4_000_001)
        except (OSError, TimeoutError) as exc:
            error = type(exc).__name__
        challenge = is_challenge(body) or any(k.lower() == "cf-mitigated" and v.lower() == "challenge" for k, v in headers.items())
        stopped = status in {401, 403, 429} or status is None or challenge or len(body) > 4_000_000
        row = {"url": url, "host": host, "kind": kind, "requested_at": started,
               "snapshot": datetime.now(timezone.utc).isoformat(), "status": status,
               "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
               "challenge": challenge, "error": error, "stopped": stopped,
               "body_retained": status == 200 and not stopped,
               "location": next((v for k, v in headers.items() if k.lower() == "location"), None)}
        if row["body_retained"]:
            (self.cache / row["sha256"]).write_bytes(body)
        self.rows.append(row)
        self.path.write_text(json.dumps(self.rows, indent=2) + "\n")
        print(json.dumps(row), flush=True)
        return row
