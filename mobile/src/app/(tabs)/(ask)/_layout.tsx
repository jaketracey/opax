import { Stack } from 'expo-router';
import { useStackChrome } from '../../../navigation/chrome';
export const unstable_settings = { anchor: 'ask' };
export default function AskLayout() {
  return (
    <Stack
      screenOptions={{ ...useStackChrome(), headerLargeTitleEnabled: true }}
    />
  );
}
