import { Stack } from 'expo-router';
export { RouteErrorBoundary as ErrorBoundary } from '../../design/route-error';
import { Platform } from 'react-native';
import { useStackChrome, headerItems } from '../../navigation/chrome';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
import { sheetOptions } from '../../navigation/stack/screen';
import { colors } from '../../design/tokens';
import { copy } from '../../design/copy';

// A cold `opax://talk/…` link opens with Talk beneath it (specs/account.md
// 1.1).
export const unstable_settings = { initialRouteName: 'index' };

/**
 * The Talk sheet's own stack (specs/account.md 7.8): Talk, its consent and
 * Sources sheets, a record pushed during a call, and sign-in, which pushes
 * inside the sheet and returns to Talk.
 */
export default function TalkStack() {
  return (
    <Stack
      screenOptions={{
        ...useStackChrome(),
        contentStyle: { backgroundColor: colors.paper },
        ...(Platform.OS === 'android' ? { header: AndroidReadingHeader } : {}),
      }}
    >
      <Stack.Screen
        name="index"
        // TalkScreen sets its own ⋯ menu and Done, and blanks the title in a call.
        options={{ title: 'Talk to OPAX', headerLargeTitleEnabled: false }}
      />
      <Stack.Screen
        name="consent"
        options={{
          ...sheetOptions,
          title: 'Before you talk',
          sheetAllowedDetents: 'fitToContents',
          sheetExpandsWhenScrolledToEdge: true,
          // The two buttons are the exits; swipe down is Not now.
          ...headerItems(undefined),
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="sources"
        options={{
          ...sheetOptions,
          title: copy.sources,
          sheetAllowedDetents: [0.5, 1],
        }}
      />
      <Stack.Screen name="record" options={{ title: '' }} />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen
        name="sign-in/code"
        options={{ title: 'Check your email' }}
      />
    </Stack>
  );
}
