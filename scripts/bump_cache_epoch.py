#!/usr/bin/env python3
"""Set CACHE_EPOCH in portal/wrangler.jsonc (top-level vars and env.staging vars).

    python3 scripts/bump_cache_epoch.py 2026-09-29-nightly
    python3 scripts/bump_cache_epoch.py --date 2026-09-29        # -> 2026-09-29-nightly

The Worker keys its answer cache on this string; changing it means answers built on
the previous corpus are never served again (see docs/STREAMING.md "Caching"). Edited
in place with a regex so the file's comments and layout are untouched. The file must
carry exactly two CACHE_EPOCH values (prod and staging); anything else is an error
and nothing is written.
"""
import argparse
import re
import sys
from pathlib import Path

PATTERN = re.compile(r'("CACHE_EPOCH"\s*:\s*")([^"]*)(")')
DEFAULT = Path(__file__).resolve().parents[1] / "portal" / "wrangler.jsonc"


def bump(text: str, value: str) -> tuple[str, list[str]]:
    old = [m[2] for m in PATTERN.finditer(text)]
    if len(old) != 2:
        raise SystemExit(f"expected exactly 2 CACHE_EPOCH values, found {len(old)}")
    return PATTERN.sub(lambda m: f"{m[1]}{value}{m[3]}", text), old


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
