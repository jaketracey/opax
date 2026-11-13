import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import {
  Button,
  ErrorState,
  Field,
  InsetGroup,
  LinkRow,
  Text,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import type { VoiceStatus } from '../../voice';
import * as voice from '../../voice';
import { CODE_LENGTH, codeDigits, isEmailAddress } from './code';
import {
  accountCopy,
  consumeRefusal,
  refusalCopy,
  requestRefusal,
} from './copy';
import { ResendButton } from './ResendButton';
import { codeAccepted } from './store';
import { issueChallenge, useCodeChallenge } from './useCodeChallenge';

export type SignInOutcome = 'signedIn' | 'unavailable';

/**
 * Sign in, step 1 (specs/account.md 5.2): the address, as the field's one
 * labelled group, then Send code. On success `onSent` pushes the code step
 * with the challenge; back from it finds the address still here.
 */
export function EmailStep({
  onSent,
}: {
  onSent: (email: string, challenge: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function send() {
    if (inFlight.current) return;
    const address = email.trim();
    if (!isEmailAddress(address)) return setError(refusalCopy.invalidEmail);
    Keyboard.dismiss();
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const result = await voice.requestCode(address);
    inFlight.current = false;
    setBusy(false);
    if (!result.ok) return setError(requestRefusal(result.error));
    onSent(address, issueChallenge(result.value.challengeId));
  }

  return (
    <View style={styles.step} testID="account-email-step">
      <View style={styles.group}>
        <Field
          grouped
          label={accountCopy.email}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          testID="account-email"
          textContentType="emailAddress"
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoFocus
          returnKeyType="send"
          onSubmitEditing={() => void send()}
        />
        <View style={styles.footer}>
          <Text wordSafe variant="footnote" tone="inkSoft">
            {accountCopy.emailFooter}
          </Text>
          <Text
            wordSafe
            variant="footnote"
            tone="inkSoft"
            testID="account-age-limit"
          >
            {accountCopy.ageLimit}
          </Text>
        </View>
        {error ? (
          <ErrorState message={error} testID="account-email-error" />
        ) : null}
      </View>
      <Button
        variant="primary"
        size="large"
        fullWidth
        label={accountCopy.sendCode}
        loading={busy}
        onPress={() => void send()}
        testID="account-send-code"
      />
      <View style={styles.privacy}>
        <InsetGroup>
          <LinkRow
            title={accountCopy.privacy}
            external
            accessibilityHint={accountCopy.opensOnWeb}
            testID="account-privacy"
            onPress={() => void openOnWeb('/privacy', accountCopy.privacy)}
          />
        </InsetGroup>
      </View>
    </View>
  );
}

/**
 * Sign in, step 2 (5.3): the eight-digit code, which signs in by itself when
 * complete, and a resend that counts down in its own label. Back is "Use a
 * different email".
 *
 * Every refusal hides the keyboard, so the error and Send a new code are in
 * view and a tap on the field selects the old code to type over. `reveal`
 * (the screen's `useScrollReveal`) then scrolls the error up if it is still
 * below the fold: at AX3 and AX5 an expired code's error drew behind the
 * keyboard (build 61).
 */
export function CodeStep({
  email,
  challenge: initial,
  onSignedIn,
  reveal,
}: {
  email: string;
  challenge: string | null;
  onSignedIn: (outcome: SignInOutcome) => void;
  reveal?: (target: RefObject<View | null>) => () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'resend' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  // Autofill and a tap can land in one frame, before `busy` renders.
  const inFlight = useRef(false);
  const challenge = useCodeChallenge(initial);
  const errorView = useRef<View>(null);
  useEffect(
    () => (error && reveal ? reveal(errorView) : undefined),
    [error, reveal],
  );

  // Only a confirmed exchange for this attempt signs in and labels the
  // account with this address; status the exchange returned says which.
  function accepted(status: VoiceStatus) {
    if (!status.signedIn && !status.accountHeld) {
      challenge.clear();
      setCode('');
      setBusy(null);
      return setError(refusalCopy.generic);
    }
    // Signed in: the screens close now, so nothing on them changes while
    // they leave. On Android a change committed with the pop crashed Fabric.
    codeAccepted(email, status);
    onSignedIn(status.signedIn ? 'signedIn' : 'unavailable');
  }

  async function resend() {
    if (inFlight.current) return;
    Keyboard.dismiss();
    inFlight.current = true;
    setBusy('resend');
    setError(null);
    const result = await voice.requestCode(email);
    inFlight.current = false;
    setBusy(null);
    if (!result.ok) return setError(requestRefusal(result.error));
    challenge.issued(result.value.challengeId);
    setCode('');
    setResent(true);
    AccessibilityInfo.announceForAccessibility(accountCopy.newCodeSent(email));
  }

  async function verify(value: string) {
    if (inFlight.current) return;
    // Before any answer, as a sent code always did: a refused or expired
    // code then never leaves its error behind the keyboard.
    Keyboard.dismiss();
    if (value.length !== CODE_LENGTH)
      return setError(refusalCopy.codeIncomplete);
    // A code past 15 minutes or five tries is not sent, which also spares the
    // address's daily attempts; it gets the same answer as any refused code.
    if (!challenge.challenge || challenge.gate() !== 'open')
      return setError(refusalCopy.codeFailed);
    inFlight.current = true;
    setBusy('verify');
    setError(null);
    challenge.tried();
    const result = await voice.consumeCode(challenge.challenge.id, value);
    inFlight.current = false;
    if (result.ok) return accepted(result.value);
    setBusy(null);
    // A failure leaves the account as it was. A general status read cannot
    // say whose session it sees, so it never stands in for this exchange.
    setError(consumeRefusal(result.error));
  }

  function changeCode(text: string) {
    const digits = codeDigits(text);
    setCode(digits);
    setError(null);
    // One-time-code autofill and paste fill all eight digits at once.
    if (digits.length === CODE_LENGTH && code.length !== CODE_LENGTH)
      void verify(digits);
  }

  return (
    <View style={styles.step} testID="account-code-step">
      <View style={styles.group}>
        <Field
          grouped
          label={accountCopy.code}
          variant="code"
          codeLength={CODE_LENGTH}
          value={code}
          onChangeText={changeCode}
          testID="account-sign-in-code"
          textContentType="oneTimeCode"
          autoComplete={
            Platform.OS === 'android' ? 'email-otp' : 'one-time-code'
          }
          keyboardType="number-pad"
          autoFocus
          selectTextOnFocus
        />
        <Text
          wordSafe
          variant="footnote"
          tone="inkSoft"
          testID={resent ? 'account-code-notice' : 'account-code-sent'}
          style={styles.footer}
        >
          {resent
            ? accountCopy.newCodeSent(email)
            : accountCopy.codeSent(email)}
        </Text>
        {error ? (
          <View ref={errorView} collapsable={false}>
            <ErrorState message={error} testID="account-code-error" />
          </View>
        ) : null}
      </View>
      <Button
        variant="primary"
        size="large"
        fullWidth
        label={accountCopy.signIn}
        loading={busy === 'verify'}
        disabled={code.length !== CODE_LENGTH && busy !== 'verify'}
        onPress={() => void verify(code)}
        testID="account-sign-in"
      />
      <ResendButton
        label={accountCopy.sendNewCode}
        countdown={accountCopy.sendNewCodeIn}
        wait={challenge.wait}
        busy={busy === 'resend'}
        onPress={() => void resend()}
        testID="account-resend"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: rhythm.block },
  group: { gap: rhythm.tight },
  footer: { gap: rhythm.line, paddingHorizontal: rhythm.block },
  privacy: { marginTop: rhythm.group - rhythm.block },
});
