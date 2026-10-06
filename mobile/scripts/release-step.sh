#!/usr/bin/env bash
# The build gate sees only this wrapper and one public step name.
set +x
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[ "$#" = 1 ] || { echo 'Expected one release step.' >&2; exit 2; }
STEP=$1
shift
if [ "$STEP" = upload ]; then
  [ -n "${OPAX_RELEASE_EXPECTED_VOICE_MODE:-}" ] || { echo 'Upload requires an explicit expected voice mode.' >&2; exit 2; }
  set -- --expected-voice-mode "$OPAX_RELEASE_EXPECTED_VOICE_MODE"
fi
exec python3 scripts/release-step.py "$STEP" "$@"
