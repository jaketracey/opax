"""Compatibility entry point for the complete, resumable TVFY API fetcher.

Always re-list windows, split the 100-row cap, use stable person IDs, and
retry failed detail requests. The endpoint is contacted only as OPAXBot.
"""
from .tvfy_refresh import (
    api_key as get_api_key, fetch_window, main as refresh_main, phase_detail, phase_list,
)
from datetime import date


def ingest_divisions(db, api_key=None, since=None):
    from . import tvfy_refresh as refresh
    if api_key:
        refresh._KEY = api_key
    before = db.execute("SELECT COUNT(*) FROM divisions").fetchone()[0]
    failed = phase_list(db, date.fromisoformat(since or '2006-01-01'), True)
    failed += phase_detail(db, None, strict=True)
    if failed:
        raise refresh.TvfyError('incomplete TVFY acquisition; retry required')
    return db.execute("SELECT COUNT(*) FROM divisions").fetchone()[0] - before


def main():
    import sys
    if '--strict' not in sys.argv:
        sys.argv.append('--strict')
    refresh_main()


if __name__ == '__main__':
    main()
