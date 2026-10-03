import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
      },
      sizes: { '/corpus.json': bytes.length },
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
    expect(fixtureBytes(snapshot, root)('/corpus.json')).toEqual(bytes);
    writeFileSync(path, Buffer.concat([bytes, Buffer.from('\n\n')]));
    expect(fixtureBytes(snapshot, root)('/corpus.json')).toEqual(bytes);
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
    rmSync(root, { recursive: true, force: true });
  }
});
