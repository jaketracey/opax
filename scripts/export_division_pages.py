#!/usr/bin/env python3
"""Publish bounded static division records from the same data as bill/vote pages.

The normal mode reads parli.db with mode=ro and query_only=ON, in one snapshot.
The optional --from-bills mode projects only the already published bill export:
it explicitly labels member coverage unavailable rather than inventing votes.
Both modes use committed bill links, without a title guess, to link each division
back to its bills. One JSON file per slug avoids a runtime scan of the corpus.

Every refresh preserves the existing division set and recorded member evidence.
A degraded candidate retains the complete previous record and declares why in
the shard and index; --strict-refresh rejects the run before publishing instead.
Source facts on complete or pinned member snapshots require an explicit review
when changed: a reviewed entry in scripts/corrections/divisions.json (carried on
the record as _meta.corrections), or a TVFY placeholder question being withheld.
Files are staged and replaced atomically, with the index last.

Rows the source gives no party take the party a dated roster records for
that chamber and date (scripts/vote_parties.py), recomputed on every run;
anything less than one unambiguous dated party stays unknown. Rows the source
does give a party are checked against the same dated records: a label naming a
different party in substance from the one held on that date is replaced by the
dated party (the source label stays in party_source.source_party), a label the
dated records leave unclear is held back (party_withheld), and a naming variant
is never rewritten. Both are recomputed from the source label on every run.

Publication rules (scripts/division_rules.py): presiding-officer codes are
never published as a party, one label per party, placeholder questions are
withheld, and divisions TheyVoteForYou marks as duplicates carry
_meta.duplicate_of (they stay published for provenance).
"""

import argparse
from collections import Counter
from copy import deepcopy
from contextlib import closing
import json
import os
import re
import sqlite3
import sys
import tempfile
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from corrections.apply import apply as apply_corrections, load as load_corrections  # noqa: E402
import division_rules as rules  # noqa: E402
import vote_parties  # noqa: E402

CORRECTIONS = "divisions"
DEFAULT_DB = os.environ.get("OPAX_DB") or str(Path.home() / ".cache/autoresearch/parli.db")


def person_slug(name):
    text = unicodedata.normalize("NFKD", str(name or ""))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"['’‘ʼ`.]", "", text)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def publishable_key(key):
    return isinstance(key, str) and bool(re.fullmatch(r"[a-zA-Z0-9_-]{1,180}", key))


def bill_projection(directory):
    """Division facts and exact reverse links already used by the client."""
    divisions, links = {}, {}
    for path in sorted(directory.glob("*.json")):
        if path.name == "index.json":
            continue
        bill = json.loads(path.read_text(encoding="utf-8"))
        if not publishable_key(bill.get("key")):
            continue
        link = {"key": bill["key"], "title": bill["title"], "url": f"/bill/{bill['key']}"}
        for division in bill.get("divisions", []):
            key = division.get("key")
            if not publishable_key(key):
                continue
            if key not in divisions:
                divisions[key] = {
                    "key": key, "slug": f"division-{key}",
                    "name": division.get("question") or "Recorded division",
                    "question": division.get("question"), "date": division.get("date"),
                    "house": division.get("house"), "jurisdiction": bill.get("jurisdiction", "federal"),
                    "ayes": division.get("ayes"), "noes": division.get("noes"),
                    "result": division.get("outcome"), "source_url": division.get("url"),
                    "members": [], "bills": [],
                    "_meta": {"member_coverage": "unavailable", "source": "published-bill-export", "schema": 1},
                }
            if link not in links.setdefault(key, []):
                links[key].append(link)
    for key, division in divisions.items():
        division["bills"] = links[key]
    return divisions


def database_projection(db, published):
    """Every recorded division, with named recorded votes and exact bill links."""
    db.row_factory = sqlite3.Row
    divisions = {}
    for row in db.execute(
            "SELECT id, name, question, date, house, jurisdiction, ayes_count, noes_count, result, source_url "
            "FROM ext_divisions ORDER BY id"):
        key = row["id"]
        if not publishable_key(key):
            continue
        divisions[key] = {
            "key": key, "slug": f"division-{key}", "name": row["name"],
            "question": row["question"] or row["name"], "date": row["date"],
            "house": row["house"], "jurisdiction": row["jurisdiction"],
            "ayes": row["ayes_count"], "noes": row["noes_count"], "result": row["result"],
            "source_url": row["source_url"], "members": [],
            "bills": published.get(key, {}).get("bills", []),
            "_meta": {"member_coverage": "recorded", "source": "parli.db-ext-divisions", "schema": 1},
        }
    seen = {}
    for row in db.execute(
            "SELECT division_id, person_id, person_name, vote, party FROM ext_votes "
            "ORDER BY division_id, person_name, person_id"):
        division = divisions.get(row["division_id"])
        if not division or not row["person_name"]:
            continue
        member = rules.publishable_member(
            {"name": row["person_name"], "person_id": row["person_id"],
             "person_slug": person_slug(row["person_name"]), "vote": row["vote"],
             **({"party": row["party"]} if row["party"] else {})})
        identity = (member["name"], member["person_id"])
        if identity not in seen.setdefault(row["division_id"], set()):
            division["members"].append(member)
            seen[row["division_id"]].add(identity)
    label_coverage(divisions)
    return divisions


