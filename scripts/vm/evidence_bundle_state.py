#!/usr/bin/env python3
"""Validate a frozen evidence bundle; activate it only after publication."""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tempfile


INPUTS = ("source", "evidence", "places", "decisions", "additional")
MANAGED_BY = "opax-evidence-bundle-v1"
FILENAMES = {"source": "parli.db", "evidence": "evidence-layers-full.sqlite",
             "places": "evidence-places.sqlite", "decisions": "evidence-identity-decisions.sqlite",
             "additional": "evidence-additional-mentions.sqlite"}
BUNDLE_NAME = re.compile(r"\d{8}T\d{6}Z-[0-9a-f]{12}\.incoming")
TOP_FILES = set(FILENAMES.values()) | {"READY.json", "receipt.json"} | {
    name + ".log" for name in ("primary", "places", "decisions", "additional", "export", "audit")}
EXPORT_FILE = re.compile(r"(?:[0-9a-f]{2}\.json|lookup/[0-9a-f]{2}\.json|index\.json|stats\.json|identity-links\.json)")


def checkpoint(source: Path) -> None:
    """Explicit caller preparation after source writers stop; never delete WALs."""
    if not source.is_file() or source.is_symlink():
        raise ValueError("checkpoint source must be an existing regular SQLite database")
    with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=rw", uri=True, timeout=5)) as db:
        db.execute("PRAGMA busy_timeout=5000")
        result = db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if not result or result[0] != 0:
            raise ValueError("source WAL checkpoint busy; evidence build deferred")
        wal = Path(str(source.resolve()) + "-wal")
        if wal.exists() and wal.stat().st_size:
            raise ValueError("source WAL remains nonempty; evidence build deferred")


def checked_report(path: Path, root: Path) -> dict:
    return validate_report(json.loads(path.read_text()), root)


def validate_report(report: dict, root: Path) -> dict:
    if not isinstance(report, dict) or report.get("verified") is not True:
        raise ValueError("builder did not return a verified bundle")
    root = root.resolve(strict=True)
    raw_bundle = Path(report["bundle_dir"])
    bundle = raw_bundle.resolve(strict=True)
    if (not raw_bundle.is_absolute() or bundle.parent != root
            or not bundle.is_dir() or raw_bundle.is_symlink()):
        raise ValueError("bundle must be a regular versioned directory under the bundle root")
    result = {"schema": 1, "verified": True, "bundle_dir": str(bundle)}
    for key in (*INPUTS, "receipt"):
        raw = Path(report[key])
        resolved = raw.resolve(strict=True)
        if (not raw.is_absolute() or not resolved.is_relative_to(bundle)
                or not resolved.is_file() or raw.is_symlink() or "\n" in str(raw) or "\r" in str(raw)):
            raise ValueError(f"bundle {key} must be a regular file inside its versioned directory")
        parent = raw.parent
        while parent != raw_bundle and parent != parent.parent:
            if parent.is_symlink():
                raise ValueError("symlink inside evidence bundle")
            parent = parent.parent
        result[key] = str(resolved)
    if len({result[key] for key in INPUTS}) != len(INPUTS):
        raise ValueError("bundle inputs must be distinct files")
    result["receipt_sha256"] = hashlib.sha256(Path(result["receipt"]).read_bytes()).hexdigest()
    ready_path = bundle / "READY.json"
    if ready_path.is_symlink():
        raise ValueError("bundle readiness marker is a symlink")
    ready = json.loads(ready_path.read_text())
    receipt = json.loads(Path(result["receipt"]).read_text())
    for marker in (ready, receipt):
        if (not isinstance(marker, dict) or marker.get("schema") != 1 or marker.get("managed_by") != MANAGED_BY
                or marker.get("verified") is not True):
            raise ValueError("missing verified managed bundle ownership")
    if ready.get("receipt_sha256") != result["receipt_sha256"]:
        raise ValueError("bundle receipt changed after readiness")
    for marker in (ready, receipt):
        original = marker["report"]
        if any(Path(original[key]).resolve(strict=True) != Path(result[key])
               for key in (*INPUTS, "receipt", "bundle_dir")):
            raise ValueError("bundle report disagrees with verified receipt")
    return result


def managed_inventory(bundle: Path, root: Path) -> dict:
    if not BUNDLE_NAME.fullmatch(bundle.name) or bundle.is_symlink():
        raise ValueError("not an automatically generated managed bundle")
    marker = json.loads((bundle / "READY.json").read_text())
    report = validate_report(marker["report"], root)
    if Path(report["bundle_dir"]) != bundle.resolve():
        raise ValueError("ownership marker names another directory")
    for item in bundle.rglob("*"):
        if item.is_symlink():
            raise ValueError("symlink in managed bundle")
        name = item.relative_to(bundle).as_posix()
        if item.is_dir():
            if name not in ("export", "export/lookup"):
                raise ValueError("unknown directory in managed bundle")
        elif not (name in TOP_FILES or name.startswith("export/") and EXPORT_FILE.fullmatch(name[7:])):
            raise ValueError("unknown file in managed bundle")
    if any(Path(report[key]).name != FILENAMES[key] for key in INPUTS):
        raise ValueError("unexpected managed database filename")
    return report


