#!/usr/bin/env python3
"""Account for every changed roster record against a frozen JSON or Git baseline.

Whole records are compared, including provenance and representation basis. A
change without one of the four evidence-backed reasons makes the audit fail.
"""
import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts import enrich_profile_jurisdictions as profiles

CATEGORIES = ('mix-up corrected', 'witness-dominated', 'spans parliaments', 'alias normalisation')


def party_rows(rows, jurisdiction=None, party=None):
    return sum((jurisdiction is None or jurisdiction in p.get('states', [])) and
               (bool(p.get('party')) if party is None else party in
                [p.get('party'), *(p.get('parties') or [])]) for p in rows)


def audit(before, after, reference, reviewed):
    old = {p['name']: p for p in before}
    new = {p['name']: p for p in after}
    if len(old) != len(before) or len(new) != len(after) or old.keys() != new.keys():
        raise ValueError('Printed names must remain unique and unchanged')
    records = profiles.dated_records(reference, reviewed)
    prints = defaultdict(list)
    for p in before:
        if profiles.usable_alias(p['name']):prints[profiles.parts(p['name'])[-1]].append(p)
    changes = []
    for name, p in old.items():
        q = new[name]
        if p == q:continue
        reason = profiles.change_reason(p, records, reference, reviewed, prints[profiles.parts(name)[-1]])
        changes.append(dict(name=name, category=reason[0] if reason else 'clean record changed',
                            reason=reason[1] if reason else 'No evidence permits a repair',
                            fields=sorted(k for k in p.keys() | q.keys() if p.get(k) != q.get(k))))
    counts = {c: sum(p['category'] == c for p in changes) for c in (*CATEGORIES, 'clean record changed')}
    return dict(counts=counts, changed=len(changes), unchanged=len(before)-len(changes), changes=changes)


def markdown(result, before, after, baseline):
    lines = ['# Roster diff against main — round 4', '', f'Baseline: `{baseline}`. Every field of every record is compared; metadata is excluded.', '',
             '| Category | Changed records | Sample |', '|---|---:|---|']
    for category, count in result['counts'].items():
        sample = [p['name'] for p in result['changes'] if p['category'] == category][:5]
        lines.append(f'| {category} | {count} | {", ".join(sample) or "—"} |')
    lines += ['', f'**{result["changed"]} changed; {result["unchanged"]} exactly unchanged; zero clean record changed is required.**', '',
              'Categories are exclusive: majority-witness first, then unresolved weak multi-parliament prints, malformed aliases, and evidenced seat/party/name contradictions. Reviewed consistent same-person careers pass through exactly unchanged.', '',
              '| Party rows / facet | Main | Round 4 | Change |', '|---|---:|---:|---:|']
    for label, jur, party in [('Total rows with party', None, None), ('SA rows with party', 'sa', None),
            ('SA Labor', 'sa', 'Labor'), ('SA Liberal', 'sa', 'Liberal'), ('QLD rows with party', 'qld', None),
            ('QLD Labor', 'qld', 'Labor'), ('QLD LNP', 'qld', 'LNP')]:
        a,b=party_rows(before,jur,party),party_rows(after,jur,party)
        lines.append(f'| {label} | {a} | {b} | {b-a:+} |')
    lines += ['', 'Party facets include both `party` and `parties`, matching the website. These are transcript-directory rows, not unique people or current seats.', '',
              '## Every changed record', '', '| Print | Category | Changed fields | Evidence permitting change |', '|---|---|---|---|']
    for p in result['changes']:
        lines.append(f'| {p["name"]} | {p["category"]} | {", ".join(p["fields"])} | {p["reason"]} |')
    lines += ['', 'Witness splitting is a P2 follow-up: retain the MP identity only for their parliamentary-speaker rows and keep witness testimony separate. It is deliberately not implemented here.', '']
    return '\n'.join(lines)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--baseline',default='origin/main',help='Git ref or frozen roster JSON')
    p.add_argument('--directory',type=Path,default=profiles.PUBLIC/'parliamentarians.json')
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--json-output',type=Path)
    a=p.parse_args()
    path=Path(a.baseline)
    source=path.read_text() if path.is_file() else subprocess.check_output(
        ['git','show',a.baseline+':portal/public/parliamentarians.json'],cwd=profiles.ROOT,text=True)
    before=json.loads(source)['people'];after=json.loads(a.directory.read_text())['people']
    result=audit(before,after,profiles.pinned_reference(),json.loads(profiles.REVIEWED.read_text()))
    label=a.baseline if path.is_file() else a.baseline+' ('+subprocess.check_output(
        ['git','rev-parse','--verify',a.baseline],cwd=profiles.ROOT,text=True).strip()+')'
    a.output.write_text(markdown(result,before,after,label))
    if a.json_output:a.json_output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='changes'}))
    if result['counts']['clean record changed']:raise SystemExit(1)


if __name__=='__main__':main()
