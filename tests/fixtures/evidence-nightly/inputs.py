"""Seed tiny SQLite readiness inputs, independent of the static export stubs."""
from pathlib import Path
import sqlite3
import sys

NAMES = ('parli.db', 'evidence-layers-full.sqlite', 'evidence-places.sqlite',
         'evidence-identity-decisions.sqlite', 'evidence-additional-mentions.sqlite')


def seed(directory):
    root = Path(directory)
    root.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        with sqlite3.connect(root / name) as db:
            if name == 'parli.db':
                db.executescript('CREATE TABLE speeches(speech_id); INSERT INTO speeches VALUES(1); '
                                 'CREATE TABLE ext_press_releases(source,source_id); CREATE TABLE government_grants(grant_id);')
            elif name == 'evidence-identity-decisions.sqlite':
                db.execute('CREATE TABLE decisions(status)')
            else:
                db.execute('CREATE TABLE progress(source_table,processed)')
                if name == 'evidence-places.sqlite':
                    db.execute("INSERT INTO progress VALUES('government_grants',0)")
                    db.executescript("CREATE TABLE meta(key,value); INSERT INTO meta VALUES('programme_rowid','0');")
                else:
                    db.executemany('INSERT INTO progress VALUES(?,?)', [('speeches', 1), ('ext_press_releases', 0)])
                    if name == 'evidence-layers-full.sqlite':
                        db.execute('CREATE TABLE evidence(predicate)')
    return dict(zip(('source', 'evidence', 'places', 'decisions', 'additional'), (root / name for name in NAMES)))


if __name__ == '__main__':
    seed(sys.argv[1])
