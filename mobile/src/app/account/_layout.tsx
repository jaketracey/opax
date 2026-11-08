import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { useStackChrome, opaqueBar } from '../../navigation/chrome';
import { colors } from '../../design/tokens';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
import { accountScreens } from '../../navigation/stack/account';
import { referenceScreens } from '../../navigation/stack/reference';
import { askAccountScreens } from '../../navigation/stack/ask';
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
      {[...accountScreens(), ...referenceScreens(), ...askAccountScreens()]}
    </Stack>
  );
}
