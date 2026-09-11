#!/bin/zsh
set -euo pipefail
cd -- "$(dirname -- "$0")"

print 'Opax demo recorder'
print ''
print '1. Find a grant near you'
print '2. Explore earlier grants'
print ''
read 'choice?Choose a demo [1]: '
case "${choice:-1}" in
  1) scene='grant-place' ;;
  2) scene='grant-timeline' ;;
  *) print 'Please run again and choose 1 or 2.'; exit 1 ;;
esac

for tool in node npm ffmpeg ffprobe; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    print "$tool is missing. Follow the one-time setup in README.md."
    read 'reply?Press Return to close. '
    exit 1
  fi
done
if [[ ! -d node_modules/playwright ]]; then
  npm ci
fi
destination="$HOME/Movies/Opax/$(date +%Y-%m-%dT%H-%M-%S)-$scene"
npm run record -- --scene "$scene" --format all --out "$destination"
open "$destination"
print ''
print 'Both videos are ready to review. Nothing has been posted.'
read 'reply?Press Return to close. '
