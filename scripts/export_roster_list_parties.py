#!/usr/bin/env python3
"""Dated official-list parties for profiles that record none (portal audit F07).

Reads only reviewed, committed evidence: the official chamber lists in
scripts/roster_state_evidence.json (each with its own as_of date) and the
dated service records in scripts/roster_service.json (service and history
entries with ISO start and end dates; the end date is the observation). Writes
portal/public/data/roster-list-parties.json, which public/roster-party.js
(rosterListParty) reads for the Worker's person answers and the person page:
a full-name profile with no party of its own, matched by exact full name in
its own chamber, shows the latest dated party as "Labor (parliamentary roster
as at 25 Sep 2026)". Single-name prints are never matched.

The output is a pure function of the two committed files, so it changes only
with a reviewed evidence commit; tests/test_vote_parties.py fails when the
committed copy is stale. Regenerate with:

    python3 scripts/export_roster_list_parties.py [--check]
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "portal/public/data/roster-list-parties.json"
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def observations(root: Path = ROOT) -> list[dict]:
    from parli.ingest.speech_hygiene import clean_party
    state = json.loads((root / "scripts/roster_state_evidence.json").read_text(encoding="utf-8"))
    service = json.loads((root / "scripts/roster_service.json").read_text(encoding="utf-8"))
    out = []

    def add(name, aliases, jurisdiction, chamber, electorate, party, as_of, url, basis, prints=()):
        if not party or not as_of or not ISO.match(as_of) or not name or " " not in name.strip():
            return
        row = {"name": name, "aliases": sorted(set(a for a in aliases if a and a != name)),
               "jurisdiction": jurisdiction, "chamber": chamber, "electorate": electorate,
               "party": clean_party(party) or party.strip(), "as_of": as_of,
               "source_url": url, "basis": basis}
        # A reviewed Hansard print ("K.J. Maher") for the same member; only the party index's sitting
        # rule reads it (scripts/build_party_index.mjs officialListMembers), never a profile's party.
        if prints := sorted(set(p for p in prints if p and p != name)):
            row["prints"] = prints
        out.append(row)

    for snapshot in state.get("snapshots", []):
        for member in snapshot.get("members", []):
            add(member.get("name"), member.get("aliases", []), snapshot["jurisdiction"], snapshot["chamber"],
                member.get("electorate"), member.get("party"), member.get("as_of") or snapshot.get("as_of"),
                snapshot.get("source_url"), "official list", member.get("prints", []))
    for row in [*service.get("service", []), *service.get("history", [])]:
        if row.get("start") and ISO.match(str(row["start"])):
            add(row.get("name"), [], row["jurisdiction"], row["chamber"], row.get("electorate"),
                row.get("party"), row.get("end"), row.get("source_url"), "service record")
    return sorted(out, key=lambda o: (o["jurisdiction"], o["chamber"], o["name"], o["as_of"], o["party"]))


def document(root: Path = ROOT) -> dict:
    return {"meta": {
        "sources": ["scripts/roster_state_evidence.json", "scripts/roster_service.json"],
        "rule": "Full-name profiles with no party of their own, matched by exact full name in their own chamber; "
                "the latest dated observation decides, and disagreement at that date gives no party.",
    }, "observations": observations(root)}


def encode(doc) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="exit 1 when the committed file is stale")
    args = ap.parse_args(argv)
    text = encode(document())
    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.is_file() else ""
        if current != text:
            print(f"{OUT.relative_to(ROOT)} is stale; run scripts/export_roster_list_parties.py", file=sys.stderr)
            return 1
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {len(json.loads(text)['observations'])} observations to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