def label_coverage(divisions):
    for division in divisions.values():
        ayes = sum(m["vote"] == "aye" for m in division["members"])
        noes = sum(m["vote"] == "no" for m in division["members"])
        if not division["members"]:
            division["_meta"]["member_coverage"] = "unavailable"
        elif ayes != division["ayes"] or noes != division["noes"]:
            division["_meta"]["member_coverage"] = "partial"
        else:
            division["_meta"]["member_coverage"] = "recorded"


def publication_rules(divisions, corrections=None):
    """Reviewed corrections, then withheld placeholders, coverage and duplicate flags.

    `corrections` defaults to scripts/corrections/divisions.json. Entries correct
    top-level source facts (ayes, noes, result, question, name) as the DB holds
    them, before placeholder questions are withheld. Each record carries what
    was applied, which is how the retention guard recognises a reviewed change.
    A stale entry stops the export (CorrectionError), all or none."""
    applied = apply_corrections(CORRECTIONS, divisions, entries=corrections)
    for entry in applied:
        divisions[entry["id"]]["_meta"].setdefault("corrections", []).append(
            {k: entry[k] for k in ("field", "from", "to", "finding", "evidence_url", "reviewed")})
    for division in divisions.values():
        division["question"] = rules.publishable_question(division["question"])
    label_coverage(divisions)
    flag_duplicates(divisions)
    return applied


def flag_duplicates(divisions):
    """_meta.duplicate_of for TVFY-marked repeats that prove out (see division_rules)."""
    federal = {k: (*(rules.tvfy_slot(d.get("source_url")) or (d["house"], d["date"], None)), d["name"], d["question"])
               for k, d in divisions.items() if d.get("jurisdiction") == "federal"}
    votes = {k: rules.vote_set((m.get("person_id"), m.get("vote")) for m in divisions[k]["members"]) for k in federal}
    duplicates = rules.find_duplicates(federal, votes)
    for key, original in duplicates.items():
        divisions[key]["_meta"]["duplicate_of"] = original
    return duplicates


def carry_verified_members(record, previous):
    """Keep an explicitly sourced snapshot only while its facts still match."""
    fields = ("key", "date", "house", "ayes", "noes", "source_url")
    meta = previous.get("_meta", {})
    members = previous.get("members", [])
    if meta.get("member_coverage") != "recorded" or not meta.get("member_source_url") \
            or any(record.get(field) != previous.get(field) for field in fields):
        return
    if sum(m.get("vote") == "aye" for m in members) != record.get("ayes") \
            or sum(m.get("vote") == "no" for m in members) != record.get("noes"):
        return
    record["members"] = members
    record["_meta"].update({k: v for k, v in meta.items() if k.startswith("member_")})


SOURCE_FACTS = ("key", "slug", "question", "date", "house", "jurisdiction", "ayes", "noes", "result", "source_url")
ACTUAL_VOTES = {"aye", "no", "paired", "abstain", "abstention"}


class RefreshDegradationError(ValueError):
    """A staged refresh would lose previously published evidence."""


def member_counts(record):
    members = record.get("members", [])
    return {
        "member_count": len(members),
        "named_member_count": len({person_slug(m.get("name")) for m in members if str(m.get("name") or "").strip()}),
        "recorded_vote_count": sum(m.get("vote") in ACTUAL_VOTES for m in members),
    }


def coverage_rank(record):
    """Validate completeness against the tally, rather than trust a label."""
    counts = member_counts(record)
    if not counts["named_member_count"]:
        return 0
    coverage = record.get("_meta", {}).get("member_coverage", "unavailable")
    if coverage == "recorded":
        members = record.get("members", [])
        if any(not str(m.get("name") or "").strip() or not m.get("vote") for m in members):
            return 1
        if sum(m.get("vote") == "aye" for m in members) == record.get("ayes") \
                and sum(m.get("vote") == "no" for m in members) == record.get("noes"):
            return 2
        return 1
    return 1 if coverage == "partial" else 0


