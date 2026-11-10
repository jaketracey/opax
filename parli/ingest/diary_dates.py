"""parli.ingest.diary_dates -- the one rule for trusting a ministerial diary's printed date.

Used by parli.ingest.money_diaries (when a diary is loaded) and by scripts/export_access.py
(for rows loaded before the rule existed). Stdlib only, so the exporter can import it.

A diary covers a stated reporting period. A printed meeting date is kept unless:

  * it is a typo year: outside the period's years by more than one (a 2926, a 2005 inside
    a 2025 diary), the rule this module took over from money_diaries._sane_date;
  * it lies in the future when the row is read (no diary can disclose a meeting that has
    not happened);
  * it falls more than SPILL_DAYS after the diary's own period end, AND the diary's period
    is corroborated by its other rows (at least half of its dated rows fall inside the
    period, give or take SPILL_DAYS). The QLD Nicholls November 2025 diary prints
    "26 November 2026" and the NSW Attorney General's Q4 2025 disclosure prints "9/12/2026":
    one row out of a diary whose other rows sit in the period, so the printed year is a
    source typo. When most rows fall outside the stated period instead (a few NSW headers
    state the wrong quarter), the header is what is wrong, so nothing is rejected.

A rejected date is not rewritten: the caller stores no meeting_date and keeps the printed
cell in meeting_date_raw, exactly as for an unparseable date.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

SPILL_DAYS = 31


def _d(iso: str | None) -> date | None:
    if not iso:
        return None
    try:
        return datetime.strptime(iso[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def period_corroborated(dates, period_start: str | None, period_end: str | None) -> bool:
    """True when the stated period is consistent and at least half of the diary's dated rows
    fall inside it (with SPILL_DAYS either side)."""
    ps, pe = _d(period_start), _d(period_end)
    if not ps or not pe or ps > pe:
        return False
    ds = [d for d in (_d(x) for x in dates) if d]
    if not ds:
        return False
    lo, hi = ps - timedelta(days=SPILL_DAYS), pe + timedelta(days=SPILL_DAYS)
    return sum(1 for d in ds if lo <= d <= hi) * 2 >= len(ds)


def date_problem(iso: str | None, period_start: str | None, period_end: str | None,
                 corroborated: bool, today: date | None = None) -> str | None:
    """Why a printed date cannot stand as the meeting date, or None when it can."""
    d = _d(iso)
    if not d:
        return None
    lo = int(period_start[:4]) - 1 if period_start else 2000
    hi = int(period_end[:4]) + 1 if period_end else (today or date.today()).year + 1
    if not lo <= d.year <= hi:
        return "typo year"
    if d > (today or date.today()):
        return "future date"
    pe = _d(period_end)
    if corroborated and pe and d > pe + timedelta(days=SPILL_DAYS):
        return "after the diary's own period"
    return None


def sane_date(iso: str | None, period_start: str | None, period_end: str | None,
              corroborated: bool = False, today: date | None = None) -> str | None:
    """The printed date when it can stand, else None (the raw cell is kept by the caller)."""
    if not iso:
        return None
    return None if date_problem(iso, period_start, period_end, corroborated, today) else iso
