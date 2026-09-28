#!/usr/bin/env python3
"""Run a script or module and report every SQL statement that scans a big table.

    python scripts/vm/scan_audit.py -m parli.ingest.link_speakers
    python scripts/vm/scan_audit.py scripts/export_votes.py
    python scripts/vm/scan_audit.py --tables speeches,speech_topics --json out.json -m parli.ingest.nsw_hansard --start 2026-09-01

The refresh's SQL was written against a desktop where a full scan of the 29 GB `speeches` table takes
seconds; on a network disk (about 130 MB/s) it takes 3.5 minutes, and one careless COUNT(*) or
`WHERE chamber = ?` is a night. This runs the target for real (it is not a dry run: use it on a copy, or
on the step you were going to run anyway), installs a sqlite3 trace callback, and for every distinct
statement asks SQLite for its EXPLAIN QUERY PLAN on a second read-only connection. At the end it prints
each statement whose plan is a full-table SCAN of a watched table, with how many times it ran and its plan.
A `SCAN ... USING COVERING INDEX` is listed separately: it reads the index, not the table, so it is
usually fine (a few tens of MB), but it is still a scan.

Only the parts of the plan that name a watched table are reported. Statements run inside triggers are
ignored. Exit status is the target's own.
"""
import argparse
import atexit
import collections
import json
import os
import re
import runpy
import sqlite3
import sys
import time

WATCH_DEFAULT = "speeches,speech_topics"
_real_connect = sqlite3.connect
stats: dict[str, dict] = {}
aux: dict[str, sqlite3.Connection] = {}
watch: set[str] = set()


def normalise(sql: str) -> str:
    sql = re.sub(r"\s+", " ", sql.strip())
    sql = re.sub(r"'(?:[^']|'')*'", "?", sql)          # string literals
    sql = re.sub(r"\b\d+(?:\.\d+)?\b", "?", sql)        # numbers
    sql = re.sub(r"\(\s*\?(?:\s*,\s*\?)+\s*\)", "(?...)", sql)  # IN lists
    return sql[:600]


def plan_of(path: str, sql: str) -> list[str]:
    conn = aux.get(path)
    if conn is None:
        conn = _real_connect(f"file:{path}?mode=ro", uri=True, timeout=60)
        aux[path] = conn
    return [r[3] for r in conn.execute("EXPLAIN QUERY PLAN " + sql)]


def make_trace(path: str):
    def trace(statement: str) -> None:
        s = statement.lstrip()
        if s.startswith("--"):
            return
        head = s[:8].upper()
        if not head.startswith(("SELECT", "UPDATE", "DELETE", "INSERT", "WITH", "REPLACE")):
            return
        key = normalise(s)
        entry = stats.get(key)
        if entry is not None:
            entry["runs"] += 1
            return
        entry = {"runs": 1, "plan": None, "sample": s[:400]}
        stats[key] = entry
        try:
            entry["plan"] = plan_of(path, s)
        except sqlite3.Error as e:  # temp tables, syntax that needs the writer's session, ...
            entry["plan"] = [f"(no plan: {e})"]
    return trace


def patched_connect(database, *args, **kwargs):
    conn = _real_connect(database, *args, **kwargs)
    try:
        path = os.path.abspath(str(database).replace("file:", "").split("?")[0])
        if os.path.exists(path):
            conn.set_trace_callback(make_trace(path))
    except Exception:  # noqa: BLE001
        pass
    return conn


def report(json_path: str | None) -> None:
    rows = []
    for sql, e in stats.items():
        scans = []
        for line in e["plan"] or []:
            m = re.match(r"SCAN (\w+)(.*)", line)
            if m and m.group(1) in watch:
                scans.append(("covering-index" if "COVERING INDEX" in line else "TABLE", line))
        if scans:
            rows.append({"sql": sql, "runs": e["runs"], "scans": scans, "sample": e["sample"]})
    rows.sort(key=lambda r: (any(k == "TABLE" for k, _ in r["scans"]) is False, -r["runs"]))
    print("\n=== scan audit: statements that scan " + ", ".join(sorted(watch)) + " ===", file=sys.stderr)
    if not rows:
        print("  none", file=sys.stderr)
    for r in rows:
        kinds = {k for k, _ in r["scans"]}
        tag = "FULL TABLE SCAN" if "TABLE" in kinds else "index scan     "
        print(f"  [{tag}] x{r['runs']}  {r['sql'][:230]}", file=sys.stderr)
        for _, line in r["scans"]:
            print(f"        plan: {line}", file=sys.stderr)
    print(f"  ({len(stats)} distinct statements seen)", file=sys.stderr)
    if json_path:
        with open(json_path, "w") as f:
            json.dump(rows, f, indent=1)


def parse_args(argv: list[str]) -> tuple[str | None, str, str | None, list[str]]:
    """(module, tables, json path, target argv). This tool's own options come first; everything from
    the module name / script path onwards belongs to the target and is passed through untouched."""
    module, tables, json_path = None, WATCH_DEFAULT, None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("-h", "--help"):
            print(__doc__)
            raise SystemExit(0)
        if a == "--tables" and i + 1 < len(argv):
            tables = argv[i + 1]; i += 2
        elif a == "--json" and i + 1 < len(argv):
            json_path = argv[i + 1]; i += 2
        elif a == "-m" and i + 1 < len(argv):
            module = argv[i + 1]; i += 2
            break
        else:
            break
    return module, tables, json_path, argv[i:]


def main() -> int:
    module, tables, json_path, target = parse_args(sys.argv[1:])
    watch.update(t.strip() for t in tables.split(",") if t.strip())
    if not module and not target:
        print("usage: scan_audit.py [--tables T] [--json FILE] (-m MODULE | SCRIPT) [args...]", file=sys.stderr)
        return 64
    args = argparse.Namespace(module=module, target=target, json=json_path)
    sqlite3.connect = patched_connect
    atexit.register(report, args.json)
    sys.path.insert(0, os.getcwd())
    t0 = time.time()
    try:
        if args.module:
            sys.argv = [args.module] + args.target
            runpy.run_module(args.module, run_name="__main__", alter_sys=True)
        else:
            sys.argv = args.target
            # like `python script.py`: the script's own directory is importable (bills_fetch imports bills_common)
            sys.path.insert(0, os.path.dirname(os.path.abspath(args.target[0])))
            runpy.run_path(args.target[0], run_name="__main__")
        rc = 0
    except SystemExit as e:
        rc = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
    print(f"\n(target ran for {time.time() - t0:.0f}s)", file=sys.stderr)
    return rc


if __name__ == "__main__":
    sys.exit(main())
