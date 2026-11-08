import { Stack } from 'expo-router';
import {
  useStackChrome,
  closeSheetItem,
  headerItems,
} from '../../../../../navigation/chrome';
import { screen } from '../../../../../navigation/stack/screen';
export default function Layout() {
  return (
    <Stack screenOptions={useStackChrome()}>
      {[
        screen(
          'index',
          'Options',
          headerItems(() => [closeSheetItem()]),
        ),
        screen('member', 'Person'),
        screen('party', 'Party'),
        screen('parliament', 'Parliament'),
        screen('topic', 'Topic'),
        screen('years', 'Years'),
      ]}
    </Stack>
  );
}
