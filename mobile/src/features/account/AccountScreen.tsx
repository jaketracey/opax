import { router } from 'expo-router';
import { Screen } from '../../design/primitives';
import { AccountSection } from './AccountSection';
import { AccountLinks } from './AccountLinks';
import { communityHome } from '../community/entry';

/**
 * Account and about (IOS-UX 4.9) in development and e2e builds. Production
 * selects entry.production.ts only when the production voice switch is off.
 *
 * Two blocks under the sheet's title: the account (signed out, one sentence
 * and Sign in; signed in, the address, voice time, sign-out and deletion),
 * then one list of rows: Community (where the build ships it; not
 * production 1.0), About OPAX, Sources and licences, the tour. The
 * independence statement lives on About and in the tour (D4).
 */
export function AccountScreen() {
  const home = communityHome;
  return (
    <Screen column="wide" testID="account-sheet">
      <AccountSection />
      <AccountLinks
        community={home ? () => router.push(home) : undefined}
        testID="account-links"
      />
    </Screen>
  );
}
