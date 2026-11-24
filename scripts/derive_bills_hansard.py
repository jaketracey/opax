#!/usr/bin/env python3
"""Federal bills recorded in Hansard and divisions that the registry export does not hold yet.

The registry export (scripts/export_bills.py) reads the Parliament's bill pages. While that
source is paused, bills keep being introduced, debated and divided on, and both of those are
already held: the day's Hansard as OpenAustralia publishes it (the staged XML the divisions
refresh reads, parli/ingest/openaustralia_xml.py) and the published division records
(portal/public/divisions). This script writes a bill record from those two alone.

    python3 scripts/derive_bills_hansard.py --stage ~/.cache/autoresearch/oa-feed
    python3 scripts/derive_bills_hansard.py            # no stage: rebuild from what is published

Nothing is fetched, no model is called and nothing is inferred beyond the rules written here:

  * A bill is taken only from a `<bills><bill id=...>` element under a "BILLS" heading whose own
    text names the bill and a known stage ("...; Second Reading"). The id is the one Hansard
    prints (r7566); it is never made up, and a bill with no printed id is left out.
  * The title is the element's text, exactly.
  * `introduced` and `originating_house` are written only when the earliest recorded day, in one
    chamber, holds a "First Reading" heading or the mover's own words under "Second Reading"
    ("I move: That this bill be now read a second time."). Otherwise both stay null.
  * Sponsor, portfolio, summary, bill text and Acts are never written: these sources do not
    state them.
  * No link points at the Parliament's sites. Every link is the Hansard day file that was read
    or an OPAX division record.

Each record says where it came from: `record_source` on the index row and the bill file, a
`provenance` block on the file, and the status `recorded_in_parliament` (the registry's own
statuses are never claimed for it).

Replacement rule: a registry record always wins. A recorded bill is dropped when the registry
holds its key, or a bill whose normalised title (which carries the year) is the same.
Titles already in the index, exposure drafts included, are never duplicated.

Fail closed: a record that breaks a rule here is not written, and the copy already published
(if any) is kept. Nothing is written at all unless every file to be written has passed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_bills as eb  # noqa: E402

RECORD_SOURCE = "hansard_divisions"
STATUS = "recorded_in_parliament"
LABEL = "Recorded from Hansard and divisions. The Parliament's bill page is not yet loaded."
BASIS = ("Hansard as published by OpenAustralia (data.openaustralia.org.au) and OPAX division records. "
         "Sponsor, portfolio, bill text and summary are not in these sources.")
SOURCE_BASE = "https://data.openaustralia.org.au/scrapedxml"
FOLDERS = {"representatives": "representatives_debates", "senate": "senate_debates"}
DEFAULT_STAGE = Path(os.environ.get("OPAX_OA_STAGE") or Path.home() / ".cache/autoresearch/oa-feed")

# A stage exactly as Hansard prints it after the semicolon -> the registry's token for it.
# A heading with any other ending is not a recorded stage and is left out.
STAGES = {
    "first reading": "first_reading",
    "second reading": "second_reading",
    "consideration in detail": "consideration_in_detail",
    "in committee": "in_committee",
    "third reading": "third_reading",
    "consideration of senate message": "consideration_of_senate_message",
    "consideration of house of representatives message": "consideration_of_house_message",
    "report from federation chamber": "report_from_federation_chamber",
    "reference to federation chamber": "reference_to_federation_chamber",
    "reference to committee": "reference_to_committee",
    "report from committee": "report_from_committee",
    "direction to committee": "direction_to_committee",
    "limitation of debate": "limitation_of_debate",
}
STAGE_ORDER = {token: i for i, token in enumerate(STAGES.values())}
HOUSE_ORDER = {"representatives": 0, "senate": 1}

BILL_ID = re.compile(r"[rs]\d{3,5}")
KEY = re.compile(r"au-federal-[rs]\d{3,5}")
# "... Bill 2026", "... Bill (No. 2) 2026", "... Bill 2026-2027", "... Bill 2026 [No. 2]"
TITLE = re.compile(r"\S.* Bill(?: \(No\. \d+\))? (?:19|20)\d{2}(?:-(?:\d{2}|\d{4}))?(?: \[No\. \d+\])?")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
GID = re.compile(r"uk\.org\.publicwhip/(?:debate|lords)/\d{4}-\d{2}-\d{2}\.[\d.]+")
MOVED = re.compile(r"I move:\s*That (?:this bill|these bills) be now read a second time", re.I)
WS = re.compile(r"\s+")


def log(msg: str) -> None:
    print(f"derive_bills_hansard: {msg}", file=sys.stderr, flush=True)


def plain(node: ET.Element) -> str:
    return WS.sub(" ", "".join(node.itertext())).strip()


def day_url(house: str, day: str) -> str:
    return f"{SOURCE_BASE}/{FOLDERS[house]}/{day}.xml"


def names(title: str, text: str) -> bool:
    """`text` names exactly this bill: the title, then a comma, a semicolon or the end.
    "X Bill 2026" does not name "X Bill 2026 [No. 2]"."""
    return re.search(r"(?:^|, |\s[-\u2013\u2014]\s)" + re.escape(title) + r"(?=,|;|$)", text) is not None


# ---------------------------------------------------------------------------
# What Hansard records
# ---------------------------------------------------------------------------


def scan_day(raw: bytes, house: str, day: str) -> dict[str, dict]:
    """{printed id: {"title", "observations": [...]}} for one chamber-day."""
    root = ET.fromstring(raw)
    if root.tag != "debates":
        raise ValueError("expected OpenAustralia debates XML")
    out: dict[str, dict] = {}
    major = minor = ""
    gid = None
    children = list(root)
    for i, node in enumerate(children):
        if node.tag == "major-heading":
            major, minor, gid = plain(node), "", None
        elif node.tag == "minor-heading":
            minor, gid = plain(node), node.get("id")
        elif node.tag == "bills":
            if major.upper() != "BILLS" or ";" not in minor:
                continue
            printed = minor.rsplit(";", 1)[1].strip()
            stage = STAGES.get(printed.casefold())
            if not stage:
                continue
            moved = False
            for following in children[i + 1:]:
                if following.tag != "speech":
                    break
                moved = bool(MOVED.match(plain(following)))
                break
            for bill in node.findall("bill"):
                bid, title = (bill.get("id") or "").strip(), plain(bill)
                if not BILL_ID.fullmatch(bid) or not TITLE.fullmatch(title) or not names(title, minor):
                    continue
                entry = out.setdefault(bid, {"title": title, "observations": []})
                if entry["title"] != title:
                    continue
                entry["observations"].append({
                    "house": house, "date": day, "stage": stage, "gid": gid,
                    **({"moved": True} if moved and stage == "second_reading" else {}),
                })
    return out


def scan_stage(stage: Path, since: str) -> tuple[dict[str, dict], str | None]:
    """Every bill Hansard prints on the staged days on or after `since`, and the last day read."""
    found: dict[str, dict] = {}
    last = None
    unread: list[str] = []
    for house, folder in FOLDERS.items():
        for path in sorted((stage / "raw" / folder).glob("*.xml")):
            day = path.stem
            if not DATE.fullmatch(day) or day < since:
                continue
            raw = path.read_bytes()
            if not raw.strip():
                continue  # a listed day with no sitting
            try:
                day_bills = scan_day(raw, house, day)
            except (ET.ParseError, ValueError) as exc:
                # One unreadable day must not cost the bills already recorded from the others.
                log(f"HELD {folder}/{path.name}: the day file could not be read ({exc}); its bills wait for a good copy")
                unread.append(f"{folder}/{path.name}")
                continue
            for bid, entry in day_bills.items():
                held = found.setdefault(bid, {"title": entry["title"], "observations": []})
                if held["title"] == entry["title"]:
                    held["observations"] += entry["observations"]
            last = max(last or day, day)
    if unread:
        log(f"HELD {len(unread)} Hansard day file(s) in all")
    return found, last


def merge_observations(*lists: list[dict]) -> list[dict]:
    """One row per chamber, day and stage. `moved` survives if any copy carries it."""
    rows: dict[tuple, dict] = {}
    for obs in (o for group in lists for o in group or []):
        key = (obs.get("date"), obs.get("house"), obs.get("stage"))
        row = rows.setdefault(key, {"house": obs.get("house"), "date": obs.get("date"),
                                    "stage": obs.get("stage"), "gid": obs.get("gid")})
        if obs.get("moved"):
            row["moved"] = True
    return sorted(rows.values(), key=lambda o: (o["date"] or "", HOUSE_ORDER.get(o["house"], 9),
                                                STAGE_ORDER.get(o["stage"], 99)))


# ---------------------------------------------------------------------------
# What the divisions record
# ---------------------------------------------------------------------------


def division_candidates(divisions: Path, since: str) -> list[dict]:
    """Published federal division records on or after `since` whose name is a bill heading."""
    index = json.loads((divisions / "index.json").read_text(encoding="utf-8"))
    out = []
    for row in index.get("divisions") or []:
        if not str(row.get("key", "")).startswith("federal-") or str(row.get("date", "")) < since:
            continue
        record = eb.division_record(divisions, row["key"])
        if " Bill" in str(record.get("name") or ""):
            out.append(record)
    return out


def division_entry(record: dict) -> dict:
    """A bill file's division entry (docs/BILLS-CONTRACT.md) from the published record alone."""
    stage = eb.division_stage(record.get("name"))
    title = eb.division_title(stage)
    # The party each voter is published under on the division page (already read at the division's
    # date). A voter published with no party is counted as "Unknown", as the registry export does,
    # so every counted vote sits in one coverage bucket.
    splits: dict[str, dict] = {}
    coverage = {"dated": 0, "unknown": 0}
    for member in record.get("members") or []:
        if member.get("vote") not in ("aye", "no"):
            continue
        party = member.get("party") or "Unknown"
        coverage["unknown" if party == "Unknown" else "dated"] += 1
        splits.setdefault(party, {"ayes": 0, "noes": 0})["ayes" if member["vote"] == "aye" else "noes"] += 1
    coverage = {k: v for k, v in coverage.items() if v}
    return {
        "key": record["key"], "date": record["date"], "house": record["house"],
        "question": eb.division_question(record.get("question"), record.get("name")),
        "stage": stage, **({"title": title} if title else {}),
        "ayes": record["ayes"], "noes": record["noes"], "outcome": record["result"],
        "party_splits": dict(sorted(splits.items())), "party_coverage": coverage,
        "paired": sum(1 for m in record.get("members") or [] if m.get("vote") == "paired"),
        "url": record.get("source_url"),
    }


