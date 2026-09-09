#!/usr/bin/env python3
"""Load factual MLCI source records into the existing KB, without model calls.

Dry-run by default. Writes a local receipt database for resumable publication.
The CPI entry is a short attributed research note, not a copy of the paper.
"""
import argparse
import json
import sqlite3
import sys
import time
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))

def records(data, directory=None):
    for p in data['projects']:
        text=(f"{p['title']}\nMajor and Local Community Infrastructure Program (MLCIP). "
              f"Departmental invitation list as at {data['invitation_snapshot']}. "
              f"State: {p['state']}. Local government area: {p['lga']}. Invitation allocation: AUD {p['value']:,}. "
              f"Status at that snapshot: {p['status']}. This records a proposed project invitation, not an award or payment. "
              f"Source: Departmental response to Senator Canavan, PDF page {p['page']}.")
        yield resource(p['id'],p['title']+' — grant invitation',text,p['source_url'],data['invitation_snapshot'],'grant_invitation','departmental_grants_list',{'stage':'invitation','delivery_state':p['state'],'value_aud':p['value'],'status':p['status']})
    text=('Public money, political advantage? Centre for Public Integrity, 8 September 2026. '
          'The study examines MLCI invitations against pre-election seat competitiveness. Its Table 3 reports '
          'AUD 223,128,975 for marginal seats where Labor was competitive, against AUD 156,587,679 under '
          'a seat-count proportional baseline. These are the Centre’s findings, not an independent Opax replication or a finding about individual project merit.')
    yield resource('research-cpi-mlci-2026','Public money, political advantage? — research note',text,data['sources']['cpi_landing'],'2026-09-08','research_report','centre_for_public_integrity',{'record_type':'Attributed research note','full_report_url':data['sources']['cpi']})
    active=[p for p in data['projects'] if p['status']!='Withdrawn']
    text=(f"Major and Local Community Infrastructure Program (MLCIP): the departmental list dated {data['invitation_snapshot']} has {len(data['projects'])} invitation projects. "
          f"Excluding one withdrawn proposal leaves {len(active)} active invitations totalling AUD {sum(p['value'] for p in active):,}. "
          f"Separately, Opax's GrantConnect snapshot at {data['as_of']} contains {len(data['awards'])} published program awards totalling AUD {sum(p['value'] for p in data['awards']):,}. "
          "Invitations, awards and payments are different stages; do not add these totals together. Project-level electorate matches have not yet been verified; the CPI seat comparison is an attributed external analysis.")
    yield resource('research-mlci-program-2026','MLCI program — invitation and award coverage',text,data['sources']['department'],data['invitation_snapshot'],'research_report','departmental_grants_list',{'record_type':'Derived source totals','report_url':'https://opax.com.au/reports/grants-allocation'})
    for s in data['seats']:
        status={'M':'Marginal','FS':'Fairly safe','S':'Safe'}[s['status']]
        text=(f"{s['name']}, {s['state']}: AEC notional seat baseline before the 2025 federal election. "
              f"Recorded party: {s['party']}. Margin: {s['margin']:.2f} percentage points. Seat status: {status}. "
              "This is the pre-election notional baseline, not the 2025 result or today's incumbent. It does not apply subsequent by-election substitutions. "
              f"Source: AEC Seat status fact sheet, PDF page {s['page']}.")
        slug='aec-seat-2025-'+hashlib.sha256(s['name'].encode()).hexdigest()[:16]
        yield resource(slug,s['name']+' — 2025 notional seat baseline',text,data['sources']['aec']+f"#page={s['page']}",'2025-05-03','election_baseline','aec',{'record_type':'Pre-election notional baseline','date_meaning':'Election date to which baseline applies, not publication date','electorate':s['name'],'region':s['state'],'margin':s['margin'],'status':status})
    for a in data['awards']:
        text=(f"{a['ga_id']}: {a['activity']}. Major and Local Community Infrastructure Program. "
              f"Published grant award value: AUD {a['value']:,}. Publication date: {a['publish_date']}. "
              f"Recorded delivery state: {a.get('delivery_state') or 'not recorded'}. An award is not a payment. "
              "This record has not been matched to a specific invitation or electorate; do not infer a project site from a recipient address.")
        yield resource('mlci-award-'+a['ga_id'].lower(),a['activity']+' — '+a['ga_id'],text,a['source_url'],a['publish_date'],'grant_award','grantconnect',{'stage':'award','record_id':a['ga_id'],'value_aud':a['value'],'delivery_state':a.get('delivery_state')})
    for p in (directory or {}).get('people',[]):
        if not p.get('representation'):continue
        facts='; '.join(f"{r['jurisdiction']} / {r['chamber']}: {r['electorate']}" for r in p['representation'])
        text=(f"{p['name']} — recorded parliamentary representation in Opax's roster: {facts}. "
              "Matched by exact full name, compatible jurisdiction and chamber, not person ID alone. "
              "These are recorded affiliations and may include past seats; they do not establish current tenure, service dates or the electorate at the time of a particular speech.")
        row=resource('roster-profile-'+hashlib.sha256(p['name'].encode()).hexdigest()[:16],p['name']+' — recorded representation',text,'https://opax.com.au/subject/person/'+quote(p['name'],safe=''),data['as_of'],'parliamentary_profile','opax_parliamentary_roster',{'record_type':'Derived roster affiliation','representation':p['representation'],'date_meaning':'Enrichment snapshot, not tenure or speech date'})
        row['usermetadata']['classifications']=[c for c in row['usermetadata']['classifications'] if c['labelset'] not in {'state','topic'}]+[{'labelset':'state','label':j} for j in sorted({r['jurisdiction'] for r in p['representation']})]
        yield row

