#!/usr/bin/env bash
# scripts/vm/bootstrap.sh -- set up a fresh Ubuntu 24.04 (aarch64 or x86_64) machine to run the
# OPAX nightly refresh. Idempotent: safe to run again after a failure or to pick up a change.
# Written for the AWS EC2 instance in ap-southeast-2 (a scheduler starts it at 03:15 Sydney, it
# runs the nightly and powers itself off), but nothing here is AWS-specific.
#
# On the machine, as the user that will own the pipeline (`ubuntu`), with sudo:
#
#   curl -fsSL https://raw.githubusercontent.com/jaketracey/opax/main/scripts/vm/bootstrap.sh | bash
#   # or, from a checkout:   scripts/vm/bootstrap.sh
#
# What it does (each step is skipped if already done):
#   1. apt packages: git, python3 + venv + headers, build tools, zstd, rsync, sqlite3, jq,
#      fail2ban, unattended-upgrades, ca-certificates, curl
#   2. timezone Australia/Sydney (pipeline dates and the nightly log names are Sydney time)
#   3. a 4G swap file (8GB of RAM; SQLite's page cache and the exporters like slack)
#   4. security updates: unattended-upgrades installed but its background timers switched off;
#      the updates are applied once per night, after the nightly and before power-off
#   5. SSH: key-only login, no root login (refuses if the user has no authorized_keys)
#   6. fail2ban on sshd
#   7. `uv` (pinned to the version the desktop uses) and the clone at ~/opax, fetched over HTTPS
#      with the PUSH url set to SSH when the deploy key ~/.ssh/opax_deploy exists; then
#      `uv sync --frozen`, which installs exactly the locked dependencies
#   8. ~/.cache/autoresearch, ~/.config/opax, and TEMPLATES for ~/opax/.env and
#      ~/.config/opax/nightly.env (never overwritten; you fill them in)
#   9. systemd: opax-nightly.service installed but NOT enabled. Once the state is in place and a
#      manual run has worked:   scripts/vm/bootstrap.sh --enable
#
# Options:
#   --user NAME        the pipeline user (default: the user running this)
#   --repo-url URL     default https://github.com/jaketracey/opax
#   --branch NAME      default main
#   --swap SIZE        default 4G (0 to skip)
#   --enable           enable opax-nightly.service (it then runs at every boot): the cutover step
#   --disable          disable it again
#   --check            report what is and is not in place; change nothing
#   --container        for testing in a container: skip swap, timezone, ssh, fail2ban, systemctl
#   --fail2ban-ignore IPS   addresses fail2ban must never ban (space or comma separated). Put your own
#                      here if the security group only admits you: a few wrong keys offered by an
#                      ssh agent would otherwise ban the one address that can reach the machine.
#   --skip-ssh --skip-fail2ban --skip-swap --skip-upgrades --skip-python   skip one step
set -euo pipefail

REPO_URL="https://github.com/jaketracey/opax"
BRANCH="main"
SWAP_SIZE="4G"
UV_VERSION="0.11.2"
TZ_NAME="Australia/Sydney"
TARGET_USER="${SUDO_USER:-$(id -un)}"
ENABLE=0; DISABLE=0; CHECK=0; CONTAINER=0
F2B_IGNORE=""
SKIP_SSH=0; SKIP_F2B=0; SKIP_SWAP=0; SKIP_UPGRADES=0; SKIP_PYTHON=0

while [ $# -gt 0 ]; do
  case "$1" in
    --user) TARGET_USER=$2; shift 2 ;;
    --repo-url) REPO_URL=$2; shift 2 ;;
    --branch) BRANCH=$2; shift 2 ;;
    --swap) SWAP_SIZE=$2; shift 2 ;;
    --enable) ENABLE=1; shift ;;
    --disable) DISABLE=1; shift ;;
    --check) CHECK=1; shift ;;
    --container) CONTAINER=1; SKIP_SSH=1; SKIP_F2B=1; SKIP_SWAP=1; shift ;;
    --fail2ban-ignore) F2B_IGNORE=${2//,/ }; shift 2 ;;
    --skip-ssh) SKIP_SSH=1; shift ;;
    --skip-fail2ban) SKIP_F2B=1; shift ;;
    --skip-swap) SKIP_SWAP=1; shift ;;
    --skip-upgrades) SKIP_UPGRADES=1; shift ;;
    --skip-python) SKIP_PYTHON=1; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