def divisions_for(title: str, candidates: list[dict]) -> list[dict]:
    rows = [division_entry(r) for r in candidates if names(title, str(r.get("name") or ""))]
    return sorted(rows, key=lambda d: (d["date"], d["key"]))


# ---------------------------------------------------------------------------
# The record
# ---------------------------------------------------------------------------


# The house a bill started in is the first letter of the id Hansard prints: r for the House of
# Representatives, s for the Senate.
ID_HOUSE = {"r": "representatives", "s": "senate"}


def introduction(observations: list[dict], bid: str) -> tuple[str | None, str | None, str | None]:
    """(date, house, basis) when the earliest recorded day is the introduction, else nulls.

    The earliest day held is not always the earliest day there was: a missing day file can leave
    a House bill's Senate first reading as the first thing seen. So the day counts only when it
    is in the house the printed id names; otherwise nothing is claimed."""
    if not observations:
        return None, None, None
    first_day = observations[0]["date"]
    opening = [o for o in observations if o["date"] == first_day]
    houses = {o["house"] for o in opening}
    if len(houses) != 1 or houses != {ID_HOUSE.get(bid[:1])}:
        return None, None, None
    if any(o["stage"] == "first_reading" for o in opening):
        return first_day, opening[0]["house"], "first_reading"
    if any(o["stage"] == "second_reading" and o.get("moved") for o in opening):
        return first_day, opening[0]["house"], "second_reading_moved"
    return None, None, None


