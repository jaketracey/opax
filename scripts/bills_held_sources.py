#!/usr/bin/env python3
"""Bill progress from the sources the nightly already holds, while ParlInfo is paused.

A field-only overlay on the retained bills snapshot (portal/public/bills), in the
style of `export_bills.py --fill-endings`: it never runs a full export, fetches
nothing and never joins on a title for publication. It adds, for bills we hold:

  Royal Assent    ext_frl_acts rows whose originatingBillUri names the bill
                  (bill_code -> au-federal-<code>), for Acts made after the day
                  ParlInfo was last read (the index's generated_at day). The
                  bill gains the Act, its FRL source row and a royal_assent
                  stage; a bill still before parliament becomes passed.
  Hansard stages  first, second and third readings in each house, from the
                  OpenAustralia XML the nightly caches, where the section's
                  <bills> element names the bill by its official id, dated
                  after that same day.
  divisions       bill_links rows with the exact official-id rule to a division
                  that already has a published page.

Everything it does not publish goes to a review list outside git: official ids
we do not hold, exact-title matches (each flagged with its basis, never
published), a third reading that was negatived or not recorded as read, a second
reading section with a negatived question and no record of the bill read a
second time, readings on or after a chamber-day that could not be read, an Act
for a bill recorded dead. The list also names published rows a newer export
still lacks more than 14 days after their date (export_lacks_event_14d), so a
person checks them; those rows stay published.

Rows it adds carry `source` ("hansard" or "frl"). FRL rows also carry
`retrieved`, the day (Sydney) the Act's metadata was downloaded, which the CC BY
4.0 attribution states. The index gains `progress_as_at` and
`meta.held_sources`; `generated_at` never moves. `progress_as_at` claims only
what both held sources cover: the earlier of the last OpenAustralia chamber-day
read without a gap and the day the register was last read, and never earlier
than the Sydney day of `generated_at`. It is the progress date only. A bill's
`status_as_of` stays its latest recorded event.

When a full export has run (ParlInfo back), a row this overlay published at
HEAD is retired only when the export's own record holds the same event: the
same stage, house and date, or for an FRL Royal Assent any Royal Assent
(bills_registry/held_rows.py, the rule bills_guard allows removals by). Every
other row is carried forward, whatever its date, because ParlInfo may not have
caught up. A row the export still lacks more than 14 days after its date stays
published and is listed for review (export_lacks_event_14d). Acts and FRL
sources are carried unless the file already holds the same URI.

Read-only on the database. Writes only the bill files whose content changed, in
their own layout, then the index if it changed.
"""
from __future__ import annotations

import argparse
import collections
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))
import export_bills as eb  # noqa: E402
from bills_registry.held_rows import (OVERLAY_SOURCES as OWN_SOURCES, REVIEW_AFTER_DAYS,  # noqa: E402
                                      days_behind, export_holds, signature)
from corrections.apply import apply as apply_corrections, load as load_corrections  # noqa: E402
from parli.ingest.tvfy_bill_links import official_ref  # noqa: E402

SYDNEY = ZoneInfo("Australia/Sydney")
OA_SCRAPED = "https://data.openaustralia.org.au/scrapedxml"
FOLDERS = {"representatives": "representatives_debates", "senate": "senate_debates"}
DEFAULT_OA_STAGE = Path(os.environ.get("OPAX_OA_STAGE") or Path.home() / ".cache/autoresearch/oa-feed")
# The heading's last segment, exactly. Anything else (consideration in detail,
# committee of the whole, messages) is not read as a stage.
HANSARD_STAGES = {
    "first reading": "introduced",
    "introduction and first reading": "introduced",
    "introduction": "introduced",
    "second reading": "second_reading",
    "third reading": "third_reading",
}
EXACT_LINK_RULE = "tvfy-official-id"
# A bill still before parliament may become passed on an Act; anything else is review.
ALIVE_STATUSES = {None, "before_parliament", "before_house", "introduced"}
FRL_LICENCE = "CC BY 4.0"
WS = re.compile(r"\s+")
HELD_KEY = re.compile(r"^au-federal-[rs]\d+$")


