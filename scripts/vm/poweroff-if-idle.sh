#!/usr/bin/env bash
# scripts/vm/poweroff-if-idle.sh USER HOME -- applies pending security updates, then powers the
# machine off, unless someone is using it. Runs as root from opax-nightly.service ExecStopPost
# (with `+`), after the nightly has finished, failed or been killed by the time limit.
#
# It does nothing (the machine stays up) if either:
#   * ~/.config/opax/hold exists                      (maintenance: create it, remove it when done)
#   * an interactive login or any established SSH connection is present
#     (`who` shows a terminal, or something is connected to port 22: ssh, scp, rsync)
# Both are checked again after the updates, in case someone logged in meanwhile.
#
# Security updates: the machine is off almost all day, so the usual background timers seldom
# get to run; they are applied here, once per night, with a time limit. A new kernel takes
# effect at the next boot, which is every boot.
#
# Overrides for testing: OPAX_POWEROFF_CMD, OPAX_UPGRADE_CMD, OPAX_APT_UPDATE_CMD, OPAX_WHO_CMD, OPAX_SS_CMD.
set -u
USER_NAME="${1:-ubuntu}"
USER_HOME="${2:-/home/$USER_NAME}"
CONF="$USER_HOME/.config/opax"
LOG="$USER_HOME/.cache/autoresearch/pipeline/poweroff.log"
mkdir -p "$(dirname "$LOG")" 2>/dev/null
log() { echo "$(date '+%F %T') [poweroff] $*" | tee -a "$LOG" >&2; }

ssh_connections() {
  if [ -n "${OPAX_SS_CMD:-}" ]; then $OPAX_SS_CMD; else ss -Htn state established '( sport = :22 )'; fi
}
who_sessions() {
  if [ -n "${OPAX_WHO_CMD:-}" ]; then $OPAX_WHO_CMD; else who; fi
}

reason_to_stay_up() {
  if [ -e "$CONF/hold" ]; then echo "$CONF/hold exists"; return 0; fi
  local who_out ss_out
  who_out=$(who_sessions 2>/dev/null | awk '$2 ~ /^(pts|tty)/' | head -3)
  if [ -n "$who_out" ]; then echo "interactive login: $(echo "$who_out" | tr '\n' ';')"; return 0; fi
  ss_out=$(ssh_connections 2>/dev/null | head -3)
  if [ -n "$ss_out" ]; then echo "established ssh connection: $(echo "$ss_out" | tr '\n' ';' | tr -s ' ')"; return 0; fi
  return 1
}

log "nightly service finished (result=${SERVICE_RESULT:-unknown} exit=${EXIT_STATUS:-?})"
if why=$(reason_to_stay_up); then log "staying up: $why"; exit 0; fi

if [ -n "${OPAX_UPGRADE_CMD-}" ] || command -v unattended-upgrade >/dev/null 2>&1; then
  log "applying security updates (25 minute limit)"
  # the periodic apt timers are off (bootstrap), so refresh the package lists here first
  # shellcheck disable=SC2086
  timeout 5m ${OPAX_APT_UPDATE_CMD:-apt-get update -qq} >>"$LOG" 2>&1 || log "apt-get update exited $? (continuing)"
  # shellcheck disable=SC2086
  timeout 25m ${OPAX_UPGRADE_CMD:-unattended-upgrade} >>"$LOG" 2>&1 || log "unattended-upgrade exited $? (continuing)"
  if why=$(reason_to_stay_up); then log "staying up after the updates: $why"; exit 0; fi
fi

log "powering off"
# shellcheck disable=SC2086
exec ${OPAX_POWEROFF_CMD:-systemctl poweroff --no-block}
