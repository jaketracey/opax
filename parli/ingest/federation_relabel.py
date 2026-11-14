"""Offline Federation census and budgeted, idempotent metadata relabel.

No network client, publication, inserts or citation replacement. Measurement
opens its database read-only. --apply is an explicit local metadata write;
the desktop snapshot is always protected. Stage files contain speech bodies
and must stay outside the public repository.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import time
import zipfile

from .federation import HouseMembership, ensure_columns, flagged, input_id
from .speeches import clean_text

SNAPSHOT = Path('/home/jake/.cache/autoresearch/parli.db')
CSV_ENTRY = 'hansard-corpus/hansard_corpus_1998_to_2022.csv'


def protected_snapshot(path):
    path = Path(path).expanduser()
    return (path.resolve() == SNAPSHOT.resolve()
            or path.exists() and SNAPSHOT.exists() and path.samefile(SNAPSHOT))


def load_guard():
    while os.getloadavg()[1] > 40:
        print('Paused: load5 exceeds 40', flush=True)
        time.sleep(5)


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def file_digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for part in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            load_guard()
            h.update(part)
    return h.hexdigest()


def read_input(path):
    csv.field_size_limit(16 * 1024 * 1024)
    turns, unflagged, years = [], set(), defaultdict(Counter)
    with zipfile.ZipFile(path) as z:
        with z.open(CSV_ENTRY) as raw:
            for number, row in enumerate(csv.DictReader(io.TextIOWrapper(raw)), 1):
                if number % 10000 == 0:
                    load_guard()
                if number % 100000 == 0:
                    print(f'Read {number} input turns', flush=True)
                flag = flagged(row['fedchamb_flag'])
                year = row['date'][:4]
                text = clean_text(row['body'] or '')
                if not flag:
                    if text:
                        unflagged.add((row['date'], digest(text)))
                    continue
                years[year]['flagged_input'] += 1
                if not text:
                    continue
                years[year]['loader_eligible'] += 1
                years[year]['length_200'] += int(len(text) >= 200)
                turns.append(dict(date=row['date'], text=text, body_sha256=digest(text),
                                  source_input_id=input_id(row['uniqueID']),
                                  source_row_number=number, speaker=row['name']))
    return turns, unflagged, years


def measure(db, turns, unflagged, years):
    """Match only Zenodo provenance; report other-source exact matches separately.

    Original ID takes priority and must agree with date and exact body. Missing
    IDs fall back to a unique exact dated body. Ambiguous bodies/flags are held.
    Every held row is counted once even if the input repeats a turn.
    """
    input_bodies = {(t['date'], t['body_sha256']): t['text'] for t in turns}
    bodies, ids, other = defaultdict(list), defaultdict(list), Counter()
    day_counts = defaultdict(Counter)
    columns = {r[1] for r in db.execute('PRAGMA table_info(speeches)')}
    original = 'source_input_id' if 'source_input_id' in columns else 'NULL'
    hearing = 'hearing_type' if 'hearing_type' in columns else 'NULL'
    # The older snapshot has no date/chamber index. Reject out-of-series
    # dates before SQLite reads their large overflow text. When retained IDs
    # exist, keep the global ID conflict check across the entire series.
    bounds, params = '', ()
    if turns and 'source_input_id' not in columns:
        first, last = min(t['date'][:4] for t in turns), max(t['date'][:4] for t in turns)
        bounds, params = ' AND date>=? AND date<?', (first+'-01-01', str(int(last)+1)+'-01-01')
    for n, row in enumerate(db.execute(
            f'SELECT speech_id,date,text,source,chamber,{original} AS source_input_id,{hearing} AS hearing_type FROM speeches '
            "WHERE chamber IN ('representatives','federation')"+bounds, params)):
        if n % 10000 == 0:
            load_guard()
        key = (row['date'], digest(row['text']))
        if row['chamber'] == 'representatives' and not row['hearing_type']:
            day_counts[row['date'][:4]][row['date']] += 1
        if key in input_bodies and row['text'] == input_bodies[key]:
            if row['chamber'] == 'representatives':
                years[row['date'][:4]]['held_representatives_exact_rows'] += 1
                if row['source'] == 'zenodo':
                    years[row['date'][:4]]['held_zenodo_exact_rows'] += 1
            if row['source'] == 'zenodo':
                bodies[key].append(row['speech_id'])
            elif row['chamber'] == 'representatives':
                other[row['date'][:4]] += 1
        if row['source'] == 'zenodo' and row['source_input_id']:
            ids[row['source_input_id']].append(row['speech_id'])
    proposals = defaultdict(list)
    for turn in turns:
        year = turn['date'][:4]
        key = (turn['date'], turn['body_sha256'])
        candidates = ids.get(turn['source_input_id'], []) if turn['source_input_id'] else []
        basis = 'original_id' if candidates else 'exact_dated_body'
        if not candidates:
            if key in unflagged:
                years[year]['held_mixed_flag'] += 1
                continue
            candidates = bodies.get(key, [])
        if len(candidates) != 1:
            years[year]['held_ambiguous' if candidates else 'unmatched_input'] += 1
            continue
        row = db.execute(f'SELECT date,text,{original} AS source_input_id FROM speeches WHERE speech_id=?', candidates).fetchone()
        if (row['date'] != turn['date'] or row['text'] != turn['text']
                or row['source_input_id'] and row['source_input_id'] != turn['source_input_id']):
            years[year]['held_id_conflict'] += 1
            continue
        proposals[candidates[0]].append({**turn, 'basis': basis})
    plan = []
    for sid, copies in sorted(proposals.items()):
        turn = copies[0]
        year = turn['date'][:4]
        originals = {t['source_input_id'] for t in copies if t['source_input_id']}
        if len(originals) > 1:
            years[year]['held_multiple_original_ids'] += 1
            continue
        chamber = db.execute('SELECT chamber FROM speeches WHERE speech_id=?', (sid,)).fetchone()[0]
        years[year]['matched_rows'] += 1
        years[year]['matched_' + turn['basis']] += 1
        years[year]['already_federation' if chamber == 'federation' else 'relabels'] += 1
        years[year]['repeated_input_collapsed'] += len(copies) - 1
        speaker = db.execute('SELECT speaker_name FROM speeches WHERE speech_id=?', (sid,)).fetchone()[0]
        same_speaker = [other_sid for other_sid in bodies[(turn['date'], turn['body_sha256'])]
                        if db.execute('SELECT speaker_name FROM speeches WHERE speech_id=?', (other_sid,)).fetchone()[0] == speaker]
        if len(same_speaker) > 1:
            from .arag_sync import JUNK_PREDICATES
            same_speaker = [candidate for candidate in same_speaker if db.execute(
                'SELECT speech_id FROM speeches WHERE speech_id=?'+JUNK_PREDICATES, (candidate,)).fetchone()]
        plan.append({k: v for k, v in dict(turn, speech_id=sid,
                    source_input_id=next(iter(originals), None),
                    # Zenodo has the highest public dedupe priority. Confirm
                    # that any ID-selected duplicate is the exact-body winner.
                    dedupe_winner=bool(same_speaker) and sid == min(same_speaker)
                    ).items() if k not in ('text', 'speaker')})
    for year, count in other.items():
        years[year]['other_source_exact_rows_unverified'] = count
    moving = defaultdict(Counter)
    for item in plan:
        row = db.execute('SELECT chamber FROM speeches WHERE speech_id=?', (item['speech_id'],)).fetchone()
        if row[0] == 'representatives':
            moving[item['date'][:4]][item['date']] += 1
    for year in list(years):
        held = day_counts[year]
        years[year]['representatives_before_rows'] = sum(held.values())
        years[year]['representatives_before_days'] = len(held)
        years[year]['representatives_after_rows'] = sum(held.values()) - sum(moving[year].values())
        years[year]['representatives_after_days'] = sum(n > moving[year][day] for day, n in held.items())
    return plan


def apply_plan(db, plan, max_rows, membership=None):
    """Validate the entire plan and budget under one write lock before changing rows."""
    if max_rows is None or max_rows < 1:
        raise ValueError('--max-rows must be a positive explicit relabel budget')
    target = db.execute('PRAGMA database_list').fetchone()[2]
    if target and protected_snapshot(target):
        raise ValueError('The read-only desktop snapshot may never be modified')
    if len({p['speech_id'] for p in plan}) != len(plan):
        raise ValueError('Duplicate speech IDs in plan')
    membership = membership or HouseMembership(db)
    db.execute('BEGIN IMMEDIATE')
    try:
        columns = {r[1] for r in db.execute('PRAGMA table_info(speeches)')}
        changes = []
        for number, item in enumerate(plan):
            if number % 1000 == 0:
                load_guard()
            row = db.execute('SELECT * FROM speeches WHERE speech_id=?', (item['speech_id'],)).fetchone()
            if (row is None or row['source'] != 'zenodo' or row['chamber'] not in ('representatives', 'federation')
                    or row['date'] != item['date'] or digest(row['text']) != item['body_sha256']
                    or ('source_input_id' in columns and row['source_input_id']
                        and row['source_input_id'] != item['source_input_id'])):
                raise ValueError(f"Stale/conflicting plan for speech-{item['speech_id']}")
            if (row['chamber'] == 'representatives' or 'fedchamb_flag' not in columns or row['fedchamb_flag'] != 1
                    or any(k not in columns or row[k] != item[k] for k in ('source_input_id', 'source_row_number'))):
                changes.append((item, row))
        if len(changes) > max_rows:
            raise ValueError(f'{len(changes)} relabels exceed --max-rows {max_rows}; no changes')
        ensure_columns(db)
        for number, (item, row) in enumerate(changes):
            if number % 1000 == 0:
                load_guard()
            pid, party = membership.at(row['speaker_name'], row['date'])
            db.execute("UPDATE speeches SET chamber='federation', fedchamb_flag=1, source_input_id=?, "
                       'source_row_number=?, person_id=?, party_canonical=? WHERE speech_id=?',
                       (item['source_input_id'], item['source_row_number'], pid, party, item['speech_id']))
        db.commit()
        return len(changes)
    except BaseException:
        db.rollback()
        raise


def stage(args):
    out = Path(args.stage).resolve()
    repo = Path(__file__).resolve().parents[2]
    if out.is_relative_to(repo):
        raise ValueError('Stage outside the public repository (contains speech bodies)')
    out.mkdir(parents=True, exist_ok=True)
    source = Path(args.db).resolve()
    before = source.stat()
    turns, unflagged, years = read_input(args.zip)
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA query_only=ON')
        plan = measure(db, turns, unflagged, years)
        print(f'Matched {len(plan)} distinct rows', flush=True)
    plan_file = out / 'relabels.jsonl'
    plan_file.write_text(''.join(json.dumps(p, sort_keys=True) + '\n' for p in plan))
    changed = 0
    if args.apply:
        # Rehearsal callers supply a completed scratch copy, never the snapshot.
        with sqlite3.connect(source) as db:
            db.row_factory = sqlite3.Row
            changed = apply_plan(db, plan, args.max_rows)
    public = export_payloads(source, plan, out, years)
    after_counts = [dict(year=int(year), rows=years[year]['representatives_after_rows'],
                         speech_days=years[year]['representatives_after_days']) for year in sorted(years)]
    acknowledgements = []
    today = datetime.now(timezone.utc).date()
    for counts in after_counts:
        if years[str(counts['year'])]['relabels']:
            acknowledgements.append(dict(id=f"fedchamb-{counts['year']}-REPLACE-WITH-APPROVED-RUN-ID",
                kind='accepted_regression', chambers=['representatives'], year=counts['year'],
                start=str(today), end=str(today+timedelta(days=14)),
                counts={k: counts[k] for k in ('rows', 'speech_days')},
                reason='Reviewed Federation Chamber metadata transfer; no rows removed',
                lane='im/fedchamb', evidence='REPLACE-WITH-APPROVED-OWNER-SNAPSHOT-RECEIPT'))
    (out/'watchdog-acknowledgements.DRAFT.json').write_text(json.dumps(acknowledgements, indent=2)+'\n')
    report = dict(schema_version=1, snapshot=dict(path=str(source), size=before.st_size,
        mtime_ns=before.st_mtime_ns), input=dict(path=str(Path(args.zip).resolve()),
        sha256=file_digest(args.zip), entry=CSV_ENTRY),
        annual=[dict(year=y, **years[y]) for y in sorted(years)],
        totals=dict(sum((years[y] for y in years), Counter())),
        matched_rows=len(plan), eligible_kb_documents=public, changed_rows=changed,
        plan_sha256=file_digest(plan_file), publication_enabled=False, kb_writes=0, d1_writes=0,
        representatives_after=after_counts)
    if not args.apply and source.stat().st_mtime_ns != before.st_mtime_ns:
        raise ValueError('Source changed during read-only measurement')
    (out/'measurement.json').write_text(json.dumps(report, indent=2)+'\n')
    fields = ['year'] + sorted({k for c in years.values() for k in c})
    with (out/'annual.csv').open('w') as f:
        writer = csv.DictWriter(f, fields, lineterminator='\n')
        writer.writeheader()
        writer.writerows(dict.fromkeys(fields, 0) | dict(year=y, **years[y]) for y in sorted(years))
    print(json.dumps({k: report[k] for k in ('matched_rows', 'eligible_kb_documents', 'changed_rows', 'totals')}))
    return report


def export_payloads(source, plan, out, years):
    from . import arag_sync as S
    count = 0
    with sqlite3.connect(source.as_uri()+'?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        membership = HouseMembership(db)
        # All planned rows are Zenodo: never wragge or the OA-on-Zenodo-date
        # exclusion. The matcher verifies the exact-body winner for Zenodo,
        # which has highest priority in arag_sync.prepare_dedupe(). Avoid a
        # second whole-table text sort on the 29 GB desktop snapshot.
        allowed = 'date >= ? AND LENGTH(text)>=?' + S.JUNK_PREDICATES
        with (out/'kb-payloads.jsonl').open('w') as f:
            for item in plan:
                load_guard()
                if not item.get('dedupe_winner', True):
                    continue
                row = db.execute('SELECT * FROM speeches WHERE speech_id=? AND '+allowed,
                                 (item['speech_id'], S.DEFAULT_SINCE, S.MIN_SPEECH_CHARS)).fetchone()
                if row is None:
                    continue
                row = dict(row)
                pid, party = membership.at(row['speaker_name'], row['date'])
                row.update(chamber='federation', fedchamb_flag=1, person_id=pid, party_canonical=party,
                           source_input_id=item['source_input_id'], source_row_number=item['source_row_number'])
                payload = S.map_speech(row)
                # A held preview of the approved future payload, never a write.
                for label in payload['usermetadata']['classifications']:
                    if label['labelset'] == 'chamber':
                        label['label'] = 'federation'
                f.write(json.dumps(payload)+'\n')
                count += 1
                years[item['date'][:4]]['eligible_kb_documents'] += 1
    return count


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', required=True)
    ap.add_argument('--zip', default=str(SNAPSHOT.parent/'hansard/hansard-corpus.zip'))
    ap.add_argument('--stage', required=True)
    ap.add_argument('--apply', action='store_true', help='explicit local DB relabel, publication still off')
    ap.add_argument('--max-rows', type=int)
    ap.add_argument('--plan', help='Apply an already-measured relabels.jsonl instead of repeating the census')
    args = ap.parse_args(argv)
    if args.apply and protected_snapshot(args.db):
        ap.error('The desktop snapshot is read-only; use a scratch copy')
    if args.apply and (args.max_rows is None or args.max_rows < 1):
        ap.error('--apply requires an explicit positive --max-rows budget')
    if args.plan:
        if not args.apply:
            ap.error('--plan requires --apply and an explicit row budget')
        plan = [json.loads(line) for line in Path(args.plan).read_text().splitlines() if line]
        with sqlite3.connect(args.db) as db:
            db.row_factory = sqlite3.Row
            before = db.execute('SELECT COUNT(*),MIN(speech_id),MAX(speech_id),SUM(speech_id) FROM speeches').fetchone()
            changed = apply_plan(db, plan, args.max_rows)
            after = db.execute('SELECT COUNT(*),MIN(speech_id),MAX(speech_id),SUM(speech_id) FROM speeches').fetchone()
            if tuple(before) != tuple(after):
                raise ValueError('Citation census changed')
            for number, item in enumerate(plan):
                if number % 1000 == 0:
                    load_guard()
                row = db.execute('SELECT text,chamber,source_input_id FROM speeches WHERE speech_id=?', (item['speech_id'],)).fetchone()
                if digest(row['text']) != item['body_sha256'] or row['chamber'] != 'federation':
                    raise ValueError('Relabel verification failed')
            report = dict(changed_rows=changed, citation_census=list(after),
                          preserved_bodies=len(plan), plan_sha256=file_digest(args.plan),
                          publication_enabled=False, kb_writes=0, d1_writes=0)
            Path(args.stage).mkdir(parents=True, exist_ok=True)
            (Path(args.stage)/'rehearsal.json').write_text(json.dumps(report, indent=2)+'\n')
            print(json.dumps(report))
        return
    stage(args)


if __name__ == '__main__':
    main()
