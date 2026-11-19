import { Stack } from 'expo-router';
import { useStackChrome, useUnderBar } from '../../../navigation/chrome';
import {
  sharedScreens,
  tabRootName,
  tabSettings,
} from '../../../navigation/stack';
import { titlePinLayout } from '../../../navigation/title-pin';
import { useAccount } from '../../../features/account/store';

export const unstable_settings = tabSettings;
// A page that fails to draw keeps the tab bar, so the other tabs stay usable.
export { RouteErrorBoundary as ErrorBoundary } from '../../../navigation/RouteErrorBoundary';
export default function TabStack({ segment }: { segment: string }) {
  const account = useAccount();
  const chrome = useStackChrome({ tabStack: true });
  const underBar = useUnderBar(chrome.headerTransparent);
  return (
    <Stack
      initialRouteName={tabRootName(segment)}
      screenOptions={chrome}
      screenLayout={titlePinLayout}
    >
      {[...sharedScreens(segment, !!account.status?.signedIn, underBar)]}
    </Stack>
  );
}
