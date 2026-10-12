"""
parli.ingest.speeches -- Load Hansard speeches into the parli database.

Data sources:
  1. Zenodo Parquet historical corpus
     (~/.cache/autoresearch/hansard/hansard-corpus.zip)
  2. Modern JSONL files from download_hansard.py
     (~/.cache/autoresearch/hansard/modern/*.jsonl)

For each speech, inserts into the speeches table with word_count calculated.
Skips very short speeches (<50 chars). Strips HTML tags.
Reconciles modern chamber-days to permanent citations; deduplicates new bodies.

Usage:
    python -m parli.ingest.speeches                # load all available data
    python -m parli.ingest.speeches --modern-only   # skip historical Zenodo data
    python -m parli.ingest.speeches --since 2024-01-01  # only speeches after date
"""

import hashlib
import json
import re
import zipfile
from io import BytesIO
from pathlib import Path


from parli.ingest import fts
from parli.ingest.dedup import build_seen
from parli.schema import get_db, init_db

CACHE_DIR = Path("~/.cache/autoresearch/hansard").expanduser()
MODERN_DIR = CACHE_DIR / "modern"
ZENODO_ZIP = CACHE_DIR / "hansard-corpus.zip"

HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"[ \t]+")

BATCH_SIZE = 1000


def clean_text(text: str) -> str | None:
    """Strip HTML, collapse whitespace. Return None if too short (<50 chars)."""
    text = HTML_TAG_RE.sub("", text)
    text = MULTI_SPACE_RE.sub(" ", text).strip()
    if len(text) < 50:
        return None
    return text


def text_hash(text: str) -> str:
    """Return a short SHA-256 hex digest for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def load_zenodo_parquet(db, seen: set[str]) -> int:
    """Load speeches from Zenodo historical corpus. Returns count inserted."""
    if not ZENODO_ZIP.exists():
        print(f"  Zenodo zip not found: {ZENODO_ZIP}")
        return 0

    import pyarrow.parquet as pq

    count = 0
    pending = 0
    with zipfile.ZipFile(str(ZENODO_ZIP), "r") as zf:
        parquet_names = [n for n in zf.namelist() if n.endswith(".parquet")]
        print(f"  Found {len(parquet_names)} parquet file(s) in zip")
        for pq_name in sorted(parquet_names):
            print(f"  Processing {pq_name}...")
            with zf.open(pq_name) as f:
                data = f.read()
            table = pq.read_table(BytesIO(data))
            columns = table.column_names

            # Detect columns -- the corpus uses "body" for speech text
            text_col = next(
                (c for c in ["body", "speech", "text", "speech_text"]
                 if c in columns),
                None,
            )
            if not text_col:
                print(f"    No text column found in {pq_name}, skipping")
                continue

            speaker_col = next(
                (c for c in ["name", "speaker", "speaker_name"] if c in columns),
                None,
            )
            party_col = next(
                (c for c in ["party", "party_name", "party_abbrev"] if c in columns),
                None,
            )
            electorate_col = next(
                (c for c in ["electorate", "constituency"] if c in columns),
                None,
            )
            date_col = next(
                (c for c in ["date", "speech_date", "sitting_date"] if c in columns),
                None,
            )
            chamber_col = next(
                (c for c in ["chamber", "house"] if c in columns),
                None,
            )

            for i in range(len(table)):
                raw = table.column(text_col)[i].as_py()
                if not raw:
                    continue
                text = clean_text(raw)
                if not text:
                    continue

                speaker = (
                    table.column(speaker_col)[i].as_py() if speaker_col else None
                ) or ""
                party = (
                    table.column(party_col)[i].as_py() if party_col else None
                ) or ""
                electorate = (
                    table.column(electorate_col)[i].as_py() if electorate_col else None
                ) or ""
                speech_date = (
                    str(table.column(date_col)[i].as_py()) if date_col else "1901-01-01"
                )
                chamber = (
                    table.column(chamber_col)[i].as_py() if chamber_col else ""
                ) or ""
                chamber = chamber.lower().strip()
                if chamber not in ("representatives", "senate"):
                    chamber = "representatives"

                # Deduplicate
                dedup_key = f"{speaker}|{speech_date}|{text_hash(text)}"
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                word_count = len(text.split())

                db.execute(
                    """
                    INSERT INTO speeches
                    (person_id, speaker_name, party, electorate, chamber,
                     date, topic, text, word_count, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        None,
                        speaker,
                        party,
                        electorate,
                        chamber,
                        speech_date,
                        None,
                        text,
                        word_count,
                        "zenodo",
                    ),
                )
                count += 1
                pending += 1

                if pending >= BATCH_SIZE:
                    db.commit()
                    pending = 0
                    print(f"    ... {count} speeches loaded")

    db.commit()
    return count


