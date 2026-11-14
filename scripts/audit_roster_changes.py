#!/usr/bin/env python3
"""Account for every changed roster record against a frozen JSON or Git baseline.

Whole records are compared, including provenance and representation basis. A
change without an evidence-backed reason makes the audit fail. Changes a review
let in from a re-export (scripts/roster_accept.json) are validated by
scripts/roster_accept.py, reverted, and counted as 'export accepted'; what is left
must still be explained by the categories below.
"""
import argparse
import copy
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts import enrich_profile_jurisdictions as profiles
from scripts import roster_accept
from scripts import roster_fold
from scripts.split_roster_witnesses import restored_scope

CATEGORIES = ('witness split', 'mix-up corrected', 'witness-dominated', 'spans parliaments', 'alias normalisation', 'print folded', 'id folded')


def party_rows(rows, jurisdiction=None, party=None):
    return sum((jurisdiction is None or jurisdiction in p.get('states', [])) and
               (bool(p.get('party')) if party is None else party in
                [p.get('party'), *(p.get('parties') or [])]) for p in rows)


def folds(before, after, reference, same=None):
    """({print: person}, {person: expected row}): _folds() without its list of id folds."""
    return _folds(before, after, reference, same)[:2]


def _folds(before, after, reference, same=None):
    """Prints the `after` roster folded into a person, each proven on the baseline itself. A surname print
    (scripts/roster_fold.py decide) must be one the fold rule takes to that person there too; any other print is a
    row that shared the person's verified id (fold_ids), and the id rule must hold for the person's baseline row and
    those rows together. A state spelling twin ("Jodi Mckay" beside "Jodi McKay") must be one roster_fold.twin_target
    takes to that person on the baseline. Returns {print: person}, each person's expected row (the exact merge of their baseline
    row with their surname prints, then with their id's other rows, in name order as fold_ids merges them), and the
    set of prints folded by id."""
    folded = {stub: q['name'] for q in after for stub in q.get('prints') or []}
    old = {p['name']: p for p in before}
    registry = roster_fold.registry_from_reference(reference)
    expected, by_id = {}, defaultdict(list)
    for stub in [p['name'] for p in before if p['name'] in folded]:
        twin = roster_fold.twin_target(old[stub], before)
        if twin is not None and twin['name'] == folded[stub]:
            expected[twin['name']] = roster_fold.merge(expected.get(twin['name']) or copy.deepcopy(old[twin['name']]), old[stub])
            continue
        target, why = roster_fold.decide(old[stub], before, registry)
        if target is not None and target['name'] == folded[stub]:
            expected[target['name']] = roster_fold.merge(expected.get(target['name']) or copy.deepcopy(old[target['name']]), old[stub])
            continue
        if not old[stub].get('pid') or folded[stub] not in old:
            raise ValueError(f'Unproven fold: {stub} into {folded[stub]} ({why or "the rule picks " + target["name"]})')
        by_id[folded[stub]].append(old[stub])
    for person, rows in by_id.items():
        base = expected.get(person) or copy.deepcopy(old[person])
        why = roster_fold.id_problem([base, *rows], base, registry, same)
        if why:
            raise ValueError(f'Unproven id fold into {person}: {why}')
        expected[person] = roster_fold.merge_ids(base, [copy.deepcopy(r) for r in sorted(rows, key=lambda r: r['name'])])
    return folded, expected, {r['name'] for rows in by_id.values() for r in rows}


def audit(before, after, reference, reviewed, accepted=None):
    accepted_records = accepted_new = 0
    if accepted:
        problems = roster_accept.validate(accepted, after)
        if problems:
            raise ValueError('Invalid roster accept list: ' + '; '.join(problems[:5]))
        shipped = {p['name'] for p in after}
        accepted_records = sum(any(roster_accept.state(p, g) == 'applied' for g in accepted.get('records', {}).get(p['name'], []))
                               for p in after)
        accepted_new = sum(1 for n in accepted.get('new', {}) if n in shipped)
        after = roster_accept.revert(after, accepted)
    old = {p['name']: p for p in before}
    new = {p['name']: p for p in after}
    folded, merged, by_id = _folds(before, after, reference)
    if len(old) != len(before) or len(new) != len(after) or old.keys() - folded.keys() != new.keys():
        raise ValueError('Printed names must remain unique and unchanged')
    records = profiles.dated_records(reference, reviewed)
    prints = defaultdict(list)
    for p in before:
        if profiles.usable_alias(p['name']):prints[profiles.parts(p['name'])[-1]].append(p)
    changes = []
    for stub, person in folded.items():
        if stub not in by_id and roster_fold.name_key(stub) == roster_fold.name_key(person):
            changes.append(dict(name=stub, category='print folded', fields=['name'],
                                reason=f'Spelling twin folded into {person}: the same full name, houses, years and seat'))
        elif stub not in by_id:
            changes.append(dict(name=stub, category='print folded', fields=['name'],
                                reason=f'Surname print folded into {person}: one person by surname, party, houses, years and the members register'))
        else:
            changes.append(dict(name=stub, category='id folded', fields=['name'],
                                reason=f'Folded into {person}: the same verified person id, with agreeing names, a shared parliament, dated service and no second seat'))
    for name, p in old.items():
        if name in folded:continue
        q = new[name]
        if name in merged:
            # A person who took prints: exactly their baseline row plus the prints' speeches, houses and years.
            if merged[name] != q:
                raise ValueError('Modified folded person: '+name)
            continue
        if p == q:continue
        if q.get('speech_scope') and q.get('transcript'):
            expected = restored_scope(p, reference, reviewed, prints[profiles.parts(name)[-1]])
            if expected != q:
                raise ValueError('Unproven or modified witness split: '+name)
            reason = ('witness split', 'Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending')
        elif profiles.witness_dominated(p) and any(q.get(k) for k in
                ('pid', 'full', 'party', 'parties', 'party_now', 'current', 'representation', 'affiliations')):
            raise ValueError('Unproven unscoped identity on witness-dominated print: '+name)
        else:
            reason = profiles.change_reason(p, records, reference, reviewed, prints[profiles.parts(name)[-1]])
        changes.append(dict(name=name, category=reason[0] if reason else 'clean record changed',
                            reason=reason[1] if reason else 'No evidence permits a repair',
                            fields=sorted(k for k in p.keys() | q.keys() if p.get(k) != q.get(k))))
    counts = {c: sum(p['category'] == c for p in changes) for c in (*CATEGORIES, 'clean record changed')}
    # Reviewed re-export changes sit on top of the categories above (a record may be both), so they are counted apart.
    if accepted:
        counts['export accepted'] = accepted_records
    return dict(counts=counts, changed=len(changes), unchanged=len(before)-len(changes)-len(merged), folded_people=len(merged),
                accepted_new_rows=accepted_new, changes=changes)


