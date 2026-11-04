#!/usr/bin/env python3
"""Stage a round of Senate estimates PDFs saved by hand (origin local_pdf) for the nightly to apply.

    python -I scripts/stage_committee_pdf.py \\
        --input ~/opax-staging/committee-pdf/2026-10-supp-estimates \\
        --out data/staged/committee-pdf/2026-10-supp-estimates \\
        --note "saved in a browser by Jake, 4 Nov 2026" --acquired-on 2026-11-04

Run it with `python -I`: the PDFs are untrusted input, so neither the current directory nor PYTHONPATH may put code on
the import path (this script adds only the repository it lives in). It reads the PDFs, the browser's manifest.json and
schedule.json, and the local ParlInfo fragment cache for the senators' Handbook ids; it makes no network request.
What it writes, and how the nightly applies it, is parli.ingest.committee_pdf's docstring.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from parli.ingest import committee_pdf as cp  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--input", required=True, help="folder with the PDFs, manifest.json and schedule.json (read only)")
    ap.add_argument("--out", required=True, help="data/staged/committee-pdf/<round>")
    ap.add_argument("--note", required=True, help="acquisition note kept with every row's provenance")
    ap.add_argument("--acquired-on", required=True, help="YYYY-MM-DD the PDFs were saved")
    ap.add_argument("--cache-dir", default=os.environ.get("OPAX_ATTENDANCE_CACHE", "~/.cache/autoresearch/committee_attendance"),
                    help="ParlInfo fragment cache the senator label -> PHID table is read from")
    ap.add_argument("--roster", default=None, help="use this senators.json instead of building it from the cache")
    args = ap.parse_args(argv)
    if args.roster:
        roster = json.loads(Path(args.roster).read_text(encoding="utf-8"))
    else:
        roster = cp.build_senator_roster(args.cache_dir)
        print(f"senator roster: {len(roster['labels'])} labels from {roster['hearings_read']} cached hearings")
    m = cp.stage_round(args.input, args.out, roster, acquisition_note=args.note, acquired_on=args.acquired_on)
    for h in m["hearings"]:
        print(f"  {h['hearing_id']} {h['date']} {h['committee_name']}: {h['pdf']['pages']} pages, {h['turns']} turns, "
              f"{h['chars_kept']:,} chars kept of {h['chars_total']:,}; {h['speakers']}")
    for p in m["pending"]:
        print(f"  {p['hearing_id']} {p['date']} {p['committee_name']}: pending ({p['schedule_status']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
