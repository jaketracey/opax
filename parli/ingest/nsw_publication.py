"""NSW repair ownership and publication progress. No source or KB requests here.

Normal sync keeps its read-only SQLite connection. Publication acknowledgements
and failures use its existing atomic JSON state, independently of its row cursor.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from parli.ingest import backfill_guard as growth


PARSER_VERSION = 2


def approved():
    return growth.enabled('nsw') and not (growth.state_dir() / 'backfill.STOP').exists()


def managed(db):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='nsw_backfill_turns'").fetchone() is not None


def owned(db, speech_id):
    return managed(db) and db.execute('SELECT 1 FROM nsw_backfill_turns WHERE speech_id=? LIMIT 1', (speech_id,)).fetchone() is not None


def exclude_sql(db):
    if not managed(db):
        return ''
    return ' AND speech_id NOT IN (SELECT speech_id FROM nsw_backfill_turns WHERE speech_id IS NOT NULL) '


def ready_ids_sql(db):
    columns = {row[1] for row in db.execute('PRAGMA table_info(nsw_backfill_days)')}
    if 'parser_version' not in columns:
        return 'SELECT speech_id FROM nsw_backfill_turns WHERE 0'
    return ("SELECT t.speech_id FROM nsw_backfill_turns t JOIN nsw_backfill_days d ON d.toc_id=t.toc_id "
            f"WHERE d.parser_version={PARSER_VERSION} AND d.error IS NULL AND t.speech_id IS NOT NULL")


def ledger(state):
    pub = state.setdefault('nsw_backfill', {})
    for key, default in [('published', []), ('excluded', []), ('failed', {})]:
        pub.setdefault(key, default)
    return pub


def read_state(path=None):
    if path is None:
        return {}
    path = Path(path).expanduser()
    try:
        state = json.loads(path.read_text())
        if not isinstance(state, dict) or not isinstance(state.get('nsw_backfill', {}), dict):
            raise ValueError('invalid publication state')
        pub = state.get('nsw_backfill', {})
        for key in ('published', 'excluded'):
            ids = pub.get(key, [])
            if not isinstance(ids, list) or any(type(sid) is not int or sid <= 0 for sid in ids):
                raise ValueError(f'invalid NSW publication {key}')
        if not isinstance(pub.get('failed', {}), dict):
            raise ValueError('invalid NSW publication failures')
        return state
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as error:
        return {'nsw_backfill': {'state_error': str(error)}}


def progress(db, state=None):
    """Per owned day: held turns, pending documents, failed acknowledgements."""
    result = defaultdict(lambda: {'held_turns': 0, 'publication_pending': 0,
                                 'publication_failed': 0, 'stage_errors': 0})
    if not managed(db):
        return dict(result)
    columns = {row[1] for row in db.execute('PRAGMA table_info(nsw_backfill_days)')}
    version = 'parser_version' if 'parser_version' in columns else '0'
    for chamber, day, held, error, parser in db.execute(f'SELECT chamber,date,held,error,{version} FROM nsw_backfill_days'):
        result[(chamber, day)]['held_turns'] = held
        result[(chamber, day)]['stage_errors'] = int(bool(error) or parser != PARSER_VERSION)
    pub = (state or {}).get('nsw_backfill', {})
    done = set(map(int, pub.get('published', []))) | set(map(int, pub.get('excluded', [])))
    failures = pub.get('failed', {})
    for sid, chamber, day in db.execute(
            'SELECT DISTINCT s.speech_id,s.chamber,s.date FROM speeches s '
            'JOIN nsw_backfill_turns t ON t.speech_id=s.speech_id WHERE length(s.text)>=200'):
        if sid not in done:
            key = 'publication_failed' if str(sid) in failures or pub.get('state_error') else 'publication_pending'
            result[(chamber, day)][key] += 1
    return dict(result)
