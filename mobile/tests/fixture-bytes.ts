// Node-only support for the fixture server and its tests; never imported by app code.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
interface Snapshot {
  sourceCommit: string;
  files: Record<string, string>;
  sizes: Record<string, number>;
}
export function fixtureBytes(
  snapshot: Snapshot,
  root = resolve(__dirname, '../..'),
) {
  if (!/^[a-f0-9]{40}$/.test(snapshot.sourceCommit))
    throw new Error('Fixture sourceCommit must be a complete git commit SHA.');
  const cached = new Map<string, Buffer>();
  return (path: string): Buffer => {
    const hash = snapshot.files[path],
      size = snapshot.sizes[path];
    if (
      !hash ||
      size === undefined ||
      !path.startsWith('/') ||
      path.includes('..')
    )
      throw new Error(`Unpinned fixture: ${path}`);
    const previous = cached.get(path);
    if (previous) return previous;
    let bytes: Buffer;
    try {
      bytes = execFileSync(
        'git',
        ['show', `${snapshot.sourceCommit}:portal/public${path}`],
        {
          cwd: root,
          maxBuffer: Math.max(size + 1024, 1024 * 1024),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch {
      throw new Error(
        `Pinned git blob unavailable: ${path} at ${snapshot.sourceCommit}. Restore that commit in the local git object database; deliberate repinning is documented in mobile/README.md.`,
      );
    }
    if (
      createHash('sha256').update(bytes).digest('hex') !== hash ||
      bytes.length !== size
    )
      throw new Error(
        `PIN MISMATCH: ${path}. Review sourceCommit, hash and size together; see mobile/README.md for repinning.`,
      );
    cached.set(path, bytes);
    return bytes;
  };
}
