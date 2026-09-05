#!/usr/bin/env python3
"""
Upsert one `bill-<bill_key>` resource per bill into the OPAX knowledge box, so
a bill is searchable, askable and citable next to the speeches and divisions
about it.

Source of truth is the static projection `scripts/export_bills.py` writes, not
the database: the projection has already resolved the joins, and the publisher
runs anywhere the box credentials are (`ARAG_ZONE`, `ARAG_KB_ID`,
`ARAG_KB_TOKEN` in `.env`).

    python3 scripts/publish_bills.py --dry-run                # show the plan
    python3 scripts/publish_bills.py --keys au-federal-alrc-1270,...
    python3 scripts/publish_bills.py --with-summary-only      # the bulk pass
    python3 scripts/publish_bills.py --verify                 # catalog check

What lands in the box:

  body      the reviewed model summary when the bill has one -- three
            sentences, the "what it changes" bullets, who is affected, and the
            attribution line the contract fixes -- followed by a factual
            paragraph of registry metadata. No explanatory memorandum or Bills
            Digest text is ever copied: aph.gov.au is CC BY-NC-ND, which is not
            permission to publish adaptations, so everything here is either the
            model's own words about the facts or the parsed metadata itself.
  labels    kind/bill, state/<jurisdiction>, decade/<2010s>, parliament/<47>,
            status/<status>, sponsor_party/<party> when known.
  extra     the structured record: dates, counts, division keys, speech slugs,
            source URLs, the summary payload, and content_hash.

Idempotent by `extra.metadata.content_hash`: a resource whose stored hash still
matches what this run would write is left alone, so a rerun after a partial
failure costs one GET per bill. Nothing here deletes: the only writes are
POST /resources and PATCH /slug/<slug>.
"""

import argparse
import hashlib
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parli.arag import AragConfig, AragError, KbClient, load_dotenv  # noqa: E402

BILLS_DIR = Path(__file__).resolve().parents[1] / "portal" / "public" / "bills"
RESOURCE_CAP = 3500
SLUG = "bill-{key}"
KIND_LABEL = "bill"
CATALOG_FILTER = "/classification.labels/kind/bill"

HOUSE_NAMES = {
    "representatives": "the House of Representatives",
    "senate": "the Senate",
    "assembly": "the Legislative Assembly",
    "council": "the Legislative Council",
}
STATUS_WORDS = {
    "introduced": "Introduced",
    "before_house": "Before the house",
    "before_parliament": "Before parliament",
    "passed_one_house": "Passed one house",
    "passed_both": "Passed both houses",
    "passed": "Passed",
    "assented": "Assented",
    "rejected": "Rejected",
    "withdrawn": "Withdrawn",
    "lapsed": "Lapsed",
}
SOURCE_NAMES = {
    "billhome": "Bill home page",
    "em": "Explanatory memorandum",
    "em_revised": "Revised explanatory memorandum",
    "em_supp": "Supplementary explanatory memorandum",
    "digest": "Bills Digest",
    "text": "Bill text",
    "frl_act": "Act on the Federal Register of Legislation",
}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Resource body: the model's words, then the parsed facts
# ---------------------------------------------------------------------------


def summary_block(summary: dict | None) -> list[str]:
    if not summary:
        return []
    parts = [" ".join(s.strip() for s in summary.get("sentences", []) if s)]
    changes = [c.strip() for c in summary.get("changes", []) if c]
    if changes:
        parts.append("What it changes:\n" + "\n".join(f"- {c}" for c in changes))
    if summary.get("affected"):
        parts.append(f"Who is affected: {summary['affected'].strip()}")
    attribution = summary.get("attribution")
    if attribution:
        as_of = f" The summary describes the bill as at {summary['as_of']}." if summary.get("as_of") else ""
        parts.append(f"{attribution}.{as_of}")
    return [p for p in parts if p.strip()]


