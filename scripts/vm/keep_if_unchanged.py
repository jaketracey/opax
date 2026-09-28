#!/usr/bin/env python3
"""Keep the committed copy of a data file when a re-export changed nothing but its timestamps.

    python3 scripts/vm/keep_if_unchanged.py <committed-path> <new-file> [--ignore-key REGEX ...] [--repo ROOT]

Exporters stamp every file with a generation time, so a nightly run that found no new data
still rewrites the file and shows a diff. This decides whether the new file says anything
the committed one does not:

  changed    the new file is installed at <committed-path> (written to a temp file in the same
             directory, then os.replace'd; parent directories are created). Also the answer when
             <committed-path> is not tracked in HEAD.
  unchanged  the committed file is kept byte-identical: nothing is written, unless the working
             tree copy has drifted from HEAD (an exporter that wrote in place), in which case
             HEAD's bytes are put back.

<committed-path> is looked up as HEAD:<path> relative to the repo root (an absolute path is made
relative to the repo; a relative one is taken as already repo-relative). <new-file> may be the
same file as <committed-path>. It is left where it is otherwise.

A path ending .json is compared as JSON: both documents are parsed, every object key matching
DEFAULT_IGNORE (generated*, and *_at except as_at, at any depth) is dropped, and what is left must be
identical. "Identical" is strict: key order, list order and the type of each value all count
(1 is not 1.0 and true is not 1), so an ambiguous diff is treated as a change and installed.
--ignore-key adds more patterns (re.search against each key, so anchor them yourself). Any
other file is compared byte for byte.

Prints `unchanged <path>` or `changed <path>` and exits 0 either way. Exits 2 without touching
<committed-path> when <new-file> is missing, empty, or (for a .json path) not valid JSON. Exits 3
when the repo cannot be read or the path is outside it.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable, Union

ROOT = Path(__file__).resolve().parents[2]

# Keys that only record when an export ran. A key is dropped when any pattern .search()es it.
# `as_at` is data (the "as at" date printed on a register: interests/*.json carries it) and `updated` is
# data too (parliamentarians.json meta.representation.updated), so neither is a stamp: if only they moved,
# the file changed and is installed.
DEFAULT_IGNORE = r"^(generated.*|(?!as_at$).*_at)$"

Patterns = Union[str, "re.Pattern[str]", Iterable[Union[str, "re.Pattern[str]"]]]


class NewFileError(ValueError):
    """The freshly exported file is missing, empty, or not valid JSON when it should be."""


class RepoError(RuntimeError):
    """The repo could not be read, or the committed path is not inside it."""


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k not in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE")}
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, env=env)


def _compile(ignore_re: Patterns) -> list["re.Pattern[str]"]:
    items = [ignore_re] if isinstance(ignore_re, (str, re.Pattern)) else list(ignore_re)
    return [p if isinstance(p, re.Pattern) else re.compile(p) for p in items]


def _relative(repo: Path, committed_path: Union[str, Path]) -> str:
    """The repo-relative posix path that names <committed_path> in HEAD."""
    p = Path(committed_path)
    if p.is_absolute():
        # Resolve the directory, not the file, so /var vs /private/var does not matter but a
        # symlinked data file is still addressed by its own name.
        real = Path(os.path.realpath(p.parent)) / p.name
        try:
            rel = real.relative_to(os.path.realpath(repo))
        except ValueError:
            raise RepoError(f"{committed_path} is not inside {repo}") from None
    else:
        rel = Path(os.path.normpath(p))
    if not rel.parts or rel.parts[0] == "..":
        raise RepoError(f"{committed_path} is not inside {repo}")
    return rel.as_posix()


def _head_bytes(repo: Path, rel: str) -> bytes | None:
    """The blob at HEAD:<rel>, or None when it is not tracked there (or HEAD does not exist yet)."""
    if _git(repo, "rev-parse", "--git-dir").returncode != 0:
        raise RepoError(f"{repo} is not a git repository")
    r = _git(repo, "cat-file", "blob", f"HEAD:{rel}")
    return r.stdout if r.returncode == 0 else None


def _strip(obj: Any, patterns: list["re.Pattern[str]"]) -> Any:
    """obj without any object key that matches a pattern, at every depth."""
    if isinstance(obj, dict):
        return {k: _strip(v, patterns) for k, v in obj.items() if not any(p.search(k) for p in patterns)}
    if isinstance(obj, list):
        return [_strip(v, patterns) for v in obj]
    return obj


def _canonical(doc: Any) -> str:
    # Not sort_keys: key order can be meaningful to the page (dicts ranked by total), and dumps()
    # keeps 1, 1.0 and true apart where == would not.
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":"))


def _atomic_write(dest: Path, data: bytes) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dest.parent, prefix=f".{dest.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        if dest.exists():
            shutil.copymode(dest, tmp)
        else:
            os.chmod(tmp, 0o644)  # mkstemp makes it 0600
        os.replace(tmp, dest)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _read_new(new_path: Union[str, Path], is_json: bool) -> tuple[bytes, Any]:
    """The new file's bytes and (for JSON) its parsed document; NewFileError if it is unusable."""
    p = Path(new_path)
    if not p.is_file():
        raise NewFileError(f"{new_path} is missing" if not p.exists() else f"{new_path} is not a file")
    raw = p.read_bytes()
    if not raw:
        raise NewFileError(f"{new_path} is empty")
    if not is_json:
        return raw, None
    try:
        return raw, json.loads(raw)
    except (ValueError, RecursionError) as e:
        raise NewFileError(f"{new_path} is not valid JSON: {e}") from None


