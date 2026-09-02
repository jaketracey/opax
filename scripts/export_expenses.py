#!/usr/bin/env python3
"""
Export IPEA parliamentary expenses per person from parli.db (`ext_expenses`,
loaded by parli.ingest.money_ipea) for the portal's person pages. Runs on the
data box and writes one static file the portal serves as-is: the site never
touches the DB.

  scp scripts/export_expenses.py desktop:/tmp/
  ssh desktop 'python3 /tmp/export_expenses.py' > portal/public/expenses.json

Output:

  {"meta":  {"source": ..., "licence": "CC BY 4.0", "quarters": 37,
             "from": "2017Q02", "to": "2026Q02", "source_url": <latest dataset page>,
             "people": 440, "rows": 1229512, "generated": "2026-09-02T..."},
   "names": {"anthony albanese": "10007", ...},
   "people": {"10007": {"name": "Anthony Albanese", "total": 24402773, "lines": 3201,
                        "from": 2017, "to": 2026,
                        "by_category": [["Domestic Travel", 9123456], ...],
                        "by_year": [[2017, 1234567], ...],
                        "top": [{"date": "Apr-Jun 2025", "category": "Domestic Travel",
                                 "description": "Aggregated Total", "amount": 1178514}, ...]}}}

`people` is keyed by members.person_id. `names` maps lowercased display names
(members.full_name plus every cleaned IPEA name variant) to a person_id so the
portal can resolve people who have no portrait entry in photos/people.json;
a name shared by two people with expenses is left out rather than guessed.

Linking: the loader's post-load SQL links rows on IPEA first_name + surname,
but some quarters publish neither column, so those rows carry no person_id
even when the member is well known (Barnaby Joyce, Rebekha Sharkie, ...).
This export re-resolves every unlinked member_name by stripping honorifics
and post-nominals ("The Hon Barnaby Joyce MP" -> "barnaby joyce") and
matching members.full_name, preferring the sitting member as the loader does,
then trying common first-name nicknames ("Patrick" -> "Pat") when the exact
name misses. Rows that still resolve to nobody (staff support units, former
PMs absent from `members`) are counted in meta.unlinked and skipped.

Amounts are rounded to whole dollars. Negative lines are IPEA adjustments
and repayments; they stay in the totals as published, but the category bar
list only shows categories with a positive net and the top-five list only
positive lines. by_year is keyed on the reporting quarter's calendar year
(from_date is empty on 93% of rows), so 2017 and 2026 are partial years.
"""

import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone

DB = "file:/home/jake/.cache/autoresearch/parli.db?mode=ro"
TOP_ITEMS = 5
MAX_CATEGORIES = 12
DESC_CHARS = 90
SOURCE = "Independent Parliamentary Expenses Authority quarterly expenditure reports (data.gov.au, CC BY 4.0)"

HONORIFIC_RE = re.compile(
    r"^(?:(?:the|senator|hon|mr|mrs|ms|miss|dr|lady|sir|dame|prof|professor)\.?\s+)+", re.I)
POSTNOMINAL_RE = re.compile(
    r"(?:\s+(?:MP|AC|AO|AM|OAM|QC|KC|SC|DSC|CSC|CBE|OBE|MBE|KCMG|RFD|ED|JP|OAM))+$")
