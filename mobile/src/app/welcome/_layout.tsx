import { Stack } from 'expo-router';
import { useStackChrome } from '../../navigation/chrome';
import { welcomeScreens } from '../../navigation/stack/seat';
export default function Layout() {
  return (
    <Stack screenOptions={useStackChrome()}>{[...welcomeScreens()]}</Stack>
  );
}
