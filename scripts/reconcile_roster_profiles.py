#!/usr/bin/env python3
"""Reconcile owned roster KB records: dry-run by default, replace stale and retire orphaned profiles.

An offline --inventory contains captured KB resources. Online dry-run reads the
catalog and source bodies only. --apply is for the approved orchestrator/box:
back up originals, verify ownership and concurrent changes, replace (including
old generated fields), and read back. No model or enrichment calls are made.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.publish_grants_research import records
from parli.arag import AragConfig, AragError, KbClient, load_dotenv

ROOT=Path(__file__).resolve().parents[1]


def owned(row):
    labels=row.get('usermetadata',{}).get('classifications',[])
    return bool(re.fullmatch(r'roster-profile-[a-f0-9]{16}',row.get('slug',''))) and (
        row.get('origin',{}).get('source_id')=='opax-grants-research' and
        {'labelset':'source','label':'opax_parliamentary_roster'} in labels and
        {'labelset':'kind','label':'parliamentary_profile'} in labels)


def projection(row):
    texts=row.get('texts') or {k:v.get('value',{}) for k,v in row.get('data',{}).get('texts',{}).items()}
    return {'title':row.get('title'),'body':texts.get('t-body',{}).get('body'),
            'origin':{'url':row.get('origin',{}).get('url'),
                      'created':(row.get('origin',{}).get('created') or '')[:10]}, 'extra':row.get('extra'),
            'labels':sorted(row.get('usermetadata',{}).get('classifications',[]),key=lambda c:(c['labelset'],c['label']))}


def fingerprint(row):
    return hashlib.sha256(json.dumps(projection(row),sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def public_projection(row):
    """Match /api/resource's observable labels: last value per labelset.

    Native reconciliation still compares every classification. A public snapshot
    cannot reveal earlier labels in the same set, so they cannot establish drift.
    """
    result=projection(row)
    labels={c['labelset']:c['label'] for c in row.get('usermetadata',{}).get('classifications',[])}
    result['labels']=[{'labelset':k,'label':v} for k,v in sorted(labels.items())]
    return result


def plan(desired,inventory,public=False):
    wanted={r['slug']:r for r in desired}
    existing={r['slug']:r for r in inventory}
    if len(existing)!=len(inventory) or len(wanted)!=len(desired):raise ValueError('Duplicate profile slug')
    result=[]
    for slug in sorted(wanted.keys()|existing.keys()):
        old=existing.get(slug);new=wanted.get(slug)
        if old is not None and not owned(old):
            labels=old.get('usermetadata',{}).get('classifications',[])
            if not (public and old.get('_public_snapshot') and
                    {'labelset':'source','label':'opax_parliamentary_roster'} in labels and
                    {'labelset':'kind','label':'parliamentary_profile'} in labels):
                raise ValueError('Unowned roster-profile resource: '+slug)
        if old is None:action='create'
        elif new is None:action='retire'
        elif (public_projection if public else projection)(old)!=(public_projection if public else projection)(new):action='replace'
        else:continue
        result.append({'action':action,'slug':slug,'title':(new or old)['title'],
                       'previous_hash':fingerprint(old) if old else None,
                       'desired_hash':fingerprint(new) if new else None,
                       'before':projection(old) if old else None,'after':projection(new) if new else None})
    return result


def public_inventory(base,names):
    """Credential-free GET preview. Apply always re-inventories the KB and checks
    source_id, which the public resource route deliberately does not expose.
    """
    import requests
    def read(name):
        slug='roster-profile-'+hashlib.sha256(name.encode()).hexdigest()[:16]
        response=requests.get(base.rstrip('/')+'/api/resource/'+slug+'?cache=bypass',timeout=30)
        if response.status_code==404:return None
        response.raise_for_status();r=response.json()
        return {'slug':slug,'title':r['title'],'texts':{'t-body':{'body':r['text'],'format':'PLAIN'}},
                'origin':{'url':r['url'],'created':r['metadata']['date']+'T00:00:00Z'},
                'usermetadata':{'classifications':[{'labelset':k,'label':v} for k,v in r['labels'].items()]},
                'extra':{'metadata':r['metadata']},'_public_snapshot':True}
    with ThreadPoolExecutor(max_workers=8) as pool:
        return [r for r in pool.map(read,sorted(names)) if r]


def inventory(kb):
    rows={};page=0
    while True:
        res=kb.catalog(filters='/classification.labels/source/opax_parliamentary_roster',page_size=100,page_number=page)
        batch=res.get('resources') or {}
        if page and batch and set(batch).issubset(rows):raise RuntimeError('Catalog pagination repeated a page')
        rows.update(batch)
        if not res.get('fulltext',{}).get('next_page'):break
        page+=1
    output=[]
    for row in rows.values():
        slug=row['slug']
        if not re.fullmatch(r'roster-profile-[a-f0-9]{16}',slug):raise ValueError('Unexpected slug in roster catalog')
        output.append(kb.get_resource_by_slug(slug,show='basic&show=origin&show=extra&show=values'))
    return output


def get_optional(kb,slug):
    try:return kb.get_resource_by_slug(slug,show='basic&show=origin&show=extra&show=values')
    except AragError as e:
        if e.status!=404:raise
        return None


def apply(kb,operations,desired,backup):
    backup=Path(backup);backup.mkdir(parents=True,exist_ok=True)
    wanted={r['slug']:r for r in desired}
    # Preflight every planned mutation before making the first remote write.
    originals={}
    for op in operations:
        old=get_optional(kb,op['slug'])
        if old is not None and not owned(old):raise ValueError('Unowned resource: '+op['slug'])
        if (fingerprint(old) if old else None)!=op['previous_hash']:raise RuntimeError('Resource changed since plan: '+op['slug'])
        originals[op['slug']]=old
    receipt=[]
    for op in operations:
        slug=op['slug'];old=originals[slug]
        # Recheck against races during a long publication, and retain the original
        # outside the KB before retiring or replacing it.
        live=get_optional(kb,slug)
        if live is not None and not owned(live):raise ValueError('Ownership changed during apply: '+slug)
        if (fingerprint(live) if live else None)!=op['previous_hash']:raise RuntimeError('Resource changed during apply: '+slug)
        if old:
            path=backup/(slug+'-'+op['previous_hash']+'.json')
            if not path.exists():path.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n')
            kb.delete_resource_by_slug(slug)
            if get_optional(kb,slug) is not None:raise RuntimeError('Retirement read-back mismatch: '+slug)
        if op['action']!='retire':
            kb.create_resource(wanted[slug])
            current=get_optional(kb,slug)
            if current is None or not owned(current) or projection(current)!=projection(wanted[slug]):
                raise RuntimeError('Replacement read-back mismatch: '+slug)
        receipt.append({'action':op['action'],'slug':slug,'verified':True})
        with (backup/'receipts.jsonl').open('a') as out:out.write(json.dumps(receipt[-1])+'\n')
    return receipt


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--data',type=Path,default=ROOT/'portal/public/research/mlci.json')
    ap.add_argument('--directory',type=Path,default=ROOT/'portal/public/parliamentarians.json')
    ap.add_argument('--inventory',type=Path,help='offline captured KB resources, no network')
    ap.add_argument('--env',help='credential environment file; never logged')
    ap.add_argument('--public-base',help='credential-free read-only public API preview; cannot apply')
    ap.add_argument('--previous-directory',type=Path,help='previous roster names for public orphan discovery')
    ap.add_argument('--output',type=Path,required=True,help='exact reconciliation plan including before/after bodies')
    ap.add_argument('--backup',type=Path,help='required for apply; originals and verified receipts')
    mode=ap.add_mutually_exclusive_group();mode.add_argument('--apply',action='store_true');mode.add_argument('--dry-run',action='store_true')
    args=ap.parse_args()
    if args.apply and (args.inventory or args.public_base or not args.backup):ap.error('--apply requires online KB inventory and --backup')
    directory=json.loads(args.directory.read_text())
    desired=[r for r in records(json.loads(args.data.read_text()),directory) if r['slug'].startswith('roster-profile-')]
    if args.env:load_dotenv(args.env)
    kb=None
    if args.public_base:
        if not args.previous_directory:ap.error('--public-base requires --previous-directory to discover orphan slugs')
        names={p['name'] for p in directory['people']}|{p['name'] for p in json.loads(args.previous_directory.read_text())['people']}
        old=public_inventory(args.public_base,names)
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.with_suffix('.inventory.json').write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n')
    elif args.inventory:old=json.loads(args.inventory.read_text())
    else:
        cfg=AragConfig.from_env()
        if not cfg.kb_configured:ap.error('Online inventory needs KB credentials via --env or environment')
        kb=KbClient(cfg);old=inventory(kb)
        # Catalog indexing can lag. Probe desired slugs absent from the catalog
        # before planning creates, rather than overwriting an unseen conflict.
        present={r['slug'] for r in old}
        for row in desired:
            if row['slug'] not in present:
                existing=get_optional(kb,row['slug'])
                if existing:old.append(existing)
    is_public=bool(args.public_base or any(r.get('_public_snapshot') for r in old))
    operations=plan(desired,old,public=is_public)
    result={'mode':'apply' if args.apply else 'dry-run','desired':len(desired),'indexed':len(old),
            'counts':dict(Counter(op['action'] for op in operations)),
            'ownership':'Public source labels only; apply verifies KB source_id' if is_public else 'KB source_id verified',
            'comparison':'Public API projection (one value per labelset)' if is_public else 'Full native source projection',
            'operations':operations}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='operations'}),flush=True)
    for op in operations:print(f"{op['action']} {op['slug']} {op['title']}",flush=True)
    if args.apply:
        from scripts.publish_collected_bill_texts import assert_no_generation
        from parli.arag import _request
        assert_no_generation(_request('GET',kb._rag('/configuration'),kb._headers),
                             _request('GET',kb._rag('/schema'),kb._headers),kb.list_tasks())
        apply(kb,operations,desired,args.backup)


if __name__=='__main__':main()
