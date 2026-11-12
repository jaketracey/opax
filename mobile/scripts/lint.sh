#!/usr/bin/env bash
# ESLint with a result cache that cannot go stale on rule changes.
#
# ESLint's own cache key covers the ESLint version, the Node version and the
# serialised config, but the local rules in scripts/ are functions and do not
# serialise, so a rule edit would leave old results in the cache. The cache
# file is therefore named after a hash of every file the config can load:
# a changed rule or policy starts an empty cache. Type-aware Hermes checks
# also depend on other files' contents. Include the repository's index blob IDs
# plus hashes of unstaged/untracked bytes, covering src/, modules/, tsconfigs,
# declarations and transitive repository imports. Pass any ESLint arguments
# through; OPAX_LINT_NO_CACHE=1 runs without the cache.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${OPAX_LINT_NO_CACHE:-0}" = 1 ]; then
  exec ./node_modules/.bin/eslint . "$@"
fi
inputs=(eslint.config.js package-lock.json)
[ ! -f node_modules/.package-lock.json ] || inputs+=(node_modules/.package-lock.json)
for file in scripts/*-rule.js scripts/*-policy.js scripts/*.cjs; do
  [ -f "$file" ] && inputs+=("$file")
done
# Import resolution depends on file membership, including portal imports.
# A deletion/rename must invalidate unchanged importers in ESLint's cache.
root=$(git rev-parse --show-toplevel)
key=$({
  cat "${inputs[@]}"
  python3 - "$root" <<'PYKEY'
import hashlib, os, subprocess, sys
root = sys.argv[1]
def git(*args):
    return subprocess.check_output(['git', '-C', root, *args])
# Clean tracked files use Git's content IDs without rereading every source.
# Include all repository inputs, since imports can cross the mobile boundary.
sys.stdout.buffer.write(b'index\0' + git('ls-files', '-s', '-z'))
paths = set(git('ls-files', '-co', '--exclude-standard', '-z').split(b'\0'))
existing = sorted(p for p in paths if p and os.path.lexists(os.path.join(os.fsencode(root), p)))
sys.stdout.buffer.write(b'paths\0' + b'\0'.join(existing))
# Staged bytes are already represented above; unstaged bytes can differ from
# those blobs. Hash untracked bytes too, including new ambient declarations.
changed = set((git('diff', '--name-only', '-z') +
               git('ls-files', '--others', '--exclude-standard', '-z')).split(b'\0'))
for path in sorted(p for p in changed if p):
    full = os.path.join(os.fsencode(root), path)
    if os.path.isfile(full):
        with open(full, 'rb') as handle:
            hasher = hashlib.sha256()
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                hasher.update(chunk)
            digest = hasher.hexdigest().encode()
    elif os.path.islink(full):
        digest = hashlib.sha256(os.readlink(full)).hexdigest().encode()
    else:
        digest = b'deleted'
    sys.stdout.buffer.write(b'working\0' + path + b'\0' + digest + b'\0')
PYKEY
} | /usr/bin/shasum -a 256 | cut -c1-16)
cache_dir=node_modules/.cache/eslint
mkdir -p "$cache_dir"
# Keep only the current key's cache so stale files do not accumulate.
for old in "$cache_dir"/*.cache; do
  [ -e "$old" ] || continue
  [ "$old" = "$cache_dir/$key.cache" ] || /bin/rm -f "$old"
done
exec ./node_modules/.bin/eslint . --cache --cache-location "$cache_dir/$key.cache" --cache-strategy content "$@"
