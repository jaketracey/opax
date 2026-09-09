#!/usr/bin/env python3
"""Attach recorded representation using exact names AND compatible jurisdictions.

Read-only inputs: exported members table and the existing public directory.
Does not trust person_id alone, infer service dates, or treat Senate committees
as another parliament. Retired members' electorates are labelled as recorded.
"""
import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

REGIONS={'ACT':'Australian Capital Territory','NSW':'New South Wales','VIC':'Victoria','QLD':'Queensland','SA':'South Australia','WA':'Western Australia','TAS':'Tasmania','NT':'Northern Territory'}

def key(s):
    return re.sub(r'\s+',' ',str(s or '').replace('’',"'").strip()).casefold()

def enrich(people,members,seats):
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
    return people

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--members',type=Path,required=True);p.add_argument('--directory',type=Path,required=True)
    p.add_argument('--research',type=Path,required=True)
    a=p.parse_args();data=json.loads(a.directory.read_text())
    enrich(data['people'],json.loads(a.members.read_text()),json.loads(a.research.read_text())['seats'])
    data['meta']['representation']={'updated':'2026-09-09','matched':sum(bool(p['representation']) for p in data['people']),
        'method':'Exact full name, jurisdiction and chamber. Roster entry/exit dates are not used. Electorate is a recorded affiliation, not a claim about current tenure.'}
    a.directory.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    print(data['meta']['representation'])

if __name__=='__main__':main()
