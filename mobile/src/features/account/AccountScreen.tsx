import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { Screen } from '../../design/primitives';
import { useColors } from '../../design/use-colors';
import { voiceLinked } from '../../voice/linked';
import { communityHome } from '../community/entry';
import { AccountGroups } from './AccountGroups';
import { AccountLinks } from './AccountLinks';
import { AccountRowsScreen } from './AccountRows';
import { AppearanceGroup, VersionFoot } from './parts';
import { refreshAccount } from './store';

/**
 * The Account sheet (specs/account.md 2): the account groups, Appearance
 * (in a build that follows the system, signed in or not), then about,
 * privacy and support, the welcome, and the version foot. A build without
 * voice (Android without its OpaxVoice module) draws the same sheet without
 * the account groups. Groups 4 to 6 are static, so the sheet never opens
 * empty. Pull to refresh re-reads the account status.
 */
export function AccountScreen() {
  const colors = useColors();

  const [pulling, setPulling] = useState(false);
  if (!voiceLinked) return <AccountRowsScreen />;
  return (
    <Screen
      grouped
      testID="account-sheet"
      refreshControl={
        <RefreshControl
          colors={[colors.navy]}
          progressBackgroundColor={colors.raised}
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
      <AppearanceGroup />
      <AccountLinks community={communityHome} testID="account-links" />
      <VersionFoot />
    </Screen>
  );
}
