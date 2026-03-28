#!/usr/bin/env bash
# =============================================================================
# OPAX EC2 Setup Script
# Run on a fresh Ubuntu 24.04 (ARM64/Graviton) EC2 instance.
#
# Usage:
#   ssh ubuntu@<EC2_IP> 'bash -s' < setup.sh
#   OR
#   scp setup.sh ubuntu@<EC2_IP>:~ && ssh ubuntu@<EC2_IP> 'chmod +x setup.sh && sudo ./setup.sh'
# =============================================================================
set -euo pipefail

DOMAIN="opax.com.au"
REPO_URL="https://github.com/kaizen-38/opax.git"  # adjust if different
APP_DIR="/opt/opax"
DATA_DIR="/opt/opax/data"
OPAX_USER="opax"

echo "========================================"
echo "  OPAX Deployment — $(date)"
echo "========================================"

# ------------------------------------------
# 0. System updates
# ------------------------------------------
echo "[1/9] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# ------------------------------------------
# 1. Install system dependencies
# ------------------------------------------
echo "[2/9] Installing system dependencies..."
apt-get install -y -qq \
    nginx \
    certbot \
    python3-certbot-nginx \
    git \
    curl \
    unzip \
    ufw \
    sqlite3 \
    build-essential

# ------------------------------------------
# 2. Install Node.js 22 (via NodeSource)
# ------------------------------------------
echo "[3/9] Installing Node.js 22..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y -qq nodejs
fi
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

# ------------------------------------------
# 3. Install Python 3.12 + uv
# ------------------------------------------
echo "[4/9] Installing Python 3.12 and uv..."
apt-get install -y -qq python3.12 python3.12-venv python3.12-dev

if ! command -v uv &>/dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"
echo "  Python: $(python3.12 --version)"
echo "  uv: $(uv --version)"

# ------------------------------------------
# 4. Create opax user and directory structure
# ------------------------------------------
echo "[5/9] Creating opax user and directories..."
if ! id "$OPAX_USER" &>/dev/null; then
    useradd --system --shell /bin/bash --home-dir "$APP_DIR" --create-home "$OPAX_USER"
fi
mkdir -p "$DATA_DIR"
mkdir -p /var/www/certbot

# ------------------------------------------
# 5. Clone repository and install dependencies
# ------------------------------------------
echo "[6/9] Cloning repository and installing dependencies..."

if [ -d "$APP_DIR/.git" ]; then
    echo "  Repo already exists, pulling latest..."
    cd "$APP_DIR"
    sudo -u "$OPAX_USER" git pull
else
    # Clone into a temp location, then move contents
    TMP_CLONE=$(mktemp -d)
    git clone "$REPO_URL" "$TMP_CLONE"
    cp -a "$TMP_CLONE/." "$APP_DIR/"
    rm -rf "$TMP_CLONE"
fi

cd "$APP_DIR"
chown -R "$OPAX_USER":"$OPAX_USER" "$APP_DIR"

# Python dependencies (FastAPI backend)
echo "  Installing Python dependencies..."
sudo -u "$OPAX_USER" uv venv "$APP_DIR/.venv" --python python3.12
sudo -u "$OPAX_USER" bash -c "source $APP_DIR/.venv/bin/activate && uv pip install -e '$APP_DIR'"

# Node.js dependencies (Next.js frontend)
echo "  Installing Node.js dependencies and building..."
cd "$APP_DIR/opax"
sudo -u "$OPAX_USER" npm ci --production=false
sudo -u "$OPAX_USER" npm run build

# ------------------------------------------
# 6. Configure nginx
# ------------------------------------------
echo "[7/9] Configuring nginx..."

# Copy nginx config
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/opax.com.au
ln -sf /etc/nginx/sites-available/opax.com.au /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config (will fail on SSL cert paths until certbot runs,
# so we create a temporary HTTP-only config first)
cat > /etc/nginx/sites-available/opax-temp.conf <<'NGINX_TEMP'
server {
    listen 80;
    listen [::]:80;
    server_name opax.com.au www.opax.com.au;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'OPAX setup in progress';
        add_header Content-Type text/plain;
    }
}
NGINX_TEMP

# Use temp config for initial certbot
ln -sf /etc/nginx/sites-available/opax-temp.conf /etc/nginx/sites-enabled/opax-temp.conf
rm -f /etc/nginx/sites-enabled/opax.com.au
nginx -t
systemctl restart nginx

# ------------------------------------------
# 7. SSL Certificate (Let's Encrypt)
# ------------------------------------------
echo "[8/9] Obtaining SSL certificate..."
echo ""
echo "  IMPORTANT: Make sure DNS for $DOMAIN points to this server's IP"
echo "  before running certbot. If DNS is not ready yet, run this later:"
echo ""
echo "    sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN"
echo ""

read -p "  Is DNS pointing to this server? (y/N): " dns_ready
if [[ "${dns_ready,,}" == "y" ]]; then
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
        --non-interactive --agree-tos -m "admin@$DOMAIN"

    # Switch to the full nginx config with SSL
    rm -f /etc/nginx/sites-enabled/opax-temp.conf
    ln -sf /etc/nginx/sites-available/opax.com.au /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
    echo "  SSL certificate installed successfully."
else
    echo "  Skipping SSL setup. Run the certbot command above when DNS is ready."
    echo "  Then: sudo ln -sf /etc/nginx/sites-available/opax.com.au /etc/nginx/sites-enabled/"
    echo "  And:  sudo rm /etc/nginx/sites-enabled/opax-temp.conf"
    echo "  And:  sudo nginx -t && sudo systemctl reload nginx"
fi

# ------------------------------------------
# 8. Install systemd services
# ------------------------------------------
echo "[9/9] Installing systemd services..."
cp "$APP_DIR/deploy/opax-api.service" /etc/systemd/system/
cp "$APP_DIR/deploy/opax-web.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable opax-api opax-web
systemctl start opax-api
systemctl start opax-web

# ------------------------------------------
# 9. Configure firewall
# ------------------------------------------
echo "Configuring firewall (ufw)..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# ------------------------------------------
# 10. Certbot auto-renewal cron
# ------------------------------------------
systemctl enable certbot.timer 2>/dev/null || true

# ------------------------------------------
# Done
# ------------------------------------------
echo ""
echo "========================================"
echo "  OPAX deployment complete!"
echo "========================================"
echo ""
echo "  Services:"
echo "    sudo systemctl status opax-api"
echo "    sudo systemctl status opax-web"
echo ""
echo "  Logs:"
echo "    sudo journalctl -u opax-api -f"
echo "    sudo journalctl -u opax-web -f"
echo ""
echo "  Data directory: $DATA_DIR"
echo "  Upload your data files:"
echo "    rsync -avz hansard.db <IP>:$DATA_DIR/"
echo "    rsync -avz embeddings.npy <IP>:$DATA_DIR/"
echo ""
echo "  Then restart the API:"
echo "    sudo systemctl restart opax-api"
echo ""
