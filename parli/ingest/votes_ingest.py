"""
parli.ingest.votes_ingest -- push divisions (recorded votes) into the OPAX
knowledge box as kind=division resources. Design and gates: docs/VOTES.md.

One short third-person resource per division, rendered by
votes_state.division_document(): slug division-{jurisdiction}-{house}-{id},
every voter an origin.collaborator (normalised names, the same strings the
speech corpus carries), origin.created = the division date, labels kind /
source / state / chamber / decade / result. The relational truth stays in
parli.db; this is the retrieval copy.

Sources (any combination; a slug seen twice is pushed once, first source wins)
  --from-ext       ext_divisions / ext_votes (all jurisdictions; --jurisdiction to narrow)
  --from-legacy    the federal divisions / votes / members tables, i.e. everything the
                   TheyVoteForYou refresh (tvfy_refresh.py) has landed. Same mapping as
                   votes_state.run_federal, plus bills[] from division_bills.
  --from-json F..  unified JSON written by votes_state.py

Modes
  --probe N        GATE 3: push N documents spread across sources (the federal House
                   division with the most voters is always one of them), verify each
                   via GET /slug/{slug} and a collaborator-filtered /find, print the
                   report, push nothing else.
  --verify-only    verify already-pushed slugs from the state file, push nothing.
  --limit N        cap the number of pushes (refuses > 100 without --full).
  --delete SLUG..  delete resources by slug (probe clean-up), nothing else.

State: ~/.cache/autoresearch/votes_ingest_state.json (pushed slugs + failures).
409 (slug exists) counts as pushed. Backpressure 429s are absorbed inside
parli.arag._request (it sleeps until try_after); they show up here as long
per-push latencies, which the summary reports as p50/p95/max.

Run on `desktop` (parli.db and the ARAG .env live there):
  cd /tmp/arag_mig && python3 -m parli.ingest.votes_ingest --from-ext --probe 5
  cd /tmp/arag_mig && nohup python3 -m parli.ingest.votes_ingest --from-ext --from-legacy --full \
      > logs/votes_ingest.log 2>&1 &
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sqlite3
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable, Optional

from parli.arag import AragConfig, AragError, KbClient, load_dotenv
from parli.ingest.speaker_names import normalize_speaker
from parli.ingest.votes_state import Division, Vote, _read_unified, bill_ref, division_document

STATE_PATH = Path("~/.cache/autoresearch/votes_ingest_state.json").expanduser()
DB_PATH = Path("~/.cache/autoresearch/parli.db").expanduser()
SAFETY_LIMIT = 100
WORKERS = 6
FIND_POLL_SECONDS = 20
FIND_POLL_ATTEMPTS = 9      # 3 minutes for the platform to index a new resource


def log(*a) -> None:
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------


def _chunks(seq: list, n: int = 500) -> Iterable[list]:
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def read_ext(db: sqlite3.Connection, jurisdiction: Optional[str], since: Optional[str],
             limit: Optional[int]) -> tuple[list[Division], list[Vote]]:
    where, params = [], []
    if jurisdiction:
        where.append("jurisdiction = ?")
        params.append(jurisdiction)
    if since:
        where.append("date >= ?")
        params.append(since)
    sql = "SELECT * FROM ext_divisions" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY date DESC, id"
    if limit:
        sql += f" LIMIT {int(limit)}"
    divisions = []
    for r in db.execute(sql, params):
        divisions.append(Division(
            id=r["id"], jurisdiction=r["jurisdiction"], house=r["house"], date=r["date"], number=r["number"],
            name=r["name"] or "", question=r["question"], bill_ref=r["bill_ref"],
            ayes_count=r["ayes_count"], noes_count=r["noes_count"], result=r["result"],
            source=r["source"], source_url=r["source_url"] or "", extra=json.loads(r["extra"] or "{}")))
    votes: list[Vote] = []
    for ids in _chunks([d.id for d in divisions]):
        marks = ",".join("?" for _ in ids)
        for v in db.execute(f"SELECT division_id, person_name, person_raw, person_id, vote, party "
                            f"FROM ext_votes WHERE division_id IN ({marks})", ids):
            votes.append(Vote(v["division_id"], v["person_name"], v["person_raw"], v["person_id"], v["vote"], v["party"]))
    return divisions, votes


def read_legacy(db: sqlite3.Connection, since: Optional[str], limit: Optional[int]
                ) -> tuple[list[Division], list[Vote]]:
    """Federal divisions that have votes, mapped exactly as votes_state.run_federal
    maps them (kept in step by hand: that function selects by chamber-day and
    is not importable for a whole-table pass), plus TVFY bills[] where the
    refresh stored them."""
    sql = ("SELECT d.* FROM divisions d WHERE COALESCE(d.state,'federal') = 'federal' "
           "AND EXISTS (SELECT 1 FROM votes v WHERE v.division_id = d.division_id)")
    params: list = []
    if since:
        sql += " AND d.date >= ?"
        params.append(since)
    sql += " ORDER BY d.date DESC, d.division_id DESC"
    if limit:
        sql += f" LIMIT {int(limit)}"
    rows = db.execute(sql, params).fetchall()
    has_bills = db.execute("SELECT 1 FROM sqlite_master WHERE name = 'division_bills'").fetchone() is not None
    divisions: list[Division] = []
    votes: list[Vote] = []
    for d in rows:
        house = d["house"]
        url = f"https://theyvoteforyou.org.au/divisions/{house}/{d['date']}" + (f"/{d['number']}" if d["number"] else "")
        summary = re.sub(r"<[^>]+>", " ", html.unescape(d["summary"] or ""))
        summary = re.sub(r"\s+", " ", summary).strip()
        result = None
        if d["aye_votes"] is not None and d["no_votes"] is not None:
            result = "affirmative" if d["aye_votes"] > d["no_votes"] else "negative"
        div_id = f"federal-{house}-{d['division_id']}"
        for v in db.execute(
                "SELECT v.person_id, v.vote, m.full_name, m.party_canonical, m.party "
                "FROM votes v LEFT JOIN members m ON m.person_id = v.person_id WHERE v.division_id = ?",
                (d["division_id"],)):
            raw = v["full_name"]
            votes.append(Vote(div_id, normalize_speaker(raw) if raw else None, raw,
                              f"tvfy_{v['person_id']}", v["vote"], v["party_canonical"] or v["party"]))
        extra = {"tvfy_division_id": d["division_id"], "possible_turnout": d["possible_turnout"],
                 "rebellions": d["rebellions"]}
        ref = bill_ref(d["name"])
        if has_bills:
            bills = [{"official_id": b[0], "title": b[1], "url": b[2]} for b in db.execute(
                "SELECT official_id, title, url FROM division_bills WHERE division_id = ?", (d["division_id"],))]
            if bills:
                extra["bills"] = bills
                ref = ref or bill_ref(bills[0]["title"]) or bills[0]["title"]
        divisions.append(Division(
            id=div_id, jurisdiction="federal", house=house, date=d["date"], number=d["number"],
            name=d["name"] or "", question=(summary[:2000] or None), bill_ref=ref,
            ayes_count=d["aye_votes"], noes_count=d["no_votes"], result=result,
            source="theyvoteforyou", source_url=url, extra=extra))
    return divisions, votes


def merge_sources(parts: list[tuple[list[Division], list[Vote]]]) -> tuple[list[Division], dict[str, list[Vote]]]:
    by_id: dict[str, Division] = {}
    votes_by: dict[str, list[Vote]] = {}
    for divisions, votes in parts:
        fresh: dict[str, list[Vote]] = {}
        for v in votes:
            fresh.setdefault(v.division_id, []).append(v)
        for d in divisions:
            if d.id in by_id:
                continue
            by_id[d.id] = d
            votes_by[d.id] = fresh.get(d.id, [])
    return list(by_id.values()), votes_by


# ---------------------------------------------------------------------------
# Resource body
# ---------------------------------------------------------------------------


def resource_body(doc: dict) -> dict:
    """division_document() output -> POST /resources body, in the shape
    arag_sync.py uses for speeches (texts.body PLAIN, classifications, extra.metadata)."""
    created = doc["origin"].get("created") or ""
    origin = {"source_id": doc["origin"]["source_id"], "collaborators": doc["origin"]["collaborators"]}
    if doc["origin"].get("url"):
        origin["url"] = doc["origin"]["url"]
    if len(created) >= 10:
        origin["created"] = f"{created[:10]}T00:00:00Z"
    return {
        "slug": doc["slug"],
        "title": doc["title"][:2000],
        "texts": {"body": {"body": doc["text"], "format": "PLAIN"}},
        "origin": origin,
        "usermetadata": {"classifications": [
            {"labelset": labelset, "label": str(label)}
            for labelset, labels in doc["labels"].items() for label in labels if label not in (None, "")]},
        "extra": {"metadata": doc["extra"]},
    }


MAX_COLLABORATORS = 100     # platform limit, measured 2026-09-02: 422 "at most 100 items" on 140 voters
_EMPTY_SIDE = re.compile(r"\b(Ayes|Noes) (\d+): none recorded\.")


def _chunk_side(votes: list[Vote]) -> list[list[Vote]]:
    """Alphabetical chunks of near-equal size, none above the cap (103 -> 52 + 51)."""
    votes = sorted(votes, key=lambda v: (v.person_name or v.person_raw or ""))
    if not votes:
        return [[]]
    n_chunks = -(-len(votes) // MAX_COLLABORATORS)
    size = -(-len(votes) // n_chunks)
    return [votes[i:i + size] for i in range(0, len(votes), size)]


def division_documents(d: Division, votes: list[Vote]) -> list[dict]:
    """One resource per division, or several when the voters exceed the
    platform's 100-collaborator cap: ayes (with pairs) in part 1, noes in part
    2, a side larger than 100 chunked alphabetically. Each part's body names
    only its own voters and points at the other parts for the rest, so every
    voter is a collaborator on exactly one resource and no name is indexed
    twice for the same division."""
    named = [v for v in votes if v.person_name or v.person_raw]
    if len({v.person_name or v.person_raw for v in named}) <= MAX_COLLABORATORS:
        return [division_document(d, votes)]
    ayes = [v for v in named if v.vote == "aye"] + [v for v in named if v.vote == "paired"]
    noes = [v for v in named if v.vote == "no"]
    groups = [g for g in _chunk_side(ayes) if g] + [g for g in _chunk_side(noes) if g]
    docs = []
    for k, group in enumerate(groups, 1):
        doc = division_document(d, group)
        if k > 1:
            doc["slug"] = f"{doc['slug']}-p{k}"
        doc["title"] = f"{doc['title'][:180]} (part {k} of {len(groups)})"
        doc["text"] = _EMPTY_SIDE.sub(lambda m: f"{m.group(1)} {m.group(2)}: listed in another part of this record.", doc["text"])
        side = group[0].vote if group[0].vote != "paired" else "aye"
        side_total = len(ayes) if side == "aye" else len(noes)
        if side_total > MAX_COLLABORATORS:
            doc["text"] += (f" This part lists {len(group)} of the {side_total} "
                            f"{'ayes' if side == 'aye' else 'noes'}; the rest are in the other parts.")
        doc["extra"]["part"] = k
        doc["extra"]["parts"] = len(groups)
        doc["extra"]["part_slugs"] = [f"division-{d.id}" + (f"-p{j}" if j > 1 else "") for j in range(1, len(groups) + 1)]
        docs.append(doc)
    return docs


def build_docs(divisions: list[Division], votes_by: dict[str, list[Vote]]) -> list[dict]:
    docs = []
    for d in divisions:
        vs = votes_by.get(d.id, [])
        if not any(v.person_name or v.person_raw for v in vs):
            continue        # a division with no named voters is a count, not a record
        docs.extend(division_documents(d, vs))
    return docs


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"pushed": {}, "failed": {}}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state))
    tmp.replace(STATE_PATH)


# ---------------------------------------------------------------------------
# Push / verify
# ---------------------------------------------------------------------------


def push_one(kb: KbClient, doc: dict) -> tuple[str, Optional[str], float]:
    t0 = time.time()
    try:
        kb.create_resource(resource_body(doc))
        return doc["slug"], None, time.time() - t0
    except AragError as e:
        if e.status == 409:
            return doc["slug"], None, time.time() - t0
        return doc["slug"], f"{e.status}: {e.detail[:200]}", time.time() - t0


def push_docs(kb: KbClient, docs: list[dict], state: dict, workers: int) -> dict:
    lat: list[float] = []
    ok = failed = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(push_one, kb, d): d for d in docs}
        for i, fut in enumerate(as_completed(futures), 1):
            slug, err, secs = fut.result()
            lat.append(secs)
            if err:
                failed += 1
                state["failed"][slug] = err
                log(f"  FAIL {slug}: {err}")
            else:
                ok += 1
                state["pushed"][slug] = int(time.time())
                state["failed"].pop(slug, None)
            if i % 25 == 0 or i == len(docs):
                save_state(state)
                log(f"  {i}/{len(docs)} pushed ok={ok} failed={failed} "
                    f"({i / max(time.time() - t0, 0.001):.1f}/s, last {secs:.1f}s)")
    save_state(state)
    summary = {"ok": ok, "failed": failed, "elapsed_s": round(time.time() - t0, 1)}
    if lat:
        lat.sort()
        summary.update({"latency_p50": round(statistics.median(lat), 2),
                        "latency_p95": round(lat[int(len(lat) * 0.95) - 1] if len(lat) > 1 else lat[0], 2),
                        "latency_max": round(lat[-1], 2),
                        "slow_pushes_over_10s": sum(1 for x in lat if x > 10)})
    return summary


def collaborator_filter(name: str, kind: Optional[str] = "division") -> dict:
    # Same grammar as portal/src/index.ts filterExpression(): origin_collaborator is an
    # exact match on the normalised name; the not-generic clause keeps title fields out.
    clauses: list[dict] = [{"prop": "origin_collaborator", "collaborator": name}]
    if kind:
        clauses.append({"prop": "label", "labelset": "kind", "label": kind})
    clauses.append({"not": {"prop": "field", "type": "generic"}})
    return {"field": {"and": clauses}}


def find_slugs(res: dict) -> dict[str, dict]:
    out = {}
    for rid, r in (res.get("resources") or {}).items():
        out[r.get("slug") or rid] = r
    return out


def verify_doc(kb: KbClient, doc: dict, poll: bool = True) -> dict:
    slug = doc["slug"]
    report: dict = {"slug": slug, "collaborators": len(doc["origin"]["collaborators"])}
    try:
        r = kb.get_resource_by_slug(slug, show="origin")
        report["get_slug"] = "ok"
        got = (r.get("origin") or {}).get("collaborators") or []
        report["collaborators_stored"] = len(got)
    except AragError as e:
        report["get_slug"] = f"{e.status}"
        return report
    voter = doc["origin"]["collaborators"][0]
    words = doc["title"].split(":", 1)[-1].strip()[:80] or voter
    report["voter"] = voter
    for attempt in range(FIND_POLL_ATTEMPTS if poll else 1):
        f = kb.find(words, top_k=10, filter_expression=collaborator_filter(voter),
                    show=["basic", "origin"])
        hits = find_slugs(f)
        report["find_filtered_hits"] = len(hits)
        if slug in hits:
            report["find_filtered"] = "found"
            report["indexed_after_s"] = attempt * FIND_POLL_SECONDS
            break
        report["find_filtered"] = "missing"
        if poll:
            time.sleep(FIND_POLL_SECONDS)
    # Retrieval-pollution check (GATE 3c): unfiltered kind=all query for the voter's
    # name -- how many of the top 10 are divisions?
    f = kb.find(voter, top_k=10, filter_expression={"field": {"not": {"prop": "field", "type": "generic"}}},
                show=["basic"])
    hits = find_slugs(f)
    report["unfiltered_top10_divisions"] = sum(1 for s in hits if s.startswith("division-"))
    report["unfiltered_top10_total"] = len(hits)
    return report


def pick_probe(docs: list[dict], n: int) -> list[dict]:
    """One document per (jurisdiction, house), the federal House division with the
    most voters first (the collaborator-cap test), then round-robin to n."""
    by_group: dict[tuple, list[dict]] = {}
    for d in docs:
        key = (d["labels"]["state"][0], d["labels"]["chamber"][0])
        by_group.setdefault(key, []).append(d)
    for group in by_group.values():
        group.sort(key=lambda d: -len(d["origin"]["collaborators"]))
    # federal House first (collaborator cap), then one chamber per other source,
    # then the Senate, then whatever chambers remain
    first_of: dict[str, tuple] = {}
    for key in sorted(by_group):
        first_of.setdefault(key[0], key)

    def rank(key: tuple) -> tuple:
        if key == ("federal", "representatives"):
            return (0, key)
        if key[0] != "federal" and first_of[key[0]] == key:
            return (1, key)
        if key == ("federal", "senate"):
            return (2, key)
        return (3, key)
    order = sorted(by_group, key=rank)
    picked: list[dict] = []
    while len(picked) < n and any(by_group.values()):
        for key in order:
            if by_group[key] and len(picked) < n:
                picked.append(by_group[key].pop(0))
    # A split division is one test: carry its other parts along.
    by_slug = {d["slug"]: d for d in docs}
    for d in list(picked):
        for slug in d["extra"].get("part_slugs", []):
            if slug in by_slug and by_slug[slug] not in picked:
                picked.append(by_slug[slug])
    return picked


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=str(DB_PATH))
    ap.add_argument("--from-ext", action="store_true")
    ap.add_argument("--from-legacy", action="store_true")
    ap.add_argument("--from-json", nargs="*", default=[])
    ap.add_argument("--jurisdiction", help="--from-ext: only this jurisdiction")
    ap.add_argument("--since", help="only divisions on/after this ISO date")
    ap.add_argument("--probe", type=int, default=0, help="GATE 3: push N documents, verify, stop")
    ap.add_argument("--verify-only", action="store_true")
    ap.add_argument("--limit", type=int, default=SAFETY_LIMIT)
    ap.add_argument("--full", action="store_true", help="lift the 100-document cap")
    ap.add_argument("--workers", type=int, default=WORKERS)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delete", nargs="*", default=[], help="delete these slugs and exit")
    ap.add_argument("--no-poll", action="store_true", help="probe: check /find once, do not wait for indexing")
    ap.add_argument("--load-ext-only", action="store_true",
                    help="--from-legacy: write the mapped divisions/votes into ext_divisions / ext_votes "
                         "in --db (per chamber-day replace, like votes_state --load) and push nothing")
    args = ap.parse_args()

    load_dotenv()
    cfg = AragConfig.from_env()
    if not args.dry_run and not args.load_ext_only and not cfg.kb_configured:
        sys.exit("ARAG_KB_ID / ARAG_KB_TOKEN not set")
    kb = None if (args.dry_run or args.load_ext_only) else KbClient(cfg)
    state = load_state()

    if args.load_ext_only:
        # The full federal table is too big for votes_state's JSON round trip (its
        # stats pass is O(divisions x votes)); reuse the same mapping and loader here.
        from parli.ingest.ext_common import ExtWriter
        from parli.ingest.votes_state import load_ext
        db = sqlite3.connect(f"file:{Path(args.db).expanduser()}?mode=ro", uri=True)
        db.row_factory = sqlite3.Row
        divisions, votes = read_legacy(db, args.since, None)
        db.close()
        log(f"[load-ext] {len(divisions)} federal divisions / {len(votes)} votes -> ext_ tables in {args.db}")
        writer = ExtWriter(db_path=args.db, dry_run=args.dry_run)
        for r in load_ext(divisions, votes, writer, notes="votes_ingest --from-legacy --load-ext-only"):
            print(json.dumps(r))
        return

    if args.delete:
        for slug in args.delete:
            try:
                kb.delete_resource_by_slug(slug)
                state["pushed"].pop(slug, None)
                log(f"deleted {slug}")
            except AragError as e:
                log(f"delete {slug}: {e.status} {e.detail[:100]}")
        save_state(state)
        return

    parts = []
    db = None
    if args.from_ext or args.from_legacy:
        db = sqlite3.connect(f"file:{Path(args.db).expanduser()}?mode=ro", uri=True)
        db.row_factory = sqlite3.Row
    if args.from_ext:
        parts.append(read_ext(db, args.jurisdiction, args.since, None))
    if args.from_legacy:
        parts.append(read_legacy(db, args.since, None))
    if args.from_json:
        d, v, _ = _read_unified(args.from_json)
        parts.append((d, v))
    if not parts:
        sys.exit("pick a source: --from-ext, --from-legacy and/or --from-json")
    divisions, votes_by = merge_sources(parts)
    docs = build_docs(divisions, votes_by)
    sizes = [len(x["text"].encode("utf-8")) for x in docs]
    log(f"{len(docs)} documents from {len(divisions)} divisions "
        f"(body bytes min/mean/max {min(sizes) if sizes else 0}/{sum(sizes) // max(len(sizes), 1)}/{max(sizes) if sizes else 0}; "
        f"collaborators max {max((len(x['origin']['collaborators']) for x in docs), default=0)})")

    if args.verify_only:
        for doc in docs:
            if doc["slug"] in state["pushed"]:
                print(json.dumps(verify_doc(kb, doc, poll=not args.no_poll)), flush=True)
        return

    if args.probe:
        picked = pick_probe(docs, args.probe)
        log(f"[probe] {len(picked)} documents: " + ", ".join(
            f"{d['slug']} ({len(d['origin']['collaborators'])} voters)" for d in picked))
        if args.dry_run:
            print(json.dumps([resource_body(d) for d in picked], indent=1, ensure_ascii=False)[:6000])
            return
        summary = push_docs(kb, picked, state, workers=1)
        log(f"[probe] push summary {json.dumps(summary)}")
        for doc in picked:
            print(json.dumps(verify_doc(kb, doc, poll=not args.no_poll)), flush=True)
        return

    todo = [d for d in docs if d["slug"] not in state["pushed"]]
    log(f"{len(todo)} not yet pushed ({len(docs) - len(todo)} already in the KB per state file)")
    if not args.full:
        if args.limit > SAFETY_LIMIT:
            sys.exit(f"--limit above {SAFETY_LIMIT} needs --full")
        todo = todo[:args.limit]
    if args.dry_run:
        for d in todo[:20]:
            print(f"  DRY {d['slug']:40s} {len(d['text']):6d} chars {len(d['origin']['collaborators']):4d} voters  {d['title'][:70]!r}")
        log(f"dry run: {len(todo)} would be pushed")
        return
    summary = push_docs(kb, todo, state, workers=args.workers)
    log(f"done {json.dumps(summary)}; pushed total {len(state['pushed'])}, failed {len(state['failed'])}; state {STATE_PATH}")


if __name__ == "__main__":
    main()
