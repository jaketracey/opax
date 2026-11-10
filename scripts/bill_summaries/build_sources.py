#!/usr/bin/env python3
"""Build the private source pack for bills that have no publishable summary.

For every `bills_v2` row without a projected `ok` summary (the same shape test
`scripts/export_bills.py` applies), pick the best source text the registry
already holds and write it to a private review directory:

    <root>/sources/<bill_key>.txt    the extracted plain text a writer reads
    <root>/sources/<bill_key>.json   bill facts, basis and source provenance
    <root>/manifest.json             one row per sourced bill
    <root>/needs_fetch.json          bills whose source must still be fetched
    <root>/unsourced.json            bills with no reachable source at all

Source preference, in order: explanatory memorandum (`em`, then `em_revised`),
Bills Digest (`digest`), the bill's own text from the bill-text import
(`text`, complete versions only, first-reading stage preferred), then the
second reading speech linked in `bill_links` (`speech`). Nothing here fetches:
`fetch_missing.py` does that for `needs_fetch.json` and this is rerun after.

Read-only against parli.db and the bill-text state database. Source text is
private (aph.gov.au is CC BY-NC-ND); only the model's own words are published.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

DB_PATH = os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db")
STATE_DB = os.path.expanduser("~/.cache/opax/bill-text-import-20260913/state.sqlite")
DEFAULT_ROOT = os.path.expanduser("~/.cache/autoresearch/bill-summaries-20261110")
FIRST_STAGES = ("first-reps", "first-senate", "first")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def html_to_text(raw: str) -> str:
    """ParlInfo display page -> plain text of the document body only."""
    start = raw.find('<div class="box">')
    body = raw[start:] if start >= 0 else raw
    end = body.find('<div id="footer"')
    if end > 0:
        body = body[:end]
    body = re.sub(r"(?is)<(script|style).*?</\1>", " ", body)
    body = re.sub(r"&#1[03];|&#x0?[aAdD];", " ", body)  # Word export encodes its soft line wraps as newline entities
    body = re.sub(r"\s+", " ", body)  # Word-derived HTML wraps mid-sentence; only tags mark paragraphs
    body = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</h\d>|</li>|</table>", "\n", body)
    body = re.sub(r"(?i)</td>|</th>", " \t", body)
    text = html.unescape(re.sub(r"<[^>]+>", " ", body))
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{2,}", "\n\n", text)
    return text.strip()


def projected_ok_keys(db: sqlite3.Connection) -> set[str]:
    out = set()
    for r in db.execute(
        "SELECT bill_key, summary_json FROM bill_summaries WHERE review_state='ok' "
        "AND (superseded_by IS NULL OR superseded_by='')"):
        try:
            p = json.loads(r["summary_json"] or "{}")
        except (TypeError, ValueError):
            continue
        if len(p.get("sentences") or []) == 3 and 3 <= len(p.get("changes") or []) <= 6:
            out.add(r["bill_key"])
    return out


def bill_facts(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    intro = row["introduced_date"]
    if not intro:
        r = db.execute("SELECT MIN(date) FROM bill_events WHERE bill_key=?", (row["bill_key"],)).fetchone()
        intro = r[0] if r else None
    try:
        aliases = json.loads(row["aliases_json"] or "{}")
    except (TypeError, ValueError):
        aliases = {}
    events = [dict(e) for e in db.execute(
        "SELECT stage, date, house, event_raw FROM bill_events WHERE bill_key=? ORDER BY date", (row["bill_key"],))]
    return {
        "bill_key": row["bill_key"],
        "title": row["title"],
        "short_title": row["short_title"],
        "parliament": row["parliament"],
        "introduced": intro,
        "originating_house": row["originating_house"],
        "sponsor": row["sponsor_name"],
        "sponsor_party": aliases.get("sponsor_party") if isinstance(aliases, dict) else None,
        "bill_type": aliases.get("type") if isinstance(aliases, dict) else None,
        "portfolio": row["portfolio"],
        "status": row["status"],
        "status_raw": row["status_raw"],
        "status_as_of": row["status_as_of"],
        "source_system": row["source_system"],
        "source_id": row["source_id"],
        "events": events[:12],
    }


def pick_document(db: sqlite3.Connection, key: str) -> tuple[dict | None, list[dict]]:
    """The best cached EM or digest row for a bill, plus the uncached ones."""
    rows = [dict(r) for r in db.execute(
        "SELECT * FROM bill_sources WHERE bill_key=? AND kind IN ('em','em_revised','digest')", (key,))]
    uncached = [r for r in rows if not (r.get("cache_path") and os.path.exists(r["cache_path"]))]
    for kind in ("em", "em_revised", "digest"):
        cands = [r for r in rows if r["kind"] == kind and r.get("cache_path") and os.path.exists(r["cache_path"])]
        if not cands:
            continue
        cands.sort(key=lambda r: (0 if r.get("outline_text") else 1, r.get("source_id") or ""))
        return cands[0], uncached
    return None, uncached


def bill_text_source(state: sqlite3.Connection | None, key: str) -> dict | None:
    if state is None:
        return None
    versions = [dict(r) for r in state.execute(
        "SELECT bill_key, source_version, stage, status, updated_at FROM bill_text_versions "
        "WHERE bill_key=? AND status='complete'", (key,))]
    if not versions:
        return None
    versions.sort(key=lambda v: (0 if (v.get("stage") or "") in FIRST_STAGES else 1, v.get("stage") or ""))
    v = versions[0]
    secs = [dict(r) for r in state.execute(
        "SELECT section_no, title, body, source_url, source_date, source_sha256 FROM bill_text_sections "
        "WHERE bill_key=? AND source_version=? ORDER BY section_no", (key, v["source_version"]))]
    if not secs:
        return None
    text = "\n\n".join((s.get("body") or "") for s in secs).strip()
    if not text:
        return None
    dates = sorted({s["source_date"] for s in secs if s.get("source_date")})
    return {
        "basis": "text",
        "text": text,
        "source": {
            "kind": "text",
            "id": v["source_version"],
            "stage": v.get("stage"),
            "url": secs[0].get("source_url"),
            "date": dates[0] if dates else None,
            "licence": "CC BY-NC-ND 4.0",
            "content_hash": sha256_text("\n\n".join((s.get("source_sha256") or "") for s in secs)),
            "sections": len(secs),
        },
    }


def speech_source(db: sqlite3.Connection, key: str, facts: dict) -> dict | None:
    links = [r[0] for r in db.execute(
        "SELECT target_key FROM bill_links WHERE bill_key=? AND kind='speech' AND COALESCE(audited,'')!='wrong'", (key,))]
    if not links:
        return None
    ids = []
    for t in links:
        m = re.search(r"(\d+)$", t)
        if m:
            ids.append(int(m.group(1)))
    if not ids:
        return None
    marks = ",".join("?" * len(ids))
    rows = [dict(r) for r in db.execute(
        f"SELECT speech_id, speaker_name, party, chamber, date, word_count, "
        f"COALESCE(text_clean, text) AS body, source FROM speeches WHERE speech_id IN ({marks})", ids)]
    rows = [r for r in rows if r.get("body")]
    if not rows:
        return None
    sponsor = (facts.get("sponsor") or "").split(",")[0].strip().casefold()
    def score(r):
        name = (r.get("speaker_name") or "").casefold()
        by_sponsor = bool(sponsor) and sponsor in name
        mentions_second = "second reading" in (r["body"] or "")[:4000].casefold()
        return (0 if by_sponsor else 1, 0 if mentions_second else 1, r.get("date") or "9999", -(r.get("word_count") or 0))
    rows.sort(key=score)
    r = rows[0]
    if (r.get("word_count") or len(r["body"].split())) < 250:
        return None
    return {
        "basis": "speech",
        "text": r["body"].strip(),
        "source": {
            "kind": "speech",
            "id": f"speech:{r['speech_id']}",
            "speaker": r.get("speaker_name"),
            "party": r.get("party"),
            "chamber": r.get("chamber"),
            "date": r.get("date"),
            "url": None,
            "licence": "CC BY-NC-ND 4.0 (Parliament of Australia)",
            "content_hash": sha256_text(r["body"]),
            "by_sponsor": bool(sponsor) and sponsor in (r.get("speaker_name") or "").casefold(),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--state-db", default=STATE_DB)
    ap.add_argument("--keys", help="comma-separated bill keys to limit to")
    ap.add_argument("--no-speech", action="store_true", help="do not fall back to a second reading speech")
    ap.add_argument("--fetched", help="fetch_missing.py sidecar (default <root>/fetched.json when present)")
    args = ap.parse_args()

    root = Path(args.root)
    (root / "sources").mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    state = None
    if os.path.exists(args.state_db):
        state = sqlite3.connect(f"file:{args.state_db}?mode=ro", uri=True)
        state.row_factory = sqlite3.Row

    fetched_path = Path(args.fetched) if args.fetched else root / "fetched.json"
    fetched = json.loads(fetched_path.read_text()) if fetched_path.exists() else {}

    ok = projected_ok_keys(db)
    bills = [r for r in db.execute("SELECT * FROM bills_v2 ORDER BY bill_key") if r["bill_key"] not in ok]
    if args.keys:
        want = set(args.keys.split(","))
        bills = [r for r in bills if r["bill_key"] in want]
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    manifest, needs_fetch, unsourced = [], [], []
    counts: dict[str, int] = {}
    for row in bills:
        key = row["bill_key"]
        facts = bill_facts(db, row)
        doc, uncached = pick_document(db, key)
        side = fetched.get(key, {}).get("em")
        if doc is None and side and side.get("cache_path") and os.path.exists(side["cache_path"]):
            doc = {"kind": side["kind"], "source_id": side["source_id"], "url": side["url"],
                   "document_date": None, "licence": "CC BY-NC-ND 4.0", "content_hash": side.get("content_hash"),
                   "cache_path": side["cache_path"], "fetched_at": side.get("fetched_at"), "outline_text": None,
                   "fetched_sidecar": True}
            uncached = []
        chosen = None
        if doc:
            raw = Path(doc["cache_path"]).read_text(encoding="utf-8", errors="replace")
            text = html_to_text(raw)
            if len(text) >= 1500:
                chosen = {
                    "basis": "digest" if doc["kind"] == "digest" else "em",
                    "text": text,
                    "source": {
                        "kind": doc["kind"],
                        "id": doc["source_id"],
                        "url": doc["url"],
                        "date": doc["document_date"],
                        "licence": doc.get("licence") or "CC BY-NC-ND 4.0",
                        "content_hash": doc.get("content_hash") or sha256_text(raw),
                        "cache_path": doc["cache_path"],
                        "fetched_at": doc.get("fetched_at"),
                        "from_sidecar": bool(doc.get("fetched_sidecar")),
                    },
                }
        if chosen is None:
            chosen = bill_text_source(state, key)
        if chosen is None and not args.no_speech and facts["status"] != "before_parliament":
            chosen = speech_source(db, key, facts)
        if chosen is None:
            billhome = db.execute(
                "SELECT source_id, url, cache_path FROM bill_sources WHERE bill_key=? AND kind='billhome'", (key,)).fetchone()
            entry = {**{k: facts[k] for k in ("bill_key", "title", "introduced", "status", "source_system", "source_id")}}
            if uncached:
                entry["reason"] = "em_uncached"
                entry["documents"] = [{"kind": u["kind"], "source_id": u["source_id"], "url": u["url"]} for u in uncached]
            elif billhome:
                entry["reason"] = "billhome_only"
                entry["billhome"] = dict(billhome)
            elif row["source_system"] == "alrc":
                entry["reason"] = "alrc_legacy"
            else:
                entry["reason"] = "no_source"
            needs_fetch.append(entry)
            continue
        text = chosen["text"]
        as_of = chosen["source"].get("date") or facts["introduced"]
        meta = {
            **facts,
            "basis": chosen["basis"],
            "as_of": as_of,
            "as_of_basis": "document_date" if chosen["source"].get("date") else "introduced",
            "source": {**chosen["source"], "review_text_sha256": sha256_text(text), "retrieved_at": now},
            "chars": len(text),
            "words": len(text.split()),
        }
        (root / "sources" / f"{key}.txt").write_text(text, encoding="utf-8")
        (root / "sources" / f"{key}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        manifest.append({k: meta[k] for k in ("bill_key", "title", "introduced", "status", "parliament", "basis", "as_of", "chars", "words")}
                        | {"source_kind": meta["source"]["kind"], "source_id": meta["source"]["id"]})
        counts[chosen["basis"]] = counts.get(chosen["basis"], 0) + 1
    manifest.sort(key=lambda m: (m["introduced"] or "", m["bill_key"]), reverse=True)
    (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    (root / "needs_fetch.json").write_text(json.dumps(needs_fetch, ensure_ascii=False, indent=1), encoding="utf-8")
    (root / "unsourced.json").write_text(json.dumps(unsourced, ensure_ascii=False, indent=1), encoding="utf-8")
    reasons: dict[str, int] = {}
    for e in needs_fetch:
        reasons[e["reason"]] = reasons.get(e["reason"], 0) + 1
    print(json.dumps({"missing": len(bills), "sourced": len(manifest), "by_basis": counts,
                      "needs_fetch": len(needs_fetch), "needs_fetch_reasons": reasons}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
