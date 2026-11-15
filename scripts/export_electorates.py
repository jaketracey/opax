#!/usr/bin/env python3
"""Validate/import/export electorate reference data without touching legacy tables.

python scripts/export_electorates.py --bundle bundle.json --out-dir portal/public/electorates
python scripts/export_electorates.py --bundle bundle.json --db reference.db --out-dir portal/public/electorates
python scripts/export_electorates.py --republish --out-dir portal/public/electorates

Every export reads the reviewed dissolution records (scripts/hubs/electorate-dissolutions.json) into
the bundle: parli.electorates.dissolved_for then writes dissolved_for on each row of a dissolved house.

--republish needs no bundle, database or network. It reads the bundle the published release carries
(its reference.json), applies today's dissolution records, and publishes a new release only when a
row's dissolved_for or the records themselves changed; otherwise it leaves every file alone. The
nightly runs it (scripts/vm/nightly.sh), so the field appears on the day a house is dissolved and
clears on the night the post-result roster reload is in the published bundle, with no hand export.
"""
from __future__ import annotations
import argparse
import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sys as _donor_sys
from pathlib import Path as _DonorPath
_donor_sys.path.insert(0, str(_DonorPath(__file__).resolve().parents[1]))
from parli.electorates import covered_by_dissolution, dissolved_for, export_bundle, import_bundle, read_bundle

DISSOLUTIONS = Path(__file__).resolve().parent / "hubs" / "electorate-dissolutions.json"
# The Ask gold cases quote the release they were computed from (scripts/agentic_ask_electorates_gold.mjs);
# a republish changes no value they read, only that id, so it is carried forward with the release.
GOLD = Path(__file__).resolve().parents[1] / "portal" / "test" / "fixtures" / "agentic-ask-gold.json"


def load_dissolutions(path: Path) -> list[dict]:
    """The reviewed records, each with its election day and source link read from its election file."""
    records = []
    for row in json.loads(path.read_text())["dissolutions"]:
        election = json.loads((path.parent / row["election"]).read_text())
        records.append({"jurisdiction": row["jurisdiction"], "chamber": row["chamber"],
                        "dissolved_on": row["dissolved_on"], "election_day": election["election_day"],
                        "source_url": election["sources"][row["source"]]})
    return sorted(records, key=lambda r: (r["jurisdiction"], r["chamber"], r["election_day"]))


def expected_dissolved_for(bundle: dict, on: str) -> dict[str, str | None]:
    """dissolved_for for every seat the bundle's dissolution records speak for, as an export on `on` writes it."""
    elections = {e["election_id"]: e for e in bundle.get("elections", [])}
    out = {}
    for e in bundle["electorates"]:
        if not covered_by_dissolution(e, bundle.get("dissolutions", [])):
            continue
        eid = e["electorate_id"]
        contests = [dict(c, election=elections[c["election_id"]]) for c in bundle.get("contests", []) if c["electorate_id"] == eid]
        rosters = sorted((r for r in bundle.get("rosters", []) if r["electorate_id"] == eid),
                         key=lambda r: (r["as_of"], r.get("priority", 0)), reverse=True)
        out[eid] = dissolved_for(e, bundle["dissolutions"], contests, rosters[0] if rosters else None, on)
    return out


def republish(out_dir: Path, dissolutions: list[dict], as_of: str, gold: Path | None = None) -> dict | None:
    """Publish a new release from the published bundle when the dissolution state changed; None when it did not."""
    manifest = json.loads((out_dir / "manifest.json").read_text())
    if not manifest.get("reference_url"):
        return None  # a release with no bundle to republish from
    release = out_dir / "releases" / manifest["release_id"]
    bundle = json.loads((release / "reference.json").read_text())
    published = {row["electorate_id"]: row["dissolved_for"]
                 for row in json.loads((release / "index.json").read_text())["electorates"] if "dissolved_for" in row}
    current = {**bundle, "dissolutions": dissolutions}
    if not dissolutions:
        current.pop("dissolutions")
    if bundle.get("dissolutions", []) == dissolutions and published == expected_dissolved_for(current, as_of):
        return None
    new = export_bundle(current, out_dir, generated=as_of)
    if gold and gold.is_file():
        text = gold.read_text()
        gold.write_text(text.replace(f'"release_id": "{manifest["release_id"]}"', f'"release_id": "{new["release_id"]}"'))
    return new


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--bundle", type=Path)
    p.add_argument("--db", type=Path)
    p.add_argument("--republish", action="store_true")
    p.add_argument("--dissolutions", type=Path, default=DISSOLUTIONS)
    p.add_argument("--out-dir", type=Path, default=Path("portal/public/electorates"))
    p.add_argument("--as-of", default=date.today().isoformat())
    args = p.parse_args()
    dissolutions = load_dissolutions(args.dissolutions) if args.dissolutions.is_file() else []
    if args.republish:
        if args.bundle or args.db:
            p.error("--republish reads the published release; it takes no --bundle or --db")
        manifest = republish(args.out_dir, dissolutions, args.as_of, GOLD)
        print(f"Republished electorate references: {manifest['release_id']}" if manifest
              else "Electorate references unchanged: no dissolution began or cleared")
        return
    if not args.bundle and not args.db:
        p.error("--bundle, --db or --republish is required")
    bundle = json.loads(args.bundle.read_text()) if args.bundle else None
    if bundle is not None and dissolutions:
        bundle["dissolutions"] = dissolutions
    if args.db:
        with sqlite3.connect(args.db) as db:
            if bundle:
                import_bundle(db, bundle, imported_at=args.as_of, source=str(args.bundle))
            bundle = read_bundle(db)
            if dissolutions:
                bundle["dissolutions"] = dissolutions
    manifest = export_bundle(bundle, args.out_dir, generated=args.as_of)
    print(f"Published {len(bundle['electorates'])} electorate references: {manifest['release_id']}")


if __name__ == "__main__":
    main()
