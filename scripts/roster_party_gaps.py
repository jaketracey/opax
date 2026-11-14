#!/usr/bin/env python3
"""Reviewed party joins for full-name profiles, from offline source evidence.

No surname, initial, speech-linker id or open-ended party membership establishes
identity. A source must name the full person in the same house with dated service
overlapping the profile. P4100 is the party of that P39 term. P102 supplies a
period only when explicitly dated; an undated membership never dates a career.
The accept list controls installation and rechecks every proposed field.
"""
from __future__ import annotations

import copy
from datetime import date, timedelta
import json
from pathlib import Path

from scripts.roster_fold import name_key
from scripts.roster_identity import weak

ROOT = Path(__file__).resolve().parents[1]
RULE = 'profile-party-service'
EVIDENCE = ROOT / 'scripts/roster_party_evidence.json'
FIELDS = {'party', 'parties', 'affiliations'}


def read(root=ROOT):
    return json.loads((Path(root) / 'scripts/roster_party_evidence.json').read_text())


def matches(row, source):
    """Full name AND own house AND overlapping dated service, never id alone."""
    return (not weak(row.get('name', '')) and name_key(row['name']) == name_key(source['name'])
            and (not source.get('pid') or not row.get('pid') or str(source['pid']) == str(row['pid']))
            and row.get('states') == [source['jurisdiction']]
            and source['chamber'] in row.get('chambers', [])
            and isinstance(row.get('first'), int) and isinstance(row.get('last'), int)
            and int(source['start'][:4]) <= row['last']
            and int((source.get('end') or source['as_of'])[:4]) >= row['first'])


def proposal(row, evidence):
    if any(row.get(k) for k in ('party', 'party_now', 'parties', 'recorded_parties', 'affiliations',
                                'prints', 'speech_scope', 'identity_basis', 'witness_rows', 'separated_witnesses')):
        return None
    sources = [s for s in evidence['people'] if matches(row, s)]
    if len({s['identity'] for s in sources}) != 1:
        return None
    houses = {c for c in row.get('chambers', []) if 'committee' not in c}
    complete = houses == {s['chamber'] for s in sources}
    # Each service term reaching the profile must have a party; do not project
    # the party of a later seat or house over an earlier unknown term.
    complete &= bool(sources) and all(s.get('periods') or s.get('undated') for s in sources)
    periods = [dict(p, jurisdiction=s['jurisdiction'], chamber=s['chamber'],
                    electorate=s.get('electorate'), as_of=s['as_of'],
                    source_url=s['source_url'], basis=s['basis'])
               for s in sources for p in s.get('periods', [])]
    undated = {party for s in sources for party in s.get('undated', [])}
    parties = {p['party'] for p in periods} | undated
    if not parties:
        return None
    for i, a in enumerate(periods):
        for b in periods[i + 1:]:
            if (a['chamber'] == b['chamber'] and a['party'] != b['party']
                    and max(a['start'], b['start']) <= min(a.get('end') or a['through'], b.get('end') or b['through'])):
                return None
    # An unknown interval must remain unknown. Coverage is checked in years
    # because that is the precision the speech directory exports. Exact party
    # boundaries are retained in affiliations, including through on open terms.
    if periods:
        for chamber in houses:
            service = [s for s in sources if s['chamber'] == chamber]
            for s in service:
                if s.get('undated'):
                    continue
                pp = s.get('periods', [])
                lo, hi = max(s['start'], f"{row['first']}-01-01"), min(s.get('end') or s['as_of'], f"{row['last']}-12-31")
                if not pp or min(p['start'][:4] for p in pp) > lo[:4] or max((p.get('end') or p['through'])[:4] for p in pp) < hi[:4]:
                    complete = False
                ordered = sorted(pp, key=lambda p: p['start'])
                if any(date.fromisoformat(a.get('end') or a['through']) + timedelta(days=1) < date.fromisoformat(b['start'])
                       for a, b in zip(ordered, ordered[1:])):
                    complete = False
    latest = max(periods, key=lambda p: (p.get('end') or p['through'], p['start']))['party'] if periods else next(iter(undated))
    if undated and (len(undated) != 1 or periods):
        return None
    result = {'party': latest} if complete else {}
    if complete and len(parties) > 1:
        result['parties'] = [latest, *sorted(parties - {latest})]
    if periods:
        # Duplicate Wikidata bindings do not duplicate exported service.
        unique = {json.dumps(p, sort_keys=True): p for p in periods}
        result['affiliations'] = sorted(unique.values(), key=lambda p: (p['start'], p['chamber'], p['party']))
    return result


def group_problem(name, group, row, root=ROOT):
    try:
        fields = group['fields']
        if not fields or not set(fields) <= FIELDS or not {'party', 'affiliations'} & set(fields) or any(a is not None for a, _ in fields.values()):
            return 'party service may only add missing party fields'
        original = copy.deepcopy(row)
        for field in fields:
            original.pop(field, None)
        values = proposal(original, read(root))
        if name != original['name'] or values is None or fields != {k: [None, v] for k, v in values.items()}:
            return 'party service differs from the full-name dated source'
        sources = [s for s in read(root)['people'] if matches(original, s)]
        if group.get('url') not in {s['source_url'] for s in sources}:
            return 'party service source URL differs'
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return 'party service cannot be verified'
    return None


def own_dates(row, group):
    pair = group['fields'].get('affiliations')
    return bool(pair and pair[0] is None and row.get('affiliations') in (None, pair[1]))


def enrich(doc, accept, evidence=None):
    out = copy.deepcopy(doc)
    for row in out['people']:
        for group in accept.get('records', {}).get(row['name'], []):
            if accept.get('evidence', {}).get(group['evidence'], {}).get('rule') == RULE:
                evidence = evidence if evidence is not None else read()
                values = proposal(row, evidence)
                if values:
                    row.update(values)
    return out


def source_fields(shipped, fresh, accept, root=ROOT):
    """Supply independently sourced fields even if SQL lost or folded a print.

    The overlay keeps the shipped identity and speech counts. It may obtain
    these additive party facts from their reviewed source rather than requiring
    a broken speech-linker key to reproduce them. Its normal judge still
    validates all groups and protections before any field is installed.
    """
    out = copy.deepcopy(fresh)
    by = {p['name']: p for p in out['people']}
    for row in shipped['people']:
        groups = accept.get('records', {}).get(row['name'], [])
        if not isinstance(groups, list):
            continue  # The normal judge reports this malformed entry.
        for g in groups:
            if not isinstance(g, dict) or not isinstance(g.get('evidence'), str):
                continue
            ev = accept.get('evidence', {}).get(g.get('evidence'))
            if not isinstance(ev, dict) or ev.get('rule') != RULE:
                continue
            if group_problem(row['name'], g, row, root):
                continue
            target = by.get(row['name'])
            if target is None:
                target = {'name': row['name']}
                out['people'].append(target)
                by[row['name']] = target
            # An independently changed nonempty export value holds the group.
            if any(target.get(f) not in (None, b) for f, (_a, b) in g['fields'].items()):
                continue
            for field, (_a, value) in g['fields'].items():
                target[field] = copy.deepcopy(value)
    return out
