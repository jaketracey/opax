#!/bin/bash
# Waits for the running daily_refresh backfill to finish, then pushes the new
# speeches and news to the knowledge box. Approved by the owner 2026-09-02.
cd /home/jake/opax || exit 1
LOG="$HOME/.cache/autoresearch/pipeline/sync_after_backfill.log"
say() { echo "$(date +%H:%M:%S) $*" >> "$LOG"; }
say "waiting for backfill pid ${1:-none}"
while [ -n "$1" ] && kill -0 "$1" 2>/dev/null; do sleep 60; done
say "backfill done; starting knowledge-box sync"
PY=/home/jake/opax/.venv/bin/python
"$PY" -m parli.ingest.arag_sync --tables speeches,news_articles --full >> "$LOG" 2>&1
say "sync exit=$?"
