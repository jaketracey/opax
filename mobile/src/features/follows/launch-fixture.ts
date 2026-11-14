import followFixture from '../../../scripts/fixtures/follows-50.json';
import { Platform, Settings } from 'react-native';
import { followFixturePath } from '../../api/follow-fixture-path';
import { isE2E } from '../../design/environment';
import { decodeFollows, isKnownFollow, type Follow } from './store';
// Canonical identities from the pinned people catalog, excluded from release.
export async function seededFollows(): Promise<Follow[] | null> {
  if (!isE2E) return null;
  if (Platform.OS === 'android') {
    try {
      if (followFixturePath === null) return null;
      // Open the runtime only for this opt-in read, after the store loads.
      const { apiClient } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../api/runtime') as typeof import('../../api/runtime');
      const result = await apiClient.get(followFixturePath, (raw) =>
        decodeFollows(raw).filter(isKnownFollow),
      );
      return result.data.length === 50 ? result.data : null;
    } catch {
      return null;
    }
  }
  try {
    if (String(Settings.get('OPAXSeedFollows')) !== '50') return null;
  } catch {
    return null;
  }
  return decodeFollows(followFixture).filter(isKnownFollow);
}
