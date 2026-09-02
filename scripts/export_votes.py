#!/usr/bin/env python3
"""
Export a compact voting record for every parliamentarian with recorded votes
in parli.db. Runs on the data box and writes a static file the portal serves
as-is: the site never touches the DB.

  scp scripts/export_votes.py desktop:/tmp/
  ssh desktop 'python3 /tmp/export_votes.py' > portal/public/votes.json

Two sources, one shape:

  federal   the legacy `votes` / `divisions` / `members` tables (TheyVoteForYou,
            refreshed by parli/ingest/tvfy_refresh.py), keyed by TVFY person_id
            ("10007") -- the key portal/public/photos/people.json maps portrait
            names to, which the front-page slider relies on.
  state     `ext_votes` / `ext_divisions` (NSW, VIC, QLD Hansard divisions loaded
            by parli/ingest/votes_state.py), keyed "{jurisdiction}:{slug}" of the
            normalised name ("nsw:penny-sharpe"). PDF/XML sources carry no stable
            person id, and the normalised name is exactly the KB collaborator
            value, so the page and the corpus agree on who a record belongs to.

  {"10007": {"name": "Anthony Albanese", "party": "Labor", "jurisdiction": "federal",
             "house": "representatives", "ayes": 812, "noes": 1073, "divisions_total": 1885,
             "years": [2006, 2026],
             "for":     [{"name": "Migration Amendment (...) Bill 2012", "stage": "Second reading",
                          "date": "2012-08-15", "jur": "federal", "rebels": 3}, ...],
             "against": [...]},
   "nsw:penny-sharpe": {..., "jurisdiction": "nsw", "house": "nsw_lc", ...},
   "_names": {"anthony albanese": ["10007"], "penny sharpe": ["nsw:penny-sharpe"], ...}}

`_names` (lowercased display name -> keys) is how a person page finds records
for a name that has no portrait id; a name that voted in two parliaments lists
both keys. It is the one non-record key in the file.

`for` and `against` hold up to six bills each, most recent first, one entry per
bill. Only divisions whose question was the bill itself qualify: federally
"pass the bill", "read a second time", "agree with the bill's main idea" and kin
(an aye is for the bill), the inverted "decline a second reading" / "disagree
with bill" (an aye is against it), and -- for the Hansard-style names TVFY
carries before 2010 and from 2026 ("X Bill 2025 — Second Reading", no "what the
vote meant" tail) -- a plain second or third reading stage, where an aye is by
definition a vote to advance the bill. For the states the standardised question
decides: "That this bill be now read a second/third time", "That the bill be
agreed to" (an aye backs the bill); anything on an amendment, a suspension of
standing orders or a closure is procedural and skipped, as are divisions whose
question could not be recovered from the record.

`rebels` is the federal division's own rebellion count when above zero; whether
this person was among the rebels is not derivable from the vote columns.
"""

import json
import re
import sqlite3
import sys
import unicodedata
from collections import Counter

DB = "file:/home/jake/.cache/autoresearch/parli.db?mode=ro"
PER_SIDE = 6

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
    "limitation of debate": "Limitation of debate",
}
# The vote description tells which way the question ran. An aye on a POSITIVE
# question backs the bill; an aye on a NEGATIVE one opposes it.
POSITIVE = re.compile(
    r"^(pass the bills?|read a (second|third) time( \(duplicate\))?|agree to the bills?|agree with the bills?|"
    r"agree (with|to) (the )?(bills?'?s?( main idea| as amended)?|main idea( of the bill)?|amended bill))$")
NEGATIVE = re.compile(
    r"^(decline (to read a second time|(a )?second reading)|"
    r"don'?t agree with (the )?bills?'?s? main idea|disagree with (the )?bills?|reject the bills?)$")
READING_STAGES = ("Second reading", "Third reading")
# Hansard-style names put the stage after a semicolon ("Bills — X Bill 2026; Second Reading").
HANSARD_STAGE = re.compile(
    r";\s*((?:Second|Third) Reading|Consideration in Detail|In Committee|Limitation of Debate|"
    r"Consideration of (?:Senate|House of Representatives) Message)\s*$", re.I)
