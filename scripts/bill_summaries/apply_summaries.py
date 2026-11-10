#!/usr/bin/env python3
"""Patch reviewed summaries into the committed bill projection, and nothing else.

    python3 -I apply_summaries.py --export <dir from export_bills.py> --bills portal/public/bills --keys-file keys.txt

A full registry export from the desktop also carries registry changes the nightly
has not published (paused sources), and a speech-brief cache that differs from the
nightly's. A summary release should change only the summaries, so this copies, for
each listed bill, the export's `summary` and `sources` fields into the committed
file (all other fields and their order kept), and `has_summary` / `summary_version`
into that bill's index row. A bill whose committed copy already has a summary is
refused (never overwrite a published summary from here).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", required=True)
    ap.add_argument("--bills", required=True)
    ap.add_argument("--keys-file", required=True)
    args = ap.parse_args()
    exp, bills = Path(args.export), Path(args.bills)
    keys = [k for k in Path(args.keys_file).read_text().split() if k]
    index = json.loads((bills / "index.json").read_text())
    rows = {r["key"]: r for r in index["bills"]}
    done = []
    for k in keys:
        new = json.loads((exp / f"{k}.json").read_text())
        path = bills / f"{k}.json"
        old = json.loads(path.read_text())
        if old.get("summary"):
            raise SystemExit(f"{k}: committed copy already has a summary")
        if not new.get("summary") or len(new["summary"].get("sentences") or []) != 3:
            raise SystemExit(f"{k}: export has no complete summary")
        if k not in rows:
            raise SystemExit(f"{k}: not in index.json")
        out = {}
        for f, v in old.items():
            out[f] = new.get(f) if f in ("summary", "sources") else v
        for f in ("summary", "sources"):
            if f not in out:
                out[f] = new.get(f)
        path.write_text(dump(out), encoding="utf-8")
        rows[k]["has_summary"] = True
        rows[k]["summary_version"] = new["summary"].get("version")
        done.append(k)
    (bills / "index.json").write_text(dump(index), encoding="utf-8")
    print(json.dumps({"patched": len(done),
                      "has_summary": sum(1 for r in index["bills"] if r.get("has_summary"))}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
