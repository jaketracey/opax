#!/usr/bin/env python3
"""
Export every IPEA expense line per person and reporting year from parli.db (`ext_expenses`, loaded by
parli.ingest.money_ipea), for the itemised expenses view and the Ask expenses tool. Runs on the data
box in the monthly refresh group, after scripts/export_expenses.py:

  python3 scripts/export_expenses_itemised.py --out ~/.cache/autoresearch/pipeline/expenses-itemised

It writes one file per person and year, `<out>/<person_id>/<year>.json`, about 3,300 files and 170 MB
in all (37 quarters, 1.23M lines), which is too much for git. scripts/vm/upload_expenses_itemised.py
sends the tree to the R2 bucket the portal serves `/media/` from, under `expenses/v1/`.

One file:

  {"meta": {"person_id": "11029", "name": "Jo Briskey", "year": 2026,
            "source": ..., "licence": "CC BY 3.0 AU", "licence_url": ..., "attribution": ...,
            "quarters": [{"id": "2026Q01", "label": "Jan-Mar 2026", "source_url": <dataset page>}, ...],
            "lines": 212, "total": 318774.12, "notes": [...]},
   "columns": ["quarter", "from_date", ...],
   "lines": [["2026Q01", "2026-02-01", "2026-02-11", ...], ...]}

`year` is the reporting quarter's calendar year, the same grouping as expenses.json `by_year` (most
lines carry no date of their own). Lines are in IPEA's published order within each quarter. Amounts
are as published, to the cent; negative lines are IPEA's adjustments and repayments. People resolve
exactly as in expenses.json (scripts/export_expenses.py make_resolver); lines that resolve to nobody
are skipped and counted on stderr.

Who travelled is written as a role only: "Member", "Family member" or "Staff". IPEA's files give
family travel under the placeholder "Family Traveller" and staff travel as aggregated totals under
the member, so no other person is named there. This export still never copies the traveller column,
and blanks a free-text field of a family or staff line if it ever carried the traveller's name.

The files carry no generation stamp, so a run on unchanged data writes byte-identical files and the
upload sends nothing.
"""

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_expenses import ATTRIBUTION, SOURCE, clean_name, display_name, make_resolver  # noqa: E402
from parli.ingest.money_ipea import LICENCE, LICENCE_URL  # noqa: E402

COLUMNS = [
    "quarter", "from_date", "to_date", "category", "category_high", "category_major", "category_minor",
    "description", "from_location", "to_location", "nights", "nightly_rate", "amount", "trip", "leg",
    "reason", "notes", "traveller",
]
ROLE_MEMBER, ROLE_FAMILY, ROLE_STAFF = "Member", "Family member", "Staff"
ROLES = (ROLE_MEMBER, ROLE_FAMILY, ROLE_STAFF)
FAMILY_PLACEHOLDER = "family traveller"
NOTES = [
    "Lines are grouped by IPEA's reporting quarter, not by the date of travel. Amounts are as published; "
    "negative lines are IPEA adjustments and repayments.",
    "The traveller column is a role only: Member, Family member or Staff.",
]
SELECT = (
    "SELECT member_name, person_id, reporting_period_id, reporting_period, source_url, traveller_name, "
    "from_date, to_date, category, category_high, category_major, category_minor, description, "
    "from_location, to_location, nights, nightly_rate, amount, trip_sequence, leg_number, reason, notes "
    "FROM ext_expenses WHERE amount IS NOT NULL AND reporting_period_id >= ? AND reporting_period_id < ? "
    "ORDER BY reporting_period_id, unique_id, id")


def traveller_role(traveller_name, category_high, category_major):
    """The role of whoever incurred the line, from IPEA's category tree and its family placeholder."""
    text = f"{category_high or ''} {category_major or ''}".lower()
    if "family" in text or (traveller_name or "").strip().lower() == FAMILY_PLACEHOLDER:
        return ROLE_FAMILY
    if "employee" in text:
        return ROLE_STAFF
    return ROLE_MEMBER


def scrub(value, traveller_name, member_name, role):
    """A free-text field, blanked when a family or staff line's text carries the traveller's own name."""
    if value is None or role == ROLE_MEMBER:
        return value
    name = (traveller_name or "").strip().lower()
    if not name or name == FAMILY_PLACEHOLDER or name == clean_name(member_name):
        return value
    # the full name, or any name part (as a whole word) that is not also part of the member's name
    words = set(re.findall(r"[^\W\d_]+", value.lower()))
    member_words = set(clean_name(member_name).split())
    parts = [w for w in re.findall(r"[^\W\d_]+", name) if len(w) > 2 and w not in member_words]
    return None if name in value.lower() or any(part in words for part in parts) else value


