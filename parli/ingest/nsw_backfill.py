"""Bounded NSW repair orchestration. All acquisition stays in nsw_hansard.

One day means one chamber on one sitting date. Fragment checkpoints and source
turns live in the selected SQLite, never in the legacy global progress file.
"""
from __future__ import annotations

import json
import math
import os
import re
import sqlite3
import time
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from parli.ingest import nsw_hansard as adapter
from parli.ingest.speaker_names import normalize_speaker

START = date(2022, 10, 1)
END = date(2025, 2, 28)
DEFAULT_CAP = 4
DEFAULT_BUDGET_S = 1200
# Conservative allowances, shared convention with the Senate lane. Actual
# publication stays in normal refresh; no KB calls are made by this stage.
PUBLISH_DOCS_PER_SECOND = 2
SYNC_PREPARATION_S = 120
CHAMBERS = {"nsw_la": "NSW Assembly", "nsw_lc": "NSW Council"}
DDL = """
CREATE TABLE IF NOT EXISTS nsw_backfill_days (
 toc_id TEXT PRIMARY KEY, date TEXT NOT NULL, chamber TEXT NOT NULL,
 status TEXT NOT NULL, uids TEXT NOT NULL, seconds REAL NOT NULL DEFAULT 0,
 inserted INTEGER NOT NULL DEFAULT 0, held INTEGER NOT NULL DEFAULT 0, error TEXT
);
CREATE TABLE IF NOT EXISTS nsw_backfill_fragments (
 toc_id TEXT NOT NULL, uid TEXT NOT NULL, xml BLOB NOT NULL, sha256 TEXT NOT NULL,
 PRIMARY KEY(toc_id,uid)
);
CREATE TABLE IF NOT EXISTS nsw_backfill_identity (
 source_member_id TEXT PRIMARY KEY, person_id TEXT NOT NULL, source_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nsw_backfill_turns (
 toc_id TEXT NOT NULL, uid TEXT NOT NULL, turn INTEGER NOT NULL,
 source_member_id TEXT NOT NULL, source_name TEXT NOT NULL, speech_id INTEGER,
 status TEXT NOT NULL, reason TEXT, body_hash TEXT NOT NULL,
 PRIMARY KEY(toc_id,uid,turn)
);
CREATE TABLE IF NOT EXISTS nsw_backfill_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS nsw_backfill_errors (
 error_id INTEGER PRIMARY KEY, toc_id TEXT, kind TEXT NOT NULL,
 detail TEXT NOT NULL, occurred_at TEXT NOT NULL
);
"""


def bounds(start, end):
    if not START <= start <= end <= END:
        raise ValueError(f"NSW backfill bounds must be inside {START} to {END}")


def check_load():
    if os.getloadavg()[1] >= 40:
        raise adapter.BudgetSpent("load5 at or above 40; NSW repair deferred")
    adapter.check_budget()


def day_counts(db, start=START, end=END):
    """All-source occupancy: an occupied chamber day is never appended to."""
    bounds(start, end)
    return {(ch, day): n for ch, day, n in db.execute(
        "SELECT chamber,date,COUNT(*) FROM speeches WHERE chamber IN ('nsw_la','nsw_lc') "
        "AND date BETWEEN ? AND ? GROUP BY chamber,date", (str(start), str(end)))}


def known_gaps(calendar, counts):
    """Watchdog hook: current zero-row source sittings, grouped by chamber/year.

    Pure and offline. Empty list means filled only after successful discovery;
    callers must never substitute [] for a discovery exception.
    """
    groups = {}
    for s in calendar:
        key = (s["chamber_code"], s["date"][:4])
        g = groups.setdefault(key, {"source": "nsw_hansard", "chamber": key[0],
                                   "year": int(key[1]), "expected_days": 0, "missing_dates": [],
                                   "status": "known, being filled"})
        g["expected_days"] += 1
        if counts.get((key[0], s["date"]), 0) == 0:
            g["missing_dates"].append(s["date"])
    return [g for _, g in sorted(groups.items()) if g["missing_dates"]]


def coverage_receipt(calendar, counts):
    return {"schema": 1, "source": "nsw_hansard", "discovery": "complete",
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "start": str(START), "end": str(END), "gaps": known_gaps(calendar, counts)}


