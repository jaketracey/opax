#!/usr/bin/env python3
"""Bring portal/public/corpus.json in line with the live knowledge box.

    python3 scripts/update_corpus_manifest.py --dry-run          # show the diff, write nothing
    python3 scripts/update_corpus_manifest.py                    # write portal/public/corpus.json

This is the step that used to be done by hand after every refresh. Everything
it writes comes from one of three places, never from a guess:

  the live box    KbClient.counters()['resources'], and one POST /catalog per
                  label for the per-kind and per-source totals
  daily.log       the last refresh's per-step row deltas (raw_source_updates)
                  and its newest-date table ("Federal Hansard is current to")
  the repo/DB     portal/public/bills/index.json (bill counts), and the newest
                  NSW release date from parli.db (read-only; kept if absent)

What changes, and when
  The box changed since the manifest was written (total or any kind differs):
  version, expected_resources, expected_resources_breakdown (the old total plus
  what each kind gained, so it always sums to the new total), collected_speeches,
  sources[].docs, refresh.resource_counts, refresh.raw_source_updates, the
  "Federal Hansard is current to" line, and refresh.checked_at.
  The box did not change: only the bill-derived and newest-release fields, and
  only if they moved. A night on which nothing moved writes nothing, so it makes
  no commit and no deploy. --always-stamp writes refresh.checked_at regardless.

Never touched: models, inclusion, known_defects, enrichment, grants_research,
structured_sources, enrichment_queued and the other hand-kept fields.

Exit status: 0 done (see --result-json for what changed), 2 refused because the
box's answer looks wrong (fewer resources than the manifest by more than 1%, a
kind that would not answer); nothing is written in that case.
"""
from __future__ import annotations

import argparse
import copy
import difflib
import json
import os
import re
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

KINDS = [
    "speech", "press_release", "bill", "bill_text", "division", "grant_award",
    "grant_invitation", "parliamentary_profile", "election_baseline", "research_report",
]
# labelset "source" values the manifest reports on.
SOURCES = [
    "zenodo", "nsw_hansard", "committee_senate", "vic_hansard", "sa_hansard", "openaustralia",
    "qld_hansard", "pmtranscripts", "nsw", "qld", "vic", "treasury",
]
# sources[].name -> which live total it is. Only rows whose docs equal a whole
# kind or source total are here; rows that report a slice (GrantConnect awards
# from one window, MLCI award records, AEC donations, grant research notes) are
# hand-kept and left alone.
SOURCE_ROWS = {
    "Federal Hansard: House of Representatives (zenodo)": ("source", "zenodo"),
    "NSW Parliament": ("source", "nsw_hansard"),
    "Senate committee hearings": ("source", "committee_senate"),
    "Victorian Parliament": ("source", "vic_hansard"),
    "SA Parliament": ("source", "sa_hansard"),
    "Federal Hansard: Senate + recent House (openaustralia)": ("source", "openaustralia"),
    "QLD Parliament": ("source", "qld_hansard"),
    "Recorded divisions (TheyVoteForYou + state Hansard)": ("kind", "division"),
    "Prime Minister transcripts and releases (PM&C)": ("source", "pmtranscripts"),
    "NSW Government ministerial releases": ("source", "nsw"),
    "MLCI departmental invitation records": ("kind", "grant_invitation"),
    "AEC notional seat baselines": ("kind", "election_baseline"),
    "Recorded parliamentary representation": ("kind", "parliamentary_profile"),
    "Queensland Government ministerial statements": ("source", "qld"),
    "Victorian Premier releases": ("source", "vic"),
    "Australian Treasury ministerial releases": ("source", "treasury"),
    "Federal bill records": ("kind", "bill"),
    "Original federal bill text versions": ("kind", "bill_text"),
}
# daily_refresh.sh step -> raw_source_updates key, in the order the manifest lists them.
RAW_STEPS = [
    ("fed_load", "federal_speeches"),
    ("nsw", "nsw_speeches"),
    ("vic", "vic_speeches"),
    ("qld", "qld_speeches"),
    ("releases_nsw", "nsw_releases"),
    ("austender", "austender_contracts"),
    ("tvfy_refresh", "new_federal_divisions"),
]
DRAFT_STATUS = "exposure_draft"
FED_LINE = "Federal Hansard is current to"
NO_SITTINGS_AFTER_DAYS = 5


class Refused(Exception):
    """The live numbers look wrong; write nothing."""


