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

A review lets changes through per record and per field with the accept list (scripts/roster_accept.json, read
scripts/roster_accept.py): an accepted group of fields, or an accepted new row, is installed only while the export
still shows exactly the reviewed value; if the export moves again, the shipped value stays and the change is held.
Each group is checked first and held, with its reason in the ROSTER OVERLAY line, when it fails (bad evidence, a
corpus group touching identity, a curated record it would change, a shipped value curated since the review); an
unreadable or malformed list holds everything and keeps the shipped roster, and never stops the people step.
When nothing accepted is new tonight, the shipped `meta` and rows are kept byte for byte, so the night installs
nothing (scripts/vm/keep_if_unchanged.py); otherwise the rows are re-sorted and meta's totals recounted.
OPAX_ROSTER_ACCEPT=1 still skips the whole step (a raw export for a review, never for a nightly install).

  python3 scripts/roster_overlay.py --directory export.json [--shipped portal/public/parliamentarians.json]
                                    [--accept scripts/roster_accept.json]

Rewrites --directory in place; prints one "ROSTER OVERLAY:" line on stderr (weekly_refresh.sh repeats it).
"""
import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts import roster_accept  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SHIPPED = Path(os.environ.get("OPAX_ROSTER_PREVIOUS") or ROOT / "portal" / "public" / "parliamentarians.json")


def overlay(shipped, fresh, accept=None, accept_error=None, root=roster_accept.ROOT):
    """(merged roster document, report) for a fresh export `fresh` laid onto the `shipped` one, with the reviewed
    `accept` list (scripts/roster_accept.json) applied group by group where it is valid and the export still shows
    its values. `accept_error` (from roster_accept.read) says the list could not be used at all; curated evidence
    under `root` that cannot be used installs nothing either."""
    if accept is None or accept_error:
        accept = roster_accept.empty()
    people, accepted = roster_accept.apply(shipped["people"], fresh["people"], accept, root)
    if accept_error:
        accepted["blocked"] = f"scripts/roster_accept.json {accept_error}"
    if people == shipped["people"]:
        meta, people = shipped["meta"], list(shipped["people"])
    else:
        people = roster_accept.ordered(people)
        meta = roster_accept.recount(shipped["meta"], people)
        meta["generated"] = fresh["meta"].get("generated", meta.get("generated"))  # the export the counts are from
    kept = {p["name"]: p for p in people}
    now = {p["name"]: p for p in fresh["people"]}
    # a print the export folded into a person is not a new row, and its old row is not "dropped"
    folded = {stub for p in fresh["people"] for stub in p.get("prints") or []}
    fields = Counter()
    for name, p in kept.items():
        q = now.get(name)
        if q is not None:
            fields.update(k for k in p.keys() | q.keys() if p.get(k) != q.get(k))
    report = {
        "kept": len(shipped["people"]),
        "differ": sum(1 for n, p in kept.items() if n in now and now[n] != p),
        "fields": dict(fields.most_common()),
        "held": sorted(n for n in now if n not in kept),
        "held_sitting": sorted(n for n, q in now.items() if n not in kept and q.get("current")),
        "dropped": sorted(n for n in kept if n not in now and n not in folded),
        "accepted": accepted["applied"],
        "accept_held": accepted["held"],
        "accept_blocked": accepted["blocked"],
    }
    return {**fresh, "meta": meta, "people": people}, report


def summary(report):
    fields = ", ".join(f"{k} {v}" for k, v in list(report["fields"].items())[:6])
    line = f"installed {report['accepted']} reviewed change(s) from scripts/roster_accept.json; " if report.get("accepted") else ""
    held = report.get("accept_held") or []
    if report.get("accept_blocked"):
        line += f"no reviewed change installed, every one held ({report['accept_blocked']}); "
    if held:
        reasons = {}
        for name, why in held:
            reasons.setdefault(why, []).append(name)
        line += f"held {len(held)} reviewed change(s), kept as shipped: " + "; ".join(
            f"{why} ({len(names)}: {', '.join(names[:4])}{' ...' if len(names) > 4 else ''})"
            for why, names in sorted(reasons.items(), key=lambda kv: -len(kv[1]))) + "; "
    line += (f"kept {report['kept']} shipped records ({report['differ']} differ in the export"
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
    ap.add_argument("--accept", type=Path, default=roster_accept.ACCEPT, help="the reviewed accept list")
    a = ap.parse_args(argv)
    fresh = json.loads(a.directory.read_text(encoding="utf-8"))
    shipped = json.loads(a.shipped.read_text(encoding="utf-8"))
    accept, error = roster_accept.read(a.accept)
    merged, report = overlay(shipped, fresh, accept, error)
    a.directory.write_text(json.dumps(merged, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("ROSTER OVERLAY: " + summary(report), file=sys.stderr)


if __name__ == "__main__":
    main()
