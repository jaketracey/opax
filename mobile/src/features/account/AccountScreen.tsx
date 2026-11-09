import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { Screen } from '../../design/primitives';
import { colors } from '../../design/tokens';
import { voiceLinked } from '../../voice/linked';
import { communityHome } from '../community/entry';
import { AccountGroups } from './AccountGroups';
import { AccountLinks } from './AccountLinks';
import { AccountRowsScreen } from './AccountRows';
import { VersionFoot } from './parts';
import { refreshAccount } from './store';

/**
 * The Account sheet (specs/account.md 2): the account groups, then about,
 * privacy and support, the welcome, and the version foot. A build without
 * voice (Android without its OpaxVoice module) draws the same sheet without
 * the account groups. Groups 4 to 6 are static, so the sheet never opens
 * empty. Pull to refresh re-reads the account status.
 */
export function AccountScreen() {
  const [pulling, setPulling] = useState(false);
  if (!voiceLinked) return <AccountRowsScreen />;
  return (
    <Screen
      grouped
      testID="account-sheet"
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          tintColor={colors.inkSoft}
          onRefresh={() => {
            setPulling(true);
            void refreshAccount().finally(() => setPulling(false));
          }}
        />
      }
    >
      <AccountGroups />
      <AccountLinks community={communityHome} testID="account-links" />
      <VersionFoot />
    </Screen>
  );
}