def guard_coverage(calendar, counts, receipt):
    """An empty warning list must agree with the successfully discovered days."""
    if (receipt.get("discovery") != "complete" or receipt.get("schema") != 1
            or receipt.get("source") != "nsw_hansard"
            or receipt.get("gaps") != known_gaps(calendar, counts)):
        raise ValueError("NSW coverage guard: chamber-year gaps disagree with source sitting days")


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    tmp.replace(path)


def resolve_member(db, speech, chamber, day):
    """Use the source's personal member ID and named byline, never a surname guess.

    The source ID defines a NSW identity even when no canonical member is held.
    Reuse an existing member only on a unique full-name, chamber and dated match.
    No historical party is inferred from a member's present affiliation.
    """
    sid, raw = speech["speaker_id"], speech["speaker_name"]
    name = normalize_speaker(raw.rstrip(": "))
    if (not re.fullmatch(r"[0-9]+", sid) or not name or len(name.split()) < 2
            or len(name.split()[0].strip(".")) < 2
            or re.search(r"\b(speaker|president|clerk|chair|members)\b", raw, re.I)):
        return None, "source personal member ID or full byline unavailable"
    existing = db.execute("SELECT person_id,source_name FROM nsw_backfill_identity WHERE source_member_id=?", (sid,)).fetchone()
    if existing:
        if existing[1].casefold() != name.casefold():
            return None, "source member ID has conflicting names"
        return existing[0], None
    candidates = [r[0] for r in db.execute(
        "SELECT person_id,full_name FROM members WHERE chamber=? AND entered_house<=? "
        "AND (left_house IS NULL OR ?<left_house)", (chamber, day, day))
        if (normalize_speaker(r[1] or "") or "").casefold() == name.casefold()]
    if len(candidates) > 1:
        return None, "ambiguous existing canonical members"
    pid = candidates[0] if candidates else f"nsw_hansard_{sid}"
    member = db.execute("SELECT full_name FROM members WHERE person_id=?", (pid,)).fetchone()
    if member and (normalize_speaker(member[0] or "") or "").casefold() != name.casefold():
        return None, "source identity conflicts with stored member"
    if not member:
        db.execute("INSERT INTO members(person_id,full_name,chamber,state) VALUES (?,?,?,'nsw')", (pid, name, chamber))
    db.execute("INSERT INTO nsw_backfill_identity VALUES (?,?,?)", (sid, pid, name))
    return pid, None


