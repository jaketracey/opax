#!/usr/bin/env python3
"""Offline evidence retention/budget guard and staged, read-only export."""
from __future__ import annotations

import argparse
from datetime import date
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = "portal/public/evidence"
# The reviewed September tree: do not grow the asset allocation automatically.
MAX_BYTES = 163_453_646
MIN_PERCENT = 98
CONTENT = re.compile(r"[0-9a-f]{2}\.json")
LOOKUP = re.compile(r"lookup/[0-9a-f]{2}\.json")
METADATA = {"index.json", "stats.json", "identity-links.json"}


def cadence(day: str, catch_up: bool = False) -> str:
    today = date.fromisoformat(day)
    return "catch-up" if catch_up else "weekly" if today.isoweekday() == 7 else "skip"


def read_head(repo: Path) -> dict[str, bytes]:
    result = subprocess.run(["git", "archive", "HEAD", "--", EVIDENCE], cwd=repo, capture_output=True)
    if result.returncode:
        raise ValueError("cannot read committed evidence from git")
    with tarfile.open(fileobj=io.BytesIO(result.stdout)) as archive:
        return {m.name.removeprefix(EVIDENCE + "/"): archive.extractfile(m).read()
                for m in archive if m.isfile()}


def read_tree(directory: Path) -> dict[str, bytes]:
    files = {}
    for path in directory.rglob("*"):
        if path.is_symlink():
            raise ValueError("evidence tree contains a symlink")
        if path.is_file():
            files[path.relative_to(directory).as_posix()] = path.read_bytes()
    return files


def projection(files: dict[str, bytes]) -> tuple[dict, set[str], dict[tuple[str, str], tuple[str, str | None]]]:
    if not METADATA <= files.keys() or any(
            name not in METADATA and not CONTENT.fullmatch(name) and not LOOKUP.fullmatch(name) for name in files):
        raise ValueError("missing metadata or unexpected evidence asset")
    index, stats = json.loads(files["index.json"]), json.loads(files["stats.json"])
    if index["meta"] != stats or stats.get("complete") is not True:
        raise ValueError("incomplete evidence or index/stats mismatch")
    for flag in ("programme_links_complete", "identity_review_complete", "additional_mentions_complete"):
        if stats.get(flag) is not True:
            raise ValueError("incomplete evidence coverage")
    directory = {row["id"]: row for row in index["entities"]}
    if not directory or len(directory) != len(index["entities"]):
        raise ValueError("empty or duplicate entity directory")
    entities, excerpts, total = set(), {}, 0
    for name, raw in files.items():
        if not CONTENT.fullmatch(name):
            continue
        entries = json.loads(raw)["entries"]
        if not entries:
            raise ValueError("empty content shard")
        for identity, entry in entries.items():
            if (not re.fullmatch(r"[0-9a-f]{24}", identity) or identity[:2] + ".json" != name
                    or identity in entities or entry["id"] != identity or identity not in directory):
                raise ValueError("content shard identity mismatch")
            entities.add(identity)
            records = entry["records"]
            if (type(records) is not int or records <= 0 or records < len(entry["excerpts"])
                    or records != directory[identity]["records"]
                    or records != sum(entry["years"].values()) or records != sum(entry["source_kinds"].values())):
                raise ValueError("entity record counts do not reconcile")
            total += records
            for excerpt in entry["excerpts"]:
                key = identity, excerpt["id"]
                mirror = excerpt.get("details", {}).get("excerpt")
                if (not isinstance(key[1], str) or not key[1] or key in excerpts
                        or not isinstance(excerpt["text"], str) or not excerpt["text"]
                        or (mirror is not None and mirror != excerpt["text"])):
                    raise ValueError("invalid evidence ID or display excerpt mirror")
                if any(target not in directory for target in excerpt.get("links", {}).values()):
                    raise ValueError("missing related entity")
                excerpts[key] = excerpt["text"], mirror
    if (entities != set(directory) or len(entities) != stats["entities_with_connections"]
            or type(stats["published_record_matches"]) is not int or total != stats["published_record_matches"]):
        raise ValueError("evidence directory/record totals do not reconcile")
    for name, raw in files.items():
        if LOOKUP.fullmatch(name):
            rows = json.loads(raw)
            # The exporter retains unpublished candidates alongside published
            # targets so ambiguous aliases never attach the wrong entity.
            if not isinstance(rows, dict) or not rows or any(
                    not isinstance(ids, list) or not ids
                    or any(not isinstance(identity, str) or not re.fullmatch(r"[0-9a-f]{24}", identity) for identity in ids)
                    or len(ids) != len(set(ids)) or not entities.intersection(ids) for ids in rows.values()):
                raise ValueError("invalid evidence lookup")
    links = json.loads(files["identity-links.json"])
    if not isinstance(links["links"], list) or not links["method"]:
        raise ValueError("invalid identity links")
    return stats, entities, excerpts