def facts_block(doc: dict) -> list[str]:
    """Parsed metadata in plain sentences. Status, sponsor and dates are read
    from the registry, never written by a model."""
    parts: list[str] = []
    status = STATUS_WORDS.get(doc.get("status") or "", doc.get("status") or "")
    where = HOUSE_NAMES.get(doc.get("originating_house") or "", doc.get("originating_house") or "")
    opening = []
    if doc.get("introduced"):
        opening.append(f"Introduced{f' in {where}' if where else ''} on {doc['introduced']}")
    if doc.get("sponsor"):
        party = f" ({doc['sponsor_party']})" if doc.get("sponsor_party") else ""
        opening.append(f"sponsored by {doc['sponsor']}{party}")
    if doc.get("portfolio"):
        opening.append(f"{doc['portfolio']} portfolio")
    if opening:
        parts.append(f"{'; '.join(opening)}.")
    if status:
        as_of = f", as at {doc['status_as_of']}" if doc.get("status_as_of") else ""
        parts.append(f"Status: {status}{as_of}.")

    divs = doc.get("divisions") or []
    if divs:
        dates = sorted(d["date"] for d in divs if d.get("date"))
        span = f" between {dates[0]} and {dates[-1]}" if len(dates) > 1 else (f" on {dates[0]}" if dates else "")
        parts.append(
            f"{len(divs)} recorded division{'s' if len(divs) != 1 else ''} named this bill{span}. "
            "A division naming a bill is not evidence that an aye backed it: some are "
            "procedural, and the question as put decides."
        )
    speeches = doc.get("speeches") or []
    if speeches:
        speakers = sorted({s["speaker"] for s in speeches if s.get("speaker")})
        who = f" Speakers include {', '.join(speakers[:8])}." if speakers else ""
        parts.append(f"{len(speeches)} speech{'es' if len(speeches) != 1 else ''} in the record name this bill.{who}")
    for act in doc.get("acts") or []:
        parts.append(f"Became the {act['title']}, assented {act.get('assent_date') or 'date unrecorded'}.")

    sources = doc.get("sources") or []
    if sources:
        named = [f"{SOURCE_NAMES.get(s['kind'], s['kind'])}: {s['url']}" for s in sources if s.get("url")]
        if named:
            parts.append("Official sources. " + " ".join(named[:8]))
    return parts


def resource_text(doc: dict) -> str:
    title = doc.get("title") or doc["key"]
    blocks = [title] + summary_block(doc.get("summary")) + facts_block(doc)
    if not doc.get("summary"):
        blocks.append(
            "No reviewed summary has been written for this bill yet; everything above "
            "is parsed registry metadata."
        )
    return "\n\n".join(blocks).strip()


# ---------------------------------------------------------------------------
# Labels, metadata, hash
# ---------------------------------------------------------------------------


def decade_of(date: str | None) -> str | None:
    return f"{date[:3]}0s" if date and len(date) >= 4 and date[:4].isdigit() else None


def labels_for(doc: dict) -> list[tuple[str, str | None]]:
    return [
        ("kind", KIND_LABEL),
        ("state", doc.get("jurisdiction") or "federal"),
        ("decade", decade_of(doc.get("introduced"))),
        ("parliament", str(doc["parliament"]) if doc.get("parliament") else None),
        ("status", doc.get("status")),
        ("sponsor_party", doc.get("sponsor_party")),
    ]


def classifications(doc: dict) -> list[dict]:
    return [
        {"labelset": ls, "label": str(label)}
        for ls, label in labels_for(doc)
        if label not in (None, "", "None")
    ]


def metadata_for(doc: dict) -> dict:
    """The structured record, small enough to travel with the resource. Division
    and speech identities are the keys the portal and the box already use, so a
    reader can follow them without a second lookup table."""
    return {
        "bill_key": doc["key"],
        "jurisdiction": doc.get("jurisdiction"),
        "parliament": doc.get("parliament"),
        "title": doc.get("title"),
        "short_title": doc.get("short_title"),
        "introduced": doc.get("introduced"),
        "originating_house": doc.get("originating_house"),
        "sponsor": doc.get("sponsor"),
        "sponsor_party": doc.get("sponsor_party"),
        "sponsor_person_id": doc.get("sponsor_person_id"),
        "portfolio": doc.get("portfolio"),
        "status": doc.get("status"),
        "status_as_of": doc.get("status_as_of"),
        "key_dates": doc.get("key_dates") or [],
        "sources": doc.get("sources") or [],
        "summary": doc.get("summary"),
        "division_keys": [d["key"] for d in doc.get("divisions") or []],
        "division_count": len(doc.get("divisions") or []),
        "speech_slugs": [s["slug"] for s in doc.get("speeches") or []],
        "speech_count": len(doc.get("speeches") or []),
        "acts": doc.get("acts") or [],
        "page": f"/bill/{doc['key']}",
    }


