import { Stack, router, type Href } from 'expo-router';
import { Screen } from '../../design/primitives';
import { accountCopy } from './copy';
import { SignInFlow } from './SignInFlow';

export function SignInScreen() {
  return (
    <>
      <Stack.Screen options={{ title: accountCopy.signInForVoice }} />
      <Screen testID="account-sign-in-screen">
        <SignInFlow
          onSignedIn={() =>
            // Opened cold from a link, there is nothing to go back to.
            router.canGoBack()
              ? router.back()
              : router.replace('/account' as Href)
          }
        />
      </Screen>
    </>
  );
}