def log(msg: str) -> None:
    print(f"[held-sources] {msg}", file=sys.stderr, flush=True)


def plain(node) -> str:
    return WS.sub(" ", " ".join(t.strip() for t in node.itertext())).strip()


def heading_stage(text: str) -> str | None:
    """The stage the heading's last segment names, or None."""
    text = WS.sub(" ", text or "").strip()
    last = re.split(r"\s*;\s*|\s+[-–—]\s+", text)[-1].strip().casefold()
    return HANSARD_STAGES.get(last)


def heading_title(major: str, minor: str) -> str:
    """The bill title a heading names, for the review list only: the part of a
    minor heading before its stage ("X Bill 2026; Second Reading"), else a
    major heading that is itself a bill title."""
    if minor and ";" in minor:
        return minor.rsplit(";", 1)[0].strip()
    return major if re.search(r"\bbill\b", major or "", re.I) else ""


def sydney_day(stamp: str | None) -> str | None:
    """A fetched_at timestamp as the Sydney calendar day, or None."""
    if not stamp:
        return None
    try:
        moment = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(SYDNEY).date().isoformat()


def valid_day(value: str | None) -> str | None:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat() if value else None
    except ValueError:
        return None


# --- Hansard ----------------------------------------------------------------


def hansard_sections(raw: bytes, house: str, day: str) -> list[dict]:
    """Every heading section of one chamber-day whose heading names a stage."""
    if not raw.strip():
        return []
    root = ET.fromstring(raw)
    if root.tag != "debates":
        raise ValueError(f"{house} {day}: expected OpenAustralia debates XML")
    sections, current = [], None
    major = minor = ""
    for node in root:
        if node.tag in ("major-heading", "minor-heading"):
            if current and current["stage"]:
                sections.append(current)
            if node.tag == "major-heading":
                major, minor = plain(node), ""
            else:
                minor = plain(node)
            current = {"house": house, "date": day, "stage": heading_stage(minor or major),
                       "heading": " - ".join(t for t in (major, minor) if t),
                       "title": heading_title(major, minor), "bills": [], "text": [], "lost_division": False}
            continue
        if current is None:
            continue
        if node.tag == "bills":
            current["bills"] += [(b.get("id"), b.get("url"), plain(b)) for b in node.findall("bill")]
        elif node.tag == "division":
            current["bills"] += [(b.get("id"), b.get("url"), plain(b)) for b in node.findall("./bills/bill")]
            counts = node.find("divisioncount")
            if counts is not None and int(counts.get("noes") or 0) > int(counts.get("ayes") or 0):
                current["lost_division"] = True
        elif node.tag == "speech":
            current["text"].append(plain(node))
    if current and current["stage"]:
        sections.append(current)
    return sections


def bill_ref(bill_id: str | None, url: str | None) -> str | None:
    """The one official id a <bills> element names, or None. Either its id or its
    URL is enough on its own; when both name an official id they must be the
    same one, or the element goes to review."""
    refs = {official_ref(bill_id), official_ref(url)} - {None}
    return next(iter(refs)) if len(refs) == 1 else None


# The clerk's record after the question is agreed ("Bill read a second time."),
# never the motion itself ("That this bill be now read a second time").
READ_AGAIN = {
    "second_reading": re.compile(r"\bbills? (?:was |were )?read a second time\b"),
    "third_reading": re.compile(r"\bbills? (?:was |were )?read a third time\b"),
}


def reading_problem(section: dict) -> str | None:
    """Why a second or third reading section is not published as a reading.

    A third reading is published only as the house passing the bill: recorded
    read a third time, with nothing negatived. A second reading section is a day
    of the second reading debate, as ParlInfo records it, unless a question in
    it was negatived and the section does not record the bill read a second
    time: that may be the second reading itself voted down, so it is reviewed."""
    stage = section["stage"]
    if stage not in READ_AGAIN:
        return None
    text = " ".join(section["text"]).casefold()
    negatived = section["lost_division"] or "negatived" in text or "resolved in the negative" in text
    agreed = READ_AGAIN[stage].search(text)
    if stage == "third_reading":
        if negatived:
            return "a question in the third reading section was negatived"
        if not agreed:
            return "the section does not record the bill read a third time"
        return None
    if negatived and not agreed:
        return ("a question in the second reading section was negatived and the section does not "
                "record the bill read a second time")
    return None