TRAILING_JOINERS = re.compile(r"\s+and\s+(related bills?|another|others?|\d+ others?)\s*$", re.I)
WS = re.compile(r"\s+")

# State divisions: the question as put decides whether the vote was on the bill.
STATE_BILL_QUESTION = re.compile(
    r"^that (this|the) bill(,? as amended,?)? be (now )?read a (second|third) time\b"
    r"|^that the bill(,? as amended,?)? be (now )?agreed to\b"
    r"|^that the (motion|question)(,? as amended,?)? be agreed to\b", re.I)
STATE_PROCEDURAL = ("amendment", "amendments", "suspension", "closure", "adjourn")


def parse_name(raw):
    """Split a division name into (title, stage, detail, is_bill), or None when
    the row is scraper debris (page numbers, sentence fragments, dot leaders)."""
    if not raw:
        return None
    name = WS.sub(" ", raw).strip()
    if "...." in name or re.match(r"^\d", name) or name[:1].islower():
        return None
    name = HANSARD_STAGE.sub(lambda m: f" - {m.group(1)}", name)
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
        is_bill = stage == "Bill" or " bill" in title.lower()
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


def polarity(parsed, summary=None):
    """+1 when an aye backs the bill, -1 when an aye opposes it, 0 when the
    division was procedural or not about a bill at all. A bare reading stage
    (Hansard-style name, no TVFY tail) counts as the bill question unless the
    stored motion text shows it was an amendment to the reading motion."""
    _, stage, detail, is_bill = parsed
    if not is_bill:
        return 0
    d = detail.lower().strip(" .")
    if POSITIVE.match(d):
        return 1
    if NEGATIVE.match(d):
        return -1
    if not d and stage in READING_STAGES:
        motion = WS.sub(" ", re.sub(r"<[^>]+>", " ", summary or "")).strip()[:400]
        if re.search(r"\b(omit|omitted|amendment|amended|substitut)\w*", motion, re.I):
            return 0
        return 1
    return 0


def state_polarity(question, bill_ref, divided_on):
    """+1 when an aye on a state division backs the bill named in bill_ref, else 0.
    Without a recoverable question the division could be an amendment, so it
    does not qualify."""
    if not bill_ref or not question:
        return 0, None
    if divided_on and any(w in divided_on.lower() for w in STATE_PROCEDURAL):
        return 0, None
    q = WS.sub(" ", question).strip()
    m = STATE_BILL_QUESTION.match(q)
    if not m:
        return 0, None
    stage = "Third reading" if re.search(r"third time", q, re.I) and not re.search(r"second time", q, re.I) \
        else "Second reading" if re.search(r"second time", q, re.I) else "Bill"
    return 1, stage


def slugify(name):
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or None


def pick_sides(rows, divisions):
    """rows: [(division_key, vote)] -> {"for": [...], "against": [...]}, one entry
    per bill, most recent first, PER_SIDE each."""
    sides = {"for": [], "against": []}
    for did, vote in rows:
        d = divisions.get(did)
        if not d or not d["polarity"]:
            continue
        backs = (vote == "aye") == (d["polarity"] > 0)
        sides["for" if backs else "against"].append(d)
    out = {}
    for side, picks in sides.items():
        picks.sort(key=lambda d: d["date"], reverse=True)
        seen, chosen = set(), []
        for d in picks:  # one entry per bill: second and third readings repeat the name
            if d["name"] in seen:
                continue
            seen.add(d["name"])
            chosen.append({k: v for k, v in d.items()
                           if k not in ("polarity",) and not (k == "rebels" and not v)})
            if len(chosen) == PER_SIDE:
                break
        out[side] = chosen
    return out


