"""FRL in-force legislative instruments: public metadata only, no DB or KB writes.

Run as ``python3 -m parli.ingest.frl_instruments``. All output is confined to
the checkout. Stable id ordering, checkpoint pages and two count receipts reconcile
exported ids plus tightly bounded, evidenced plain-page gaps. No document/content endpoints
are requested, and no identities or inferred legal relationships are created.
"""
from __future__ import annotations

import argparse
from datetime import datetime, time as day_time, timedelta, timezone
from zoneinfo import ZoneInfo
import hashlib
import shutil
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
FIELDS = "*"  # All public title fields; default publisher projection, no $select.
EXPANSION_TRIES = 3
MAX_INDIVIDUAL_IDS = 50
MAX_GAP_PROBES = 40
MAX_UNRESOLVED_GAP = 10
MELBOURNE = ZoneInfo("Australia/Melbourne")
FIXED_AEST = timezone(timedelta(hours=10))
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


def guard_reconciliation(exported, count, gap=0, pages=None, previous=0):
    """Only evidenced plain-page gaps may explain a difference from FRL's count."""
    pages = [] if pages is None else pages
    if any(type(n) is not int for n in (exported, count, gap)) or exported < 1 or gap < 0:
        raise Held("Invalid or empty title reconciliation")
    guard_count(exported + gap, count)
    if gap > MAX_UNRESOLVED_GAP or gap * 2000 > count:
        raise Held("Unresolved plain-title gap exceeds 10 rows or 0.05% of the source count")
    if not isinstance(pages, list) or any(not isinstance(p, dict)
            or type(p.get("offset")) is not int or p["offset"] < 0 or p["offset"] % PAGE_SIZE
            or p["offset"] >= count or type(p.get("unresolved_gap")) is not int
            or not 0 < p["unresolved_gap"] <= min(PAGE_SIZE, count - p["offset"]) for p in pages):
        raise Held("Invalid plain-title gap offsets")
    if len({p["offset"] for p in pages}) != len(pages) or sum(p["unresolved_gap"] for p in pages) != gap:
        raise Held("Plain-title gap evidence does not reconcile")
    if previous and exported < previous * .98:
        raise Held(f"Snapshot would shrink more than 2%: {previous} -> {exported}")


def utc_now():
    return datetime.now(timezone.utc)


def quiet_window(now: datetime) -> dict:
    """Intersection of 20:00–08:00 in fixed AEST and Melbourne local time."""
    intervals = []
    for zone in (FIXED_AEST, MELBOURNE):
        local = now.astimezone(zone)
        if 8 <= local.hour < 20:
            raise Held("Publisher busy hours: 08:00–20:00 in UTC+10 or Australia/Melbourne")
        start_day = local.date() if local.hour >= 20 else local.date() - timedelta(days=1)
        start = datetime.combine(start_day, day_time(20), tzinfo=zone).astimezone(timezone.utc)
        end = datetime.combine(start_day + timedelta(days=1), day_time(8), tzinfo=zone).astimezone(timezone.utc)
        intervals.append((start, end))
    return {"start": max(v[0] for v in intervals).isoformat(),
            "end": min(v[1] for v in intervals).isoformat()}


def checkpoint_config(count: int, window: dict) -> dict:
    query = {"filter": SCOPE, "fields": FIELDS, "expand": EXPAND,
             "count": count, "orderby": "id", "page_size": PAGE_SIZE,
             "plain_gap_strategy": "overlap-10/single/boundaries/reverse-id-projection-v1",
             "max_gap_probes": MAX_GAP_PROBES, "max_unresolved_gap": MAX_UNRESOLVED_GAP,
             "max_gap_fraction": "0.0005"}
    fingerprint = hashlib.sha256(json.dumps(query, sort_keys=True).encode()).hexdigest()
    return {"schema": 3, **query, "fingerprint": fingerprint, "quiet_window": window}


