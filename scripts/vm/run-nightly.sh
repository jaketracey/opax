#!/usr/bin/env bash
# scripts/vm/run-nightly.sh -- what systemd runs at boot (opax-nightly.service ExecStart).
#
# Runs scripts/vm/nightly.sh unless ~/.config/opax/skip-nightly exists. The power-off that follows
# is not here but in ExecStopPost (scripts/vm/poweroff-if-idle.sh), so it also happens when this
# fails or is killed by the service's time limit.
#
#   touch ~/.config/opax/skip-nightly     # the next boot only logs and (unless held) powers off
#   rm ~/.config/opax/skip-nightly        # back to normal
#
# Which run a boot is: the 03:15 boot is the nightly. With OPAX_EVIDENCE_MONTHLY=1 in nightly.env, a boot
# on the first Saturday of the month (Sydney) after that day's nightly has reported (its status file is
# dated today and was not itself the rebuild) is the monthly connections rebuild: nightly.sh with
# OPAX_EVIDENCE_RUN=1. EventBridge opax-refresh-evidence-start makes that boot at 11:00. Each run keeps
# its own time limit inside the unit's 9 h TimeoutStartSec: the nightly 6 h as before
# (OPAX_NIGHTLY_LIMIT), the rebuild 8 h 30 min (OPAX_EVIDENCE_RUN_LIMIT, 510m). OPAX_EVIDENCE_RUN=1 forces one rebuild
# by hand; never put it in nightly.env (every boot would be a rebuild).
set -u
REPO="${OPAX_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${OPAX_NIGHTLY_ENV:-$HOME/.config/opax/nightly.env}"
# shellcheck source=/dev/null
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
PIPE="$HOME/.cache/autoresearch/pipeline"
mkdir -p "$PIPE"
DAY=${OPAX_TODAY:-$(TZ=Australia/Sydney date +%F)}
LOG="$PIPE/nightly-$DAY.log"

evidence_run_due() {
  [ "${OPAX_EVIDENCE_MONTHLY:-0}" = 1 ] || return 1
  [ "$(date -d "$DAY" +%u 2>/dev/null)" = 6 ] && [ "$((10#${DAY:8:2}))" -le 7 ] || return 1
  python3 - "$PIPE/nightly-last.json" "$DAY" <<'PYEOF' 2>/dev/null
import json, sys
status = json.load(open(sys.argv[1]))
sys.exit(0 if status.get("date") == sys.argv[2] and status.get("run", "nightly") != "evidence" else 1)
PYEOF
}

if [ -e "$HOME/.config/opax/skip-nightly" ]; then
  echo "$(date '+%F %T') [run-nightly] ~/.config/opax/skip-nightly exists: not running the nightly" | tee -a "$LOG"
  exit 0
fi
if [ "${OPAX_EVIDENCE_RUN:-0}" = 1 ] || evidence_run_due; then
  echo "$(date '+%F %T') [run-nightly] booted at $(uptime -s 2>/dev/null); starting the monthly connections rebuild (nightly.sh, OPAX_EVIDENCE_RUN=1, limit ${OPAX_EVIDENCE_RUN_LIMIT:-510m})" | tee -a "$LOG"
  OPAX_EVIDENCE_RUN=1 exec timeout --kill-after=5m "${OPAX_EVIDENCE_RUN_LIMIT:-510m}" "$REPO/scripts/vm/nightly.sh"
fi
echo "$(date '+%F %T') [run-nightly] booted at $(uptime -s 2>/dev/null); starting nightly.sh" >>"$LOG"
exec timeout --kill-after=5m "${OPAX_NIGHTLY_LIMIT:-6h}" "$REPO/scripts/vm/nightly.sh"
