// Static years from checked-in exports, and synthetic tide contracts from the
// already-pinned report fixture. No network, proxy or generation capability.
import { fixtureBytes } from '../tests/fixture-bytes';
import snapshot from './fixtures/explore-snapshot.json';
import picturePins from './fixtures/explore-pictures.json';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isExploreStaticPath,
  isExplorePaidPath,
} from '../src/features/explore/policy';
const bytes = fixtureBytes(snapshot);
export function exploreFixture(
  path: string,
  reportBytes: (path: string) => Buffer | undefined,
) {
  const pin = Object.hasOwn(picturePins, path)
    ? picturePins[path as keyof typeof picturePins]
    : undefined;
  if (pin) {
    const body = readFileSync(resolve(__dirname, 'fixtures', pin.file));
    if (
      body.length !== pin.bytes ||
      createHash('sha256').update(body).digest('hex') !== pin.sha256
    )
      throw new Error('Explore image fixture pin mismatch');
    return body;
  }
  if (isExploreStaticPath(path)) return bytes(path);
  if (isExplorePaidPath(path)) {
    const raw = reportBytes('/api/tide');
    if (!raw) return undefined;
    return Buffer.from(
      JSON.stringify({
        ...JSON.parse(raw.toString()),
        scope: new URLSearchParams(path.split('?')[1]).get('scope'),
      }),
    );
  }
  return undefined;
}
