#!/bin/bash
# Maps the JavaScript frames of a release crash (an Apple or TestFlight crash
# report, an error's stack, a Hermes "address at main.jsbundle:1:48213" frame)
# back to source files and lines, with the composed Hermes source map the
# archive step keeps in the release evidence folder (docs/IOS-RELEASE.md).
#
#   scripts/symbolicate-js.sh <version-build> <stack-file>
#   scripts/symbolicate-js.sh 1.1.4-58 crash.txt
#   pbpaste | scripts/symbolicate-js.sh 1.1.4-58 -
#
# Each line:column becomes source:line:function; other text is unchanged.
# Archives before this script existed kept no map.
set -euo pipefail
usage() { echo 'Usage: symbolicate-js.sh <version-build> <stack-file or ->' >&2; exit 2; }
[ "$#" -eq 2 ] || usage
[[ "$1" =~ ^[0-9]{1,4}(\.[0-9]{1,4}){0,3}-[1-9][0-9]{0,9}$ ]] || usage
MOBILE=$(cd "$(dirname "$0")/.." && pwd)
MAP="$MOBILE/private/release/$1/main.jsbundle.map"
[ -f "$MAP" ] || { echo "No source map for $1 at private/release/$1/main.jsbundle.map; that archive kept none." >&2; exit 1; }
if [ "$2" = - ]; then
  exec "$MOBILE/node_modules/.bin/metro-symbolicate" "$MAP"
fi
[ -f "$2" ] || { echo "No stack file at $2." >&2; exit 1; }
exec "$MOBILE/node_modules/.bin/metro-symbolicate" "$MAP" < "$2"