def stage_day(db, sitting):
    """Checkpoint downloads, then commit the complete day and its provenance atomically."""
    toc, day, chamber = sitting["toc_doc_id"], sitting["date"], sitting["chamber_code"]
    record = db.execute("SELECT uids FROM nsw_backfill_days WHERE toc_id=?", (toc,)).fetchone()
    if record:
        uids = json.loads(record[0])
    else:
        check_load()
        uids = list(dict.fromkeys(adapter.get_fragment_uids(toc)))
        if not uids:
            raise ValueError(f"Empty NSW TOC: {toc}")
        db.execute("INSERT INTO nsw_backfill_days(toc_id,date,chamber,status,uids) VALUES (?,?,?,'pending',?)",
                   (toc, day, chamber, json.dumps(uids)))
        db.commit()
    for uid in uids:
        if db.execute("SELECT 1 FROM nsw_backfill_fragments WHERE toc_id=? AND uid=?", (toc, uid)).fetchone():
            continue
        check_load()
        body = adapter._api_get(f"{adapter.API_BASE}/daily/fragment/{uid}", accept="application/xml")
        root = ET.fromstring(body)
        if (root.findtext(".//hansard.header/date", "")[:10] != day
                or adapter.CHAMBER_MAP.get(root.findtext(".//hansard.header/chamber")) != chamber
                or root.find(".//fragment.text") is None):
            raise ValueError(f"NSW fragment date/chamber/body mismatch: {uid}")
        import hashlib
        db.execute("INSERT INTO nsw_backfill_fragments VALUES (?,?,?,?)",
                   (toc, uid, body, hashlib.sha256(body).hexdigest()))
        db.commit()
    check_load()
    inserted = held = eligible = publishable = 0
    # No partially published day: a budget/refusal/error rolls back only assembly,
    # retaining each successful download for the next night.
    try:
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM speeches WHERE chamber=? AND date=? LIMIT 1", (chamber, day)).fetchone():
            db.execute("UPDATE nsw_backfill_days SET status='occupied' WHERE toc_id=?", (toc,))
            db.commit()
            return {"inserted": 0, "held": 0, "eligible": 0, "status": "occupied"}
        # Owner DB occupancy wins over a stale completed checkpoint. Retained
        # fragments can restore a subsequently removed day without another fetch.
        db.execute("DELETE FROM nsw_backfill_turns WHERE toc_id=?", (toc,))
        seen = set()
        for uid in uids:
            check_load()
            body = db.execute("SELECT xml FROM nsw_backfill_fragments WHERE toc_id=? AND uid=?", (toc, uid)).fetchone()[0]
            for turn, speech in enumerate(adapter.extract_speeches_from_fragment(ET.fromstring(body))):
                check_load()
                digest = adapter.text_hash(speech["text"])
                key = (speech["speaker_id"], speech["speaker_name"], digest)
                pid, reason = resolve_member(db, speech, chamber, day)
                eligible += 1
                speech_id, status = None, "held"
                if not pid:
                    held += 1
                elif key in seen:
                    status = "duplicate"
                else:
                    seen.add(key)
                    cursor = db.execute(
                        "INSERT INTO speeches(person_id,speaker_name,party,electorate,chamber,date,topic,text,word_count,source,state) "
                        "VALUES (?,?,NULL,?,?,?,?,?,?,'nsw_hansard','nsw')",
                        (pid, speech["speaker_name"], speech["electorate"], chamber, day,
                         speech["topic"], speech["text"], len(speech["text"].split())))
                    speech_id, status = cursor.lastrowid, "inserted"
                    inserted += 1
                    publishable += int(len(speech["text"]) >= 200)
                db.execute("INSERT INTO nsw_backfill_turns VALUES (?,?,?,?,?,?,?,?,?)",
                           (toc, uid, turn, speech["speaker_id"], speech["speaker_name"], speech_id,
                            status, reason, digest))
        if not eligible:
            raise ValueError(f"NSW day yielded no eligible turns: {toc}")
        allowance = publishable / PUBLISH_DOCS_PER_SECOND
        adapter.check_budget(allowance + 5)
        status = "complete" if inserted else "held"
        db.execute("UPDATE nsw_backfill_days SET status=?,inserted=?,held=?,error=NULL WHERE toc_id=?",
                   (status, inserted, held, toc))
        db.commit()
        if adapter.REQUEST_DEADLINE is not None:
            adapter.REQUEST_DEADLINE -= allowance
    except BaseException:
        db.rollback()
        raise
    return {"inserted": inserted, "held": held, "eligible": eligible, "status": status,
            "publishable_rows": publishable, "publish_allowance_s": allowance}


