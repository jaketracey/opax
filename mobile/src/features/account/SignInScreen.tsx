import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Heading, Screen } from '../../design/primitives';
import { useScrollReveal } from '../../design/scroll-reveal';
import {
  signInCodeRoute,
  talkSignInCodeRoute,
} from '../../navigation/routes/account';
import { finishSignIn, signInReturn } from './navigation';
import { accountCopy } from './copy';
import { CodeStep, EmailStep } from './SignInFlow';

type Base = 'account' | 'talk';
const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * Sign in, the email step: `/account/sign-in`, or `/talk/sign-in` inside the
 * Talk sheet (`base="talk"`). The bar title "Sign in" comes from the stack.
 */
export function SignInScreen({ base = 'account' }: { base?: Base }) {
  const params = useLocalSearchParams<{ return?: string }>();
  const to = signInReturn(one(params.return), base);
  return (
    <Screen grouped testID="account-sign-in-screen">
      {base === 'talk' ? (
        <Heading testID="account-sign-in-heading">
          {accountCopy.signUpOrSignIn}
        </Heading>
      ) : null}
      <EmailStep
        onSent={(email, challenge) =>
          router.push(
            base === 'talk'
              ? talkSignInCodeRoute(email, challenge, to)
              : signInCodeRoute(email, challenge, to),
          )
        }
      />
    </Screen>
  );
}

/** Sign in, the code step ("Check your email"). */
export function SignInCodeScreen({ base = 'account' }: { base?: Base }) {
  const params = useLocalSearchParams<{
    email?: string;
    challenge?: string;
    return?: string;
  }>();
  const email = one(params.email) ?? '';
  const to = signInReturn(one(params.return), base);
  const challenge = one(params.challenge);
  const errors = useScrollReveal();
  // Opened cold, with no code sent in this app session: start at the address.
  if (!email || !challenge)
    return (
      <Redirect href={base === 'talk' ? '/talk/sign-in' : '/account/sign-in'} />
    );
  return (
    <Screen
      grouped
      testID="account-sign-in-code-screen"
      scrollRef={errors.scrollRef}
      onScroll={errors.onScroll}
    >
      <CodeStep
        email={email}
        challenge={challenge}
        onSignedIn={() => finishSignIn(to)}
        reveal={errors.reveal}
      />
    </Screen>
  );
}

export const TalkSignInScreen = () => <SignInScreen base="talk" />;
export const TalkSignInCodeScreen = () => <SignInCodeScreen base="talk" />;
