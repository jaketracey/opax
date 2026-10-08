"""FRL in-force legislative instruments: public metadata only, no DB or KB writes.

Run as ``python3 -m parli.ingest.frl_instruments``. All output is confined to
the checkout. Stable id ordering, checkpoint pages and two count receipts make
an incomplete acquisition ineligible for export. No document/content endpoints
are requested, and no identities or inferred legal relationships are created.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlencode, urlsplit
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[2]
API = "https://api.prod.legislation.gov.au/v1/titles"
SITE = "https://www.legislation.gov.au"
SCOPE = "collection eq 'LegislativeInstrument' and isInForce eq true"
# Unbounded/bulk filtered version expansion currently times out. The combined
# latest/current filter and relationship expansion also failed source probes.
# A single returned version is bounded and works; retain its flags verbatim,
# never assert it is the latest/current version when FRL says otherwise.
EXPAND = "administeringDepartments,versions($top=1)"
ID = re.compile(r"^[CF]\d{4}[A-Z]\d{5}$")
PAGE_SIZE = 100
UA = "OPAX metadata research (https://opax.com.au)"
LICENCE = "https://creativecommons.org/licenses/by/4.0/"


class Held(ValueError):
    """Exit 3: last good snapshot must be kept."""


def local_path(path: str | Path) -> Path:
    path = Path(path).resolve()
    if not path.is_relative_to(ROOT):
        raise Held("Output must remain inside this checkout")
    return path


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(tmp, path)


def guard_count(count: int, expected: int, previous: int = 0) -> None:
    if count <= 0 or count != expected:
        raise Held(f"Unique ids {count} do not reconcile with @odata.count {expected}")
    if previous and count < previous * .98:
        raise Held(f"Snapshot would shrink more than 2%: {previous} -> {count}")


class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"): self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"): self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip: self.parts.append(data)


class PoliteSession:
    """curl transport (HTTP/1.1), shared budget, delay and retry accounting.

    Capture subprocess output; never log command lines or arguments. curl's
    implicit retry/redirect behaviour is disabled so every request is counted.
    """
    def __init__(self, max_requests=600, initial_requests=0, sleep=time.sleep, clock=time.monotonic):
        self.max_requests = min(600, max_requests)
        self.requests = initial_requests
        self.sleep, self.clock = sleep, clock
        self.last = self.clock()
        self.delay = 2.0
        self.policies: dict[str, RobotFileParser] = {}
        self.guard_hours = False

    def get(self, url: str, allow_missing=False) -> bytes:
        host = urlsplit(url).netloc
        policy = self.policies.get(host)
        if policy and not policy.can_fetch(UA, url):
            raise Held("Publisher robots policy disallows this metadata path")
        delay = max(self.delay, 10 if host == "www.legislation.gov.au" else 2,
                    (policy.crawl_delay(UA) or policy.crawl_delay("*") or 2) if policy else 2)
        for attempt in range(5):
            if self.guard_hours and url.startswith(API):
                hour = datetime.now(timezone(timedelta(hours=10))).hour
                if 8 <= hour < 20: raise Held("Publisher busy hours began; resume outside 08:00–20:00 UTC+10")
            if self.requests >= self.max_requests:
                raise Held("Request budget reached; resume from the checkpoint")
            self.sleep(max(0, delay - (self.clock() - self.last)))
            if self.guard_hours and url.startswith(API):
                hour = datetime.now(timezone(timedelta(hours=10))).hour
                if 8 <= hour < 20: raise Held("Publisher busy hours began; checkpoint kept")
            self.requests += 1
            print(f"[frl-instruments] HTTP request {self.requests} (attempt {attempt + 1})", flush=True)
            result = subprocess.run([
                "curl", "--globoff", "--http1.1", "--compressed", "--max-time", "45", "--silent", "--show-error",
                "--user-agent", UA, "--dump-header", "-", "--write-out", "\n%{http_code}", url,
            ], capture_output=True)
            self.last = self.clock()
            raw, _, status = result.stdout.rpartition(b"\n")
            code = int(status) if status.isdigit() else 0
            # curl may include proxy/100 response headers before the final ones.
            while raw.startswith(b"HTTP/"):
                header, separator, body = raw.partition(b"\r\n\r\n")
                if not separator: break
                raw = body
            if not result.returncode and (code == 200 or allow_missing and code == 404):
                return raw if code == 200 else b""
            if code not in (0, 429) and code < 500:
                raise Held(f"Metadata request refused (HTTP {code}); checkpoint kept")
            if attempt == 4:
                raise Held(f"Metadata request failed after backoff (HTTP {code})")
            print(f"[frl-instruments] backoff after HTTP {code}, transport code {result.returncode}", flush=True)
            retry = re.search(rb"(?im)^retry-after:\s*([^\r\n]+)", result.stdout)
            pause = max(delay, 5 * 2 ** attempt)
            if retry:
                value = retry[1].decode()
                try:
                    pause = max(pause, float(value) if value.isdigit() else
                                (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds())
                except (ValueError, TypeError): pass
            self.sleep(pause)
        raise Held("Unreachable transport state")

    def json(self, params: dict) -> dict:
        # No date filters/order and no $top over 100.
        return json.loads(self.get(API + "?" + urlencode(params)))

    def access_policy(self) -> dict:
        receipts = {}
        for base in (SITE, "https://api.prod.legislation.gov.au"):
            robots = self.get(base + "/robots.txt", allow_missing=True).decode()
            policy = RobotFileParser(); policy.parse(robots.splitlines())
            self.policies[urlsplit(base).netloc] = policy
            self.delay = max(self.delay, policy.crawl_delay(UA) or policy.crawl_delay("*") or 2)
            receipts[base + "/robots.txt"] = robots or "HTTP 404: no robots policy supplied"
        # Website delay applies to website reads, API delay to API reads.
        self.delay = max(2, self.policies[urlsplit(API).netloc].crawl_delay("*") or 2)
        terms = self.get(SITE + "/terms-of-use").decode()
        reuse = self.get(SITE + "/help-and-resources/using-the-legislation-register/data-share-and-reuse").decode()
        parsed = Text(); parsed.feed(terms); text = " ".join(parsed.parts)
        if "Creative Commons Attribution 4.0" not in text:
            raise Held("FRL licence changed; publisher terms need review")
        parsed = Text(); parsed.feed(reuse); reuse_text = " ".join(parsed.parts)
        if not re.search(r"0800\s+to\s+2000.*UTC\s*\+10", reuse_text):
            raise Held("Publisher acquisition hours changed; review before fetching")
        # The publisher specifies UTC+10, not Sydney daylight-saving time.
        hour = datetime.now(timezone(timedelta(hours=10))).hour
        if 8 <= hour < 20:
            raise Held("Publisher busy hours (08:00–20:00 UTC+10); checkpoint kept")
        self.guard_hours = True
        return {"checked_at": datetime.now(timezone.utc).isoformat(), "robots": receipts,
                "terms_url": SITE + "/terms-of-use", "licence_url": LICENCE,
                "website_delay_seconds": 10, "api_delay_seconds": self.delay,
                "busy_hours": "08:00–20:00 UTC+10", "document_bodies": False}


def count_page(session) -> int:
    value = session.json({"$filter": SCOPE, "$orderby": "id", "$top": 1, "$count": "true"})
    count = value.get("@odata.count")
    if type(count) is not int or count < 1: raise Held("Missing or empty @odata.count")
    return count


def validate_title(row) -> None:
    if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not ID.fullmatch(row["id"]):
        raise Held("Invalid FRL id")
    if row.get("collection") != "LegislativeInstrument" or row.get("isInForce") is not True:
        raise Held("Out-of-scope title; snapshot held")
    if not isinstance(row.get("name"), str) or not row["name"]:
        raise Held("Title missing its authorised name")


def acquire(session, out: Path, checkpoint: Path, policy=None) -> dict:
    """Injectable HTTP session for offline paging/reconciliation tests."""
    out, checkpoint = local_path(out), local_path(checkpoint)
    started = time.monotonic()
    expected = count_page(session)
    previous = json.loads(out.read_text())["count"] if out.exists() else 0
    guard_count(expected, expected, previous)
    checkpoint.mkdir(parents=True, exist_ok=True)
    # Completed pages are never reused on a later weekly run: unchanged counts
    # do not mean unchanged titles, departments, status or versions.
    if (checkpoint / "complete.json").exists():
        for pattern in ("page-*.json", "titles-*.json"):
            for page_path in checkpoint.glob(pattern): page_path.unlink()
        (checkpoint / "complete.json").unlink()
        (checkpoint / "config.json").unlink(missing_ok=True)
    config = {"count": expected, "scope": SCOPE, "expand": EXPAND, "page_size": PAGE_SIZE}
    receipt = checkpoint / "config.json"
    if receipt.exists() and json.loads(receipt.read_text()) != config:
        raise Held("Checkpoint scope/count changed; start a fresh checkpoint directory")
    atomic_json(receipt, config)
    rows, seen, expanded_seen = [], set(), set()
    missing_expansions = []
    for offset in range(0, expected, PAGE_SIZE):
        # Expanded FRL results can omit a parent title. Enumerate the plain
        # title collection independently; never derive $skip from row counts
        # in a navigation expansion, and join metadata only by explicit id.
        base_path = checkpoint / f"titles-{offset:06d}.json"
        params = {"$filter": SCOPE, "$orderby": "id", "$top": PAGE_SIZE,
                  "$skip": offset, "$count": "true"}
        base = json.loads(base_path.read_text()) if base_path.exists() else session.json(params)
        values = base.get("value")
        if base.get("@odata.count") != expected:
            raise Held("Scope count changed during title paging; snapshot held")
        if not isinstance(values, list) or len(values) != min(PAGE_SIZE, expected - offset):
            raise Held("Plain title page incomplete; snapshot held")
        for row in values:
            validate_title(row)
            key = row["id"]
            if key in seen or rows and key <= rows[-1]["id"]:
                raise Held("Duplicate or non-increasing title ids; snapshot held")
            seen.add(key); rows.append(row)
        if not base_path.exists(): atomic_json(base_path, base)
        page_path = checkpoint / f"page-{offset:06d}.json"
        page = json.loads(page_path.read_text()) if page_path.exists() else session.json({**params, "$expand": EXPAND})
        if page.get("@odata.count") != expected:
            raise Held("Scope count changed during metadata paging; snapshot held")
        extras = page.get("value")
        if not isinstance(extras, list) or len(extras) > PAGE_SIZE:
            raise Held("Malformed expanded metadata page")
        by_id = {r["id"]: r for r in values}
        for row in extras:
            validate_title(row)
            key = row["id"]
            if key not in by_id or key in expanded_seen:
                raise Held("Expanded title ids do not match the plain page; snapshot held")
            original = by_id[key]
            if any(row.get(k) != v for k, v in original.items()):
                raise Held("Title metadata moved between plain and expanded reads; snapshot held")
            if not isinstance(row.get("versions"), list) or not isinstance(row.get("administeringDepartments"), list):
                raise Held("Expanded public metadata missing")
            if any(k.endswith("@odata.nextLink") for k in row):
                raise Held("Unfollowed metadata continuation; snapshot held")
            original.update(row)
            expanded_seen.add(key)
        for row in values:
            if row["id"] not in expanded_seen:
                # An absent navigation result is not an empty relationship or
                # evidence that the publisher supplied no departments/version.
                row["_opax_metadata"] = {"expansion_returned": False}
                missing_expansions.append(row["id"])
        if not page_path.exists(): atomic_json(page_path, page)
        print(f"[frl-instruments] reconciled {len(seen):,}/{expected:,} titles; "
              f"{len(expanded_seen):,} expanded metadata rows", flush=True)
    final_count = count_page(session)
    guard_count(len(seen), final_count, previous)
    if final_count != expected: raise Held("Count moved during acquisition")
    now = datetime.now(timezone.utc).isoformat()
    snapshot = {"schema": 1, "generated_at": now, "scope": SCOPE, "count": len(seen),
                "odata_count": final_count, "metadata_only": True,
                "version_scope": "First API-returned version per title; current/latest flags retained verbatim. Full history not acquired.",
                "metadata_coverage": {"expanded_titles": len(expanded_seen),
                                      "missing_expansion_ids": missing_expansions},
                "titles": rows}
    if out.exists() and json.loads(out.read_text()).get("titles") == rows:
        snapshot = json.loads(out.read_text())
    else: atomic_json(out, snapshot)
    run = {"rows": len(seen), "odata_count": final_count, "requests": session.requests,
           "runtime_seconds": round(time.monotonic() - started, 2), "completed_at": now,
           "metadata_coverage": snapshot["metadata_coverage"],
           "policy": policy, "snapshot": str(out.relative_to(ROOT))}
    atomic_json(out.parent / "run-receipt.json", run)
    atomic_json(checkpoint / "complete.json", {"completed_at": now, "count": len(seen)})
    print(json.dumps(run, ensure_ascii=False), flush=True)
    return snapshot


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default=str(ROOT / "scripts/state/frl/snapshot.json"))
    p.add_argument("--checkpoint", default=str(ROOT / "scripts/state/frl/checkpoint"))
    p.add_argument("--max-requests", type=int, default=600)
    args = p.parse_args()
    session = None
    started = time.monotonic()
    out = None
    try:
        out, checkpoint = local_path(args.out), local_path(args.checkpoint)
        session = PoliteSession(args.max_requests)
        policy = session.access_policy()
        acquire(session, out, checkpoint, policy)
        run_path = out.parent / "run-receipt.json"
        run = json.loads(run_path.read_text()); run["runtime_seconds"] = round(time.monotonic() - started, 2)
        atomic_json(run_path, run)
        return 0
    except (Held, OSError, ValueError, KeyError) as e:
        if out is not None:
            atomic_json(out.parent / "held-receipt.json", {
                "held_at": datetime.now(timezone.utc).isoformat(), "reason": str(e),
                "requests": session.requests if session else 0,
                "runtime_seconds": round(time.monotonic() - started, 2),
                "snapshot_written": False})
        print(f"FRL HELD: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