def compare(head: dict[str, bytes], current: dict[str, bytes]) -> str:
    old_stats, old_entities, old_excerpts = projection(head)
    stats, entities, excerpts = projection(current)
    for label, was, now in (
        ("content shards", sum(bool(CONTENT.fullmatch(n)) for n in head), sum(bool(CONTENT.fullmatch(n)) for n in current)),
        ("lookup shards", sum(bool(LOOKUP.fullmatch(n)) for n in head), sum(bool(LOOKUP.fullmatch(n)) for n in current)),
        ("record count", old_stats["published_record_matches"], stats["published_record_matches"]),
    ):
        if now * 100 < was * MIN_PERCENT:
            raise ValueError(f"{label} shrank beyond 2%: {was} -> {now}")
    missing_entities, missing_excerpts = old_entities - entities, old_excerpts.keys() - excerpts.keys()
    if missing_entities or missing_excerpts:
        raise ValueError(f"evidence IDs vanished: {len(missing_entities)} entities, {len(missing_excerpts)} excerpts")
    if any(old_excerpts[key][1] is not None and excerpts[key][1] is None for key in old_excerpts):
        raise ValueError("existing evidence excerpt mirror vanished")
    budget = min(MAX_BYTES, sum(map(len, head.values())))
    size = sum(map(len, current.values()))
    if size > budget:
        raise ValueError(f"asset budget exceeded: {size} bytes > {budget}")
    changed_shards = sum(current.get(n) != head.get(n) for n in head.keys() | current.keys()
                         if CONTENT.fullmatch(n) or LOOKUP.fullmatch(n))
    changed_records = {key[1] for key in old_excerpts if old_excerpts[key][0] != excerpts[key][0]}
    # Display fields on retained evidence rows: text and its optional excerpt mirror.
    # Window rebuilding, join repairs, entities and whitespace all count as cleaning.
    cleaned = sum(a != b for key in old_excerpts for a, b in zip(old_excerpts[key], excerpts[key]))
    return (f"evidence: {changed_shards} changed shards, {len(changed_records)} records with text changed, "
            f"{cleaned} cleaned fields")


def check(directory: Path | None = None, repo: Path = ROOT) -> str:
    return compare(read_head(repo), read_tree(directory or repo / EVIDENCE))


def refresh(args: argparse.Namespace) -> None:
    # Only the exporter and audit open these files, both with SQLite mode=ro.
    # There is no acquisition, sidecar rebuild, environment loading or KB client.
    if not all(path.is_file() for path in (args.source, args.evidence, args.places, args.decisions, args.additional)):
        raise ValueError("matching source/evidence sidecars missing; provision a reviewed complete set")
    for script, argv in (
        ("export_evidence_layers.py", ["--source", args.source, "--evidence", args.evidence,
         "--places", args.places, "--decisions", args.decisions, "--additional", args.additional, "--output", args.stage]),
        ("audit_evidence_export.py", ["--source", args.source, "--export", args.stage]),
    ):
        if subprocess.run([sys.executable, str(ROOT / "scripts" / script), *map(str, argv)], cwd=ROOT).returncode:
            raise ValueError("evidence export failed" if script.startswith("export_") else "evidence source audit failed")
    from scripts.vm.keep_if_unchanged import _canonical, _compile, _strip, DEFAULT_IGNORE, sweep
    head, staged = read_head(ROOT), read_tree(args.stage)
    # Apply the same keep-if-unchanged semantics in staging, before the byte budget.
    # A stamp-only export must pass even when its new timestamp is longer.
    patterns = _compile(DEFAULT_IGNORE)
    for name in head.keys() & staged.keys():
        if _canonical(_strip(json.loads(head[name]), patterns)) == _canonical(_strip(json.loads(staged[name]), patterns)):
            (args.stage / name).write_bytes(head[name])
            staged[name] = head[name]
    print(compare(head, staged), flush=True)
    destination = ROOT / EVIDENCE
    shutil.rmtree(destination)
    shutil.copytree(args.stage, destination)
    result = sweep([EVIDENCE], repo=ROOT)
    if result["unreadable"]:
        raise ValueError("keep-if-unchanged found unreadable evidence")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date")
    parser.add_argument("--catch-up", action="store_true")
    parser.add_argument("--refresh", action="store_true")
    for name in ("source", "evidence", "places", "decisions", "additional", "stage"):
        parser.add_argument("--" + name, type=Path)
    args = parser.parse_args()
    try:
        if args.date:
            print(cadence(args.date, args.catch_up))
        elif args.refresh:
            if any(getattr(args, name) is None for name in ("source", "evidence", "places", "decisions", "additional", "stage")):
                raise ValueError("missing evidence input or staging path")
            sys.path.insert(0, str(ROOT))
            refresh(args)
        else:
            print(check())
        return 0
    except (ValueError, KeyError, TypeError, OSError, tarfile.TarError) as exc:
        print(f"REFUSED evidence: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
