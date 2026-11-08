import { Stack } from 'expo-router';
import { useStackChrome } from '../../navigation/chrome';
import { seatScreens } from '../../navigation/stack/seat';
export default function Layout() {
  return <Stack screenOptions={useStackChrome()}>{[...seatScreens()]}</Stack>;
}
