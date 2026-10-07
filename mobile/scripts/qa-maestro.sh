#!/usr/bin/env bash
# Driver ports belong to each fixture lane: 8900..8999 -> 9000..9099.
qa_maestro_port() {
  local port=${OPAX_FIXTURE_PORT:-8910}
  if [[ ! "$port" =~ ^[0-9]{4}$ ]] || [ "$((10#$port))" -lt 8900 ] || [ "$((10#$port))" -gt 8999 ]; then
    echo 'OPAX_FIXTURE_PORT must be in 8900..8999 for an isolated Maestro driver port' >&2
    return 2
  fi
  export OPAX_MAESTRO_DRIVER_PORT=$((10#$port + 100))
}

qa_maestro_run() {
  local log=$1 debug=$2 rc=0; shift 2
  qa_maestro_check_port || return $?
  MAESTRO_DRIVER_STARTUP_TIMEOUT=${MAESTRO_DRIVER_STARTUP_TIMEOUT:-60000} \
    python3 scripts/maestro-watch.py "$log" "$debug" "${OPAX_MAESTRO_TIMEOUT_SECONDS:-900}" \
    bash -c 'maestro "$@"' _ --verbose --driver-host-port "$OPAX_MAESTRO_DRIVER_PORT" "$@" &
  MAESTRO_WATCH_PID=$!
  wait "$MAESTRO_WATCH_PID" || rc=$?
  MAESTRO_WATCH_PID=
  return "$rc"
}

qa_maestro_check_port() {
  qa_maestro_port || return 2
  # Never stop or reuse an unrelated listener, even on the pinned lane port.
  if lsof -nP -iTCP:"$OPAX_MAESTRO_DRIVER_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Maestro driver port $OPAX_MAESTRO_DRIVER_PORT is occupied" >&2
    return 1
  fi
}

qa_maestro_stop() {
  [ -n "${MAESTRO_WATCH_PID:-}" ] || return 0
  kill -TERM "$MAESTRO_WATCH_PID" 2>/dev/null || true
  wait "$MAESTRO_WATCH_PID" 2>/dev/null || true
  MAESTRO_WATCH_PID=
}
