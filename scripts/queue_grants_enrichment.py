#!/usr/bin/env python3
"""Queue evidence-gated research tasks for the next Codex enrichment pass.

Separate from speech summaries/labels: these tasks need source lookup, not prose.
No paid model calls. Re-running preserves completed tasks and never publishes
candidate matches. A source change produces a new input hash and review task.
"""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

RULES = {
    'project_location': 'Find the actual project site in official council, department or grant documents. Return source URL, exact supporting excerpt, address or coordinates, and the 2025 federal electorate only when verified against the relevant AEC boundary. Recipient headquarters, LGA or postcode alone are insufficient. Mark multi-site or unresolved cases explicitly. Do not infer political favouritism.',
    'invitation_award_match': 'Compare this published award with departmental invitations. Require matching project/site and official evidence; amount or name similarity alone is insufficient. Retain both amounts, dates and funding stages. Return candidate IDs, source URLs, exact excerpts, and unresolved alternatives; never merge records automatically.',
    'cpi_method_reconciliation': 'Reconcile CPI Table 3 methods with AEC 2025 notional margins. Source the four by-election substitutions and Brisbane exception from the original paper and AEC. Produce an auditable baseline crosswalk with source pages. Do not claim independent replication until every project electorate is verified.',
    'representation_review': 'Resolve missing parliamentary representation from official parliamentary profiles or original roster records. Require full-name identity, jurisdiction and chamber agreement. Record source URL, exact excerpt, affiliation and its stated dates; retain unknown dates. Never infer current incumbency, rely on person ID alone, or silently use a namesake.'
}

def tasks(data, directory):
    for p in data['projects']:
        if p['status'] != 'Withdrawn':
            yield 'project_location', p['id'], {'project':p,'baseline':'2025 federal election','aec_source':data['sources']['aec']}
    for a in data['awards']:
        yield 'invitation_award_match', a['ga_id'], {'award':a,'invitation_source':data['sources']['department'],'dataset':'https://opax.com.au/research/mlci.json'}
    yield 'cpi_method_reconciliation','cpi-2026',{'sources':data['sources'],'published_comparison':data['cpi_comparison']}
    for p in directory['people']:
        if not p.get('representation'):
            yield 'representation_review',p['name'],{k:p.get(k) for k in ('name','states','chambers','first','last')}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data',type=Path,required=True);p.add_argument('--directory',type=Path,required=True);p.add_argument('--db',type=Path,required=True)
    a=p.parse_args();a.db.parent.mkdir(parents=True,exist_ok=True)
    con=sqlite3.connect(a.db)
    con.execute('''CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_id TEXT NOT NULL,
        input_hash TEXT NOT NULL, payload TEXT NOT NULL, instructions TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', queued_at TEXT NOT NULL,
        worker TEXT, evidence_json TEXT, reviewed_at TEXT)''')
    added=0
    for kind,source_id,payload in tasks(json.loads(a.data.read_text()),json.loads(a.directory.read_text())):
        encoded=json.dumps(payload,sort_keys=True,ensure_ascii=False)
        digest=hashlib.sha256((encoded+RULES[kind]).encode()).hexdigest()
        task_id=kind+':'+hashlib.sha256((source_id+digest).encode()).hexdigest()[:24]
        con.execute("UPDATE tasks SET status='superseded' WHERE kind=? AND source_id=? AND input_hash!=? AND status='pending'",(kind,source_id,digest))
        added+=con.execute('INSERT OR IGNORE INTO tasks(id,kind,source_id,input_hash,payload,instructions,queued_at) VALUES (?,?,?,?,?,?,?)',
            (task_id,kind,source_id,digest,encoded,RULES[kind],datetime.now(timezone.utc).isoformat())).rowcount
    con.commit()
    print(json.dumps({'added':added,'counts':[{'kind':k,'status':s,'count':n} for k,s,n in con.execute('SELECT kind,status,count(*) FROM tasks GROUP BY kind,status')]}))

if __name__=='__main__':main()
