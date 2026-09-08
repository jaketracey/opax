#!/usr/bin/env python3
"""Export completed evidence to bounded static shards for public browsing."""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from evidence_quality import publishable_alias


def key(entity):
    return hashlib.sha256(entity.encode()).hexdigest()[:24]


def export(source_path,evidence_path,output,allow_incomplete=False):
    source=sqlite3.connect(Path(source_path).resolve().as_uri()+'?mode=ro',uri=True)
    source.row_factory=sqlite3.Row
    db=sqlite3.connect(Path(evidence_path).resolve().as_uri()+'?mode=ro',uri=True)
    db.row_factory=sqlite3.Row
    progress={r['source_table']:r['processed'] for r in db.execute('SELECT * FROM progress')}
    totals={t:source.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ['speeches','ext_press_releases']}
    complete=all(progress.get(t)==n for t,n in totals.items())
    if not complete and not allow_incomplete:
        raise ValueError('Extraction coverage is incomplete: '+str(progress)+' of '+str(totals))
    out=Path(output);out.mkdir(parents=True,exist_ok=True)
    entries={};lookup=defaultdict(set)
    for r in db.execute("""SELECT n.*,count(DISTINCT e.subject) AS records,count(*) AS occurrences
        FROM entities n JOIN evidence e ON e.object=n.id
        WHERE e.predicate IN ('mentions','mentions_electorate') GROUP BY n.id"""):
        public=key(r['id'])
        entries[r['id']]={'id':public,'name':r['name'],'kind':r['kind'],'abn':r['abn'],
            'records':r['records'],'occurrences':r['occurrences'],'excerpts':[], 'locations':[],
            'years':{},'source_kinds':{},'matched_records':0}
    # Register-derived addresses can be useful even without a text mention.
    addresses=db.execute("""SELECT i.entity_id,e.*,n.name AS place FROM evidence e
        JOIN identities i ON e.subject=i.source_table||':'||i.source_id
        JOIN entities n ON n.id=e.object WHERE e.predicate='registered_address_overlaps'
        AND i.method != 'conflicting_source_names'""")
    for r in addresses:
        if r['entity_id'] in entries:
            location={'name':r['place'],'relationship':'Registered address postcode',
                      'source':r['source_table'],'source_id':r['source_id'],
                      'fields':json.loads(r['quote']),'details':json.loads(r['details'])}
            current=entries[r['entity_id']]['locations']
            if not any(x['name']==location['name'] and x['fields']==location['fields'] for x in current): current.append(location)
    # Exact record excerpts are selected once per entity/record and capped in
    # the preview. The totals above always describe the complete extraction.
    query="""WITH selected AS (
        SELECT *,row_number() OVER (PARTITION BY object,subject ORDER BY start,id) AS within_record
        FROM evidence WHERE predicate IN ('mentions','mentions_electorate'))
        SELECT * FROM selected WHERE within_record=1 ORDER BY json_extract(details,'$.date') DESC,id"""
    rejected=0
    for r in db.execute(query):
        entry=entries.get(r['object'])
        if entry is None: continue
        if entry['kind']=='organisation' and not publishable_alias(r['quote'],entry['name']):
            rejected+=1
            continue
        details=json.loads(r['details']); date=details.get('date') or ''
        kind='Official release' if r['source_table']=='ext_press_releases' else 'Parliamentary record'
        entry['matched_records']+=1
        entry['source_kinds'][kind]=entry['source_kinds'].get(kind,0)+1
        year=date[:4] if date[:4].isdigit() else 'Undated'
        entry['years'][year]=entry['years'].get(year,0)+1
        if len(entry['excerpts'])>=12: continue
        entry['excerpts'].append({'id':r['id'],'date':date,'source_kind':kind,
            'source_table':r['source_table'],'source_id':r['source_id'],
            'source_url':r['source_url'],'text':details.get('excerpt') or r['quote'],
            'matched_text':r['quote'],'method':r['method'],'confidence':r['confidence'],
            'start':r['start'],'end':r['end'],'text_sha256':details.get('text_sha256')})
    entries={entity:entry for entity,entry in entries.items() if entry['matched_records']}
    for entry in entries.values():
        entry['candidate_records']=entry['records']
        entry['records']=entry.pop('matched_records')
        entry.pop('occurrences',None)
    # Lookup is always ambiguity-aware. The UI will not pick the first result.
    for r in db.execute('SELECT alias,entity_id FROM aliases'):
        if r['entity_id'] in entries: lookup[r['alias']].add(key(r['entity_id']))
    shards=defaultdict(dict)
    directory=[]
    for entity,entry in entries.items():
        shards[entry['id'][:2]][entry['id']]=entry
        directory.append({k:entry[k] for k in ['id','name','kind','abn','records']})
    for shard,values in shards.items():
        (out/(shard+'.json')).write_text(json.dumps({'entries':values},ensure_ascii=False,separators=(',',':')))
    counts=dict(db.execute('SELECT predicate,count(*) FROM evidence GROUP BY predicate'))
    meta={'generated_at':datetime.now(timezone.utc).isoformat(),'complete':complete,
        'source_records':totals,'processed_records':progress,'relationships':counts,
        'entities_with_mentions':len(entries),'rejected_candidate_record_matches':rejected,'published_record_matches':sum(e['records'] for e in entries.values()),'identity_candidates':counts.get('same_identity_candidate',0),
        'quarantined_identities':db.execute("SELECT count(*) FROM identities WHERE method='conflicting_source_names'").fetchone()[0],
        'method':'Exact unambiguous recorded names; source excerpts retained. Identity candidates are unpublished.',
        'coverage_note':'Collected source corpus; coverage differs from searchable records. Postcode overlaps are not precise locations.'}
    lookups=defaultdict(dict)
    for name,ids in lookup.items():
        lookups[key(name)[:2]][name]=sorted(ids)
    for entity,entry in entries.items():
        if entry['abn'] and entity.startswith('abn:'):
            name='abn:'+entry['abn'];lookups[key(name)[:2]][name]=[entry['id']]
    (out/'lookup').mkdir(exist_ok=True)
    for shard,values in lookups.items():
        (out/'lookup'/(shard+'.json')).write_text(json.dumps(values,ensure_ascii=False,separators=(',',':')))
    (out/'index.json').write_text(json.dumps({'meta':meta,'entities':directory},ensure_ascii=False,separators=(',',':')))
    (out/'stats.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(meta,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',required=True);p.add_argument('--evidence',required=True)
    p.add_argument('--output',required=True);p.add_argument('--allow-incomplete',action='store_true')
    a=p.parse_args();export(a.source,a.evidence,a.output,a.allow_incomplete)
