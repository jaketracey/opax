#!/usr/bin/env python3
"""Fetch cited original documents for review; never treat quote matches as entailment.
Usage: python3 scripts/ask_evidence_audit.py /tmp/opax-ask-baseline
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import urllib.request


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('run',type=Path)
    p.add_argument('--base',default='https://opax.com.au')
    args=p.parse_args()
    rows=[json.loads(f.read_text()) for f in args.run.glob('*.json') if f.stem not in ['manifest','summary','evidence-audit']]
    docs=args.run/'documents';docs.mkdir(exist_ok=True)
    slugs=sorted({s['slug'] for r in rows for s in r['response'].get('sources',[]) if s.get('cited') and s.get('href','').startswith('/doc/')})
    def fetch(slug):
        path=docs/(slug+'.json')
        if path.exists():return
        try:
            req=urllib.request.Request(args.base+'/api/resource/'+slug,headers={'user-agent':'opax-ask-evidence-audit/1.0'})
            with urllib.request.urlopen(req,timeout=60) as res:data=json.load(res)
        except Exception as exc:data={'error':str(exc)}
        path.write_text(json.dumps(data,indent=2)+'\n')
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,slugs))
    normalize=lambda text:re.sub(r'[^\w]','',text.lower())
    audit=[]
    for row in rows:
        data=row['response'];answer=data.get('answer','')
        sources=[s for s in data.get('sources',[]) if s.get('cited')]
        texts={s['resource']:json.loads((docs/(s['slug']+'.json')).read_text()).get('text','') if s.get('href','').startswith('/doc/') else s.get('snippet','') for s in sources}
        # Validate the cited document, not a nearby but uncited retrieval hit.
        joined=normalize(' '.join(texts.values()))
        quotes=[q for q in re.findall(r'["“]([^"”\n]*)["”]',answer) if len(q)>=30]
        unmatched=[q for q in quotes if normalize(q) not in joined]
        audit.append({'id':row['id'],'cited_documents':len(texts),'missing_documents':[k for k,v in texts.items() if not v],'long_quotes':len(quotes),'quotes_needing_review':unmatched})
    (args.run/'evidence-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    print(f'Fetched {len(slugs)} original documents; reviewed {len(rows)} response structures.')
    for row in audit:
        if row['missing_documents'] or row['quotes_needing_review']:print(row['id'],json.dumps(row,ensure_ascii=False))

if __name__=='__main__':main()