def run(db, *, start=START, end=END, cap=DEFAULT_CAP, budget_s=DEFAULT_BUDGET_S,
        coverage_path=None, receipt_path=None):
    bounds(start, end)
    if cap < 0 or not math.isfinite(budget_s) or budget_s <= 0:
        raise ValueError("NSW cap must be non-negative and budget must be positive and finite")
    began = time.monotonic()
    previous_deadline = adapter.REQUEST_DEADLINE
    adapter.REQUEST_DEADLINE = began + budget_s
    result = {"source": "nsw_hansard", "cap": cap, "budget_s": budget_s,
              "days": [], "inserted": 0, "stop": "cap", "missing_before": None, "missing_left": None,
              "publish_allowance_s": 0, "sync_preparation_allowance_s": 0}
    db.executescript(DDL)
    # SQLite's scan is included in the wall budget. Do not leave its handler set.
    current = None
    try:
        check_load()
        refused = db.execute("SELECT value FROM nsw_backfill_state WHERE key='refused'").fetchone()
        if refused:
            raise adapter.source_http.SourceRefused(adapter.API_BASE, "NSW repair remains paused: " + refused[0])
        calendar = adapter.get_sitting_days(start, end)
        db.set_progress_handler(lambda: int(time.monotonic() >= adapter.REQUEST_DEADLINE), 10000)
        try:
            counts = day_counts(db, start, end)
        finally:
            db.set_progress_handler(None, 0)
        missing = [s for s in calendar if counts.get((s["chamber_code"], s["date"]), 0) == 0]
        result["missing_before"] = result["missing_left"] = len(missing)
        result["coverage_gaps"] = known_gaps(calendar, counts)
        for gap in result["coverage_gaps"]:
            print(f"NSW coverage guard: {CHAMBERS[gap['chamber']]} {gap['year']}: "
                  f"{len(gap['missing_dates'])} sitting days missing; known, being filled", flush=True)
        # Nightly emits the post-normal-refresh, pre-backfill view. New rows can
        # enter normal publication next night before their coverage warning clears.
        if coverage_path:
            if (start, end) != (START, END):
                raise ValueError("Coverage requires the whole reviewed NSW interval")
            coverage = coverage_receipt(calendar, counts)
            guard_coverage(calendar, counts, coverage)
            write_json(coverage_path, coverage)
        statuses = dict(db.execute("SELECT toc_id,status FROM nsw_backfill_days"))
        todo = [s for s in missing if statuses.get(s["toc_doc_id"]) != "held"]
        result["held_days"] = len(missing) - len(todo)
        if todo and cap:
            result["sync_preparation_allowance_s"] = SYNC_PREPARATION_S
            adapter.REQUEST_DEADLINE -= SYNC_PREPARATION_S
        for sitting in todo[:cap]:
            check_load()
            current = sitting
            started = time.monotonic()
            try:
                day_result = stage_day(db, sitting)
            finally:
                db.execute("UPDATE nsw_backfill_days SET seconds=seconds+? WHERE toc_id=?",
                           (time.monotonic() - started, sitting["toc_doc_id"]))
                db.commit()
            result["days"].append({"date": sitting["date"], "chamber": sitting["chamber_code"],
                                   "toc_id": sitting["toc_doc_id"], "seconds": round(time.monotonic()-started, 3), **day_result})
            result["inserted"] += day_result["inserted"]
            result["publish_allowance_s"] += day_result.get("publish_allowance_s", 0)
            result["missing_left"] -= int(day_result["inserted"] > 0)
            print(json.dumps(result["days"][-1]), flush=True)
        if len(todo) <= cap:
            result["stop"] = "complete" if not result["missing_left"] else "held"
        nights = math.ceil(len(todo) / cap) if cap else None
        result["estimated_nights_before"] = nights
        result["estimated_completion_if_next_night"] = str(date.today() + timedelta(days=nights)) if nights else None
    except adapter.BudgetSpent as error:
        result["stop"], result["reason"] = "budget", str(error)
    except sqlite3.OperationalError:
        if time.monotonic() < adapter.REQUEST_DEADLINE:
            raise
        result["stop"] = "budget"
    except BaseException as error:
        detail = getattr(error, "reason", None) or str(error)
        result["stop"], result["error"] = "error", detail
        db.execute("INSERT INTO nsw_backfill_errors(toc_id,kind,detail,occurred_at) VALUES (?,?,?,?)",
                   (current["toc_doc_id"] if current else None, type(error).__name__, detail,
                    datetime.now(timezone.utc).isoformat()))
        db.commit()
        if isinstance(error, adapter.source_http.SourceRefused):
            result["stop"] = "source-refused"
            # Next nightly run stays offline until the refusal has been reviewed.
            if not db.execute("SELECT 1 FROM nsw_backfill_state WHERE key='refused'").fetchone():
                db.execute("INSERT INTO nsw_backfill_state VALUES ('refused',?)", (detail,))
                db.commit()
        if current:
            db.execute("UPDATE nsw_backfill_days SET error=? WHERE toc_id=?", (detail, current["toc_doc_id"]))
            db.commit()
        raise
    finally:
        db.set_progress_handler(None, 0)
        adapter.REQUEST_DEADLINE = previous_deadline
        result["seconds"] = round(time.monotonic() - began, 3)
        if receipt_path:
            write_json(receipt_path, result)
        print("NSW backfill " + json.dumps(result), flush=True)
    return result
