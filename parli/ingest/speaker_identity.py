"""Reviewed dated House identities, shared by linking, exports and KB mapping.

The catalogue person ids are reused verbatim. Raw prints, parties and seat
columns remain evidence; only the resolved id and display name change.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from parli.ingest.speaker_names import normalize_speaker

EVIDENCE = json.loads(Path(__file__).with_name('federal_speaker_identities.json').read_text())
IDENTITIES = EVIDENCE['identities']
BY_ID = {p['person_id']: p for p in IDENTITIES}
BY_NAME = {p['name']: p for p in IDENTITIES}
HANDBOOK = {p['PHID']: p for p in EVIDENCE['handbook_people']}
FIRST_DAY = min(p['start'] for p in IDENTITIES)
LAST_DAY = max(p['end'] for p in IDENTITIES)
logger = logging.getLogger(__name__)


def identity_for(row):
    """One evidenced identity or None. A stale clean name cannot establish it."""
    row = dict(row)
    if (row.get('state') not in (None, '', 'federal')
            or row.get('chamber') != 'representatives'
            or row.get('source') not in ('zenodo', 'openaustralia')
            or row.get('speaker_type') in ('chair', 'unknown', 'witness')
            or row.get('witness_name')):
        return None
    day = row.get('date') or ''
    if not FIRST_DAY <= day <= LAST_DAY:
        return None
    printed = normalize_speaker(row.get('speaker_name'))
    for person in IDENTITIES:
        pid = row.get('person_id')
        if (printed not in person['prints'] or not person['start'] <= day <= person['end']
                or pid not in (None, '', person['old_person_id'], person['person_id'])):
            continue
        seat = (row.get('electorate') or '').strip()
        if seat != person['seat'] and not (not seat and person['allow_missing_seat']):
            continue
        return person
    return None


def resolve_attribution(row):
    """A derived row; safe on a read-only snapshot or an already repaired row."""
    result = dict(row)
    person = identity_for(result)
    if person:
        result.update(person_id=person['person_id'], speaker_name_clean=person['name'])
    return result


def member_rows():
    return [dict(person_id=p['person_id'], full_name=p.get('full_name', p['name']),
                 first_name=p['name'].rsplit(' ', 1)[0], last_name=p['name'].split()[-1],
                 state='federal', chamber=p['house'], electorate=p['seat'],
                 entered_house=HANDBOOK[p['phid']]['ServiceHistory_Start'],
                 left_house=HANDBOOK[p['phid']]['ServiceHistory_End']) for p in IDENTITIES]


def ensure_members(db, *, dry_run=False):
    """Install missing records; log and return conflicting ids to skip this run."""
    skipped = set()
    for member in member_rows():
        old = db.execute('SELECT full_name, chamber, electorate FROM members WHERE person_id = ?',
                         (member['person_id'],)).fetchone()
        if old and tuple(old) != (member['full_name'], member['chamber'], member['electorate']):
            skipped.add(member['person_id'])
            logger.warning('Skipping reviewed House identity %s: conflicts with members', member['person_id'])
            continue
        if not old and not dry_run:
            columns = {r[1] for r in db.execute('PRAGMA table_info(members)')}
            fields = [k for k in member if k in columns]
            db.execute('INSERT INTO members (' + ','.join(fields) + ') VALUES ('
                       + ','.join('?' for _ in fields) + ')', [member[k] for k in fields])
    return skipped


def identity_changes(db, *, skipped_person_ids=()):
    """Existing bad links and fresh unlinked rows, with the same evidence checks."""
    columns = {r[1] for r in db.execute('PRAGMA table_info(speeches)')}
    fields = [k for k in ('speech_id', 'person_id', 'speaker_name', 'speaker_name_clean',
                          'electorate', 'chamber', 'date', 'source', 'state',
                          'speaker_type', 'witness_name') if k in columns]
    rows = db.execute('SELECT ' + ','.join(fields) + " FROM speeches WHERE chamber = 'representatives' "
                      "AND source IN ('zenodo', 'openaustralia') AND date BETWEEN ? AND ?", (FIRST_DAY, LAST_DAY))
    for raw in rows:
        row = dict(zip(fields, raw))
        person = identity_for(row)
        if (person and person['person_id'] not in skipped_person_ids
                and (row.get('person_id'), row.get('speaker_name_clean')) != (person['person_id'], person['name'])):
            yield (row['speech_id'], person['person_id'], person['name'], 'dated_house_identity',
                   row.get('person_id'), row.get('speaker_name_clean'))


def apply_identities(db):
    """Nightly resolver pre-pass, including audit receipts and pending KB patches."""
    from parli.ingest.speaker_hygiene import RELINKS_DDL, now_iso
    skipped = ensure_members(db)
    db.executescript(RELINKS_DDL)
    changes = list(identity_changes(db, skipped_person_ids=skipped))
    stamp = now_iso()
    for sid, pid, name, reason, old_pid, old_name in changes:
        db.execute('UPDATE speeches SET person_id = ?, speaker_name_clean = ? WHERE speech_id = ?',
                   (pid, name, sid))
        db.execute('INSERT OR REPLACE INTO ext_committee_relinks VALUES (?,?,?,?,?,?,?,?)',
                   (sid, old_pid, old_name, name, 'member', name, reason, stamp))
        db.execute("INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?,?,'pending',?) "
                   "ON CONFLICT(slug) DO UPDATE SET reason=excluded.reason, status='pending', queued_at=excluded.queued_at",
                   (f'speech-{sid}', reason, stamp))
    db.commit()
    return len(changes)