def build_doc(bid: str, title: str, observations: list[dict], divisions: list[dict]) -> dict:
    introduced, house, basis = introduction(observations, bid)
    first = observations[0]
    dates = [o["date"] for o in observations] + [d["date"] for d in divisions]
    sources, seen = [], set()
    for o in observations:  # the first day read in each chamber
        if o["house"] not in seen:
            seen.add(o["house"])
            sources.append({"kind": "hansard", "url": day_url(o["house"], o["date"]),
                            "document_date": o["date"], "licence": None})
    return {
        "key": f"au-federal-{bid}",
        "title": title,
        "short_title": title,
        "aliases": [],
        "jurisdiction": "federal",
        "parliament": eb.parliament_label(first["date"]),
        "introduced": introduced,
        "originating_house": house,
        "sponsor": None,
        "sponsor_party": None,
        "sponsor_person_id": None,
        "sponsors": [],
        "portfolio": None,
        "status": STATUS,
        "status_as_of": max(dates),
        "passed_both_houses": None,
        "passed_both_houses_date": None,
        "royal_assent": None,
        "act_number": None,
        "key_dates": [{"stage": o["stage"], "date": o["date"], "house": o["house"],
                       "url": day_url(o["house"], o["date"])} for o in observations],
        "sources": sources,
        "summary": None,
        "divisions": divisions,
        "speeches": [],
        "acts": [],
        "record_source": RECORD_SOURCE,
        "provenance": {
            "label": LABEL,
            "basis": BASIS,
            "bill_id_as_printed": bid,
            "first_recorded": first["date"],
            "first_recorded_house": first["house"],
            "introduced_basis": basis,
            "observations": observations,
        },
    }


