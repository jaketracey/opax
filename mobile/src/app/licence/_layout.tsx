import { Stack } from 'expo-router';
import { useStackChrome } from '../../navigation/chrome';
import { licenceScreens } from '../../navigation/stack/reference';
export default function Layout() {
  return (
    <Stack screenOptions={useStackChrome()}>{[...licenceScreens()]}</Stack>
  );
}
