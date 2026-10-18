#!/usr/bin/env python3
"""Merge a fresh roster export onto the shipped roster, so a re-export cannot undo main's curated records.

The shipped portal/public/parliamentarians.json carries fixes the refresh box's database does not: surname
prints folded into their person (scripts/roster_fold.py, docs/ROSTER-FOLDS.md), pinned and dated parties
(scripts/roster_service.json, scripts/roster_state_evidence.json), the reviewed QLD witness splits with their
pending counts (scripts/roster_witness_service.json), committee namesakes kept neutral, reviewed aliases. The
weekly export re-applies those overlays (scripts/vm/export_people.sh), but they key on the database's rows, and
the box's rows differ from the ones main was reviewed on (18 Oct 2026: an SA member lost his party, a former
senator's row vanished, 23 committee-only rows appeared, pending QLD counts came back as numbers). A clean
record may not drift from main at all (scripts/test_roster_main_preservation.py: "clean record changed" must
be zero, and a changed speech count is such a change), so the rule is per record and simple:

  - every row the shipped roster has is kept exactly as shipped, whatever the export says about it;
  - a row the export adds is held back (a new identity needs a reviewed commit: it changes sponsor links,
    person pages and their fixtures); it is listed so someone can review it;
  - a row the export drops is kept.

The shipped `meta` is kept too, so a night on which the export says nothing new installs nothing
(scripts/vm/keep_if_unchanged.py). A reviewed refresh bypasses this with OPAX_ROSTER_ACCEPT=1.

  python3 scripts/roster_overlay.py --directory export.json [--shipped portal/public/parliamentarians.json]

Rewrites --directory in place; prints one "ROSTER OVERLAY:" line on stderr (weekly_refresh.sh repeats it).
"""
import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHIPPED = Path(os.environ.get("OPAX_ROSTER_PREVIOUS") or ROOT / "portal" / "public" / "parliamentarians.json")


def overlay(shipped, fresh):
    """(merged roster document, report) for a fresh export `fresh` laid onto the `shipped` one."""
    kept = {p["name"]: p for p in shipped["people"]}
    now = {p["name"]: p for p in fresh["people"]}
    # a print the export folded into a person is not a new row, and its old row is not "dropped"
    folded = {stub for p in fresh["people"] for stub in p.get("prints") or []}
    fields = Counter()
    for name, p in kept.items():
        q = now.get(name)
        if q is not None:
            fields.update(k for k in p.keys() | q.keys() if p.get(k) != q.get(k))
    report = {
        "kept": len(kept),
        "differ": sum(1 for n, p in kept.items() if n in now and now[n] != p),
        "fields": dict(fields.most_common()),
        "held": sorted(n for n in now if n not in kept),
        "held_sitting": sorted(n for n, q in now.items() if n not in kept and q.get("current")),
        "dropped": sorted(n for n in kept if n not in now and n not in folded),
    }
    return {**fresh, "meta": shipped["meta"], "people": list(shipped["people"])}, report


def summary(report):
    fields = ", ".join(f"{k} {v}" for k, v in list(report["fields"].items())[:6])
    line = (f"kept {report['kept']} shipped records ({report['differ']} differ in the export"
            f"{': ' + fields if fields else ''}); held {len(report['held'])} new row(s)")
    if report["held"]:
        line += ": " + ", ".join(report["held"][:12]) + (" ..." if len(report["held"]) > 12 else "")
    if report["held_sitting"]:
        line += f"; {len(report['held_sitting'])} held row(s) are sitting members: " + ", ".join(report["held_sitting"][:12])
    if report["dropped"]:
        line += f"; kept {len(report['dropped'])} row(s) the export dropped: " + ", ".join(report["dropped"][:12])
    return line


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--directory", type=Path, required=True, help="the fresh export, rewritten in place")
    ap.add_argument("--shipped", type=Path, default=SHIPPED, help="the roster the site ships now")
    a = ap.parse_args(argv)
    fresh = json.loads(a.directory.read_text(encoding="utf-8"))
    shipped = json.loads(a.shipped.read_text(encoding="utf-8"))
    merged, report = overlay(shipped, fresh)
    a.directory.write_text(json.dumps(merged, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("ROSTER OVERLAY: " + summary(report), file=sys.stderr)


if __name__ == "__main__":
    main()
