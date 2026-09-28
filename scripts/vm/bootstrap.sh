#!/usr/bin/env bash
# scripts/vm/bootstrap.sh -- set up a fresh Ubuntu 24.04 (aarch64 or x86_64) VM to run the
# OPAX nightly refresh. Idempotent: safe to run again after a failure or to pick up a change.
#
# On the VM, as the user that will own the pipeline (Oracle's default is `ubuntu`), with sudo:
#
#   curl -fsSL https://raw.githubusercontent.com/jaketracey/opax/main/scripts/vm/bootstrap.sh | bash
#   # or, from a checkout:   scripts/vm/bootstrap.sh
#
# What it does (each step is skipped if already done):
#   1. apt packages: git, python3 + venv + headers, build tools, zstd, rsync, sqlite3, jq,
#      fail2ban, unattended-upgrades, ca-certificates, curl
#   2. timezone Australia/Sydney (the nightly timer and the pipeline's dates are Sydney time)
#   3. an 8G swap file (the box has 24GB RAM; the SQLite page cache and pandas jobs like slack)
#   4. GitHub CLI (`gh`) from GitHub's apt repo
#   5. unattended security upgrades (reboot allowed at 12:00 Sydney only, never mid-run)
#   6. SSH: key-only login, no root login (refuses if the user has no authorized_keys)
#   7. fail2ban on sshd
#   8. `uv` (pinned to the version the desktop uses) and the clone at ~/opax, then
#      `uv sync --frozen`, which installs exactly the locked dependencies
#   9. ~/.cache/autoresearch, ~/.config/opax, and TEMPLATES for ~/opax/.env and
#      ~/.config/opax/nightly.env (never overwritten; you fill them in)
#  10. systemd: opax-nightly.service + opax-nightly.timer installed but NOT enabled.
#      Enable only at cutover, after the state transfer and a rehearsal:
#          scripts/vm/bootstrap.sh --enable-timer
#
# Options:
#   --user NAME        the pipeline user (default: the user running this)
#   --repo-url URL     default https://github.com/jaketracey/opax
#   --branch NAME      default main
#   --time HH:MM       nightly start, VM local time (default 03:30)
#   --swap SIZE        default 8G (0 to skip)
#   --enable-timer     enable and start the timer (and nothing else: cutover step)
#   --check            report what is and is not in place; change nothing
#   --container        for testing in a container: skip swap, timezone, ssh, fail2ban, systemctl
#   --skip-ssh --skip-fail2ban --skip-swap --skip-upgrades --skip-python   skip one step
set -euo pipefail

REPO_URL="https://github.com/jaketracey/opax"
BRANCH="main"
RUN_TIME="03:30"
SWAP_SIZE="8G"
UV_VERSION="0.11.2"
TZ_NAME="Australia/Sydney"
TARGET_USER="${SUDO_USER:-$(id -un)}"
ENABLE_TIMER=0; CHECK=0; CONTAINER=0
SKIP_SSH=0; SKIP_F2B=0; SKIP_SWAP=0; SKIP_UPGRADES=0; SKIP_PYTHON=0

while [ $# -gt 0 ]; do
  case "$1" in
    --user) TARGET_USER=$2; shift 2 ;;
    --repo-url) REPO_URL=$2; shift 2 ;;
    --branch) BRANCH=$2; shift 2 ;;
    --time) RUN_TIME=$2; shift 2 ;;
    --swap) SWAP_SIZE=$2; shift 2 ;;
    --enable-timer) ENABLE_TIMER=1; shift ;;
    --check) CHECK=1; shift ;;
    --container) CONTAINER=1; SKIP_SSH=1; SKIP_F2B=1; SKIP_SWAP=1; shift ;;
    --skip-ssh) SKIP_SSH=1; shift ;;
    --skip-fail2ban) SKIP_F2B=1; shift ;;
    --skip-swap) SKIP_SWAP=1; shift ;;
    --skip-upgrades) SKIP_UPGRADES=1; shift ;;
    --skip-python) SKIP_PYTHON=1; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