def export_federal(db, out, names):
    members = {r[0]: r for r in db.execute(
        "SELECT person_id, full_name, COALESCE(party_canonical, party), chamber FROM members")}
    divisions = {}
    for did, name, date, rebellions, summary in db.execute(
            "SELECT division_id, name, date, rebellions, summary FROM divisions WHERE COALESCE(state, 'federal') = 'federal'"):
        parsed = parse_name(name)
        if not parsed or not date:
            continue
        title, stage, _, _ = parsed
        divisions[did] = {"name": title, "stage": stage, "date": date[:10], "jur": "federal",
                          "rebels": int(rebellions or 0), "polarity": polarity(parsed, summary)}
    dates = {did: date[:10] for did, date in db.execute(
        "SELECT division_id, date FROM divisions WHERE COALESCE(state, 'federal') = 'federal' AND date IS NOT NULL")}
    votes = {}
    for pid, did, vote in db.execute("SELECT person_id, division_id, vote FROM votes WHERE vote IN ('aye', 'no')"):
        votes.setdefault(pid, []).append((did, vote))
    for pid, rows in votes.items():
        member = members.get(pid)
        name = (member and member[1]) or None
        if not name:
            continue
        entry = {
            "name": name,
            "party": (member and member[2]) or None,
            "jurisdiction": "federal",
            "house": (member and member[3]) or None,
            "ayes": sum(1 for _, v in rows if v == "aye"),
            "noes": sum(1 for _, v in rows if v == "no"),
        }
        entry["divisions_total"] = entry["ayes"] + entry["noes"]
        dated = [dates[d] for d, _ in rows if d in dates]
        if dated:
            entry["years"] = [int(min(dated)[:4]), int(max(dated)[:4])]
        entry.update(pick_sides(rows, divisions))
        out[pid] = entry
        names.setdefault(name.lower(), []).append(pid)
    return len(divisions)


def export_state(db, out, names):
    divisions = {}
    for did, name, question, bill_ref, date, extra in db.execute(
            "SELECT id, name, question, bill_ref, date, extra FROM ext_divisions WHERE jurisdiction != 'federal'"):
        divided_on = (json.loads(extra or "{}").get("divided_on") or "") if extra else ""
        pol, stage = state_polarity(question, bill_ref, divided_on)
        divisions[did] = {"name": bill_ref or name, "stage": stage or "Bill", "date": date[:10],
                          "jur": did.split("-", 1)[0], "polarity": pol}
    people = {}
    for jur, house, pkey, pname, did, vote, date, party in db.execute(
            "SELECT jurisdiction, house, person_key, person_name, division_id, vote, date, party FROM ext_votes "
            "WHERE jurisdiction != 'federal' AND person_key IS NOT NULL AND vote IN ('aye', 'no')"):
        p = people.setdefault((jur, pkey), {"names": Counter(), "houses": Counter(), "parties": Counter(),
                                            "rows": [], "dates": []})
        if pname:
            p["names"][pname] += 1
        p["houses"][house] += 1
        if party:
            p["parties"][party] += 1
        p["rows"].append((did, vote))
        p["dates"].append(date[:10])
    for (jur, pkey), p in people.items():
        name = p["names"].most_common(1)[0][0] if p["names"] else None
        slug = slugify(pkey)
        if not name or not slug:
            continue
        key = f"{jur}:{slug}"
        rows = p["rows"]
        entry = {
            "name": name,
            "party": p["parties"].most_common(1)[0][0] if p["parties"] else None,
            "jurisdiction": jur,
            "house": p["houses"].most_common(1)[0][0],
            "ayes": sum(1 for _, v in rows if v == "aye"),
            "noes": sum(1 for _, v in rows if v == "no"),
        }
        entry["divisions_total"] = entry["ayes"] + entry["noes"]
        entry["years"] = [int(min(p["dates"])[:4]), int(max(p["dates"])[:4])]
        entry.update(pick_sides(rows, divisions))
        out[key] = entry
        names.setdefault(name.lower(), []).append(key)
    return len(divisions), sum(1 for d in divisions.values() if d["polarity"])


def main():
    db = sqlite3.connect(DB, uri=True)
    out, names = {}, {}
    n_fed = export_federal(db, out, names)
    n_state, n_state_bill = export_state(db, out, names)
    out["_names"] = names

    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")
    people = [e for k, e in out.items() if k != "_names"]
    with_lists = sum(1 for e in people if e["for"] or e["against"])
    by_jur = Counter(e["jurisdiction"] for e in people)
    print(f"people {len(people)} ({dict(by_jur)}), with listed bills {with_lists}, "
          f"federal divisions parsed {n_fed}, state divisions {n_state} (bill questions {n_state_bill}), "
          f"names indexed {len(names)}", file=sys.stderr)


if __name__ == "__main__":
    main()