def markdown(result, before, after, baseline):
    lines = ['# Roster witness-split diff against main', '', f'Baseline: `{baseline}`. Every field of every record is compared; metadata is excluded.', '',
             '| Category | Changed records | Sample |', '|---|---:|---|']
    for category, count in result['counts'].items():
        sample = [p['name'] for p in result['changes'] if p['category'] == category][:5]
        lines.append(f'| {category} | {count} | {", ".join(sample) or "—"} |')
    lines += ['', f'**{result["changed"]} changed; {result.get("folded_people", 0)} people took folded prints (exact merges); {result["unchanged"]} exactly unchanged; zero clean record changed is required.**',
              f'Reviewed re-export changes (scripts/roster_accept.json) are reverted before this comparison: {result["counts"].get("export accepted", 0)} records carry them, and {result.get("accepted_new_rows", 0)} accepted new rows are not compared with main.', '',
              'Categories are exclusive. Witness splits must exactly reproduce the shared scoped resolver, conserve aggregate counts, keep witnesses unattributed and enforce an own-house retrieval scope. This checks consistency with the resolver; correctness depends on the reviewed source evidence. Other changes retain the existing evidence categories.', '',
              '| Party rows / facet | Main | Split | Change |', '|---|---:|---:|---:|']
    for label, jur, party in [('Total rows with party', None, None), ('SA rows with party', 'sa', None),
            ('SA Labor', 'sa', 'Labor'), ('SA Liberal', 'sa', 'Liberal'), ('QLD rows with party', 'qld', None),
            ('QLD Labor', 'qld', 'Labor'), ('QLD LNP', 'qld', 'LNP'), ('QLD Independent', 'qld', 'Independent')]:
        a,b=party_rows(before,jur,party),party_rows(after,jur,party)
        lines.append(f'| {label} | {a} | {b} | {b-a:+} |')
    lines += ['', 'Party facets include both `party` and `parties`, matching the website. These are transcript-directory rows, not unique people or current seats.', '',
              '## Every changed record', '', '| Print | Category | Changed fields | Evidence permitting change |', '|---|---|---|---|']
    for p in result['changes']:
        lines.append(f'| {p["name"]} | {p["category"]} | {", ".join(p["fields"])} | {p["reason"]} |')
    lines += ['', 'Offline own-house, in-service counts are pending, with no number published. The original aggregate remains under `transcript`; separated witnesses have no MP identity, party or seat. The nightly SQL export computes the exact partition before resolving identity.', '']
    return '\n'.join(lines)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--baseline',default='origin/main',help='Git ref or frozen roster JSON')
    p.add_argument('--directory',type=Path,default=profiles.PUBLIC/'parliamentarians.json')
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--json-output',type=Path)
    p.add_argument('--accept',type=Path,default=roster_accept.ACCEPT,help='the reviewed accept list (scripts/roster_accept.json)')
    a=p.parse_args()
    path=Path(a.baseline)
    source=path.read_text() if path.is_file() else subprocess.check_output(
        ['git','show',a.baseline+':portal/public/parliamentarians.json'],cwd=profiles.ROOT,text=True)
    before=json.loads(source)['people'];after=json.loads(a.directory.read_text())['people']
    result=audit(before,after,profiles.pinned_reference(),json.loads(profiles.REVIEWED.read_text()),roster_accept.load(a.accept))
    label=a.baseline if path.is_file() else a.baseline+' ('+subprocess.check_output(
        ['git','rev-parse','--verify',a.baseline],cwd=profiles.ROOT,text=True).strip()+')'
    a.output.write_text(markdown(result,before,after,label))
    if a.json_output:a.json_output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='changes'}))
    if result['counts']['clean record changed']:raise SystemExit(1)


if __name__=='__main__':main()
