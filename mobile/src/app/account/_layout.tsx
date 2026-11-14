import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { useStackChrome, opaqueBar } from '../../navigation/chrome';
import { colors } from '../../design/tokens';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
import { accountScreens } from '../../navigation/stack/account';
import { referenceScreens } from '../../navigation/stack/reference';
import { askAccountScreens } from '../../navigation/stack/ask';
import { learnAccountScreens } from '../../navigation/stack/learn';

export { RouteErrorBoundary as ErrorBoundary } from '../../navigation/RouteErrorBoundary';
// Genuine account links open with Account beneath them and a working back
// button (specs/account.md 1.1).
export const unstable_settings = { initialRouteName: 'index' };
export default function AccountStack() {
  return (
    <Stack
      screenOptions={{
        ...useStackChrome(),
        ...opaqueBar(colors.sunken),
        contentStyle: { backgroundColor: colors.sunken },
        ...(Platform.OS === 'android' ? { header: AndroidReadingHeader } : {}),
      }}
    >
      {[
        ...accountScreens(),
        ...referenceScreens(),
        ...askAccountScreens(),
        ...learnAccountScreens(),
      ]}
    </Stack>
  );
}
