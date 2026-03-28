#!/usr/bin/env bash
# =============================================================================
# Sync SQLite DB and embeddings from local machine to EC2
#
# Usage:
#   ./sync-data.sh <EC2_IP> [SSH_KEY_PATH]
#
# Example:
#   ./sync-data.sh 13.55.123.45
#   ./sync-data.sh 13.55.123.45 ~/.ssh/opax-key.pem
# =============================================================================
set -euo pipefail

EC2_IP="${1:?Usage: ./sync-data.sh <EC2_IP> [SSH_KEY_PATH]}"
SSH_KEY="${2:-~/.ssh/opax-key.pem}"
REMOTE_USER="ubuntu"
REMOTE_DATA_DIR="/opt/opax/data"

# Local data paths — adjust these to match your local setup
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCAL_DB="${PROJECT_DIR}/hansard.db"
LOCAL_EMBEDDINGS="${PROJECT_DIR}/embeddings.npy"

SSH_OPTS="-i ${SSH_KEY} -o StrictHostKeyChecking=no"

echo "========================================"
echo "  OPAX Data Sync"
echo "========================================"
echo "  Target: ${REMOTE_USER}@${EC2_IP}:${REMOTE_DATA_DIR}"
echo ""

# Ensure remote data directory exists
ssh $SSH_OPTS "${REMOTE_USER}@${EC2_IP}" "sudo mkdir -p ${REMOTE_DATA_DIR} && sudo chown opax:opax ${REMOTE_DATA_DIR}"

# Sync SQLite database
if [ -f "$LOCAL_DB" ]; then
    echo "[1/2] Syncing SQLite database ($(du -h "$LOCAL_DB" | cut -f1))..."
    rsync -avz --progress \
        -e "ssh ${SSH_OPTS}" \
        "$LOCAL_DB" \
        "${REMOTE_USER}@${EC2_IP}:/tmp/hansard.db"
    ssh $SSH_OPTS "${REMOTE_USER}@${EC2_IP}" "sudo mv /tmp/hansard.db ${REMOTE_DATA_DIR}/ && sudo chown opax:opax ${REMOTE_DATA_DIR}/hansard.db"
    echo "  Done."
else
    echo "[1/2] SKIP: SQLite database not found at $LOCAL_DB"
    echo "       Set LOCAL_DB in this script or pass the correct path."
fi

# Sync embeddings
if [ -f "$LOCAL_EMBEDDINGS" ]; then
    echo "[2/2] Syncing embeddings ($(du -h "$LOCAL_EMBEDDINGS" | cut -f1))..."
    rsync -avz --progress \
        -e "ssh ${SSH_OPTS}" \
        "$LOCAL_EMBEDDINGS" \
        "${REMOTE_USER}@${EC2_IP}:/tmp/embeddings.npy"
    ssh $SSH_OPTS "${REMOTE_USER}@${EC2_IP}" "sudo mv /tmp/embeddings.npy ${REMOTE_DATA_DIR}/ && sudo chown opax:opax ${REMOTE_DATA_DIR}/embeddings.npy"
    echo "  Done."
else
    echo "[2/2] SKIP: Embeddings not found at $LOCAL_EMBEDDINGS"
    echo "       Set LOCAL_EMBEDDINGS in this script or pass the correct path."
fi

# Restart the API to pick up new data
echo ""
echo "Restarting opax-api service..."
ssh $SSH_OPTS "${REMOTE_USER}@${EC2_IP}" "sudo systemctl restart opax-api"

echo ""
echo "Data sync complete. Check API status:"
echo "  ssh ${SSH_OPTS} ${REMOTE_USER}@${EC2_IP} 'sudo systemctl status opax-api'"