def prepare_checkpoint(checkpoint: Path, config: dict) -> None:
    """Keep the most recent rejected/completed checkpoint beside its replacement."""
    if checkpoint.exists():
        try: old = json.loads((checkpoint / "config.json").read_text())
        except (OSError, ValueError): old = None
        if old != config or (checkpoint / "complete.json").exists():
            previous = local_path(checkpoint.with_name(checkpoint.name + ".previous"))
            if previous.exists(): shutil.rmtree(previous)
            checkpoint.replace(previous)
            print("[frl-instruments] checkpoint rotated; previous evidence retained", flush=True)
    checkpoint.mkdir(parents=True, exist_ok=True)
    atomic_json(checkpoint / "config.json", config)


def validate_expanded_title(row: dict, original: dict) -> None:
    validate_title(row)
    if row["id"] != original["id"]:
        raise Held("Individual expansion returned a different FRL id")
    if any(row.get(k) != v for k, v in original.items()):
        raise Held("Title metadata moved between plain and expanded reads")
    # Explicit [] on this id is source evidence; an absent field is not [].
    if not all(isinstance(row.get(k), list) for k in ("versions", "administeringDepartments")):
        raise Held("Expanded public fields missing")
    if any(k.endswith("@odata.nextLink") for k in row):
        raise Held("Unfollowed metadata continuation")


def validate_expansion(page: dict, values: list, expected: int, allow_missing=False) -> dict:
    if not isinstance(page, dict) or page.get("@odata.count") != expected:
        raise Held("Expanded scope count changed")
    extras = page.get("value")
    if not isinstance(extras, list) or len(extras) > len(values) or not allow_missing and len(extras) != len(values):
        raise Held("Expanded metadata omitted a parent title")
    base = {r["id"]: r for r in values}
    matched = {}
    for row in extras:
        validate_title(row)
        key = row["id"]
        if key not in base or key in matched:
            raise Held("Expanded title ids do not match the plain page")
        validate_expanded_title(row, base[key])
        matched[key] = row
    return matched


