#!/usr/bin/env python3
"""
OPAX topic labelling by fanned-out coding agents (no per-token model spend).

The platform's own labeler task labels ~1,100 speeches an hour. This harness
lets N agent workers (Codex sessions on the subscription) label in parallel:
each worker claims a batch of unlabelled speeches, reads them, decides 0-3
topics from the 21-topic taxonomy in scripts/arag_enrich.py, and submits;
the harness writes the labels to the knowledge box as resource-level
usermetadata classifications (labelset "topic"), merged with the labels the
resource already carries (kind, source, state, party, chamber, decade), which
is exactly how the site's /classification.labels/topic/<slug> filters index.

State: one SQLite queue (default under the scratchpad) so workers never
collide. Everything is resumable; nothing is ever deleted from the box.

  python3 scripts/label_workers.py init --rids unlabelled_rids.json --skip 25000
  python3 scripts/label_workers.py next --worker w1 --n 40 --out /tmp/w1.json
  python3 scripts/label_workers.py submit --worker w1 --labels /tmp/w1-labels.json
  python3 scripts/label_workers.py status
  python3 scripts/label_workers.py verify --n 5
  python3 scripts/label_workers.py sample --n 200 --out /tmp/sample.json --answers /tmp/answers.json
  python3 scripts/label_workers.py agreement --labels /tmp/sample-labels.json --answers /tmp/answers.json
  python3 scripts/label_workers.py release --worker w1     # after a crashed worker

.env (repo root) supplies ARAG_ZONE, ARAG_KB_ID, ARAG_KB_TOKEN.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from arag_enrich import TOPICS  # noqa: E402  (slug, description, examples)

TOPIC_SLUGS = [t[0] for t in TOPICS]
DEFAULT_DB = Path(os.environ.get("LABEL_QUEUE_DB") or (
    "/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/labels_queue.sqlite"))
STOP_FILE = DEFAULT_DB.with_name("labels_stop")
STALE_CLAIM_S = 45 * 60
MAX_LABELS = 4
TEXT_HEAD, TEXT_TAIL = 1800, 400
PACE_S = 0.5           # seconds between a worker's requests (a 20-worker Sonnet fleet stays well under the box's ceiling)
POOL = 3               # parallel requests per worker


def env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v.strip().strip('"').strip("'")
    return out


class Kb:
    def __init__(self) -> None:
        e = env()
        self.base = f"https://{e['ARAG_ZONE']}.rag.progress.cloud/api/v1/kb/{e['ARAG_KB_ID']}"
        self.headers = {"x-nuclia-serviceaccount": f"Bearer {e['ARAG_KB_TOKEN']}", "content-type": "application/json"}

    def call(self, method: str, path: str, body: dict | None = None, tries: int = 9) -> dict:
        data = None if body is None else json.dumps(body).encode()
        time.sleep(PACE_S)  # many workers share one account: keep each one's requests spaced
        for attempt in range(tries):
            req = urllib.request.Request(self.base + path, data=data, headers=self.headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=90) as r:
                    raw = r.read()
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as err:
                if err.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                    # A 429 is the box asking the whole fleet to slow down: wait it out
                    # (up to about two minutes across the retries) rather than drop the
                    # row and have another worker read and label it again.
                    time.sleep(min(20, 1.5 * (2 ** attempt)) + random.random() * 2)
                    continue
                raise RuntimeError(f"{method} {path} -> {err.code}: {err.read()[:200]!r}") from None
            except (urllib.error.URLError, TimeoutError) as err:
                if attempt < tries - 1:
                    time.sleep(1.5 * (2 ** attempt))
                    continue
                raise RuntimeError(f"{method} {path} -> {err}") from None
        raise RuntimeError("unreachable")

    def resource(self, rid: str) -> dict:
        return self.call("GET", f"/resource/{rid}?show=basic&show=values")

    def patch_classifications(self, rid: str, classifications: list[dict]) -> None:
        self.call("PATCH", f"/resource/{rid}", {"usermetadata": {"classifications": classifications}})


def db(path: Path = DEFAULT_DB) -> sqlite3.Connection:
    con = sqlite3.connect(path, timeout=60)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("""CREATE TABLE IF NOT EXISTS queue (
        rid TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending', worker TEXT,
        claimed_at REAL, done_at REAL, slug TEXT, existing TEXT, labels TEXT, error TEXT, force INTEGER NOT NULL DEFAULT 0)""")
    con.execute("CREATE INDEX IF NOT EXISTS queue_status ON queue(status)")
    con.execute("""CREATE TABLE IF NOT EXISTS log (
        ts REAL, worker TEXT, rid TEXT, slug TEXT, labels TEXT)""")
    return con


def clip(text: str) -> str:
    text = " ".join(text.split())
    if len(text) <= TEXT_HEAD + TEXT_TAIL + 20:
        return text
    return text[:TEXT_HEAD] + " […] " + text[-TEXT_TAIL:]


def fetch_item(kb: Kb, rid: str) -> dict:
    d = kb.resource(rid)
    texts = (d.get("data") or {}).get("texts") or {}
    body = ""
    for v in texts.values():
        body = ((v.get("value") or {}).get("body") or "")
        if body:
            break
    cls = (d.get("usermetadata") or {}).get("classifications") or []
    tags = {c.get("labelset"): c.get("label") for c in cls if c.get("labelset") in ("state", "party", "chamber")}
    return {
        "rid": rid,
        "slug": d.get("slug"),
        "title": d.get("title") or "",
        "state": tags.get("state"),
        "party": tags.get("party"),
        "text": clip(body),
        "_existing": [{"labelset": c.get("labelset"), "label": c.get("label")} for c in cls if c.get("labelset") and c.get("label")],
        "_has_topic": any(c.get("labelset") == "topic" for c in cls),
    }


def cmd_init(a: argparse.Namespace) -> None:
    rids = json.load(open(a.rids))
    rids = [r if isinstance(r, str) else (r.get("id") or r.get("rid")) for r in rids][a.skip:]
    con = db()
    con.executemany("INSERT OR IGNORE INTO queue(rid) VALUES (?)", [(r,) for r in rids])
    con.commit()
    print(f"queued {len(rids)} rids (skipped the first {a.skip}); total rows {con.execute('SELECT COUNT(*) FROM queue').fetchone()[0]}")


RETIRED_WORKERS = re.compile(r"^h\d+$")  # the Haiku fleet of 2026-09-05: it scripted its labels and is refused


def cmd_next(a: argparse.Namespace) -> None:
    if RETIRED_WORKERS.match(a.worker or ""):
        Path(a.out).write_text("[]")
        print("STOP: this worker id is retired; do not continue.")
        return
    if STOP_FILE.exists():
        Path(a.out).write_text("[]")
        print("STOP")
        return
    con = db()
    now = time.time()
    # Reading forty speeches takes a person or a model well over half a minute;
    # a worker that has landed more than 700 in ten minutes is running a script
    # over the text instead of reading it, and gets nothing more.
    recent = con.execute("SELECT COUNT(*) FROM log WHERE worker=? AND ts > ?", (a.worker, now - 600)).fetchone()[0]
    if recent > 700:
        Path(a.out).write_text("[]")
        print("STOP: this worker has submitted more than 700 speeches in ten minutes, which no reader can do; scripted labels are not accepted.")
        return
    with con:
        con.execute("UPDATE queue SET status='pending', worker=NULL, claimed_at=NULL WHERE status='claimed' AND claimed_at < ?",
                    (now - STALE_CLAIM_S,))
    kb = Kb()
    items: list[dict] = []
    errors: list[tuple[str, str]] = []
    already_n = 0
    claimed_any = False
    # Claim in rounds until the batch is full: a stretch of the queue the
    # platform's own labeler has already reached yields nothing to read, and
    # those rows are retired here without costing the worker an empty batch.
    for _round in range(6):
        want = a.n - len(items)
        if want <= 0:
            break
        with con:
            rows = con.execute("SELECT rid FROM queue WHERE status='pending' LIMIT ?", (want,)).fetchall()
            rids = [r[0] for r in rows]
            con.executemany("UPDATE queue SET status='claimed', worker=?, claimed_at=? WHERE rid=? AND status='pending'",
                            [(a.worker, time.time(), r) for r in rids])
        if not rids:
            break
        claimed_any = True
        fetched: list[dict] = []
        with ThreadPoolExecutor(max_workers=POOL) as pool:
            for rid, res in zip(rids, pool.map(lambda r: _safe(fetch_item, kb, r), rids)):
                if isinstance(res, Exception):
                    errors.append((rid, str(res)[:200]))
                else:
                    fetched.append(res)
        with con:
            for rid, err in errors:
                con.execute("UPDATE queue SET status='error', error=?, worker=? WHERE rid=? AND status='claimed'", (err, a.worker, rid))
            forced = {r[0] for r in con.execute("SELECT rid FROM queue WHERE force=1 AND rid IN (%s)" % ",".join("?" * len(rids)), rids)}
            # A forced row is reread even though the box holds a topic for it
            # (a retired worker wrote that topic); any other row the platform
            # has already labelled is retired here.
            already = [it for it in fetched if it["_has_topic"] and it["rid"] not in forced]
            for it in already:
                con.execute("UPDATE queue SET status='done', done_at=?, slug=?, labels='[]', error='already-labelled' WHERE rid=?",
                            (time.time(), it["slug"], it["rid"]))
            keep = [it for it in fetched if not it["_has_topic"] or it["rid"] in forced]
            for it in keep:
                con.execute("UPDATE queue SET slug=?, existing=? WHERE rid=?", (it["slug"], json.dumps(it["_existing"]), it["rid"]))
        already_n += len(already)
        items.extend(keep)
    if not claimed_any and not items:
        Path(a.out).write_text("[]")
        print("NONE")
        return
    public = [{k: v for k, v in it.items() if not k.startswith("_")} for it in items]
    Path(a.out).write_text(json.dumps(public, ensure_ascii=False, indent=0))
    print(f"batch {len(public)} speeches for {a.worker} (errors {len(errors)}, already labelled {already_n}) -> {a.out}")


def _safe(fn, *args):
    try:
        return fn(*args)
    except Exception as err:  # noqa: BLE001
        return err


def cmd_submit(a: argparse.Namespace) -> None:
    if RETIRED_WORKERS.match(a.worker or ""):
        print("STOP: this worker id is retired; nothing was written.")
        return
    labels: dict[str, list[str]] = json.load(open(a.labels))
    con = db()
    rows = {r[0]: (r[1], r[2], r[3]) for r in con.execute(
        "SELECT rid, slug, existing, status FROM queue WHERE rid IN (%s)" % ",".join("?" * len(labels)), list(labels))}
    # A batch that calls more than half its speeches topicless was not read: the
    # fleet's honest rate is about one in five. Refuse it whole so the worker
    # rereads, rather than let empty verdicts retire rows from the queue.
    n_in = len(labels)
    n_empty = sum(1 for v in labels.values() if not v)
    if n_in >= 20 and n_empty > 0.8 * n_in:  # a procedural sitting can honestly run 60-70% topicless; only a near-total blank is refused
        print(f"REJECTED: {n_empty} of {n_in} speeches marked no-topic; the fleet norm is about one in five. "
              "Reread the texts (a label is decided from the text, never the title) and submit again; your claims are kept.")
        return
    kb = Kb()
    jobs: list[tuple[str, list[str], list[dict]]] = []
    bad = 0
    for rid, chosen in labels.items():
        if rid not in rows or rows[rid][2] != "claimed":
            bad += 1
            continue
        clean = []
        for s in chosen if isinstance(chosen, list) else []:
            s = str(s).strip().lower()
            if s in TOPIC_SLUGS and s not in clean:
                clean.append(s)
        clean = clean[:MAX_LABELS]
        existing = json.loads(rows[rid][1] or "[]")
        merged = [c for c in existing if c.get("labelset") != "topic"] + [{"labelset": "topic", "label": s} for s in clean]
        jobs.append((rid, clean, merged))

    def write(job):
        rid, clean, merged = job
        if clean:
            kb.patch_classifications(rid, merged)
        return rid, clean

    done, failed = 0, 0
    with ThreadPoolExecutor(max_workers=POOL) as pool:
        for job, res in zip(jobs, pool.map(lambda j: _safe(write, j), jobs)):
            rid = job[0]
            with con:
                if isinstance(res, Exception):
                    failed += 1
                    con.execute("UPDATE queue SET status='error', error=? WHERE rid=?", (str(res)[:200], rid))
                else:
                    done += 1
                    con.execute("UPDATE queue SET status='done', done_at=?, labels=? WHERE rid=?",
                                (time.time(), json.dumps(job[1]), rid))
                    con.execute("INSERT INTO log VALUES (?,?,?,?,?)", (time.time(), a.worker, rid, rows[rid][0], json.dumps(job[1])))
    print(f"submitted {done} (labelled {sum(1 for j in jobs if j[1])}, no topic {sum(1 for j in jobs if not j[1])}), failed {failed}, not claimed by you {bad}")


def cmd_status(a: argparse.Namespace) -> None:
    con = db()
    counts = dict(con.execute("SELECT status, COUNT(*) FROM queue GROUP BY status").fetchall())
    now = time.time()
    last10 = con.execute("SELECT COUNT(*) FROM queue WHERE status='done' AND done_at > ?", (now - 600,)).fetchone()[0]
    last60 = con.execute("SELECT COUNT(*) FROM queue WHERE status='done' AND done_at > ?", (now - 3600,)).fetchone()[0]
    workers = con.execute("SELECT worker, COUNT(*) FROM queue WHERE status='done' AND done_at > ? GROUP BY worker", (now - 3600,)).fetchall()
    pending = counts.get("pending", 0) + counts.get("claimed", 0)
    rate = last60 or (last10 * 6)
    eta = f"{pending / rate:.1f} h" if rate else "n/a"
    labelled = con.execute("SELECT COUNT(*) FROM queue WHERE status='done' AND labels != '[]'").fetchone()[0]
    print(json.dumps({"counts": counts, "labelled_with_topics": labelled, "done_last_10min": last10, "done_last_hour": last60,
                      "workers_last_hour": dict(workers), "eta_at_current_rate": eta, "stop_file": STOP_FILE.exists()}, indent=1))


def cmd_verify(a: argparse.Namespace) -> None:
    con = db()
    rows = con.execute("SELECT rid, slug, labels FROM queue WHERE status='done' AND labels != '[]' ORDER BY done_at DESC LIMIT ?", (a.n,)).fetchall()
    kb = Kb()
    for rid, slug, labels in rows:
        d = kb.call("GET", f"/resource/{rid}?show=basic")
        live = [c["label"] for c in (d.get("usermetadata") or {}).get("classifications", []) if c.get("labelset") == "topic"]
        print(f"{slug}: submitted {json.loads(labels)} | live {live}")


def cmd_release(a: argparse.Namespace) -> None:
    con = db()
    with con:
        n = con.execute("UPDATE queue SET status='pending', worker=NULL, claimed_at=NULL WHERE status='claimed' AND worker=?", (a.worker,)).rowcount
    print(f"released {n} claims of {a.worker}")


def cmd_retry_errors(a: argparse.Namespace) -> None:
    con = db()
    with con:
        n = con.execute("UPDATE queue SET status='pending', worker=NULL, claimed_at=NULL, error=NULL WHERE status='error'").rowcount
    print(f"re-queued {n} errored rids")


def cmd_sample(a: argparse.Namespace) -> None:
    """Platform-labelled speeches for an agreement check: items without labels, answers alongside."""
    kb = Kb()
    picked: dict[str, list[str]] = {}
    slugs = TOPIC_SLUGS[:]
    random.shuffle(slugs)
    per = max(1, a.n // len(slugs) + 1)
    for slug in slugs:
        page = random.randint(0, 20)
        c = kb.call("GET", f"/catalog?filters=/classification.labels/topic/{slug}&filters=/classification.labels/kind/speech&page_size={per}&page_number={page}&show=basic")
        for rid in (c.get("resources") or {}):
            picked.setdefault(rid, [])
        if len(picked) >= a.n:
            break
    rids = list(picked)[: a.n]
    items, answers = [], {}
    with ThreadPoolExecutor(max_workers=POOL) as pool:
        for rid, d in zip(rids, pool.map(lambda r: _safe(kb.resource, r), rids)):
            if isinstance(d, Exception):
                continue
            fc = (d.get("computedmetadata") or {}).get("field_classifications") or []
            truth = sorted({c["label"] for f in fc for c in f.get("classifications", []) if c.get("labelset") == "topic"})
            um = sorted({c["label"] for c in (d.get("usermetadata") or {}).get("classifications", []) if c.get("labelset") == "topic"})
            truth = truth or um
            if not truth:
                continue
            body = ""
            for v in ((d.get("data") or {}).get("texts") or {}).values():
                body = ((v.get("value") or {}).get("body") or "")
                if body:
                    break
            items.append({"rid": rid, "slug": d.get("slug"), "title": d.get("title") or "", "text": clip(body)})
            answers[rid] = truth
    Path(a.out).write_text(json.dumps(items, ensure_ascii=False, indent=0))
    Path(a.answers).write_text(json.dumps(answers, indent=0))
    print(f"sample {len(items)} platform-labelled speeches -> {a.out}; answers -> {a.answers}")


def cmd_agreement(a: argparse.Namespace) -> None:
    mine: dict[str, list[str]] = json.load(open(a.labels))
    truth: dict[str, list[str]] = json.load(open(a.answers))
    n = exact = 0
    jacc = 0.0
    any_overlap = 0
    for rid, t in truth.items():
        m = [s for s in mine.get(rid, []) if s in TOPIC_SLUGS]
        n += 1
        st, sm = set(t), set(m)
        if st == sm:
            exact += 1
        if st & sm:
            any_overlap += 1
        jacc += len(st & sm) / len(st | sm) if (st | sm) else 1.0
    print(json.dumps({"n": n, "exact": round(exact / n, 3) if n else None, "share_a_label": round(any_overlap / n, 3) if n else None,
                      "mean_jaccard": round(jacc / n, 3) if n else None}, indent=1))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("init"); s.add_argument("--rids", required=True); s.add_argument("--skip", type=int, default=0); s.set_defaults(fn=cmd_init)
    s = sub.add_parser("next"); s.add_argument("--worker", required=True); s.add_argument("--n", type=int, default=40); s.add_argument("--out", required=True); s.set_defaults(fn=cmd_next)
    s = sub.add_parser("submit"); s.add_argument("--worker", required=True); s.add_argument("--labels", required=True); s.set_defaults(fn=cmd_submit)
    s = sub.add_parser("status"); s.set_defaults(fn=cmd_status)
    s = sub.add_parser("verify"); s.add_argument("--n", type=int, default=5); s.set_defaults(fn=cmd_verify)
    s = sub.add_parser("release"); s.add_argument("--worker", required=True); s.set_defaults(fn=cmd_release)
    s = sub.add_parser("retry-errors"); s.set_defaults(fn=cmd_retry_errors)
    s = sub.add_parser("sample"); s.add_argument("--n", type=int, default=200); s.add_argument("--out", required=True); s.add_argument("--answers", required=True); s.set_defaults(fn=cmd_sample)
    s = sub.add_parser("agreement"); s.add_argument("--labels", required=True); s.add_argument("--answers", required=True); s.set_defaults(fn=cmd_agreement)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