def has_previous_member_evidence(candidate, previous):
    """Require every prior named vote, including absent and paired records.

    A newly discovered person id may enrich a prior name-only row. Known ids
    cannot disappear or change, and a replacement name with the same count is
    still a loss of evidence. This applies to partial snapshots too.
    """
    available = {}
    for member in candidate.get("members", []):
        identity = (person_slug(member.get("name")), member.get("vote"))
        available.setdefault(identity, set()).add(rules.canonical_person_id(member.get("person_id")))
    for member in previous.get("members", []):
        if not str(member.get("name") or "").strip():
            continue
        identity = (person_slug(member.get("name")), member.get("vote"))
        ids = available.get(identity, set())
        pid = member.get("person_id")
        # "11007" and "tvfy_11007" are one TVFY person id, spelt two ways.
        if not ids or (pid is not None and rules.canonical_person_id(pid) not in ids):
            return False
    return True


_REVIEWED = None


def reviewed_corrections():
    global _REVIEWED
    if _REVIEWED is None:
        _REVIEWED = {(e["id"], e["field"]): e for e in load_corrections(CORRECTIONS)}
    return _REVIEWED


def reviewed_change(candidate, field, old, new):
    """A changed source fact the guard accepts: only these two, both reviewed.

    1. A TVFY placeholder question withheld (it never recorded the question).
    2. A correction the record carries that is in scripts/corrections/divisions.json
       with exactly this from and to."""
    if field == "question" and isinstance(old, str) and old.strip() in rules.PLACEHOLDER_QUESTIONS \
            and rules.publishable_question(new) == new:
        return True
    entry = reviewed_corrections().get((candidate.get("key"), field))
    carried = any(c.get("field") == field and c.get("from") == old and c.get("to") == new
                  for c in candidate.get("_meta", {}).get("corrections", []))
    return bool(entry and carried and entry["from"] == old and entry["to"] == new)


def degradation_reason(candidate, previous):
    old_meta = previous.get("_meta", {})
    # Any disappearing source fact is a regression, including for records
    # without a named-vote export. For a pinned/full snapshot, changed facts
    # cannot be combined silently with its previously verified member evidence.
    pinned = bool(old_meta.get("member_source_url")) or bool(member_counts(previous)["named_member_count"])
    for field in SOURCE_FACTS:
        old, new = previous.get(field), candidate.get(field)
        if old is not None and (new is None or (pinned and new != old)) \
                and not reviewed_change(candidate, field, old, new):
            return "source-facts-changed"
    if coverage_rank(candidate) < coverage_rank(previous):
        return "member-coverage-regression"
    if member_counts(candidate)["named_member_count"] < member_counts(previous)["named_member_count"]:
        return "named-member-count-regression"
    if not has_previous_member_evidence(candidate, previous):
        return "member-evidence-regression"
    return None


def validate_record(record, key):
    if not publishable_key(key) or record.get("key") != key or record.get("slug") != f"division-{key}":
        raise ValueError(f"Invalid division identity: {key!r}")
    if not isinstance(record.get("members", []), list) or any(not isinstance(m, dict) for m in record.get("members", [])):
        raise ValueError(f"Invalid member rows for division {key}")
    if not isinstance(record.get("_meta", {}), dict):
        raise ValueError(f"Invalid metadata for division {key}")


