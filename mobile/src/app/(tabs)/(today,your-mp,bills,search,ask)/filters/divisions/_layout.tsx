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
          'Filters',
          headerItems(() => [closeSheetItem()]),
        ),
        screen('[facet]', 'Filters'),
      ]}
    </Stack>
  );
}
