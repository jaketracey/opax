#!/usr/bin/env python3
"""Re-run the electorate release's person linking on a published release, without the database.

python3 scripts/relink_electorate_people.py --cache .cache/electorates \
  --out-dir portal/public/electorates --generated 2026-11-11

The full build (docs/ELECTORATE_REFERENCE.md) needs a members-table snapshot and about forty source
fetches, several of which (the Victorian directory, the APH roster) have moved on since the published
release. Person linking needs neither: the published reference.json is the builder's whole bundle,
and the only inputs of parli.ingest.electorates Builder.history() are that bundle's legacy people
and two OpenAustralia files. This script loads the bundle, undoes what history() wrote (service
terms, the people it minted, the aliases and source it added to members-table people, and candidacy
links), checks that OpenAustralia representatives.csv still has the digest the release recorded,
runs history() again with the current rules and exports a new immutable release. Everything else
in the bundle is carried over unchanged.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.electorates import TABLES, export_bundle, stable_id, validate  # noqa: E402
from parli.ingest import http as source_http  # noqa: E402
from parli.ingest.electorates import Builder, check_people  # noqa: E402

OA_REPRESENTATIVES_URL = "https://raw.githubusercontent.com/openaustralia/openaustralia-parser/master/data/representatives.csv"


def published_bundle(directory: Path) -> tuple[dict, dict]:
    manifest = json.loads((directory / "manifest.json").read_text())
    reference = directory / "releases" / manifest["release_id"] / "reference.json"
    return manifest, json.loads(reference.read_text())


def seed_recorded_source(cache: Path, source: dict) -> None:
    """Place the source body in the builder cache, refusing any body but the one the release recorded."""
    path = cache / source["source_id"]
    if not path.exists():
        response = source_http.get(source["url"], timeout=90, headers={"User-Agent": source_http.USER_AGENT})
        response.raise_for_status()
        cache.mkdir(parents=True, exist_ok=True)
        path.write_bytes(response.content)
    if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
        raise ValueError(f"{source['url']} no longer matches the digest the release recorded; run the full build")
    # The builder dates an observation by the cached file's time; keep the recorded one.
    fetched = datetime.fromisoformat(source["fetched_at"]).timestamp()
    os.utime(path, (fetched, fetched))


def undo_history(builder: Builder, oa_sid: str) -> None:
    from scripts.export_profile_links import SOURCE_URL as OA_PEOPLE_URL
    written = {oa_sid, stable_id("source", OA_PEOPLE_URL)}  # The two sources history() reads.
    rows = builder.rows
    rows["terms"] = {}
    for pid, person in list(rows["people"].items()):
        if person.get("jurisdiction") != "federal" or oa_sid not in person["sources"]:
            continue
        if person.get("legacy_person_id") is None:
            del rows["people"][pid]  # Minted by history() from a service-record name.
        else:
            # Members-table people start with no aliases (Builder.legacy); history() added them.
            person["aliases"] = []
            person["sources"] = [s for s in person["sources"] if s not in written]
    for contest in rows["contests"].values():
        for candidate in contest["candidates"]:
            candidate["person_id"] = None


def relink(bundle: dict, cache: Path, *, as_of: str, people_digest: str | None = None) -> dict:
    """The bundle with Builder.history() run again under the current rules; `people_digest` is for tests."""
    sources = {s["url"]: s for s in bundle["sources"]}
    oa = sources[OA_REPRESENTATIVES_URL]
    seed_recorded_source(cache, oa)
    builder = Builder(cache, as_of)  # history() reads no build date; the release's own is passed for clarity.
    builder.oa_people_digest = people_digest
    for name, (key, _refs) in TABLES.items():
        builder.rows[name] = {r[key]: copy.deepcopy(r) for r in bundle.get(name, [])}
    undo_history(builder, oa["source_id"])
    builder.history()
    out = builder.bundle()
    out["coverage"] = dict(out["coverage"], notes=bundle["coverage"]["notes"])
    validate(out)
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--release-dir", type=Path, default=Path("portal/public/electorates"), help="Directory holding the published manifest.json")
    p.add_argument("--cache", type=Path, default=Path(".cache/electorates"))
    p.add_argument("--out-dir", type=Path, required=True)
    p.add_argument("--generated", default=date.today().isoformat())
    args = p.parse_args()
    manifest, bundle = published_bundle(args.release_dir)
    out = relink(bundle, args.cache, as_of=manifest["generated"])
    if stable_id("source", OA_REPRESENTATIVES_URL) not in {s["source_id"] for s in out["sources"]}:
        raise ValueError("Service-record source missing after relink")
    print(check_people(out))
    new = export_bundle(out, args.out_dir, generated=args.generated)
    print(f"Relinked people of release {manifest['release_id']}: published {new['release_id']}")


if __name__ == "__main__":
    main()