def read_previous_projection(output):
    """Read all existing shards; refuse a broken index before any mutation."""
    previous = {}
    for path in sorted(output.glob("division-*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        key = record.get("key")
        validate_record(record, key)
        if path.name != f"{record['slug']}.json":
            raise ValueError(f"Division shard filename disagrees with its identity: {path.name}")
        previous[key] = record
    index_path = output / "index.json"
    if index_path.is_file():
        index = json.loads(index_path.read_text(encoding="utf-8"))
        rows = index.get("divisions", [])
        keys = {r.get("key") for r in rows}
        if len(keys) != len(rows) or index.get("count") != len(rows) or not keys <= previous.keys():
            raise RefreshDegradationError("Existing division index is incomplete or references missing shards")
    return previous


def guard_projection(records, previous, strict=False):
    """Return a monotone evidence projection with explicit retention flags."""
    for key, record in records.items():
        validate_record(record, key)
    guarded, retained = {}, {}
    for key in sorted(set(records) | set(previous)):
        candidate, old = records.get(key), previous.get(key)
        reason = "missing-division" if candidate is None else degradation_reason(candidate, old) if old else None
        record = deepcopy(old if reason else candidate)
        meta = record.setdefault("_meta", {})
        meta.setdefault("member_coverage", "unavailable")
        meta["refresh_retained"] = bool(reason)
        meta["refresh_retained_reason"] = reason
        meta.update(member_counts(record))
        guarded[key] = record
        if reason:
            retained[key] = reason
    if strict and retained:
        reasons = ", ".join(f"{k}: {v}" for k, v in sorted(retained.items()))
        raise RefreshDegradationError(f"Division refresh would degrade {len(retained)} records ({reasons})")
    return guarded


def party_tallies(record):
    parties = {}
    members = record.get("members", [])
    for member in members:
        if member.get("party"):
            votes = parties.setdefault(member["party"], Counter())
            votes[member["vote"]] += 1
    return {"party_tallies": [{"party": party, "votes": dict(votes)} for party, votes in sorted(parties.items())],
            "recorded_ayes": sum(m["vote"] == "aye" for m in members),
            "recorded_noes": sum(m["vote"] == "no" for m in members),
            "unknown_party_count": sum(not m.get("party") for m in members)}


def projection_index(records):
    """Links, coverage and dated party tallies are indexed; member names remain in shards."""
    retained = [d for d in records.values() if d["_meta"]["refresh_retained"]]
    source_counts = Counter(d["_meta"].get("source", "unknown") for d in records.values())
    member_sources = Counter(d["_meta"].get("member_source") or d["_meta"].get("source", "unknown")
                             for d in records.values() if d["_meta"]["named_member_count"])
    coverage = {
        "division_count": len(records), "retained_count": len(retained),
        "retained_by_reason": dict(sorted(Counter(d["_meta"]["refresh_retained_reason"] for d in retained).items())),
        "member_coverage_counts": dict(sorted(Counter(d["_meta"]["member_coverage"] for d in records.values()).items())),
        "duplicate_count": sum(bool(d["_meta"].get("duplicate_of")) for d in records.values()),
        "corrected_count": sum(bool(d["_meta"].get("corrections")) for d in records.values()),
        "source_counts": dict(sorted(source_counts.items())),
        "member_source_counts": dict(sorted(member_sources.items())),
        **{field: sum(d["_meta"][field] for d in records.values())
           for field in ("member_count", "named_member_count", "recorded_vote_count")},
        "party_filled_count": sum(bool(m.get("party_source")) and not m["party_source"].get("source_party")
                                  for d in records.values() for m in d.get("members", [])),
        "party_corrected_count": sum(bool((m.get("party_source") or {}).get("source_party"))
                                     for d in records.values() for m in d.get("members", [])),
        "party_withheld_count": sum(bool(m.get("party_withheld")) for d in records.values() for m in d.get("members", [])),
        "unknown_party_count": sum(not m.get("party") for d in records.values() for m in d.get("members", [])),
    }
    return {"schema": 2, "count": len(records), "coverage": coverage,
            "parties": sorted({m["party"] for d in records.values() for m in d.get("members", []) if m.get("party")}), "divisions": [
        {"key": d["key"], "slug": d["slug"], "date": d.get("date"), "bills": d.get("bills", []),
         **{field: d["_meta"][field] for field in (
             "member_coverage", "member_count", "named_member_count", "recorded_vote_count", "refresh_retained", "refresh_retained_reason")},
         "source": d["_meta"].get("source", "unknown"),
         **({"duplicate_of": d["_meta"]["duplicate_of"]} if d["_meta"].get("duplicate_of") else {}),
         **party_tallies(d)}
        for d in sorted(records.values(), key=lambda d: (d.get("date") or "", d["key"]), reverse=True)
    ]}


def write_projection(records, output, carry=False, strict=False, party_evidence=None):
    """Guard both DB and bill-only runs, stage every byte, then index last.

    `carry` remains accepted for existing callers; the guard now always protects
    previously published evidence. The returned records include retained rows.
    `party_evidence` (scripts/vote_parties.load_evidence) refills dated parties
    for rows the source leaves without one and checks source labels against
    them, from the source labels each run. None (--from-bills), or evidence
    without the dated release (check_labels False), recomputes nothing and
    keeps the previous fills and corrections as published.
    """
    output = Path(output)
    previous = read_previous_projection(output)
    guarded = guard_projection(records, previous, strict=strict)
    if party_evidence is not None and not getattr(party_evidence, "check_labels", True):
        # vote_parties.load_evidence has logged the missing release once.
        party_evidence = None
    if party_evidence is None:
        # Nothing is recomputed: a fresh record takes last run's fills and
        # corrections where its source label is unchanged (retained records
        # already carry them).
        for key, record in guarded.items():
            if key in previous and not record["_meta"]["refresh_retained"]:
                vote_parties.keep_published_parties(record, previous[key])
    else:
        # Before source parties are copied in: a party the source now publishes
        # must win over last run's roster fill, and a corrected or withheld
        # label goes back to its source label before it is checked again.
        vote_parties.clear_fills(guarded.values())
    # Enrich a retained snapshot only from matching dated source facts and votes.
    # Never substitute current-roster affiliations or discard its extra members.
    for key, record in guarded.items():
        candidate = records.get(key)
        if not candidate or not record["_meta"]["refresh_retained"]:
            continue
        if any(record.get(field) != candidate.get(field)
               for field in ("date", "house", "ayes", "noes", "source_url")):
            continue
        parties = {(person_slug(m.get("name")), m.get("vote")): m["party"]
                   for m in candidate.get("members", []) if m.get("party")}
        for member in record.get("members", []):
            party = parties.get((person_slug(member.get("name")), member.get("vote")))
            if party and not member.get("party") and not rules.office_code(member.get("party")):
                member["party"] = party
                record["_meta"]["party_source"] = "parli.db-ext-votes"
        # The title is not a source fact; take the DB's for the same division
        # (a bill-export projection used the motion text as its name).
        if candidate.get("name") and record.get("name") != candidate["name"]:
            record["name"] = candidate["name"]
    if party_evidence is not None:
        vote_parties.fill_dated_parties(guarded.values(), party_evidence)
    for record in guarded.values():
        page_ids = str(record.get("_meta", {}).get("member_source_url") or "").startswith("https://theyvoteforyou.org.au/")
        for member in record.get("members", []):
            rules.publishable_member(member, tvfy_page_ids=page_ids)
        record["question"] = rules.publishable_question(record.get("question"))
        candidate = records.get(record["key"])
        if candidate and candidate.get("_meta", {}).get("duplicate_of"):
            record["_meta"]["duplicate_of"] = candidate["_meta"]["duplicate_of"]
    index = projection_index(guarded)
    encode = lambda obj: (json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False) + "\n").encode("utf-8")
    # Validate serialization of the complete set before creating staging files.
    payloads = {f"{r['slug']}.json": encode(r) for r in guarded.values()}
    payloads["index.json"] = encode(index)
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".division-refresh-", dir=output) as staging:
        staged = Path(staging)
        for filename, payload in payloads.items():
            with (staged / filename).open("wb") as file:
                file.write(payload)
                file.flush()
                os.fsync(file.fileno())
        for filename in payloads:
            if filename != "index.json":
                target = output / filename
                if not target.is_file() or target.read_bytes() != payloads[filename]:
                    os.replace(staged / filename, target)
        target = output / "index.json"
        if not target.is_file() or target.read_bytes() != payloads["index.json"]:
            os.replace(staged / "index.json", target)
    return guarded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--bills", type=Path, default=ROOT / "portal/public/bills")
    parser.add_argument("--out", type=Path, default=ROOT / "portal/public/divisions")
    parser.add_argument("--from-bills", action="store_true")
    parser.add_argument("--strict-refresh", action="store_true", help="Refuse evidence regression before publishing any files")
    args = parser.parse_args()
    published = bill_projection(args.bills)
    if args.from_bills:
        records = published
        # No database, so no Wikidata terms: keep the previous fills as they are
        # rather than recompute from part of the evidence.
        evidence = None
    else:
        with closing(sqlite3.connect(f"file:{Path(args.db).resolve()}?mode=ro", uri=True)) as db:
            db.execute("PRAGMA query_only=ON")
            db.execute("BEGIN")
            records = database_projection(db, published)
            # Wikidata terms from the same snapshot as the votes.
            evidence = vote_parties.load_evidence(ROOT, db)
        publication_rules(records)
    records = write_projection(records, args.out, carry=args.from_bills, strict=args.strict_refresh,
                               party_evidence=evidence)
    coverage = projection_index(records)["coverage"]
    print(f"Exported {len(records)} divisions; {sum(bool(d['members']) for d in records.values())} with member records; "
          f"retained {coverage['retained_count']} previous records ({json.dumps(coverage['retained_by_reason'], sort_keys=True)}); "
          f"{coverage['party_filled_count']} rows given a dated roster party, "
          f"{coverage['party_corrected_count']} source labels replaced by the dated party, "
          f"{coverage['party_withheld_count']} source labels held back, {coverage['unknown_party_count']} rows without a party.")


if __name__ == "__main__":
    main()