# --- the live box --------------------------------------------------------------


def read_kb(settle: float = 0) -> dict:
    """{'resources': n, 'kinds': {kind: n}, 'sources': {source: n}} from the live box.

    With settle > 0, the resource counter is read until two reads `settle` seconds apart
    agree (at most six reads), so a push that has just finished is counted in full."""
    sys.path.insert(0, str(REPO))
    from parli.arag import AragConfig, KbClient, load_dotenv

    load_dotenv(str(REPO / ".env"))
    kb = KbClient(AragConfig.from_env())
    total = int(kb.counters()["resources"])
    for _ in range(5 if settle else 0):
        time.sleep(settle)
        again = int(kb.counters()["resources"])
        if again == total:
            break
        total = again
    return {
        "resources": total,
        "kinds": {k: kb.label_total("kind", k) for k in KINDS},
        "sources": {s: kb.label_total("source", s) for s in SOURCES},
    }


# --- daily.log -----------------------------------------------------------------

STEP_RE = re.compile(
    r"^(?P<ts>\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) \[(?P<step>[\w+]+)\] (?P<status>OK|FAIL\(.*?\)) in (?P<dur>\d+)s; "
    r"(?:rows (?P<before>\d+) -> (?P<after>\d+) \((?P<delta>[+-]\d+)\)|\(no row count\))"
)
NEWEST_RE = re.compile(r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\s+(?P<src>\w+)\s+newest (?P<date>\d{4}-\d\d-\d\d)\s+rows")


def parse_daily_log(text: str) -> dict:
    """The last refresh block of daily.log: per-step deltas and the newest-date table."""
    lines = text.splitlines()
    starts = [i for i, ln in enumerate(lines) if "===== daily refresh start" in ln]
    if not starts:
        return {"complete": False, "steps": {}, "newest": {}}
    block = lines[starts[-1]:]
    complete = any("===== daily refresh end" in ln for ln in block)
    steps: dict[str, dict] = {}
    newest: dict[str, str] = {}
    for ln in block:
        m = STEP_RE.match(ln)
        if m:
            steps[m["step"]] = {
                "ok": m["status"] == "OK",
                "delta": int(m["delta"]) if m["delta"] is not None else None,
                "after": int(m["after"]) if m["after"] is not None else None,
            }
            continue
        m = NEWEST_RE.match(ln)
        if m:
            newest[m["src"]] = m["date"]
    m = re.search(r"\(since=(\d{4}-\d\d-\d\d)", block[0])
    return {"complete": complete, "steps": steps, "newest": newest, "since": m[1] if m else None,
            "started": block[0][:19]}


# --- repo / database -------------------------------------------------------------


def bill_facts(index: dict) -> dict:
    """Counts the manifest reports, from the projection the site serves."""
    bills = [b for b in index.get("bills", []) if b.get("status") != DRAFT_STATUS]
    parliaments = [b["parliament"] for b in bills if b.get("parliament")]
    current = max(parliaments) if parliaments else None
    introduced = [b["introduced"] for b in bills if b.get("introduced")]
    return {
        "bills_registry": len(bills),
        "current_parliament_bills": sum(1 for b in bills if b.get("parliament") == current),
        "latest_bill_introduced": max(introduced) if introduced else None,
    }


def latest_nsw_release(db_path: str | None) -> str | None:
    if not db_path or not os.path.exists(db_path):
        return None
    try:
        db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=30)
        try:
            row = db.execute("SELECT MAX(date) FROM ext_press_releases WHERE source='nsw'").fetchone()
        finally:
            db.close()
    except sqlite3.Error:
        return None
    value = row[0] if row else None
    return value if value and re.fullmatch(r"\d{4}-\d\d-\d\d", value) else None


# --- the update ----------------------------------------------------------------


def _label(kind: str) -> str:
    return f"new_{kind}_resources"


def federal_line(log: dict, run_date: date) -> str | None:
    n = log.get("newest", {})
    needed = ("openaustralia", "nsw_hansard", "vic_hansard", "qld_hansard", "committee_senate")
    if not log.get("complete") or any(k not in n for k in needed):
        return None
    fed = n["openaustralia"]
    quiet = ""
    fed_step = log["steps"].get("fed_load")
    if fed_step and fed_step["delta"] == 0 and (run_date - date.fromisoformat(fed)).days >= NO_SITTINGS_AFTER_DAYS:
        quiet = " (no sittings since)"
    return (f"{FED_LINE} {fed}{quiet}; NSW Parliament to {n['nsw_hansard']}; Victoria to {n['vic_hansard']}; "
            f"QLD to {n['qld_hansard']}. Senate committee hearings are current to the last estimates round "
            f"({n['committee_senate']}).")


