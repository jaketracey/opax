# Shared identity for shell transports. Source only after the checkout exists.
OPAX_HTTP_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
OPAX_USER_AGENT=$(cat "$OPAX_HTTP_ROOT/parli/ingest/user-agent.txt")
