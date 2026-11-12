import { Stack } from 'expo-router';
import {
  useStackChrome,
  closeSheetItem,
  headerItems,
} from '../../../../navigation/chrome';
import { screen } from '../../../../navigation/stack/screen';
export { RouteErrorBoundary as ErrorBoundary } from '../../../../navigation/RouteErrorBoundary';
export default function Layout() {
  return (
    <Stack screenOptions={useStackChrome()}>
      {[
        screen(
          'index',
          'Conversations',
          headerItems(() => [closeSheetItem()]),
        ),
      ]}
    </Stack>
  );
}