def hansard_events(stage_dir: Path, since: str, held: dict[str, dict]) -> tuple[list[dict], list[dict], list[str]]:
    """(stage rows by bill, review entries, chamber-days read) for days after `since`.

    A chamber-day whose XML does not parse goes to review. Rows dated on or after
    the first such day are held back (to review, until the day reads) and the
    days read stop before it, so nothing is published past a gap in the read."""
    rows, review, days, failed = [], [], [], []
    by_title = collections.defaultdict(list)
    for key, title in held.items():
        if title:
            by_title[eb.norm(title)].append(key)
    for house, folder in FOLDERS.items():
        directory = stage_dir / "raw" / folder
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.xml")):
            day = valid_day(path.stem)
            if not day or day != path.stem or day <= since:
                continue
            try:
                sections = hansard_sections(path.read_bytes(), house, day)
            except (ET.ParseError, ValueError) as exc:
                review.append({"source": "hansard", "kind": "unreadable_day", "house": house, "date": day,
                               "basis": f"the cached XML did not parse ({type(exc).__name__})"})
                failed.append(day)
                continue
            days.append(day)
            url = f"{OA_SCRAPED}/{folder}/{day}.xml"
            for section in sections:
                titled = by_title.get(eb.norm(section["title"]), []) if section["title"] else []
                base = {"source": "hansard", "house": house, "date": day, "stage": section["stage"],
                        "heading": section["heading"], "url": url}
                refs = {}
                for bill_id, bill_url, title in section["bills"]:
                    ref = bill_ref(bill_id, bill_url)
                    if ref:
                        refs.setdefault(ref, title)
                    else:
                        review.append({**base, "kind": "unreadable_bill_id", "id": bill_id, "title": title,
                                       "basis": "the <bills> element's id and URL do not name one official id"})
                if not refs:
                    if titled or section["title"]:
                        review.append({**base, "kind": "title_only", "title": section["title"], "candidates": titled,
                                       "basis": "exact normalised title; the Hansard section names no official bill id"})
                    continue
                problem = reading_problem(section)
                for ref, title in sorted(refs.items()):
                    key = f"au-federal-{ref}"
                    if key not in held:
                        candidates = by_title.get(eb.norm(title), [])
                        review.append({**base, "kind": "unknown_bill_id", "id": ref, "title": title,
                                       "candidates": candidates,
                                       "basis": "official id not among the held bills"
                                       + ("; exact normalised title matches a held bill" if candidates else "")})
                    elif problem:
                        review.append({**base, "kind": f"{section['stage']}_not_published", "bill": key, "basis": problem})
                    else:
                        rows.append({"bill": key, "stage": section["stage"], "date": day, "house": house, "url": url})
    if failed:
        gap = min(failed)
        seen = set()
        for row in rows:
            if row["date"] >= gap and (sig := (row["bill"], row["stage"], row["house"], row["date"])) not in seen:
                seen.add(sig)
                review.append({"source": "hansard", "kind": "held_after_unreadable_day", "bill": row["bill"],
                               "stage": row["stage"], "house": row["house"], "date": row["date"], "url": row["url"],
                               "basis": f"dated on or after {gap}, a chamber-day that did not read; "
                                        "published once that day reads"})
        rows = [r for r in rows if r["date"] < gap]
        days = [d for d in days if d < gap]
    return rows, review, days


# --- database ---------------------------------------------------------------


def filtered_corrections(dataset: str, ids: set[str]) -> list[dict]:
    """Reviewed corrections whose record this read holds. The full export
    applies all of them over the whole table; this read sees a subset."""
    return [entry for entry in load_corrections(dataset) if entry["id"] in ids]


