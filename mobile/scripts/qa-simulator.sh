#!/usr/bin/env bash
# Source inside the shared native lock, before claiming/booting a simulator.
# Kept-device state survives release in the lock's persistent OPAX directory.
# Admission refuses every other booted device, including devices booted outside
# this harness. OPAX_SIM_ADMIT_IGNORE (space-separated UDIDs, empty by default) names
# devices another slot of the same host owns, so a two-slot host (Rihana's Mac:
# slots a and b, each with its own pasteboard lock and fixture port) can run two
# simulators; any device not listed still refuses admission. A later run on the kept UDID without OPAX_KEEP_SIM_BOOTED=1
# shuts it down and clears the record; an explicit simctl shutdown also stops it.
qa_simulator_admit() {
  local udid=$1 booted kept=
  if [ "${OPAX_KEEP_SIM_BOOTED:-0}" = 1 ] && [ -z "${OPAX_PASTE_LOCK:-}" ]; then
    echo 'Keeping a simulator requires a configured shared pasteboard lock.' >&2
    return 1
  fi
  booted=$(xcrun simctl list devices booted -j) || return 1
  if [ -n "${OPAX_PASTE_LOCK:-}" ]; then
    kept=$(cat "$OPAX_PASTE_LOCK.opax/kept-simulator" 2>/dev/null || true)
  fi
  python3 - "$udid" "$booted" "$kept" "${OPAX_SIM_ADMIT_IGNORE:-}" <<'PYDEV'
import json, sys
wanted = sys.argv[1]
devices = json.loads(sys.argv[2])['devices']
ignore = set(sys.argv[4].split()) - {wanted}
others = [d['udid'] for group in devices.values() for d in group
          if d['state'] == 'Booted' and d['udid'] != wanted and d['udid'] not in ignore]
if others:
    kept = sys.argv[3]
    detail = f'; harness kept UDID {kept}' if kept in others else '; booted outside this harness'
    raise SystemExit('Simulator boot refused: another device is booted: ' + ', '.join(others) + detail)
PYDEV
}
qa_simulator_keep() {
  local state="${OPAX_PASTE_LOCK:?Keeping a simulator requires the shared lock}.opax" tmp
  mkdir -p "$state" || return 1
  tmp=$(mktemp "$state/.kept-simulator.XXXXXX") || return 1
  printf '%s\n' "$1" > "$tmp"
  /bin/mv -f "$tmp" "$state/kept-simulator"
}
qa_simulator_forget() {
  [ -n "${OPAX_PASTE_LOCK:-}" ] || return 0
  local record="$OPAX_PASTE_LOCK.opax/kept-simulator"
  if [ "$(cat "$record" 2>/dev/null)" = "$1" ]; then /bin/rm -f "$record"; fi
  return 0
}
