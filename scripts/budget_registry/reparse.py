"""Rebuild staged fiscal rows offline from cleared documents and cached originals."""
import argparse
from collections import Counter
import hashlib
import json
import re
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from scripts.budget_registry.parse import permitted,parse_aggregates,docx_text,parse_docx_measures
from scripts.budget_registry.stage import projection
from scripts.budget_registry.acquire import dump


def rebuild(stage,cache):
    inventory=json.loads((stage/'inventory.json').read_text())
    rows=[]
    for d in inventory['documents']:
        if d['format']=='DOCX' and d['licence']['status']=='blocked' and not d['licence'].get('evidence'):
            body=(cache/hashlib.sha256(d['url'].encode()).hexdigest()).read_bytes()
            text=docx_text(body);notice=re.search(r'CC BY-NC|Attribution.NonCommercial|NoDerivatives|prior written permission|all rights reserved',text,re.I)
            if notice:d['licence']['evidence']=text[max(0,notice.start()-400):notice.end()+400]
            d['licence']['document_url']=d['url'];d['licence']['document_sha256']=hashlib.sha256(body).hexdigest()
    for d in inventory['documents']:
        if not (d['consolidated'] and d['kind'] in ('bp1','myefo','fbo') and permitted(d)):continue
        path=cache/hashlib.sha256(d['url'].encode()).hexdigest()
        body=path.read_bytes()
        if hashlib.sha256(body).hexdigest()!=d['receipt']['sha256']:raise ValueError('Source cache hash mismatch')
        parsed=parse_aggregates(body,d)
        rows.extend(r for r in parsed if int(r['fiscal_year'][:4])>=2015)
        print(d['release'],d['kind'],len(parsed),flush=True)
    inventory['unreleased']=[{'year':y,'kind':'myefo','reason':'No standalone MYEFO linked in publisher archive; October Budget retained separately' if y=='2022-23' else 'Not linked on publisher at this snapshot'} for y in sorted({r['year'] for r in inventory['releases']}) if not any(d['year']==y and d['kind']=='myefo' for d in inventory['documents'])]
    inventory['counts']['aggregate_rows']=len(rows)
    measures=[]
    for d in inventory['documents']:
        if not (permitted(d) and d['format']=='DOCX' and (d['kind']=='bp2' or (d['kind']=='myefo' and re.search(r'app[_-]?a|appendix[_-]?a',d['url'],re.I)))):continue
        body=(cache/hashlib.sha256(d['url'].encode()).hexdigest()).read_bytes()
        if hashlib.sha256(body).hexdigest()!=d['receipt']['sha256']:raise ValueError('Measures cache hash mismatch')
        measures.extend(parse_docx_measures(body,d))
    inventory['counts']['measure_rows']=len(measures)
    dump(stage/'measures.json',measures)
    dump(stage/'aggregates.json',rows)
    dump(stage/'inventory.json',inventory)
    dump(stage/'hub.json',projection({**inventory,'aggregates':rows,'measures':measures}))
    print(json.dumps({'aggregate_rows':len(rows),'metrics':dict(Counter(r['metric'] for r in rows))}))


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--stage',type=Path,default=ROOT/'data/staged/budget')
    ap.add_argument('--cache',type=Path,default=ROOT/'.cache/budget')
    args=ap.parse_args()
    if not args.stage.resolve().is_relative_to((ROOT/'data/staged').resolve()):ap.error('Reparse output must stay under this worktree’s data/staged directory')
    rebuild(args.stage,args.cache)
