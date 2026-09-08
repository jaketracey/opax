#!/usr/bin/env python3
"""Resolve exact full-name candidates; retain every decision and source fields.

This does not infer new ABNs from similarity or alter source registers.
"""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import sqlite3
from evidence_quality import words, publishable_alias


def decide(candidate, target, source_rows, target_rows, competing_abns=None):
    evidence={'source_name':candidate['name'],'target_name':target['name'],
              'target_abn':target['abn'],'source_rows':source_rows,'target_rows':target_rows}
    if competing_abns and len(competing_abns)>1:
        evidence['competing_abns']=sorted(competing_abns)
        return 'unresolved','full_name_shared_by_multiple_abns',evidence
    if not source_rows or not target_rows:
        return 'unresolved','missing_source_identity',evidence
    if any(row.get('source_abn') for row in source_rows):
        return 'unresolved','source_has_an_abn_requiring_review',evidence
    if any(row['method']=='conflicting_source_names' for row in source_rows):
        return 'rejected','source_name_conflict',evidence
    if not target['abn'] or not any(row['method']=='validated_source_abn' for row in target_rows):
        return 'unresolved','target_not_supported_by_validated_abn',evidence
    if not publishable_alias(candidate['name'],target['name']):
        return 'unresolved','not_a_distinctive_full_name',evidence
    names={words(row['source_name']) for row in target_rows if row['method']=='validated_source_abn'}
    if words(candidate['name']) not in names:
        return 'unresolved','canonical_name_differs',evidence
    return 'accepted','unique_exact_full_name_with_source_abn',evidence


def review(evidence_path,output):
    src=sqlite3.connect(Path(evidence_path).resolve().as_uri()+'?mode=ro',uri=True);src.row_factory=sqlite3.Row
    out=sqlite3.connect(output)
    out.execute('CREATE TABLE IF NOT EXISTS decisions(subject TEXT PRIMARY KEY,object TEXT,status TEXT,method TEXT,evidence TEXT)')
    identities=defaultdict(list)
    name_abns=defaultdict(set)
    for r in src.execute('SELECT * FROM identities'):
        identities[r['entity_id']].append(dict(r))
        if r['method']=='validated_source_abn': name_abns[words(r['source_name'])].add(r['source_abn'])
    entities={r['id']:dict(r) for r in src.execute('SELECT * FROM entities')}
    for row in src.execute("SELECT * FROM evidence WHERE predicate='same_identity_candidate'"):
        candidate,target=entities[row['subject']],entities[row['object']]
        status,method,evidence=decide(candidate,target,identities[row['subject']],identities[row['object']],name_abns[words(candidate['name'])])
        out.execute('INSERT OR REPLACE INTO decisions VALUES (?,?,?,?,?)',(row['subject'],row['object'],status,method,json.dumps(evidence)))
    out.commit()
    print(json.dumps(dict(out.execute('SELECT status,count(*) FROM decisions GROUP BY status'))))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--evidence',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();review(a.evidence,a.output)
