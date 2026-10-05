import { useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard } from 'react-native';
import * as voice from '../../voice';
import type { VoiceStatus } from '../../voice';
import {
  Button,
  Field,
  Group,
  Heading,
  OpaxWebLink,
  Text,
} from '../../design/primitives';
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

  function refuse(message: string) {
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  }
  function accepted(address: string, status: VoiceStatus) {
    challenge.clear();
    setCode('');
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
    const gate = challenge.gate();
    if (gate === 'expired') return refuse(refusalCopy.codeExpired);
    if (gate === 'spent') return refuse(refusalCopy.codeSpent);
    Keyboard.dismiss();
    inFlight.current = true;
    setBusy('verify');
    setError(null);
    setNotice(null);
    challenge.tried();
    const result = await voice.consumeCode(challenge.challenge.id, value);
    // The exchange can succeed and the status read after it fail; the token
    // is then already stored, and the used code would be refused next time.
    const status = result.ok ? result : await voice.status();
    inFlight.current = false;
    setBusy(null);
    if (result.ok) return accepted(sentTo, result.value);
    if (status.ok && status.value.signedIn)
      return accepted(sentTo, status.value);
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
        <Text variant="lede">{accountCopy.signInIntro}</Text>
        <Text>{accountCopy.sameAccount}</Text>
        <Field
          label={accountCopy.email}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          error={error}
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
        <Button
          variant="primary"
          label={accountCopy.sendCode}
          loading={busy === 'send'}
          onPress={() => void send(false)}
          testID="account-send-code"
        />
        <OpaxWebLink
          label={accountCopy.privacy}
          path="/community?view=privacy"
          testID="account-privacy"
        />
      </Group>
    );
  return (
    <Group testID="account-code-step">
      <Heading level={2}>{accountCopy.enterCode}</Heading>
      <Text testID="account-code-sent">{accountCopy.codeSent(sentTo)}</Text>
      <Text variant="fine">{accountCopy.emailLink}</Text>
      <Field
        label={accountCopy.code}
        value={code}
        onChangeText={changeCode}
        error={error}
        testID="account-code"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        keyboardType="number-pad"
        autoFocus
        selectTextOnFocus
      />
      <Button
        variant="primary"
        label={accountCopy.signIn}
        loading={busy === 'verify'}
        onPress={() => void verify(code)}
        testID="account-sign-in-code"
      />
      {notice ? <Text testID="account-code-notice">{notice}</Text> : null}
      <Button
        variant="quiet"
        label={accountCopy.sendNewCode}
        disabled={challenge.wait > 0}
        loading={busy === 'resend'}
        onPress={() => void send(true)}
        testID="account-resend"
      />
      {challenge.wait > 0 ? (
        <Text variant="fine" testID="account-resend-wait">
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
