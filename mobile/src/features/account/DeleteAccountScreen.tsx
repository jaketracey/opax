import { Stack, router } from 'expo-router';
import { accountCopy } from './copy';
import { DeleteAccountFlow } from './DeleteAccountFlow';

export function DeleteAccountScreen() {
  return (
    <>
      <Stack.Screen options={{ title: accountCopy.deleteAccount }} />
      <DeleteAccountFlow
        onCancel={() => router.back()}
        onDone={() => router.back()}
      />
    </>
  );
}