def expanded_page(session, checkpoint: Path, offset: int, params: dict, values: list, expected: int, individuals: dict) -> dict:
    path = checkpoint / f"page-{offset:06d}.json"
    if path.exists():
        try: return validate_expansion(json.loads(path.read_text()), values, expected)
        except (Held, ValueError, TypeError):
            path.replace(checkpoint / f"rejected-cached-{offset:06d}.json")
    for attempt in range(EXPANSION_TRIES):
        try:
            page = session.json({**params, "$expand": EXPAND})
        except json.JSONDecodeError:
            page = {"error": "Invalid JSON response from expansion read"}
        # Plain-gap candidates already have their own complete entity response.
        # Fill only those ids, after checking the bulk response is a valid subset.
        try:
            recovered_ids = []
            if any(v.get("reason") == "plain_gap" and v.get("page_offset") == offset for v in individuals.values()):
                partial = validate_expansion(page, values, expected, allow_missing=True)
                for original in values:
                    key = original["id"]; saved = individuals.get(key, {})
                    if key not in partial and saved.get("reason") == "plain_gap" and saved.get("status") == "complete":
                        row = saved["response"]
                        validate_expanded_title(row, original)
                        partial[key] = row; recovered_ids.append(key)
                page = {**page, "value": [partial[r["id"]] for r in values if r["id"] in partial],
                        "_opax_individual_ids": recovered_ids}
            matched = validate_expansion(page, values, expected)
            atomic_json(path, page)
            return matched
        except (Held, ValueError, TypeError):
            atomic_json(checkpoint / f"rejected-{offset:06d}-{attempt + 1}.json", page)
            if attempt + 1 < EXPANSION_TRIES:
                getattr(session, "sleep", lambda _: None)(5 * 2 ** attempt)
    # Recover only a valid subset of the requested page. Wrong ids, moved
    # counts/fields or malformed responses still cannot supply title metadata.
    try:
        matched = validate_expansion(page, values, expected, allow_missing=True)
    except (Held, ValueError, TypeError) as error:
        raise Held(f"Expanded page {offset} incomplete after {EXPANSION_TRIES} attempts: {error}; snapshot kept") from error
    missing = [row for row in values if row["id"] not in matched]
    if len(set(individuals) | {r["id"] for r in missing}) > MAX_INDIVIDUAL_IDS:
        raise Held(f"More than {MAX_INDIVIDUAL_IDS} individual expansion ids: systemic source fault; snapshot kept")
    evidence = checkpoint / "individual-fetches.json"
    entity_params = {"$expand": EXPAND}
    if FIELDS != "*": entity_params["$select"] = FIELDS
    for original in missing:
        key = original["id"]
        individuals[key] = {"page_offset": offset, "status": "requested"}
        atomic_json(evidence, individuals)  # Evidence also survives held runs.
        try:
            row = session.title_json(key, entity_params)
            individuals[key]["response"] = row
            validate_expanded_title(row, original)
        except (Held, OSError, ValueError, TypeError) as error:
            individuals[key].update(status="failed", error=str(error))
            atomic_json(evidence, individuals)
            raise Held(f"Expanded page {offset} incomplete after {EXPANSION_TRIES} attempts; individual {key} failed: {error}; snapshot kept") from error
        individuals[key]["status"] = "complete"
        atomic_json(evidence, individuals)
        matched[key] = row  # Only this id's own response can fill its gap.
    # Keep rejected publisher pages and individual responses separately. This
    # assembled cache is explicitly marked as OPAX's recovery, outside rows.
    recovered = {**page, "value": [matched[r["id"]] for r in values],
                 "_opax_individual_ids": [r["id"] for r in missing]}
    validate_expansion(recovered, values, expected)
    atomic_json(path, recovered)
    return matched


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
    def __init__(self, max_requests=600, initial_requests=0, sleep=time.sleep, clock=time.monotonic, now=utc_now):
        self.max_requests = min(600, max_requests)
        self.requests = initial_requests
        self.sleep, self.clock = sleep, clock
        self.last = self.clock()
        self.delay = 2.0
        self.policies: dict[str, RobotFileParser] = {}
        self.now = now
        self.window = None

    def check_window(self):
        current = quiet_window(self.now())
        if self.window is not None and current != self.window:
            raise Held("Acquisition quiet window expired")
        self.window = current

    def get(self, url: str, allow_missing=False) -> bytes:
        host = urlsplit(url).netloc
        publisher = host == "legislation.gov.au" or host.endswith(".legislation.gov.au")
        if publisher: self.check_window()
        policy = self.policies.get(host)
        if policy and not policy.can_fetch(UA, url):
            raise Held("Publisher robots policy disallows this metadata path")
        delay = max(self.delay, 10 if host == "www.legislation.gov.au" else 2,
                    (policy.crawl_delay(UA) or policy.crawl_delay("*") or 2) if policy else 2)
        for attempt in range(5):
            if publisher: self.check_window()
            if self.requests >= self.max_requests:
                raise Held("Request budget reached; resume from the checkpoint")
            self.sleep(max(0, delay - (self.clock() - self.last)))
            if publisher: self.check_window()
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

    def title_json(self, key: str, params: dict) -> dict:
        if not ID.fullmatch(key): raise Held("Invalid individual FRL id")
        # OData string key on the cached OpenAPI /v1/titles({key}) endpoint.
        # Same transport owns spacing, quiet hours, backoff and request budget.
        return json.loads(self.get(API + f"('{key}')?" + urlencode(params)))

    def access_policy(self) -> dict:
        self.check_window()  # Before robots, terms or any other publisher probe.
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
        window = quiet_window(self.now())
        return {"checked_at": self.now().isoformat(), "robots": receipts,
                "terms_url": SITE + "/terms-of-use", "licence_url": LICENCE,
                "website_delay_seconds": 10, "api_delay_seconds": self.delay,
                "busy_hours": "08:00–20:00 in UTC+10 or Australia/Melbourne",
                "quiet_window": window, "document_bodies": False}


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


