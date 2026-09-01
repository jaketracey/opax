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

`for` and `against` hold up to four bills each, most recent first, one entry
per bill. Only divisions whose question was the bill itself qualify: "pass
the bill", "read a second time", "agree with the bill's main idea" and kin
(an aye is for the bill), plus the inverted forms "decline a second
reading" / "disagree with bill" (an aye is against it). Procedural divisions
that share the bill's name ("put the question", "speed things along", "stop
the member from speaking") are skipped: an aye there says nothing about the
bill, so listing it under "Voted for" would misreport the vote.

Division names arrive TheyVoteForYou-style ("Title - Stage - What the vote
meant"); the stage is split out rather than deleted and the trailing
description stands in as the summary when the division carries no motion text
of its own. Only 535 of ~4,000 divisions carry a summary, most of it Hansard
boilerplate or the mover's speech, so real motion text is used only when it
reads as one ("That this House ...", "The majority voted ..."). `rebels` is
the division's own rebellion count when above zero; whether this person was
among the rebels is not derivable from the vote columns.
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
# The vote description tells which way the question ran. An aye on a POSITIVE
# question backs the bill; an aye on a NEGATIVE one opposes it.
POSITIVE = re.compile(
    r"^(pass the bills?|read a (second|third) time|"
    r"agree (with|to) (the )?(bills?'?s?( main idea| as amended)?|main idea( of the bill)?|amended bill))$")
NEGATIVE = re.compile(
    r"^(decline (to read a second time|(a )?second reading)|"
    r"don'?t agree with (the )?bills?'?s? main idea|disagree with (the )?bills?|reject the bills?)$")
MOTION_TEXT = ("that ", "the majority voted")
TRAILING_JOINERS = re.compile(r"\s+and\s+(related bills?|another|others?|\d+ others?)\s*$", re.I)
TAGS = re.compile(r"<[^>]+>")
MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
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
        s = WS.sub(" ", MD_LINK.sub(r"\1", TAGS.sub(" ", "\n".join(lines))).replace("#", " ")).strip()
        if not s.lower().startswith(MOTION_TEXT):
            s = ""
        elif s.lower().startswith("the majority voted"):
            # TheyVoteForYou explainers run on for paragraphs; the first
            # sentence is the finding, the rest is a primer on bill stages.
            s = re.split(r"\.(?=[\s(])", s, 1)[0].rstrip(".") + "."
    s = s or WS.sub(" ", fallback or "").strip()
    if len(s) > SUMMARY_CHARS:
        s = s[:SUMMARY_CHARS].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"
    return s


def polarity(parsed):
    """+1 when an aye backs the bill, -1 when an aye opposes it, 0 when the
    division was procedural or not about a bill at all."""
    _, _, detail, is_bill = parsed
    if not is_bill:
        return 0
    d = detail.lower().strip(" .")
    if POSITIVE.match(d):
        return 1
    if NEGATIVE.match(d):
        return -1
    return 0


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
        title, stage, detail, _ = parsed
        divisions[did] = {
            "name": title, "stage": stage, "date": date[:10],
            "summary": clean_summary(summary, detail),
            "rebels": int(rebellions or 0), "polarity": polarity(parsed),
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
        # An aye on a positive question or a no on a negative one backs the bill.
        sides = {"for": [], "against": []}
        for did, vote in rows:
            d = divisions.get(did)
            if not d or not d["polarity"]:
                continue
            backs = (vote == "aye") == (d["polarity"] > 0)
            sides["for" if backs else "against"].append(d)
        for side, picks in sides.items():
            picks.sort(key=lambda d: d["date"], reverse=True)
            seen, chosen = set(), []
            for d in picks:  # one entry per bill: second and third readings repeat the name
                if d["name"] in seen:
                    continue
                seen.add(d["name"])
                chosen.append({k: v for k, v in d.items() if k != "polarity"
                               and not (k == "rebels" and v == 0) and not (k == "summary" and not v)})
                if len(chosen) == PER_SIDE:
                    break
            entry[side] = chosen
        out[pid] = entry

    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")
    with_votes = sum(1 for e in out.values() if e["for"] or e["against"])
    print(f"people {len(ids)}, exported {len(out)}, with listed divisions {with_votes}, "
          f"no votes {skipped}, usable divisions {len(divisions)}", file=sys.stderr)


if __name__ == "__main__":
    main()
