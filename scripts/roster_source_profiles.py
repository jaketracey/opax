#!/usr/bin/env python3
"""Reproduce reviewed service profiles and explicit aliases from the published electorate reference.

Offline only. Run before the roster overlay in export_people.sh. The accept list still
controls installation; this supplies its reviewed source values when no speech row exists.
--publish-catalog adds reviewed OpenAustralia ids to the corresponding existing service
people using export_bundle, preserving their stable person ids and all other records.

Members of a reviewed dated official list (scripts/roster_state_evidence.json) with no roster row in
that chamber get list-only profiles, or a link to the one existing person with that exact full name
(official-list-member evidence). A review writes and installs them with
  python3 scripts/roster_source_profiles.py --propose-list sa_lc --evidence sa-council-list [--notes notes.json]
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.electorates import export_bundle  # noqa: E402
from scripts.roster_fold import name_key  # noqa: E402


def reference_spec(root=ROOT):
    public = Path(root) / 'portal/public'
    manifest = public / 'electorates/manifest.json'
    stat = manifest.stat()
    path, digest = _manifest_reference(manifest, stat.st_mtime_ns, stat.st_size)
    stat = path.stat()
    return path, digest, stat.st_mtime_ns, stat.st_size


@lru_cache(maxsize=4)
def _manifest_reference(manifest, _mtime, _size):
    data = json.loads(manifest.read_text())
    public = manifest.parent.parent
    path = public / data['reference_url'].lstrip('/')
    if not path.resolve().is_relative_to((public / 'electorates/releases').resolve()):
        raise ValueError('Reference path is outside the published releases')
    return path, data['files']['reference.json']


def reference(root=ROOT):
    return _read_reference(*reference_spec(root))


@lru_cache(maxsize=4)
def _read_reference(path, digest, _mtime, _size):
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError('Published reference digest differs from its manifest')
    return json.loads(raw)


def source_aliases(row, bundle):
    """Explicit source names of one person with the same verified legacy id and name. A person whose rows were
    folded by their verified id (scripts/roster_fold.py fold_ids) is matched through their prints as well: the
    roster may keep a printed spelling the source does not list, where the source has another of them."""
    pid = str(row.get('pid') or '')
    matches = [p for p in bundle['people'] if pid and str(p.get('legacy_person_id') or '') == pid]
    if len(matches) != 1:
        return None
    p = matches[0]
    names = [p['name'], *p.get('aliases', [])]
    if not {name_key(n) for n in [row['name'], *(row.get('prints') or [])]} & {name_key(n) for n in names}:
        return None
    # Source alternate-name columns can include a parsed byline or a glued title.
    # Keep explicit personal names, including initials and postnominals.
    def personal(n):
        words = name_key(n).split()
        return 2 <= len(words) <= 5 and not {'member', 'for'} & set(words)
    return list(dict.fromkeys(n for n in names if personal(n) and name_key(n) != name_key(row['name'])))


@lru_cache(maxsize=4096)
def _verified_aliases(path, digest, mtime, size, pid, name, prints=()):
    aliases = source_aliases({'pid': pid, 'name': name, 'prints': list(prints)}, _read_reference(path, digest, mtime, size))
    return tuple(aliases) if aliases is not None else None


def alias_problem(name, group, row, root=ROOT):
    if set(group.get('fields', {})) != {'aliases'} or row is None or row.get('name') != name:
        return 'source aliases require one existing roster person and only the aliases field'
    before, after = group['fields']['aliases']
    if (before is not None and not isinstance(before, list)) or not isinstance(after, list):
        return 'source aliases must be lists'
    if not set(before or []) <= set(after):
        return 'source aliases cannot remove a reviewed name'
    try:
        expected = _verified_aliases(*reference_spec(root), str(row.get('pid') or ''), row['name'], tuple(row.get('prints') or ()))
    except (OSError, ValueError, KeyError, TypeError):
        return 'the published name evidence cannot be verified'
    if expected is None or after != list(dict.fromkeys([*(before or []), *expected])):
        return 'aliases differ from the names of the source person with this verified id'
    return None


def service_row(entry, bundle):
    """Reconstruct an approved source-only row; never attribute a surname's speeches."""
    p = next(p for p in bundle['people'] if p['person_id'] == entry['catalog_person_id'])
    terms = [t for t in bundle['terms'] if t['person_id'] == p['person_id']]
    term = next(t for t in terms if t['representation_id'] == entry['catalog_term_id'])
    seat = next(e for e in bundle['electorates'] if e['electorate_id'] == term['electorate_id'])
    count = entry['oa_person_count']
    if (type(count) is not int or count < 0 or p['name'] not in entry['source_names']
            or p.get('legacy_person_id') not in (None, str(10000 + count))
            or entry['service'] != dict(chamber=seat['chamber'], jurisdiction=seat['jurisdiction'],
                                        start=term['start'], end=term['end'])
            or not set(entry['source_ids']) <= set(p['sources'])):
        raise ValueError('Reviewed service identity differs from the published source')
    name = entry['row']['name']
    if name_key(name).split() != [name_key(p['name']).split()[0], name_key(p['name']).split()[-1]]:
        raise ValueError('Service profile name differs from the source person')
    row = dict(name=name, speeches=0, states=[seat['jurisdiction']], chambers=[seat['chamber']],
               first=int(term['start'][:4]), last=int(term['end'][:4]), pid=str(10000 + count),
               roster_only=True, aliases=list(dict.fromkeys([p['name'], *p.get('aliases', [])])))
    labels = {v['party'] for v in term.get('party_periods', [])}
    if len(labels) == 1:
        row['party'] = next(iter(labels))
    row['representation'] = [dict(jurisdiction=seat['jurisdiction'], chamber=seat['chamber'], electorate=seat['name'],
                                  state=seat['state_code'].upper(),
                                  basis=f"OpenAustralia recorded service {term['start']} to {term['end']}; source-only profile, no speech attribution")]
    # The preferred alias is written back to the catalog on publication, not duplicated here.
    row['aliases'] = [n for n in row['aliases'] if name_key(n) != name_key(name)]
    return row


