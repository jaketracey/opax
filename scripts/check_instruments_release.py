#!/usr/bin/env python3
"""Explicit promotion gate. Routine tests and builds allow a missing catalogue."""
from pathlib import Path
import argparse
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/vm"))
from validate_data import check_instruments


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=ROOT / "portal/public/instruments")
    args = parser.parse_args()
    if not (args.directory / "manifest.json").is_file():
        print("FRL RELEASE HELD: complete catalogue absent; acquire and export metadata before promotion", file=sys.stderr)
        return 1
    errors = check_instruments(args.directory, compare_head=False)
    if errors:
        print("FRL RELEASE HELD: " + "; ".join(errors), file=sys.stderr)
        return 1
    print("FRL RELEASE OK: complete catalogue reconciled and within budget")
    return 0


if __name__ == "__main__": sys.exit(main())
