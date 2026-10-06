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
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.roster_identity import COMMITTEES, FEDERAL, agrees, alias_name, guard_print, mixed_print, parliamentary_speakers_dominate, parts, pinned_members, state_member_matches, usable_alias, weak

PUBLIC = ROOT / 'portal/public'
REVIEWED = ROOT / 'scripts/roster_service.json'
STATE_EVIDENCE = ROOT / 'scripts/roster_state_evidence.json'

REGIONS={'ACT':'Australian Capital Territory','NSW':'New South Wales','VIC':'Victoria','QLD':'Queensland','SA':'South Australia','WA':'Western Australia','TAS':'Tasmania','NT':'Northern Territory'}

def key(s):
    return re.sub(r'\s+',' ',str(s or '').replace('’',"'").strip()).casefold()

def enrich(people,members,seats,reference=None,reviewed=None):
    by_name=defaultdict(list)
    for m in members:by_name[key(m['full_name'])].append(m)
    seat_states={key(s['name']):s['state'] for s in seats}
    for person in people:
        matches=[]
        states=person.get('states',[])
        for member in by_name[key(person['name'])]:
            jur=member.get('state') or 'federal'
            chamber=member.get('chamber')
            if jur not in states or chamber not in person.get('chambers',[]):continue
            if weak(person['name']) and not mixed_print(person) and not state_member_matches(person,{
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
        # The first export repair may already have replaced a contaminated
        # member-stub seat with independently dated service. Do not undo that
        # evidence when the wrapper runs its members-table enrichment pass.
        if not person.get('representation') or not (person.get('identity_evidence') or person.get('affiliations')):
            person['representation']=matches or person.get('representation',[])
    if reference is not None:
        repair(people,reference,reviewed or {})
    else:
        for person in people:guard_print(person)
    return people


def pinned_reference(public=PUBLIC):
    """Use the manifest's exact release, never whichever directory sorts last."""
    manifest=json.loads((public/'electorates/manifest.json').read_text())
    path=public/manifest['reference_url'].lstrip('/')
    path.resolve().relative_to(public.resolve())
    return json.loads(path.read_text())


def dated_records(reference,reviewed,state_evidence=None):
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
    # These reviewed extracts carry their own dates, URLs and document hashes.
    # They are snapshots, not invented open-ended terms or copied member stubs.
    if state_evidence is None:state_evidence=json.loads(STATE_EVIDENCE.read_text())
    for snapshot in state_evidence.get('snapshots',[]):
        for m in snapshot['members']:
            date=m.get('as_of',snapshot['as_of'])
            records.append(dict(m,identity='state:'+key(m['name']),
                jurisdiction=snapshot['jurisdiction'],chamber=snapshot['chamber'],
                state=snapshot['jurisdiction'].upper(),start=date,end=date,
                as_of=date,source_url=snapshot['source_url']))
    for r in records:
        r['name']=alias_name(r['name'])
        for alias,fact in reviewed.get('aliases',{}).items():
            if (r['name'],r['jurisdiction'],r['chamber'])==(fact['name'],fact['jurisdiction'],fact['chamber']):
                r.setdefault('aliases',[]).append(alias)
    return records


def matching_records(person,records,reviewed,unique=True,allow_weak=False):
    """Name, jurisdiction, chamber and overlapping years. Weak prints are
    admitted only by the explicit resolver, which checks all competing people.
    """
    if (weak(person['name']) and not allow_weak) or person.get('first') is None or person.get('last') is None:return []
    alias=reviewed.get('aliases',{}).get(person['name'])
    found=[]
    for r in records:
        alias_match=(alias and r['name']==alias['name'] and r['jurisdiction']==alias['jurisdiction']
                     and r['chamber']==alias['chamber'])
        if not (alias_match or any(agrees(person['name'],n) for n in [r['name'],*r.get('aliases',[])])):continue
        if r['jurisdiction'] not in person.get('states',[]) or r['chamber'] not in person.get('chambers',[]):continue
        if int(r['start'][:4])>person['last'] or (r.get('end') and int(r['end'][:4])<person['first']):continue
        found.append(r)
    # Same full name in the same chamber in the same years can still be two people.
    ambiguous=ambiguous_scopes(found)
    return [r for r in found if not unique or (r['jurisdiction'],r['chamber']) not in ambiguous]


def print_identity(person,records,reference,printed_people=()):
    """Resolve the same candidate set in the pinned and database paths.

    Dated independent evidence supplies corrections. State stubs with absent
    term dates can corroborate a unique name/chamber, but cannot overwrite
    an independently evidenced name, seat or party. Committees are not houses.
    Multiple compatible people refuse a single-person identity.
    """
    if not parliamentary_speakers_dominate(person) or person.get('first') is None or person.get('last') is None:return []
    houses=set(person.get('chambers',[]))-COMMITTEES
    jurisdictions={'federal' if c in FEDERAL else c.split('_')[0] for c in houses}
    if not jurisdictions:return []
    own=matching_records(person,records,{},allow_weak=True)
    # Committee membership/testimony cannot supply a candidate for a house.
    # A federal parliamentarian can appear before either house's committee.
    # Their dated service may contradict a state namesake, but never supplies
    # own (which is restricted to the print's actual non-committee houses).
    compatible=dict(person,chambers=list(houses))
    committees=set(person.get('chambers',[])) & COMMITTEES
    if committees and 'federal' in person.get('states',[]):
        compatible['chambers']=list(houses | FEDERAL)
    possible=matching_records(compatible,records,{},unique=False,allow_weak=True)
    if ambiguous_scopes(possible):return []
    by_id={p['person_id']:p for p in reference.get('people',[])}
    seats={e['electorate_id']:e for e in reference.get('electorates',[])}
    candidates={}
    conflicting_names=committee_names(person,reference) if committees else []
    for roster in reference.get('rosters',[]):
        e=seats[roster['electorate_id']]
        if e['jurisdiction'] not in person.get('states',[]) or e['chamber'] not in compatible['chambers']:continue
        for m in roster.get('members',[]):
            p=by_id[m['person_id']]
            name=alias_name(p['name'])
            if usable_alias(name) and agrees(person['name'],name):
                if e['chamber'] not in houses:
                    # Undated stubs alone do not prove service in these years.
                    continue
                candidates[(key(name),e['jurisdiction'],e['chamber'])]=dict(name=name,jurisdiction=e['jurisdiction'],
                    chamber=e['chamber'],electorate=e['name'],state=e.get('state_code','').upper(),
                    party=m.get('party'),identity='stub:'+p['person_id'])
    # A stub's given name is still evidence of another person, even when it
    # has no entered_house. Do not silently select the better-documented one.
    names=[r['name'] for r in possible]+[r['name'] for r in candidates.values()]+conflicting_names
    # Full given names actually printed in the same dated transcript scopes
    # can contradict a surname join. They do not supply seats or affiliations.
    # This catches new namesakes absent from an older roster snapshot, such as
    # Monica (Assembly) and Damien (Council) Tudehope in 2025-26.
    for other in printed_people:
        if not usable_alias(other['name']) or not agrees(person['name'],other['name']):continue
        if not set(other.get('states',[])) & set(person.get('states',[])):continue
        if not (set(other.get('chambers',[]))-COMMITTEES) & houses:continue
        if (other.get('first') is None or other.get('last') is None
                or other['first']>person['last'] or other['last']<person['first']):continue
        names.append(other['name'])
    if names and not all(agrees(a,b) or any(a in r.get('aliases',[]) and b==r['name']
                      or b in r.get('aliases',[]) and a==r['name'] for r in own)
                      for a in names for b in names):return []
    # Every parliament with an actual house needs its own candidate evidence.
    # Two houses within one state are allowed, consistently with the photo guard.
    if not jurisdictions <= {r['jurisdiction'] for r in [*own,*candidates.values()]}:return []
    if own:return own if jurisdictions <= {r['jurisdiction'] for r in own} else []
    return list(candidates.values()) if len({key(r['name']) for r in candidates.values()})==1 else []


@lru_cache(maxsize=1)
def committee_members():
    # Negative evidence only, from the same verified pinned exports used by
    # the photo guard. Fixture-only checkouts may omit these exports.
    return pinned_members() if (PUBLIC/'votes.json').exists() and (PUBLIC/'pay.json').exists() else {}


def committee_names(person,reference):
    if person.get('first') is None or person.get('last') is None:return []
    if not set(person.get('chambers',[])) & COMMITTEES or 'federal' not in person.get('states',[]):return []
    ids={str(p.get('legacy_person_id')) for p in reference.get('people',[]) if p.get('jurisdiction')=='federal'}
    found=[]
    for pid,m in committee_members().items():
        if pid not in ids:continue
        if m.get('start') is not None and m['start']>person['last']:continue
        if m.get('end') is not None and m['end']<person['first']:continue
        found.extend(alias_name(n) for n in m['names'] if usable_alias(alias_name(n)) and agrees(person['name'],n))
    return found


def witness_dominated(person):
    """Round 3's governing threshold: more than half the rows are witnesses."""
    return person.get('witness_rows',0)*2 > person.get('speeches',0)


def consistent_career(person,records,reference,reviewed,printed_people=()):
    """Corroborate a reviewed same-person career without adding any labels.

    Dated service in the print's actual houses establishes the identity;
    committee candidates and other printed names can still contradict it.
    This only permits preservation, never enrichment or witness attribution.
    """
    fact=reviewed.get('same_person',{}).get(person['name'])
    if not fact or person.get('witness_rows',0):return []
    if not agrees(person['name'],fact['name']):return []
    if person.get('full') and not agrees(person['full'],fact['name']):return []
    labels=[person.get('party'),person.get('party_now'),
            *person.get('parties',[]),*person.get('recorded_parties',[])]
    if any(label and label!=fact['party'] for label in labels):return []
    careers=[dict(r,name=fact['name'],party=fact['party'],identity='same-person:'+key(fact['name']))
             for r in fact['service']]
    if not set(person.get('states',[])) <= {r['jurisdiction'] for r in careers}:return []
    if not set(person.get('chambers',[]))-COMMITTEES <= {r['chamber'] for r in careers}:return []
    evidence=[*records,*careers]
    own=print_identity(person,evidence,reference,printed_people)
    if not own or any(not agrees(r['name'],fact['name']) for r in own):return []
    compatible=dict(person,chambers=list(set(person.get('chambers',[]))-COMMITTEES | FEDERAL))
    possible=matching_records(compatible,evidence,{},unique=False,allow_weak=True)
    if any(r.get('party') and r['party']!=fact['party'] for r in possible):return []
    return own


def change_reason(person,records,reference,reviewed,printed_people=(),catalog=None):
    """Evidence permitting an edit. Missing positive evidence permits no edit.

    This gate applies equally to pinned repair and the database export. Ordinary
    records, including state initials and two-house careers, pass through intact.
    """
    if witness_dominated(person):return 'witness-dominated','More than 50% witness rows'
    own=[]
    if weak(person['name']) and len(set(person.get('states',[])))>1:
        own=consistent_career(person,records,reference,reviewed,printed_people)
        if not own:return 'spans parliaments','Weak printed name aggregates multiple parliaments'
    own=own or (print_identity(person,records,reference,printed_people) if weak(person['name'])
                else matching_records(person,records,reviewed))
    if weak(person['name']) and not str(person.get('pid','')).isdigit() and own and usable_alias(person.get('full')) and any(
            r.get('start') and not any(agrees(person['full'],n) for n in [r['name'],*r.get('aliases',[])]) for r in own):
        return 'mix-up corrected','Alias contradicts the dated member in the recorded chamber'
    if weak(person['name']) and not own:
        possible=matching_records(person,records,{},unique=False,allow_weak=True)
        names=[r['name'] for r in possible]+committee_names(person,reference)
        names += [p['name'] for p in printed_people if usable_alias(p['name'])
                  and agrees(person['name'],p['name']) and set(p.get('chambers',[])) & set(person.get('chambers',[]))
                  and p.get('first') is not None and p.get('last') is not None
                  and person.get('first') is not None and person.get('last') is not None
                  and p['first']<=person['last'] and p['last']>=person['first']]
        if ambiguous_scopes(possible) or any(not agrees(a,b) for a in names for b in names):
            return 'mix-up corrected','Different dated parliamentarians match the same print'
    if person.get('full') and not usable_alias(person['full']):
        return 'alias normalisation','Byline, compact initials or non-display casing in full-name alias'
    if catalog is None:
        catalog=defaultdict(set)
        for e in reference.get('electorates',[]):catalog[(e['jurisdiction'],e['chamber'])].add(key(e['name']))
    for old in person.get('representation',[]):
        scope=(old['jurisdiction'],old['chamber'])
        place=re.split(r'\s+[–—]\s+',old['electorate'])[0].strip()
        evidence=[r for r in own if (r['jurisdiction'],r['chamber'])==scope]
        if evidence and key(place) not in {key(r['electorate']) for r in evidence} and any(r.get('start') and not r.get('as_of') for r in evidence):
            return 'mix-up corrected','Seat contradicts dated service in the recorded chamber'
        if old['electorate']!=place and key(place) in catalog[scope]:
            return 'mix-up corrected','Portfolio joined into an electorate label'
        if old['chamber']=='nsw_lc' and key(place)=='legislative council district of new south wales':
            return 'mix-up corrected','Noncanonical Council constituency from the member-stub join'
        if old['chamber'] in ('nsw_lc','sa_lc') and key(place) not in catalog[scope]:
            return 'mix-up corrected','Assembly seat or portfolio attached to a Council record'
        if old['jurisdiction']=='federal' and key(place) not in catalog[scope] and any(
                key(place) in names for (jur,house),names in catalog.items() if jur!='federal'):
            return 'mix-up corrected','State electorate attached to a federal record'
    service=[r for r in own if r['identity'].startswith('reviewed:')]
    if service and max(service,key=lambda r:r['start']).get('party') != person.get('party'):
        return 'mix-up corrected','Party contradicts dated service in this parliament'
    if person['name'] in reviewed.get('party_corrections',[]) and own and any(r.get('party')!=person.get('party') for r in own):
        return 'mix-up corrected','Reviewed party mismatch against dated election evidence'
    if ambiguous_scopes(matching_records(person,records,reviewed,unique=False)):
        return 'mix-up corrected','Overlapping terms belong to different person identities'
    # Full-name state speaker with an explicitly reviewed missing party (Melissa).
    if person['name'] in reviewed.get('party_from_pinned_roster',[]) and not person.get('party'):
        return 'mix-up corrected','Reviewed member-stub party omission; official roster supplies party'
    return None


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

    Full names may cross chambers on dated evidence. Weak prints retain a unique
    compatible identity; ambiguity or contradiction removes its seat/alias/party.
    Existing valid historical seats are not rejected just because a
    current boundary catalog no longer contains them.
    """
    records=dated_records(reference,reviewed)
    prints=defaultdict(list)
    for p in people:
        if usable_alias(p['name']):prints[parts(p['name'])[-1]].append(p)
    catalog=defaultdict(set)
    for e in reference.get('electorates',[]):catalog[(e['jurisdiction'],e['chamber'])].add(key(e['name']))
    changed=[]
    for p in people:
        before=copy.deepcopy(p)
        tokens=parts(p['name'])
        peers=prints.get(tokens[-1] if tokens else None,())
        reason=change_reason(p,records,reference,reviewed,peers,catalog)
        if reason is None:continue
        if witness_dominated(p):
            guard_print(p,force=True)
            if p!=before:changed.append((p['name'],before,copy.deepcopy(p)))
            continue
        contradictory=False
        if weak(p['name']):
            own=print_identity(p,records,reference,peers)
            contradictory=not own and reason[0]=='mix-up corrected'
            # Absence of evidence is not evidence of a mix-up. Only actual
            # contradictions or multiple-parliament aggregates go neutral.
            if own:guard_print(p,resolved=True)
            elif contradictory or reason[0]=='spans parliaments':guard_print(p,force=True)
            if own:
                latest=max(own,key=lambda r:r.get('start',''))
                if usable_alias(latest['name']):p['full']=latest['name']
                if any(r.get('source_url') for r in own):
                    p['identity_evidence']=[{k:r.get(k) for k in ('name','jurisdiction','chamber','electorate','as_of','start','end','source_url')}
                        for r in own]
                    p.pop('identity_basis',None)
                else:
                    p['identity_basis']='One compatible roster name and chamber; state stub service dates not recorded'
                if latest.get('party'):
                    p['party']=latest['party'];p.pop('parties',None)
                elif not p.get('party') and p.get('recorded_parties'):
                    p['party']=p['recorded_parties'][0]
                p.pop('recorded_parties',None)
                evidence=own
                if before.get('full') and not usable_alias(before['full']):
                    # Repair compact/byline aliases with their dated state seat.
                    # This also preserves correct Gaven/Nudgee/Gladstone KB rows.
                    for r in own:
                        row=representation(r)
                        if not any((x['jurisdiction'],x['chamber'],x['electorate'])==
                                   (row['jurisdiction'],row['chamber'],row['electorate']) for x in p.get('representation',[])):
                            p.setdefault('representation',[]).append(row)
            else:
                if not usable_alias(p.get('full')):p.pop('full',None)
                evidence=[]
        else:
            evidence=matching_records(p,records,reviewed)
        if (mixed_print(p) or contradictory) and not evidence:
            if p!=before:changed.append((p['name'],before,copy.deepcopy(p)))
            continue
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
            if own and key(place) not in places and any(r.get('start') and not r.get('as_of') for r in own):
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
            if latest.get('end') is None and not mixed_print(p):
                p['party_now']=latest['party']
                p['current']=True
            else:
                p.pop('party_now',None)
                if mixed_print(p):p.pop('current',None)
            for r in evidence:
                row=representation(r)
                if not any((x['jurisdiction'],x['chamber'],x['electorate'])==
                    (row['jurisdiction'],row['chamber'],row['electorate']) for x in p['representation']):
                    p['representation'].append(row)
            order={(r['jurisdiction'],r['chamber']):max(s['start'] for s in evidence
                   if (s['jurisdiction'],s['chamber'])==(r['jurisdiction'],r['chamber'])) for r in evidence}
            p['representation'].sort(key=lambda r:order.get((r['jurisdiction'],r['chamber']),''),reverse=True)
        if p['name'] in reviewed.get('party_from_pinned_roster',[]):
            snapshot=max((r for r in evidence if r.get('as_of') and r.get('party')),key=lambda r:r['as_of'],default=None)
            if snapshot:p['party']=snapshot['party']
        for r in reviewed.get('history',[]):
            if r['name']!=p['name']:continue
            row=representation(r)
            if not any((x['jurisdiction'],x['chamber'],x['electorate'])==
                       (row['jurisdiction'],row['chamber'],row['electorate']) for x in p['representation']):
                p['representation'].append(row)
            p.setdefault('affiliations',[])
            affiliation={k:r.get(k) for k in ('jurisdiction','chamber','electorate','party','start','end','source_url')}
            if affiliation not in p['affiliations']:p['affiliations'].append(affiliation)
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
        'method':'Evidence-gated corrections only; clean records pass through intact. Committee rows may contradict, never establish, an identity. More than 50% witness rows means neutral; weak multi-parliament or contradictory prints require a unique compatible identity. Transcript aggregates are retained.'}
    a.directory.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    print(data['meta']['representation'])

if __name__=='__main__':main()
