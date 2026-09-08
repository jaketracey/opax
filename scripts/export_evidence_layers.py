#!/usr/bin/env python3
"""Export completed evidence to bounded static shards for public browsing."""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from evidence_quality import publishable_alias,publishable_programme


def key(entity):
    return hashlib.sha256(entity.encode()).hexdigest()[:24]


def export(source_path,evidence_path,output,allow_incomplete=False,decisions_path=None,places_path=None,additional_path=None):
    source=sqlite3.connect(Path(source_path).resolve().as_uri()+'?mode=ro',uri=True)
    source.row_factory=sqlite3.Row
    db=sqlite3.connect(Path(evidence_path).resolve().as_uri()+'?mode=ro',uri=True)
    db.row_factory=sqlite3.Row
    progress={r['source_table']:r['processed'] for r in db.execute('SELECT * FROM progress')}
    totals={t:source.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ['speeches','ext_press_releases']}
    db.execute('CREATE TEMP TABLE redirects(subject TEXT PRIMARY KEY,target TEXT,method TEXT,evidence TEXT)')
    decision_counts={}
    if decisions_path:
        decisions=sqlite3.connect(Path(decisions_path).resolve().as_uri()+'?mode=ro',uri=True)
        decision_counts=dict(decisions.execute('SELECT status,count(*) FROM decisions GROUP BY status'))
        db.executemany('INSERT INTO redirects VALUES (?,?,?,?)',decisions.execute("SELECT subject,object,method,evidence FROM decisions WHERE status='accepted'"))
    db.execute('CREATE TEMP TABLE all_entities(id TEXT PRIMARY KEY,kind TEXT,name TEXT,abn TEXT)')
    db.execute('INSERT INTO all_entities SELECT * FROM main.entities')
    if places_path:
        db.execute('ATTACH DATABASE ? AS places',(Path(places_path).resolve().as_uri()+'?mode=ro',))
        progress.update({r['source_table']:r['processed'] for r in db.execute('SELECT * FROM places.progress')})
        totals['government_grants']=source.execute('SELECT count(*) FROM government_grants').fetchone()[0]
        db.execute('CREATE TEMP VIEW raw_evidence AS SELECT * FROM main.evidence UNION ALL SELECT * FROM places.evidence')
        db.execute('INSERT OR IGNORE INTO all_entities SELECT * FROM places.entities')
    else:
        db.execute('CREATE TEMP VIEW raw_evidence AS SELECT * FROM main.evidence')

    additional_progress={}
    if additional_path:
        db.execute('ATTACH DATABASE ? AS additional',(Path(additional_path).resolve().as_uri()+'?mode=ro',))
        additional_progress={r['source_table']:r['processed'] for r in db.execute('SELECT * FROM additional.progress')}
        db.execute('INSERT OR IGNORE INTO all_entities SELECT * FROM additional.entities')
        db.execute('DROP VIEW raw_evidence')
        parts=['SELECT * FROM main.evidence']
        if places_path:parts.append('SELECT * FROM places.evidence')
        parts.append('SELECT * FROM additional.evidence')
        db.execute('CREATE TEMP VIEW raw_evidence AS '+' UNION ALL '.join(parts))
    db.execute('CREATE TEMP VIEW all_evidence AS SELECT e.id,e.subject,e.predicate,coalesce(r.target,e.object) AS object,e.source_table,e.source_id,e.source_url,e.quote,e.start,e.end,e.method,e.confidence,e.details FROM raw_evidence e LEFT JOIN redirects r ON r.subject=e.object')
    programme_complete=False
    if places_path:
        finished=db.execute("SELECT value FROM places.meta WHERE key='programme_rowid'").fetchone()
        programme_complete=bool(finished) and int(finished[0])==source.execute('SELECT coalesce(max(rowid),0) FROM government_grants').fetchone()[0]
    expected_decisions=db.execute("SELECT count(*) FROM main.evidence WHERE predicate='same_identity_candidate'").fetchone()[0]
    identity_complete=bool(decisions_path) and sum(decision_counts.values())==expected_decisions
    additional_complete=bool(additional_path) and all(additional_progress.get(t)==totals[t] for t in ['speeches','ext_press_releases'])
    complete=all(progress.get(t)==n for t,n in totals.items()) and programme_complete and identity_complete and additional_complete
    if not complete and not allow_incomplete:
        raise ValueError('Extraction coverage is incomplete: '+str(progress)+' of '+str(totals))
    out=Path(output)
    if out.exists() and any(out.iterdir()):
        raise ValueError('Output must be empty to prevent stale identity shards; use a fresh export directory.')
    out.mkdir(parents=True,exist_ok=True)
    entries={};lookup=defaultdict(set)
    entity_rows={r['id']:dict(r) for r in db.execute('SELECT * FROM all_entities')}
    for counts_row in db.execute("""SELECT e.object,count(DISTINCT e.subject) AS records,count(*) AS occurrences
        FROM all_evidence e
        WHERE e.predicate IN ('mentions','mentions_electorate','grant_postcode_overlaps','recorded_place','grant_program') GROUP BY e.object"""):
        if counts_row['object'] not in entity_rows: continue
        r=entity_rows[counts_row['object']] | dict(counts_row)
        public=key(r['id'])
        entries[r['id']]={'id':public,'name':r['name'],'kind':r['kind'],'abn':r['abn'],
            'records':r['records'],'occurrences':r['occurrences'],'excerpts':[], 'locations':[],
            'years':{},'source_kinds':{},'matched_records':0}
    print('Entity counts collected',flush=True)
    # Register-derived addresses can be useful even without a text mention.
    addresses=db.execute("""SELECT i.entity_id,e.*,n.name AS place FROM main.evidence e
        JOIN identities i ON e.subject=i.source_table||':'||i.source_id
        JOIN main.entities n ON n.id=e.object WHERE e.predicate='registered_address_overlaps'
        AND i.method != 'conflicting_source_names'""")
    for r in addresses:
        if r['entity_id'] in entries:
            location={'name':r['place'],'relationship':'Registered address postcode',
                      'source':r['source_table'],'source_id':r['source_id'],
                      'fields':json.loads(r['quote']),'details':json.loads(r['details'])}
            current=entries[r['entity_id']]['locations']
            if not any(x['name']==location['name'] and x['fields']==location['fields'] for x in current): current.append(location)
    for r in db.execute('SELECT * FROM redirects'):
        if r['target'] in entries:
            proof=json.loads(r['evidence'])
            entries[r['target']].setdefault('identity_links',[]).append({
                'name':proof['source_name'],'abn':proof['target_abn'],
                'method':r['method'],'source_records':proof['source_rows'],
                'matching_records':proof['target_rows']})
    if places_path and db.execute("SELECT 1 FROM places.sqlite_master WHERE name='representatives'").fetchone():
        for r in db.execute('SELECT * FROM places.representatives ORDER BY records DESC'):
            if r['electorate_id'] in entries:
                entries[r['electorate_id']].setdefault('representatives',[]).append(dict(r))
    print('Identity and address links collected',flush=True)
    # Exact record excerpts are selected once per entity/record and capped in
    # the preview. The totals above always describe the complete extraction.
    query="""WITH selected AS (
        SELECT *,row_number() OVER (PARTITION BY object,subject ORDER BY start,id) AS within_record
        FROM all_evidence WHERE predicate IN ('mentions','mentions_electorate','grant_postcode_overlaps','recorded_place','grant_program'))
        SELECT * FROM selected WHERE within_record=1 ORDER BY json_extract(details,'$.date') DESC,id"""
    rejected=0
    for r in db.execute(query):
        entry=entries.get(r['object'])
        if entry is None: continue
        if entry['kind']=='organisation' and not publishable_alias(r['quote'],entry['name']):
            rejected+=1
            continue
        if entry['kind']=='program' and r['predicate']=='mentions' and not publishable_programme(r['quote'],entry['name']):
            rejected+=1
            continue
        details=json.loads(r['details']); date=details.get('date') or ''
        kind='Official release' if r['source_table']=='ext_press_releases' else ('Grant record' if r['source_table']=='government_grants' else 'Parliamentary record')
        entry['matched_records']+=1
        entry['source_kinds'][kind]=entry['source_kinds'].get(kind,0)+1
        year=date[:4] if date[:4].isdigit() else 'Undated'
        entry['years'][year]=entry['years'].get(year,0)+1
        if len(entry['excerpts'])>=12: continue
        entry['excerpts'].append({'id':r['id'],'predicate':r['predicate'],'details':details,'date':date,'source_kind':kind,
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
    eligible_aliases=set()
    for r in db.execute('SELECT a.alias,coalesce(r.target,a.entity_id) AS entity_id FROM aliases a LEFT JOIN redirects r ON r.subject=a.entity_id'):
        lookup[r['alias']].add(key(r['entity_id']))
        if r['entity_id'] in entries: eligible_aliases.add(r['alias'])
    lookup={name:ids for name,ids in lookup.items() if name in eligible_aliases}
    shards=defaultdict(dict)
    directory=[]
    for entity,entry in entries.items():
        shards[entry['id'][:2]][entry['id']]=entry
        directory.append({k:entry[k] for k in ['id','name','kind','abn','records']})
    for shard,values in shards.items():
        (out/(shard+'.json')).write_text(json.dumps({'entries':values},ensure_ascii=False,separators=(',',':')))
    counts=dict(db.execute('SELECT predicate,count(*) FROM all_evidence GROUP BY predicate'))
    meta={'generated_at':datetime.now(timezone.utc).isoformat(),'complete':complete,
        'source_records':totals,'processed_records':progress,'relationships':counts,'programme_links_complete':programme_complete,'identity_review_complete':identity_complete,'additional_mentions_complete':additional_complete,'additional_processed_records':additional_progress,
        'entities_with_connections':len(entries),'rejected_candidate_record_matches':rejected,'published_record_matches':sum(e['records'] for e in entries.values()),'identity_candidates':counts.get('same_identity_candidate',0),'identity_decisions':decision_counts,
        'quarantined_identities':db.execute("SELECT count(*) FROM identities WHERE method='conflicting_source_names'").fetchone()[0],
        'method':'Exact unambiguous recorded names and structured source locations. Exact full-name identity decisions retain ABN provenance; unresolved candidates are unpublished.',
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
    p.add_argument('--additional');p.add_argument('--decisions');p.add_argument('--places');p.add_argument('--output',required=True);p.add_argument('--allow-incomplete',action='store_true')
    a=p.parse_args();export(a.source,a.evidence,a.output,a.allow_incomplete,a.decisions,a.places,a.additional)
