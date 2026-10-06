// Node-only audit of every image at the same immutable commit as the fixtures.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { deepStrictEqual, strictEqual } from 'node:assert';
import snapshot from './fixture-snapshot.json';
import { portraitByteGroups } from '../src/api/portrait-byte-groups';
export function pinnedPortraitBlobs() {
  const root = resolve(__dirname, '../..');
  const tree = execFileSync(
    'git',
    ['ls-tree', '-r', snapshot.sourceCommit, 'portal/public/photos'],
    { cwd: root, encoding: 'utf8' },
  );
  const blobs = new Map<string, string>();
  for (const line of tree.split('\n')) {
    const match =
      /^100644 blob ([a-f0-9]{40})\tportal\/public\/photos\/([^/]+)\.webp$/.exec(
        line,
      );
    if (match) blobs.set(match[2]!, match[1]!);
  }
  const owners = new Map<string, string[]>();
  for (const [key, blob] of blobs)
    owners.set(blob, [...(owners.get(blob) ?? []), key]);
  const normalized = (groups: readonly (readonly string[])[]) =>
    groups
      .map((keys) => [...keys].sort())
      .sort((a, b) => a[0]!.localeCompare(b[0]!));
  deepStrictEqual(
    normalized([...owners.values()].filter((keys) => keys.length > 1)),
    normalized(portraitByteGroups.map((group) => group.keys)),
    'Review every byte-identical portrait group when repinning the photo corpus',
  );
  for (const group of portraitByteGroups) {
    const bytes = execFileSync(
      'git',
      [
        'show',
        `${snapshot.sourceCommit}:portal/public/photos/${group.keys[0]}.webp`,
      ],
      { cwd: root },
    );
    strictEqual(createHash('sha256').update(bytes).digest('hex'), group.sha256);
  }
  return blobs;
}
