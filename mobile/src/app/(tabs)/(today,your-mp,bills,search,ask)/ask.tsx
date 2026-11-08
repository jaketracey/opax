import { useSyncExternalStore } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import AskScreen from '../../../features/ask/AskScreen';
import { askSession } from '../../../features/ask/session';
import { chatsSnapshot, subscribeChats } from '../../../features/ask/store';
import { useAccount } from '../../../features/account/store';
import { askHeaderItems } from '../../../navigation/chrome';
import { requestFocus } from '../../../design/keyboard';
export default function AskRoute() {
  const account = useAccount();
  const session = useSyncExternalStore(
    askSession.subscribe,
    askSession.snapshot,
  );
  const chats = useSyncExternalStore(subscribeChats, chatsSnapshot);
  const inAsk = useSegments().some((segment) => segment === '(ask)');
  return (
    <>
      <AskScreen />
      <Stack.Screen
        options={{
          headerLargeTitleEnabled: inAsk,
          ...askHeaderItems({
            signedIn: !!account.status?.signedIn,
            historyEnabled:
              chats.chats.length > 0 || !!account.status?.signedIn,
            canStartNew: !session.busy && session.thread.length > 0,
            onNew: () => {
              askSession.start();
              requestFocus('ask');
            },
            onHistory: () => router.push('/conversations'),
          }),
        }}
      />
    </>
  );
}
