#!/usr/bin/env python3
"""Read-only staged gate. No publisher requests, public asset or database writes."""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from scripts.tax_expenditures.parse import CC, TERMS, STATEMENT, SHEET, key, permitted, value, MARKERS, document_metadata
from scripts.tax_expenditures.stage import load, projection


def checked_projection(stage, verify_originals=False):
    inventory,hub=load(stage/'inventory.json'),load(stage/'hub.json')
    rows=[json.loads(line) for line in (stage/'series.jsonl').read_text().splitlines() if line]
    receipts=load(stage/'receipts.json');ledger={r['url']:r for r in receipts};checks=load(stage/'reconciliation.json')
    if not rows or len({key(r) for r in rows})!=len(rows):raise ValueError('Empty or duplicate observations')
    if not checks or any(c.get('status')!='pass' for c in checks):raise ValueError('Reconciliation failed or absent')
    if any(r.get('held') or r.get('challenge') or r.get('status')!=200 for r in receipts):raise ValueError('Source access held')
    if inventory['statement_url']!=STATEMENT or ledger.get(TERMS,{}).get('status')!=200:raise ValueError('Missing statement/rights receipt')
    docs={d['id']:d for d in inventory['documents'] if permitted(d)}
    if len(docs)!=3:raise ValueError('Incomplete reviewed statement download set')
    for d in docs.values():
        r=ledger.get(d['url'],{})
        if any(d['receipt'].get(k)!=r.get(k) for k in ('status','challenge','held','snapshot','sha256')):raise ValueError('Document receipt mismatch')
        if d['licence']['terms_sha256']!=ledger[TERMS]['sha256']:raise ValueError('Rights receipt mismatch')
        if not re.fullmatch(r'https://treasury\.gov\.au/sites/default/files/\d{4}-\d{2}/p\d{4}-\d+(?:-chart-data)?\.(?:xlsx|pdf|docx)',d['url']):raise ValueError('Unapproved original URL')
    grant=next(d['receipt']['sha256'] for d in docs.values() if d['format']=='DOCX')
    if any(d['licence']['document_grant_sha256']!=grant for d in docs.values()):raise ValueError('Statement grant mismatch')
    withheld=[r for r in rows if r.get('source_value')=='nfp' or r.get('estimate_status')=='not for publication']
    if projection(inventory,rows)!=hub or len(hub['rows'])!=len(rows)-len(withheld):raise ValueError('Rows differ from cleared projection')
    if {(r['item_id'],r['measure_year'],r['cell']) for r in withheld}!={('G8',f'{y}-{str(y+1)[2:]}',f'{c}280') for y,c in zip(range(2025,2029),'GHIJ')}:
        raise ValueError('Bounded withheld-cell evidence changed')
    if any(not any(c.get('item_id')==r['item_id'] and c.get('year')==r['measure_year'] and c.get('workbook_cell')==r['cell']
                   and c.get('workbook_value')=='nfp' and c.get('statement_value')=='nfp' for c in checks) for r in withheld):
        raise ValueError('Withheld reconciliation evidence missing')
    for r in rows:
        raw=r['source_value']
        normalized=int(re.sub(r'[\s,]','',raw)) if r['record_kind']=='published combined estimate' else raw
        expected,status=value(normalized)
        if r.get('included_in'):status='included in '+r['included_in']+'; workbook nil'
        if expected!=r['value'] or status!=r['estimate_status']:raise ValueError('Estimate/code changed')
        if r['record_kind']=='published combined estimate' and not any(c.get('item_id')==r['item_id'] and c.get('year')==r['measure_year'] and c.get('value_million')==r['value'] and c['check'].startswith('Published combined total') for c in checks):raise ValueError('Unreconciled published total')
    item_rows=[r for r in rows if r['record_kind']=='item']
    if len(item_rows)!=2432 or len(rows)-len(item_rows)!=16:raise ValueError('Bounded statement counts changed')
    if verify_originals:
        from openpyxl import load_workbook
        root=stage.parents[2]
        for d in docs.values():
            path=root/d['original_path']
            if hashlib.sha256(path.read_bytes()).hexdigest()!=d['receipt']['sha256']:raise ValueError('Original hash mismatch')
        workbook=load_workbook(root/next(d['original_path'] for d in docs.values() if d['format']=='XLSX'),data_only=True)
        for r in item_rows:
            if workbook[r['sheet']][r['cell']].value!=r['source_value']:raise ValueError('Original cell mismatch')
        workbook.close()
        _,combined=document_metadata(root/next(d['original_path'] for d in docs.values() if d['format']=='DOCX'))
        for r in (r for r in rows if r['record_kind']!='item'):
            item=combined[r['item_id']]
            if item['values'][item['years'].index(r['measure_year'])]!=r['source_value']:raise ValueError('Original combined cell mismatch')
    return hub,{'documents':len(docs),'items':len({r['item_id'] for r in item_rows}),'rows':len(hub['rows']),
        'internal_rows':len(rows),'withheld_rows_excluded':len(withheld),
        'published_combined_rows':len(rows)-len(item_rows),'years':sorted({r['measure_year'] for r in rows}),
        'reconciliation':dict(Counter(c['status'] for c in checks))}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--dry-run',action='store_true',required=True);parser.add_argument('--verify-originals',action='store_true');args=parser.parse_args()
    _,counts=checked_projection(ROOT/'data/staged/tax-expenditures',args.verify_originals)
    print(json.dumps({'mode':'dry-run','writes':0,**counts}))