class GapProbes:
    """Bound all recovery reads, including transport retries, across a checkpoint."""
    def __init__(self, session, checkpoint):
        self.session, self.path = session, checkpoint / "plain-gap-probes.json"
        self.data = json.loads(self.path.read_text()) if self.path.exists() else {"requests": 0, "pages": {}, "reads": []}
        if type(self.data.get("requests")) is not int or not 0 <= self.data["requests"] <= MAX_GAP_PROBES:
            raise Held("Invalid plain-gap probe evidence")

    @property
    def remaining(self): return MAX_GAP_PROBES - self.data["requests"]

    def read(self, purpose, params, key=None):
        if not self.remaining: return None
        before = self.session.requests
        limit = getattr(self.session, "max_requests", None)
        if limit is not None:
            self.session.max_requests = min(limit, before + self.remaining)
        entry = {"purpose": purpose, "query": params, "id": key}
        self.data["reads"].append(entry)
        atomic_json(self.path, self.data)
        try:
            response = self.session.title_json(key, params) if key else self.session.json(params)
            entry["response"] = response
            return response
        except Held as error:
            entry["error"] = str(error)
            if (str(error) == "Request budget reached; resume from the checkpoint"
                    and limit is not None and self.session.max_requests < limit
                    and self.session.requests >= self.session.max_requests):
                entry["probe_budget_exhausted"] = True
                return None
            # Unsupported alternatives / unavailable candidates are evidence.
            # Busy hours, throttling, caps and transport failures always stop.
            if re.fullmatch(r"Metadata request refused \(HTTP (400|404)\); checkpoint kept", str(error)):
                return None
            raise
        finally:
            self.data["requests"] += self.session.requests - before
            if limit is not None: self.session.max_requests = limit
            atomic_json(self.path, self.data)


