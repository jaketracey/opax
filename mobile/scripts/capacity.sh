#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/qa-env.sh"
if [ -z "${OPAX_CAPACITY_CMD:-}" ]; then
  echo "No capacity command configured; skipping capacity checks." >&2
  exit 0
fi
bash -c "$OPAX_CAPACITY_CMD"
load=$(/usr/sbin/sysctl -n vm.loadavg | awk '{print int($3)}')
if [ "$load" -ge 140 ]; then
  echo "Shared load is $load; waiting for it to fall below 140." >&2
  deadline=$((SECONDS + 3600))
  until [ "$load" -lt 140 ]; do
    [ "$SECONDS" -lt "$deadline" ] || { echo "Capacity wait expired; retry later." >&2; exit 1; }
    sleep 20
    load=$(/usr/sbin/sysctl -n vm.loadavg | awk '{print int($3)}')
  done
fi
