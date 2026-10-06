#!/usr/bin/env python3
"""Replay reviewed, version/hash-pinned native privacy patches without fuzz."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def apply(root):
    patches = Path(__file__).resolve().parent.parent / "patches"
    pending = []
    for entry in json.loads((patches / "privacy-patches.json").read_text()):
        package = root / "node_modules" / entry["package"]
        if package.is_symlink():
            raise ValueError("Privacy patches refuse a shared package symlink")
        if json.loads((package / "package.json").read_text())["version"] != entry["version"]:
            raise ValueError("Privacy patch version changed: " + entry["package"])
        patch = patches / entry["patch"]
        if digest(patch) != entry["sha256"]:
            raise ValueError("Reviewed privacy patch hash changed")
        actual = [digest(package / row["path"]) for row in entry["files"]]
        if actual == [row["after"] for row in entry["files"]]:
            continue
        if actual != [row["before"] for row in entry["files"]]:
            raise ValueError("Unexpected or partially patched source: " + entry["package"])
        pending.append((package, entry, patch))
    # Validate ALL inputs before modifying any package. Hash validation also
    # makes a successful patch at an unexpected offset impossible.
    for package, entry, patch in pending:
        for dry in (True, False):
            args = ["/usr/bin/patch", "--batch", "--forward", "--fuzz=0", "-E", "-p1", "-i", str(patch)]
            if dry:
                args.append("--dry-run")
            result = subprocess.run(args, cwd=root, capture_output=True, text=True)
            if result.returncode or re.search(r"offset|fuzz", result.stdout + result.stderr, re.I):
                raise ValueError("Privacy patch refused: " + entry["package"])
        if any(digest(package / row["path"]) != row["after"] for row in entry["files"]):
            raise ValueError("Privacy patch output hash mismatch: " + entry["package"])
    print("PASS version-pinned privacy patches (expo-location 57.0.20, Reanimated 4.5.1)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    try:
        if (args.root / "node_modules").is_symlink():
            raise ValueError("Privacy patches refuse shared node_modules")
        apply(args.root.resolve())
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit(str(error))