def _allowed_url(url) -> bool:
    return isinstance(url, str) and (url.startswith(SOURCE_BASE + "/")
                                     or url.startswith("https://theyvoteforyou.org.au/divisions/"))


def record_errors(doc: dict, divisions: Path | None = None) -> list[str]:
    """Every rule a recorded bill must meet before it is published. Also run by
    scripts/vm/validate_data.py over what is on disk, without the divisions check."""
    errs: list[str] = []
    key = doc.get("key")
    prov = doc.get("provenance") if isinstance(doc.get("provenance"), dict) else {}
    obs = prov.get("observations") if isinstance(prov.get("observations"), list) else []

    def bad(msg: str) -> None:
        errs.append(f"{key}: {msg}")

    if not isinstance(key, str) or not KEY.fullmatch(key):
        bad("key is not a bill id as Hansard prints it")
    elif prov.get("bill_id_as_printed") != key.removeprefix("au-federal-"):
        bad("key and the printed bill id differ")
    if doc.get("record_source") != RECORD_SOURCE:
        bad("record_source is missing")
    if doc.get("status") != STATUS:
        bad(f"status must be {STATUS}")
    if prov.get("label") != LABEL or not prov.get("basis"):
        bad("the provenance label is missing or reworded")
    title = doc.get("title")
    if not isinstance(title, str) or not TITLE.fullmatch(title) or doc.get("short_title") != title:
        bad("title is not a bill title as printed")
    if doc.get("jurisdiction") != "federal":
        bad("jurisdiction must be federal")
    for field in ("sponsor", "sponsor_party", "sponsor_person_id", "portfolio", "summary",
                  "passed_both_houses", "passed_both_houses_date", "royal_assent", "act_number"):
        if doc.get(field) is not None:
            bad(f"{field} is not stated by Hansard or a division and must be null")
    if doc.get("sponsors") or doc.get("acts") or doc.get("speeches"):
        bad("sponsors, speeches and acts must be empty")
    if not obs:
        bad("no Hansard observation")
    for o in obs:
        if not (isinstance(o, dict) and o.get("house") in FOLDERS and DATE.fullmatch(str(o.get("date")))
                and o.get("stage") in STAGE_ORDER and isinstance(o.get("gid"), str) and GID.fullmatch(o["gid"])):
            bad(f"malformed observation {json.dumps(o, sort_keys=True)[:120]}")
    if errs:
        return errs
    expected = build_doc(prov["bill_id_as_printed"], title, merge_observations(obs), doc.get("divisions") or [])
    for field in ("introduced", "originating_house", "status_as_of", "key_dates", "sources", "parliament"):
        if doc.get(field) != expected[field]:
            bad(f"{field} does not follow from the recorded observations")
    for field in ("first_recorded", "first_recorded_house", "introduced_basis"):
        if prov.get(field) != expected["provenance"][field]:
            bad(f"provenance.{field} does not follow from the recorded observations")
    urls = ([s.get("url") for s in doc.get("sources") or []] + [d.get("url") for d in doc.get("key_dates") or []]
            + [d.get("url") for d in doc.get("divisions") or []])
    if not all(_allowed_url(u) for u in urls):
        bad("a link points somewhere other than the Hansard day file or a division source")
    for d in doc.get("divisions") or []:
        if not isinstance(d.get("question"), str):
            bad(f"division {d.get('key')} question is not text")
        if divisions is not None:
            try:
                record = eb.division_record(divisions, d["key"])
            except (OSError, ValueError, KeyError) as exc:
                bad(f"division {d.get('key')} is not a published record ({exc})")
                continue
            if (d.get("ayes"), d.get("noes"), d.get("outcome")) != (
                    record.get("ayes"), record.get("noes"), record.get("result")):
                bad(f"division {d['key']} tally differs from its published record")
            if not names(title, str(record.get("name") or "")):
                bad(f"division {d['key']} does not name this bill")
    return errs


