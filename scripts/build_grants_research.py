#!/usr/bin/env python3
"""Rebuild the MLCI source dataset from downloaded primary PDFs (pdftotext -layout).

No geocoding by recipient postcode, no inferred marginality and no model calls.
The 2025 AEC baseline remains separate from current parliamentary representation.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

DEPARTMENT = 'https://www.aph.gov.au/-/media/Estimates/rrat/supp2526/Infrastructure_-_December/1_DITRDCSA_response_to_Senator_Canavan_Request.pdf'
AEC = 'https://www.aec.gov.au/media/files/Seat-status-fact-sheet-2025-federal-election.pdf'
CPI = 'https://publicintegrity.org.au/wp-content/uploads/2026/09/Public-money-political-advantage.pdf'
STATES = {'New South Wales':'NSW','Victoria':'VIC','Queensland':'QLD','Western Australia':'WA','South Australia':'SA','Tasmania':'TAS','Australian Capital Territory':'ACT','Northern Territory':'NT'}

def parse_projects(text):
    projects = []
    for page, content in enumerate(text.split('\f'), 1):
        for line in content.splitlines():
            if not line.startswith('MLCIP '):
                continue
            cells = re.split(r'\s{2,}', line.strip())
            if len(cells) != 7 or cells[4] != '$':
                raise ValueError(f'Unrecognised project row on page {page}: {cells}')
            _, state, title, lga, amount, value, status = cells
            projects.append(dict(id=f'mlci-invitation-{len(projects)+1:03}', state=state,
                                 title=title, lga=lga, value=int(value.replace(',','')),
                                 status=status, page=page, source_url=f'{DEPARTMENT}#page={page}'))
    active = [p for p in projects if p['status'] != 'Withdrawn']
    if len(projects) != 227 or len(active) != 226 or sum(p['value'] for p in active) != 559241712:
        raise ValueError('Departmental source changed or extraction is incomplete')
    return projects

def parse_seats(text):
    seats = {}
    state = None
    nonclassic = False
    byelections = False
    for page, content in enumerate(text.split('\f'), 1):
        for line in content.splitlines():
            s = line.strip()
            if s.startswith('By-election margins'):
                byelections = True
            if '‘Non-classic’ seat margins' in s:
                nonclassic = True
            for name, code in STATES.items():
                if s == name or s.startswith(name+' ('):
                    state = code
            if page < 5 or byelections:
                continue
            if not nonclassic:
                m = re.match(r'^(.+?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(ALP|LP|NP|LNP)\s+(M|FS|S)\s+(\d+\.\d+)$', s)
                if m:
                    name, _, _, party, status, margin = m.groups()
                    name = name.rstrip('#')
                    seats[name] = dict(name=name,state=state,party=party,status=status,margin=float(margin),page=page,baseline='2025 notional')
                elif s.startswith('Bullwinkel'):
                    m = re.search(r'\b(ALP)\s+(M)\s+(\d+\.\d+)$',s)
                    if m:
                        seats['Bullwinkel']=dict(name='Bullwinkel',state='WA',party=m[1],status=m[2],margin=float(m[3]),page=page,baseline='2025 notional')
            else:
                m = re.match(r'^(?:(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+)?(.+?)\s+(ALP|LP|NP|LNP|IND|GRN|CA|KAP)\s+\d+\.\d+\s+(?:ALP|LP|NP|LNP|IND|GRN|CA|KAP)\s+\d+\.\d+\s+(M|FS|S)\s+(\d+\.\d+)$',s)
                if m:
                    code,name,party,status,margin=m.groups()
                    state=code or state
                    seats[name]=dict(name=name,state=state,party=party,status=status,margin=float(margin),page=page,baseline='2025 notional')
    if len(seats)!=150 or Counter(s['state'] for s in seats.values()) != {'NSW':46,'VIC':38,'QLD':30,'WA':16,'SA':10,'TAS':5,'ACT':3,'NT':2}:
        raise ValueError(f'AEC extraction incomplete: {len(seats)} seats')
    return sorted(seats.values(),key=lambda s:s['name'])

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--sources',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    data={'as_of':'2026-09-09','invitation_snapshot':'2025-11-14',
          'sources':{'department':DEPARTMENT,'aec':AEC,'cpi':CPI,
                     'cpi_landing':'https://publicintegrity.org.au/research_papers/community-infrastructure-grants-marginal-seats/'},
          'source_hashes':{f:hashlib.sha256((a.sources/f).read_bytes()).hexdigest() for f in ['department.pdf','aec.pdf','cpi.pdf']},
          'projects':parse_projects((a.sources/'department.txt').read_text()),
          'awards':json.loads((a.sources/'awards.json').read_text()),
          'seats':parse_seats((a.sources/'aec.txt').read_text()),
          'cpi_comparison':[
              {'name':'Labor safe','actual':125125027,'expected':137946289},
              {'name':'Labor fairly safe','actual':144931587,'expected':82022118},
              {'name':'Marginal, Labor competitive','actual':223128975,'expected':156587679},
              {'name':'Marginal, Labor non-competitive','actual':5230000,'expected':37282781},
              {'name':'Other parties fairly safe','actual':28276123,'expected':55924171},
              {'name':'Other parties safe','actual':32550000,'expected':89478674}],
          'comparison_provenance':{'publisher':'Centre for Public Integrity','page':11,'table':3,
              'note':'Published comparison, not independently reproduced by Opax. Baseline is proportional to the number of seats. CPI uses notional 2025 boundaries, four by-election results and a Brisbane competitiveness exception.'}}
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'projects':len(data['projects']),'seats':len(data['seats'])}))

if __name__=='__main__':main()
