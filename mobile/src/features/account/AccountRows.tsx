import { router } from 'expo-router';
import { Screen } from '../../design/primitives';
import { AccountLinks } from './AccountLinks';
import { communityHome } from '../community/entry';

/**
 * Account and about with no account block: the one list of rows. Android
 * shows it without voice, whether its OpaxVoice module is missing or the
 * voice-off release left it out (entry.production.ts).
 */
export function AccountRowsScreen() {
  const home = communityHome;
  return (
    <Screen column="wide" testID="account-sheet">
      <AccountLinks
        first
        community={home ? () => router.push(home) : undefined}
        testID="account-links"
      />
    </Screen>
  );
}
