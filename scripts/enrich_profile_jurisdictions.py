#!/usr/bin/env python3
"""Attach representation without trusting a contaminated members-table seat or party.

Read-only inputs: exported members table and the existing public directory.
Does not trust person_id alone, infer service dates, or treat Senate committees
as another parliament. Retired members' electorates are labelled as recorded.
"""
import argparse
import copy
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.roster_identity import agrees, guard_print, mixed_print, state_member_matches, weak

PUBLIC = ROOT / 'portal/public'
REVIEWED = ROOT / 'scripts/roster_service.json'

REGIONS={'ACT':'Australian Capital Territory','NSW':'New South Wales','VIC':'Victoria','QLD':'Queensland','SA':'South Australia','WA':'Western Australia','TAS':'Tasmania','NT':'Northern Territory'}

def key(s):
    return re.sub(r'\s+',' ',str(s or '').replace('’',"'").strip()).casefold()

def enrich(people,members,seats,reference=None,reviewed=None):
    by_name=defaultdict(list)
    for m in members:by_name[key(m['full_name'])].append(m)
    seat_states={key(s['name']):s['state'] for s in seats}
    for person in people:
        matches=[]
        if mixed_print(person):
            guard_print(person)
            person['representation']=[]
            continue
        states=person.get('states',[])
        for member in by_name[key(person['name'])]:
            jur=member.get('state') or 'federal'
            chamber=member.get('chamber')
            if jur not in states or chamber not in person.get('chambers',[]):continue
            if weak(person['name']) and not state_member_matches(person,{
                'name':member['full_name'],'state':jur,'chamber':chamber,
                'start':member.get('entered_house'),'end':member.get('left_house')}):continue
            electorate=str(member.get('electorate') or '').strip()
            if not electorate or key(electorate) in {'unknown','n/a','none'}:continue
            region=REGIONS.get(electorate.upper(),electorate) if chamber=='senate' else None
            if chamber=='senate' and region not in REGIONS.values():continue
            if jur=='federal' and chamber=='representatives':
                state=seat_states.get(key(electorate))
            else:state=electorate.upper() if chamber=='senate' else jur.upper()
            record={'jurisdiction':jur,'chamber':chamber,'electorate':region or electorate,
                    'state':state,'basis':'Recorded parliamentary roster; exact name and chamber match'}
            if record not in matches:matches.append(record)
        person['representation']=matches
    if reference is not None:
        repair(people,reference,reviewed or {})
    return people


def pinned_reference(public=PUBLIC):
    """Use the manifest's exact release, never whichever directory sorts last."""
    manifest=json.loads((public/'electorates/manifest.json').read_text())
    path=public/manifest['reference_url'].lstrip('/')
    path.resolve().relative_to(public.resolve())
    return json.loads(path.read_text())


def dated_records(reference,reviewed):
    """Independent seat/party evidence: dated service terms and dated official rosters.

    The release's OPAX legacy member ids are deliberately not an identity authority.
    Only terms have historical service dates; a current roster proves its as_of day.
    """
    people={p['person_id']:p for p in reference.get('people',[])}
    seats={e['electorate_id']:e for e in reference.get('electorates',[])}
    sources={s['source_id']:s for s in reference.get('sources',[])}
    records=[]
    for t in reference.get('terms',[]):
        if not t.get('start'):continue
        p,e=people[t['person_id']],seats[t['electorate_id']]
        for period in t.get('party_periods') or [{'start':t['start'],'end':t.get('end'),'party':None}]:
            records.append({'name':p['name'],'identity':p['person_id'],'jurisdiction':e['jurisdiction'],
                'chamber':e['chamber'],'electorate':e['name'],'state':e.get('state_code','').upper(),
                'start':period['start'],'end':period.get('end'),'party':period.get('party'),
                'source_url':next((sources[s].get('url') for s in t.get('sources',[]) if s in sources),None)})
    for roster in reference.get('rosters',[]):
        # OPAX's old members snapshot is not dated service evidence.
        official=[sources[s] for s in roster.get('sources',[]) if s in sources
                  and not sources[s].get('label','').startswith('OPAX existing')]
        if not roster.get('as_of') or not official:continue
        e=seats[roster['electorate_id']]
        for m in roster.get('members',[]):
            p=people[m['person_id']]
            records.append({'name':p['name'],'identity':p['person_id'],'jurisdiction':e['jurisdiction'],
                'chamber':e['chamber'],'electorate':e['name'],'state':e.get('state_code','').upper(),
                'start':roster['as_of'],'end':roster['as_of'],'as_of':roster['as_of'],'party':m.get('party'),
                'source_url':p.get('source_url') or next((sources[s].get('url') for s in roster.get('sources',[]) if s in sources),None)})
    for r in reviewed.get('service',[]):
        records.append(dict(r,identity='reviewed:'+key(r['name'])))
    return records


