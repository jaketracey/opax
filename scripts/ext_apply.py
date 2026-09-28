#!/usr/bin/env python3
"""Staged, guarded, id-preserving apply of an ext_* register into the live parli.db.

    .venv/bin/python -m parli.ingest.money_state_donations --source qld --db "$STAGE/qld.sqlite"
    .venv/bin/python scripts/ext_apply.py donations --stage-dir "$STAGE" --db "$DB"

The engine and the full description are in parli/ingest/ext_apply.py (profiles: donations,
lobbyists, fits, grants). This file only puts the repo root on sys.path so the script runs
from a checkout without PYTHONPATH.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from parli.ingest.ext_apply import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