def frl_acts(db, since: str) -> list[dict]:
    """Acts made after `since` that name a bill code, with reviewed assent corrections."""
    if not eb.has_table(db, "ext_frl_acts"):
        log("ext_frl_acts is absent; no Royal Assent read")
        return []
    acts = [{"act_id": r["act_id"], "title": r["name"], "assent_date": r["making_date"],
             "bill_code": (r["bill_code"] or "").lower(), "retrieved": sydney_day(r["fetched_at"])}
            for r in db.execute("SELECT act_id, name, making_date, bill_code, fetched_at FROM ext_frl_acts "
                                "WHERE bill_code IS NOT NULL AND name IS NOT NULL AND making_date > ? "
                                "ORDER BY making_date, act_id", (since,))]
    entries = filtered_corrections("bill_acts", {a["act_id"] for a in acts})
    if entries:
        apply_corrections("bill_acts", acts, key="act_id", entries=entries)
    return [a for a in acts if valid_day(a["assent_date"]) and re.fullmatch(r"[rs]\d+", a["bill_code"])]


def frl_read_day(db) -> str | None:
    """The Sydney day the register was last read: every answered request
    rewrites its Acts' fetched_at (INSERT OR REPLACE), nightly or weekly."""
    if db is None or not eb.has_table(db, "ext_frl_acts"):
        return None
    row = db.execute("SELECT MAX(fetched_at) FROM ext_frl_acts").fetchone()
    return sydney_day(row[0]) if row else None


def exact_division_links(db) -> dict[str, list[str]]:
    """bill -> division keys, exact official-id rule only, reviewed corrections applied."""
    out: dict[str, list[str]] = collections.defaultdict(list)
    if not eb.has_table(db, "bill_links"):
        log("bill_links is absent; no division links read")
        return out
    rows = [{"id": f"{r['bill_key']}|division|{r['target_key']}", "bill_key": r["bill_key"], "target_key": r["target_key"]}
            for r in db.execute("SELECT bill_key, target_key FROM bill_links WHERE kind='division' "
                                "AND rule=? AND COALESCE(audited,'') != 'wrong'", (EXACT_LINK_RULE,))]
    entries = filtered_corrections("bill_links", {r["id"] for r in rows})
    if entries:
        apply_corrections("bill_links", rows, key="id", entries=entries)
    for r in rows:
        if r["target_key"] not in out[r["bill_key"]]:
            out[r["bill_key"]].append(r["target_key"])
    return out


# --- applying ---------------------------------------------------------------


def insert_row(rows: list[dict], row: dict) -> None:
    """Insert after the last dated row on or before the new row's date."""
    at = len(rows)
    for i in range(len(rows) - 1, -1, -1):
        if (rows[i].get("date") or "") <= row["date"]:
            at = i + 1
            break
        at = i
    rows.insert(at, row)


def own_rows(doc: dict) -> list[dict]:
    return [r for r in doc.get("key_dates") or [] if r.get("source") in OWN_SOURCES]


def carry_forward(doc: dict, head: dict | None, since: str) -> tuple[int, int, list[dict]]:
    """Re-add the rows, Acts and FRL sources this overlay published at HEAD and
    the current file lacks (a full export rewrote it). (rows carried, rows
    retired, review entries).

    A row is retired only when the export's own record holds the same event
    (held_rows.export_holds): the same stage, house and date, or for an FRL
    Royal Assent any Royal Assent, so a Royal Assent is never duplicated. Every
    other row is carried whatever its date: `since`, the export's own day, says
    when ParlInfo was read, not that it had recorded everything by then. A row
    the export still lacks more than REVIEW_AFTER_DAYS after its date stays
    published and is listed for review. Acts and FRL sources are carried unless
    the file already holds the same URI."""
    carried = retired = 0
    rows = doc.setdefault("key_dates", [])
    if head:
        have = {signature(r) for r in rows}
        for row in own_rows(head):
            if not row.get("date"):
                continue
            if export_holds(rows, row):
                retired += 1
                continue
            if signature(row) in have:  # still in the file: no export rewrote it
                continue
            insert_row(rows, dict(row))
            have.add(signature(row))
            carried += 1
        acts = doc.setdefault("acts", [])
        for act in head.get("acts") or []:
            if act.get("retrieved") and act.get("frl_uri") and all(a.get("frl_uri") != act["frl_uri"] for a in acts):
                acts.append(dict(act))
        sources = doc.setdefault("sources", [])
        for source in head.get("sources") or []:
            if source.get("retrieved") and source.get("url") and all(s.get("url") != source["url"] for s in sources):
                sources.append(dict(source))
    review = []
    for row in own_rows(doc):
        if row.get("date") and (behind := days_behind(row["date"], since)) > REVIEW_AFTER_DAYS:
            review.append({"source": row["source"], "kind": "export_lacks_event_14d", "bill": doc["key"],
                           "stage": row.get("stage"), "house": row.get("house"), "date": row["date"],
                           "basis": f"the export of {since} does not record this event {behind} days after it; "
                                    "the row stays published until the export holds it or a person corrects it"})
    return carried, retired, review