def matching_records(person,records,reviewed,unique=True):
    """Full-name agreement plus jurisdiction, chamber and overlapping years; never surname alone."""
    if weak(person['name']) or person.get('first') is None or person.get('last') is None:return []
    alias=reviewed.get('aliases',{}).get(person['name'])
    found=[]
    for r in records:
        alias_match=(alias and r['name']==alias['name'] and r['jurisdiction']==alias['jurisdiction']
                     and r['chamber']==alias['chamber'])
        if not (alias_match or agrees(person['name'],r['name'])):continue
        if r['jurisdiction'] not in person.get('states',[]) or r['chamber'] not in person.get('chambers',[]):continue
        if int(r['start'][:4])>person['last'] or (r.get('end') and int(r['end'][:4])<person['first']):continue
        found.append(r)
    # Same full name in the same chamber in the same years can still be two people.
    ambiguous=ambiguous_scopes(found)
    return [r for r in found if not unique or (r['jurisdiction'],r['chamber']) not in ambiguous]


def ambiguous_scopes(records):
    """Different ids in overlapping service terms are ambiguous; adjacent election
    boundaries are not. The pinned history can use different ids after a spelling
    change (Christopher Patrick Hayes / Chris Hayes), so id inequality alone is
    not proof of two people. Snapshot dates do not assert an entire service term.
    """
    ambiguous=set()
    for i,r in enumerate(records):
        if r.get('as_of'):continue
        scope=(r['jurisdiction'],r['chamber'])
        for s in records[i+1:]:
            if s.get('as_of') or scope!=(s['jurisdiction'],s['chamber']) or r['identity']==s['identity']:continue
            if max(r['start'],s['start'])<min(r.get('end') or '9999-12-31',s.get('end') or '9999-12-31'):
                ambiguous.add(scope)
    return ambiguous


def representation(r):
    return {k:r.get(k) for k in ('jurisdiction','chamber','electorate','state')} | {
        'basis':'Dated parliamentary service or official roster; name, jurisdiction and chamber verified'}


