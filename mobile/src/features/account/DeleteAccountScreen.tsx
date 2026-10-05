import { Stack, router } from 'expo-router';
import { Screen } from '../../design/primitives';
import { accountCopy } from './copy';
import { DeleteAccountFlow } from './DeleteAccountFlow';

export function DeleteAccountScreen() {
  return (
    <>
      <Stack.Screen options={{ title: accountCopy.deleteAccount }} />
      <Screen testID="account-delete-screen">
        <DeleteAccountFlow
          onCancel={() => router.back()}
          onDone={() => router.back()}
        />
      </Screen>
    </>
  );
}