def recover_plain_page(session, checkpoint, offset, params, base, expected, probes, individuals):
    size = min(PAGE_SIZE, expected - offset)
    values = base.get("value")
    if not isinstance(values, list) or len(values) > size:
        raise Held("Malformed plain title page; snapshot held")
    for row in values: validate_title(row)
    keys = [r["id"] for r in values]
    if keys != sorted(set(keys)): raise Held("Duplicate or unordered plain title page")
    if "_opax_plain_gap" in base: return base  # same fingerprint/window only
    if len(values) == size: return base
    if offset + size == expected:
        raise Held("Final plain title page incomplete; snapshot held")
    atomic_json(checkpoint / f"rejected-plain-{offset:06d}.json", base)
    page = probes.data["pages"].setdefault(str(offset), {"expected": size, "received": len(values),
        "missing_positions": [], "candidate_ids": [], "resolved_ids": []})
    known = {r["id"]: r for r in values}
    discovered = {}
    def listing(query, purpose, projected=False):
        result = probes.read(purpose, query)
        if result is None: return []
        if not isinstance(result, dict) or result.get("@odata.count") != expected:
            raise Held("Scope count changed during gap probing")
        rows = result.get("value")
        if not isinstance(rows, list) or len(rows) > query["$top"]:
            raise Held("Malformed plain-gap listing")
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not ID.fullmatch(row["id"]):
                raise Held("Invalid gap candidate id")
            if not projected: validate_title(row)
        ids = [r["id"] for r in rows]
        if ids != sorted(set(ids), reverse=query["$orderby"] == "id desc"):
            raise Held("Unordered plain-gap listing")
        return rows
    def remember(rows):
        for row in rows:
            key = row["id"]
            if key in known and any(known[key].get(k) != v for k, v in row.items()):
                raise Held("Title metadata moved during gap probing")
            if key not in known: discovered.setdefault(key, row)
    positions = set()
    # Ten-row windows overlap by one position. Only short windows need single reads.
    for start in range(offset, offset + size, 9):
        if not probes.remaining: break
        width = min(10, offset + size - start)
        rows = listing({**params, "$skip": start, "$top": width}, "overlapping window")
        remember(rows)
        if len(rows) < width: positions.update(range(start, start + width))
    for position in sorted(positions):
        if not probes.remaining: break
        rows = listing({**params, "$skip": position, "$top": 1}, "localise position")
        remember(rows)
        if not rows or any(r["id"] not in known for r in rows): page["missing_positions"].append(position)
    # Explicit neighbours bound the page. No arithmetic is performed on FRL ids.
    lower, upper = None, None
    for position, side in ((offset - 1, "lower"), (offset + size, "upper")):
        if position < 0 or position >= expected or not probes.remaining: continue
        neighbours = listing({**params, "$skip": position, "$top": 1}, "neighbour boundary")
        if neighbours:
            if side == "lower": lower = neighbours[0]["id"]
            else: upper = neighbours[0]["id"]
    if probes.remaining:
        # OData id projection avoids full-row serialisation. Reverse id order is
        # stable and mirrors the same positions; both directions retain the scope.
        alternative = {**params, "$orderby": "id desc", "$skip": expected - offset - size,
                       "$top": size, "$select": "id"}
        remember(listing(alternative, "alternative id listing", projected=True))
    original_first, original_last = keys[0] if keys else None, keys[-1] if keys else None
    for key, candidate in sorted(discovered.items()):
        # Without an explicit neighbour, admit only candidates between known
        # page rows. Boundary rows themselves cannot masquerade as missing ids.
        if lower is not None and key <= lower or upper is not None and key >= upper: continue
        if offset > 0 and lower is None and original_first is not None and key < original_first: continue
        if upper is None and original_last is not None and key > original_last: continue
        page["candidate_ids"].append(key)
        if not probes.remaining: break
        if len(set(individuals) | {key}) > MAX_INDIVIDUAL_IDS:
            raise Held("More than 50 individual expansion ids: systemic source fault")
        evidence = checkpoint / "individual-fetches.json"
        individuals[key] = {"page_offset": offset, "reason": "plain_gap", "status": "requested"}
        atomic_json(evidence, individuals)
        row = probes.read("individual gap candidate", {"$expand": EXPAND}, key)
        individuals[key]["response"] = row
        if row is None:
            individuals[key]["status"] = "unavailable"
            atomic_json(evidence, individuals)
            continue
        if not isinstance(row, dict) or row.get("id") != key:
            individuals[key]["status"] = "wrong_id"
            atomic_json(evidence, individuals)
            raise Held("Individual gap candidate returned a different FRL id")
        if row.get("collection") != "LegislativeInstrument" or row.get("isInForce") is not True:
            individuals[key]["status"] = "out_of_scope"
            atomic_json(evidence, individuals)
            continue
        validate_expanded_title(row, candidate)
        individuals[key] = {"page_offset": offset, "reason": "plain_gap", "status": "complete", "response": row}
        atomic_json(evidence, individuals)
        known[key] = row
        page["resolved_ids"].append(key)
    if len(known) > size: raise Held("Gap recovery returned too many page ids")
    page["unresolved_gap"] = size - len(known)
    page["probe_budget_exhausted"] = not probes.remaining
    atomic_json(probes.path, probes.data)
    return {**base, "value": [known[k] for k in sorted(known)], "_opax_plain_gap": page}