def apply_assent(doc: dict, act: dict) -> str | None:
    """Add one Act to a held bill. None when applied (or already present), else
    the reason it goes to review instead."""
    status = doc.get("status")
    if status not in ALIVE_STATUSES and status != "passed":
        return f"the bill is recorded {status}"
    uri = f"https://www.legislation.gov.au/{act['act_id']}"
    retrieved = act["retrieved"]
    acts = doc.setdefault("acts", [])
    if all(a.get("frl_uri") != uri for a in acts):
        acts.append({"title": act["title"], "frl_uri": uri, "assent_date": act["assent_date"],
                     **({"retrieved": retrieved} if retrieved else {})})
    sources = doc.setdefault("sources", [])
    if all(s.get("url") != uri for s in sources):
        sources.append({"kind": "frl_act", "url": uri, "document_date": act["assent_date"],
                        "licence": FRL_LICENCE, **({"retrieved": retrieved} if retrieved else {})})
    rows = doc.setdefault("key_dates", [])
    if not any(r.get("stage") == "royal_assent" for r in rows):
        insert_row(rows, {"stage": "royal_assent", "date": act["assent_date"], "house": None, "url": uri,
                          "source": "frl", **({"retrieved": retrieved} if retrieved else {})})
    return None


def settle_status(doc: dict) -> None:
    """A bill with an FRL-sourced Royal Assent is passed, as at that day at least."""
    assent = [r["date"] for r in doc.get("key_dates") or []
              if r.get("source") == "frl" and r.get("stage") == "royal_assent" and r.get("date")]
    if not assent:
        return
    if doc.get("status") in ALIVE_STATUSES:
        doc["status"] = "passed"
    if doc.get("status") == "passed" and (doc.get("status_as_of") or "") < max(assent):
        doc["status_as_of"] = max(assent)


