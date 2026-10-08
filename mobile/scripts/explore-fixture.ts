// Static years from checked-in exports, and synthetic tide contracts from the
// already-pinned report fixture. No network, proxy or generation capability.
import { fixtureBytes } from '../tests/fixture-bytes';
import snapshot from './fixtures/explore-snapshot.json';
import {
  isExploreStaticPath,
  isExplorePaidPath,
} from '../src/features/explore/policy';
const bytes = fixtureBytes(snapshot);
export function exploreFixture(
  path: string,
  reportBytes: (path: string) => Buffer | undefined,
) {
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
