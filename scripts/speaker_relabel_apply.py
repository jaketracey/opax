#!/usr/bin/env python3
"""Phase 2: snapshot, metadata-only rollback canary and guarded relabel batches.

No config, field, generation, resource-creation/deletion or slug APIs exist here.
Catalog is a metadata read. PATCH accepts exactly origin/usermetadata/extra.
"""
from __future__ import annotations
import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, time as walltime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from zoneinfo import ZoneInfo

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from parli.arag import AragConfig, AragError, KbClient, load_dotenv, _request
from scripts.audit.speaker_attribution_check import catalog

ROOT=Path('/home/jake/opax-work/evidence/speaker-attribution-relabel-20261013')
KEYS={'origin','usermetadata','extra'}
INSTANCE='i-0d725823966c827b9'
AEDT=ZoneInfo('Australia/Sydney')


class Paused(RuntimeError): pass


def encode(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def digest(value):return hashlib.sha256(encode(value)).hexdigest()
def read_lines(path):
    with path.open() as stream:
        for line in stream:yield json.loads(line)
def dump(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_bytes(encode(value)+b'\n');tmp.replace(path)
def log(output,event,**fields):
    output.mkdir(parents=True,exist_ok=True)
    row={'at':datetime.now(timezone.utc).isoformat(),'event':event,**fields}
    with (output/'batches.log').open('ab') as stream:stream.write(encode(row)+b'\n')
    print(json.dumps(row),flush=True)


def writable(resource):
    return {key:deepcopy(resource.get(key) or {}) for key in sorted(KEYS)}


def normal(value):
    if isinstance(value,dict):
        return {k:normal(v) for k,v in value.items() if not (k=='cancelled_by_user' and v is False)}
    if isinstance(value,list):
        # Classifications and provenance are sets; presentation order is not
        # a rollback failure, but a missing/changed value always is.
        return sorted((normal(v) for v in value),key=lambda v:encode(v))
    return value


def unchanged_projection(resource):
    return {k:deepcopy(resource.get(k)) for k in ('id','slug','title','summary','fieldmetadata','computedmetadata')}


def forbidden_time(now=None):
    local=(now or datetime.now(timezone.utc)).astimezone(AEDT)
    return walltime(3,0)<=local.time().replace(tzinfo=None)<walltime(6,30)


def gate(output,batch,now=None,aws_run=subprocess.run):
    if forbidden_time(now):
        log(output,'waiting',batch=batch,reason='03:00–06:30 AEDT write exclusion',writes=0)
        raise Paused('Write exclusion window; wait until 06:30 AEDT')
    command=['aws','ec2','describe-instances','--instance-ids',INSTANCE,
             '--query','Reservations[0].Instances[0].State.Name','--output','text']
    # No --profile, credentials/environment substitution, or fallback account.
    result=aws_run(command,capture_output=True,text=True,timeout=40)
    if result.returncode:
        # Do not log arbitrary cloud responses or credentials.
        log(output,'gate-blocked',batch=batch,reason='Default AWS profile could not read EC2 state',aws_exit=result.returncode,writes=0)
        raise Paused('Default AWS authentication/state check failed')
    state=result.stdout.strip()
    if state=='running':
        log(output,'waiting',batch=batch,reason='EC2 is running',ec2_state=state,writes=0)
        raise Paused('EC2 is running; wait for stopped state')
    if state!='stopped':
        log(output,'gate-blocked',batch=batch,reason='EC2 is not stopped',ec2_state=state,writes=0)
        raise Paused('Unexpected EC2 state: '+state)
    log(output,'gate-passed',batch=batch,ec2_state=state)


class MetadataClient:
    def __init__(self,env):
        load_dotenv(str(env));self.kb=KbClient(AragConfig.from_env())
    def get(self,rid,values=False):
        if not re.fullmatch('[0-9a-f]{32}',rid):raise ValueError('Invalid RID')
        shows='basic&show=origin&show=extra'+('&show=values' if values else '')
        return _request('GET',self.kb._rag('/resource/'+rid+'?show='+shows),self.kb._headers,timeout=30)
    def patch(self,rid,payload):
        if set(payload)!=KEYS:raise ValueError('Only origin/usermetadata/extra are allowed')
        if forbidden_time():raise Paused('Write exclusion window began')
        result=_request('PATCH',self.kb._rag('/resource/'+rid),self.kb._headers,payload,timeout=20,max_retries=0)
        if isinstance(result,dict) and result.get('seqid') is not None:
            raise Paused('Metadata PATCH unexpectedly returned a processing sequence; stop for cost review')
        return result
    def read_catalog(self):
        return catalog(self.kb,[{'prop':'label','labelset':'kind','label':'speech'},
                               {'prop':'label','labelset':'source','label':'openaustralia'}])
    def total(self,clauses):
        return self.kb.catalog_post({'filter_expression':{'resource':{'and':clauses}},'page_size':1})['fulltext']['total']


def verify_readback(client,rid,expected,unchanged=None):
    for attempt in range(8):
        live=client.get(rid)
        if normal(writable(live))==normal(expected):
            if unchanged is not None and normal(unchanged_projection(live))!=normal(unchanged):
                raise Paused('Non-owned metadata changed: '+rid)
            return live
        time.sleep(min(1+attempt,5))
    raise Paused('Metadata read-back mismatch: '+rid)


def verify_plan(plan_dir):
    checks=plan_dir/'artifact-checksums.json'
    if not checks.exists():raise Paused('Planner checksums are required')
    for file,expected in json.loads(checks.read_text()).items():
        if Path(file).name!=file:raise Paused('Invalid planner artifact path')
        if hashlib.sha256((plan_dir/file).read_bytes()).hexdigest()!=expected:
            raise Paused('Planner artifact changed: '+file)


def source_preflight(plan_dir):
    table=plan_dir/'facet-against-source.json'
    if not table.exists():return
    anomalies=[row for row in json.loads(table.read_text()) if row.get('facet_nonexclusive_or_wrong',0)]
    if anomalies:
        slugs=sorted({s for row in anomalies for s in row.get('unchanged_nonexclusive_slugs',[])})
        raise Paused('Unresolved source/facet anomalies outside the repair set: '+','.join(slugs))


def snapshot(args):
    verify_plan(args.plan)
    source=json.loads((args.output/'current-openaustralia-catalog.json').read_text())
    live={r['id']:r for r in source['resources']}
    plans=list(read_lines(args.plan/'relabel-plan.jsonl'))
    paths=[]
    for p in plans:
        rid=p['resource_id']
        if rid not in live:raise Paused('Orphaned planned RID: '+rid)
        r=live[rid]
        if r['slug']!=p['slug']:raise Paused('Slug drift: '+rid)
        target=args.output/'snapshots'/(rid+'.json')
        value={'captured_at':source['at'],'resource_id':rid,'slug':r['slug'],
               'raw_metadata':r,'rollback_payload':writable(r),
               'unchanged':unchanged_projection(r),'metadata_sha256':digest(normal(writable(r)))}
        if target.exists() and json.loads(target.read_text())!=value:
            raise Paused('Existing snapshot differs; do not overwrite: '+rid)
        dump(target,value);paths.append({'rid':rid,'slug':r['slug'],'snapshot':str(target),'sha256':digest(value)})
    dump(args.output/'snapshot-index.json',{'at':source['at'],'documents':paths,'count':len(paths),
        'source_snapshot':str(args.output/'current-openaustralia-catalog.json')})
    print(json.dumps({'snapshotted':len(paths),'live_writes':0}))


def merge_plan(live,plan):
    payload=writable(live)
    wanted=plan['payload']
    owned=set(plan['owned_labelsets'])
    payload['origin']['collaborators']=wanted['origin']['collaborators']
    labels=payload['usermetadata'].get('classifications',[])
    payload['usermetadata']['classifications']=[c for c in labels if c['labelset'] not in owned]+[
        c for c in wanted['usermetadata']['classifications'] if c['labelset'] in owned]
    payload['extra'].setdefault('metadata',{}).update(wanted['extra']['metadata'])
    return payload


def rollback_one(client,output,rid,allow_owned_drift=True):
    snap=json.loads((output/'snapshots'/(rid+'.json')).read_text())
    live=client.get(rid)
    if live['slug']!=snap['slug']:raise Paused('Cannot roll back changed slug: '+rid)
    client.patch(rid,snap['rollback_payload'])
    restored=verify_readback(client,rid,snap['rollback_payload'],snap['unchanged'])
    return {'rid':rid,'restored_sha256':digest(normal(writable(restored))),'expected_sha256':snap['metadata_sha256'],
            'metadata_diff':[],'unchanged_fields_diff':[]}


def canary(args,client=None,gate_fn=gate):
    verify_plan(args.plan)
    source_preflight(args.plan)
    plans=list(read_lines(args.plan/'relabel-plan.jsonl'))
    p=next(p for p in plans if p['action']=='chair-label-only')
    rid=p['resource_id'];gate_fn(args.output,'rollback-canary')
    client=client or MetadataClient(args.env)
    snap=json.loads((args.output/'snapshots'/(rid+'.json')).read_text())
    live=client.get(rid)
    if normal(writable(live))!=normal(snap['rollback_payload']):raise Paused('Canary snapshot drift')
    desired=merge_plan(live,p)
    client.patch(rid,desired)
    verify_readback(client,rid,desired,snap['unchanged'])
    # Restoration is a separate write and therefore has its own gate.
    gate_fn(args.output,'rollback-canary-restore')
    result=rollback_one(client,args.output,rid)
    result.update({'passed':True,'write_restore_diff_test':True,'writes':2})
    dump(args.output/'rollback-canary.json',result)
    log(args.output,'rollback-canary-passed',**result)
    return result


def batch_sizes(n):
    result=[]
    for size in [200,1000]:
        if n<=0:break
        result.append(min(size,n));n-=size
    while n>0:result.append(min(5000,n));n-=5000
    return result


def checks(client,output,plan_dir,batch,changed):
    # The planner supplies exact source-authority expectations for each
    # checkpoint, including fixed and deterministic random MPs.
    expected=json.loads((plan_dir/'batch-projections.json').read_text())
    checkpoint=expected[batch-1]
    table=[]
    kind=[{'prop':'label','labelset':'kind','label':'speech'},
          {'prop':'label','labelset':'source','label':'openaustralia'}]
    for row in checkpoint['facet_against_source']:
        count=client.total(kind+[{'prop':'origin_collaborator','collaborator':row['name']}])
        result={**row,'actual_facet':count,'expected_after':row['facet_documents'],
                'matches_source':count==row['facet_documents'] and row['changed_nonexclusive_documents_in_facet']==0}
        table.append(result)
        if not result['matches_source']:
            dump(output/f'batch-{batch:02d}-facet-check.json',table)
            raise Paused('Facet/source mismatch: '+row['name'])
    current=client.read_catalog();baseline=json.loads((output/'current-openaustralia-catalog.json').read_text())
    before={r['id']:r['slug'] for r in baseline['resources']};after={r['id']:r['slug'] for r in current['resources']}
    duplicates=lambda entries:{s:n for s,n in Counter(entries.values()).items() if n>1}
    if before!=after or duplicates(before)!=duplicates(after):
        raise Paused('Orphan, duplicate or slug inventory anomaly')
    dump(output/f'batch-{batch:02d}-facet-check.json',table)
    dump(output/f'batch-{batch:02d}-inventory.json',{'orphan_delta':0,'duplicate_delta':0,
         'known_duplicate_slugs':duplicates(after),'resources':len(after),'changed':changed})
    return table


def attribution_audit(output,resources,projection=False):
    from scripts.audit.speaker_attribution_check import relabel_status
    audit=Path('/home/jake/opax-work/evidence/speaker-attribution-check-20261012')
    result=relabel_status(resources,json.loads((audit/'blast-radius.json').read_text()),
                         json.loads((audit/'role-audit.json').read_text()))
    result['projection']=projection
    expected_conflicts={r['old_slug'] for r in json.loads((output/'plan'/'unchanged-71-plus-9.json').read_text())['identity_conflicts']}
    result['all_remaining_unflagged_are_held_conflicts']=set(result['unflagged_mixed_slugs'])==expected_conflicts
    dump(output/('attribution-projected.json' if projection else 'attribution-after.json'),result)
    return result


def apply(args,client=None,gate_fn=gate):
    verify_plan(args.plan)
    source_preflight(args.plan)
    canary_file=args.output/'rollback-canary.json'
    if not canary_file.exists() or not json.loads(canary_file.read_text()).get('passed'):
        raise Paused('Live rollback canary must pass before batches')
    plans=list(read_lines(args.plan/'relabel-plan.jsonl'))
    index=json.loads((args.output/'snapshot-index.json').read_text())
    if {p['resource_id'] for p in plans}!={r['rid'] for r in index['documents']}:
        raise Paused('Every touched resource needs a snapshot')
    state_path=args.output/'apply-state.json'
    plan_digest=digest(plans)
    state=json.loads(state_path.read_text()) if state_path.exists() else {'completed_batches':0,'done':{},'plan_digest':plan_digest}
    if state['plan_digest']!=plan_digest:raise Paused('Plan changed after snapshot/run')
    client=client or MetadataClient(args.env);offset=0
    for number,size in enumerate(batch_sizes(len(plans)),1):
        group=plans[offset:offset+size];offset+=size
        if number<=state['completed_batches']:continue
        gate_fn(args.output,number)
        log(args.output,'batch-started',batch=number,size=size)
        for p in group:
            rid=p['resource_id']
            if rid in state['done']:continue
            if forbidden_time():raise Paused('Write exclusion window began')
            snap=json.loads((args.output/'snapshots'/(rid+'.json')).read_text())
            live=client.get(rid)
            if normal(writable(live))!=normal(snap['rollback_payload']):
                raise Paused('Snapshot metadata drift: '+rid)
            payload=merge_plan(live,p)
            # Write-ahead journal makes timeout/interrupt recovery reviewable.
            dump(args.output/'write-ahead'/(rid+'.json'),{'rid':rid,'before':snap['rollback_payload'],'after':payload,'batch':number})
            client.patch(rid,payload)
            verified=verify_readback(client,rid,payload,snap['unchanged'])
            state['done'][rid]=digest(writable(verified));dump(state_path,state)
        table=checks(client,args.output,args.plan,number,len(group))
        state['completed_batches']=number;dump(state_path,state)
        log(args.output,'batch-verified',batch=number,size=size,cumulative=len(state['done']),
            facets=table,orphan_delta=0,duplicate_delta=0)
    result=attribution_audit(args.output,client.read_catalog()['resources'])
    if result['missing_chair_role_documents'] or not result['all_remaining_unflagged_are_held_conflicts']:
        raise Paused('Final attribution audit found an unexpected unflagged or missing-chair document')
    return state


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('command',choices=['snapshot','gate','canary','apply','rollback'])
    ap.add_argument('--output',type=Path,default=ROOT)
    ap.add_argument('--plan',type=Path,default=ROOT/'plan')
    ap.add_argument('--env',type=Path,default=Path('/home/jake/opax/.env'))
    ap.add_argument('--rid');args=ap.parse_args()
    try:
        if args.command=='snapshot':snapshot(args)
        elif args.command=='gate':gate(args.output,'preflight')
        elif args.command=='canary':canary(args)
        elif args.command=='apply':apply(args)
        else:
            if not args.rid:raise ValueError('--rid is required')
            gate(args.output,'rollback')
            result=rollback_one(MetadataClient(args.env),args.output,args.rid);log(args.output,'rollback-restored',**result)
    except (Paused,AragError) as exc:
        reason=str(exc) if isinstance(exc,Paused) else 'KB HTTP failure '+str(exc.status)
        log(args.output,'paused',reason=reason)
        raise SystemExit(3) from None


if __name__=='__main__':main()
