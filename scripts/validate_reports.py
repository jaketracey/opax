#!/usr/bin/env python3
"""Validate standing-report reading lists locally and against the live KB."""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parli.arag import AragConfig, KbClient  # noqa: E402

REPORT_DIR = ROOT / "portal" / "public" / "reports"
REQUIRED = ("brief", "date", "speaker", "slug")


def main() -> None:
    load_dotenv(ROOT / ".env")
    reports = []
    slugs = []
    for path in sorted(REPORT_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        report = json.loads(path.read_text())
        moments = report.get("key_moments") or []
        assert 6 <= len(moments) <= 8, f"{path.stem}: expected 6-8 key speeches"
        seen_speakers = set()
        for index, moment in enumerate(moments, 1):
            missing = [field for field in REQUIRED if not moment.get(field)]
            assert not missing, f"{path.stem} #{index}: missing {', '.join(missing)}"
            speaker = moment["speaker"].casefold()
            assert speaker not in seen_speakers, f"{path.stem}: repeated speaker {moment['speaker']}"
            seen_speakers.add(speaker)
            slugs.append(moment["slug"])
        reports.append((path.stem, len(moments)))

    kb = KbClient(AragConfig.from_env())

    def check_slug(slug: str) -> str:
        resource = kb.get_resource_by_slug(slug)
        assert resource, f"{slug}: KB returned no resource"
        assert resource.get("slug") == slug, f"{slug}: KB returned {resource.get('slug')!r}"
        return slug

    with ThreadPoolExecutor(max_workers=8) as pool:
        checked = list(pool.map(check_slug, slugs))

    summary = ", ".join(f"{name} {count}" for name, count in reports)
    print(f"Validated {len(reports)} reports and {len(checked)} live KB slugs ({summary}).")


if __name__ == "__main__":
    main()