def extend_coverage(coverage: str, newest: str) -> str:
    """'2015–2026' + newest 2027-01-05 -> '2015–2027'. Never shortens."""
    m = re.fullmatch(r"(\d{4})–(\d{4})", coverage)
    if not m or int(newest[:4]) <= int(m[2]):
        return coverage
    return f"{m[1]}–{newest[:4]}"


def compute(prev: dict, kb: dict, log: dict, bills: dict, nsw_release: str | None,
            run_date: date, now: datetime, *, always_stamp: bool = False,
            allow_shrink: bool = False) -> tuple[dict, dict]:
    """Return (new manifest, result). Pure: no I/O."""
    new = copy.deepcopy(prev)
    refresh = new.setdefault("refresh", {})
    prev_counts = dict(prev.get("refresh", {}).get("resource_counts", {}))
    prev_total = int(prev["expected_resources"])
    live_total = int(kb["resources"])

    missing = [k for k in KINDS if kb["kinds"].get(k) is None]
    if missing:
        raise Refused(f"the box gave no total for kinds {missing}")
    if not allow_shrink and live_total < prev_total * 0.99:
        raise Refused(f"the box reports {live_total:,} resources, {prev_total - live_total:,} fewer than "
                      f"the manifest's {prev_total:,}; refusing (--allow-shrink to override)")

    kinds = {k: int(kb["kinds"][k]) for k in KINDS}
    deltas = {k: kinds[k] - int(prev_counts.get(k, 0)) for k in KINDS}
    kb_changed = live_total != prev_total or any(deltas.values())
    changed_fields: list[str] = []

    def put(container: dict, key: str, value, label: str) -> None:
        if container.get(key) != value:
            container[key] = value
            changed_fields.append(label)

    if kb_changed:
        breakdown = {"live_index_before_refresh": prev_total}
        for k in sorted(KINDS, key=_label):
            if deltas[k] > 0:
                breakdown[_label(k)] = deltas[k]
            elif deltas[k] < 0:
                breakdown[f"removed_{k}_resources"] = deltas[k]
        other = (live_total - prev_total) - sum(deltas.values())
        if other:
            breakdown["other_resource_change"] = other
        put(new, "version", run_date.isoformat(), "version")
        put(new, "expected_resources", live_total, "expected_resources")
        put(new, "expected_resources_breakdown", breakdown, "expected_resources_breakdown")
        put(new, "collected_speeches", kinds["speech"], "collected_speeches")
        put(refresh, "resource_counts", dict(sorted(kinds.items())), "resource_counts")

        for row in new.get("sources", []):
            spec = SOURCE_ROWS.get(row.get("name"))
            if not spec:
                continue
            table = kb["kinds"] if spec[0] == "kind" else kb["sources"]
            docs = table.get(spec[1])
            if docs is not None:
                put(row, "docs", int(docs), f"sources[{row['name']}].docs")
            if spec[0] == "source" and spec[1] in log.get("newest", {}):
                put(row, "coverage", extend_coverage(row.get("coverage", ""), log["newest"][spec[1]]),
                    f"sources[{row['name']}].coverage")

        if log.get("complete"):
            raw = {key: log["steps"][step]["delta"] for step, key in RAW_STEPS
                   if step in log["steps"] and log["steps"][step]["delta"] is not None}
            if raw:
                put(refresh, "raw_source_updates", raw, "raw_source_updates")
            line = federal_line(log, run_date)
            if line:
                limits = refresh.setdefault("source_limitations", [])
                idx = next((i for i, s in enumerate(limits) if s.startswith(FED_LINE)), None)
                if idx is None:
                    limits.insert(min(1, len(limits)), line)
                    changed_fields.append("source_limitations")
                elif limits[idx] != line:
                    limits[idx] = line
                    changed_fields.append("source_limitations")

    # Fields that can move without the box changing.
    for key in ("bills_registry", "current_parliament_bills", "latest_bill_introduced"):
        if bills.get(key) is not None:
            put(refresh, key, bills[key], key)
    if nsw_release:
        put(refresh, "latest_nsw_release", nsw_release, "latest_nsw_release")

    if changed_fields or always_stamp:
        refresh["checked_at"] = now.replace(microsecond=0).isoformat()
        changed_fields.append("checked_at")

    result = {
        "kb_changed": kb_changed,
        "changed": bool(changed_fields),
        "changed_fields": changed_fields,
        "resources": live_total,
        "previous_resources": prev_total,
        "new_resources": live_total - prev_total,
        "kind_deltas": {k: v for k, v in deltas.items() if v},
        "version": new.get("version"),
    }
    return new, result


