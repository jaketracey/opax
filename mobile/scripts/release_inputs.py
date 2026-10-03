"""Release input checks that also cover Expo's ignored local inputs."""
import subprocess
import re
from pathlib import Path

from release_support import ReleaseError


def clean_commit(root, expected=None):
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root).decode().strip()
    dirty = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all"], cwd=root)
    if dirty or (expected is not None and head != expected):
        raise ReleaseError("Release refused: clean HEAD must match the full approved commit.")
    return head


def refuse_dotenv(mobile):
    if any(p.is_file() or p.is_symlink() for p in Path(mobile).glob(".env*")):
        raise ReleaseError("Release refused: remove every .env* file Expo could load.")


def dependency_command(mobile):
    refuse_dotenv(mobile)
    if (Path(mobile) / "node_modules").is_symlink():
        raise ReleaseError("Release refused: npm ci must never run through a node_modules symlink.")
    clean_commit(Path(mobile).parent)
    # Include build tools even if the caller has NODE_ENV=production. Lifecycle
    # scripts are disabled; the locked platform binaries are installed directly.
    return ["nice", "-n", "10", "npm", "ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"]


def check_upload_build(build, next_build):
    if not all(re.fullmatch(r"[1-9][0-9]*", n) for n in (build, next_build)) or int(build) < int(next_build):
        raise ReleaseError("Upload refused: build must be at least the next App Store Connect number.")
