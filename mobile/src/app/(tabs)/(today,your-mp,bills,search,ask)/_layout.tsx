import { Stack } from 'expo-router';
import { useStackChrome } from '../../../navigation/chrome';
import {
  sharedScreens,
  tabRootName,
  tabSettings,
} from '../../../navigation/stack';
import { useAccount } from '../../../features/account/store';

export const unstable_settings = tabSettings;
export default function TabStack({ segment }: { segment: string }) {
  const account = useAccount();
  return (
    <Stack
      initialRouteName={tabRootName(segment)}
      screenOptions={useStackChrome()}
    >
      {[...sharedScreens(segment, !!account.status?.signedIn)]}
    </Stack>
  );
}
