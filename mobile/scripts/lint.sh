#!/usr/bin/env bash
# ESLint with a result cache that cannot go stale on rule changes.
#
# ESLint's own cache key covers the ESLint version, the Node version and the
# serialised config, but the local rules in scripts/ are functions and do not
# serialise, so a rule edit would leave old results in the cache. The cache
# file is therefore named after a hash of every file the config can load:
# a changed rule or policy starts an empty cache. Pass any ESLint arguments
# through; OPAX_LINT_NO_CACHE=1 runs without the cache.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${OPAX_LINT_NO_CACHE:-0}" = 1 ]; then
  exec ./node_modules/.bin/eslint . "$@"
fi
inputs=(eslint.config.js package-lock.json)
for file in scripts/*-rule.js scripts/*-policy.js scripts/*.cjs; do
  [ -f "$file" ] && inputs+=("$file")
done
key=$(cat "${inputs[@]}" | /usr/bin/shasum -a 256 | cut -c1-16)
cache_dir=node_modules/.cache/eslint
mkdir -p "$cache_dir"
# Keep only the current key's cache so stale files do not accumulate.
for old in "$cache_dir"/*.cache; do
  [ -e "$old" ] || continue
  [ "$old" = "$cache_dir/$key.cache" ] || /bin/rm -f "$old"
done
exec ./node_modules/.bin/eslint . --cache --cache-location "$cache_dir/$key.cache" --cache-strategy content "$@"
