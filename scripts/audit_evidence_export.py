#!/usr/bin/env python3
"""Verify every exported excerpt against source fields/text and public totals."""
import argparse
from collections import Counter
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import sqlite3


def audit(source_path,export_path,require_complete=True):
    src=sqlite3.connect(Path(source_path).resolve().as_uri()+'?mode=ro',uri=True);src.row_factory=sqlite3.Row
    root=Path(export_path);index=json.loads((root/'index.json').read_text());stats=json.loads((root/'stats.json').read_text())
    errors=[];counts=Counter()
    if require_complete and not stats.get('complete'):errors.append('Export is incomplete')
    if index['meta'] != stats:errors.append('Directory metadata differs from stats')
    @lru_cache(maxsize=256)
    def record(table,sid):
        if table=='speeches':
            row=src.execute('SELECT * FROM speeches WHERE speech_id=?',(sid,)).fetchone()
        elif table=='ext_press_releases':
            source,source_id=sid.split(':',1)
            row=src.execute('SELECT * FROM ext_press_releases WHERE source=? AND source_id=?',(source,source_id)).fetchone()
        elif table=='government_grants':
            row=src.execute('SELECT * FROM government_grants WHERE grant_id=?',(sid,)).fetchone()
        else:return None
        return dict(row) if row else None
    directory={entry['id']:entry for entry in index['entities']}
    seen=set()
    for shard in sorted(root.glob('[0-9a-f][0-9a-f].json')):
        data=json.loads(shard.read_text())
        for entity,entry in data['entries'].items():
            seen.add(entity);counts['entities']+=1
            if entity not in directory:errors.append(f'{entity}: missing from directory');continue
            if entry['records']!=directory[entity]['records']:errors.append(f'{entity}: directory record total differs')
            if entry['records']!=sum(entry['years'].values()):errors.append(f'{entity}: year totals differ')
            if entry['records']!=sum(entry['source_kinds'].values()):errors.append(f'{entity}: source-kind totals differ')
            counts['record_connections']+=entry['records']
            record_ids=set()
            for excerpt in entry['excerpts']:
                counts['excerpts']+=1
                table,sid=excerpt['source_table'],excerpt['source_id'];key=(table,sid)
                if key in record_ids:errors.append(f'{entity}: duplicate record excerpt {key}')
                record_ids.add(key);row=record(table,sid)
                if row is None:errors.append(f'{entity}: missing source {key}');continue
                for target in excerpt.get('links',{}).values():
                    if target not in directory:errors.append(f'{entity}: related entry missing {target}')
                details=excerpt.get('details') or {}
                if table=='government_grants':
                    for field,value in details.get('source_fields',{}).items():
                        if row.get(field)!=value:errors.append(f'{entity}: changed source field {key}/{field}')
                    if row.get('source_url')!=excerpt.get('source_url'):errors.append(f'{entity}: changed grant URL')
                else:
                    field=details.get('text_field') or ('body_text' if table=='ext_press_releases' else ('text_clean' if row.get('text_clean') else 'text'))
                    body=row.get(field) or ''
                    start,end=excerpt['start'],excerpt['end']
                    if body[start:end]!=excerpt['matched_text']:errors.append(f'{entity}: source span differs {key}')
                    if excerpt['text'] not in body:errors.append(f'{entity}: excerpt absent from source {key}')
                    digest=excerpt.get('text_sha256')
                    if digest and hashlib.sha256(body.encode()).hexdigest()!=digest:errors.append(f'{entity}: source fingerprint differs {key}')
                    if table=='ext_press_releases' and row.get('url')!=excerpt.get('source_url'):errors.append(f'{entity}: changed release URL')
            for location in entry.get('locations',[]):
                counts['address_links']+=1
                mapping=src.execute('SELECT electorate_name,ratio FROM postcode_electorates WHERE postcode=?',(location['fields']['postcode'],)).fetchall()
                if not any(r['electorate_name']==location['name'] and r['ratio']==location['details']['allocation_ratio'] for r in mapping):
                    errors.append(f'{entity}: postcode link lacks source mapping')
    if seen != set(directory):errors.append('Directory/shard identity sets differ')
    if counts['record_connections']!=stats['published_record_matches']:errors.append('Published connection count differs')
    result={'ok':not errors,'counts':dict(counts),'errors':errors[:100],'error_count':len(errors)}
    print(json.dumps(result,indent=2));return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);p.add_argument('--export',required=True);p.add_argument('--allow-preview',action='store_true')
    a=p.parse_args();r=audit(a.source,a.export,not a.allow_preview);raise SystemExit(0 if r['ok'] else 1)
