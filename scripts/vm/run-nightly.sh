#!/usr/bin/env bash
# scripts/vm/run-nightly.sh -- what systemd runs at boot (opax-nightly.service ExecStart).
#
# Runs scripts/vm/nightly.sh unless ~/.config/opax/skip-nightly exists. The power-off that follows
# is not here but in ExecStopPost (scripts/vm/poweroff-if-idle.sh), so it also happens when this
# fails or is killed by the service's time limit.
#
#   touch ~/.config/opax/skip-nightly     # the next boot only logs and (unless held) powers off
#   rm ~/.config/opax/skip-nightly        # back to normal
set -u
REPO="${OPAX_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
PIPE="$HOME/.cache/autoresearch/pipeline"
mkdir -p "$PIPE"
LOG="$PIPE/nightly-$(TZ=Australia/Sydney date +%F).log"

if [ -e "$HOME/.config/opax/skip-nightly" ]; then
  echo "$(date '+%F %T') [run-nightly] ~/.config/opax/skip-nightly exists: not running the nightly" | tee -a "$LOG"
  exit 0
fi
echo "$(date '+%F %T') [run-nightly] booted at $(uptime -s 2>/dev/null); starting nightly.sh" >>"$LOG"
exec "$REPO/scripts/vm/nightly.sh"
