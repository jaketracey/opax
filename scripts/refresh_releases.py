#!/usr/bin/env python3
"""Refresh the government-release corpus unattended: fetch the four sources, then publish to the KB.

    .venv/bin/python scripts/refresh_releases.py --db "$DB" --since "$SINCE"            # fetch + audit only
    .venv/bin/python scripts/refresh_releases.py --db "$DB" --since "$SINCE" --apply    # fetch + create in the KB

Sources (all CC BY 4.0, honest UA, no browser, no Firecrawl): the Prime Minister's transcripts
(`pmtranscripts`), Queensland ministerial statements (`qld`), the Victorian Premier (`vic`) and
Treasury ministers (`treasury`). NSW has its own step in daily_refresh.sh.

Why this is a script and not four shell lines:

  * PM transcripts and QLD statements have no listing. They are id probes (ids past the end
    404), so the window has to come from the highest id already stored: PM `max-50 .. max+400`,
    QLD `max-50 .. max+300` (the overlap re-probes ids the last run could not see yet).
  * VIC reads the sitemap (oldest first, `lastmod`), Treasury follows the JSON:API `links.next`;
    both take `--limit` newest-first style windows.
  * The fetchers upsert on the natural key and never delete, and `words_sync` is idempotent (a
    409 from the KB means "already there"), so a failed or repeated night is harmless.
  * Before anything is created in the KB the KB's own configuration is checked: automatic
    summaries must use the no-generation provider and enrichment tasks must be disabled
    (`assert_no_generation`, the check the 21 Sep publication used). If that check fails the
    publish step for every source is skipped: nothing is created.

Without --apply the publish step is `words_sync` in audit mode (no KB client, no creates), and
the KB configuration check is not made. Exit status: 0 = every step ran and succeeded,
1 = at least one fetch or publish step failed (the others still ran).
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ("pmtranscripts", "qld", "vic", "treasury")

# (id column default when the table is empty, ids before the stored max, ids past it)
ID_PROBES = {"pmtranscripts": (47_500, 50, 400), "qld": (106_000, 50, 300)}
# fetch limits for the listing-based sources
VIC_LIMIT, VIC_SITEMAP_PAGES, TREASURY_LIMIT = 400, 16, 300
PUBLISH_LIMIT = 10_000


def max_source_id(db_path: str | Path, source: str, default: int) -> int:
    """Highest numeric source_id stored for `source` (default when the table or rows are missing)."""
    try:
        con = sqlite3.connect(f"file:{Path(db_path).expanduser()}?mode=ro", uri=True)
    except sqlite3.Error:
        return default
    try:
        row = con.execute("SELECT MAX(CAST(source_id AS INTEGER)) FROM ext_press_releases WHERE source = ?", (source,)).fetchone()
        return int(row[0]) if row and row[0] is not None else default
    except sqlite3.Error:
        return default
    finally:
        con.close()


def count_source(db_path: str | Path, source: str) -> dict:
    try:
        con = sqlite3.connect(f"file:{Path(db_path).expanduser()}?mode=ro", uri=True)
        try:
            n, newest = con.execute("SELECT COUNT(*), MAX(date) FROM ext_press_releases WHERE source = ?", (source,)).fetchone()
            return {"rows": n, "newest": newest}
        finally:
            con.close()
    except sqlite3.Error:
        return {"rows": 0, "newest": None}


def fetch_argv(py: str, db_path: str | Path, source: str, since: str) -> list[str]:
    """The words_press_releases command that fetches `source` for the window ending now."""
    base = [py, "-u", "-m", "parli.ingest.words_press_releases", "--db", str(db_path), source]
    if source in ID_PROBES:
        default, before, after = ID_PROBES[source]
        top = max_source_id(db_path, source, default)
        return base + ["--ids", f"{max(1, top - before)}-{top + after}", "--since", since]
    if source == "vic":
        return base + ["--limit", str(VIC_LIMIT), "--sitemap-pages", str(VIC_SITEMAP_PAGES), "--since", since]
    if source == "treasury":
        return base + ["--limit", str(TREASURY_LIMIT), "--since", since]
    raise ValueError(f"unknown release source {source!r}")


def publish_argv(py: str, db_path: str | Path, source: str, since: str, apply: bool) -> list[str]:
    argv = [py, "-u", "-m", "parli.ingest.words_sync", "--db", str(db_path), "--source", source,
            "--since", since, "--full", "--limit", str(PUBLISH_LIMIT)]
    return argv + (["--apply"] if apply else [])


def check_kb_no_generation() -> None:
    """Raise unless the KB is configured for no automatic generation (needs the KB token; read-only calls)."""
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(ROOT / "scripts"))
    from parli.arag import AragConfig, KbClient, _request, load_dotenv
    from publish_collected_bill_texts import assert_no_generation
    load_dotenv()
    kb = KbClient(AragConfig.from_env())
    assert_no_generation(_request("GET", kb._rag("/configuration"), kb._headers),
                         _request("GET", kb._rag("/schema"), kb._headers), kb.list_tasks())


def _run(argv: list[str], timeout: int, env: dict) -> tuple[int, str, str, float]:
    t0 = time.time()
    try:
        p = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=timeout, env=env)
        return p.returncode, p.stdout, p.stderr, time.time() - t0
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        return 124, out, f"timeout after {timeout}s", time.time() - t0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--db", default=os.environ.get("OPAX_DB") or "~/.cache/autoresearch/parli.db")
    ap.add_argument("--since", default=(date.today() - timedelta(days=14)).isoformat(),
                    help="keep/publish releases dated on/after this day (default: 14 days ago)")
    ap.add_argument("--source", action="append", choices=SOURCES, help="repeatable; default all four")
    ap.add_argument("--apply", action="store_true", help="create the accepted releases in the KB (default: audit only)")
    ap.add_argument("--no-fetch", action="store_true", help="skip the fetch step (publish what is stored)")
    ap.add_argument("--no-publish", action="store_true", help="skip the publish step (fetch only)")
    ap.add_argument("--plan", action="store_true", help="print the commands and stop; run nothing")
    ap.add_argument("--fetch-timeout", type=int, default=45 * 60)
    ap.add_argument("--publish-timeout", type=int, default=30 * 60)
    args = ap.parse_args(argv)
    db = str(Path(args.db).expanduser())
    py = sys.executable
    env = dict(os.environ, PYTHONPATH=str(ROOT) + os.pathsep + os.environ.get("PYTHONPATH", ""))
    sources = args.source or list(SOURCES)

    report: dict = {"db": db, "since": args.since, "apply": args.apply, "sources": {}}
    if args.plan:
        for s in sources:
            report["sources"][s] = {"fetch": fetch_argv(py, db, s, args.since),
                                    "publish": publish_argv(py, db, s, args.since, args.apply)}
        print(json.dumps(report, indent=2))
        return 0

    failed = False
    if not args.no_fetch:
        for s in sources:
            before = count_source(db, s)
            rc, out, err, secs = _run(fetch_argv(py, db, s, args.since), args.fetch_timeout, env)
            after = count_source(db, s)
            entry = {"before": before, "after": after, "rc": rc, "seconds": round(secs),
                     "added": after["rows"] - before["rows"]}
            if rc != 0:
                failed = True
                entry["error"] = (err or out)[-400:]
            report["sources"].setdefault(s, {})["fetch"] = entry
            print(f"[{s}] fetch rc={rc} {before['rows']} -> {after['rows']} rows (newest {after['newest']}) in {secs:.0f}s", flush=True)

    if not args.no_publish:
        blocked = None
        if args.apply:
            try:
                check_kb_no_generation()
            except Exception as e:  # noqa: BLE001 - any failure to prove "no generation" blocks every create
                blocked = f"{type(e).__name__}: {e}"
                failed = True
                print(f"KB safety check failed, publishing nothing: {blocked}", flush=True)
        for s in sources:
            if blocked:
                report["sources"].setdefault(s, {})["publish"] = {"skipped": blocked}
                continue
            rc, out, err, secs = _run(publish_argv(py, db, s, args.since, args.apply), args.publish_timeout, env)
            entry = {"mode": "apply" if args.apply else "audit", "rc": rc, "seconds": round(secs)}
            try:
                res = json.loads(out[out.index("{"):])
                entry.update({k: res.get(k) for k in ("examined", "accepted", "selected", "created", "existing", "failed", "rejected")})
            except ValueError:
                entry["output_tail"] = out[-300:]
            if rc != 0:
                failed = True
                entry["error"] = (err or out)[-400:]
            report["sources"].setdefault(s, {})["publish"] = entry
            print(f"[{s}] publish({entry['mode']}) rc={rc} " + json.dumps({k: entry.get(k) for k in ("accepted", "created", "existing", "failed")}),
                  flush=True)
    print(json.dumps(report, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
