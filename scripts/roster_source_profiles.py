#!/usr/bin/env python3
"""Reproduce reviewed service profiles and explicit aliases from the published electorate reference.

Offline only. Run before the roster overlay in export_people.sh. The accept list still
controls installation; this supplies its reviewed source values when no speech row exists.
--publish-catalog adds reviewed OpenAustralia ids to the corresponding existing service
people using export_bundle, preserving their stable person ids and all other records.
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


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--directory', type=Path)
    ap.add_argument('--publish-catalog', action='store_true')
    ap.add_argument('--generated', default='2026-11-12')
    args = ap.parse_args()
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