NICKNAMES = {
    "patrick": ["pat"], "robert": ["bob", "rob"], "anthony": ["tony"], "james": ["jim"],
    "christopher": ["chris"], "michael": ["mike"], "william": ["bill"], "joshua": ["josh"],
    "susan": ["sue"], "matthew": ["matt"], "nicholas": ["nick"], "andrew": ["andy"],
    "timothy": ["tim"], "daniel": ["dan"], "benjamin": ["ben"], "thomas": ["tom"],
    "edward": ["ed"], "richard": ["rick", "dick"], "david": ["dave"], "jessica": ["jess"],
    "katherine": ["kate", "katie"], "catherine": ["cathy", "cath"], "elizabeth": ["liz"],
    "rebecca": ["bec"], "samuel": ["sam"], "alexander": ["alex"], "stephen": ["steve"],
    "peter": ["pete"], "kenneth": ["ken"], "ronald": ["ron"], "raymond": ["ray"],
}
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def clean_name(member_name):
    """'The Hon Anthony ALBANESE MP' -> 'anthony albanese'."""
    s = HONORIFIC_RE.sub("", (member_name or "").strip())
    s = POSTNOMINAL_RE.sub("", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def display_name(key):
    return " ".join(w[:1].upper() + w[1:] for w in key.split(" "))


def main():
    db = sqlite3.connect(DB, uri=True)

    # members.full_name -> preferred person_id (sitting member first, then most
    # recently departed), mirroring the loader's LINK_SQL tie-break.
    full_name = {}
    candidates = defaultdict(list)
    for pid, name, left in db.execute("SELECT person_id, full_name, left_house FROM members"):
        if not pid or not name:
            continue
        full_name[pid] = name.strip()
        candidates[name.strip().lower()].append((left is None, left or "", pid))
    preferred = {k: max(v)[2] for k, v in candidates.items()}

    # Names the loader already linked resolve their unlinked casing variants.
    linked_by_name = {}
    for member_name, pid in db.execute(
            "SELECT DISTINCT member_name, person_id FROM ext_expenses WHERE person_id IS NOT NULL"):
        linked_by_name.setdefault(clean_name(member_name), pid)

    resolved = {}
    recovered = {}
    unresolved = defaultdict(float)

    def resolve(member_name, pid):
        if pid:
            return pid
        if member_name in resolved:
            return resolved[member_name]
        key = clean_name(member_name)
        hit = linked_by_name.get(key) or preferred.get(key)
        if not hit and " " in key:
            first, rest = key.split(" ", 1)
            for nick in NICKNAMES.get(first, []):
                hit = linked_by_name.get(f"{nick} {rest}") or preferred.get(f"{nick} {rest}")
                if hit:
                    break
        resolved[member_name] = hit
        if hit:
            recovered[member_name] = hit
        return hit

    people = {}
    variants = defaultdict(set)   # pid -> cleaned IPEA name variants
    periods = set()
    rows = 0
    for (member_name, pid, category, cat_major, cat_minor, description, from_date,
         reporting_period, period_id, period_start, amount) in db.execute(
            "SELECT member_name, person_id, category, category_major, category_minor, description, "
            "from_date, reporting_period, reporting_period_id, period_start, amount "
            "FROM ext_expenses WHERE amount IS NOT NULL"):
        rows += 1
        periods.add(period_id)
        pid = resolve(member_name, pid)
        if not pid:
            unresolved[member_name] += amount
            continue
        p = people.get(pid)
        if p is None:
            p = people[pid] = {"total": 0.0, "lines": 0, "cats": defaultdict(float),
                               "years": defaultdict(float), "top": []}
        variants[pid].add(clean_name(member_name))
        year = int(period_start[:4])
        p["total"] += amount
        p["lines"] += 1
        p["cats"][category or "Uncategorised"] += amount
        p["years"][year] += amount
        top = p["top"]
        if amount > 0 and (len(top) < TOP_ITEMS or amount > top[-1][0]):
            desc = (description or cat_minor or cat_major or "").strip()
            if len(desc) > DESC_CHARS:
                desc = desc[:DESC_CHARS - 1].rstrip() + "…"
            date = from_date if from_date and ISO_DATE_RE.match(from_date) else reporting_period
            top.append((amount, date, category or "Uncategorised", desc))
            top.sort(key=lambda t: -t[0])
            del top[TOP_ITEMS:]

    out_people = {}
    for pid, p in people.items():
        cats = sorted(((k, v) for k, v in p["cats"].items() if v > 0), key=lambda kv: -kv[1])
        if len(cats) > MAX_CATEGORIES:
            rest = sum(v for _, v in cats[MAX_CATEGORIES:])
            cats = cats[:MAX_CATEGORIES] + [(f"Other ({len(cats) - MAX_CATEGORIES} categories)", rest)]
        y0, y1 = min(p["years"]), max(p["years"])
        out_people[pid] = {
            "name": full_name.get(pid) or display_name(sorted(variants[pid])[0]),
            "total": round(p["total"]),
            "lines": p["lines"],
            "from": y0,
            "to": y1,
            "by_category": [[k, round(v)] for k, v in cats],
            "by_year": [[y, round(p["years"].get(y, 0.0))] for y in range(y0, y1 + 1)],
            "top": [{"date": d, "category": c, "description": s, "amount": round(a)}
                    for a, d, c, s in p["top"]],
        }

    # Name index: every display name and IPEA variant, dropped when ambiguous.
    name_hits = defaultdict(set)
    for pid in out_people:
        name_hits[out_people[pid]["name"].lower()].add(pid)
        for v in variants[pid]:
            name_hits[v].add(pid)
    names = {k: next(iter(v)) for k, v in sorted(name_hits.items()) if len(v) == 1}

    latest = max(periods)
    (latest_url,) = db.execute(
        "SELECT source_url FROM ext_expenses WHERE reporting_period_id = ? LIMIT 1", (latest,)).fetchone()
    out = {
        "meta": {
            "source": SOURCE,
            "licence": "CC BY 4.0",
            "source_url": latest_url,
            "quarters": len(periods),
            "from": min(periods),
            "to": latest,
            "people": len(out_people),
            "rows": rows,
            "unlinked": {"names": len(unresolved), "amount": round(sum(unresolved.values()))},
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "names": names,
        "people": dict(sorted(out_people.items())),
    }
    blob = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(blob)

    print(f"people={len(out_people)} rows={rows} quarters={len(periods)} bytes={len(blob)}", file=sys.stderr)
    print(f"recovered {len(recovered)} unlinked name variants: "
          + ", ".join(f"{k} -> {v}" for k, v in sorted(recovered.items())), file=sys.stderr)
    print(f"still unlinked ({len(unresolved)}): "
          + ", ".join(f"{k} ${v:,.0f}" for k, v in sorted(unresolved.items(), key=lambda kv: -kv[1])),
          file=sys.stderr)


if __name__ == "__main__":
    main()