def repair(people,reference,reviewed):
    """Repair only unsupported joins in place, leaving transcript counts and scopes intact.

    Full names may cross chambers on dated evidence. Weak mixed prints keep no person's
    seat/alias/party. Existing valid historical seats are not rejected just because a
    current boundary catalog no longer contains them.
    """
    records=dated_records(reference,reviewed)
    catalog=defaultdict(set)
    for e in reference.get('electorates',[]):catalog[(e['jurisdiction'],e['chamber'])].add(key(e['name']))
    changed=[]
    for p in people:
        before=copy.deepcopy(p)
        guard_print(p)
        if mixed_print(p):
            if p!=before:changed.append((p['name'],before,copy.deepcopy(p)))
            continue
        evidence=matching_records(p,records,reviewed)
        ambiguous=ambiguous_scopes(matching_records(p,records,reviewed,unique=False))
        fixed=[]
        for old in p.get('representation',[]):
            scope=(old['jurisdiction'],old['chamber'])
            if scope in ambiguous:continue
            own=[r for r in evidence if (r['jurisdiction'],r['chamber'])==scope]
            places={key(r['electorate']) for r in own}
            place=re.split(r'\s+[–—]\s+',old['electorate'])[0].strip()
            if old['chamber']=='nsw_lc' and key(place)=='legislative council district of new south wales':
                # The former label names the same statewide constituency, not a district.
                place='New South Wales'
                old=dict(old,electorate=place)
            if own and key(place) not in places:
                # A valid-looking seat can belong to another same-surname MP (Kemp/Lee).
                for r in own:
                    row=representation(r)
                    if row not in fixed:fixed.append(row)
                continue
            if place!=old['electorate'] and key(place) in catalog[scope]:
                old=dict(old,electorate=place)
            if old['jurisdiction']=='federal' and key(place) not in catalog[scope] and any(
                    key(place) in names for (jur,house),names in catalog.items() if jur!='federal'):
                # A state seat on a federal row with no own dated term is unsupported.
                continue
            if old['chamber'] in ('nsw_lc','sa_lc') and key(place) not in catalog[scope]:
                # Assembly districts and ministerial jobs are not Council constituencies.
                replacement=[r for r in evidence if r['jurisdiction']==old['jurisdiction']]
                for r in replacement:
                    row=representation(r)
                    if row not in fixed:fixed.append(row)
                continue
            if old not in fixed:fixed.append(old)
        unique={}
        for r in fixed:
            signature=(r['jurisdiction'],r['chamber'],r['electorate'])
            unique.setdefault(signature,r)
        p['representation']=list(unique.values())
        service=[r for r in evidence if r['identity'].startswith('reviewed:')]
        if service:
            # Keep genuine federal/state careers, with party tied to dated service.
            # The flat directory facet describes the latest service's jurisdiction;
            # federal Labor remains in affiliations, never paired with the NSW chamber.
            p['affiliations']=[{k:r.get(k) for k in ('jurisdiction','chamber','electorate','party','start','end','source_url')}
                               for r in sorted(evidence,key=lambda r:r['start']) if not r.get('as_of') or r['identity'].startswith('reviewed:')]
            latest=max(service,key=lambda r:r['start'])
            p['party']=latest['party']
            labels=list(dict.fromkeys(r['party'] for r in sorted(service,key=lambda r:r['start'],reverse=True) if r.get('party')))
            if len(labels)>1:p['parties']=labels
            else:p.pop('parties',None)
            if latest.get('end') is None:
                p['party_now']=latest['party']
            else:p.pop('party_now',None)
            for r in evidence:
                row=representation(r)
                if row not in p['representation']:p['representation'].append(row)
            order={(r['jurisdiction'],r['chamber']):max(s['start'] for s in evidence
                   if (s['jurisdiction'],s['chamber'])==(r['jurisdiction'],r['chamber'])) for r in evidence}
            p['representation'].sort(key=lambda r:order.get((r['jurisdiction'],r['chamber']),''),reverse=True)
        if p['name'] in reviewed.get('party_from_pinned_roster',[]):
            snapshot=max((r for r in evidence if r.get('as_of') and r.get('party')),key=lambda r:r['as_of'],default=None)
            if snapshot:p['party']=snapshot['party']
        if p!=before:changed.append((p['name'],before,copy.deepcopy(p)))
    return changed

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--members',type=Path);p.add_argument('--directory',type=Path,default=PUBLIC/'parliamentarians.json')
    p.add_argument('--research',type=Path,default=PUBLIC/'research/mlci.json')
    p.add_argument('--pinned',action='store_true',help='repair shipped roster from the manifest-pinned evidence only')
    a=p.parse_args();data=json.loads(a.directory.read_text())
    reference=pinned_reference();reviewed=json.loads(REVIEWED.read_text())
    if a.pinned:
        changes=repair(data['people'],reference,reviewed)
        for name,before,after in changes:
            fields=[k for k in before.keys()|after.keys() if before.get(k)!=after.get(k)]
            print(f'[roster] {name}: {", ".join(sorted(fields))}',file=sys.stderr)
        print(f'[roster] {len(changes)} rows repaired from pinned evidence',file=sys.stderr)
    else:
        if not a.members:p.error('--members is required unless --pinned is set')
        enrich(data['people'],json.loads(a.members.read_text()),json.loads(a.research.read_text())['seats'],reference,reviewed)
    data['meta']['representation']={'updated':'2026-10-06','matched':sum(bool(p['representation']) for p in data['people']),
        'method':'Exact name, jurisdiction and chamber; independent dated service evidence repairs contaminated roster seats. Mixed surname or initials prints have no single-person affiliation.'}
    a.directory.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    print(data['meta']['representation'])

if __name__=='__main__':main()
