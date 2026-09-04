#!/usr/bin/env python3
"""Compare a stratified speech sample with one KB text field per resource.

The database query runs read-only on ``desktop``.  The KB side calls only
``GET /slug/{slug}/text/body``; it never lists or downloads whole resources.
No generation or enrichment endpoint is used.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from parli.arag import AragConfig, AragError, KbClient, _request, load_dotenv


REMOTE_CANDIDATES = r'''
import hashlib, html, json, sqlite3

DB = "/home/jake/.cache/autoresearch/parli.db"
SOURCES = (
    "committee_senate", "nsw_hansard", "openaustralia", "qld_hansard",
    "sa_hansard", "vic_hansard", "zenodo",
)

def current_clean(text, source, topic):
    if "&#" in text:
        text = html.unescape(text)
    text = text.lstrip(": ").lstrip("—- ").lstrip()
    if source == "nsw_hansard" and topic and text.startswith(topic.upper()):
        text = text[len(topic):].lstrip()
    if source == "committee_senate" and topic:
        text = f"[{topic}] {text}"
    return text

db = sqlite3.connect("file:" + DB + "?mode=ro", uri=True)
db.row_factory = sqlite3.Row
out = []
for source in SOURCES:
    rows = db.execute(
        """SELECT speech_id, source, topic, text
             FROM speeches
            WHERE source=? AND date >= '1993-03-13' AND date <= '2024-12-31'
              AND LENGTH(text) >= 200
              AND UPPER(COALESCE(speaker_name,'')) NOT LIKE '%SPEAKER%'
              AND UPPER(COALESCE(speaker_name,'')) NOT LIKE '%PRESIDENT%'
              AND UPPER(COALESCE(speaker_name,'')) NOT LIKE '%CHAIR%'
            ORDER BY speech_id""",
        (source,),
    ).fetchall()
    if not rows:
        continue
    wanted = 80
    for i in range(min(wanted, len(rows))):
        row = rows[(i * len(rows)) // min(wanted, len(rows))]
        expected = current_clean(row["text"], row["source"], row["topic"])
        out.append({
            "speech_id": row["speech_id"],
            "source": row["source"],
            "expected_sha256": hashlib.sha256(expected.encode()).hexdigest(),
            "expected_start": expected[:200],
        })
print(json.dumps(out, ensure_ascii=False))
'''


def candidates(host: str) -> list[dict[str, Any]]:
    proc = subprocess.run(
        ["ssh", host, "python3 -"],
        input=REMOTE_CANDIDATES,
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(proc.stdout)


def field_body(kb: KbClient, slug: str) -> str:
    field = _request("GET", kb._rag(f"/slug/{slug}/text/body"), kb._headers)
    return ((field or {}).get("value") or {}).get("body") or ""


def compare(host: str, limit: int) -> dict[str, Any]:
    rows = candidates(host)
    by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_source[row["source"]].append(row)

    load_dotenv()
    kb = KbClient(AragConfig.from_env())
    compared: list[dict[str, Any]] = []
    missing: Counter[str] = Counter()
    errors: list[dict[str, str]] = []
    source_names = sorted(by_source)
    offset = 0
    while len(compared) < limit and any(offset < len(by_source[s]) for s in source_names):
        for source in source_names:
            if len(compared) >= limit or offset >= len(by_source[source]):
                continue
            row = by_source[source][offset]
            slug = f"speech-{row['speech_id']}"
            try:
                actual = field_body(kb, slug)
            except AragError as exc:
                if exc.status == 404:
                    missing[source] += 1
                else:
                    errors.append({"slug": slug, "error": f"{exc.status}: {exc.detail[:120]}"})
                continue
            actual_hash = hashlib.sha256(actual.encode()).hexdigest()
            compared.append(
                {
                    "speech_id": row["speech_id"],
                    "slug": slug,
                    "source": source,
                    "matches_database_mapping": actual_hash == row["expected_sha256"],
                    "database_start": row["expected_start"],
                    "kb_start": actual[:200],
                }
            )
        offset += 1

    matches = sum(row["matches_database_mapping"] for row in compared)
    return {
        "requested": limit,
        "compared": len(compared),
        "matches": matches,
        "differs": len(compared) - matches,
        "by_source": dict(Counter(row["source"] for row in compared)),
        "missing_candidates": dict(missing),
        "errors": errors,
        "method": "GET /slug/{slug}/text/body only",
        "rows": compared,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="desktop")
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--output", type=Path, help="optional JSON result path")
    args = parser.parse_args()
    result = compare(args.host, args.limit)
    rendered = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.write_text(rendered + "\n")
    print(rendered)


if __name__ == "__main__":
    main()
