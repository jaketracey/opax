#!/usr/bin/env python3
"""Offline, reviewed state-party observations, never inferred service windows.

The state Hansards often omit party. A complete full name in a dated official
roster can supply a recorded affiliation only within the reviewed term guard.
Profiles spanning earlier terms stay empty until dated party history exists. Weekly exports regenerate
only per-record changes reviewed in roster_accept.json.
"""
import argparse
import copy
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
CHAMBERS = ('act_la', 'nsw_la', 'nsw_lc', 'nt_la', 'qld_la', 'sa_ha', 'sa_lc',
            'tas_ha', 'tas_lc', 'vic_la', 'vic_lc', 'wa_la', 'wa_lc')


def fold(value):
    return ' '.join(str(value or '').replace('’', "'").casefold().split())


def observations(bundle, state):
    """Keep each source's own observation date, names, chamber and party."""
    out = []
    for snapshot in state.get('snapshots', []):
        for member in snapshot['members']:
            out.append(dict(member, jurisdiction=snapshot['jurisdiction'], chamber=snapshot['chamber'],
                            as_of=member.get('as_of', snapshot['as_of']), source_url=snapshot['source_url']))
    people = {p['person_id']: p for p in bundle.get('people', [])}
    seats = {s['electorate_id']: s for s in bundle.get('electorates', [])}
    sources = {s['source_id']: s for s in bundle.get('sources', [])}
    for roster in bundle.get('rosters', []):
        # Current page observations must not revise reviewed speech-party history.
        if roster.get('observation_only'):
            continue
        seat = seats[roster['electorate_id']]
        official = [sources[s] for s in roster.get('sources', []) if s in sources
                    and not sources[s].get('label', '').startswith('OPAX existing')]
        if seat['jurisdiction'] == 'federal' or not roster.get('as_of') or not official:
            continue
        for member in roster['members']:
            person = people[member['person_id']]
            out.append(dict(name=person['name'], aliases=person.get('aliases', []),
                            jurisdiction=seat['jurisdiction'], chamber=seat['chamber'], electorate=seat['name'],
                            party=member.get('party'), as_of=roster['as_of'], catalog_id=person['person_id'],
                            source_url=person.get('source_url') or official[0]['url']))
    return out


def matches(row, observation):
    # A full source name, in its own house, is required. Surname and initials
    # resolution, folded prints and witness splits retain their existing guards.
    from scripts.roster_identity import weak
    names = {fold(observation['name']), *map(fold, observation.get('aliases', []))}
    try:
        date.fromisoformat(observation['as_of'])
    except (ValueError, TypeError):
        return False
    return (not weak(row.get('name', '')) and len(fold(row.get('name')).split()) >= 2 and fold(row['name']) in names
            and row.get('states') == [observation['jurisdiction']]
            and observation['chamber'] in row.get('chambers', [])
            and all(c in CHAMBERS and c.startswith(observation['jurisdiction'] + '_')
                    for c in row.get('chambers', []))
            and isinstance(row.get('first'), int) and isinstance(row.get('last'), int)
            and row['first'] <= int(observation['as_of'][:4]) <= row['last'])


def snapshot_window(row, source, reviewed):
    """A snapshot cannot back-fill earlier terms through profile.party fallbacks.

    Year-only speech bounds cannot prove a speech followed an election within
    that year. Require a later year, or an explicitly reviewed first-term case.
    Victorian parties already resolve from the dated seat roster and stay there.
    """
    window = reviewed.get('snapshot_party_windows', {}).get(source['chamber'])
    if not window or source['as_of'] < window['start']:
        return False
    if row['first'] > int(window['start'][:4]):
        return True
    first_term = window.get('first_terms', {}).get(row['name'])
    return bool(first_term and row['first'] >= int(first_term['start'][:4]))


def proposal(row, records, reviewed=None):
    if reviewed is None:
        reviewed = json.loads((ROOT / 'scripts/roster_service.json').read_text())
    if any(row.get(k) for k in ('party', 'party_now', 'parties', 'recorded_parties', 'affiliations',
                                'identity_basis', 'speech_scope', 'prints', 'witness_rows', 'separated_witnesses')):
        return None
    hits = [r for r in records if matches(row, r)]
    if not hits:
        return None
    date = max(r['as_of'] for r in hits)
    latest = [r for r in hits if r['as_of'] == date]
    identities = {(r.get('catalog_id') or fold(r['name']), r['jurisdiction'], r['chamber'], fold(r['electorate'])) for r in latest}
    parties = {r.get('party') for r in latest}
    if len(identities) != 1 or len(parties) != 1 or not next(iter(parties)):
        return None
    source = latest[0]
    if not snapshot_window(row, source, reviewed):
        return None
    from parli.ingest.speech_hygiene import clean_party
    party = clean_party(source['party']) or source['party']
    representation = copy.deepcopy(row.get('representation', []))
    if not any(r.get('jurisdiction') == source['jurisdiction'] and r.get('chamber') == source['chamber']
               and fold(r.get('electorate')) == fold(source['electorate']) for r in representation):
        representation.append(dict(jurisdiction=source['jurisdiction'], chamber=source['chamber'],
                               electorate=source['electorate'], state=source['jurisdiction'].upper(),
                               as_of=source['as_of'], source_url=source['source_url'],
                               basis='Official parliamentary roster on the stated date; full name and chamber verified'))
    return dict(party=party, representation=representation), source


