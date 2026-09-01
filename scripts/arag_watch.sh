#!/usr/bin/env bash
# Watch the bulk load running on desktop. Emits one line per ~50K docs pushed,
# and a terminal line on completion or unexpected stop. For use with Monitor.
set -u
last_emit=0
fails=0

remote_status() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 desktop '
python3 - <<"EOF"
import json
try:
    s = json.load(open("/home/jake/.cache/autoresearch/arag_sync_state.json"))
    t = s["tables"]
    pushed = sum(tt.get("pushed", 0) for tt in t.values())
    failed = sum(len(tt.get("failed", {})) for tt in t.values())
    print(f"pushed={pushed} failed={failed}")
except Exception as e:
    print(f"stateerr {e}")
EOF
kill -0 "$(cat /tmp/arag_sync.pid 2>/dev/null)" 2>/dev/null && echo RUNNING || echo STOPPED
tail -2 /tmp/arag_sync.log 2>/dev/null' 2>/dev/null
}

while true; do
  out=$(remote_status)
  if [ -z "$out" ]; then
    fails=$((fails + 1))
    if [ "$fails" -ge 3 ]; then
      echo "MONITOR: ssh to desktop failing repeatedly (load may still be running)"
      fails=0
    fi
    sleep 600
    continue
  fi
  fails=0
  pushed=$(printf '%s\n' "$out" | grep -o 'pushed=[0-9]*' | head -1 | cut -d= -f2)
  pushed=${pushed:-0}
  if printf '%s\n' "$out" | grep -q STOPPED; then
    if printf '%s\n' "$out" | grep -q "Elapsed"; then
      printf 'BULK LOAD COMPLETE: %s\n' "$(printf '%s' "$out" | tr '\n' ' | ')"
    else
      printf 'BULK LOAD STOPPED UNEXPECTEDLY: %s\n' "$(printf '%s' "$out" | tr '\n' ' | ')"
    fi
    break
  fi
  if [ "$pushed" -ge $((last_emit + 50000)) ]; then
    last_emit=$pushed
    echo "load progress: ${pushed} docs pushed"
  fi
  sleep 600
done
