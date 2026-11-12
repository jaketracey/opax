#!/usr/bin/env bash
# Simulator health for the Maestro harness. A simulator whose system daemons
# crash-loop makes XCTest wait for the crash reporter after every test case,
# which added 80 to 150 s of driver startup to every journey on 10 Nov 2026
# (PosterBoard crashing every few seconds on the QA simulator, with a 9 GB
# poster store). This reports those signs and, with --erase, resets the device.
#
#   sim-health.sh <udid> [--hours N] [--erase]
#
# Exit 0 healthy, 3 unhealthy (or erased when --erase was given), 2 usage.
# Hold the Mac's native lock before --erase: it shuts the simulator down.
set -euo pipefail
UDID=${1:?udid}; shift
HOURS=6; ERASE=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --hours) HOURS=${2:?hours}; shift 2 ;;
    --erase) ERASE=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
case "$HOURS" in ''|*[!0-9]*) echo 'hours must be an integer' >&2; exit 2 ;; esac
DEVICE_DIR="$HOME/Library/Developer/CoreSimulator/Devices/$UDID"
[ -d "$DEVICE_DIR" ] || { echo "No simulator at $DEVICE_DIR" >&2; exit 2; }
REPORTS="$HOME/Library/Logs/DiagnosticReports"
ERASE_MARKER="$DEVICE_DIR/.opax-qa-erased"
# Crash reports name the device by the first eight characters of its UDID.
coalition="SimDevice.${UDID:0:8}"
crashes=0; processes=
if [ -d "$REPORTS" ]; then
  while IFS= read -r report; do
    # Old host reports survive simctl erase. Only a new system crash counts.
    [ ! -f "$ERASE_MARKER" ] || [ "$report" -nt "$ERASE_MARKER" ] || continue
    grep -Fq "$coalition" "$report" 2>/dev/null || continue
    case "$(basename "$report")" in OPAX*|opax*) continue ;; esac
    grep -Eiq 'au[.]com[.]opax[.]app|"(app_name|procName|name)"[[:space:]]*:[[:space:]]*"OPAX([ ._-][^"]*)?"' "$report" && continue
    crashes=$((crashes + 1))
    processes="$processes $(basename "$report" | sed -E 's/-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}.*//')"
  done < <(find "$REPORTS" -maxdepth 1 -name '*.ips' -mmin "-$((HOURS * 60))" 2>/dev/null)
fi
poster="$DEVICE_DIR/data/Library/Application Support/PRBPosterExtensionDataStore"
poster_mb=0
[ -d "$poster" ] && poster_mb=$(( $(/usr/bin/du -sk "$poster" 2>/dev/null | awk '{print $1}') / 1024 ))
unhealthy=0
echo "Simulator $UDID: $crashes crash report(s) in the last $HOURS h${processes:+ (${processes# })}; poster store ${poster_mb} MB"
[ "$crashes" -ge 3 ] && unhealthy=1
[ "$poster_mb" -ge 2048 ] && unhealthy=1
if [ "$unhealthy" = 0 ]; then echo "Simulator looks healthy."; exit 0; fi
echo "Simulator is unhealthy: expect slow XCTest driver startup (crash-reporter waits)." >&2
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
