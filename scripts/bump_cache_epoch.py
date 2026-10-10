#!/usr/bin/env python3
"""Set CACHE_EPOCH and INDEXNOW_EPOCH_VERSION in production and staging vars.

    python3 scripts/bump_cache_epoch.py 2026-09-29-nightly
    python3 scripts/bump_cache_epoch.py --date 2026-09-29        # -> 2026-09-29-nightly

The Worker keys its answer cache on this string; changing it means answers built on
the previous corpus are never served again (see docs/STREAMING.md "Caching"). Edited
in place with a regex so the file's comments and layout are untouched. The file must
carry exactly two CACHE_EPOCH and INDEXNOW_EPOCH_VERSION values (prod and staging);
anything else is an error and nothing is written. A changed epoch gets one new
monotonic revision in both environments; an unchanged epoch keeps its revision.
"""
import argparse
import re
import sys
import time
from pathlib import Path

PATTERN = re.compile(r'("CACHE_EPOCH"\s*:\s*")([^"]*)(")')
VERSION_PATTERN = re.compile(r'("INDEXNOW_EPOCH_VERSION"\s*:\s*")([^"]*)(")')
DEFAULT = Path(__file__).resolve().parents[1] / "portal" / "wrangler.jsonc"


def bump(text: str, value: str, now_ms: int | None = None) -> tuple[str, list[str]]:
    old = [m[2] for m in PATTERN.finditer(text)]
    if len(old) != 2:
        raise SystemExit(f"expected exactly 2 CACHE_EPOCH values, found {len(old)}")
    versions = [m[2] for m in VERSION_PATTERN.finditer(text)]
    if len(versions) != 2 or any(not re.fullmatch(r"[1-9][0-9]*", v) for v in versions):
        raise SystemExit("expected exactly 2 positive INDEXNOW_EPOCH_VERSION values")
    if all(o == value for o in old):
        return text, old
    revision = max(max(map(int, versions)) + 1, now_ms if now_ms is not None else time.time_ns() // 1_000_000)
    if revision > 2**53 - 1:
        raise SystemExit("INDEXNOW_EPOCH_VERSION exceeds the safe integer range")
    changed = PATTERN.sub(lambda m: f"{m[1]}{value}{m[3]}", text)
    return VERSION_PATTERN.sub(lambda m: f"{m[1]}{revision}{m[3]}", changed), old


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("value", nargs="?", help="the new epoch string")
    ap.add_argument("--date", help="YYYY-MM-DD; sets <date>-nightly")
    ap.add_argument("--file", default=str(DEFAULT))
    args = ap.parse_args()
    value = args.value or (f"{args.date}-nightly" if args.date else None)
    if not value or not re.fullmatch(r"[A-Za-z0-9._-]+", value):
        ap.error("give a value like 2026-09-29-nightly (letters, digits, . _ -)")
    path = Path(args.file)
    new, old = bump(path.read_text(encoding="utf-8"), value)
    if all(o == value for o in old):
        print(f"CACHE_EPOCH already {value}")
        return 0
    path.write_text(new, encoding="utf-8")
    print(f"CACHE_EPOCH {old[0]} / {old[1]} -> {value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
