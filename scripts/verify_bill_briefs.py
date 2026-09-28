#!/usr/bin/env python3
"""Fail if a bill speech lost its brief between a git revision and the working tree.

    python3 scripts/verify_bill_briefs.py                       # portal/public/bills vs HEAD
    python3 scripts/verify_bill_briefs.py --base origin/main

The bills exporter writes `brief: null` on every speech; `export_bills.py
--fill-briefs` puts the briefs back. Run this after the fill to prove nothing
was left blank. A speech that was dropped from its bill is not a loss (the
link was removed); a speech still in the bill with an empty brief is.

Exit 0: no brief lost. Exit 1: at least one lost (each is printed).
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def briefs(doc: dict) -> dict[str, str | None]:
    return {s["slug"]: s.get("brief") for s in doc.get("speeches", []) if s.get("slug")}


def lost_briefs(old: dict, new: dict) -> list[str]:
    was, now = briefs(old), briefs(new)
    return sorted(slug for slug, brief in was.items() if brief and slug in now and not now[slug])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dir", default="portal/public/bills")
    ap.add_argument("--base", default="HEAD")
    args = ap.parse_args()

    root = Path(git("rev-parse", "--show-toplevel").strip())
    directory = (Path(args.dir) if Path(args.dir).is_absolute() else Path.cwd() / args.dir).resolve()
    rel_dir = directory.relative_to(root).as_posix()
    changed = [p for p in git("diff", "--name-only", args.base, "--", rel_dir).split("\n")
               if p.endswith(".json") and not p.endswith("/index.json")]
    lost_total = 0
    gained = 0
    for rel in changed:
        path = root / rel
        if not path.exists():
            continue  # bill file removed
        try:
            old = json.loads(git("show", f"{args.base}:{rel}"))
        except subprocess.CalledProcessError:
            continue  # new file
        new = json.loads(path.read_text())
        for slug in lost_briefs(old, new):
            print(f"LOST brief: {rel} speech {slug}")
            lost_total += 1
        gained += sum(1 for slug, b in briefs(new).items() if b and not briefs(old).get(slug))
    print(f"checked {len(changed)} changed bill files vs {args.base}: {lost_total} briefs lost, {gained} gained")
    return 1 if lost_total else 0


if __name__ == "__main__":
    sys.exit(main())