as_user() {
  if [ "$(id -un)" = "$TARGET_USER" ]; then "$@"
  elif [ "$(id -u)" -eq 0 ]; then runuser -u "$TARGET_USER" -- env HOME="$USER_HOME" "$@"
  else sudo -u "$TARGET_USER" -H "$@"; fi
}

USER_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)
[ -n "$USER_HOME" ] && [ -d "$USER_HOME" ] || { echo "no such user or home: $TARGET_USER" >&2; exit 1; }
REPO_DIR="$USER_HOME/opax"
have_systemd() { [ "$CONTAINER" -eq 0 ] && [ -d /run/systemd/system ]; }
# https://github.com/owner/name  ->  git@github.com:owner/name.git
ssh_url() { echo "$REPO_URL" | sed -E 's#^https://github\.com/#git@github.com:#; s#\.git$##; s#$#.git#'; }

if [ -r /etc/os-release ]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  if [ "${ID:-}" != ubuntu ] || [ "${VERSION_ID:-}" != "24.04" ]; then
    note "WARNING: written for Ubuntu 24.04; this is ${PRETTY_NAME:-unknown}. Continuing."
  fi
fi
note "user=$TARGET_USER home=$USER_HOME arch=$(uname -m) repo=$REPO_URL@$BRANCH"

# ---- --check: read-only report ---------------------------------------------------------------
if [ "$CHECK" -eq 1 ]; then
  ok() { printf '  ok   %s\n' "$*"; }; no() { printf '  MISSING %s\n' "$*"; }
  chk() { local d=$1; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else no "$d"; fi; }
  chk "packages: git zstd rsync sqlite3 jq flock" bash -c 'command -v git zstd rsync sqlite3 jq flock'
  chk "timezone $TZ_NAME" bash -c "[ \"\$(timedatectl show -p Timezone --value 2>/dev/null)\" = $TZ_NAME ]"
  chk "swap" bash -c 'swapon --show | grep -q .'
  chk "unattended-upgrades installed, background timers off" bash -c 'command -v unattended-upgrade && ! systemctl is-enabled --quiet apt-daily-upgrade.timer'
  chk "ssh password login off" bash -c "$SUDO sshd -T 2>/dev/null | grep -q '^passwordauthentication no'"
  chk "fail2ban running" bash -c 'systemctl is-active --quiet fail2ban'
  chk "uv" test -x "$USER_HOME/.local/bin/uv"
  chk "clone at $REPO_DIR" test -d "$REPO_DIR/.git"
  chk "push url is SSH" bash -c "git -C '$REPO_DIR' remote get-url --push origin | grep -q '^git@github.com:'"
  chk "deploy key authenticates to github.com" bash -c "ssh -o BatchMode=yes -T git@github.com 2>&1 | grep -q 'successfully authenticated'"
  chk "venv imports the fetchers' dependencies" "$REPO_DIR/.venv/bin/python" -c 'import requests, aiohttp, bs4, pyarrow, pdfminer'
  chk "$REPO_DIR/.env filled in (ARAG_KB_TOKEN)" bash -c "grep -Eq '^ARAG_KB_TOKEN=.+' '$REPO_DIR/.env'"
  chk "parli.db present" test -s "$USER_HOME/.cache/autoresearch/parli.db"
  chk "arag_sync_state.json present" test -s "$USER_HOME/.cache/autoresearch/arag_sync_state.json"
  chk "systemd unit installed" test -f /etc/systemd/system/opax-nightly.service
  chk "unit enabled (runs at boot)" bash -c 'systemctl is-enabled --quiet opax-nightly.service'
  chk "no hold / skip-nightly file left behind" bash -c "[ ! -e '$USER_HOME/.config/opax/hold' ] && [ ! -e '$USER_HOME/.config/opax/skip-nightly' ]"
  df -h "$USER_HOME" | tail -1 | awk '{print "  disk: " $3 " used, " $4 " free of " $2}'
  exit 0