def keep_if_unchanged(
    committed_path: Union[str, Path],
    new_path: Union[str, Path],
    repo: Union[str, Path, None] = None,
    ignore_re: Patterns = DEFAULT_IGNORE,
) -> bool:
    """Install new_path over committed_path unless it only differs by timestamp keys.

    Returns True when the committed file was kept (unchanged), False when the new file was
    installed. Raises NewFileError (nothing touched) for a missing, empty or unparseable new
    file and RepoError when the repo or path cannot be resolved.
    """
    repo_root = Path(os.path.realpath(repo)) if repo else ROOT
    rel = _relative(repo_root, committed_path)
    dest = repo_root / rel
    is_json = rel.lower().endswith(".json")
    patterns = _compile(ignore_re)

    new_raw, new_doc = _read_new(new_path, is_json)
    head = _head_bytes(repo_root, rel)
    same_file = dest.exists() and os.path.exists(new_path) and os.path.samefile(dest, new_path)

    def install() -> None:
        if not same_file:  # exporter wrote in place: the new bytes are already there
            _atomic_write(dest, new_raw)

    if head is None:
        install()
        return False

    if is_json:
        try:
            head_doc = json.loads(head)
        except (ValueError, RecursionError):
            install()  # HEAD's copy is itself broken: nothing to preserve
            return False
        unchanged = _canonical(_strip(head_doc, patterns)) == _canonical(_strip(new_doc, patterns))
    else:
        unchanged = head == new_raw

    if not unchanged:
        install()
        return False
    # Keep HEAD's bytes. Only touch the working tree when it has drifted from them.
    if not dest.exists() or dest.read_bytes() != head:
        _atomic_write(dest, head)
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Keep the committed file when the new export differs only by timestamp keys.",
        epilog="Exit 0: unchanged or changed. Exit 2: new file missing/empty/invalid JSON (committed file untouched). "
               "Exit 3: repo unreadable or path outside it.")
    ap.add_argument("committed", metavar="committed-path",
                    help="tracked path (repo-relative, or absolute inside the repo)")
    ap.add_argument("new", metavar="new-file", help="the freshly exported file")
    ap.add_argument("--ignore-key", action="append", default=[], metavar="REGEX",
                    help="also ignore object keys matching REGEX (re.search); repeatable")
    ap.add_argument("--repo", default=str(ROOT), help="repo root (default: the repo this script lives in)")
    args = ap.parse_args(argv)
    try:
        ignore = _compile([DEFAULT_IGNORE, *args.ignore_key])
    except re.error as e:
        ap.error(f"bad --ignore-key pattern: {e}")
    try:
        kept = keep_if_unchanged(args.committed, args.new, repo=args.repo, ignore_re=ignore)
    except NewFileError as e:
        print(f"error: {e}; {args.committed} left untouched", file=sys.stderr)
        return 2
    except (RepoError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 3
    print(f"{'unchanged' if kept else 'changed'} {args.committed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