# A sitting member on a chamber's dated official list (scripts/roster_state_evidence.json) with no roster row in
# that chamber: Hansard OPAX holds ends before their term, so no speech row names them. The review writes a
# list-only profile for them (a new row), or, when one roster person already has that exact full name with a
# verified id and a seat in the same state, links that person to the chamber (a record group). Both are rebuilt
# here from the reviewed list, so a re-export reproduces them and a moved list holds them.
LIST_RULE = 'official-list-member'


def state_evidence(root=ROOT):
    return json.loads((Path(root) / 'scripts/roster_state_evidence.json').read_text())


def list_member(ref, name, state):
    """(snapshot, member) for `name` on the one reviewed official list `ref` ({chamber, as_of, sha256}) cites."""
    if not isinstance(ref, dict):
        raise ValueError('No official list cited')
    snaps = [s for s in state.get('snapshots', []) if s.get('chamber') == ref.get('chamber')
             and s.get('as_of') == ref.get('as_of') and s.get('sha256') == ref.get('sha256')]
    if len(snaps) != 1 or not str(snaps[0].get('source_url', '')).startswith('https://'):
        raise ValueError('The cited official list is not one reviewed snapshot')
    hits = [m for m in snaps[0].get('members', []) if m.get('name') == name]
    if len(hits) != 1 or not all(isinstance(hits[0].get(k), str) and hits[0][k].strip() for k in ('party', 'electorate')):
        raise ValueError('The member is not once on the cited official list, with a party and seat')
    return snaps[0], hits[0]


def list_ref(snap):
    return dict(chamber=snap['chamber'], as_of=snap['as_of'], sha256=snap['sha256'])


def list_seat(snap, member):
    return dict(jurisdiction=snap['jurisdiction'], chamber=snap['chamber'], electorate=member['electorate'],
                state=snap['jurisdiction'].upper(),
                basis=f"Official member list as at {snap['as_of']}; list-only service, no speech attribution")


def list_row(entry, state):
    """The list-only profile a reviewed `new` entry describes, rebuilt from the list itself."""
    snap, m = list_member(entry.get('list'), entry.get('list_name'), state)
    if entry.get('service') != dict(jurisdiction=snap['jurisdiction'], chamber=snap['chamber'], start=snap['as_of'], end=None):
        raise ValueError('Reviewed list service differs from the official list')
    year = int(snap['as_of'][:4])
    row = dict(name=m['name'], speeches=0, states=[snap['jurisdiction']], chambers=[snap['chamber']],
               first=year, last=year, roster_only=True)
    if m.get('aliases'):
        row['aliases'] = list(m['aliases'])
    row.update(party=m['party'], current=True, party_now=m['party'], representation=[list_seat(snap, m)])
    return row