def read_head(directory: Path) -> dict[str, dict]:
    """HEAD's bill files that carry overlay rows; {} outside a git checkout."""
    try:
        prefix = subprocess.run(["git", "rev-parse", "--show-prefix"], cwd=directory, capture_output=True,
                                text=True, check=True).stdout.strip()
        blob = subprocess.run(["git", "archive", "HEAD", "--", "."], cwd=directory, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        log("no git HEAD for the bills directory; nothing to carry forward")
        return {}
    out = {}
    with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
        for member in archive:
            name = member.name[len(prefix):] if member.name.startswith(prefix) else member.name
            if not member.isfile() or "/" in name or not name.endswith(".json") or name == "index.json":
                continue
            raw = archive.extractfile(member).read()
            if b'"source": "hansard"' in raw or b'"source": "frl"' in raw or b'"retrieved"' in raw \
                    or b'"source":"hansard"' in raw or b'"source":"frl"' in raw:
                doc = json.loads(raw)
                out[doc.get("key")] = doc
    return out


def overlay(directory: Path, divisions_dir: Path, db, stage_dir: Path, today: str,
            head: dict[str, dict] | None = None) -> dict:
    directory, divisions_dir = Path(directory), Path(divisions_dir)
    docs, previous = eb.retained_bills(directory)
    index_path = directory / "index.json"
    index_text = index_path.read_text()
    index = json.loads(index_text)
    snapshot = valid_day(index.get("generated_at"))
    if not snapshot:
        raise ValueError("the bills index has no generated_at day")
    # Events after `snapshot` (generated_at's own date) are new to the export.
    # The progress date never reads earlier than the export's Sydney day, the
    # day the site's "as at" line shows for it.
    floor = sydney_day(index["generated_at"]) or snapshot
    by_key = {d["key"]: d for d in docs}
    held = {k: d.get("title") for k, d in by_key.items() if HELD_KEY.match(k)}
    review: list[dict] = []
    counts = collections.Counter()

    head = head or {}
    for doc in docs:
        carried, retired, lagging = carry_forward(doc, head.get(doc["key"]), snapshot)
        counts["rows_carried"] += carried
        counts["rows_retired"] += retired
        review += lagging

    # Royal Assent from FRL, by exact originatingBillUri bill code.
    applied_acts = []
    for act in frl_acts(db, snapshot) if db is not None else []:
        key = f"au-federal-{act['bill_code']}"
        base = {"source": "frl", "act_id": act["act_id"], "title": act["title"], "date": act["assent_date"]}
        if key not in by_key:
            review.append({**base, "kind": "unknown_bill_id", "id": act["bill_code"],
                           "basis": "originatingBillUri names a bill not among the held bills"})
            continue
        before = json.dumps(by_key[key], sort_keys=True)
        problem = apply_assent(by_key[key], act)
        if problem:
            review.append({**base, "kind": "assent_not_published", "bill": key, "basis": problem})
            continue
        if json.dumps(by_key[key], sort_keys=True) != before:
            applied_acts.append({"act_id": act["act_id"], "bill": key, "assent_date": act["assent_date"],
                                 "retrieved": act["retrieved"]})

    # Hansard stages, by exact <bills> id.
    stage_rows, stage_review, days = (hansard_events(stage_dir, snapshot, held)
                                      if stage_dir and (stage_dir / "raw").is_dir() else ([], [], []))
    if not days:
        log(f"no OpenAustralia chamber-days after {snapshot} in {stage_dir}")
    review += stage_review
    for row in stage_rows:
        doc = by_key[row.pop("bill")]
        rows = doc.setdefault("key_dates", [])
        if any(signature(r) == signature(row) for r in rows):
            continue
        insert_row(rows, {**row, "source": "hansard"})
        counts["stages_added"] += 1

    # Division links: exact id rule, to divisions that already have a page.
    links = exact_division_links(db) if db is not None else {}
    wanted = {}
    for key, targets in links.items():
        doc = by_key.get(key)
        if not doc or not HELD_KEY.match(key):
            continue
        have = {d.get("key") for d in doc.get("divisions") or []}
        for target in targets:
            if target in have:
                continue
            if not (divisions_dir / f"division-{target}.json").exists():
                counts["division_links_unpublished"] += 1
                continue
            eb.division_record(divisions_dir, target)  # identity check before anything is written
            wanted.setdefault(key, []).append(target)
    if wanted:
        timeline = eb.PartyTimeline.load(db)
        facts = eb.load_divisions(db, timeline)
        for key, targets in wanted.items():
            doc = by_key[key]
            for target in targets:
                if target not in facts:
                    counts["division_links_without_record"] += 1
                    continue
                entry = {k: v for k, v in facts[target].items() if not k.startswith("_")}
                # Shared facts from the published page, as --refresh-division-facts does.
                eb.reconcile_divisions([{"divisions": [entry]}], divisions_dir)
                doc.setdefault("divisions", []).append(entry)
                counts["division_links_added"] += 1
            doc["divisions"].sort(key=lambda d: (d.get("date") or "", d.get("key") or ""))

    for doc in docs:
        settle_status(doc)

    # Write: bill files in their own layout, then the index.
    changed = 0
    for doc in docs:
        if doc != json.loads(previous[doc["key"]]):
            (directory / f"{doc['key']}.json").write_text(eb.same_layout(previous[doc["key"]], doc))
            changed += 1
    for row in index["bills"]:
        doc = by_key.get(row["key"])
        if not doc:
            continue
        for field, value in (("status", doc.get("status")), ("status_as_of", doc.get("status_as_of")),
                             ("divisions", len(doc.get("divisions") or [])), ("acts", len(doc.get("acts") or []))):
            if field in row:
                row[field] = value
    # Only what both sources cover: the earlier of Hansard read without a gap and
    # the register's last read, never before the export's own day.
    hansard_latest = max(days) if days else None
    frl_read = frl_read_day(db)
    progress = max(floor, min(hansard_latest or floor, frl_read or floor))
    # Straight after generated_at, which it never replaces.
    ordered = {}
    for field, value in index.items():
        if field != "progress_as_at":
            ordered[field] = value
        if field == "generated_at":
            ordered["progress_as_at"] = progress
    index = ordered
    index.setdefault("meta", {})["held_sources"] = {
        "since": snapshot,
        "progress_as_at": progress,
        "rule": "Royal Assent from the Federal Register of Legislation by exact originatingBillUri; "
                "Hansard first, second and third readings by the exact bill id in OpenAustralia's XML; "
                "divisions by the exact official-id link. Title matches are never published.",
        "hansard_days": len(days),
        "hansard_latest": hansard_latest,
        "frl_read": frl_read,
        "frl_licence": "CC BY 4.0",
    }
    if index_path.read_text() != (new_index := eb.same_layout(index_text, index)):
        index_path.write_text(new_index)
    summary = {
        "run_date": today, "since": snapshot, "progress_as_at": progress, "bills_changed": changed,
        "hansard_days": len(days), "hansard_latest": hansard_latest, "frl_read": frl_read,
        "stages_added": counts["stages_added"],
        "assents_added": applied_acts, "division_links_added": counts["division_links_added"],
        "division_links_unpublished": counts["division_links_unpublished"],
        "division_links_without_record": counts["division_links_without_record"],
        "rows_carried": counts["rows_carried"], "rows_retired": counts["rows_retired"],
        "review": len(review), "review_kinds": dict(collections.Counter(r["kind"] for r in review)),
    }
    return {"summary": summary, "review": review}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bills", type=Path, default=Path("portal/public/bills"))
    ap.add_argument("--divisions", type=Path, default=Path("portal/public/divisions"))
    ap.add_argument("--db", default=eb.DB_URI, help="read-only sqlite URI")
    ap.add_argument("--oa-stage", type=Path, default=DEFAULT_OA_STAGE)
    ap.add_argument("--review-out", type=Path, help="review list (outside git)")
    ap.add_argument("--summary-out", type=Path, help="one-line summary for the nightly status")
    ap.add_argument("--today", default=datetime.now(SYDNEY).date().isoformat())
    ap.add_argument("--no-carry", action="store_true", help="do not carry this overlay's HEAD rows forward")
    args = ap.parse_args()
    db = eb.connect(args.db)
    try:
        head = {} if args.no_carry else read_head(args.bills)
        result = overlay(args.bills, args.divisions, db, args.oa_stage.expanduser(), args.today, head)
    finally:
        db.close()
    summary, review = result["summary"], result["review"]
    if args.review_out:
        args.review_out.parent.mkdir(parents=True, exist_ok=True)
        args.review_out.write_text(json.dumps({"run_date": args.today, "since": summary["since"], "entries": review},
                                              ensure_ascii=False, indent=1) + "\n")
    if args.summary_out:
        args.summary_out.parent.mkdir(parents=True, exist_ok=True)
        args.summary_out.write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
    acts = ", ".join(f"{a['act_id']} ({a['bill']}, {a['assent_date']})" for a in summary["assents_added"]) or "none"
    print(f"bills held sources: {len(summary['assents_added'])} Royal Assents, {summary['stages_added']} Hansard stages, "
          f"{summary['division_links_added']} division links, {summary['rows_carried']} rows carried, "
          f"{summary['rows_retired']} retired; "
          f"{summary['bills_changed']} bill files changed; {summary['review']} for review; "
          f"progress as at {summary['progress_as_at']} (since {summary['since']}, {summary['hansard_days']} chamber-days read, "
          f"Hansard to {summary['hansard_latest'] or 'none'}, register read {summary['frl_read'] or 'never'})")
    print(f"bills held sources: FRL Acts applied: {acts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