fi

# ---- --enable / --disable: the cutover step ------------------------------------------------------
if [ "$DISABLE" -eq 1 ]; then
  have_systemd || { echo "no systemd here" >&2; exit 1; }
  $SUDO systemctl disable opax-nightly.service
  echo "Disabled: the machine will boot and stay up. (Disable the scheduler's start schedule too.)"
  exit 0
fi
if [ "$ENABLE" -eq 1 ]; then
  have_systemd || { echo "no systemd here" >&2; exit 1; }
  for f in "$USER_HOME/.cache/autoresearch/parli.db" "$USER_HOME/.cache/autoresearch/arag_sync_state.json" \
           "$REPO_DIR/.env"; do
    [ -s "$f" ] || { echo "refusing to enable: $f is missing or empty (state not in place / secrets not filled in)" >&2; exit 1; }
  done
  # `ssh -T git@github.com` exits 1 even when the key works, so under pipefail a
  # `ssh | grep -q` pipeline always fails: capture the greeting, then match it.
  gh_greeting=$(as_user ssh -o BatchMode=yes -T git@github.com 2>&1 || true)
  grep -q 'successfully authenticated' <<<"$gh_greeting" \
    || { echo "refusing to enable: the deploy key does not authenticate to github.com (ssh -T git@github.com)" >&2; exit 1; }
  $SUDO systemctl enable opax-nightly.service
  echo "Enabled: opax-nightly.service now runs at EVERY boot and powers the machine off afterwards"
  echo "(unless ~/.config/opax/hold exists or someone is logged in). The desktop must never run"
  echo "daily_refresh.sh with OPAX_SYNC_KB=1 again."
  exit 0
fi

# ---- 1. apt packages -------------------------------------------------------------------------------------
say "apt packages"
# sudo drops the caller's environment, so the frontend is passed through `env`
APT="env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get"
$SUDO $APT update -qq
PKGS=(ca-certificates curl gnupg git python3 python3-venv python3-dev build-essential zstd rsync sqlite3 jq
      util-linux tzdata less iproute2)
[ "$SKIP_F2B" -eq 1 ] || PKGS+=(fail2ban)
[ "$SKIP_UPGRADES" -eq 1 ] || PKGS+=(unattended-upgrades)
$SUDO $APT install -y -qq "${PKGS[@]}"

# ---- 2. timezone ---------------------------------------------------------------------------------------------
if [ "$CONTAINER" -eq 0 ] && have_systemd; then
  say "timezone $TZ_NAME"
  if [ "$(timedatectl show -p Timezone --value)" != "$TZ_NAME" ]; then $SUDO timedatectl set-timezone "$TZ_NAME"; fi
  note "now: $(date)"
else
  note "skipping timezone (no systemd)"
fi

# ---- 3. swap ----------------------------------------------------------------------------------------------------
if [ "$SKIP_SWAP" -eq 0 ] && [ "$SWAP_SIZE" != 0 ]; then
  say "swap ($SWAP_SIZE)"
  if swapon --show --noheadings | grep -q .; then
    note "swap already active: $(swapon --show --noheadings | awk '{print $1, $3}' | tr '\n' ' ')"
  else
    $SUDO fallocate -l "$SWAP_SIZE" /swapfile || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=$(( ${SWAP_SIZE%G} * 1024 )) status=none
    $SUDO chmod 600 /swapfile; $SUDO mkswap /swapfile >/dev/null; $SUDO swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  fi
  echo 'vm.swappiness=10' | $SUDO tee /etc/sysctl.d/99-opax-swap.conf >/dev/null
  $SUDO sysctl -q -p /etc/sysctl.d/99-opax-swap.conf || true
fi

# ---- 4. security updates ---------------------------------------------------------------------------------------------
if [ "$SKIP_UPGRADES" -eq 0 ]; then
  say "security updates (applied nightly by poweroff-if-idle.sh, not by background timers)"
  $SUDO tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'APTEOF'
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Unattended-Upgrade "0";
APTEOF
  $SUDO tee /etc/apt/apt.conf.d/52opax-unattended >/dev/null <<'APTEOF'
