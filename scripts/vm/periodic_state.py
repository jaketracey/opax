#!/usr/bin/env python3
"""Durable periodic due dates; no source, database, KB or network access.

The nightly lock serializes callers. Planning is persisted before acquisition;
completion is called only after accepted exports are confirmed on origin/main.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
import json
import os
from pathlib import Path
import sys
import tempfile
from zoneinfo import ZoneInfo

GROUPS = ("weekly", "monthly", "frl")


def sydney_day(now: datetime | None = None) -> date:
    return (now or datetime.now(ZoneInfo("Australia/Sydney"))).astimezone(
        ZoneInfo("Australia/Sydney")).date()


def due_dates(day: date, frl_dow: int = 4) -> dict[str, date]:
    if frl_dow not in range(1, 8):
        raise ValueError("FRL day must be 1 through 7")
    sunday = day - timedelta(days=(day.isoweekday() - 7) % 7)
    first = day.replace(day=1)
    monthly = first + timedelta(days=(7 - first.isoweekday()) % 7)
    if monthly > day:
        first = (first - timedelta(days=1)).replace(day=1)
        monthly = first + timedelta(days=(7 - first.isoweekday()) % 7)
    return {"weekly": sunday, "monthly": monthly,
            "frl": day - timedelta(days=(day.isoweekday() - frl_dow) % 7)}


def read_state(path: Path, day: date) -> dict:
    if not path.exists():
        # Preserve the pre-existing first-run calendar. Do not unexpectedly run
        # a historical monthly crawl on installation; future missed dates retry.
        return {"schema": 1, "initialized": day.isoformat(),
                "observed_through": (day - timedelta(days=1)).isoformat(),
                "groups": {group: {} for group in GROUPS}}
    state = json.loads(path.read_text())
    if (not isinstance(state, dict) or state.get("schema") != 1
            or not isinstance(state.get("groups"), dict) or set(state["groups"]) != set(GROUPS)):
        raise ValueError("invalid periodic state schema; retained for inspection")
    date.fromisoformat(state["initialized"])
    date.fromisoformat(state["observed_through"])
    for row in state["groups"].values():
        if not isinstance(row, dict):
            raise ValueError("invalid periodic group state; retained for inspection")
        for field in ("pending_since", "due", "last_success", "last_attempt"):
            if field in row:
                date.fromisoformat(row[field])
        if ("pending_since" in row) != ("due" in row):
            raise ValueError("incomplete periodic pending marker; retained for inspection")
        if "commit" in row and (not isinstance(row["commit"], str)
                                or not 7 <= len(row["commit"]) <= 40
                                or any(c not in "0123456789abcdef" for c in row["commit"])):
            raise ValueError("invalid periodic commit receipt; retained for inspection")
    return state


def snapshot(path: Path, day: date) -> dict:
    """Only the known date/commit fields may reach the public nightly status."""
    if not path.exists():
        return {}
    state = read_state(path, day)
    return {"schema": 1, "observed_through": state["observed_through"], "groups": {
        group: {key: row[key] for key in ("pending_since", "due", "last_success", "last_attempt", "commit") if key in row}
        for group, row in state["groups"].items()}}


def write_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=path.name + ".tmp.", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w") as stream:
            json.dump(state, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def groups(value: str) -> list[str]:
    selected = value.split()
    if any(group not in GROUPS for group in selected) or len(set(selected)) != len(selected):
        raise ValueError("periodic groups must be unique weekly, monthly or frl names")
    return selected


def plan(state: dict, day: date, forced: str = "", frl_dow: int = 4) -> list[str]:
    selected = groups(forced)
    observed = date.fromisoformat(state["observed_through"])
    for group, due in due_dates(day, frl_dow).items():
        row = state["groups"][group]
        if due > observed and due.isoformat() > row.get("last_success", ""):
            row.setdefault("pending_since", due.isoformat())
            row["due"] = max(row.get("due", ""), due.isoformat())
    for group in selected:
        row = state["groups"][group]
        row.setdefault("pending_since", day.isoformat())
        row["due"] = max(row.get("due", ""), day.isoformat())
    state["observed_through"] = max(observed, day).isoformat()
    # FRL was moved off Sunday because combining it with weekly/monthly work
    # exhausted the six-hour unit. Catch-up must preserve that separation too.
    # Forced runs still override selection without discarding other debt.
    pending = [group for group in GROUPS if "due" in state["groups"][group]]
    regular = [group for group in pending if group != "frl"]
    if selected or not regular or "frl" not in pending:
        return selected or regular or pending
    frl = state["groups"]["frl"]
    if ((frl["due"] == day.isoformat() and frl.get("last_attempt", "") < frl["due"])
            or frl.get("last_attempt", "") < max(state["groups"][g].get("last_attempt", "") for g in regular)):
        return ["frl"]
    return regular


def attempt(state: dict, day: date, selected: str) -> None:
    for group in groups(selected):
        row = state["groups"][group]
        if "due" not in row:
            raise ValueError(f"no pending periodic attempt for {group}")
        row["last_attempt"] = max(row.get("last_attempt", ""), day.isoformat())


def complete(state: dict, day: date, selected: str, commit: str) -> None:
    if not 7 <= len(commit) <= 40 or any(c not in "0123456789abcdef" for c in commit):
        raise ValueError("completion requires the confirmed Git commit")
    for group in groups(selected):
        row = state["groups"][group]
        if "due" not in row or row["due"] > day.isoformat():
            raise ValueError(f"no matching periodic attempt for {group}")
        row["last_success"] = max(row.get("last_success", ""), day.isoformat())
        row["commit"] = commit
        del row["pending_since"], row["due"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("plan", "attempt", "complete", "pending"))
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--date", type=date.fromisoformat, default=sydney_day())
    parser.add_argument("--force", default="")
    parser.add_argument("--frl-dow", type=int, default=4)
    parser.add_argument("--groups", default="")
    parser.add_argument("--commit", default="")
    args = parser.parse_args()
    try:
        state = read_state(args.state, args.date)
        if args.action == "plan":
            selected = plan(state, args.date, args.force, args.frl_dow)
            write_state(args.state, state)
            print(" ".join(selected))
        elif args.action in ("attempt", "complete"):
            if args.action == "attempt":
                attempt(state, args.date, args.groups)
            else:
                complete(state, args.date, args.groups, args.commit)
            write_state(args.state, state)
        else:
            print(" ".join(group for group in GROUPS if "due" in state["groups"][group]))
        return 0
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print(f"REFUSED periodic state: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
