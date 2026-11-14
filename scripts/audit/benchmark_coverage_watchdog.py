#!/usr/bin/env python3
"""Offline benchmark on a disposable synthetic corpus; never opens parli.db.

python3 scripts/audit/benchmark_coverage_watchdog.py --out /tmp/coverage-benchmark.json
The index has realistic cardinality and row count. Speech text is padding, and
the query must be covered by the index so body size does not affect read I/O.
"""
from argparse import ArgumentParser, Namespace
from contextlib import closing, redirect_stdout
from datetime import date, timedelta
import io
import json
from pathlib import Path
import platform
import sqlite3
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts import coverage_watchdog as wd


def benchmark(rows):
    with tempfile.TemporaryDirectory(prefix='coverage-benchmark-') as directory:
        root = Path(directory)
        db_path = root / 'synthetic.sqlite'
        with closing(sqlite3.connect(db_path)) as db, db:
            db.execute('CREATE TABLE speeches(chamber TEXT,date TEXT,hearing_type TEXT,text TEXT)')
            # 15,000 occupied chamber-days, 1.5M rows, spanning 1901-2026.
            def records():
                for i in range(rows):
                    group = i // 100
                    ch = wd.CHAMBERS[group % 11]
                    day = date(1901, 1, 1) + timedelta(days=(group // 11) * 33)
                    yield ch, day.isoformat(), None, 'x' * 1024
            db.executemany('INSERT INTO speeches VALUES(?,?,?,?)', records())
            db.execute(f'CREATE INDEX {wd.INDEX} ON speeches(chamber,date,hearing_type)')
            index_bytes = db.execute('SELECT sum(pgsize) FROM dbstat WHERE name=?', (wd.INDEX,)).fetchone()[0]
        args = Namespace(db=db_path, through='2026-11-13', state_dir=root / 'state',
                         calendar=ROOT / 'portal/public/parliament/sitting-days.json',
                         cache_root=root, expected_days=[], allowlist=ROOT / 'scripts/coverage_allowlist.json',
                         drop_fraction=0.5)
        runs = []
        for _ in range(3):
            started = time.monotonic()
            with redirect_stdout(io.StringIO()):
                wd.run(args)
            report = json.loads((args.state_dir / 'coverage-report-v1.json').read_text())
            runs.append({'wall_seconds': round(time.monotonic() - started, 4), **report['timing']})
        return {'platform': platform.platform(), 'python': platform.python_version(),
                'sqlite': sqlite3.sqlite_version, 'synthetic_rows': rows,
                'body_bytes_per_row': 1024, 'db_bytes': db_path.stat().st_size,
                'index_bytes': index_bytes, 'runs': runs,
                'snapshot_bytes': (args.state_dir / 'coverage-snapshot-v1.json').stat().st_size,
                'storage_projection': 'index_bytes / (125 * 1024 * 1024) seconds at 125 MiB/s, '
                                      'plus measured aggregate/analysis time; no table or speech text reads'}


if __name__ == '__main__':
    ap = ArgumentParser(description=__doc__)
    ap.add_argument('--rows', type=int, default=1_500_000)
    ap.add_argument('--out', type=Path, required=True)
    args = ap.parse_args()
    result = benchmark(args.rows)
    args.out.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