// Applied by scripts/vm/poweroff-if-idle.sh once a night. Never reboot: the machine powers off
// after the nightly and the next start is the reboot.
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
APTEOF
  if have_systemd; then
    $SUDO systemctl disable --now apt-daily.timer apt-daily-upgrade.timer >/dev/null 2>&1 || true
  fi
fi

# ---- 5. ssh ----------------------------------------------------------------------------------------------------------------
if [ "$SKIP_SSH" -eq 0 ]; then
  say "ssh: key-only login, no root login"
  if [ -s "$USER_HOME/.ssh/authorized_keys" ]; then
    # sshd uses the FIRST value it reads and reads sshd_config.d in name order, so this file
    # must sort before the cloud image's 60-cloudimg-settings.conf.
    $SUDO tee /etc/ssh/sshd_config.d/00-opax-hardening.conf >/dev/null <<'SSHEOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
SSHEOF
    if $SUDO sshd -t; then $SUDO systemctl reload ssh 2>/dev/null || $SUDO systemctl reload sshd; note "sshd reloaded"; else
      $SUDO rm -f /etc/ssh/sshd_config.d/00-opax-hardening.conf; echo "sshd -t failed; hardening file removed" >&2; fi
  else
    note "SKIPPED: $USER_HOME/.ssh/authorized_keys is empty, so disabling passwords could lock you out"
  fi
fi

# ---- 6. fail2ban -----------------------------------------------------------------------------------------------------------
if [ "$SKIP_F2B" -eq 0 ]; then
  say "fail2ban (sshd)"
  $SUDO tee /etc/fail2ban/jail.d/opax.local >/dev/null <<F2BEOF
[sshd]
enabled  = true
backend  = systemd
maxretry = 10
findtime = 10m
bantime  = 30m
ignoreip = 127.0.0.1/8 ::1 $F2B_IGNORE
F2BEOF
  $SUDO systemctl enable --now fail2ban >/dev/null 2>&1 || true
  $SUDO systemctl restart fail2ban || true
fi

# ---- 7. the clone, uv, the venv ------------------------------------------------------------------------------------------------
say "clone at $REPO_DIR"
if [ -d "$REPO_DIR/.git" ]; then
  note "already cloned: $(git -C "$REPO_DIR" log -1 --format='%h %s' | cut -c1-80)"
else
  as_user git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi
as_user git -C "$REPO_DIR" config pull.rebase true
if [ -f "$USER_HOME/.ssh/opax_deploy" ]; then
  # fetch anonymously over HTTPS (public repository); push with the deploy key over SSH
  as_user git -C "$REPO_DIR" remote set-url --push origin "$(ssh_url)"
  note "push url: $(git -C "$REPO_DIR" remote get-url --push origin)"
else
  note "no ~/.ssh/opax_deploy: the push url is left as it is (the nightly cannot push without a deploy key)"
fi

if [ "$SKIP_PYTHON" -eq 0 ]; then
  say "uv $UV_VERSION and the Python environment"
  UV_BIN="$USER_HOME/.local/bin/uv"
  if [ -x "$UV_BIN" ] && "$UV_BIN" --version 2>/dev/null | grep -q "$UV_VERSION"; then
    note "uv already at $UV_VERSION"
  else
    as_user bash -c "python3 -m venv '$USER_HOME/.local/uv-venv' && '$USER_HOME/.local/uv-venv/bin/pip' install -q 'uv==$UV_VERSION' && mkdir -p '$USER_HOME/.local/bin' && ln -sf '$USER_HOME/.local/uv-venv/bin/uv' '$UV_BIN'"
  fi
  # the exact locked versions; --frozen never re-resolves, so a bad upstream release cannot slip in
  as_user bash -c "cd '$REPO_DIR' && '$UV_BIN' sync --frozen --python /usr/bin/python3"
  as_user "$REPO_DIR/.venv/bin/python" -c 'import requests, aiohttp, bs4, pyarrow, pdfminer, pandas, openpyxl; print("    python deps import OK")'
fi

