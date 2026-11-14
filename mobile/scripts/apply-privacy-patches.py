#!/usr/bin/env python3
"""Replay reviewed, version/hash-pinned dependency patches without fuzz."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def sections(data):
    """Split a reviewed unified diff into one section per target file.

    Hunk line counts decide where a hunk ends, so a removed line that starts
    with "-- " is never mistaken for the next file's header. The path comes
    from "+++ b/", or from "--- a/" for a deletion to /dev/null.
    """
    parts, lead, current, old, new = {}, [], None, 0, 0
    # readlines() splits at LF only, so a bare CR stays inside its line. GNU
    # patch treats a bare CR as a line end; that is GNU behaviour, not ours
    # (or macOS patch's), so reviewed patches must not contain bare CRs.
    lines = io.BytesIO(data).readlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        index += 1
        if line.startswith(b"\\") and current is not None:
            current.append(line)  # "\ No newline at end of file", even mid-hunk.
        elif old > 0 or new > 0:
            # patch(1) reads a bare empty line in a hunk as empty context.
            kind = b" " if line in (b"\n", b"\r\n") else line[:1]
            if kind not in (b" ", b"-", b"+"):
                raise ValueError("Reviewed patch hunk is malformed")
            old -= kind != b"+"
            new -= kind != b"-"
            if old < 0 or new < 0:
                # More lines than the header counted: the hunk is mis-sized.
                raise ValueError("Reviewed patch hunk is malformed")
            current.append(line)
        elif line.startswith(b"@@ "):
            counts = re.match(rb"@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@", line)
            if not counts or current is None:
                raise ValueError("Reviewed patch hunk is malformed")
            old, new = (int(n) if n is not None else 1 for n in counts.groups())
            current.append(line)
        elif line.startswith(b"--- "):
            target = lines[index] if index < len(lines) else b""
            if not target.startswith(b"+++ "):
                raise ValueError("Reviewed patch header is malformed")
            index += 1
            names = [re.sub(rb"^[ab]/", b"", n[4:].split(b"\t")[0].strip()) for n in (line, target)]
            if b"/dev/null" not in names and names[0] != names[1]:
                # macOS patch(1) writes to the "---" name, so a mismatch could
                # patch a different file than the one we validated.
                raise ValueError("Reviewed patch ---/+++ file names differ")
            name = line[4:] if target[4:].startswith(b"/dev/null") else target[4:]
            path = name.split(b"\t")[0].strip().decode().split("/", 1)[-1]
            if path in parts:
                raise ValueError("Reviewed patch repeats a file: " + path)
            current = parts[path] = lead + [line, target]
            lead = []
        elif line.startswith(b"+++ "):
            raise ValueError("Reviewed patch header is malformed")
        else:
            lead.append(line)  # Preamble such as "diff --git" joins the next file.
    if old > 0 or new > 0:
        raise ValueError("Reviewed patch ends inside a hunk")
    return {path: b"".join(part) for path, part in parts.items()}


def apply(root, patches=None):
    patches = patches or Path(__file__).resolve().parent.parent / "patches"
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
        parts = sections(patch.read_bytes())
        prefix = "node_modules/" + entry["package"] + "/"
        if sorted(parts) != sorted(prefix + row["path"] for row in entry["files"]):
            raise ValueError("Privacy patch files differ from the manifest: " + entry["package"])
        # Each file must be exactly its pinned input or output. A tree from an
        # earlier release of the same patch upgrades by replaying only the
        # files still at their input; anything else is refused.
        todo = set()
        for row in entry["files"]:
            actual = digest(package / row["path"])
            if actual == row["after"]:
                continue
            if actual != row["before"]:
                raise ValueError("Unexpected or partially patched source: " + entry["package"])
            todo.add(prefix + row["path"])
        if todo:
            pending.append((package, entry, b"".join(part for path, part in parts.items() if path in todo)))
    # Validate ALL inputs, dry runs included, before modifying any package.
    # Hash validation also makes a successful patch at an unexpected offset
    # impossible.
    for dry in (True, False):
        for package, entry, diff in pending:
            args = ["/usr/bin/patch", "--batch", "--forward", "--fuzz=0", "-E", "-p1"]
            if dry:
                args.append("--dry-run")
            result = subprocess.run(args, cwd=root, input=diff, capture_output=True)
            output = (result.stdout + result.stderr).decode(errors="replace")
            if result.returncode or re.search(r"offset|fuzz", output, re.I):
                raise ValueError("Privacy patch refused: " + entry["package"])
    for package, entry, diff in pending:
        if any(digest(package / row["path"]) != row["after"] for row in entry["files"]):
            raise ValueError("Privacy patch output hash mismatch: " + entry["package"])
    print("PASS version-pinned native patches (expo-location 57.0.20, Reanimated 4.5.1, expo-file-system 57.0.7, react-native-screens 4.26.0, PostHog plugin 2.13.0, Expo Router 57.0.24)")


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
