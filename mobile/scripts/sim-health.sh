#!/usr/bin/env bash
# Simulator health for the Maestro harness. A simulator whose system daemons
# crash-loop makes XCTest wait for the crash reporter after every test case,
# which added 80 to 150 s of driver startup to every journey on 10 Nov 2026
# (PosterBoard crashing every few seconds on the QA simulator, with a 9 GB
# poster store). This reports those signs and, with --erase, resets the device.
#
#   sim-health.sh <udid> [--hours N] [--max-crashes N] [--max-poster-mb N] [--erase]
#
# Unhealthy: more than --max-crashes system crash reports in the last --hours
# (default 2 in 6 h), or a poster store over --max-poster-mb (default 2047, so
# 2 GB or more). The e2e preflight (scripts/e2e-device.sh) passes tighter
# limits. Exit 0 healthy, 3 unhealthy (or erased when --erase was given),
# 2 usage. Hold the Mac's native lock before --erase: it shuts the simulator down.
set -euo pipefail
UDID=${1:?udid}; shift
HOURS=6; ERASE=0; MAX_CRASHES=2; MAX_POSTER_MB=2047
while [ "$#" -gt 0 ]; do
  case "$1" in
    --hours) HOURS=${2:?hours}; shift 2 ;;
    --max-crashes) MAX_CRASHES=${2:?max crashes}; shift 2 ;;
    --max-poster-mb) MAX_POSTER_MB=${2:?max poster MB}; shift 2 ;;
    --erase) ERASE=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
for value in "$HOURS" "$MAX_CRASHES" "$MAX_POSTER_MB"; do
  case "$value" in ''|*[!0-9]*) echo 'hours and limits must be integers' >&2; exit 2 ;; esac
done
DEVICE_DIR="$HOME/Library/Developer/CoreSimulator/Devices/$UDID"
[ -d "$DEVICE_DIR" ] || { echo "No simulator at $DEVICE_DIR" >&2; exit 2; }
REPORTS="$HOME/Library/Logs/DiagnosticReports"
ERASE_MARKER="$DEVICE_DIR/.opax-qa-erased"
# Old host reports survive simctl erase. Only a crash after the erase counts.
NEWER=()
[ ! -f "$ERASE_MARKER" ] || NEWER=(-newer "$ERASE_MARKER")
# Date a report by when it was written (its birth time). macOS later refreshes
# the modification time of old reports: on 13 Nov, 8 Nov siriactionsd and
# assistantd reports counted as new crashes. Elsewhere fall back to mtime.
WINDOW=(-mmin "-$((HOURS * 60))")
if [ "$(uname -s)" = Darwin ]; then
  WINDOW=(-Bmin "-$((HOURS * 60))")
  [ ! -f "$ERASE_MARKER" ] || NEWER=(-newerBm "$ERASE_MARKER")
fi
# Crash reports name the device by the first eight characters of its UDID.
coalition="SimDevice.${UDID:0:8}"
crashes=0; processes=
if [ -d "$REPORTS" ]; then
  while IFS= read -r report; do
    grep -Fq "$coalition" "$report" 2>/dev/null || continue
    case "$(basename "$report")" in OPAX*|opax*) continue ;; esac
    grep -Eiq 'au[.]com[.]opax[.]app|"(app_name|procName|name)"[[:space:]]*:[[:space:]]*"OPAX([ ._-][^"]*)?"' "$report" && continue
    crashes=$((crashes + 1))
    processes="$processes $(basename "$report" | sed -E 's/-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}.*//')"
  done < <(find "$REPORTS" -maxdepth 1 -name '*.ips' "${WINDOW[@]}" ${NEWER[@]+"${NEWER[@]}"} 2>/dev/null)
fi
poster="$DEVICE_DIR/data/Library/Application Support/PRBPosterExtensionDataStore"
poster_mb=0
[ -d "$poster" ] && poster_mb=$(( $(/usr/bin/du -sk "$poster" 2>/dev/null | awk '{print $1}') / 1024 ))
unhealthy=0
echo "Simulator $UDID: $crashes crash report(s) in the last $HOURS h${processes:+ (${processes# })}; poster store ${poster_mb} MB"
[ "$crashes" -gt "$MAX_CRASHES" ] && unhealthy=1
[ "$poster_mb" -gt "$MAX_POSTER_MB" ] && unhealthy=1
if [ "$unhealthy" = 0 ]; then echo "Simulator looks healthy."; exit 0; fi
echo "Simulator is unhealthy (over $MAX_CRASHES crash report(s) or ${MAX_POSTER_MB} MB): expect slow XCTest driver startup (crash-reporter waits)." >&2
if [ "$ERASE" = 1 ]; then
  echo "Erasing $UDID (shutdown, erase)."
  xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
  erase_started=$(mktemp "${TMPDIR:-/tmp}/opax-sim-erase.XXXXXX")
  trap '/bin/rm -f "$erase_started"' EXIT
  xcrun simctl erase "$UDID"
  # Preserve the start time so a fresh crash during erase is still counted.
  touch -r "$erase_started" "$ERASE_MARKER"
  echo "Erased. The next boot is a cold first boot; the harness warm-up covers it."
fi
exit 3