def group_problem(name, group, row, root=ROOT):
    """Recheck the source even for already-installed groups; fail closed."""
    try:
        from scripts.roster_source_profiles import reference
        bundle = reference(root)
        state = json.loads((Path(root) / 'scripts/roster_state_evidence.json').read_text())
        fields = group['fields']
        if not set(fields) <= {'party', 'representation'} or 'party' not in fields or fields['party'][0] is not None:
            return 'state-party observation must add only a missing party and its representation'
        original = copy.deepcopy(row)
        for field, (before, _) in fields.items():
            if before is None:
                original.pop(field, None)
            else:
                original[field] = before
        reviewed = json.loads((Path(root) / 'scripts/roster_service.json').read_text())
        result = proposal(original, observations(bundle, state), reviewed)
        if not result or original['name'] != name:
            return 'no unambiguous full-name official state-party observation'
        values, source = result
        expected = {k: [original.get(k), v] for k, v in values.items() if original.get(k) != v}
        if fields != expected or group.get('url') != source['source_url'] or group.get('as_of') != source['as_of']:
            return 'state-party observation differs from the published source'
    except (OSError, ValueError, TypeError, KeyError):
        return 'state-party observation cannot be verified'
    return None


def enrich(doc, accept, bundle, state, reviewed=None):
    out = copy.deepcopy(doc)
    by = {r['name']: r for r in out['people']}
    records = observations(bundle, state)
    for name, groups in accept.get('records', {}).items():
        for group in groups:
            if accept.get('evidence', {}).get(group['evidence'], {}).get('rule') != 'state-party-snapshot':
                continue
            row = by.get(name)
            if row is None:
                continue
            # Raw export may have an empty or independently derived seat. Do
            # not copy reviewed values blindly: the source must reproduce them.
            result = proposal(row, records, reviewed)
            if result:
                values, _ = result
                row.update(values)
    return out


def audit(doc, bundle, state, since='2026-01-01'):
    """Missing profile parties among members of the latest dated 2026 lists.

    Seat-catalog parties already reach the app via its seats-first lookup.
    Missing profiles are a separate count, not a party attributed to a person.
    No suitable current roster means unknown, never zero.
    """
    records = observations(bundle, state)
    out = {}
    for chamber in CHAMBERS:
        current = [r for r in records if r['chamber'] == chamber and r['as_of'] >= since]
        if not current:
            out[chamber] = dict(members=None, missing_party=None, missing_profile=None)
            continue
        date = max(r['as_of'] for r in current)
        current = [r for r in current if r['as_of'] == date]
        unique = {(fold(r['name']), fold(r['electorate'])): r for r in current}
        missing = absent = raw_missing = 0
        for source in unique.values():
            names = {fold(source['name']), *map(fold, source.get('aliases', []))}
            rows = [r for r in doc['people'] if source['jurisdiction'] in r.get('states', [])
                    and chamber in r.get('chambers', []) and names & {
                        fold(r.get('name')), fold(r.get('full')), *map(fold, r.get('aliases', []))}]
            absent += not bool(rows)
            raw = {r.get('party_now') or r.get('party') for r in rows} - {None, ''}
            raw_missing += not bool(raw)
            parties = {source['party']} if source.get('catalog_id') and source.get('party') else raw
            missing += not bool(parties)
        out[chamber] = dict(as_of=date, members=len(unique), missing_party=missing,
                            missing_profile=absent, missing_roster_party=raw_missing)
    return out


def main():
    from scripts.roster_source_profiles import reference
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--audit', type=Path, required=True, help='audit a roster JSON against existing dated source lists')
    args = ap.parse_args()
    state = json.loads((ROOT / 'scripts/roster_state_evidence.json').read_text())
    print(json.dumps(audit(json.loads(args.audit.read_text()), reference(), state), indent=2))


if __name__ == '__main__':
    main()