done
[[ "$RUN_TIME" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || { echo "--time must be HH:MM" >&2; exit 64; }

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

if [ -r /etc/os-release ]; then
  . /etc/os-release
  if [ "${ID:-}" != ubuntu ] || [ "${VERSION_ID:-}" != "24.04" ]; then
    note "WARNING: written for Ubuntu 24.04; this is ${PRETTY_NAME:-unknown}. Continuing."
  fi
fi
note "user=$TARGET_USER home=$USER_HOME arch=$(uname -m) repo=$REPO_URL@$BRANCH run at $RUN_TIME"

# ---- --check: read-only report ---------------------------------------------------------------
if [ "$CHECK" -eq 1 ]; then
  ok() { printf '  ok   %s\n' "$*"; }; no() { printf '  MISSING %s\n' "$*"; }
  chk() { local d=$1; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else no "$d"; fi; }
  chk "packages: git zstd rsync sqlite3 jq" bash -c 'command -v git zstd rsync sqlite3 jq flock'
  chk "timezone $TZ_NAME" bash -c "[ \"\$(timedatectl show -p Timezone --value 2>/dev/null)\" = $TZ_NAME ]"
  chk "swap" bash -c 'swapon --show | grep -q .'
  chk "gh" command -v gh
  chk "unattended-upgrades enabled" bash -c 'grep -q "Unattended-Upgrade \"1\"" /etc/apt/apt.conf.d/20auto-upgrades'
  chk "ssh password login off" bash -c 'sshd -T 2>/dev/null | grep -q "^passwordauthentication no"'
  chk "fail2ban running" bash -c 'systemctl is-active --quiet fail2ban'
  chk "uv" test -x "$USER_HOME/.local/bin/uv"
  chk "clone at $REPO_DIR" test -d "$REPO_DIR/.git"
  chk "venv imports the fetchers' dependencies" "$REPO_DIR/.venv/bin/python" -c 'import requests, aiohttp, bs4, pyarrow, pdfminer'
  chk "$REPO_DIR/.env filled in (ARAG_KB_TOKEN)" bash -c "grep -Eq '^ARAG_KB_TOKEN=.+' '$REPO_DIR/.env'"
  chk "nightly.env has GH_TOKEN" bash -c "grep -Eq '^GH_TOKEN=.+' '$USER_HOME/.config/opax/nightly.env'"
  chk "parli.db present" test -s "$USER_HOME/.cache/autoresearch/parli.db"
  chk "arag_sync_state.json present" test -s "$USER_HOME/.cache/autoresearch/arag_sync_state.json"
  chk "systemd units installed" test -f /etc/systemd/system/opax-nightly.timer
  chk "timer enabled" bash -c 'systemctl is-enabled --quiet opax-nightly.timer'
  exit 0
fi

# ---- --enable-timer: the cutover step -------------------------------------------------------------
if [ "$ENABLE_TIMER" -eq 1 ]; then
  have_systemd || { echo "no systemd here" >&2; exit 1; }
  for f in "$USER_HOME/.cache/autoresearch/parli.db" "$USER_HOME/.cache/autoresearch/arag_sync_state.json" \
           "$USER_HOME/.config/opax/nightly.env" "$REPO_DIR/.env"; do
    [ -s "$f" ] || { echo "refusing to enable the timer: $f is missing or empty (state not transferred / secrets not filled in)" >&2; exit 1; }
  done
  $SUDO systemctl enable --now opax-nightly.timer
  $SUDO systemctl list-timers opax-nightly.timer --no-pager || true
  echo "Timer enabled. The desktop must never run daily_refresh.sh with OPAX_SYNC_KB=1 again."
  exit 0
fi

# ---- 1. apt packages -------------------------------------------------------------------------------------
say "apt packages"
export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -qq
PKGS=(ca-certificates curl gnupg git python3 python3-venv python3-dev build-essential zstd rsync sqlite3 jq
      util-linux tzdata less)
[ "$SKIP_F2B" -eq 1 ] || PKGS+=(fail2ban)
[ "$SKIP_UPGRADES" -eq 1 ] || PKGS+=(unattended-upgrades)
$SUDO apt-get install -y -qq "${PKGS[@]}"

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

# ---- 4. GitHub CLI -------------------------------------------------------------------------------------------------
say "GitHub CLI"
if command -v gh >/dev/null 2>&1; then
  note "gh already installed: $(gh --version | head -1)"
else
  $SUDO install -d -m 0755 /etc/apt/keyrings
  if curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | $SUDO tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null \
     && $SUDO chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
     && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
          | $SUDO tee /etc/apt/sources.list.d/github-cli.list >/dev/null \
     && $SUDO apt-get update -qq && $SUDO apt-get install -y -qq gh; then
    :
  else
    note "GitHub's apt repo failed; falling back to Ubuntu's gh package"
    $SUDO rm -f /etc/apt/sources.list.d/github-cli.list
    $SUDO apt-get update -qq && $SUDO apt-get install -y -qq gh
  fi
  note "installed: $(gh --version | head -1)"
fi

# ---- 5. unattended upgrades --------------------------------------------------------------------------------------------
if [ "$SKIP_UPGRADES" -eq 0 ]; then
  say "unattended security upgrades"
  $SUDO tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  $SUDO tee /etc/apt/apt.conf.d/52opax-unattended >/dev/null <<'EOF'
// A reboot only ever happens at midday Sydney time, hours after the nightly run has finished.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "12:00";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
fi

# ---- 6. ssh ----------------------------------------------------------------------------------------------------------------
if [ "$SKIP_SSH" -eq 0 ]; then
  say "ssh: key-only login, no root login"
  if [ -s "$USER_HOME/.ssh/authorized_keys" ]; then
    # sshd uses the FIRST value it reads and reads sshd_config.d in name order, so this file
    # must sort before the cloud image's 60-cloudimg-settings.conf.
    $SUDO tee /etc/ssh/sshd_config.d/00-opax-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 4
EOF
    if $SUDO sshd -t; then $SUDO systemctl reload ssh 2>/dev/null || $SUDO systemctl reload sshd; note "sshd reloaded"; else
      $SUDO rm -f /etc/ssh/sshd_config.d/00-opax-hardening.conf; echo "sshd -t failed; hardening file removed" >&2; fi
  else
    note "SKIPPED: $USER_HOME/.ssh/authorized_keys is empty, so disabling passwords could lock you out"
  fi
fi

# ---- 7. fail2ban -----------------------------------------------------------------------------------------------------------
if [ "$SKIP_F2B" -eq 0 ]; then
  say "fail2ban (sshd)"
  $SUDO tee /etc/fail2ban/jail.d/opax.local >/dev/null <<'EOF'
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
  $SUDO systemctl enable --now fail2ban >/dev/null 2>&1 || true
  $SUDO systemctl restart fail2ban || true
fi

# ---- 8. uv, the clone, the venv ---------------------------------------------------------------------------------------------------
say "clone at $REPO_DIR"
if [ -d "$REPO_DIR/.git" ]; then
  note "already cloned: $(git -C "$REPO_DIR" log -1 --format='%h %s' | cut -c1-80)"
else
  as_user git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi
as_user git -C "$REPO_DIR" config pull.rebase true

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

# ---- 9. directories and secret templates -----------------------------------------------------------------------------------------------
say "directories and secret templates"
as_user mkdir -p "$USER_HOME/.cache/autoresearch/pipeline" "$USER_HOME/.config/opax"
if [ "$TARGET_USER" != jake ] && [ ! -e /home/jake ]; then
  # a few older scripts still hard-code /home/jake; this keeps them working on a differently named user
  $SUDO ln -s "$USER_HOME" /home/jake && note "linked /home/jake -> $USER_HOME"
fi
if [ ! -e "$REPO_DIR/.env" ]; then
  as_user tee "$REPO_DIR/.env" >/dev/null <<'EOF'
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
EOF
  as_user chmod 600 "$REPO_DIR/.env"; note "wrote a template $REPO_DIR/.env: fill it in"
fi
if [ ! -e "$USER_HOME/.config/opax/nightly.env" ]; then
  as_user tee "$USER_HOME/.config/opax/nightly.env" >/dev/null <<'EOF'
# Read by scripts/vm/nightly.sh. NEVER COMMIT.
# Fine-grained PAT for jaketracey/opax: Contents RW, Actions RW, Issues RW (Metadata R).
# Used for git push over HTTPS, `gh workflow run deploy.yml` and the failure issue.
GH_TOKEN=
# Optional overrides (defaults shown):
# OPAX_GH_REPO=jaketracey/opax
# OPAX_BRANCH=main
# OPAX_ALLOW_FAIL=sa
# OPAX_SYNC_GATE=link_speakers,classify
EOF
  as_user chmod 600 "$USER_HOME/.config/opax/nightly.env"; note "wrote a template ~/.config/opax/nightly.env: fill it in"
fi

# ---- 10. systemd units (installed, not enabled) ---------------------------------------------------------------------------------------------
say "systemd units"
UNIT_SRC="$REPO_DIR/scripts/vm/systemd"
if [ -d "$UNIT_SRC" ]; then
  for unit in opax-nightly.service opax-nightly.timer; do
    sed -e "s|@USER@|$TARGET_USER|g" -e "s|@REPO@|$REPO_DIR|g" -e "s|@TIME@|$RUN_TIME|g" "$UNIT_SRC/$unit" \
      | $SUDO tee "/etc/systemd/system/$unit" >/dev/null
  done
  if have_systemd; then
    $SUDO systemctl daemon-reload
    note "installed; the timer is NOT enabled yet. At cutover: scripts/vm/bootstrap.sh --enable-timer"
  else
    note "units written to /etc/systemd/system (no systemd here: not loaded)"
  fi
else
  note "no $UNIT_SRC in the clone (branch $BRANCH predates the VM scripts?); units not installed"
fi

cat <<EOF

Done. Still to do by hand (nothing below is automated on purpose):
  1. Fill in $REPO_DIR/.env and $USER_HOME/.config/opax/nightly.env
  2. From the desktop: scripts/vm/transfer_state.sh --dest $TARGET_USER@<this VM>
  3. Rehearse:   OPAX_NIGHTLY_NO_PUSH=1 $REPO_DIR/scripts/vm/nightly.sh
  4. Cut over:   $REPO_DIR/scripts/vm/bootstrap.sh --enable-timer
Check anything with: $REPO_DIR/scripts/vm/bootstrap.sh --check
EOF
