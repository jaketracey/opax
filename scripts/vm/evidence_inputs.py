#!/usr/bin/env python3
"""Read-only evidence input readiness; exit 0 ready, 3 waiting (no export)."""
from __future__ import annotations

import argparse
from contextlib import closing, ExitStack
import os
from pathlib import Path
import sqlite3

DEFAULTS = {
    "source": ("SOURCE", "parli.db"),
    "evidence": ("LAYERS", "evidence-layers-full.sqlite"),
    "places": ("PLACES", "evidence-places.sqlite"),
    "decisions": ("DECISIONS", "evidence-identity-decisions.sqlite"),
    "additional": ("ADDITIONAL", "evidence-additional-mentions.sqlite"),
}


def readiness(paths: dict[str, Path]) -> str:
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        return "missing: " + ", ".join(missing)
    with ExitStack() as stack:
        dbs = {}
        for name, path in paths.items():
            try:
                db = stack.enter_context(closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)))
                db.execute('PRAGMA query_only=ON')
                db.execute('BEGIN')
                # Check the coverage schema before issuing cross-input checks.
                queries = {
                    'source': 'SELECT (SELECT count(*) FROM speeches), (SELECT count(*) FROM ext_press_releases), '
                              '(SELECT count(*) FROM government_grants), (SELECT coalesce(max(rowid),0) FROM government_grants)',
                    'evidence': 'SELECT source_table,processed FROM progress',
                    'places': 'SELECT source_table,processed FROM progress',
                    'decisions': 'SELECT count(*) FROM decisions',
                    'additional': 'SELECT source_table,processed FROM progress',
                }
                dbs[name] = db.execute(queries[name]).fetchall()
                if name == 'evidence':
                    candidates = db.execute("SELECT count(*) FROM evidence WHERE predicate='same_identity_candidate'").fetchone()[0]
                elif name == 'places':
                    programme = db.execute("SELECT value FROM meta WHERE key='programme_rowid'").fetchone()
            except (sqlite3.Error, OSError):
                return f"unreadable: {path} (coverage unavailable)"
        speeches, releases, grants, grant_rowid = dbs['source'][0]
        totals = dict(speeches=speeches, ext_press_releases=releases, government_grants=grants)
        progress = dict(dbs['evidence'])
        progress.update(dbs['places'])
        problems = []
        for table, total in totals.items():
            if progress.get(table) != total:
                owner = 'places' if table == 'government_grants' else 'evidence'
                problems.append(f"{paths[owner]} ({table} processed {progress.get(table, 'missing')} != source {total})")
        try:
            programme_rowid = int(programme[0]) if programme else None
        except (ValueError, TypeError):
            programme_rowid = None
        if programme_rowid != grant_rowid:
            problems.append(f"{paths['places']} (programme checkpoint != source grant rowid {grant_rowid})")
        if dbs['decisions'][0][0] != candidates:
            problems.append(f"{paths['decisions']} (decision count != {candidates} identity candidates)")
        additional = dict(dbs['additional'])
        for table in ('speeches', 'ext_press_releases'):
            if additional.get(table) != totals[table]:
                problems.append(f"{paths['additional']} ({table} processed {additional.get(table, 'missing')} != source {totals[table]})")
        return 'mismatch: ' + '; '.join(problems) if problems else 'ready'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for name, (env, filename) in DEFAULTS.items():
        parser.add_argument('--' + name, type=Path, default=Path(os.environ.get(
            'OPAX_EVIDENCE_' + env, str(Path.home() / '.cache/autoresearch' / filename))))
    args = parser.parse_args()
    result = readiness(vars(args))
    print(result)
    return 0 if result == 'ready' else 3


if __name__ == '__main__':
    raise SystemExit(main())
