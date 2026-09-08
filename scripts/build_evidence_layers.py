#!/usr/bin/env python3
"""Build evidence-backed connections in a sidecar; never mutate source records.

Uses original source text only. Ambiguous aliases are retained for review and
never silently assigned. Restarting resumes at a committed source rowid.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time

VERSION = '2'
WORD = re.compile(r"[^\W_]+", re.UNICODE)
GENERIC = {'government', 'department', 'council', 'australia', 'australian government',
           'commonwealth', 'the company', 'the department', 'health', 'education'}


def tokens(value):
    return tuple(m.group().casefold() for m in WORD.finditer(value or ''))


def compatible_names(name, legal_name):
    if not legal_name:
        return True
    noise = {'pty','ltd','limited','proprietary','the','of','and','australia','australian',
             'department','company','group','services','inc','incorporated','trust'}
    left, right = set(tokens(name))-noise, set(tokens(legal_name))-noise
    return bool(left & right)


def valid_abn(value):
    value = re.sub(r'\s', '', str(value or ''))
    if not re.fullmatch(r'\d{11}', value) or value == '0' * 11:
        return None
    digits = list(map(int, value)); digits[0] -= 1
    return value if sum(a*b for a,b in zip(digits, [10,1,3,5,7,9,11,13,15,17,19])) % 89 == 0 else None


class Matcher:
    def __init__(self, aliases):
        self.trie = {}
        for alias, targets in aliases.items():
            if len(targets) != 1 or len(alias) < 2 or ' '.join(alias) in GENERIC:
                continue
            node = self.trie
            for part in alias:
                node = node.setdefault(part, {})
            node[None] = next(iter(targets))

    def matches(self, text):
        words = list(WORD.finditer(text))
        for i, word in enumerate(words):
            node = self.trie
            best = None
            for j in range(i, min(i + 30, len(words))):
                # Names must not cross sentence/paragraph boundaries.
                if j > i and re.search(r'[.!?;\n]', text[words[j-1].end():words[j].start()]):
                    break
                node = node.get(words[j].group().casefold())
                if node is None:
                    break
                if None in node:
                    best = (node[None], word.start(), words[j].end())
            if best:
                yield best


def setup(path):
    c = sqlite3.connect(path)
    c.executescript('''
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,kind TEXT,name TEXT,abn TEXT);
      CREATE TABLE IF NOT EXISTS identities(source_table TEXT,source_id TEXT,entity_id TEXT,
        method TEXT,source_name TEXT,source_abn TEXT,PRIMARY KEY(source_table,source_id));
      CREATE TABLE IF NOT EXISTS aliases(alias TEXT,entity_id TEXT,PRIMARY KEY(alias,entity_id));
      CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,subject TEXT,predicate TEXT,
        object TEXT,source_table TEXT,source_id TEXT,source_url TEXT,quote TEXT,
        start INTEGER,end INTEGER,method TEXT,confidence REAL,details TEXT);
      CREATE INDEX IF NOT EXISTS evidence_object ON evidence(object,predicate);
      CREATE INDEX IF NOT EXISTS evidence_subject ON evidence(subject,predicate);
      CREATE TABLE IF NOT EXISTS progress(source_table TEXT PRIMARY KEY,last_rowid INTEGER,processed INTEGER);
    ''')
    old = c.execute("SELECT value FROM meta WHERE key='version'").fetchone()
    if old and old[0] != VERSION:
        raise ValueError('Use a fresh output database for a new extractor version')
    c.execute("INSERT OR IGNORE INTO meta VALUES ('version',?)", (VERSION,))
    c.commit()
    return c


def add_evidence(out, subject, predicate, obj, table, sid, quote, method,
                 confidence, url=None, start=None, end=None, details=None):
    key = json.dumps([subject,predicate,obj,table,str(sid),start,end],ensure_ascii=False)
    out.execute('INSERT OR IGNORE INTO evidence VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        (hashlib.sha256(key.encode()).hexdigest(),subject,predicate,obj,table,str(sid),
         url,quote,start,end,method,confidence,json.dumps(details or {},ensure_ascii=False)))


def registry(source, out):
    aliases = defaultdict(set)
    for table, column, kind in [('ext_contract_suppliers','supplier_id','supplier'),
                                 ('ext_donor_entities','entity_id','donor'),
                                 ('ext_grant_recipients','recipient_id','grant_recipient')]:
        for row in source.execute('SELECT * FROM ' + table):
            r = dict(row); sid = str(r[column]); abn = valid_abn(r.get('abn'))
            legal_name = r.get('abr_name') or r.get('abn_name')
            consistent = compatible_names(r['canonical_name'],legal_name)
            method = 'validated_source_abn' if abn and consistent else ('conflicting_source_names' if not consistent else 'source_identity')
            entity = 'abn:' + abn if abn and consistent else table + ':' + sid
            out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,?)',
                        (entity,'organisation',r['canonical_name'],abn))
            out.execute('INSERT OR REPLACE INTO identities VALUES (?,?,?,?,?,?)',
                        (table,sid,entity,method,r['canonical_name'],r.get('abn')))
            names = [r['canonical_name'], legal_name] if consistent and r.get('kind') not in {'individual','undisclosed','other'} else []
            raw = r.get('aliases')
            if raw:
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed,list) and names: names.extend(x for x in parsed if isinstance(x,str) and compatible_names(x,r['canonical_name']))
                except (ValueError,TypeError): pass
            for name in names:
                if name and tokens(name): aliases[tokens(name)].add(entity)
            add_evidence(out,table+':'+sid,'identifies',entity,table,sid,
                json.dumps({'name':r['canonical_name'],'abn':r.get('abn')},ensure_ascii=False),
                method,1.0,details={'identity_usable':consistent,'source_kind':r.get('kind')})
    # Donor aliases carry the same provenance as the donor register.
    for row in source.execute('SELECT alias_raw,entity_id FROM ext_donor_aliases'):
        identity = out.execute('SELECT entity_id FROM identities WHERE source_table=? AND source_id=?',
                               ('ext_donor_entities',str(row['entity_id']))).fetchone()
        if identity and row['alias_raw']:
            entry = out.execute('SELECT name FROM entities WHERE id=?',(identity[0],)).fetchone()
            if entry and compatible_names(row['alias_raw'],entry[0]) and any(identity[0] in ids for ids in [aliases.get(tokens(entry[0]),set())]):
                aliases[tokens(row['alias_raw'])].add(identity[0])
    # Exact names can resolve an ABN-less identity only when exactly one ABN is
    # supported by the whole alias, and no conflicting legal identities exist.
    resolutions = {}
    candidates = defaultdict(set)
    for name, entities in aliases.items():
        legal = {x for x in entities if x.startswith('abn:')}
        if len(legal) == 1 and len(name) >= 2 and ' '.join(name) not in GENERIC:
            for entity in entities - legal: candidates[entity].update(legal)
    for entity, legal in candidates.items():
        if len(legal) != 1: continue
        target = next(iter(legal)); resolutions[entity] = target
        add_evidence(out,entity,'same_identity_candidate',target,'derived_alias_registry',entity,
            out.execute('SELECT name FROM entities WHERE id=?',(entity,)).fetchone()[0],
            'unique_exact_alias_abn_candidate',0.9,
            details={'status':'review_required','not_merged':True})
    for r in source.execute("SELECT DISTINCT program FROM ext_grant_details WHERE program IS NOT NULL AND trim(program) != ''"):
        name = r[0]; norm = tokens(name)
        if len(norm) < 2 or ' '.join(norm) in GENERIC: continue
        entity = 'program:' + hashlib.sha256(' '.join(norm).encode()).hexdigest()[:20]
        out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,NULL)',(entity,'program',name))
        aliases[norm].add(entity)
    out.executemany('INSERT OR IGNORE INTO aliases VALUES (?,?)',
                    [(' '.join(name),entity) for name,entities in aliases.items() for entity in entities])
    out.commit()
    return Matcher(aliases)


def structured_places(source,out):
    """Publish address and delivery links separately; never guess a unique seat."""
    postcodes = defaultdict(list)
    for r in source.execute('SELECT * FROM postcode_electorates'):
        postcodes[str(r['postcode']).zfill(4)].append(dict(r))
    def connect(subject, table, sid, postcode, state, predicate):
        postcode = str(postcode or '').strip().zfill(4)
        state = str(state or '').strip().casefold()
        rows = [r for r in postcodes.get(postcode,[]) if not state or r['state'].casefold() == state]
        for r in rows:
            obj='electorate:'+r['state'].casefold()+':'+r['electorate_name'].casefold()
            out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,NULL)',(obj,'electorate',r['electorate_name']))
            add_evidence(out,subject,predicate,obj,table,sid,
                json.dumps({'postcode':postcode,'state':state}),
                'source_postcode_mapping',1.0,
                details={'allocation_ratio':r['ratio'],'candidate_electorates':len(rows),
                         'mapping_source':'postcode_electorates','boundary_date':'unspecified',
                         'interpretation':'postcode overlap; not a verified street location'})
    for r in source.execute('SELECT * FROM ext_grant_details'):
        subject='ext_grant_details:'+str(r['ga_id'])
        connect(subject,'ext_grant_details',r['ga_id'],r['recipient_postcode'],r['recipient_state'],'recipient_address_overlaps')
        connect(subject,'ext_grant_details',r['ga_id'],r['delivery_postcode'],r['delivery_state'],'delivery_postcode_overlaps')
    for table, idcol in [('ext_contract_suppliers','supplier_id'),('ext_grant_recipients','recipient_id')]:
        for r in source.execute('SELECT * FROM '+table+' WHERE abr_postcode IS NOT NULL'):
            connect(table+':'+str(r[idcol]),table,r[idcol],r['abr_postcode'],r['abr_state'],'registered_address_overlaps')
    out.commit()


def electorate_matcher(source,out):
    aliases=defaultdict(set)
    for r in source.execute('SELECT DISTINCT electorate_name,state FROM postcode_electorates'):
        name=r['electorate_name']; state=r['state'].casefold()
        obj='electorate:'+state+':'+name.casefold()
        out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,NULL)',(obj,'electorate',name))
        for prefix in ['electorate of ', 'seat of ', 'division of ']:
            aliases[tokens(prefix+name)].add(obj)
    out.commit()
    return Matcher(aliases)


def scan(source,out,matcher,limit=0):
    places=electorate_matcher(source,out)
    for table, idcol, textcol in [('ext_press_releases','source_id','body_text'),('speeches','speech_id','text_clean')]:
        progress = out.execute('SELECT last_rowid,processed FROM progress WHERE source_table=?',(table,)).fetchone()
        last, count = progress or (0,0); done = 0
        for row in source.execute('SELECT rowid AS _rowid,* FROM '+table+' WHERE rowid > ? ORDER BY rowid',(last,)):
            r=dict(row); sid=str(r[idcol]); text=r.get(textcol) or r.get('text') or ''
            if table == 'ext_press_releases': sid=str(r['source'])+':'+sid
            subject=table+':'+sid
            for entity,start,end in places.matches(text):
                add_evidence(out,subject,'mentions_electorate',entity,table,sid,text[start:end],
                    'explicit_electorate_phrase',0.98,url=r.get('url'),start=start,end=end,
                    details={'excerpt':text[max(0,start-160):min(len(text),end+160)],'date':r.get('date')})
            for entity,start,end in matcher.matches(text):
                add_evidence(out,subject,'mentions',entity,table,sid,text[start:end],
                    'unique_exact_alias',0.98,url=r.get('url'),start=start,end=end,
                    details={'excerpt':text[max(0,start-160):min(len(text),end+160)],
                             'date':r.get('date'),'text_field':textcol if r.get(textcol) else 'text',
                             'text_sha256':hashlib.sha256(text.encode()).hexdigest()})
            if table == 'speeches' and r.get('electorate'):
                electorate=r['electorate'].strip()
                obj='electorate:'+str(r.get('state') or 'unknown').casefold()+':'+electorate.casefold()
                out.execute('INSERT OR IGNORE INTO entities VALUES (?,?,?,NULL)',(obj,'electorate',electorate))
                add_evidence(out,subject,'speaker_represents',obj,table,sid,electorate,
                    'source_electorate_field',1.0,details={'date':r.get('date'),'person_id':r.get('person_id')})
            count+=1; done+=1; last=r['_rowid']
            if done % 500 == 0:
                out.execute('INSERT OR REPLACE INTO progress VALUES (?,?,?)',(table,last,count)); out.commit()
                print(json.dumps({'table':table,'processed':count,'rowid':last}),flush=True)
            if limit and done >= limit: break
        out.execute('INSERT OR REPLACE INTO progress VALUES (?,?,?)',(table,last,count)); out.commit()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',required=True);p.add_argument('--output',required=True)
    p.add_argument('--limit',type=int,default=0)
    a=p.parse_args()
    source=sqlite3.connect(Path(a.source).resolve().as_uri()+'?mode=ro',uri=True)
    source.row_factory=sqlite3.Row
    out=setup(a.output)
    matcher=registry(source,out)
    structured_places(source,out)
    scan(source,out,matcher,a.limit)
    out.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('last_run',str(time.time())))
    out.commit()
    print(json.dumps(dict(out.execute('SELECT predicate,count(*) FROM evidence GROUP BY predicate'))),flush=True)

if __name__=='__main__': main()
