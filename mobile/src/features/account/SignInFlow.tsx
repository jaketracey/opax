import { useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard } from 'react-native';
import * as voice from '../../voice';
import type { VoiceStatus } from '../../voice';
import {
  Button,
  ErrorState,
  Field,
  Group,
  Heading,
  LinkRow,
  Text,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import { CODE_LENGTH, codeDigits, isEmailAddress } from './code';
import {
  accountCopy,
  consumeRefusal,
  refusalCopy,
  requestRefusal,
} from './copy';
import { codeAccepted } from './store';
import { useCodeChallenge } from './useCodeChallenge';

export type SignInOutcome = 'signedIn' | 'unavailable';

/**
 * Sign in by emailed code (IOS-UX 4.11): the address, then the eight-digit
 * code. The Talk sheet can host it too; `onSignedIn` decides where to go.
 */
export function SignInFlow({
  onSignedIn,
}: {
  onSignedIn: (outcome: SignInOutcome) => void;
}) {
  const [email, setEmail] = useState('');
  // The address the current code went to; null while entering the address.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'resend' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Autofill and a tap can land in one frame, before `busy` renders.
  const inFlight = useRef(false);
  const challenge = useCodeChallenge();

  // ErrorState draws the sentence as an alert and moves VoiceOver to it.
  const refuse = (message: string) => setError(message);
  // Only a confirmed exchange for this attempt signs in and labels the
  // account with this address; status the exchange returned says which.
  function accepted(address: string, status: VoiceStatus) {
    challenge.clear();
    setCode('');
    if (!status.signedIn && !status.accountHeld)
      return refuse(refusalCopy.generic);
    codeAccepted(address, status);
    onSignedIn(status.signedIn ? 'signedIn' : 'unavailable');
  }

  async function send(resend: boolean) {
    if (inFlight.current) return;
    const address = (resend && sentTo ? sentTo : email).trim();
    if (!isEmailAddress(address)) return refuse(refusalCopy.invalidEmail);
    Keyboard.dismiss();
    inFlight.current = true;
    setBusy(resend ? 'resend' : 'send');
    setError(null);
    setNotice(null);
    const result = await voice.requestCode(address);
    inFlight.current = false;
    setBusy(null);
    if (!result.ok) return refuse(requestRefusal(result.error));
    challenge.issued(result.value.challengeId);
    setCode('');
    setSentTo(address);
    if (resend) {
      setNotice(accountCopy.newCodeSent(address));
      AccessibilityInfo.announceForAccessibility(
        accountCopy.newCodeSent(address),
      );
    }
  }

  async function verify(value: string) {
    if (inFlight.current || !sentTo || !challenge.challenge) return;
    if (value.length !== CODE_LENGTH) return refuse(refusalCopy.codeIncomplete);
    // A code past 15 minutes or five tries is not sent, which also spares the
    // address's daily attempts; it gets the same answer as any refused code.
    if (challenge.gate() !== 'open') return refuse(refusalCopy.codeFailed);
    Keyboard.dismiss();
    inFlight.current = true;
    setBusy('verify');
    setError(null);
    setNotice(null);
    challenge.tried();
    const result = await voice.consumeCode(challenge.challenge.id, value);
    inFlight.current = false;
    setBusy(null);
    if (result.ok) return accepted(sentTo, result.value);
    // A failure leaves the account as it was. A general status read cannot
    // say whose session it sees, so it never stands in for this exchange.
    refuse(consumeRefusal(result.error));
  }

  function changeCode(text: string) {
    const digits = codeDigits(text);
    setCode(digits);
    // One-time-code autofill and paste fill all eight digits at once.
    if (digits.length === CODE_LENGTH && code.length !== CODE_LENGTH)
      void verify(digits);
  }

  if (sentTo === null)
    return (
      <Group testID="account-email-step">
        <Group gap={rhythm.tight}>
          <Text wordSafe variant="body">
            {accountCopy.signInIntro}
          </Text>
          <Text wordSafe variant="metadata">
            {accountCopy.sameAccount}
          </Text>
          <Text wordSafe variant="metadata" testID="account-age-limit">
            {accountCopy.ageLimit}
          </Text>
        </Group>
        <Field
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
          returnKeyType="send"
          onSubmitEditing={() => void send(false)}
        />
        {error ? (
          <ErrorState message={error} testID="account-email-error" />
        ) : null}
        <Button
          variant="primary"
          label={accountCopy.sendCode}
          loading={busy === 'send'}
          onPress={() => void send(false)}
          testID="account-send-code"
        />
        <LinkRow
          title={accountCopy.privacy}
          external
          accessibilityHint="Opens on opax.com.au"
          testID="account-privacy"
          onPress={() => void openOnWeb('/privacy', accountCopy.privacy)}
        />
      </Group>
    );
  return (
    <Group testID="account-code-step">
      <Group gap={rhythm.tight}>
        <Heading level={2}>{accountCopy.enterCode}</Heading>
        <Text wordSafe testID="account-code-sent">
          {accountCopy.codeSent(sentTo)}
        </Text>
        <Text wordSafe variant="metadata">
          {accountCopy.emailLink}
        </Text>
      </Group>
      <Field
        label={accountCopy.code}
        value={code}
        onChangeText={changeCode}
        testID="account-code"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        keyboardType="number-pad"
        autoFocus
        selectTextOnFocus
      />
      {error ? (
        <ErrorState message={error} testID="account-code-error" />
      ) : null}
      <Button
        variant="primary"
        label={accountCopy.signIn}
        loading={busy === 'verify'}
        onPress={() => void verify(code)}
        testID="account-sign-in-code"
      />
      {notice ? (
        <Text wordSafe testID="account-code-notice">
          {notice}
        </Text>
      ) : null}
      <Button
        variant="quiet"
        label={accountCopy.sendNewCode}
        disabled={challenge.wait > 0}
        loading={busy === 'resend'}
        onPress={() => void send(true)}
        testID="account-resend"
      />
      {challenge.wait > 0 ? (
        <Text wordSafe variant="fine" testID="account-resend-wait">
          {accountCopy.resendIn(challenge.wait)}
        </Text>
      ) : null}
      <Button
        variant="quiet"
        label={accountCopy.differentEmail}
        onPress={() => {
          challenge.clear();
          setCode('');
          setError(null);
          setNotice(null);
          setSentTo(null);
        }}
        testID="account-different-email"
      />
    </Group>
  );
}
