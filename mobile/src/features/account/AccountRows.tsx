import { Screen } from '../../design/primitives';
import { communityHome } from '../community/entry';
import { AccountLinks } from './AccountLinks';
import { AppearanceGroup, VersionFoot } from './parts';

/**
 * The Account sheet with no account groups (specs/account.md 9): Appearance
 * (in a build that follows the system), groups 4 to 6 and the version foot. A build without voice (the voice-off release,
 * or Android without its OpaxVoice module) draws this, on both platforms.
 */
export function AccountRowsScreen() {
  return (
    <Screen grouped testID="account-sheet">
      <AppearanceGroup />
      <AccountLinks community={communityHome} testID="account-links" />
      <VersionFoot />
    </Screen>
  );
}
