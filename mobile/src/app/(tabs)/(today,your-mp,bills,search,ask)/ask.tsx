import { Stack, useSegments } from 'expo-router';
import AskScreen from '../../../features/ask/AskScreen';
import { useAccount } from '../../../features/account/store';
import { headerItems, rootHeaderItems } from '../../../navigation/chrome';
export default function AskRoute() {
  const account = useAccount();
  const inAsk = useSegments().some((segment) => segment === '(ask)');
  return (
    <>
      <AskScreen />
      <Stack.Screen
        options={{
          headerLargeTitleEnabled: inAsk,
          ...headerItems(() =>
            rootHeaderItems({
              segment: '(ask)',
              signedIn: !!account.status?.signedIn,
            }),
          ),
        }}
      />
    </>
  );
}
