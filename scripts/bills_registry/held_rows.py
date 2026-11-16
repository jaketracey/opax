"""Rows the held-sources overlay (scripts/bills_held_sources.py) adds while
ParlInfo is paused, and the one rule for when an export's own record replaces
them. The overlay retires by this rule and bills_guard allows exactly these
removals, so neither can drop a row the export does not hold.
"""
from __future__ import annotations

from datetime import date

OVERLAY_SOURCES = ("hansard", "frl")
# A row the export still lacks this many days after the row's date stays
# published and is listed for review (export_lacks_event_14d).
REVIEW_AFTER_DAYS = 14


def signature(row: dict) -> tuple:
    return (row.get("stage"), row.get("house"), row.get("date"))


def export_holds(rows: list[dict], row: dict) -> bool:
    """Whether the export's own rows (those without an overlay source) record
    the event an overlay row stands for: the same stage, house and date, or for
    an FRL Royal Assent any Royal Assent (the register's making date can be a
    day off ParlInfo's, and ParlInfo gives the row a house)."""
    theirs = [r for r in rows if r.get("source") not in OVERLAY_SOURCES]
    if row.get("source") == "frl" and row.get("stage") == "royal_assent":
        return any(r.get("stage") == "royal_assent" for r in theirs)
    return any(signature(r) == signature(row) for r in theirs)


def days_behind(row_date: str, export_day: str) -> int:
    """How many days the export's own day is past the row's date."""
    return (date.fromisoformat(export_day) - date.fromisoformat(row_date)).days
