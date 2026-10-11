"""Publish validated cache directories by rename, retaining the previous batch.

The refresh box is Linux: renameat2(RENAME_EXCHANGE) swaps even nonempty
directories atomically. No file in the live cache is written during acquisition.
"""
from contextlib import AbstractContextManager
import ctypes
import os
from pathlib import Path
import shutil
import tempfile


def exchange(left, right):
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(left), -100, os.fsencode(right), 2):
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(right))


class CacheBatch(AbstractContextManager):
    def __init__(self, *roots):
        paths = sorted({Path(p).expanduser().absolute() for p in roots if p}, key=lambda p: len(p.parts))
        self.roots = [p for p in paths if not any(parent in p.parents for parent in paths)]
        self.candidates = {}

    def __enter__(self):
        try:
            for root in self.roots:
                if root.is_symlink() or (root.exists() and not root.is_dir()):
                    raise ValueError(f'cache root must be a directory: {root}')
                root.parent.mkdir(parents=True, exist_ok=True)
                candidate = Path(tempfile.mkdtemp(prefix=f'.{root.name}-batch-', dir=root.parent))
                self.candidates[root] = candidate
                if root.exists():
                    # Replacements below always rename a new inode; hardlinks are never modified.
                    shutil.copytree(root, candidate, copy_function=os.link, symlinks=True, dirs_exist_ok=True)
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def write(self, path, body):
        path = Path(path).expanduser().absolute()
        root = next(r for r in self.roots if path.is_relative_to(r))
        target = self.candidates[root] / path.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(dir=target.parent, prefix='.incoming-')
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(body.encode('utf-8') if isinstance(body, str) else body)
            os.replace(name, target)
        finally:
            Path(name).unlink(missing_ok=True)

    def publish(self):
        completed = []
        try:
            for root, candidate in self.candidates.items():
                existed = root.exists()
                if existed:
                    exchange(candidate, root)
                else:
                    os.rename(candidate, root)
                completed.append((root, candidate, existed))
        except BaseException:
            for root, candidate, existed in reversed(completed):
                if existed:
                    exchange(candidate, root)
                else:
                    os.rename(root, candidate)
            raise

    def __exit__(self, *exc):
        for candidate in self.candidates.values():
            if candidate.exists():
                shutil.rmtree(candidate)
