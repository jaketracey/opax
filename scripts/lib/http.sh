# Shared identity for shell transports. Source only after the checkout exists.
OPAX_HTTP_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
OPAX_USER_AGENT=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["user_agent"])' "$OPAX_HTTP_ROOT/parli/ingest/user-agent.json")
