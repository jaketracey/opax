#!/usr/bin/env python3
"""Fetch the explanatory memorandum for bills whose source pack has none.

Reads the pack `build_sources.py` wrote and, for every bill that is not yet
sourced from a cached EM or digest, tries in order:

  1. an `em` row in `bill_sources` whose document was never cached: fetch it;
  2. a cached billhome page: parse its EM links, fetch the plain EM;
  3. a legacy ALRC bill with no billhome: resolve the ParlInfo billhome by the
     audited title rule against the parliament listings (43 and 44 for 2013
     bills), fetch the billhome, then its EM.

Everything goes through `bills_common.fetch`, so it is cache-first and holds
ParlInfo to 0.7 requests a second; a run of 403s raises `Blocked` and stops.
Results land in `<root>/fetched.json` (bill_key -> billhome and em records),
which `build_sources.py --fetched` consults. Nothing here writes to parli.db.

    python3 fetch_missing.py --repo /home/jake/opax --root <pack root>
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sqlite3
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.path.expanduser("~/opax"))
    ap.add_argument("--root", default=os.path.expanduser("~/.cache/autoresearch/bill-summaries-20261110"))
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--parliaments", type=int, nargs="+", default=[43, 44])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", help="comma-separated bill keys")
    args = ap.parse_args()

    sys.path.insert(0, os.path.join(args.repo, "scripts", "bills_registry"))
    sys.path.insert(0, args.repo)
    import bills_common as bc  # noqa: E402
    import bills_fetch as bf  # noqa: E402

    root = Path(args.root)
    out_path = root / "fetched.json"
    fetched = json.loads(out_path.read_text()) if out_path.exists() else {}
    manifest = {m["bill_key"]: m for m in json.loads((root / "manifest.json").read_text())}
    needs = json.loads((root / "needs_fetch.json").read_text())
    targets = [m["bill_key"] for m in manifest.values() if m["basis"] not in ("em", "digest")]
    targets += [e["bill_key"] for e in needs]
    if args.only:
        want = set(args.only.split(","))
        targets = [t for t in targets if t in want]
    targets = [t for t in targets if not fetched.get(t, {}).get("em") and not fetched.get(t, {}).get("final")]
    if args.limit:
        targets = targets[: args.limit]
    print(f"{len(targets)} bills to try", flush=True)

    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    bills = {r["bill_key"]: dict(r) for r in db.execute("SELECT * FROM bills_v2")}
    intro = {r[0]: r[1] for r in db.execute("SELECT bill_key, MIN(date) FROM bill_events GROUP BY bill_key")}

    listings: dict[str, list[dict]] = {}
    def listing_index():
        if listings:
            return listings
        for p in args.parliaments:
            for row in bf.enumerate_parliament(p):
                listings.setdefault(bc.norm(row["title"]), []).append(row)
        return listings

    def save():
        out_path.write_text(json.dumps(fetched, ensure_ascii=False, indent=1), encoding="utf-8")

    def fetch_em_from_billhome(key: str, code: str, body: str, path: str, url: str, pid: str, record_date):
        rec = bf.parse_billhome(body, code)
        docs = rec["em_docs"]
        entry = fetched.setdefault(key, {})
        entry["billhome"] = {"source_id": pid, "code": code, "url": url, "cache_path": path,
                             "content_hash": bc.sha256(body), "record_date": record_date,
                             "short_title": rec.get("short_title"), "status": rec.get("status"),
                             "events": rec["events"][:12], "em_docs": docs}
        plain = [d for d in docs if bf.em_kind(d["label"]) == "em"] or docs
        if not plain:
            entry["final"] = "no_em_link"
            return
        d = plain[0]
        em_url = bc.display_url(d["doc_id"])
        em_body, em_path, _ = bc.fetch(em_url, bf.em_kind(d["label"]), d["doc_id"])
        if not em_body or '<div class="box">' not in em_body:
            entry["final"] = "em_fetch_failed"
            return
        entry["em"] = {"kind": bf.em_kind(d["label"]), "label": d["label"], "source_id": d["doc_id"], "url": em_url,
                       "cache_path": em_path, "content_hash": bc.sha256(em_body),
                       "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()}

    done = 0
    for key in targets:
        b = bills.get(key)
        if not b:
            continue
        try:
            rows = [dict(r) for r in db.execute(
                "SELECT * FROM bill_sources WHERE bill_key=? AND kind IN ('em','em_revised','em_supp','billhome')", (key,))]
            ems = [r for r in rows if r["kind"] == "em"] or [r for r in rows if r["kind"] == "em_revised"]
            home = next((r for r in rows if r["kind"] == "billhome"), None)
            entry = fetched.setdefault(key, {})
            if ems:
                r = ems[0]
                em_body, em_path, _ = bc.fetch(r["url"], r["kind"], r["source_id"])
                if em_body and '<div class="box">' in em_body:
                    entry["em"] = {"kind": r["kind"], "label": None, "source_id": r["source_id"], "url": r["url"],
                                   "cache_path": em_path, "content_hash": bc.sha256(em_body),
                                   "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()}
                else:
                    entry["final"] = "em_fetch_failed"
            elif home and home.get("cache_path") and os.path.exists(home["cache_path"]):
                body = Path(home["cache_path"]).read_text(encoding="utf-8", errors="replace")
                code = (home["source_id"] or "").rsplit("/", 1)[-1]
                fetch_em_from_billhome(key, code, body, home["cache_path"], home["url"], home["source_id"], home.get("document_date"))
            elif b["source_system"] == "alrc":
                cands = listing_index().get(bc.norm(b["title"]), [])
                if not cands:
                    entry["final"] = "no_listing_match"
                else:
                    chosen = None
                    if len(cands) == 1:
                        chosen = cands[0]
                    else:
                        want = (b.get("introduced_date") or intro.get(key) or "")[:4]
                        narrowed = [c for c in cands if (c.get("record_date") or "")[:4] == want]
                        if len(narrowed) == 1:
                            chosen = narrowed[0]
                        else:
                            entry["final"] = "ambiguous_listing"
                            entry["candidates"] = cands
                    if chosen:
                        url = bc.display_url(chosen["parlinfo_id"])
                        body, path, _ = bc.fetch(url, "billhome", chosen["code"])
                        if not body or "<short-title>" not in body:
                            entry["final"] = "billhome_fetch_failed"
                        else:
                            fetch_em_from_billhome(key, chosen["code"], body, path, url, chosen["parlinfo_id"], chosen.get("record_date"))
            else:
                entry["final"] = "no_route"
        except bc.Blocked as e:
            print(f"BLOCKED: {e}", file=sys.stderr, flush=True)
            save()
            return 130
        except Exception as e:  # keep going; record the failure
            fetched.setdefault(key, {})["final"] = f"error {type(e).__name__}: {str(e)[:120]}"
        done += 1
        state = "em" if fetched.get(key, {}).get("em") else fetched.get(key, {}).get("final")
        print(f"{done}/{len(targets)} {key} {state} {bc.stats()}", flush=True)
        if done % 10 == 0:
            save()
    save()
    got = sum(1 for v in fetched.values() if v.get("em"))
    print(f"DONE em fetched for {got} bills; {bc.stats()}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