def list_link(row, group, state):
    """{field: (from, to)}: an existing person `row` linked to the list chamber `group` cites. The person must be
    the list member by exact full name or listed alias, hold a verified id, sit for the same state, and not yet
    sit in that chamber; then the chamber, its state and the listed seat are added and nothing else moves."""
    snap, m = list_member(group.get('list'), group.get('list_name'), state)
    names = {name_key(n) for n in [m['name'], *m.get('aliases', [])]}
    if name_key(row['name']) not in names:
        raise ValueError('The linked person is not the list member by full name')
    if not str(row.get('pid') or '').isdigit():
        raise ValueError('The linked person has no verified id')
    seats = row.get('representation') or []
    if not any(str(r.get('state') or '').upper() == snap['jurisdiction'].upper() for r in seats):
        raise ValueError('The linked person holds no seat in the list state')
    states, chambers = list(row.get('states') or []), list(row.get('chambers') or [])
    if snap['chamber'] in chambers:
        raise ValueError('The linked person already sits in the list chamber')
    return {'states': (states, states + [snap['jurisdiction']] if snap['jurisdiction'] not in states else states),
            'chambers': (chambers, chambers + [snap['chamber']]),
            'representation': (seats, seats + [list_seat(snap, m)])}


def list_problem(name, entry, row=None, root=ROOT, link=False):
    """None when a reviewed list entry (a new row, or with link a record group on `row`) is exactly what the
    official list gives, else why it is held."""
    try:
        state = state_evidence(root)
        if link:
            if row is None or row.get('name') != name:
                return 'a list link needs one existing roster person'
            fields = group_fields(list_link(_from_row(row, entry), entry, state))
            return None if entry.get('fields') == fields else 'the link differs from the official list'
        built = list_row(entry, state)
        return None if entry.get('row') == built and name == built['name'] else 'the row differs from the official list'
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as err:
        return f'the official list does not give this entry ({err})'


def group_fields(link):
    return {f: [a, b] for f, (a, b) in link.items()}


def _from_row(row, group):
    """The row as it was before `group` applied (a shipped row may already hold the link)."""
    row = copy.deepcopy(row)
    for f, pair in (group.get('fields') or {}).items():
        if isinstance(pair, list) and len(pair) == 2 and row.get(f) == pair[1]:
            row[f] = pair[0]
    return row


def propose_list(doc, snap, evidence, checked, url):
    """(new entries, link groups, held): the review's proposals for every member of the official list `snap` with
    no roster row in its chamber. Matches a row by the list name, alias or reviewed print (folded), as the party
    index does. A member whose exact full name is one roster person with a verified id and a seat in the same
    state is linked; any other exact-name match is held for a person to decide; the rest get list-only rows."""
    chamber = snap['chamber']
    def keys(p):
        return {name_key(n) for n in [p['name'], p.get('full'), *(p.get('aliases') or []), *(p.get('prints') or [])] if n}
    in_chamber = set().union(*(keys(p) for p in doc['people'] if chamber in (p.get('chambers') or [])))
    new, links, held = {}, {}, []
    for m in snap['members']:
        names = {name_key(n) for n in [m['name'], *m.get('aliases', []), *m.get('prints', [])]}
        if names & in_chamber:
            continue
        full = {name_key(n) for n in [m['name'], *m.get('aliases', [])]}
        same = [p for p in doc['people'] if keys(p) & full]
        ref = list_ref(snap)
        if same:
            group = dict(evidence=evidence, list=ref, list_name=m['name'], url=url, checked=checked)
            try:
                if len(same) != 1:
                    raise ValueError('more than one roster person has this name')
                group['fields'] = group_fields(list_link(same[0], group, {'snapshots': [snap]}))
            except ValueError as err:
                held.append((m['name'], str(err)))
                continue
            links[same[0]['name']] = group
            continue
        entry = dict(evidence=evidence, url=url, checked=checked, list=ref, list_name=m['name'],
                     service=dict(jurisdiction=snap['jurisdiction'], chamber=chamber, start=snap['as_of'], end=None))
        entry['row'] = list_row(entry, {'snapshots': [snap]})
        new[m['name']] = entry
    return new, links, held