# ---------------------------------------------------------------------------
# Merge into the published projection
# ---------------------------------------------------------------------------


def is_recorded(row: dict) -> bool:
    return bool(row.get("record_source"))


def superseded(key: str, title: str, registry: list[dict]) -> str | None:
    """The registry key that replaces this recorded bill, or None. A registry record
    wins on its key, or on the same normalised title (the title carries the year)."""
    wanted = eb.norm(title)
    for row in registry:
        if row["key"] == key or eb.norm(row.get("title")) == wanted:
            return row["key"]
    return None


def previous_recorded(out: Path, index: dict) -> dict[str, dict]:
    """Recorded bills already published: index rows, plus files a registry export left behind."""
    listed = {row["key"] for row in index["bills"]}
    keys = {row["key"] for row in index["bills"] if is_recorded(row)}
    keys |= {p.stem for p in out.glob("au-federal-[rs]*.json") if p.stem not in listed}
    docs = {}
    for key in sorted(keys):
        try:
            doc = json.loads((out / f"{key}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        prov = doc.get("provenance")
        if (doc.get("record_source") == RECORD_SOURCE and doc.get("key") == key and isinstance(prov, dict)
                and BILL_ID.fullmatch(str(prov.get("bill_id_as_printed"))) and isinstance(prov.get("observations"), list)
                and isinstance(doc.get("title"), str)):
            docs[key] = doc
        elif doc.get("record_source") == RECORD_SOURCE:
            log(f"HELD {key}: its published file has no readable provenance; left as it is, not rebuilt")
    return docs


def derive(out: Path, divisions: Path, stage: Path | None = None, since: str | None = None) -> dict:
    """Rebuild every recorded bill in `out`. Returns what happened, for the log and the tests."""
    index_path = out / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    registry = [row for row in index["bills"] if not is_recorded(row)]
    previous = previous_recorded(out, index)
    # Hansard is read from the last introduction the registry holds: anything older is in it.
    since = since or max((r.get("introduced") or "" for r in registry
                          if r.get("status") != eb.DRAFT_STATUS), default="")
    found, last_day = ({}, None)
    if stage is not None and (stage / "raw").is_dir():
        found, last_day = scan_stage(stage, since)
    elif stage is not None:
        log(f"no staged Hansard at {stage}; rebuilding from the published records only")
    candidates = division_candidates(divisions, since)

    bills: dict[str, dict] = {}
    for bid, entry in found.items():
        bills[bid] = {"title": entry["title"], "observations": entry["observations"]}
    for key, doc in previous.items():
        bid = doc["provenance"]["bill_id_as_printed"]
        held = bills.setdefault(bid, {"title": doc["title"], "observations": []})
        if held["title"] == doc["title"]:  # a published observation stays recorded
            held["observations"] = held["observations"] + doc["provenance"]["observations"]

    docs, replaced, refused, kept = {}, {}, {}, []
    for bid in sorted(bills):
        key, title = f"au-federal-{bid}", bills[bid]["title"]
        winner = superseded(key, title, registry)
        if winner:
            if key in previous:
                replaced[key] = winner
            continue
        doc = build_doc(bid, title, merge_observations(bills[bid]["observations"]),
                        divisions_for(title, candidates))
        errs = record_errors(doc, divisions)
        if errs:
            refused[key] = errs
            if key in previous and not record_errors(previous[key], divisions):
                docs[key] = previous[key]
                kept.append(key)
            continue
        docs[key] = doc
    for key, errs in refused.items():
        log(f"REFUSED {key}{' (published copy kept)' if key in kept else ''}: {'; '.join(errs[:3])}")

    rows = registry + [eb.index_row(d) for d in docs.values()]
    current_to = max([d["status_as_of"] for d in docs.values()] + ([last_day] if last_day else []), default=None)
    was = (index.get("meta") or {}).get("hansard_recorded") or {}
    if was.get("current_to") and current_to:
        current_to = max(current_to, was["current_to"])
    meta = {k: v for k, v in (index.get("meta") or {}).items() if k != "hansard_recorded"}
    if docs:
        meta["hansard_recorded"] = {"count": len(docs), "current_to": current_to, "label": LABEL, "basis": BASIS}
    # A new stamp; write_index puts the old one back when nothing but the stamp differs.
    new_index = {**index, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "count": len(rows), "meta": meta,
                 "bills": sorted(rows, key=eb.index_sort_key, reverse=True)}
    if len({r["key"] for r in rows}) != len(rows):
        raise ValueError("a recorded bill would duplicate a key in the index")

    # Everything above is decided in memory; only now is anything written.
    for key in sorted(set(previous) - set(docs)):
        target = replaced.get(key)
        # A registry file under the same key is the replacement itself: leave it.
        if not target or target != key:
            (out / f"{key}.json").unlink(missing_ok=True)
        log(f"removed {key}: " + (f"the registry holds it as {target}" if target else "no longer recorded"))
    for key, doc in docs.items():
        text = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
        path = out / f"{key}.json"
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8")
    eb.write_index(index_path, new_index)
    log(f"{len(docs)} recorded bill(s) in {out}: {len(set(docs) - set(previous))} new, "
        f"{len(replaced)} replaced by the registry, {len(refused)} refused; Hansard read to {last_day or 'nothing staged'}")
    return {"docs": docs, "replaced": replaced, "refused": refused, "kept": kept, "current_to": current_to}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default="portal/public/bills")
    ap.add_argument("--divisions", default="portal/public/divisions")
    ap.add_argument("--stage", default=str(DEFAULT_STAGE),
                    help="staged OpenAustralia XML (raw/<chamber>_debates/<day>.xml); read only, never fetched")
    ap.add_argument("--since", default=None, help="first Hansard day to read (default: the registry's last introduction)")
    args = ap.parse_args()
    out, divisions = Path(args.out), Path(args.divisions)
    if not (out / "index.json").exists() or not (divisions / "index.json").exists():
        log("no published bills or divisions index here; nothing read, nothing written")
        return 0
    stage = Path(args.stage).expanduser()
    try:
        derive(out, divisions, stage, args.since)
    except Exception as exc:  # noqa: BLE001 - nothing was written; say why and try the safer rebuild
        log(f"FAILED with the staged Hansard ({type(exc).__name__}: {exc}); rebuilding from the published records only")
        try:
            derive(out, divisions, None, args.since)
        except Exception as again:  # noqa: BLE001
            log(f"FAILED again ({type(again).__name__}: {again}); nothing written. The caller must put the bills "
                "back as they were: a registry export leaves the recorded bills out of the index")
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
