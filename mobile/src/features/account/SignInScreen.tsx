import { Stack, router } from 'expo-router';
import { Screen } from '../../design/primitives';
import { accountCopy } from './copy';
import { SignInFlow } from './SignInFlow';

export function SignInScreen() {
  return (
    <>
      <Stack.Screen options={{ title: accountCopy.signInForVoice }} />
      <Screen testID="account-sign-in-screen">
        <SignInFlow onSignedIn={() => router.back()} />
      </Screen>
    </>
  );
}
