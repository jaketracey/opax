"""FRL in-force legislative instruments: public metadata only, no DB or KB writes.

Run as ``python3 -m parli.ingest.frl_instruments``. All output is confined to
the checkout. Stable id ordering, checkpoint pages and per-page count receipts reconcile
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
import math
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
MAX_DRIFT = 50
MAX_REQUESTS = 900
TAIL_REQUESTS = 100
MAX_TAIL_REQUESTS = 300
MIN_SPACING = 10.0
REQUEST_TIMEOUT = 45
WINDOW_MARGIN = 60
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


def guard_reconciliation(exported, count, gap=0, pages=None, previous=0, count_start=None):
    """Complete unique rows cover the live count minus evidenced plain gaps."""
    pages = [] if pages is None else pages
    if any(type(n) is not int for n in (exported, count, gap)) or exported < 1 or gap < 0:
        raise Held("Invalid or empty title reconciliation")
    if count_start is None:
        guard_count(exported + gap, count)
    elif type(count_start) is not int or count_start < 1 or abs(count - count_start) > MAX_DRIFT:
        raise Held("Scope count drift exceeds 50")
    elif exported + gap < count:
        raise Held(f"Unique ids {exported} plus evidenced gaps {gap} do not cover final count {count}")
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
             "orderby": "id", "page_size": PAGE_SIZE,
             "plain_gap_strategy": "overlap-10/single/boundaries/reverse-id-projection-v1",
             "max_gap_probes": MAX_GAP_PROBES, "max_unresolved_gap": MAX_UNRESOLVED_GAP,
             "max_gap_fraction": "0.0005", "max_drift": MAX_DRIFT,
             "tail_strategy": "final-pages/prefix-id-backfill-v1"}
    fingerprint = hashlib.sha256(json.dumps(query, sort_keys=True).encode()).hexdigest()
    return {"schema": 4, **query, "count_start": count, "fingerprint": fingerprint, "quiet_window": window}


def prepare_checkpoint(checkpoint: Path, config: dict) -> tuple[dict, bool]:
    """Keep the most recent rejected/completed checkpoint beside its replacement."""
    if checkpoint.exists():
        try: old = json.loads((checkpoint / "config.json").read_text())
        except (OSError, ValueError): old = None
        # Migrate only the previous, fully specified title query. Its offsets
        # and gap allowances are never trusted: current membership is reread,
        # and complete expansion bodies are reused only by matching source id.
        migrate = (isinstance(old, dict) and old.get('schema') == 3
                   and type(old.get('count')) is int and old['count'] > 0
                   and abs(old['count'] - config['count_start']) <= MAX_DRIFT
                   and all(old.get(k) == config[k] for k in ('filter', 'fields', 'expand', 'orderby', 'page_size'))
                   and not (checkpoint / 'complete.json').exists())
        if migrate:
            config['count_start'] = old['count']
            config['previous_window'] = old.get('quiet_window')
            atomic_json(checkpoint / 'previous-config.json', old)
            atomic_json(checkpoint / 'config.json', config)
            print('[frl-instruments] prior query migrated; rechecking membership before using metadata by id', flush=True)
            return config, True
        reusable = (isinstance(old, dict) and old.get("schema") == config["schema"]
                    and old.get("fingerprint") == config["fingerprint"]
                    and type(old.get("count_start")) is int
                    and abs(old["count_start"] - config["count_start"]) <= MAX_DRIFT
                    and not (checkpoint / "complete.json").exists())
        if not reusable:
            previous = local_path(checkpoint.with_name(checkpoint.name + ".previous"))
            if previous.exists(): shutil.rmtree(previous)
            checkpoint.replace(previous)
            print("[frl-instruments] checkpoint rotated; previous evidence retained", flush=True)
        else:
            # Counts are observations, not query identity. Across quiet windows
            # re-enumerate membership; reuse expansion bodies only by their id.
            fresh = old.get("quiet_window") != config["quiet_window"]
            config["count_start"] = old["count_start"]
            config["previous_window"] = old.get("quiet_window")
            atomic_json(checkpoint / "config.json", config)
            return config, fresh
    checkpoint.mkdir(parents=True, exist_ok=True)
    atomic_json(checkpoint / "config.json", config)
    return config, False


def request_budget(count: int, tail_requests=None) -> dict:
    if type(count) is not int or count < 1: raise Held("Invalid bootstrap count")
    pages = math.ceil(count / PAGE_SIZE)
    tail_requests = TAIL_REQUESTS if tail_requests is None else tail_requests
    planned = pages * 2 + MAX_GAP_PROBES + tail_requests + 8  # policy/count receipts
    retries = math.ceil(planned * .10)
    return {"pages": pages, "page_reads": pages * 2, "gap_probes": MAX_GAP_PROBES,
            "tail_sweep": tail_requests, "policy_and_counts": 8,
            "retry_allowance": retries, "cap": min(MAX_REQUESTS, planned + retries),
            "hard_ceiling": MAX_REQUESTS, "minimum_spacing_seconds": MIN_SPACING}


def guard_drift_evidence(count, start, end, drift, sweep):
    if (type(start) is not int or start < 1 or type(end) is not int or end != count
            or type(drift) is not int or drift != end - start or abs(drift) > MAX_DRIFT):
        raise Held('Invalid drift evidence')
    if (not isinstance(sweep, dict) or sweep.get('complete') is not True
            or any(type(sweep.get(k)) is not int or sweep[k] < 0
                   for k in ('requests', 'pages', 'prefix_pages', 'fetched', 'rounds'))
            or sweep['requests'] > MAX_TAIL_REQUESTS or sweep['pages'] > sweep['requests']
            or sweep['prefix_pages'] > sweep['pages'] or sweep['fetched'] > sweep['requests']
            or sweep['rounds'] > 3):
        raise Held('Incomplete tail sweep evidence')


class Counts:
    def __init__(self, checkpoint, start, now):
        self.path, self.start, self.now = checkpoint / "count-observations.json", start, now
        self.records = json.loads(self.path.read_text()) if self.path.exists() else []
        self.latest = start

    def observe(self, count, kind, offset=None, cached=False):
        if type(count) is not int or count < 1: raise Held("Missing or empty @odata.count")
        self.records.append({"count": count, "kind": kind, "offset": offset, "at": self.now().isoformat()})
        atomic_json(self.path, self.records)
        if abs(count - self.start) > MAX_DRIFT: raise Held("Scope count drift exceeds 50; checkpoint kept")
        if not cached: self.latest = count
        return count


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


def validate_expansion(page: dict, values: list, expected: int, allow_missing=False, drift=False) -> dict:
    if not isinstance(page, dict) or type(page.get("@odata.count")) is not int or not drift and page.get("@odata.count") != expected:
        raise Held("Expanded scope count changed")
    extras = page.get("value")
    if not isinstance(extras, list) or len(extras) > PAGE_SIZE or not drift and (len(extras) > len(values) or not allow_missing and len(extras) != len(values)):
        raise Held("Expanded metadata omitted a parent title")
    base = {r["id"]: r for r in values}
    matched = {}
    for row in extras:
        validate_title(row)
        key = row["id"]
        if key not in base and drift:
            continue  # A shifted neighbour cannot supply another id's metadata.
        if key not in base or key in matched:
            raise Held("Expanded title ids do not match the plain page")
        validate_expanded_title(row, base[key])
        matched[key] = row
    if not allow_missing and len(matched) != len(base): raise Held("Expanded metadata omitted a parent title")
    return matched


def expanded_page(session, checkpoint: Path, offset: int, params: dict, values: list, expected: int, individuals: dict, counts=None, cached=None) -> dict:
    path = checkpoint / f"page-{offset:06d}.json"
    drift = counts is not None and counts.latest != counts.start
    if cached is not None:
        matched = {}
        for original in values:
            row = cached.get(original['id'])
            if row is None: break
            try: validate_expanded_title(row, original)
            except Held: break
            matched[original['id']] = row
        if len(matched) == len(values):
            atomic_json(path, {"@odata.count": expected, "value": list(matched.values()),
                               "_opax_cached_ids": sorted(matched)})
            return matched
    if path.exists():
        try:
            saved = json.loads(path.read_text())
            if counts is not None and (type(saved.get('@odata.count')) is not int
                    or abs(saved['@odata.count'] - counts.start) > MAX_DRIFT):
                raise Held('Invalid cached expansion count')
            return validate_expansion(saved, values, expected, drift=drift)
        except (Held, ValueError, TypeError):
            path.replace(checkpoint / f"rejected-cached-{offset:06d}.json")
    for attempt in range(EXPANSION_TRIES):
        try:
            page = session.json({**params, "$expand": EXPAND})
        except json.JSONDecodeError:
            page = {"error": "Invalid JSON response from expansion read"}
        if counts is not None and isinstance(page, dict) and "@odata.count" in page:
            counts.observe(page["@odata.count"], "expanded", offset)
            drift = counts.latest != counts.start or page['@odata.count'] != expected
        # Plain-gap candidates already have their own complete entity response.
        # Fill only those ids, after checking the bulk response is a valid subset.
        try:
            recovered_ids = []
            if any(v.get("reason") == "plain_gap" and v.get("page_offset") == offset for v in individuals.values()):
                partial = validate_expansion(page, values, expected, allow_missing=True, drift=drift)
                for original in values:
                    key = original["id"]; saved = individuals.get(key, {})
                    if key not in partial and saved.get("reason") == "plain_gap" and saved.get("status") == "complete":
                        row = saved["response"]
                        validate_expanded_title(row, original)
                        partial[key] = row; recovered_ids.append(key)
                page = {**page, "value": [partial[r["id"]] for r in values if r["id"] in partial],
                        "_opax_individual_ids": recovered_ids}
            matched = validate_expansion(page, values, expected, drift=drift)
            atomic_json(path, page)
            return matched
        except (Held, ValueError, TypeError):
            atomic_json(checkpoint / f"rejected-{offset:06d}-{attempt + 1}.json", page)
            if attempt + 1 < EXPANSION_TRIES:
                getattr(session, "sleep", lambda _: None)(5 * 2 ** attempt)
    # Recover only a valid subset of the requested page. Wrong ids, moved
    # counts/fields or malformed responses still cannot supply title metadata.
    try:
        matched = validate_expansion(page, values, expected, allow_missing=True, drift=drift)
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
    validate_expansion(recovered, values, expected, drift=drift)
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
    def __init__(self, max_requests=None, initial_requests=0, sleep=time.sleep, clock=time.monotonic, now=utc_now):
        self.requested_cap = max_requests
        self.max_requests = min(MAX_REQUESTS, max_requests) if max_requests is not None else MAX_REQUESTS
        self.requests = initial_requests
        self.sleep, self.clock = sleep, clock
        self.last = self.clock()
        self.delay = MIN_SPACING
        self.policies: dict[str, RobotFileParser] = {}
        self.now = now
        self.window = None
        self.http_429 = self.http_503 = self.retry_after_waits = 0

    def check_window(self):
        current = quiet_window(self.now())
        if self.window is not None and current != self.window:
            raise Held("Acquisition quiet window expired")
        self.window = current
        if self.now() + timedelta(seconds=WINDOW_MARGIN) >= datetime.fromisoformat(current['end']):
            raise Held("Quiet window ending; checkpoint kept for the next quiet window")

    def get(self, url: str, allow_missing=False) -> bytes:
        host = urlsplit(url).netloc
        publisher = host == "legislation.gov.au" or host.endswith(".legislation.gov.au")
        if publisher: self.check_window()
        policy = self.policies.get(host)
        if policy and not policy.can_fetch(UA, url):
            raise Held("Publisher robots policy disallows this metadata path")
        delay = max(MIN_SPACING, self.delay,
                    (policy.crawl_delay(UA) or policy.crawl_delay("*") or MIN_SPACING) if policy else MIN_SPACING)
        for attempt in range(5):
            if publisher: self.check_window()
            if self.requests >= self.max_requests:
                raise Held("Request budget reached; resume from the checkpoint")
            self.sleep(max(0, delay - (self.clock() - self.last)))
            if publisher: self.check_window()
            self.requests += 1
            print(f"[frl-instruments] HTTP request {self.requests} (attempt {attempt + 1})", flush=True)
            result = subprocess.run([
                "curl", "--globoff", "--http1.1", "--compressed", "--max-time", str(REQUEST_TIMEOUT), "--silent", "--show-error",
                "--user-agent", UA, "--dump-header", "-", "--write-out", "\n%{http_code}", url,
            ], capture_output=True)
            self.last = self.clock()
            raw, _, status = result.stdout.rpartition(b"\n")
            code = int(status) if status.isdigit() else 0
            self.http_429 += code == 429
            self.http_503 += code == 503
            if self.http_429 + self.http_503 >= 2:
                raise Held("Repeated publisher throttling (HTTP 429/503); checkpoint kept")
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
                if self.retry_after_waits >= 2:
                    raise Held("Third Retry-After demand; checkpoint kept")
                value = retry[1].decode()
                try:
                    pause = max(pause, float(value) if value.isdigit() else
                                (parsedate_to_datetime(value) - self.now()).total_seconds())
                except (ValueError, TypeError): pass
                self.retry_after_waits += 1
            if publisher and self.now() + timedelta(seconds=pause + WINDOW_MARGIN) >= datetime.fromisoformat(self.window['end']):
                raise Held("Quiet window ending during backoff; checkpoint kept")
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
        # Website Crawl-delay is also the minimum for every API read.
        self.delay = max(MIN_SPACING, self.delay, self.policies[urlsplit(API).netloc].crawl_delay("*") or MIN_SPACING)
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
    def __init__(self, session, checkpoint, counts=None):
        self.session, self.path = session, checkpoint / "plain-gap-probes.json"
        self.counts = counts
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
            if self.counts is not None and not key:
                self.counts.observe(response.get('@odata.count'), 'gap_probe', params.get('$skip'))
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
        if probes.counts is None:
            raise Held("Final plain title page incomplete; snapshot held")
        # The count can advance after the final page's rows were selected.
        # Defer to the tail; this is not an allowed, inferred source gap.
        return {**base, '_opax_tail_shortfall': size - len(values)}
    atomic_json(checkpoint / f"rejected-plain-{offset:06d}.json", base)
    page = probes.data["pages"].setdefault(str(offset), {"expected": size, "received": len(values),
        "missing_positions": [], "candidate_ids": [], "resolved_ids": []})
    known = {r["id"]: r for r in values}
    discovered = {}
    def listing(query, purpose, projected=False):
        result = probes.read(purpose, query)
        if result is None: return []
        if not isinstance(result, dict) or probes.counts is None and result.get("@odata.count") != expected:
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


def tail_sweep(session, checkpoint, rows, counts, gap_pages, now):
    """Re-read the tail, then backfill earlier ids if the total is still short.

    A tail-only read cannot discover an insertion before the current offset.
    Prefix ID pages are therefore a bounded fallback, never an inferred id.
    All newly discovered ids require their own expanded entity response.
    """
    evidence = {"complete": False, "requests": 0, "budget": TAIL_REQUESTS, "pages": 0, "prefix_pages": 0,
                "fetched": 0, "rounds": 0, "reads": [], "individuals": {}}
    path = checkpoint / "tail-sweep.json"
    def read(params, key=None):
        before = session.requests
        if evidence['requests'] >= evidence['budget'] and evidence['budget'] < MAX_TAIL_REQUESTS:
            # An insertion before a far-back offset can require an inventory
            # prefix pass. Re-cost that bounded work, retaining the hard ceiling
            # and any explicitly lower caller cap rather than stopping at 100.
            evidence['budget'] = min(MAX_TAIL_REQUESTS, math.ceil(counts.latest / PAGE_SIZE) + MAX_DRIFT + 6)
            budget = request_budget(counts.latest, evidence['budget'])
            requested = getattr(session, 'requested_cap', None)
            if hasattr(session, 'max_requests'):
                session.max_requests = min(budget['cap'], requested) if requested is not None else budget['cap']
            evidence['request_budget'] = budget
            print('[frl-instruments] prefix backfill request plan ' + json.dumps(budget), flush=True)
        limit = getattr(session, 'max_requests', None)
        remaining = evidence['budget'] - evidence['requests']
        if remaining <= 0: raise Held("Tail sweep request budget exhausted; snapshot held")
        if limit is not None: session.max_requests = min(limit, before + remaining)
        try:
            result = session.title_json(key, params) if key else session.json(params)
            if not key: counts.observe(result.get('@odata.count'), 'tail', params.get('$skip'))
            return result
        finally:
            evidence['requests'] += session.requests - before
            if limit is not None: session.max_requests = limit
            atomic_json(path, evidence)
    def page(offset, prefix=False):
        query = {'$filter': SCOPE, '$orderby': 'id', '$top': PAGE_SIZE,
                 '$skip': offset, '$count': 'true', '$select': 'id'}
        result = read(query)
        values = result.get('value')
        if not isinstance(values, list) or len(values) > PAGE_SIZE: raise Held('Malformed tail ID page')
        ids = [r.get('id') for r in values if isinstance(r, dict)]
        if len(ids) != len(values) or any(not isinstance(k, str) or not ID.fullmatch(k) for k in ids):
            raise Held('Invalid tail ID')
        if ids != sorted(set(ids)): raise Held('Duplicate or unordered tail ID page')
        evidence['pages'] += 1
        evidence['prefix_pages'] += bool(prefix)
        evidence['reads'].append({'offset': offset, 'count': result['@odata.count'], 'ids': ids, 'prefix': prefix})
        atomic_json(path, evidence)
        for key in ids:
            if key in rows: continue
            item = {'status': 'requested'}; evidence['individuals'][key] = item
            atomic_json(path, evidence)
            try:
                row = read({'$expand': EXPAND}, key)
                item['response'] = row
                validate_expanded_title(row, {'id': key})
            except (Held, OSError, ValueError, TypeError) as error:
                item.update(status='failed', error=str(error)); atomic_json(path, evidence)
                raise Held(f'Tail individual {key} failed; snapshot held: {error}') from error
            item['status'] = 'complete'; rows[key] = row; evidence['fetched'] += 1
            atomic_json(path, evidence)
    gap = sum(p['unresolved_gap'] for p in gap_pages)
    for round_number in range(1, 4):
        evidence['rounds'] = round_number
        target = counts.latest
        # At least two whole pages plus the observed drift, rounded outward.
        first = max(0, ((target - (2 * PAGE_SIZE + abs(target - counts.start))) // PAGE_SIZE) * PAGE_SIZE)
        offsets = list(range(first, target, PAGE_SIZE))
        for offset in offsets: page(offset)
        # Scan only when needed. No date or id-range filters (FRL rejects them).
        if len(rows) + gap < counts.latest:
            for offset in range(0, first, PAGE_SIZE):
                page(offset, prefix=True)
                if len(rows) + gap >= counts.latest: break
        listed_after_sweep = counts.latest
        # If all listed rows were recovered, stale gap allowances must not
        # conceal a registration appearing after the last sweep response.
        if len(rows) >= listed_after_sweep: gap = 0
        final = counts.observe(count_page(session), 'end')
        if final != listed_after_sweep: continue
        if len(rows) + gap >= final:
            evidence['complete'] = True
            evidence['count_end'] = final
            atomic_json(path, evidence)
            return evidence
        if final == target:
            raise Held(f'Tail sweep incomplete: {len(rows)} unique ids plus {gap} gaps below {final}; snapshot held')
    raise Held('Tail sweep did not reconcile after three rounds; snapshot held')


def tail_summary(evidence):
    return {k: evidence[k] for k in ('complete', 'requests', 'pages', 'prefix_pages', 'fetched', 'rounds')}


def acquire(session, out: Path, checkpoint: Path, policy=None, now=None) -> dict:
    """Injectable HTTP session for offline paging/reconciliation tests."""
    out, checkpoint = local_path(out), local_path(checkpoint)
    started = time.monotonic()
    now = now or getattr(session, 'now', utc_now)
    window = quiet_window(now())
    initial = count_page(session)
    old = json.loads(out.read_text()) if out.exists() else {}
    previous = old.get('exported', old.get('count', 0))
    guard_count(initial, initial, previous)
    config, fresh_membership = prepare_checkpoint(checkpoint, checkpoint_config(initial, window))
    counts = Counts(checkpoint, config['count_start'], now)
    counts.observe(initial, 'start')
    budget = request_budget(initial)
    requested = getattr(session, 'requested_cap', None)
    if hasattr(session, 'max_requests'):
        session.max_requests = min(budget['cap'], requested) if requested is not None else budget['cap']
    remaining_seconds = (datetime.fromisoformat(window['end']) - now()).total_seconds()
    print('[frl-instruments] request plan ' + json.dumps({**budget,
          'estimated_seconds': budget['cap'] * 18, 'quiet_seconds_remaining': int(remaining_seconds)}), flush=True)
    if remaining_seconds <= WINDOW_MARGIN:
        raise Held('Quiet window ending; checkpoint kept for the next quiet window')
    # Near dawn still retain progress; the per-request deadline is authoritative.
    if budget['cap'] * 18 > remaining_seconds:
        print('[frl-instruments] remaining quiet time is shorter than the full bootstrap estimate; checkpointed stop before dawn', flush=True)
    cached = None
    if fresh_membership:
        cached = {}
        for path in checkpoint.glob('page-*.json'):
            page = json.loads(path.read_text())
            for row in page.get('value', []):
                try: validate_expanded_title(row, {'id': row['id']})
                except (Held, KeyError, TypeError): continue
                cached[row['id']] = row
        atomic_json(checkpoint / 'metadata-cache.json', cached)
        # Positions and gaps can move. Keep their previous receipts as evidence.
        probe_path = checkpoint / 'plain-gap-probes.json'
        if probe_path.exists(): probe_path.replace(checkpoint / 'previous-gap-probes.json')
        print('[frl-instruments] later quiet window: rechecking membership; expanded metadata cached by id', flush=True)
    elif (checkpoint / 'metadata-cache.json').exists():
        cached = json.loads((checkpoint / 'metadata-cache.json').read_text())
    probes = GapProbes(session, checkpoint, counts)
    evidence = checkpoint / 'individual-fetches.json'
    individuals = json.loads(evidence.read_text()) if evidence.exists() else {}
    if not isinstance(individuals, dict) or len(individuals) > MAX_INDIVIDUAL_IDS:
        raise Held('Invalid or excessive individual expansion evidence; snapshot kept')
    rows, gap_pages = {}, []
    offset = 0
    while offset < counts.latest:
        if quiet_window(now()) != window or now() + timedelta(seconds=WINDOW_MARGIN) >= datetime.fromisoformat(window['end']):
            raise Held('Quiet window ending; checkpoint kept for the next quiet window')
        base_path = checkpoint / f'titles-{offset:06d}.json'
        params = {'$filter': SCOPE, '$orderby': 'id', '$top': PAGE_SIZE,
                  '$skip': offset, '$count': 'true'}
        if FIELDS != '*': params['$select'] = FIELDS
        base = json.loads(base_path.read_text()) if base_path.exists() else None
        reuse_plain = base is not None and base.get('_opax_read_window') == window
        if not reuse_plain:
            base = session.json(params)
        page_count = counts.observe(base.get('@odata.count'), 'cached_plain' if reuse_plain else 'plain', offset, cached=reuse_plain)
        base = recover_plain_page(session, checkpoint, offset, params, base, page_count, probes, individuals)
        values = base['value']
        gap = base.get('_opax_plain_gap', {}).get('unresolved_gap', 0)
        if gap:
            gap_pages.append({'offset': offset, 'unresolved_gap': gap})
            total_gap = sum(p['unresolved_gap'] for p in gap_pages)
            if total_gap > MAX_UNRESOLVED_GAP or total_gap * 2000 > counts.latest:
                raise Held('Unresolved plain-title gap exceeds 10 rows or 0.05% of the source count')
        matched = expanded_page(session, checkpoint, offset, params, values, page_count, individuals, counts, cached)
        # Only complete pairs are resumable. Repeated boundary ids update their
        # own source metadata and cannot inflate the unique-row count.
        atomic_json(base_path, {**base, '_opax_read_window': window})
        for key, row in matched.items(): rows[key] = row
        counts.observe(counts.latest, 'page_complete', offset)
        print(f'[frl-instruments] {len(rows):,} unique expanded titles / {counts.latest:,} listed', flush=True)
        offset += PAGE_SIZE
    counts.observe(count_page(session), 'before_tail')
    sweep = tail_sweep(session, checkpoint, rows, counts, gap_pages, now)
    final_count = counts.latest
    if len(rows) >= final_count:
        sweep['resolved_gap_count'] = sum(p['unresolved_gap'] for p in gap_pages)
        gap_pages = []
        atomic_json(checkpoint / 'tail-sweep.json', sweep)
    unresolved_gap = sum(p['unresolved_gap'] for p in gap_pages)
    guard_reconciliation(len(rows), final_count, unresolved_gap, gap_pages, previous, counts.start)
    if quiet_window(now()) != window: raise Held('Acquisition quiet window expired')
    downloaded = now().isoformat()
    titles = [rows[k] for k in sorted(rows)]
    snapshot = {'schema': 1, 'generated_at': downloaded, 'downloaded_at': downloaded, 'scope': SCOPE, 'count': final_count,
                'count_start': counts.start, 'count_end': final_count, 'drift': final_count - counts.start,
                'count_observations': counts.records, 'tail_sweep': sweep,
                'exported': len(rows), 'unresolved_gap': unresolved_gap, 'gap_pages': gap_pages,
                'odata_count': final_count, 'metadata_only': True,
                'version_scope': 'First API-returned version per title; current/latest flags retained verbatim. Full history not acquired.',
                'metadata_coverage': {'expanded_titles': len(rows), 'missing_expansion_ids': []},
                'plain_gap_evidence': probes.data, 'titles': titles}
    if out.exists() and json.loads(out.read_text()).get('titles') == titles:
        snapshot['generated_at'] = json.loads(out.read_text())['generated_at']
    atomic_json(out, snapshot)
    run = {'rows': len(rows), 'odata_count': final_count, 'count_start': counts.start,
           'count_end': final_count, 'drift': final_count - counts.start, 'tail_sweep': tail_summary(sweep),
           'requests': session.requests, 'request_budget': sweep.get('request_budget', budget),
           'request_budget_initial': budget,
           'http_429': getattr(session, 'http_429', 0), 'http_503': getattr(session, 'http_503', 0),
           'retry_after_waits': getattr(session, 'retry_after_waits', 0),
           'runtime_seconds': round(time.monotonic() - started, 2), 'completed_at': downloaded,
           'metadata_coverage': snapshot['metadata_coverage'],
           'individual_fetch_ids': sorted(set(individuals) | set(sweep['individuals'])),
           'unresolved_gap': unresolved_gap, 'gap_pages': gap_pages,
           'gap_probe_requests': probes.data['requests'], 'policy': policy, 'snapshot': str(out.relative_to(ROOT))}
    atomic_json(out.parent / 'run-receipt.json', run)
    atomic_json(checkpoint / 'complete.json', {'completed_at': downloaded, 'count': final_count,
                'exported': len(rows), 'unresolved_gap': unresolved_gap})
    print(json.dumps(run, ensure_ascii=False), flush=True)
    return snapshot


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default=str(ROOT / "scripts/state/frl/snapshot.json"))
    p.add_argument("--checkpoint", default=str(ROOT / "scripts/state/frl/checkpoint"))
    p.add_argument("--max-requests", type=int, default=None, help="Optional lower cap; computed from the scope count, hard ceiling 900")
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
                "http_429": getattr(session, 'http_429', 0), "http_503": getattr(session, 'http_503', 0),
                "retry_after_waits": getattr(session, 'retry_after_waits', 0),
                "runtime_seconds": round(time.monotonic() - started, 2),
                "snapshot_written": False})
        print(f"FRL HELD: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