def prune(root: Path, active: dict | None, previous: dict | None, *, keep_previous: bool = True) -> list[str]:
    """Remove only verified, exactly inventoried generated bundles; never foreign data."""
    root = root.resolve(strict=True)
    candidates = {}
    for path in root.iterdir():
        try:
            if path.is_dir() and not path.is_symlink():
                report = managed_inventory(path, root)
                candidates[Path(report["bundle_dir"])] = report
        except (OSError, ValueError, KeyError, TypeError):
            continue
    current = Path(active["bundle_dir"]).resolve() if active else None
    keep = {current} if current else set()
    prior = Path(previous["bundle_dir"]).resolve() if previous and previous.get("bundle_dir") else None
    if keep_previous and prior in candidates and prior != current:
        keep.add(prior)
    elif keep_previous or current is None:
        older = sorted((path for path in candidates if path != current), key=lambda path: path.name, reverse=True)
        keep.update(older[:1])
    removed = []
    for path in candidates.keys() - keep:
        # Recheck immediately before removal. The nightly lock owns these inputs.
        managed_inventory(path, root)
        history = root.parent / "evidence-bundle-history"
        if history.is_symlink() or history.exists() and not history.is_dir():
            raise ValueError("evidence history must be a regular directory")
        history.mkdir(exist_ok=True)
        for name in ("READY.json", "receipt.json"):
            archive = history / (path.name + "." + name)
            raw = (path / name).read_bytes()
            if archive.exists():
                if archive.is_symlink() or archive.read_bytes() != raw:
                    raise ValueError("existing evidence receipt archive differs; bundle retained")
            else:
                with archive.open("xb") as stream:
                    stream.write(raw)
        shutil.rmtree(path)
        removed.append(path.name)
    return sorted(removed)


def prepare(root: Path, pointer: Path) -> list[str]:
    """Before allocating: keep the active bundle, or one newest verified set."""
    if not root.exists():
        return []
    active = None
    if pointer.exists():
        try:
            active = checked_report(pointer, root)
        except (OSError, ValueError, KeyError, TypeError):
            # An unknown/broken pointer is never permission to guess what to delete.
            return []
    return prune(root, active, None, keep_previous=False)


def activate(candidate: Path, root: Path, pointer: Path, commit: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40,64}", commit):
        raise ValueError("activation needs the confirmed publication commit")
    report = checked_report(candidate, root)
    try:
        previous = checked_report(pointer, root)
    except (OSError, ValueError, KeyError, TypeError):
        previous = None
    report.update(published_commit=commit, activated_at=datetime.now(timezone.utc).isoformat())
    pointer.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=pointer.name + ".tmp.", dir=pointer.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(report, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, pointer)
        directory = os.open(pointer.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)
    try:
        return {"removed": prune(root, report, previous), "warning": None}
    except (OSError, ValueError, KeyError, TypeError) as exc:
        # Publication and activation already succeeded. Cleanup failure must not
        # masquerade as an activation rollback or delete unrelated data.
        return {"removed": [], "warning": str(exc)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("arguments", "activate", "checkpoint", "prepare"))
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--bundle-root", type=Path)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--pointer", type=Path)
    parser.add_argument("--commit", default="")
    args = parser.parse_args()
    try:
        if args.action == "checkpoint":
            if args.source is None:
                raise ValueError("checkpoint needs the live source path")
            checkpoint(args.source)
            return 0
        if args.action == "prepare":
            if args.bundle_root is None or args.pointer is None:
                raise ValueError("bundle preparation needs a root and active pointer")
            removed = prepare(args.bundle_root, args.pointer)
            print(f"evidence bundle preparation: {len(removed)} older verified bundles removed; active retained")
            return 0
        if args.candidate is None or args.bundle_root is None:
            raise ValueError("bundle selection needs a candidate and bundle root")
        if args.action == "arguments":
            report = checked_report(args.candidate, args.bundle_root)
            print("\n".join(report[key] for key in INPUTS))
        else:
            if args.pointer is None:
                raise ValueError("activation needs an active pointer path")
            result = activate(args.candidate, args.bundle_root, args.pointer, args.commit)
            if result["warning"]:
                print(f"WARNING evidence bundle retention: {result['warning']}; published bundle is active")
            else:
                print(f"evidence bundle retention: {len(result['removed'])} older verified bundles removed; active and one previous retained")
        return 0
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as exc:
        print(f"REFUSED evidence bundle: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
