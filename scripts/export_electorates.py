#!/usr/bin/env python3
"""Validate/import/export electorate reference data without touching legacy tables.

python scripts/export_electorates.py --bundle bundle.json --out-dir portal/public/electorates
python scripts/export_electorates.py --bundle bundle.json --db reference.db --out-dir portal/public/electorates
"""
from __future__ import annotations
import argparse
import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.electorates import export_bundle, import_bundle, read_bundle


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bundle", type=Path)
    p.add_argument("--db", type=Path)
    p.add_argument("--out-dir", type=Path, default=Path("portal/public/electorates"))
    p.add_argument("--as-of", default=date.today().isoformat())
    args = p.parse_args()
    if not args.bundle and not args.db:
        p.error("--bundle or --db is required")
    bundle = json.loads(args.bundle.read_text()) if args.bundle else None
    if args.db:
        with sqlite3.connect(args.db) as db:
            if bundle:
                import_bundle(db, bundle, imported_at=args.as_of, source=str(args.bundle))
            bundle = read_bundle(db)
    manifest = export_bundle(bundle, args.out_dir, generated=args.as_of)
    print(f"Published {len(bundle['electorates'])} electorate references: {manifest['release_id']}")


if __name__ == "__main__":
    main()
