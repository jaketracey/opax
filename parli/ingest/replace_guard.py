"""parli.ingest.replace_guard -- the empty-upstream guard shared by every delete-then-insert loader.

Stdlib only, so the roster / contract loaders that must run under a bare python3 can use it
without importing ext_common (which needs requests).

    replace_guard(existing, new, min_ratio) -> None | "reason it must be refused"

A loader that is about to DELETE `existing` rows and INSERT `new` rows calls it inside the
transaction, before the DELETE, and aborts (ExtGuardError) on a reason. The point is that a
source which answered 200 with an empty page, a scraper whose selectors broke, or a fetch
that lost half its files can never wipe a register that was fine yesterday.
"""

from __future__ import annotations

import os

# Fewer than this share of the rows a DELETE would remove counts as "far fewer".
DEFAULT_MIN_RATIO = 0.5


class ExtGuardError(RuntimeError):
    """A replace was refused because the fresh fetch was empty or far smaller than what it would delete."""


def env_allow_shrink() -> bool:
    """OPAX_ALLOW_SHRINK=1: the deliberate override for a re-baseline (also --allow-shrink on the loaders)."""
    return os.environ.get("OPAX_ALLOW_SHRINK", "").strip().lower() in ("1", "true", "yes")


def replace_guard(existing: int, new: int, min_ratio: float = DEFAULT_MIN_RATIO,
                  allow_shrink: bool = False) -> str | None:
    """Return the refusal reason for replacing `existing` rows with `new`, or None if it is fine.

    Nothing to lose (existing == 0) is always fine. An empty fresh set never replaces existing
    rows; a set below min_ratio x existing does not either. allow_shrink lifts both.
    """
    if allow_shrink or existing <= 0:
        return None
    if new <= 0:
        return f"upstream returned no rows but {existing:,} exist"
    if new < existing * min_ratio:
        return f"upstream returned {new:,} rows against {existing:,} stored (below {min_ratio:.0%})"
    return None