def dump(manifest: dict) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--corpus", default=str(REPO / "portal" / "public" / "corpus.json"))
    ap.add_argument("--bills-index", default=str(REPO / "portal" / "public" / "bills" / "index.json"))
    ap.add_argument("--daily-log", default=os.path.expanduser("~/.cache/autoresearch/pipeline/daily.log"))
    ap.add_argument("--db", default=os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db"),
                    help="parli.db, opened read-only, for the newest NSW release date")
    ap.add_argument("--date", help="version date, YYYY-MM-DD (default: today in Australia/Sydney)")
    ap.add_argument("--dry-run", action="store_true", help="print the diff, write nothing")
    ap.add_argument("--always-stamp", action="store_true", help="write refresh.checked_at even if nothing else moved")
    ap.add_argument("--allow-shrink", action="store_true", help="accept a box with >1%% fewer resources than the manifest")
    ap.add_argument("--kb-snapshot", default=os.environ.get("OPAX_KB_SNAPSHOT"),
                    help="read the box's numbers from this JSON instead of the network (env OPAX_KB_SNAPSHOT)")
    ap.add_argument("--settle", type=float, default=0,
                    help="seconds to wait between counter reads until the total stops moving (after a push)")
    ap.add_argument("--save-kb-snapshot", help="write the box's numbers to this JSON (for tests and audits)")
    ap.add_argument("--result-json", help="write what happened to this JSON file")
    args = ap.parse_args(argv)

    corpus_path = Path(args.corpus)
    prev = json.loads(corpus_path.read_text(encoding="utf-8"))
    kb = json.loads(Path(args.kb_snapshot).read_text()) if args.kb_snapshot else read_kb(args.settle)
    if args.save_kb_snapshot:
        Path(args.save_kb_snapshot).write_text(json.dumps(kb, indent=1))
    log_path = Path(args.daily_log)
    log = parse_daily_log(log_path.read_text(errors="replace")) if log_path.exists() else \
        {"complete": False, "steps": {}, "newest": {}}
    if not log["complete"]:
        print(f"warning: no complete refresh block in {log_path}; raw_source_updates and the "
              f"newest-date line are left as they were", file=sys.stderr)
    index_path = Path(args.bills_index)
    bills = bill_facts(json.loads(index_path.read_text(encoding="utf-8"))) if index_path.exists() else {}
    if args.date:
        run_date = date.fromisoformat(args.date)
    else:
        try:
            from zoneinfo import ZoneInfo
            run_date = datetime.now(ZoneInfo("Australia/Sydney")).date()
        except Exception:  # noqa: BLE001 - no tzdata: fall back to UTC+10
            run_date = (datetime.now(timezone.utc) + timedelta(hours=10)).date()
    now = datetime.now(timezone.utc)

    try:
        new, result = compute(prev, kb, log, bills, latest_nsw_release(args.db), run_date, now,
                              always_stamp=args.always_stamp, allow_shrink=args.allow_shrink)
    except Refused as e:
        print(f"REFUSED: {e}", file=sys.stderr)
        if args.result_json:
            Path(args.result_json).write_text(json.dumps({"refused": str(e), "changed": False, "kb_changed": False}))
        return 2

    before, after = dump(prev), dump(new)
    if result["changed"]:
        sys.stdout.writelines(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                                   "corpus.json (current)", "corpus.json (updated)", n=1))
    print(f"corpus manifest: {'CHANGED' if result['changed'] else 'unchanged'} "
          f"(box {'changed' if result['kb_changed'] else 'unchanged'}: {result['resources']:,} resources, "
          f"{result['new_resources']:+,} since the manifest); fields: {', '.join(result['changed_fields']) or '-'}",
          file=sys.stderr)
    if args.result_json:
        Path(args.result_json).write_text(json.dumps(result))
    if result["changed"] and not args.dry_run:
        tmp = corpus_path.with_name(corpus_path.name + ".tmp")
        tmp.write_text(after, encoding="utf-8")
        os.replace(tmp, corpus_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
