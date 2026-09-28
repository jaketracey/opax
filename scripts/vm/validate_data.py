#!/usr/bin/env python3
"""Sanity-check the data files the nightly refresh is about to commit.

    python3 scripts/vm/validate_data.py bills votes corpus wrangler

Each named group is checked independently; exit status is the number of failing
groups (0 = all good) and each failure prints one line beginning "FAIL <group>".
The nightly script reverts a failing group to HEAD and carries on with the rest,
so a bad export never reaches the site but a good one is not held up by it.

  bills     index.json parses, count matches its array, every listed bill has a file
            whose key matches its name, no bill file is unparseable, and the index has
            not lost more than 2% of HEAD's bills
  votes     votes.json parses, is non-empty, and is not less than half HEAD's size
  corpus    corpus.json parses; its breakdown sums to expected_resources; the version is a date
  wrangler  portal/wrangler.jsonc carries exactly two CACHE_EPOCH values, both non-empty
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BILLS = ROOT / "portal" / "public" / "bills"


def head_bytes(rel: str) -> bytes | None:
    r = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=ROOT, capture_output=True)
    return r.stdout if r.returncode == 0 else None


def check_bills() -> list[str]:
    errs: list[str] = []
    try:
        index = json.loads((BILLS / "index.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"index.json unreadable: {e}"]
    rows = index.get("bills")
    if not isinstance(rows, list) or not rows:
        return ["index.json has no bills"]
    if index.get("count") != len(rows):
        errs.append(f"index count {index.get('count')} != {len(rows)} rows")
    old = head_bytes("portal/public/bills/index.json")
    if old:
        try:
            was = len(json.loads(old).get("bills", []))
            if was and len(rows) < was * 0.98:
                errs.append(f"index shrank from {was} to {len(rows)} bills")
        except ValueError:
            pass
    keys = [r.get("key") for r in rows]
    if len(set(keys)) != len(keys):
        errs.append("duplicate keys in index.json")
    for key in keys:
        if not (BILLS / f"{key}.json").exists():
            errs.append(f"index lists {key} but {key}.json is missing")
            if len(errs) > 10:
                break
    changed = subprocess.run(["git", "status", "--porcelain", "--", "portal/public/bills"], cwd=ROOT,
                             capture_output=True, text=True).stdout.splitlines()
    for line in changed:
        path = line[3:].strip().strip('"')
        if not path.endswith(".json") or path.endswith("/index.json") or line.startswith(" D") or line.startswith("D"):
            continue
        p = ROOT / path
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            errs.append(f"{p.name} unreadable: {e}")
            continue
        if doc.get("key") != p.stem:
            errs.append(f"{p.name} carries key {doc.get('key')!r}")
        if len(errs) > 10:
            break
    return errs


def check_votes() -> list[str]:
    p = ROOT / "portal" / "public" / "votes.json"
    try:
        raw = p.read_bytes()
        data = json.loads(raw)
    except (OSError, ValueError) as e:
        return [f"votes.json unreadable: {e}"]
    if not data:
        return ["votes.json is empty"]
    old = head_bytes("portal/public/votes.json")
    if old and len(raw) < len(old) * 0.5:
        return [f"votes.json is {len(raw):,} bytes, under half of HEAD's {len(old):,}"]
    return []


def check_corpus() -> list[str]:
    try:
        c = json.loads((ROOT / "portal" / "public" / "corpus.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"corpus.json unreadable: {e}"]
    errs = []
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", str(c.get("version", ""))):
        errs.append(f"version {c.get('version')!r} is not a date")
    if sum(c.get("expected_resources_breakdown", {}).values()) != c.get("expected_resources"):
        errs.append("expected_resources_breakdown does not sum to expected_resources")
    if c.get("collected_speeches") != c.get("refresh", {}).get("resource_counts", {}).get("speech"):
        errs.append("collected_speeches disagrees with resource_counts.speech")
    return errs


def check_wrangler() -> list[str]:
    text = (ROOT / "portal" / "wrangler.jsonc").read_text(encoding="utf-8")
    vals = re.findall(r'"CACHE_EPOCH"\s*:\s*"([^"]*)"', text)
    if len(vals) != 2 or not all(vals):
        return [f"expected two non-empty CACHE_EPOCH values, found {vals}"]
    return []


CHECKS = {"bills": check_bills, "votes": check_votes, "corpus": check_corpus, "wrangler": check_wrangler}


def main() -> int:
    groups = sys.argv[1:] or list(CHECKS)
    bad = 0
    for g in groups:
        if g not in CHECKS:
            print(f"unknown group {g!r}; choose from {', '.join(CHECKS)}", file=sys.stderr)
            return 64
        errs = CHECKS[g]()
        if errs:
            bad += 1
            for e in errs:
                print(f"FAIL {g}: {e}")
        else:
            print(f"ok   {g}")
    return bad


if __name__ == "__main__":
    sys.exit(main())
