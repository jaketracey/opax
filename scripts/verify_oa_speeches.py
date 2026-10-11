#!/usr/bin/env python3
"""Run the real modern speech loader on a bounded scratch copy, offline."""
import argparse
import json
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.ingest import openaustralia_xml as X, speeches as S


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', default='~/.cache/autoresearch/parli.db')
    ap.add_argument('--stage', default='/home/jake/opax-staging/oa-feed')
    ap.add_argument('--start', default='2026-09-15')
    ap.add_argument('--end', default='2026-09-17')
    args = ap.parse_args()
    stage = Path(args.stage).resolve()
    target = stage/'speech-reconciliation-proof.db'
    source = Path(args.db).expanduser().resolve()
    if target == source:
        raise SystemExit('scratch destination must differ from read-only source')
    target.unlink(missing_ok=True)
    api_stored_gid = False
    with X.read_only(source) as original, sqlite3.connect(target) as scratch:
        for table in ('members', 'speeches'):
            scratch.execute(original.execute('SELECT sql FROM sqlite_master WHERE name=?', (table,)).fetchone()[0])
            columns = [r[1] for r in original.execute(f'PRAGMA table_info({table})')]
            n = len(columns)
            if table == 'speeches':
                api_stored_gid = bool({'gid', 'oa_gid'} & set(columns))
            query = f'SELECT * FROM {table}'
            params = ()
            if table == 'speeches':
                query += " WHERE date BETWEEN ? AND ? AND chamber IN ('representatives','senate')"
                params = (args.start, args.end)
            scratch.executemany(f'INSERT INTO {table} VALUES ('+','.join('?' for _ in range(n))+')',
                                original.execute(query, params))
        # Preserve the real citation high-water mark, rather than reuse old IDs.
        high = original.execute('SELECT MAX(speech_id) FROM speeches').fetchone()[0]
        if scratch.execute("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").fetchone():
            scratch.execute("UPDATE sqlite_sequence SET seq=? WHERE name='speeches'", (high,))
        people = X.People((stage/'people.xml').read_bytes(),
                          [(stage/f).read_bytes() for f in ('representatives.xml','senators.xml')], scratch)
        modern = stage/'speech-reconciliation-modern'
        modern.mkdir(exist_ok=True)
        for house, folder in X.FOLDERS.items():
            for path in sorted((stage/'raw'/folder).glob('*.xml')):
                if not args.start <= path.stem <= args.end:
                    continue
                speeches, _, _, issues = X.parse_day(path.read_bytes(), house, path.stem, people, {})
                assert not issues, 'source evidence failed its identity/count checks'
                X.atomic(modern/f'{path.stem}_{house}.jsonl', ''.join(json.dumps(s)+'\n' for s in speeches))
        before = scratch.execute('SELECT * FROM speeches ORDER BY speech_id').fetchall()
        saved = S.MODERN_DIR
        try:
            S.MODERN_DIR = modern
            days = []
            added = S.load_modern_jsonl(scratch, set(), args.start, report=days, until=args.end)
        finally:
            S.MODERN_DIR = saved
        assert added == 0, 'already ingested chamber-days must add zero citations'
        assert scratch.execute('SELECT * FROM speeches ORDER BY speech_id').fetchall() == before
        proof = {'source_db_mode':'ro', 'scratch_db':str(target), 'start':args.start, 'end':args.end,
                 'api_stored_gid':api_stored_gid, 'existing_rows':len(before), 'added':added,
                 'existing_rows_byte_unchanged':True,
                 'days':[{k:v for k,v in d.items() if k not in ('matched','unmatched')} |
                         {'matched':len(d['matched']), 'unmatched':len(d['unmatched'])} for d in days]}
        X.atomic(stage/'speech-reconciliation-days.json', json.dumps(days, indent=2))
        X.atomic(stage/'speech-reconciliation-proof.json', json.dumps(proof, indent=2))
        print(json.dumps(proof))


if __name__ == '__main__':
    main()
