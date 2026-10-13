import {
  headerItems,
  closeSheetItem,
  useStackChrome,
} from '../../navigation/chrome';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
import { voiceLinked } from '../../voice/linked';
export default function AccountStack() {
  const chrome = useStackChrome();
  return (
    <Stack screenOptions={chrome}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Account and about',
          ...headerItems(() => [closeSheetItem()]),
          ...(Platform.OS === 'android'
            ? { header: AndroidReadingHeader }
            : {}),
        }}
      />
      {Platform.OS === 'android' ? (
        // Sign-in and deletion need the OpaxVoice module (src/voice/linked.ts).
        <Stack.Protected guard={voiceLinked}>
          <Stack.Screen
            name="sign-in"
            options={{ header: AndroidReadingHeader }}
          />
          <Stack.Screen
            name="delete"
            options={{ header: AndroidReadingHeader }}
          />
        </Stack.Protected>
      ) : null}
      <Stack.Screen name="about" options={{ title: 'About OPAX' }} />
      <Stack.Screen
        name="sources"
        options={{
          title: 'Sources and licences',
          ...(Platform.OS === 'android'
            ? { header: AndroidReadingHeader }
            : {}),
        }}
      />
    </Stack>
  );
}
