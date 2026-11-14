"""Zenodo provenance and logical chamber, including the former Main Committee."""
from __future__ import annotations

import os


def flagged(value) -> bool:
    if value is None or str(value).strip().lower() in ('', '0', '0.0', 'false', 'none', 'nan', 'na'):
        return False
    if str(value).strip().lower() in ('1', '1.0', 'true'):
        return True
    raise ValueError(f'Unknown fedchamb_flag: {value!r}')


def input_id(value) -> str | None:
    value = str(value).strip() if value is not None else ''
    return None if value.lower() in ('', 'na', 'none', 'nan') else value


def logical_chamber(value, flag=False) -> str:
    if flagged(flag):
        return 'federation'
    value = str(value or '').strip().lower()
    return value if value in ('representatives', 'senate', 'federation') else 'representatives'


def published_chamber(chamber: str) -> str:
    """Jake's publication switch. Never triggers a repair or a KB write itself."""
    if chamber == 'federation' and os.environ.get('OPAX_PUBLISH_FEDERATION') != '1':
        return 'representatives'
    return chamber


def published_person_chambers(chambers):
    """People retain House membership alongside their Federation speech venue."""
    values = list(dict.fromkeys(published_chamber(c) for c in chambers))
    if 'federation' in values and 'representatives' not in values:
        values.append('representatives')
    return values


def ensure_columns(db):
    columns = {r[1] for r in db.execute('PRAGMA table_info(speeches)')}
    for name, kind in (('fedchamb_flag', 'INTEGER'), ('source_input_id', 'TEXT'),
                       ('source_row_number', 'INTEGER')):
        if name not in columns:
            db.execute(f'ALTER TABLE speeches ADD COLUMN {name} {kind}')


class HouseMembership:
    """Share dated House evidence with votes; never build a Federation roster.

    Original source party stays in speeches.party. Unresolved affiliation stays
    NULL in party_canonical. Exact dated full names only, with reviewed holds,
    conflicting evidence, end-exclusive service and observed-through bounds.
    """
    def __init__(self, db, evidence=None):
        from scripts import vote_parties as V
        self.V = V
        self.evidence = evidence if evidence is not None else V.load_evidence(db=db)
        self.resolver = V.Resolver(self.evidence)
        self.members = {str(r[0]) for r in db.execute('SELECT person_id FROM members')}
        self.cache = {}

    def at(self, raw_name, day):
        from .speaker_names import normalize_speaker
        name = normalize_speaker(raw_name or '')
        key = (name, day)
        if key in self.cache:
            return self.cache[key]
        result = (None, None)
        # Surname-only evidence cannot establish an unambiguous input identity.
        if name and len(name.split()) >= 2:
            _, hits = self.resolver.match('representatives', day, name, None, set())
            hits = hits or []
            dated = [e for e in hits if self.V.covers(e, day)]
            ids = {pid for e in dated for pid in e['pids'] if pid in self.members}
            pid = next(iter(ids)) if len(ids) == 1 else None
            member = {'name': name, 'person_id': pid}
            held = self.evidence.held('representatives', member, day)
            party, _, _ = self.resolver.party_on(hits, day, same=self.V.same_party)
            if held:
                party = None
            elif party:
                party = self.V.dated_name(self.evidence.renames, party, day) or party
            result = (pid, party)
        self.cache[key] = result
        return result