def resource(slug,title,text,url,date,kind,source,metadata):
    return {'slug':slug,'title':title,'texts':{'t-body':{'body':text,'format':'PLAIN'}},
        'origin':{'source_id':'opax-grants-research','url':url,'created':date+'T00:00:00Z'},
        'usermetadata':{'classifications':[{'labelset':k,'label':v} for k,v in [('kind',kind),('source',source),('state','federal'),('topic','integrity-democracy')]]},
        'extra':{'metadata':metadata|{'date':date,'licence':'Structured facts and an attributed summary; original document linked.'}}}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--data',type=Path,required=True)
    p.add_argument('--receipts',type=Path,required=True);p.add_argument('--directory',type=Path);p.add_argument('--workers',type=int,default=4);p.add_argument('--write',action='store_true');a=p.parse_args()
    rows=list(records(json.loads(a.data.read_text()),json.loads(a.directory.read_text()) if a.directory else None))
    if not a.write:print(json.dumps({'records':len(rows),'mode':'dry run'}));return
    from parli.arag import AragConfig,AragError,KbClient
    kb=KbClient(AragConfig.from_env());a.receipts.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(a.receipts);db.execute('CREATE TABLE IF NOT EXISTS receipts(slug TEXT PRIMARY KEY,rid TEXT,status TEXT,verified_at TEXT)')
    def publish(row):
        # Read-back even on an existing slug: never count a conflicting body as loaded.
        try:kb.create_resource(row)
        except AragError as e:
            if e.status!=409:raise
        current=kb.get_resource_by_slug(row['slug'],show='origin');rid=current['id']
        if current.get('origin',{}).get('source_id') != row['origin']['source_id']:
            raise RuntimeError('Source identity mismatch: '+row['slug'])
        if current.get('origin',{}).get('url') != row['origin']['url']:
            kb.patch_resource_by_slug(row['slug'],{'origin':current['origin']|{'url':row['origin']['url']}})
            if kb.get_resource_by_slug(row['slug'],show='origin').get('origin',{}).get('url') != row['origin']['url']:
                raise RuntimeError('Source URL read-back mismatch: '+row['slug'])
        live=kb.get_resource_text(rid,'t-body')
        if live.get('value',{}).get('body')!=row['texts']['t-body']['body']:raise RuntimeError('Read-back mismatch: '+row['slug'])
        time.sleep(.3)
        return row['slug'],rid,'verified',time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    with ThreadPoolExecutor(max_workers=max(1,min(6,a.workers))) as pool:
        for i,future in enumerate(as_completed([pool.submit(publish,row) for row in rows]),1):
            db.execute('INSERT OR REPLACE INTO receipts VALUES (?,?,?,?)',future.result());db.commit()
            if i%100==0 or i==len(rows):print(json.dumps({'verified':i,'total':len(rows)}),flush=True)

if __name__=='__main__':main()
