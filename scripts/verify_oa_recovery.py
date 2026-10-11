#!/usr/bin/env python3
"""Read-only OA audit -> staging-only compact DB -> exact schema 1 export proof."""
import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import types

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.ingest.openaustralia_xml import read_only, apply_divisions, atomic
from parli.ingest.votes_state import Division, Vote
from scripts import export_votes as E
from scripts.vm.mobile_votes_contract import validate_votes


def projection(db, module=E):
    out,names,newest={},{},{}
    module.export_federal(db,out,names,newest)
    module.export_state(db,out,names,newest)
    latest={}
    for key, day in newest.items():module.note_latest(latest,out[key]['jurisdiction'],day)
    out['_names']=names
    out['_meta']={'content_changed_at':'2026-10-10T00:00:00Z',
                  'latest_division_date':max(latest.values(),default=None),
                  'latest_division_date_by_jurisdiction':dict(sorted(latest.items())), 'schema':1}
    validate_votes(out)
    return out,module.dump(out)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db',default='~/.cache/autoresearch/parli.db')
    ap.add_argument('--stage',default='/home/jake/opax-staging/oa-feed')
    ap.add_argument('--baseline-ref',default='origin/main')
    args=ap.parse_args(); stage=Path(args.stage).resolve()
    destination=stage/'schema1-proof.db'
    source=Path(args.db).expanduser().resolve()
    if destination==source:raise SystemExit('proof destination must differ from read-only source')
    raw=json.loads((stage/'divisions.json').read_text())
    report=json.loads((stage/'dry-run.json').read_text())
    bad={i.get('division') for i in report['issues'] if i.get('division')}
    with read_only(source) as original:
        baseline, before=projection(original)
        old=types.ModuleType('previous_export_votes'); old.__file__=E.__file__
        code=subprocess.check_output(['git','show',args.baseline_ref+':scripts/export_votes.py'],cwd=Path(__file__).resolve().parents[1])
        exec(compile(code, E.__file__, 'exec'),old.__dict__)
        _, old_bytes=projection(original,old)
        assert before==old_bytes,'unchanged DB must export byte-identically to previous implementation'
        existing={r[0] for r in original.execute("SELECT id FROM ext_divisions WHERE jurisdiction='federal'")}
        recovered=[Division(**d) for d in raw['divisions'] if d['id'] not in existing and d['id'] not in bad]
        recovered_ids={d.id for d in recovered}
        votes=[Vote(**v) for v in raw['votes'] if v['division_id'] in recovered_ids]
        if destination.exists():destination.unlink()
        with sqlite3.connect(destination) as scratch:
            for table in ('members','divisions','votes','ext_divisions','ext_votes'):
                ddl=original.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone()[0]
                scratch.execute(ddl)
                columns=len(original.execute(f'PRAGMA table_info({table})').fetchall())
                scratch.executemany(f'INSERT INTO {table} VALUES ('+','.join('?' for _ in range(columns))+')',
                                    original.execute(f'SELECT * FROM {table}'))
            apply_divisions(scratch,recovered,votes)
            after_doc,after=projection(scratch)
            apply_divisions(scratch,recovered,votes)
            assert projection(scratch)[1]==after,'recovery must be idempotent'
    atomic(stage/'votes.schema1-proof.json',after)
    procedural = []
    for d in recovered:
        if d.house == 'representatives' and d.date == '2025-11-06' and d.number in (23, 24):
            pol = E.xml_polarity(E.parse_name(d.name), d.question)
            assert pol == 0, 'closure votes must not become bill stances'
            procedural.append({'division_id':d.id, 'question':d.question, 'polarity':pol,
                               'ayes':d.ayes_count, 'noes':d.noes_count,
                               'bill_ids':[b['official_id'] for b in d.extra.get('bills', [])]})
    proof={'schema':1,'validated':True,'baseline_byte_compatible':True,'idempotent':True,
           'procedural_divisions':procedural,
           'baseline_ref':args.baseline_ref,
           'recovered_divisions_added':len(recovered),'recovered_member_votes_added':len(votes),
           'quarantined_division_ids':sorted(bad),'source_db_mode':'ro','proof_db':str(destination),
           'before_sha256':hashlib.sha256(before.encode()).hexdigest(),
           'after_sha256':hashlib.sha256(after.encode()).hexdigest(),
           'federal_votes_before':sum(v['divisions_total'] for k,v in baseline.items() if not k.startswith('_') and v['jurisdiction']=='federal'),
           'federal_votes_after':sum(v['divisions_total'] for k,v in after_doc.items() if not k.startswith('_') and v['jurisdiction']=='federal')}
    atomic(stage/'schema1-proof.json',json.dumps(proof,indent=2))
    print(json.dumps(proof))


if __name__=='__main__':main()
