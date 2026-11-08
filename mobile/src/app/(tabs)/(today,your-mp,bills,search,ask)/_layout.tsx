import { Stack } from 'expo-router';
import { useStackChrome } from '../../../navigation/chrome';
import { sharedScreens, tabSettings } from '../../../navigation/stack';
import { useAccount } from '../../../features/account/store';

export const unstable_settings = tabSettings;
export default function TabStack({ segment }: { segment: string }) {
  const account = useAccount();
  return (
    <Stack screenOptions={useStackChrome()}>
      {[...sharedScreens(segment, !!account.status?.signedIn)]}
    </Stack>
  );
}