def acquire(session, out: Path, checkpoint: Path, policy=None, now=None) -> dict:
    """Injectable HTTP session for offline paging/reconciliation tests."""
    out, checkpoint = local_path(out), local_path(checkpoint)
    started = time.monotonic()
    now = now or getattr(session, "now", utc_now)
    window = quiet_window(now())
    expected = count_page(session)
    old = json.loads(out.read_text()) if out.exists() else {}
    previous = old.get("exported", old.get("count", 0))
    guard_count(expected, expected, previous)
    prepare_checkpoint(checkpoint, checkpoint_config(expected, window))
    probes = GapProbes(session, checkpoint)
    evidence = checkpoint / "individual-fetches.json"
    individuals = json.loads(evidence.read_text()) if evidence.exists() else {}
    if not isinstance(individuals, dict) or len(individuals) > MAX_INDIVIDUAL_IDS:
        raise Held("Invalid or excessive individual expansion evidence; snapshot kept")
    rows, seen, expanded_seen, gap_pages = [], set(), set(), []
    for offset in range(0, expected, PAGE_SIZE):
        if quiet_window(now()) != window: raise Held("Acquisition quiet window expired")
        # Expanded FRL results can omit a parent title. Enumerate the plain
        # title collection independently; never derive $skip from row counts
        # in a navigation expansion, and join metadata only by explicit id.
        base_path = checkpoint / f"titles-{offset:06d}.json"
        params = {"$filter": SCOPE, "$orderby": "id", "$top": PAGE_SIZE,
                  "$skip": offset, "$count": "true"}
        if FIELDS != "*": params["$select"] = FIELDS
        base = json.loads(base_path.read_text()) if base_path.exists() else session.json(params)
        values = base.get("value")
        if base.get("@odata.count") != expected:
            raise Held("Scope count changed during title paging; snapshot held")
        base = recover_plain_page(session, checkpoint, offset, params, base, expected, probes, individuals)
        values = base["value"]
        gap = base.get("_opax_plain_gap", {}).get("unresolved_gap", 0)
        if gap:
            gap_pages.append({"offset": offset, "unresolved_gap": gap})
            total_gap = sum(p["unresolved_gap"] for p in gap_pages)
            if total_gap > MAX_UNRESOLVED_GAP or total_gap * 2000 > expected:
                raise Held("Unresolved plain-title gap exceeds 10 rows or 0.05% of the source count")
        for row in values:
            validate_title(row)
            key = row["id"]
            if key in seen or rows and key <= rows[-1]["id"]:
                raise Held("Duplicate or non-increasing title ids; snapshot held")
            seen.add(key); rows.append(row)
        if not base_path.exists(): atomic_json(base_path, base)
        matched = expanded_page(session, checkpoint, offset, params, values, expected, individuals)
        for row in values:
            row.update(matched[row["id"]])
            expanded_seen.add(row["id"])
        print(f"[frl-instruments] reconciled {len(seen):,}/{expected:,} titles; "
              f"{len(expanded_seen):,} expanded metadata rows", flush=True)
    final_count = count_page(session)
    unresolved_gap = sum(p["unresolved_gap"] for p in gap_pages)
    guard_reconciliation(len(seen), final_count, unresolved_gap, gap_pages, previous)
    if final_count != expected: raise Held("Count moved during acquisition")
    if quiet_window(now()) != window: raise Held("Acquisition quiet window expired")
    downloaded = now().isoformat()
    snapshot = {"schema": 1, "generated_at": downloaded, "downloaded_at": downloaded, "scope": SCOPE, "count": final_count,
                "exported": len(seen), "unresolved_gap": unresolved_gap, "gap_pages": gap_pages,
                "odata_count": final_count, "metadata_only": True,
                "version_scope": "First API-returned version per title; current/latest flags retained verbatim. Full history not acquired.",
                "metadata_coverage": {"expanded_titles": len(expanded_seen),
                                      "missing_expansion_ids": []},
                "plain_gap_evidence": probes.data, "titles": rows}
    if out.exists() and json.loads(out.read_text()).get("titles") == rows:
        snapshot["generated_at"] = json.loads(out.read_text())["generated_at"]
    # Content can be identical, but the latest download receipt must advance.
    atomic_json(out, snapshot)
    run = {"rows": len(seen), "odata_count": final_count, "requests": session.requests,
           "runtime_seconds": round(time.monotonic() - started, 2), "completed_at": downloaded,
           "metadata_coverage": snapshot["metadata_coverage"],
           "individual_fetch_ids": sorted(individuals),
           "unresolved_gap": unresolved_gap, "gap_pages": gap_pages,
           "gap_probe_requests": probes.data["requests"],
           "policy": policy, "snapshot": str(out.relative_to(ROOT))}
    atomic_json(out.parent / "run-receipt.json", run)
    atomic_json(checkpoint / "complete.json", {"completed_at": downloaded, "count": final_count,
                "exported": len(seen), "unresolved_gap": unresolved_gap})
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
