#!/usr/bin/env python3
"""Scan names newly disambiguated by identity decisions and grant programmes."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import sqlite3
from build_evidence_layers import setup, Matcher, add_evidence, tokens
from evidence_quality import publishable_alias


def connect(path):
    c=sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True);c.row_factory=sqlite3.Row;return c


def build(source_path,base_path,decisions_path,places_path,output):
    source,base,decisions,places=map(connect,[source_path,base_path,decisions_path,places_path])
    out=setup(output)
    redirects={r['subject']:r['object'] for r in decisions.execute("SELECT * FROM decisions WHERE status='accepted'")}
    original=defaultdict(set);canonical=defaultdict(set)
    names={r['id']:dict(r) for r in base.execute('SELECT * FROM entities')}
    for r in base.execute('SELECT * FROM aliases'):
        alias=tokens(r['alias']);original[alias].add(r['entity_id']);canonical[alias].add(redirects.get(r['entity_id'],r['entity_id']))
    additional=defaultdict(set)
    for alias,targets in canonical.items():
        if len(targets)==1 and len(original[alias])>1:
            target=next(iter(targets))
            if publishable_alias(' '.join(alias),names[target]['name']):additional[alias].add(target)
    for r in places.execute("SELECT * FROM entities WHERE kind='program'"):
        names[r['id']]=dict(r);alias=tokens(r['name'])
        known=canonical.get(alias,set())
        if len(alias)>=2 and not known: additional[alias].add(r['id'])
    for targets in additional.values():
        for target in targets:
            n=names[target];out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,?)',(target,n['kind'],n['name'],n['abn']))
    matcher=Matcher(additional)
    out.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('additional_aliases',str(len(additional))));out.commit()
    print(json.dumps({'additional_aliases':len(additional)}),flush=True)
    for table,idcol,textcol in [('ext_press_releases','source_id','body_text'),('speeches','speech_id','text_clean')]:
        prior=out.execute('SELECT last_rowid,processed FROM progress WHERE source_table=?',(table,)).fetchone()
        last,count=prior or (0,0)
        for row in source.execute('SELECT rowid AS _rowid,* FROM '+table+' WHERE rowid>? ORDER BY rowid',(last,)):
            r=dict(row);sid=str(r[idcol]);text=r.get(textcol) or r.get('text') or ''
            if table=='ext_press_releases':sid=str(r['source'])+':'+sid
            digest=None
            for target,start,end in matcher.matches(text):
                digest=digest or hashlib.sha256(text.encode()).hexdigest()
                add_evidence(out,table+':'+sid,'mentions',target,table,sid,text[start:end],
                    'resolved_exact_alias',.98,url=r.get('url'),start=start,end=end,
                    details={'excerpt':text[max(0,start-160):min(len(text),end+160)],'date':r.get('date'),
                             'text_field':textcol if r.get(textcol) else 'text','text_sha256':digest})
            last=r['_rowid'];count+=1
            if count%1000==0:
                out.execute('INSERT OR REPLACE INTO progress VALUES (?,?,?)',(table,last,count));out.commit()
                print(json.dumps({'table':table,'processed':count}),flush=True)
        out.execute('INSERT OR REPLACE INTO progress VALUES (?,?,?)',(table,last,count));out.commit()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ['source','base','decisions','places','output']:p.add_argument('--'+arg,required=True)
    a=p.parse_args();build(a.source,a.base,a.decisions,a.places,a.output)