# ---- 8. directories and secret templates -------------------------------------------------------------------------------------------
say "directories and secret templates"
as_user mkdir -p "$USER_HOME/.cache/autoresearch/pipeline" "$USER_HOME/.config/opax"
if [ "$TARGET_USER" != jake ] && [ ! -e /home/jake ]; then
  # a few older scripts still hard-code /home/jake; this keeps them working on a differently named user
  $SUDO ln -s "$USER_HOME" /home/jake && note "linked /home/jake -> $USER_HOME"
fi
if [ ! -e "$REPO_DIR/.env" ]; then
  as_user tee "$REPO_DIR/.env" >/dev/null <<'ENVEOF'
# OPAX pipeline secrets. NEVER COMMIT (gitignored). Read by daily_refresh.sh and the Python steps.
# Copy the values from the desktop's ~/opax/.env.
ARAG_ZONE=aws-ap-southeast-2-1
ARAG_ACCOUNT=
ARAG_NUA_KEY=
ARAG_KB_ID=
ARAG_KB_TOKEN=
OPENAUSTRALIA_API_KEY=
TVFY_API_KEY=
# Do NOT set DATABASE_URL here: it would switch parli.db access to PostgreSQL and the nightly refuses to run.
ENVEOF
  as_user chmod 600 "$REPO_DIR/.env"; note "wrote a template $REPO_DIR/.env: fill it in"
fi
if [ ! -e "$USER_HOME/.config/opax/nightly.env" ]; then
  as_user tee "$USER_HOME/.config/opax/nightly.env" >/dev/null <<'ENVEOF'
# Read by scripts/vm/nightly.sh. Optional OPAX_* overrides only (defaults shown); there is no
# GitHub token: git pushes over SSH with ~/.ssh/opax_deploy. NEVER COMMIT.
# OPAX_BRANCH=main
# OPAX_ALLOW_FAIL=sa
# OPAX_SYNC_GATE=link_speakers,classify
# OPAX_STAMP_AFTER_HOURS=12
# OPAX_MIN_FREE_GB=5
ENVEOF
  as_user chmod 600 "$USER_HOME/.config/opax/nightly.env"; note "wrote ~/.config/opax/nightly.env (all optional)"
fi

# ---- 9. systemd unit (installed, not enabled) ------------------------------------------------------------------------------------------
say "systemd unit"
UNIT_SRC="$REPO_DIR/scripts/vm/systemd"
if [ -d "$UNIT_SRC" ]; then
  sed -e "s|@USER@|$TARGET_USER|g" -e "s|@REPO@|$REPO_DIR|g" -e "s|@HOME@|$USER_HOME|g" "$UNIT_SRC/opax-nightly.service" \
    | $SUDO tee /etc/systemd/system/opax-nightly.service >/dev/null
  # the earlier design used a timer; remove it if an older bootstrap left one behind
  $SUDO rm -f /etc/systemd/system/opax-nightly.timer
  if have_systemd; then
    $SUDO systemctl disable opax-nightly.timer >/dev/null 2>&1 || true
    $SUDO systemctl daemon-reload
    note "installed; NOT enabled. When the state is in place and a manual run has worked: scripts/vm/bootstrap.sh --enable"
  else
    note "unit written to /etc/systemd/system (no systemd here: not loaded)"
  fi
else
  note "no $UNIT_SRC in the clone (branch $BRANCH predates the VM scripts?); unit not installed"
fi

cat <<EOF

Done. Still to do by hand (nothing below is automated on purpose):
  1. Fill in $REPO_DIR/.env
  2. Get the database and the checkpoint onto this machine (docs/operations/nightly-refresh.md)
  3. Rehearse:   OPAX_NIGHTLY_NO_PUSH=1 $REPO_DIR/scripts/vm/nightly.sh
  4. Cut over:   $REPO_DIR/scripts/vm/bootstrap.sh --enable   (then enable the scheduler's start schedule)
Maintenance: touch ~/.config/opax/hold keeps the machine up after a run; touch ~/.config/opax/skip-nightly skips the run.
Check anything with: $REPO_DIR/scripts/vm/bootstrap.sh --check
EOF
