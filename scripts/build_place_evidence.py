#!/usr/bin/env python3
"""Add structured grant places without trusting old inferred electorate fields."""
import argparse
from collections import defaultdict
import json
import hashlib
from pathlib import Path
import sqlite3
from build_evidence_layers import setup,add_evidence,tokens


def build(source_path,output):
    src=sqlite3.connect(Path(source_path).resolve().as_uri()+'?mode=ro',uri=True);src.row_factory=sqlite3.Row
    out=setup(output)
    mapping=defaultdict(list)
    for r in src.execute('SELECT * FROM postcode_electorates'):mapping[str(r['postcode']).zfill(4)].append(dict(r))
    last=out.execute("SELECT last_rowid,processed FROM progress WHERE source_table='government_grants'").fetchone()
    last,count=last or (0,0)
    for row in src.execute('SELECT rowid AS _rowid,* FROM government_grants WHERE rowid>? ORDER BY rowid',(last,)):
        r=dict(row);sid=str(r['grant_id']);subject='government_grants:'+sid
        postcode=str(r.get('postcode') or '').strip().zfill(4);state=str(r.get('state') or '').casefold()
        mapped=[x for x in mapping.get(postcode,[]) if not state or x['state'].casefold()==state]
        fields={k:r.get(k) for k in ['recipient','amount','program','agency','suburb','postcode','state','source']}
        details={'date':r.get('start_date') or '', 'source_fields':fields,
                 'excerpt':'; '.join(f'{k.replace("_"," ")}: {v}' for k,v in fields.items() if v not in (None,'')),
                 'allocation_note':'Postcode overlap. The source postcode may describe delivery or recipient address.',
                 'mapping_source':'postcode_electorates','boundary_date':'unspecified','candidate_electorates':len(mapped)}
        for place in mapped:
            entity='electorate:'+place['state'].casefold()+':'+place['electorate_name'].casefold()
            out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,NULL)',(entity,'electorate',place['electorate_name']))
            add_evidence(out,subject,'grant_postcode_overlaps',entity,'government_grants',sid,
                json.dumps(fields), 'source_postcode_mapping',1.0,url=r.get('source_url'),
                details=details|{'allocation_ratio':place['ratio']})
        if r.get('suburb') and state:
            name=str(r['suburb']).strip()
            if name.casefold() not in {'various','statewide','n/a','unknown','multiple'}:
                entity='place:'+state+':'+name.casefold()
                out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,NULL)',(entity,'place',name+', '+state.upper()))
                add_evidence(out,subject,'recorded_place',entity,'government_grants',sid,json.dumps(fields),
                    'source_suburb_field',1.0,url=r.get('source_url'),details=details)
        count+=1;last=r['_rowid']
        if count%5000==0:
            out.execute('INSERT OR REPLACE INTO progress VALUES (?,?,?)',('government_grants',last,count));out.commit()
            print(json.dumps({'processed':count}),flush=True)
    out.execute('INSERT OR REPLACE INTO progress VALUES (?,?,?)',('government_grants',last,count));out.commit()
    # A separate checkpoint adds programme links to an existing location run.
    programme_last=int((out.execute("SELECT value FROM meta WHERE key='programme_rowid'").fetchone() or ['0'])[0])
    for row in src.execute('SELECT rowid AS _rowid,* FROM government_grants WHERE rowid>? ORDER BY rowid',(programme_last,)):
        r=dict(row);name=str(r.get('program') or '').strip();sid=str(r['grant_id'])
        if name and len(tokens(name))>=2:
            entity='program:'+hashlib.sha256(' '.join(tokens(name)).encode()).hexdigest()[:20]
            out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,NULL)',(entity,'program',name))
            fields={k:r.get(k) for k in ['program','recipient','amount','agency','source']}
            add_evidence(out,'government_grants:'+sid,'grant_program',entity,'government_grants',sid,
                json.dumps(fields),'source_program_field',1.0,url=r.get('source_url'),
                details={'date':r.get('start_date') or '', 'source_fields':fields,
                         'excerpt':'; '.join(f'{k}: {v}' for k,v in fields.items() if v not in (None,''))})
        programme_last=r['_rowid']
        if programme_last%5000==0:
            out.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('programme_rowid',str(programme_last)));out.commit()
    out.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('programme_rowid',str(programme_last)));out.commit()
    # Associate speakers with a named federal electorate using speech fields,
    # not the older roster's unreliable entry/exit dates.
    seats=defaultdict(set)
    for rows in mapping.values():
        for place in rows: seats[place['electorate_name'].casefold()].add((place['electorate_name'],place['state'].casefold()))
    out.execute('CREATE TABLE IF NOT EXISTS representatives(electorate_id TEXT,name TEXT,records INTEGER,first_date TEXT,last_date TEXT,sample_speech_id TEXT,PRIMARY KEY(electorate_id,name))')
    out.execute('DELETE FROM representatives')
    for r in src.execute("""SELECT speaker_name_clean AS name,electorate,count(*) AS n,min(date) AS first_date,max(date) AS last_date,min(speech_id) AS sample
        FROM speeches WHERE state='federal' AND chamber='representatives' AND speaker_name_clean IS NOT NULL AND electorate!=''
        GROUP BY speaker_name_clean,electorate"""):
        matching=seats.get(str(r['electorate']).casefold(),set())
        if len(matching)!=1 or len(tokens(r['name']))<2:continue
        name,state=next(iter(matching));entity='electorate:'+state+':'+name.casefold()
        out.execute('INSERT OR REPLACE INTO representatives VALUES (?,?,?,?,?,?)',
            (entity,r['name'],r['n'],r['first_date'],r['last_date'],str(r['sample'])))
    out.commit()
    print(json.dumps(dict(out.execute('SELECT predicate,count(*) FROM evidence GROUP BY predicate'))))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();build(a.source,a.output)
