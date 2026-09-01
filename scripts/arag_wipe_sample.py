#!/usr/bin/env python3
"""Delete the smoke-test sample resources (old mapping) before the bulk load."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parli.arag import AragConfig, AragError, KbClient, load_dotenv  # noqa: E402

load_dotenv()
kb = KbClient(AragConfig.from_env())
deleted = 0
while True:
    cat = kb.catalog(page_size=50)
    slugs = [r.get("slug") for r in (cat.get("resources") or {}).values() if r.get("slug")]
    if not slugs:
        break
    for slug in slugs:
        try:
            kb.delete_resource_by_slug(slug)
            deleted += 1
        except AragError as e:
            print(f"  {slug}: {e.status}", file=sys.stderr)
print(f"deleted {deleted} resources")
print("counters:", kb.counters())
