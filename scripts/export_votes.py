#!/usr/bin/env python3
"""
Export a compact voting record for every parliamentarian with a portrait
(portal/public/photos/people.json) from parli.db. Runs on the data box and
writes a static file the portal serves as-is: the site never touches the DB.

  scp portal/public/photos/people.json scripts/export_votes.py desktop:/tmp/
  ssh desktop 'python3 /tmp/export_votes.py /tmp/people.json' > portal/public/votes.json

Output is keyed by person_id:

  {"10007": {"name": "Anthony Albanese", "party": "Labor",
             "ayes": 812, "noes": 1073, "divisions_total": 1885, "years": [2006, 2026],
             "for":     [{"name": "Migration Amendment (...) Bill 2012", "stage": "Second reading",
                          "date": "2012-08-15", "summary": "Read a second time", "rebels": 3}, ...],
             "against": [...]}}

`for` and `against` hold up to four divisions each, substantive bill votes
(second and third readings) first, then other bill stages, then motions, most
recent first within each tier. Division names arrive TheyVoteForYou-style
("Title - Stage - What the vote meant"); the stage is split out rather than
deleted and the trailing description stands in as the summary when the
division carries no motion text of its own. Only 535 of ~4,000 divisions
carry a summary, and most of those are Hansard boilerplate ("Division:
Question put ..."), so summaries are optional and never a selection filter.
`rebels` is the division's own rebellion count when above zero; whether this
person was among the rebels is not derivable from the vote columns.
"""

import json
import re
import sqlite3
import sys

DB = "file:/home/jake/.cache/autoresearch/parli.db?mode=ro"
PER_SIDE = 4
SUMMARY_CHARS = 160

# Leading category in three-part motion names ("Motions - Climate Change - ...").
CATEGORY_STAGE = {
    "motions": "Motion",
    "business": "Business motion",
    "documents": "Documents",
    "notices": "Notice of motion",
    "matters of urgency": "Urgency motion",
    "matters of public importance": "Matter of public importance",
    "questions without notice": "Question time",
    "questions without notice: additional answers": "Question time",
    "committees": "Committee motion",
    "statements": "Statement",
    "bills": "Bill",
}
STAGE_CASE = {
    "second reading": "Second reading",
    "third reading": "Third reading",
    "in committee": "In committee",
    "consideration in detail": "Consideration in detail",
    "consideration of senate message": "Consideration of Senate message",
    "consideration of house of representatives message": "Consideration of House message",
}
BOILERPLATE = ("division: question put", "no motion text", "resolved in the")
TRAILING_JOINERS = re.compile(r"\s+and\s+(related bills?|another|others?|\d+ others?)\s*$", re.I)
TAGS = re.compile(r"<[^>]+>")
WS = re.compile(r"\s+")


def parse_name(raw):
    """Split a division name into (title, stage, detail, is_bill), or None when
    the row is scraper debris (page numbers, sentence fragments, dot leaders)."""
    if not raw:
        return None
    name = WS.sub(" ", raw).strip()
    if "...." in name or re.match(r"^\d", name) or name[:1].islower():
        return None
    # 2026 Hansard names: "Bills — X Bill 2026; Second Reading".
    name = re.sub(r";\s*(Second|Third) Reading\s*$", r" - \1 Reading", name)
    parts = [p.strip() for p in re.split(r"\s+[-—]\s+", name) if p.strip()]
    if len(parts) < 2:
        return None
    head = parts[0]
    is_bill = " bill" in head.lower() or head.lower().endswith("bill")
    if is_bill:
        title, stage, detail = head, parts[1], " - ".join(parts[2:])
    elif head.lower() in CATEGORY_STAGE and len(parts) >= 2:
        stage = CATEGORY_STAGE[head.lower()]
        title = parts[1]
        detail = " - ".join(parts[2:])
        is_bill = stage == "Bill"
        if is_bill and len(parts) >= 3:
            stage, detail = parts[2], " - ".join(parts[3:])
    elif len(parts) >= 3:
        title, stage, detail = parts[1], head, " - ".join(parts[2:])
    else:
        title, stage, detail = parts[0], parts[1], ""
    title = TRAILING_JOINERS.sub("", title).strip(" ,;")
    if len(title) < 8:
        return None
    stage = STAGE_CASE.get(stage.lower(), stage[:1].upper() + stage[1:])
    return title, stage, detail, is_bill