def enrich_lists(out, accept, state):
    """Lay the reviewed list rows and links onto an export (idempotent; never a second row for one name)."""
    rule = lambda key: accept.get('evidence', {}).get(key, {}).get('rule')  # noqa: E731
    by = {p['name']: p for p in out['people']}
    for name, groups in accept.get('records', {}).items():
        row = by.get(name)
        for group in groups:
            if row is None or rule(group.get('evidence')) != LIST_RULE:
                continue
            list_member(group.get('list'), group.get('list_name'), state)  # a moved list fails closed
            fields = group.get('fields') or {}
            # Only onto the reviewed `from` values: an export row that differs elsewhere is left as it is, and the
            # overlay keeps the shipped (linked) row and holds the group (roster_accept.apply: export moved).
            if all(row.get(f) == a for f, (a, _b) in fields.items()):
                for f, (_a, b) in fields.items():
                    row[f] = copy.deepcopy(b)
    held = {name_key(n) for p in out['people'] for n in [p['name'], p.get('full'), *(p.get('aliases') or [])] if n}
    for name, entry in accept.get('new', {}).items():
        if rule(entry.get('evidence')) != LIST_RULE:
            continue
        row = list_row(entry, state)
        if row != entry['row']:
            raise ValueError(f'Reviewed list profile moved: {name}')
        if name not in by and not ({name_key(n) for n in [row['name'], *row.get('aliases', [])]} & held):
            out['people'].append(row)
            by[name] = row
    return out


def enrich(doc, accept, bundle):
    from scripts.roster_state_parties import enrich as state_parties
    state = json.loads((ROOT / 'scripts/roster_state_evidence.json').read_text())
    out = state_parties(doc, accept, bundle, state)
    by = {p['name']: p for p in out['people']}
    for name, groups in accept.get('records', {}).items():
        row = by.get(name)
        for group in groups:
            ev = accept.get('evidence', {}).get(group['evidence'], {})
            if ev.get('rule') == 'catalog-aliases' and row is not None:
                aliases = source_aliases(row, bundle)
                if aliases is not None:
                    row['aliases'] = list(dict.fromkeys([*(group['fields']['aliases'][0] or []), *aliases]))
    for name, entry in accept.get('new', {}).items():
        if entry['evidence'] != 'openaustralia-service':
            continue
        row = service_row(entry, bundle)
        if row != entry['row']:
            raise ValueError(f'Reviewed source profile moved: {name}')
        if name not in by:
            out['people'].append(row)
    enrich_lists(out, accept, state)
    if 'meta' in out:
        out['meta']['people'] = len(out['people'])
    return out


def enrich_catalog(bundle, accept):
    out = copy.deepcopy(bundle)
    for entry in accept.get('new', {}).values():
        if entry['evidence'] != 'openaustralia-service':
            continue
        row = service_row(entry, out)
        if row != entry['row']:
            raise ValueError('Reviewed service profile moved')
        p = next(p for p in out['people'] if p['person_id'] == entry['catalog_person_id'])
        if any(other['person_id'] != p['person_id'] and str(other.get('legacy_person_id')) == row['pid'] for other in out['people']):
            raise ValueError('OpenAustralia id is already held by another source person')
        p['legacy_person_id'] = row['pid']
        if row['name'] not in [p['name'], *p['aliases']]:
            p['aliases'].append(row['name'])
    return out


def write_entries(text, links, new, accept):
    """The accept list's text with only these records' lines and new entries added, so the review diff shows
    just them (roster_accept.dump would re-sort the whole file)."""
    from scripts import roster_accept
    text = roster_accept.edit_records(text, {name: accept['records'][name] for name in links})
    added = [name for name in new if f'\n    {json.dumps(name, ensure_ascii=False)}: {{' not in text]
    if added:
        tail = '\n  }\n}\n'
        if not text.endswith(tail):
            raise ValueError('the accept list does not end with its "new" object')
        body = ''.join(f',\n    {json.dumps(n, ensure_ascii=False)}: ' +
                       json.dumps(accept['new'][n], ensure_ascii=False, indent=2).replace('\n', '\n    ') for n in added)
        text = text[:-len(tail)] + body + tail
    if json.loads(text) != accept:
        raise ValueError('the written accept list differs from the reviewed entries')
    return text


