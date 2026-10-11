import { Stack, router, type Href } from 'expo-router';
import { accountCopy } from './copy';
import { DeleteAccountFlow } from './DeleteAccountFlow';

export function DeleteAccountScreen() {
  return (
    <>
      <Stack.Screen options={{ title: accountCopy.deleteAccount }} />
      <DeleteAccountFlow
        onCancel={() => router.back()}
        onDone={() => router.back()}
        // Back to Account and about after signing in, to delete from there.
        onSignIn={() => router.replace('/account/sign-in' as Href)}
      />
    </>
  );
}
