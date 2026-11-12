#!/usr/bin/env bash
# Cache file-local rules by content. Hermes uses the whole TypeScript program
# and always runs uncached, so editing a dependency rechecks unchanged callers.
# Config, local plugins/policies and dependency versions invalidate the cache.
# File membership also matters to import/no-unresolved; source bytes do not.
# OPAX_LINT_NO_CACHE=1 runs the original combined config without any cache.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${OPAX_LINT_NO_CACHE:-0}" = 1 ]; then
  exec ./node_modules/.bin/eslint . "$@" --no-cache
fi
inputs=(eslint.config.js package-lock.json)
[ ! -f node_modules/.package-lock.json ] || inputs+=(node_modules/.package-lock.json)
for file in scripts/*-rule.js scripts/*-policy.js scripts/*.cjs tsconfig*.json; do
  [ -f "$file" ] && inputs+=("$file")
done
root=$(git rev-parse --show-toplevel)
key=$({
  cat "${inputs[@]}"
  python3 - "$root" <<'PYKEY'
import os, subprocess, sys
root = os.fsencode(sys.argv[1])
paths = subprocess.check_output(['git', '-C', root, 'ls-files', '-co', '--exclude-standard', '-z'])
existing = sorted({p for p in paths.split(b'\0') if p and os.path.lexists(os.path.join(root, p))})
sys.stdout.buffer.write(b'paths\0' + b'\0'.join(existing))
PYKEY
} | /usr/bin/shasum -a 256 | cut -c1-16)
cache_dir=node_modules/.cache/eslint
mkdir -p "$cache_dir"
# Keep only the current key's cache so stale files do not accumulate.
for old in "$cache_dir"/*.cache; do
  [ -e "$old" ] || continue
  [ "$old" = "$cache_dir/$key.cache" ] || /bin/rm -f "$old"
done
./node_modules/.bin/eslint . --config scripts/eslint-file.config.cjs "$@" \
  --cache --cache-location "$cache_dir/$key.cache" --cache-strategy content
exec ./node_modules/.bin/eslint . --config scripts/eslint-hermes.config.cjs "$@" --no-cache
