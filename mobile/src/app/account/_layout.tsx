import {
  headerItems,
  closeSheetItem,
  useStackChrome,
} from '../../navigation/chrome';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
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
        <Stack.Protected guard={false}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="delete" />
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
