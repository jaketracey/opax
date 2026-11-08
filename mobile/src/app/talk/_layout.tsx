import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import {
  useStackChrome,
  closeSheetItem,
  headerItems,
} from '../../navigation/chrome';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
import { sheetOptions } from '../../navigation/stack/screen';
export default function TalkStack() {
  return (
    <Stack
      screenOptions={{
        ...useStackChrome(),
        ...(Platform.OS === 'android' ? { header: AndroidReadingHeader } : {}),
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Talk to OPAX',
          ...headerItems(() => [closeSheetItem()]),
        }}
      />
      <Stack.Screen name="consent" options={{ title: 'Voice consent' }} />
      <Stack.Screen
        name="sources"
        options={{ ...sheetOptions, title: 'Sources' }}
      />
      <Stack.Screen name="record" options={{ title: 'Talk from a record' }} />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen
        name="sign-in/code"
        options={{ title: 'Check your email' }}
      />
    </Stack>
  );
}