def money(value):
    return None if value is None else round(float(value), 2)


def export(db, out_dir):
    """Write the tree under out_dir (replacing it) and return counts."""
    resolve, full_name, _ = make_resolver(db)
    lo, hi = db.execute("SELECT min(reporting_period_id), max(reporting_period_id) FROM ext_expenses "
                        "WHERE amount IS NOT NULL").fetchone()
    if not lo:
        raise SystemExit("ext_expenses holds no lines: nothing exported, the last tree is kept")
    tmp = out_dir.with_name(out_dir.name + ".tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)
    files = lines_out = skipped = total_bytes = 0
    unresolved = set()
    for year in range(int(lo[:4]), int(hi[:4]) + 1):
        people = {}   # pid -> {"lines": [...], "quarters": {id: (label, url)}, "variants": set}
        for (member_name, pid, period_id, period_label, source_url, traveller_name, from_date, to_date, category,
             cat_high, cat_major, cat_minor, description, from_loc, to_loc, nights, nightly_rate, amount,
             trip, leg, reason, notes) in db.execute(SELECT, (str(year), str(year + 1))):
            pid = resolve(member_name, pid)
            if not pid:
                skipped += 1
                unresolved.add(member_name)
                continue
            p = people.setdefault(pid, {"lines": [], "quarters": {}, "variants": set()})
            p["variants"].add(clean_name(member_name))
            p["quarters"].setdefault(period_id, (period_label, source_url))
            role = traveller_role(traveller_name, cat_high, cat_major)
            p["lines"].append([
                period_id, from_date, to_date, category, cat_high, cat_major, cat_minor,
                scrub(description, traveller_name, member_name, role), from_loc, to_loc, nights,
                money(nightly_rate), money(amount), trip, leg,
                scrub(reason, traveller_name, member_name, role), scrub(notes, traveller_name, member_name, role),
                role,
            ])
        for pid, p in sorted(people.items()):
            amount_at = COLUMNS.index("amount")
            doc = {
                "meta": {
                    "person_id": pid,
                    "name": full_name.get(pid) or display_name(sorted(p["variants"])[0]),
                    "year": year,
                    "source": SOURCE,
                    "licence": LICENCE,
                    "licence_url": LICENCE_URL,
                    "attribution": ATTRIBUTION,
                    "quarters": [{"id": q, "label": label, "source_url": url}
                                 for q, (label, url) in sorted(p["quarters"].items())],
                    "lines": len(p["lines"]),
                    "total": round(sum(line[amount_at] for line in p["lines"]), 2),
                    "notes": NOTES,
                },
                "columns": COLUMNS,
                "lines": p["lines"],
            }
            blob = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            dest = tmp / safe_id(pid) / f"{year}.json"
            dest.parent.mkdir(exist_ok=True)
            dest.write_bytes(blob)
            files += 1
            lines_out += len(p["lines"])
            total_bytes += len(blob)
    if not files:
        shutil.rmtree(tmp)
        raise SystemExit("no line resolved to a person: nothing exported, the last tree is kept")
    if out_dir.exists():
        shutil.rmtree(out_dir)
    os.replace(tmp, out_dir)
    return {"files": files, "lines": lines_out, "bytes": total_bytes, "skipped_lines": skipped,
            "unresolved_names": len(unresolved), "from": lo, "to": hi}


def safe_id(pid):
    """A person_id as one path segment; ids are digits or person_<hex>, anything else is refused."""
    pid = str(pid)
    if not pid or not all(c.isalnum() or c in "_-" for c in pid):
        raise SystemExit(f"person_id {pid!r} is not a safe file name")
    return pid


def main(argv=None):
    ap = argparse.ArgumentParser(description="IPEA expense lines per person and year -> a JSON tree")
    ap.add_argument("--out", required=True, type=Path, help="directory to (re)write; replaced as a whole")
    ap.add_argument("--db", default=os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db"))
    args = ap.parse_args(argv)
    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    try:
        counts = export(db, args.out.expanduser())
    finally:
        db.close()
    print(" ".join(f"{k}={v}" for k, v in counts.items()), file=sys.stderr)


if __name__ == "__main__":
    main()
