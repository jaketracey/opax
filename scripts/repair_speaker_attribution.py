#!/usr/bin/env python3
"""Build an offline speaker repair; sync requires an approved artifact digest.

Build never constructs a KB client and opens SQLite with mode=ro/query_only.
No mode calls Ask, enrichment, generation, D1, deployment or source fetching.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.audit.speaker_attribution_check import norm, read_db
from parli.ingest.arag_sync import map_speech
from parli.ingest.openaustralia_xml import People, parse_speech, plain, FOLDERS
from parli.ingest.speaker_roles import chair_role

OWN_LABELS = {'kind','source','state','party','chamber','decade','speaker_type','chair_role'}


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded(value)+b'\n')


def jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('wb') as out:
        for row in rows:
            out.write(encoded(row)+b'\n')


def read_lines(path):
    with path.open() as stream:
        for line in stream:
            yield json.loads(line)


def annotate_identity_conflicts(output):
    """Separate bad state IDs from contradictory numeric federal owners."""
    manifest=list(read_lines(output/'repair-manifest.jsonl'))
    conflicts=[]
    for p in manifest:
        old,new=str(p.get('before_person_id','')),str(p.get('primary_person_id',''))
        if old.isdigit() and new.isdigit() and old!=new:
            p['primary_identity_review_required']=True
            conflicts.append({k:p[k] for k in ('old_slug','before_speaker','before_person_id',
                'primary_speaker','primary_person_id','primary_gid','primary_slug')})
    jsonl(output/'repair-manifest.jsonl',manifest)
    dump(output/'identity-conflicts.json',conflicts)
    report=json.loads((output/'dry-run.json').read_text())
    report['primary_identity_conflicts_for_review']=len(conflicts)
    dump(output/'dry-run.json',report)
    if (output/'artifact-checksums.json').exists():
        checks=json.loads((output/'artifact-checksums.json').read_text())
        checks['repair-manifest.jsonl']=sha((output/'repair-manifest.jsonl').read_bytes())
        checks['identity-conflicts.json']=sha((output/'identity-conflicts.json').read_bytes())
        dump(output/'artifact-checksums.json',checks)


def display_body(text):
    return '\n\n'.join(p for p in (text or '').split('\n\n')
                       if not re.fullmatch(r'\d{1,2}:\d{2}\s*(?:am|pm)', p.strip())
                       and not p.strip().startswith('View the PC OA website'))


def turn_slug(gid):
    return 'speech-oa-'+sha(gid.encode())[:24]


def select_span(row, evidence, turns):
    """Long-paragraph audit establishes bounds; nearby short turns fill gaps.

    A question and its answer can have different minor-heading GIDs. Match
    the opening text across those headings; a wrong historic person ID must
    never redirect a question to the minister answering it.
    """
    by_gid = {t['gid']: i for i,t in enumerate(turns)}
    positions = [by_gid[t['gid']] for t in evidence['source_turns'] if t['gid'] in by_gid]
    if not positions:
        raise ValueError('No source turn established for speech-'+str(row['speech_id']))
    start, end = min(positions), max(positions)
    paras = [norm(p) for p in display_body(row['text']).split('\n\n') if norm(p)]
    if paras:
        options = [i for i in range(max(0,start-30),start+1)
                   if paras[0] in turns[i]['_norm'] and (len(paras[0])>=35
                       or str(turns[i]['person_id']) == str(row['person_id']))]
        if options:
            start = max(options)
        elif not any(str(t['person_id'])==str(row['person_id']) for t in turns[start:end+1]):
            # Public XML can revise a question/motion since the HTML snapshot.
            # Recover the nearest preceding, explicitly dated office owner.
            # This is a source revision, recorded in source_expanded_gids,
            # rather than permission to change the questioner's identity.
            options = [i for i in range(max(0,start-30),start)
                       if str(turns[i]['person_id'])==str(row['person_id'])]
            if options:
                start = max(options)
        section = turns[end]['gid'].rsplit('.',1)[0]
        options = [i for i in range(end,min(len(turns),end+31))
                   if turns[i]['gid'].rsplit('.',1)[0] == section
                   and paras[-1] in turns[i]['_norm']]
        if options:
            end = min(options)
    selected = [t for t in turns[start:end+1] if t['text']]
    primary = next((t for t in selected if str(t['person_id']) == str(row['person_id'])), selected[0])
    return selected, primary


def map_turn(turn, slug, legacy_slugs):
    row = {'speech_id': None, 'speaker_name': turn['speaker'], 'person_id': turn['person_id'],
           'speaker_name_clean': turn.get('person_name') or turn['speaker'],
           'party': turn['party'], 'electorate': turn['electorate'], 'chamber': turn['chamber'],
           'date': turn['date'], 'topic': turn['topic'], 'text': turn['text'], 'word_count': len(turn['text'].split()),
           'source': 'openaustralia', 'state': 'federal', 'speaker_type': turn['speaker_type'],
           **{k:turn[k] for k in ('chair_role','gid','oa_office_id','citation_anchor','talktype')}}
    doc = map_speech(row)
    doc['slug'] = slug
    doc['origin']['url'] = 'https://www.openaustralia.org.au/'+('senate' if turn['chamber']=='senate' else 'debate')+'/?id='+turn['citation_anchor']
    doc['extra']['metadata'].update({'legacy_slugs':sorted(legacy_slugs), 'source_url':turn['source_url'],
        'source_paragraphs':turn['paragraphs'], 'attribution_version':2})
    return doc


def labels_only(resource, row):
    role = chair_role(row['party'])
    labels = [c for c in resource['usermetadata']['classifications'] if c['labelset'] not in {'party','speaker_type','chair_role'}]
    labels += [{'labelset':'speaker_type','label':'chair'},{'labelset':'chair_role','label':role}]
    metadata = deepcopy(resource.get('extra',{}))
    metadata.setdefault('metadata',{}).update({'person_id':None,'chair_person_id':str(row['person_id']),
                                              'attribution_version':2})
    origin = deepcopy(resource.get('origin',{})); origin['collaborators'] = []
    return {'usermetadata':{'classifications':labels},'extra':metadata,'origin':origin}


def build(args):
    args.output.mkdir(parents=True,exist_ok=True)
    catalog = json.loads((args.audit/'openaustralia-catalog.json').read_text())
    blast = json.loads((args.audit/'blast-radius.json').read_text())
    roles = json.loads((args.audit/'role-audit.json').read_text())
    audit = json.loads((args.audit/'oa-source-audit.json').read_text())
    evidence = {r['speech_id']:r for r in audit['rows']}
    evidence.update({r['speech_id']:r for r in blast['source_evidence']})
    affected = {r['resource_id'] for r in blast['documents']} | {r['resource_id'] for r in roles['documents']}
    mixed = {r['resource_id'] for r in blast['documents']}
    role_ids = {r['resource_id'] for r in roles['documents']}
    resources = catalog['resources']; by_rid = {r['id']:r for r in resources}
    by_sid = defaultdict(list)
    for r in resources:
        by_sid[int(r['slug'][7:])].append(r)
    db = read_db(args.db)
    rows = {}
    for offset in range(0,len(by_sid),400):
        chunk = list(by_sid)[offset:offset+400]
        for r in db.execute('SELECT * FROM speeches WHERE speech_id IN ('+','.join('?' for _ in chunk)+')',chunk):
            rows[r['speech_id']] = dict(r)
            rows[r['speech_id']]['_norm'] = norm(display_body(r['text']))
    people = People((args.cache/'people.xml').read_bytes(),[(args.cache/f).read_bytes() for f in ('representatives.xml','senators.xml')],db)
    db.close()
    days = defaultdict(list)
    for sid,row in rows.items():
        days[(row['chamber'],row['date'])].append(sid)
    units, memberships, plans, reuse, issues, source_receipts = {}, defaultdict(set), [], {}, [], []
    chair_patch_ops = []
    for count, ((house,day), sids) in enumerate(sorted(days.items()),1):
        # Only read days necessary for the repair or unchanged-unit reuse.
        path = args.cache/'raw'/FOLDERS[house]/(day+'.xml')
        if not path.exists():
            alternate = args.output/'sources'/(day+'.xml')
            path = alternate if alternate.exists() else path
        if not path.exists():
            for sid in sids:
                for r in by_sid[sid]:
                    if r['id'] in role_ids and r['id'] not in mixed:
                        row=rows[sid]
                        chair_patch_ops.append({'method':'PATCH','rid':r['id'],'slug':r['slug'],
                            'payload':labels_only(r,row),'policy':'chair-label-only','expected':r})
                        plans.append({'resource_id':r['id'],'old_slug':r['slug'],'action':'chair-label-only',
                            'destinations':[r['slug']],'role':chair_role(row['party']),
                            'text_changed':False,'source_unavailable':True,
                            'topic_policy':'preserve','summary_policy':'preserve'})
                    elif sid in blast['source_unavailable_slugs']:
                        plans.append({'resource_id':r['id'],'old_slug':r['slug'],'action':'unresolved-source',
                            'reason':'XML absent from cache and public scraped XML returns 404',
                            'date':day,'chamber':house,'destinations':[]})
            continue
        raw = path.read_bytes(); source_receipts.append({'path':str(path),'sha256':sha(raw)})
        root = ET.fromstring(raw)
        turns, topic = [], ''
        for node in root:
            if node.tag == 'major-heading': topic = plain(node)
            elif node.tag == 'speech':
                for n in node.iter('speech'):
                    try: turns.append(parse_speech(n,house,day,people,topic))
                    except ValueError as exc: issues.append({'gid':n.get('id'),'reason':str(exc)})
        turn_by_gid = {t['gid']:t for t in turns}
        for t in turns:
            t['_norm'] = norm(t['text'])
        # Unchanged single-turn resources retain their old slug and RID.
        for sid in sids:
            ev = evidence.get(sid,{})
            source_turns = ev.get('source_turns',[])
            if len(source_turns) != 1: continue
            t = turn_by_gid.get(source_turns[0]['gid'])
            if not t or rows[sid]['_norm'] != t['_norm']: continue
            candidates = [r for r in by_sid[sid] if r['id'] not in mixed]
            if candidates:
                previous = reuse.get(t['gid'])
                candidate = min(candidates,key=lambda r:r['slug'])
                if previous is None or candidate['slug'] < previous['slug']:
                    reuse[t['gid']] = candidate
        for sid in sorted(sids):
            row, ev = rows[sid], evidence.get(sid)
            for r in by_sid[sid]:
                if r['id'] not in affected: continue
                if r['id'] not in mixed:
                    payload = labels_only(r,row)
                    chair_patch_ops.append({'method':'PATCH','rid':r['id'],'slug':r['slug'],
                        'payload':payload,'policy':'chair-label-only','expected':r})
                    plans.append({'resource_id':r['id'],'old_slug':r['slug'],'action':'chair-label-only',
                        'destinations':[r['slug']],'role':chair_role(row['party']),
                        'text_changed':False,'topic_policy':'preserve','summary_policy':'preserve'})
                    continue
                chosen,primary = select_span(row,ev,turns)
                # The HTML party is direct evidence of the primary's chair role
                # when a panel/deputy role is absent from the dated office XML.
                role = chair_role(row['party'])
                if role:
                    for t in chosen:
                        if t['person_id'] == primary['person_id']:
                            t['chair_role'],t['speaker_type'] = role,'chair'
                gids = [t['gid'] for t in chosen]
                for t in chosen:
                    units[t['gid']] = t; memberships[t['gid']].add(r['slug'])
                plans.append({'resource_id':r['id'],'old_slug':r['slug'],
                    'action':'split' if len(gids)>1 else 'keep-corrected',
                    'gids':gids,'primary_gid':primary['gid'],
                    'before_person_id':row['person_id'],'before_speaker':row['speaker_name'],
                    'primary_person_id':primary['person_id'],'primary_speaker':primary['speaker'],
                    'before_body_sha256':sha((row.get('text_clean') or row['text']).encode()),
                    'chair_label_added':r['id'] in role_ids,'date':day,'chamber':house,
                    'topic_policy':'invalidate on changed units; preserve reused unchanged units',
                    'summary_policy':'invalidate on changed units; preserve reused unchanged units',
                    'source_expanded_gids':[t['gid'] for t in chosen if t['_norm'] not in row['_norm']]})
        if count%150==0: print(f'Parsed {count}/{len(days)} chamber-days; {len(plans)} manifest rows; {len(units)} distinct turns',flush=True)
    # Stable canonical slugs for new units; unchanged full-body units use the
    # already published slug. A non-split corrected row keeps its own slug.
    slugs = {gid:reuse[gid]['slug'] if gid in reuse else turn_slug(gid) for gid in units}
    for p in plans:
        if p['action']=='keep-corrected' and p['primary_gid'] not in reuse:
            slugs[p['primary_gid']] = p['old_slug']
    owners = defaultdict(list)
    redirects = {}
    for p in plans:
        if 'gids' not in p: continue
        p['destinations'] = [slugs[gid] for gid in p['gids']]
        p['primary_slug'] = slugs[p['primary_gid']]
        p['old_slug_fate'] = 'keep' if p['old_slug']==p['primary_slug'] else 'redirect'
        if p['old_slug_fate']=='redirect':
            if p['old_slug'] in redirects and redirects[p['old_slug']] != p['primary_slug']:
                raise ValueError('Conflicting redirects for '+p['old_slug'])
            redirects[p['old_slug']] = p['primary_slug']
        owners[p['primary_gid']].append(p)
    ops, docs, changed_slugs, new_summaries = [], {}, [], []
    for gid,t in sorted(units.items()):
        slug = slugs[gid]
        if gid in reuse:
            continue
        doc = map_turn(t,slug,memberships[gid]); docs[slug] = doc
        # Split resources are fresh units. Do not carry over field-level
        # machine labels, generated summaries or paragraph IDs from a mixed
        # resource. A one-unit correction may retain its existing RID.
        candidates = sorted([p for p in owners[gid] if p['action']=='keep-corrected'],key=lambda p:p['resource_id'])
        if candidates:
            owner = candidates[0]; owner['retained_rid'] = True
            ops.append({'method':'PATCH','rid':owner['resource_id'],'slug':slug,'payload':doc,
                        'expected':by_rid[owner['resource_id']],'policy':'replace-turn'})
        else:
            ops.append({'method':'POST','slug':slug,'payload':doc,'policy':'new-turn'})
        changed_slugs.append(slug)
        if t['speaker_type']=='member': new_summaries.append(slug)
    # Remove surplus mixed resources only after all destination units exist.
    # Public links survive in the redirect map; never leave a mixed alias in
    # retrieval under the first person's collaborator.
    for p in plans:
        if 'gids' in p and not p.get('retained_rid'):
            ops.append({'method':'DELETE','rid':p['resource_id'],'slug':p['old_slug'],
                        'target':p['primary_slug'],'expected':by_rid[p['resource_id']],'policy':'retire-mixed'})
    ops.extend(chair_patch_ops)
    for slug,doc in docs.items(): dump(args.output/'documents'/(slug+'.json'),doc)
    # Chair-only staging preserves the exact source body; sync sends metadata
    # only, so it also preserves any more recent live text or enrichment.
    for op in chair_patch_ops:
        r=op['expected']; row=rows[int(r['slug'][7:])]
        doc=map_speech(row); doc.update(op['payload']); docs[r['slug']]=doc
        dump(args.output/'documents'/(r['slug']+'.json'),doc)
    jsonl(args.output/'repair-manifest.jsonl',sorted(plans,key=lambda p:(p['old_slug'],p['resource_id'])))
    jsonl(args.output/'kb-operations.jsonl',ops)
    dump(args.output/'redirects.json',redirects)
    dump(args.output/'enrichment-plan.json',{'hold_required':True,'generate_now':False,
        'invalidate':sorted(changed_slugs),'new_summary_slugs':sorted(new_summaries),
        'new_topic_slugs':sorted(new_summaries),'chair_and_unknown_units_excluded':len(changed_slugs)-len(new_summaries),
        'worker_queue_is_keyed_by':'rid','completed_rows_need_explicit_reset':True})
    dump(args.output/'source-receipts.json',source_receipts)
    dump(args.output/'issues.json',issues)
    # Twenty examples: required names first, then role-only, then breadth.
    picked=[]
    for name in ('Melissa McIntosh','Milton Dick','Sarah Hanson-Young'):
        for p in plans:
            if p.get('before_speaker')==name and p['action']=='split': picked.append(p); break
    for p in plans:
        if p['action']=='chair-label-only' and len(picked)<6: picked.append(p)
    for p in sorted(plans,key=lambda p:sha(p['old_slug'].encode())):
        if p['action']=='split' and p not in picked: picked.append(p)
        if len(picked)==20: break
    samples=[]; passages=[]
    for i,p in enumerate(picked,1):
        r=by_rid[p['resource_id']]; row=rows[int(p['old_slug'][7:])]
        cached=args.audit/(p['old_slug']+'-body.json')
        before=json.loads(cached.read_text())['value']['body'] if cached.exists() else row.get('text_clean') or row['text']
        stem=f'{i:02d}-{p["old_slug"]}'
        dump(args.output/'samples'/(stem+'-before.json'),{'resource':r,'body':before,
            'body_basis':'cached live KB body' if cached.exists() else 'read-only DB text_clean snapshot'})
        after=[]
        for slug in p['destinations']:
            if slug in docs: after.append(docs[slug])
            else:
                gid=next(g for g in p['gids'] if slugs[g]==slug)
                doc=map_turn(units[gid],slug,memberships[gid]); doc['reuse_existing_resource']=True;after.append(doc)
        dump(args.output/'samples'/(stem+'-after.json'),{'manifest':p,'documents':after})
        samples.append({'slug':p['old_slug'],'speaker':row['speaker_name'],'action':p['action'],
            'before_characters':len(before),'after_units':len(after),
            'primary_characters':len(next(d for d in after if d['slug']==p.get('primary_slug',p['old_slug']))['texts']['body']['body']),
            'before':'samples/'+stem+'-before.json','after':'samples/'+stem+'-after.json'})
    # Map identical paragraphs to new offsets; positional anchors of changed
    # bodies cannot survive reprocessing without this explicit crosswalk.
    for p in plans:
        if 'gids' not in p: continue
        row=rows[int(p['old_slug'][7:])];before=row.get('text_clean') or row['text']
        for gid in p['gids']:
            slug=slugs[gid];doc=docs.get(slug) or map_turn(units[gid],slug,memberships[gid])
            after=doc['texts']['body']['body']; cursor=0
            for para in after.split('\n\n'):
                old=before.find(para)
                if old>=0:
                    passages.append({'old_slug':p['old_slug'],'old_rid':p['resource_id'],
                        'new_slug':slug,'gid':gid,'citation_anchor':units[gid]['citation_anchor'],
                        'old_start':old,'old_end':old+len(para),'new_start':cursor,'new_end':cursor+len(para),
                        'text_sha256':sha(para.encode()),'offset_basis':'Python Unicode code points; DB text_clean snapshot'})
                cursor+=len(para)+2
    jsonl(args.output/'passage-map.jsonl',passages);dump(args.output/'samples/index.json',samples)
    payload_bytes=sum(len(encoded(op['payload'])) for op in ops if 'payload' in op)
    counts=Counter(p['action'] for p in plans);methods=Counter(op['method'] for op in ops)
    report={'dry_run':True,'kb_writes':0,'d1_writes':0,'generation_calls':0,
        'catalog_at':catalog['at'],'confirmed_input_documents':len(affected),'input_distinct_slugs':len({by_rid[r]['slug'] for r in affected}),
        'manifest_counts':dict(counts),'kb_operation_counts':dict(methods),'planned_kb_requests':len(ops),
        'corrected_distinct_turns':len(units),'reused_unchanged_turns':len(reuse.keys() & units.keys()),
        'new_resources':methods['POST'],'replaced_resources':sum(op['policy']=='replace-turn' for op in ops),
        'chair_label_patches':len(chair_patch_ops),'redirects':len(redirects),
        'write_payload_bytes':payload_bytes,'body_bytes':sum(len(doc['texts']['body']['body'].encode()) for doc in docs.values()),
        'new_summaries_required':len(new_summaries),'new_topic_classifications_required':len(new_summaries),
        'member_units_under_three_words':sum(units[g]['speaker_type']=='member' and len(units[g]['text'].split())<3
            for g in units if g not in reuse),
        'topic_labels_invalidated_minimum':sum(sum(c['labelset']=='topic' and not c.get('cancelled_by_user') for c in by_rid[r]['usermetadata']['classifications']) for r in mixed),
        'source_expanded_documents':sum(bool(p.get('source_expanded_gids')) for p in plans),
        'primary_person_id_corrections':sum(str(p.get('primary_person_id'))!=str(p.get('before_person_id'))
            for p in plans if 'primary_person_id' in p),
        'uncached_source_slugs':len(blast['source_unavailable_slugs']),
        'uncached_chair_label_repairs':sum(p.get('source_unavailable',False) for p in plans),
        'paragraph_crosswalk_entries':len(passages),'issues':len(issues),
        'expected_ingest_seconds_at_1_request_per_second':len(ops),
        'estimate_basis':'Planning rate only; no write benchmark. Additional GET preflight and index processing/backpressure are not measured.',
        'limitations':['Audit catalog and DB are snapshots; sync must check live preconditions.',
            'Source GIDs/anchors and exact paragraphs persist; platform RID/field paragraph IDs and byte offsets can change on reprocessing.',
            'New speech-oa slugs and redirects need portal validators/readers before sync.',
            'Hold enrichment and reset completed RID queue rows after repair; historic reconcile rejects OpenAustralia resources.']}
    dump(args.output/'dry-run.json',report)
    annotate_identity_conflicts(args.output)
    artifacts={str(p.relative_to(args.output)):sha(p.read_bytes()) for p in args.output.rglob('*')
               if p.is_file() and (p.name in {'repair-manifest.jsonl','kb-operations.jsonl','redirects.json','identity-conflicts.json'} or p.parent.name=='documents')}
    dump(args.output/'artifact-checksums.json',artifacts)
    print(json.dumps(report,indent=2),flush=True)


def verify(output):
    artifacts=json.loads((output/'artifact-checksums.json').read_text())
    for file,digest in artifacts.items():
        if sha((output/file).read_bytes()) != digest: raise ValueError('Artifact changed: '+file)
    return sha((output/'artifact-checksums.json').read_bytes())


def sync(args):
    digest=verify(args.output)
    if not args.apply:
        print(json.dumps({'dry_run':True,'artifact_digest':digest,
                          'operations':sum(1 for _ in read_lines(args.output/'kb-operations.jsonl'))}));return
    if args.approved_digest != digest or not args.redirects_ready or not args.enrichment_held:
        raise ValueError('Sync requires the approved digest, published redirect/reader support and an enrichment hold')
    if json.loads((args.output/'identity-conflicts.json').read_text()) and not args.identity_conflicts_reviewed:
        raise ValueError('Review the conflicting original and XML primary identities before sync')
    # These imports and credentials are reached only after an explicit go.
    from parli.arag import AragConfig,AragError,KbClient,load_dotenv,_request
    load_dotenv(str(args.env));kb=KbClient(AragConfig.from_env())
    ops=list(read_lines(args.output/'kb-operations.jsonl'))
    manifest=list(read_lines(args.output/'repair-manifest.jsonl'))
    before_hash={p['resource_id']:p['before_body_sha256'] for p in manifest if 'before_body_sha256' in p}
    state_path=args.output/'sync-receipt.json'; state=json.loads(state_path.read_text()) if state_path.exists() else {'done':[],'artifact_digest':digest}
    if state['artifact_digest'] != digest: raise ValueError('Receipt belongs to another plan')
    done=set(state['done'])
    # Verify *all* existing resources before any new mutation. Do not replace
    # a resource whose attribution changed since the captured audit.
    for i,op in enumerate(ops):
        if i in done or 'expected' not in op:continue
        live=_request('GET',kb._rag('/resource/'+op['rid']+'?show=basic&show=origin&show=extra&show=values'),kb._headers)
        expected=op['expected']
        if any(live.get(k)!=expected.get(k) for k in ('slug','origin','extra')):
            raise ValueError('Live attribution changed for '+op['rid'])
        if op['rid'] in before_hash:
            body=live.get('data',{}).get('texts',{}).get('body',{}).get('value',{}).get('body','')
            if sha(body.encode())!=before_hash[op['rid']]:
                raise ValueError('Live body differs from reviewed snapshot: '+op['rid'])
    verified_destinations=False
    for i,op in enumerate(ops):
        if i in done: continue
        if op['method']=='POST':
            try:
                kb.create_resource(op['payload'])
            except AragError as exc:
                if exc.status!=409:raise
                live=kb.get_resource_by_slug(op['slug'],show='basic&show=values&show=origin&show=extra')
                doc=op['payload']
                if (live.get('extra',{}).get('metadata',{}).get('gid')!=doc['extra']['metadata']['gid']
                    or live.get('origin',{}).get('collaborators')!=doc['origin']['collaborators']
                    or live.get('data',{}).get('texts',{}).get('body',{}).get('value',{}).get('body')!=doc['texts']['body']['body']):
                    raise ValueError('Existing canonical slug differs from staged unit: '+op['slug'])
        elif op['method']=='PATCH':
            live=_request('GET',kb._rag('/resource/'+op['rid']+'?show=basic&show=values&show=origin&show=extra'),kb._headers)
            payload=deepcopy(op['payload'])
            live_labels=live.get('usermetadata',{}).get('classifications',[])
            owned=OWN_LABELS if op['policy']=='replace-turn' else {'party','speaker_type','chair_role'}
            payload['usermetadata']['classifications']=[c for c in live_labels if c['labelset'] not in owned and
                not (op['policy']=='replace-turn' and c['labelset']=='topic')]+[
                c for c in payload['usermetadata']['classifications'] if c['labelset'] in owned]
            if op['policy']=='replace-turn':
                # Empty every generated summary and previous continuation body
                # before retrieval can treat the corrected resource as valid.
                payload['summary']=''
                for field in live.get('data',{}).get('texts',{}):
                    if 'summary' in field.lower() or field.startswith('body-'):
                        payload['texts'][field]={'body':'','format':'PLAIN'}
            _request('PATCH',kb._rag('/resource/'+op['rid']),kb._headers,payload)
        else:
            # Do not retire any old resource until *every* split unit is
            # processed and available, including destinations reused unchanged.
            # A pending index exits with the create receipts intact for resume.
            if not verified_destinations:
                destinations={s for p in manifest if 'gids' in p for s in p['destinations']}
                for slug in sorted(destinations):
                    live=kb.get_resource_by_slug(slug,show='basic')
                    if live.get('metadata',{}).get('status')!='PROCESSED':
                        raise ValueError('Destination not processed yet; resume later: '+slug)
                verified_destinations=True
            _request('DELETE',kb._rag('/resource/'+op['rid']),kb._headers)
        done.add(i);state['done']=sorted(done);dump(state_path,state)
    print(json.dumps({'completed':len(done),'artifact_digest':digest}))


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('command',choices=['build','sync','verify'])
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--audit',type=Path,default=Path('/home/jake/opax-work/evidence/speaker-attribution-check-20261012'))
    ap.add_argument('--cache',type=Path,default=Path('/home/jake/opax-staging/oa-feed'))
    ap.add_argument('--db',type=Path,default=Path.home()/'.cache/autoresearch/parli.db')
    ap.add_argument('--env',type=Path,default=Path.home()/'opax/.env')
    ap.add_argument('--apply',action='store_true');ap.add_argument('--approved-digest')
    ap.add_argument('--redirects-ready',action='store_true');ap.add_argument('--enrichment-held',action='store_true')
    ap.add_argument('--identity-conflicts-reviewed',action='store_true')
    args=ap.parse_args()
    if args.command=='build':build(args)
    elif args.command=='verify':print(verify(args.output))
    else:sync(args)


if __name__=='__main__':main()