def install_list(chamber, evidence, root=ROOT, notes=None):
    """Write the review's list entries into scripts/roster_accept.json and lay them on the shipped roster with
    the accept list's own apply(), so the installed rows are exactly what a re-export reproduces. Idempotent."""
    from scripts import roster_accept
    root = Path(root)
    accept_path, roster_path = root / 'scripts/roster_accept.json', root / 'portal/public/parliamentarians.json'
    accept = roster_accept.load(accept_path)
    ev = accept.get('evidence', {}).get(evidence or '')
    if not ev or ev.get('rule') != LIST_RULE:
        raise SystemExit(f'--evidence must name an accept-list evidence entry with rule {LIST_RULE}')
    state = state_evidence(root)
    snap = max((s for s in state['snapshots'] if s.get('chamber') == chamber and s.get('sha256')), key=lambda s: s['as_of'])
    shipped = json.loads(roster_path.read_text())
    new, links, held = propose_list(shipped, snap, evidence, ev['checked'], ev['url'])
    for name, note in (notes or {}).items():  # the reviewer's evidence note per member, never read back
        for entry in [new.get(name), *[g for g in links.values() if g['list_name'] == name]]:
            if entry is not None:
                entry['note'] = note
    for name, entry in new.items():
        accept['new'].setdefault(name, entry)
    for name, group in links.items():
        groups = accept['records'].setdefault(name, [])
        if group not in groups:
            groups.append(group)
    accept_path.write_text(write_entries(accept_path.read_text(), links, new, accept))
    fresh = enrich_lists(copy.deepcopy(shipped), accept, state)
    people, report = roster_accept.apply(shipped['people'], fresh['people'], accept, root)
    listed = {m['name'] for m in snap['members']} | set(links)
    held += [(n, why) for n, why in report['held'] if n in listed]  # other reviewed changes are not this review's
    if report['blocked']:
        raise SystemExit(f"accept list blocked: {report['blocked']}")
    if people != shipped['people']:
        people = roster_accept.ordered(people)
        shipped = {**shipped, 'meta': roster_accept.recount(shipped['meta'], people), 'people': people}
        roster_path.write_text(json.dumps(shipped, ensure_ascii=False, separators=(',', ':')) + '\n')
    return held


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--directory', type=Path)
    ap.add_argument('--publish-catalog', action='store_true')
    ap.add_argument('--generated', default='2026-11-12')
    ap.add_argument('--propose-list', metavar='CHAMBER',
                    help="a review: write accept entries for the chamber's latest official list members with no roster "
                         'row, and install them in the shipped roster (needs --evidence)')
    ap.add_argument('--evidence', help='the accept-list evidence key (rule official-list-member) the entries cite')
    ap.add_argument('--notes', type=Path, help='a JSON object {list name: review note} for --propose-list')
    args = ap.parse_args()
    if args.propose_list:
        notes = json.loads(args.notes.read_text()) if args.notes else None
        held = install_list(args.propose_list, args.evidence, notes=notes)
        for name, why in held:
            print(f'ROSTER SOURCES: held {name}: {why}', file=sys.stderr)
        return
    try:
        accept = json.loads((ROOT / 'scripts/roster_accept.json').read_text())
    except (OSError, ValueError) as err:
        if args.publish_catalog:
            raise
        print(f'ROSTER SOURCES: held source additions ({type(err).__name__})', file=sys.stderr)
        return
    if args.publish_catalog:
        bundle = reference()
        manifest = export_bundle(enrich_catalog(bundle, accept), ROOT / 'portal/public/electorates', generated=args.generated)
        print(f"Published offline electorate identity release {manifest['release_id']}")
    if args.directory:
        try:
            bundle = reference()
            doc = enrich(json.loads(args.directory.read_text()), accept, bundle)
        except (OSError, ValueError, KeyError, TypeError, StopIteration, AttributeError) as err:
            print(f'ROSTER SOURCES: held source additions ({type(err).__name__}: {err})', file=sys.stderr)
            return
        args.directory.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    if not args.publish_catalog and not args.directory:
        ap.error('use --directory or --publish-catalog')


if __name__ == '__main__':
    main()
