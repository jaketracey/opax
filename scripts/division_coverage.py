"""Source-proved teller reconciliation and conservative held-table recovery.

The frozen phase 1 evidence cites each XML gid and file hash. A teller rule
applies only to that exact published date, chamber, totals, source and named
vote fingerprint. An arithmetic offset alone is never completeness evidence.
"""
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
from division_held_speeches import StateIdentities, held_speech_tables

ROOT = Path(__file__).resolve().parents[1]
RULE = 'source-excludes-tellers'


def fingerprint(record):
    rows = sorted((str(m.get('person_id') or '').removeprefix('tvfy_'), m['name'], m['vote'])
                  for m in record.get('members', []) if m['vote'] in ('aye', 'no'))
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


@lru_cache(maxsize=1)
def teller_evidence():
    baseline = json.loads((ROOT / 'docs/evidence/division-coverage-baseline.json').read_text())
    return {r['key']: r for r in baseline['rows'] if r['classification'] == 'a'}


def reconciliation(record):
    proof = teller_evidence().get(record.get('key'))
    if not proof or any((record.get('date') != proof['date'], record.get('house') != proof['chamber'],
                         record.get('source_url') != proof['source_url'],
                         [record.get('ayes'), record.get('noes')] != proof['official'])):
        return None
    xml = proof['xml']
    members = [m for m in record.get('members', []) if m['vote'] in ('aye', 'no')]
    ids = [str(m.get('person_id') or '').removeprefix('tvfy_') for m in members]
    if not all(ids) or len(set(ids)) != len(ids):
        return None
    counts = [sum(m['vote'] == vote for m in members) for vote in ('aye', 'no')]
    if counts != proof['named'] or fingerprint(record) != proof['member_sha256']:
        return None
    if not xml['same_votes'] or xml['counts'] != counts or any(
            named - teller != official for named, teller, official in zip(counts, xml['tellers'], proof['official'])):
        return None
    return dict(rule=RULE, key=record['key'], date=record['date'], house=record['house'],
                division_source_url=record['source_url'],
                named=counts, official=list(proof['official']), tellers=list(xml['tellers']),
                source_url=xml['url'], gid=xml['gid'], sha256=xml['sha256'],
                member_sha256=proof['member_sha256'])


def complete(record):
    members = record.get('members', [])
    if not members:
        return False
    counts = [sum(m.get('vote') == v for m in members) for v in ('aye', 'no')]
    return counts == [record.get('ayes'), record.get('noes')] or reconciliation(record) is not None


def fold(value):
    return unicodedata.normalize('NFKC', str(value or '')).casefold().replace('’', "'").strip()


def recover_table_members(db, records, slugger, sources=None):
    """Recover a missing print only when the whole table and dated identity agree.

    No inference from a tally, another division or a current roster. Unknown
    identities, seatless lower-house terms, duplicate table prints and
    contradictory sides leave the entire division untouched. A shortened held
    name array also needs the source's recorded full counts, and every added
    name must be printed explicitly and close the held tally exactly.
    Upper-house statewide seats are checked against the held official list.
    """
    columns = {r[1] for r in db.execute('PRAGMA table_info(ext_divisions)')}
    if 'extra' not in columns or not db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ext_state_roster'").fetchone():
        return
    db.row_factory = sqlite3.Row
    identity_resolver = StateIdentities(db, ROOT)
    if sources is None:
        sources = [dict(r) for r in db.execute('SELECT id,extra,source_url FROM ext_divisions WHERE extra IS NOT NULL')]
    for source in sources:
        record = records.get(source['id'])
        extra = json.loads(source['extra'] or '{}')
        tables = extra.get('table_names')
        if not record or not tables or complete(record):
            continue
        full_table = all(len(tables.get(v, [])) == record.get(total)
                         for v, total in (('aye', 'ayes'), ('no', 'noes')))
        if not full_table and any(extra.get('members_listed', {}).get(v) != record.get(total)
                                  or len(tables.get(v, [])) > record.get(total)
                                  for v, total in (('aye', 'ayes'), ('no', 'noes'))):
            continue
        table_source = source.get('table', 'ext_divisions.extra.table_names')
        sides = ('aye', 'no') if table_source == 'speeches.text' else ('aye', 'no', 'paired')
        known = [m for m in record['members'] if m['vote'] in sides]
        used, additions, identities = set(), [], set()
        valid = True
        for vote in sides:
            for printed in tables.get(vote, []):
                family = fold(re.sub(r'\s*\(teller\)\s*', '', printed, flags=re.I))
                matches = [i for i, m in enumerate(known) if fold(m['name']).split()[-1] == family]
                if matches:
                    if len(matches) != 1 or matches[0] in used or known[matches[0]]['vote'] != vote:
                        valid = False
                        break
                    used.add(matches[0])
                    continue
                identity = identity_resolver.resolve(family, record)
                if identity is None or identity['qid'] in identities:
                    valid = False
                    break
                identities.add(identity['qid'])
                provenance = dict(url=source['source_url'], table=table_source, printed=printed,
                                  **{k: v for k, v in identity.items() if k != 'name'})
                if source.get('speech_id'):
                    provenance.update(held_speech_id=source['speech_id'], held_speech_sha256=source['sha256'],
                                      matching='chamber-date-topic-totals-held-votes')
                additions.append(dict(name=identity['name'], person_id=None,
                                      person_slug=slugger(identity['name']), vote=vote, member_source=provenance))
            if not valid:
                break
        closes_tally = all(sum(m['vote'] == v for m in record['members'] + additions) == record.get(total)
                           for v, total in (('aye', 'ayes'), ('no', 'noes')))
        if valid and (not full_table or len(used) == len(known)) and additions and closes_tally:
            record['members'].extend(additions)
            record['members'].sort(key=lambda m: (m['name'], str(m.get('person_id') or '')))


def recover_speech_members(db, records, slugger):
    """Add only names in unique complete held lists; return the enriched keys."""
    sources = []
    for source in held_speech_tables(db, records).values():
        sources.append(dict(source, table='speeches.text', extra=json.dumps({'table_names': source['table_names']})))
    before = {key: len(d['members']) for key, d in records.items()}
    recover_table_members(db, records, slugger, sources=sources)
    return {key for key, d in records.items() if len(d['members']) > before[key]}