def clean_summary(text, fallback):
    """Real motion text when the division has it, else the TheyVoteForYou
    description; either way trimmed to SUMMARY_CHARS on a word boundary."""
    s = ""
    if text:
        lines = text.strip().splitlines()
        # Hansard extracts open with the mover's name on its own line.
        if len(lines) > 1 and lines[1].strip() == "" and len(lines[0]) < 40 and "." not in lines[0]:
            lines = lines[2:]
        s = WS.sub(" ", TAGS.sub(" ", "\n".join(lines))).strip()
        if not s or s.lower().startswith(BOILERPLATE) or "AYES," in s:
            s = ""
    s = s or WS.sub(" ", fallback or "").strip()
    if len(s) > SUMMARY_CHARS:
        s = s[:SUMMARY_CHARS].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"
    return s


def tier(parsed):
    _, stage, _, is_bill = parsed
    if is_bill and stage in ("Second reading", "Third reading"):
        return 0
    return 1 if is_bill else 2


def main():
    people_path = sys.argv[1] if len(sys.argv) > 1 else "portal/public/photos/people.json"
    with open(people_path, encoding="utf-8") as f:
        people = json.load(f)  # lowercased full name -> person_id
    ids = sorted(set(people.values()))
    fallback_name = {pid: nm.title() for nm, pid in people.items()}

    db = sqlite3.connect(DB, uri=True)
    members = {r[0]: r for r in db.execute(
        "SELECT person_id, full_name, COALESCE(party_canonical, party) FROM members")}

    divisions = {}
    for did, name, date, rebellions, summary in db.execute(
            "SELECT division_id, name, date, rebellions, summary FROM divisions"):
        parsed = parse_name(name)
        if not parsed or not date:
            continue
        title, stage, detail, is_bill = parsed
        divisions[did] = {
            "name": title, "stage": stage, "date": date[:10],
            "summary": clean_summary(summary, detail),
            "rebels": int(rebellions or 0), "tier": tier(parsed),
        }

    marks = ",".join("?" * len(ids))
    votes = {}
    for pid, did, vote in db.execute(
            f"SELECT person_id, division_id, vote FROM votes WHERE person_id IN ({marks}) "
            "AND vote IN ('aye', 'no')", ids):
        votes.setdefault(pid, []).append((did, vote))

    out = {}
    skipped = 0
    for pid in ids:
        rows = votes.get(pid, [])
        if not rows:
            skipped += 1
            continue
        member = members.get(pid)
        entry = {
            "name": (member and member[1]) or fallback_name[pid],
            "party": (member and member[2]) or None,
            "ayes": sum(1 for _, v in rows if v == "aye"),
            "noes": sum(1 for _, v in rows if v == "no"),
        }
        entry["divisions_total"] = entry["ayes"] + entry["noes"]
        dated = [db_date for db_date, in db.execute(
            f"SELECT date FROM divisions WHERE division_id IN "
            f"({','.join('?' * len(rows))})", [d for d, _ in rows]) if db_date]
        if dated:
            entry["years"] = [int(min(dated)[:4]), int(max(dated)[:4])]
        for side, want in (("for", "aye"), ("against", "no")):
            picks = [divisions[d] for d, v in rows if v == want and d in divisions]
            # Substantive tier first, newest first inside each tier.
            picks.sort(key=lambda d: d["date"], reverse=True)
            picks.sort(key=lambda d: d["tier"])
            entry[side] = [
                {k: v for k, v in d.items() if k != "tier" and not (k == "rebels" and v == 0)
                 and not (k == "summary" and not v)}
                for d in picks[:PER_SIDE]
            ]
        out[pid] = entry

    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")
    with_votes = sum(1 for e in out.values() if e["for"] or e["against"])
    print(f"people {len(ids)}, exported {len(out)}, with listed divisions {with_votes}, "
          f"no votes {skipped}, usable divisions {len(divisions)}", file=sys.stderr)


if __name__ == "__main__":
    main()
