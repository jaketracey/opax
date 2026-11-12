import childProcess, { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureBytes } from './fixture-bytes';
import { pinnedBytes } from './pinned';
test('a newer committed catalog or dirty worktree cannot change pinned bytes at sourceCommit', () => {
  const root = mkdtempSync(join(tmpdir(), 'opax-pinned-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
  try {
    git('init', '--quiet');
    mkdirSync(join(root, 'portal/public'), { recursive: true });
    const bytes = pinnedBytes('/corpus.json');
    const path = join(root, 'portal/public/corpus.json');
    writeFileSync(path, bytes);
    // Binary contents include newlines, so batch records must use byte lengths.
    const binary = Buffer.from([0, 10, 255, 13, 10, 42]);
    writeFileSync(join(root, 'portal/public/binary.webp'), binary);
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'Pinned catalog',
    );
    const sourceCommit = git('rev-parse', 'HEAD');
    const snapshot = {
      sourceCommit,
      files: {
        '/corpus.json': createHash('sha256').update(bytes).digest('hex'),
        '/binary.webp': createHash('sha256').update(binary).digest('hex'),
      },
      sizes: { '/corpus.json': bytes.length, '/binary.webp': binary.length },
    };
    writeFileSync(path, Buffer.concat([bytes, Buffer.from('\n')]));
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'New catalog',
    );
    expect(git('rev-parse', 'HEAD')).not.toBe(sourceCommit);
    const gitReads = jest.spyOn(childProcess, 'execFileSync');
    const read = fixtureBytes(snapshot, root);
    expect(read('/corpus.json')).toEqual(bytes);
    expect(read('/binary.webp')).toEqual(binary);
    expect(gitReads).toHaveBeenCalledTimes(1);
    expect(gitReads).toHaveBeenCalledWith(
      'git',
      ['cat-file', '--batch'],
      expect.objectContaining({ cwd: root }),
    );
    // A fresh reader uses verified on-disk bytes without another git process.
    expect(fixtureBytes(snapshot, root)('/binary.webp')).toEqual(binary);
    expect(gitReads).toHaveBeenCalledTimes(1);
    writeFileSync(path, Buffer.concat([bytes, Buffer.from('\n\n')]));
    expect(fixtureBytes(snapshot, root)('/corpus.json')).toEqual(bytes);
    const cacheRoot = join(root, 'mobile/node_modules/.cache/opax-fixture');
    const cachedFile = join(
      cacheRoot,
      sourceCommit,
      'portal/public/corpus.json',
    );
    expect(readFileSync(cachedFile)).toEqual(bytes);
    const tampered = Buffer.from(bytes);
    tampered[0] = tampered[0]! ^ 1;
    writeFileSync(cachedFile, tampered);
    expect(fixtureBytes(snapshot, root)('/corpus.json')).toEqual(bytes);
    expect(readFileSync(cachedFile)).toEqual(bytes);

    // A read-only cache must not turn N fixture reads back into N git children.
    rmSync(cacheRoot, { recursive: true, force: true });
    const writes = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('Read-only cache');
    });
    const before = gitReads.mock.calls.length;
    const memoryOnly = fixtureBytes(snapshot, root);
    expect(memoryOnly('/corpus.json')).toEqual(bytes);
    expect(memoryOnly('/binary.webp')).toEqual(binary);
    expect(gitReads.mock.calls.length - before).toBe(1);
    writes.mockRestore();

    expect(() =>
      fixtureBytes(
        { ...snapshot, sourceCommit: '0'.repeat(40) },
        root,
      )('/corpus.json'),
    ).toThrow(/Restore that commit.*README/);
    expect(() =>
      fixtureBytes(
        { ...snapshot, sizes: { '/corpus.json': 1 } },
        root,
      )('/corpus.json'),
    ).toThrow(/PIN MISMATCH.*README/);
    expect(() => fixtureBytes(snapshot, root)('/unlisted.json')).toThrow(
      /Unpinned/,
    );
  } finally {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  }
});
