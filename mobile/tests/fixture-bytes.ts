// Node-only support for the fixture server and its tests; never imported by app code.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
interface Snapshot {
  sourceCommit: string;
  files: Record<string, string>;
  sizes: Record<string, number>;
}
/**
 * The blobs at `<commit>:portal/public<path>` for every path, read by one
 * `git cat-file --batch` child. A path git cannot resolve to a blob is absent.
 */
function gitBlobs(root: string, commit: string, paths: string[]) {
  const blobs = new Map<string, Buffer>();
  let out: Buffer;
  try {
    out = execFileSync('git', ['cat-file', '--batch'], {
      cwd: root,
      input: paths.map((path) => `${commit}:portal/public${path}\n`).join(''),
      maxBuffer: Infinity,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return blobs;
  }
  // Each answer is "<oid> <type> <size>\n<contents>\n" or "<name> missing\n".
  let at = 0;
  for (const path of paths) {
    const eol = out.indexOf(10, at);
    if (eol < 0) break;
    const header = /^[0-9a-f]+ (\w+) (\d+)$/.exec(
      out.toString('latin1', at, eol),
    );
    at = eol + 1;
    if (!header) continue;
    const size = Number(header[2]);
    if (header[1] === 'blob') blobs.set(path, out.subarray(at, at + size));
    at += size + 1;
  }
  return blobs;
}
function readOrUndefined(file: string) {
  try {
    return readFileSync(file);
  } catch {
    return undefined;
  }
}
/**
 * Reads pinned portal files at the snapshot's sourceCommit. Verified blobs are
 * kept under mobile/node_modules/.cache/opax-fixture/<sourceCommit>/ (git-ignored),
 * so a fixture start or a test file reads plain files rather than forking git
 * once per blob. The first miss fills the cache for the whole snapshot with one
 * git child. Every read, cached or not, is checked against the pinned SHA-256
 * and size; a cached file that fails is read again from git.
 */
export function fixtureBytes(
  snapshot: Snapshot,
  root = resolve(__dirname, '../..'),
) {
  if (!/^[a-f0-9]{40}$/.test(snapshot.sourceCommit))
    throw new Error('Fixture sourceCommit must be a complete git commit SHA.');
  const cacheDir = join(
    root,
    'mobile/node_modules/.cache/opax-fixture',
    snapshot.sourceCommit,
    'portal/public',
  );
  const cached = new Map<string, Buffer>();
  const pinnedPath = (path: string) =>
    !!snapshot.files[path] &&
    snapshot.sizes[path] !== undefined &&
    path.startsWith('/') &&
    !path.includes('..');
  const pinnedMatch = (path: string, bytes: Buffer) =>
    bytes.length === snapshot.sizes[path] &&
    createHash('sha256').update(bytes).digest('hex') === snapshot.files[path];
  // One git child reads every pinned path not yet read; the verified blobs
  // are written to the cache (atomically, so concurrent workers never see a
  // partial file). Returns the requested blob unverified, or undefined.
  const fromGit = (path: string) => {
    const blobs = gitBlobs(
      root,
      snapshot.sourceCommit,
      Object.keys(snapshot.files).filter(
        (p) => pinnedPath(p) && !cached.has(p),
      ),
    );
    for (const [p, bytes] of blobs) {
      if (!pinnedMatch(p, bytes)) continue;
      const file = join(cacheDir, p);
      const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}`;
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(temporary, bytes);
        renameSync(temporary, file);
      } catch {
        rmSync(temporary, { force: true });
      }
    }
    const bytes = blobs.get(path);
    return bytes && Buffer.from(bytes);
  };
  return (path: string): Buffer => {
    if (!pinnedPath(path)) throw new Error(`Unpinned fixture: ${path}`);
    const previous = cached.get(path);
    if (previous) return previous;
    let bytes = readOrUndefined(join(cacheDir, path));
    if (!bytes || !pinnedMatch(path, bytes)) {
      bytes = fromGit(path);
      if (!bytes)
        throw new Error(
          `Pinned git blob unavailable: ${path} at ${snapshot.sourceCommit}. Restore that commit in the local git object database; deliberate repinning is documented in mobile/README.md.`,
        );
      if (!pinnedMatch(path, bytes))
        throw new Error(
          `PIN MISMATCH: ${path}. Review sourceCommit, hash and size together; see mobile/README.md for repinning.`,
        );
    }
    cached.set(path, bytes);
    return bytes;
  };
}

export interface ResponsePin {
  file: string;
  sha256: string;
  size: number;
  cacheControl: string;
}
/**
 * A pinned API response (not a portal/public file): the exact bytes one
 * public GET returned, committed under scripts/fixtures/ and checked against
 * the snapshot's SHA-256 and size before use. To repin, fetch the route once,
 * replace the file and update its hash, size and fetch time together.
 */
export function responseBytes(
  snapshot: { responses: Record<string, ResponsePin> },
  path: string,
  root = resolve(__dirname, '../scripts'),
): Buffer {
  const pin = Object.hasOwn(snapshot.responses, path)
    ? snapshot.responses[path]
    : undefined;
  if (!pin || !/^fixtures\/[a-z0-9-]+\.json$/.test(pin.file))
    throw new Error(`Unpinned fixture response: ${path}`);
  const bytes = readFileSync(resolve(root, pin.file));
  if (
    createHash('sha256').update(bytes).digest('hex') !== pin.sha256 ||
    bytes.length !== pin.size
  )
    throw new Error(
      `PIN MISMATCH: ${path}. Review the response file, hash and size together.`,
    );
  return bytes;
}