def content_hash(title: str, text: str, classes: list[dict], metadata: dict) -> str:
    payload = json.dumps(
        {"title": title, "text": text, "classifications": classes, "metadata": metadata},
        sort_keys=True, ensure_ascii=False, separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def resource_body(doc: dict) -> dict:
    title = (doc.get("title") or doc["key"])[:2000]
    text = resource_text(doc)
    classes = classifications(doc)
    metadata = metadata_for(doc)
    metadata["content_hash"] = content_hash(title, text, classes, metadata)
    origin: dict = {"source_id": "opax-bills"}
    if doc.get("sponsor"):
        origin["collaborators"] = [doc["sponsor"]]  # the sponsor, not everyone who voted
    home = next((s["url"] for s in doc.get("sources") or [] if s.get("kind") == "billhome"), None)
    if home:
        origin["url"] = home
    if doc.get("introduced") and len(doc["introduced"]) == 10:
        origin["created"] = f"{doc['introduced']}T00:00:00Z"
    return {
        "slug": SLUG.format(key=doc["key"]),
        "title": title,
        "texts": {"body": {"body": text, "format": "PLAIN"}},
        "origin": origin,
        "usermetadata": {"classifications": classes},
        "extra": {"metadata": metadata},
    }


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------


class RateLimiter:
    """Thread-safe pacing shared across worker threads: at most `rate` calls a
    second. `push()` acquires one slot per bill (its GET plus, when the
    content differs, its POST/PATCH), so the whole run -- not just the write
    half -- is paced. The box is under heavy labelling load during a bulk
    publish and 429 backpressure is already handled by `parli.arag`, but
    pacing at the source keeps the run from adding to the queue it is waiting
    on."""

    def __init__(self, rate: float):
        self.interval = 1.0 / rate if rate > 0 else 0.0
        self._lock = threading.Lock()
        self._next = time.monotonic()

    def acquire(self) -> None:
        if self.interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            start = max(now, self._next)
            self._next = start + self.interval
        wait = start - now
        if wait > 0:
            time.sleep(wait)


def stored_hash(kb: KbClient, slug: str) -> tuple[bool, str | None]:
    """(exists, stored content hash). A resource without one is treated as
    stale and rewritten."""
    try:
        res = kb.get_resource_by_slug(slug, show="extra")
    except AragError as e:
        if e.status == 404:
            return False, None
        raise
    meta = ((res.get("extra") or {}).get("metadata") or {})
    return True, meta.get("content_hash")


def push(kb: KbClient, body: dict, dry_run: bool, limiter: "RateLimiter | None" = None) -> str:
    """'created' | 'updated' | 'unchanged' | 'failed: ...'. Never deletes."""
    slug = body["slug"]
    want = body["extra"]["metadata"]["content_hash"]
    if limiter is not None:
        limiter.acquire()
    try:
        exists, have = stored_hash(kb, slug)
        if exists and have == want:
            return "unchanged"
        if dry_run:
            return "would-update" if exists else "would-create"
        if exists:
            patch = {k: v for k, v in body.items() if k != "slug"}
            kb.patch_resource_by_slug(slug, patch)
            return "updated"
        try:
            kb.create_resource(body)
            return "created"
        except AragError as e:
            if e.status == 409:  # raced with another writer; the patch is the fix
                kb.patch_resource_by_slug(slug, {k: v for k, v in body.items() if k != "slug"})
                return "updated"
            raise
    except AragError as e:
        return f"failed: {e.status} {e.detail[:160]}"


def load_docs(bills_dir: Path, keys: list[str] | None, with_summary_only: bool) -> list[dict]:
    if keys:
        paths = [bills_dir / f"{k}.json" for k in keys]
        missing = [p.name for p in paths if not p.exists()]
        if missing:
            raise SystemExit(f"no projection file for: {', '.join(missing)}")
    else:
        paths = sorted(p for p in bills_dir.glob("*.json") if p.name != "index.json")
    docs = [json.loads(p.read_text()) for p in paths]
    if with_summary_only:
        docs = [d for d in docs if d.get("summary")]
    # Newest first: if a run is capped, the bills people are asking about today
    # are the ones that land.
    docs.sort(key=lambda d: (d.get("introduced") or "", d["key"]), reverse=True)
    return docs


def verify(kb: KbClient, expect: list[str] | None = None) -> int:
    """Read the bills back out of the box through the catalog, the way the
    portal's filters will."""
    res = kb.catalog(filters=CATALOG_FILTER, page_size=100)
    resources = (res.get("resources") or {}) if isinstance(res, dict) else {}
    slugs = sorted((r.get("slug") or rid) for rid, r in resources.items())
    total = (((res.get("fulltext") or {}).get("page_size")) and None) or len(slugs)
    log(f"catalog {CATALOG_FILTER}: {len(slugs)} resources on the first page")
    for slug in slugs[:50]:
        log(f"  {slug}")
    if expect:
        missing = [s for s in expect if s not in slugs]
        if missing:
            log(f"MISSING from the catalog: {', '.join(missing)}")
            return 1
        log(f"all {len(expect)} expected slugs present")
    return 0 if total >= 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Upsert bill resources into the knowledge box")
    ap.add_argument("--bills-dir", default=str(BILLS_DIR))
    ap.add_argument("--keys", help="comma-separated bill keys (default: every projection file)")
    ap.add_argument("--with-summary-only", action="store_true",
                    help="publish only bills carrying a reviewed summary")
    ap.add_argument("--limit", type=int, default=None, help="stop after N bills")
    ap.add_argument("--cap", type=int, default=RESOURCE_CAP,
                    help=f"hard ceiling on resources this run may write (default {RESOURCE_CAP})")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--rate", type=float, default=0,
                    help="cap on requests/sec across all workers, shared via a token bucket "
                         "(default 0 = unlimited); use a low value when the box is under load")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verify", action="store_true", help="read the catalog back and stop")
    ap.add_argument("--env", default=".env")
    args = ap.parse_args()

    load_dotenv(args.env)
    cfg = AragConfig.from_env()
    if not cfg.kb_configured:
        log("ARAG_KB_ID / ARAG_KB_TOKEN are not set (put them in .env)")
        return 2
    kb = KbClient(cfg)

    if args.verify and not args.keys:
        return verify(kb)

    keys = [k.strip() for k in args.keys.split(",") if k.strip()] if args.keys else None
    docs = load_docs(Path(args.bills_dir), keys, args.with_summary_only)
    if args.limit:
        docs = docs[: args.limit]
    if len(docs) > args.cap:
        log(f"{len(docs)} bills exceeds the {args.cap}-resource cap; taking the newest {args.cap}")
        docs = docs[: args.cap]
    log(f"{len(docs)} bills to consider{' (dry run)' if args.dry_run else ''}")

    bodies = [resource_body(d) for d in docs]
    counts: dict[str, int] = {}
    failures: list[str] = []
    t0 = time.time()
    limiter = RateLimiter(args.rate) if args.rate else None
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i, (body, outcome) in enumerate(
            zip(bodies, pool.map(lambda b: push(kb, b, args.dry_run, limiter), bodies)), 1
        ):
            head = outcome.split(":")[0]
            counts[head] = counts.get(head, 0) + 1
            if head == "failed":
                failures.append(f"{body['slug']}: {outcome}")
                log(f"  FAIL {body['slug']} {outcome}")
            if i % 100 == 0:
                log(f"  {i}/{len(bodies)} {counts}")
    log(f"{counts} in {time.time() - t0:.1f}s")
    if failures:
        log(f"{len(failures)} failed")

    if args.verify:
        verify(kb, expect=[b["slug"] for b in bodies])
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