XML_COLUMNS = ('gid', 'oa_office_id', 'citation_anchor', 'talktype', 'speaker_type',
               'chair_role', 'source_url', 'source_attribution',
               'enrichment_run_id', 'enrichment_max_usd')


def ensure_xml_columns(db):
    """Retain XML identity, role and source provenance on newly loaded rows."""
    columns = {r[1] for r in db.execute('PRAGMA table_info(speeches)')}
    for column in XML_COLUMNS:
        if column not in columns:
            db.execute(f'ALTER TABLE speeches ADD COLUMN {column} TEXT')
    db.execute('CREATE INDEX IF NOT EXISTS idx_speeches_gid ON speeches(gid)')


def load_modern_jsonl(db, seen: set[str], since: str | None = None, report=None, until=None,
                      modern_dir=None, missing_days_only=False, backfill_run=None) -> int:
    """Reconcile complete chamber-days before inserting new citation IDs.

    Existing days are retained in full. Even one unmatched XML speech prevents
    any new rows on that day; the report contains its gid and reason. New days
    deduplicate normalized bodies as well as gids, including within the batch.
    """
    from .speech_reconciliation import SpeechReconciler
    directory = Path(modern_dir) if modern_dir is not None else MODERN_DIR
    if not directory.exists():
        print(f"  Modern dir not found: {directory}")
        return 0
    ensure_xml_columns(db)
    count = 0
    reconciler = SpeechReconciler(db)
    db.commit()
    for filepath in sorted(directory.glob('*.jsonl')):
        parts = filepath.stem.split('_', 1)
        if len(parts) != 2:
            continue
        day, house = parts
        if (since and day < since) or (until and day > until):
            continue
        if house not in ('representatives', 'senate'):
            continue
        if missing_days_only:
            # Keep the zero-row recheck and insertion in the same write lock.
            db.execute('BEGIN IMMEDIATE')
        existing, bodies, gids, identities = reconciler.day(house, day)
        if missing_days_only and existing:
            if report is not None:
                report.append({'date': day, 'chamber': house, 'existing_rows': len(existing),
                               'added': 0, 'held': 'occupied-day'})
            db.commit()
            continue
        entry = {'date': day, 'chamber': house, 'existing_rows': len(existing),
                 'matched': [], 'unmatched': [], 'added': 0, 'duplicate_bodies': 0,
                 'short_speeches': 0, 'inserted_ids': []}
        with filepath.open(encoding='utf-8') as stream:
            records = [json.loads(line) for line in stream if line.strip()]
        for prepared in reconciler.prepare(records, house, day):
            record = prepared['record']
            if prepared['reason']:
                entry['unmatched'].append({'gid':record.get('gid'), 'reason':prepared['reason']})
                continue
            raw = record.get('text', '')
            text = clean_text(raw)
            speaker = record.get('speaker', '') or ''
            pid, identity = prepared['pid'], prepared['identity']
            gid = record.get('gid')
            key = (identity, prepared['body'])
            matches = bodies.get(key, [])
            sid = gids.get(gid) if gid else None
            if sid is not None and identities[sid] != identity:
                entry['unmatched'].append({'gid':gid, 'reason':'gid-identity-conflict'})
                continue
            basis = 'gid' if sid is not None else 'normalized-body'
            if sid is None and len(matches) == 1:
                sid = matches[0]
            if sid is not None:
                reconciler.remember(gid, sid)
                if gid:
                    gids[gid] = sid
                entry['matched'].append({'gid': gid, 'speech_id': sid, 'basis': basis})
                if not existing:
                    entry['duplicate_bodies'] += 1
                continue
            if existing:
                entry['unmatched'].append({'gid': gid, 'reason': 'ambiguous-body' if matches else 'no-match'})
                continue
            if not text:
                entry['short_speeches'] += 1
                continue
            dedup_key = f"{speaker}|{day}|{text_hash(text)}"
            cursor = db.execute(
                """INSERT INTO speeches
                (person_id,speaker_name,party,electorate,chamber,date,topic,text,word_count,source)
                VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (pid, speaker, record.get('chair_role') or record.get('party') or '', record.get('electorate') or '',
                 house, day, record.get('topic') or None, text, len(text.split()), 'openaustralia'))
            sid = cursor.lastrowid
            db.execute('UPDATE speeches SET ' + ','.join(f'{c}=?' for c in XML_COLUMNS) +
                       ' WHERE speech_id=?', tuple(record.get(c) for c in XML_COLUMNS) + (sid,))
            if backfill_run:
                db.execute('INSERT INTO oa_backfill_owned (run_id,speech_id,gid,chamber,date) '
                           'VALUES (?,?,?,?,?)', (backfill_run, sid, gid, house, day))
            identities[sid] = identity
            reconciler.remember(gid, sid)
            if gid:
                gids[gid] = sid
            bodies[key].append(sid)
            seen.add(dedup_key)
            count += 1
            entry['added'] += 1
            entry['inserted_ids'].append(sid)
        entry['fully_reconciled'] = not entry['unmatched']
        if report is not None:
            report.append(entry)
        if backfill_run:
            db.execute('UPDATE oa_backfill_days SET receipt=? WHERE run_id=? AND chamber=? AND date=?',
                       (json.dumps(entry),backfill_run,house,day))
        print(f"  {day} {house}: {entry['added']} added, {len(entry['matched'])} reconciled, "
              f"{len(entry['unmatched'])} unmatched; {len(existing)} existing citations retained")
        db.commit()
    return count


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Load Hansard speeches into the parli database."
    )
    parser.add_argument("--modern-only", action="store_true",
                        help="Skip historical Zenodo data")
    parser.add_argument("--since", type=str, default=None,
                        help="Only load speeches after this date (YYYY-MM-DD)")
    parser.add_argument("--report", help="Write chamber-day reconciliation evidence as JSON")
    parser.add_argument("--until", help="Last modern chamber-day to load (inclusive)")
    fts.add_argument(parser)
    args = parser.parse_args()

    db = get_db()
    init_db(db)

    # Modern days reconcile through a date/chamber index. Only the historical
    # loader needs the legacy global hash set (and its full-table text scan).
    seen = set()
    if not args.modern_only:
        print("Building historical deduplication index from existing speeches...")
        seen = build_seen(db, text_hash)
        print(f"  {len(seen)} existing speeches indexed")

    if not args.modern_only:
        print("\nLoading Zenodo historical speeches...")
        n_zenodo = load_zenodo_parquet(db, seen)
        print(f"  Loaded {n_zenodo} historical speeches")

    print("\nLoading modern JSONL speeches...")
    reconciliation = []
    n_modern = load_modern_jsonl(db, seen, since=args.since, report=reconciliation, until=args.until)
    if args.report:
        from .openaustralia_xml import atomic
        atomic(Path(args.report), json.dumps(reconciliation, indent=2))
    print(f"  Loaded {n_modern} modern speeches")

    total = db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0]
    print(f"\nTotal speeches in DB: {total}")

    # The full-text index is brought up to date by scripts/fts_sync.py (new rows only); a full
    # rebuild from here is opt-in (--rebuild-fts / OPAX_FTS_REBUILD=1).
    if fts.rebuild_wanted(args.rebuild_fts):
        print("\nRebuilding FTS5 index...")
        db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
        db.commit()
        fts_count = db.execute(
            "SELECT COUNT(*) FROM speeches_fts WHERE speeches_fts MATCH '\"the\"'"
        ).fetchone()[0]
        print(f"  FTS5 index rebuilt ({fts_count} entries match test query)")
    else:
        print("\nFTS5 index not rebuilt (scripts/fts_sync.py indexes new rows; --rebuild-fts for a full rebuild)")


if __name__ == "__main__":
    main()
