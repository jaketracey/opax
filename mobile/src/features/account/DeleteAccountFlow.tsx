import { useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard } from 'react-native';
import * as voice from '../../voice';
import type { VoiceFailure } from '../../voice';
import {
  Button,
  ErrorState,
  Field,
  Group,
  Heading,
  Text,
} from '../../design/primitives';
import { CODE_LENGTH, codeDigits } from './code';
import { accountCopy, deletionRefusal, refusalCopy } from './copy';
import { accountDeleted, sessionEnded } from './store';
import { useCodeChallenge } from './useCodeChallenge';

/**
 * Account deletion (IOS-UX 4.12, IOS-APP section 6): what is and is not
 * deleted, a fresh emailed code, then the result. Ends signed out.
 */
export function DeleteAccountFlow({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'confirm' | 'code' | 'deleted'>('confirm');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'request' | 'resend' | 'delete' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const challenge = useCodeChallenge();

  function refuse(message: string) {
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  }
  function refused(failure: VoiceFailure) {
    // The native core has already removed a token the Worker refused.
    if (failure === 'signedOut' || failure === 'forbidden') sessionEnded();
    refuse(deletionRefusal(failure));
  }

  async function request(resend: boolean) {
    if (inFlight.current) return;
    Keyboard.dismiss();
    inFlight.current = true;
    setBusy(resend ? 'resend' : 'request');
    setError(null);
    setNotice(null);
    const result = await voice.requestDeletionCode();
    inFlight.current = false;
    setBusy(null);
    if (!result.ok) return refused(result.error);
    challenge.issued(result.value.challengeId);
    setCode('');
    setStep('code');
    if (resend) {
      setNotice(accountCopy.newDeletionCodeSent);
      AccessibilityInfo.announceForAccessibility(
        accountCopy.newDeletionCodeSent,
      );
    }
  }

  async function remove() {
    if (inFlight.current || !challenge.challenge) return;
    if (code.length !== CODE_LENGTH) return refuse(refusalCopy.codeIncomplete);
    const gate = challenge.gate();
    if (gate === 'expired') return refuse(refusalCopy.deletionCodeExpired);
    if (gate === 'spent') return refuse(refusalCopy.deletionCodeSpent);
    Keyboard.dismiss();
    inFlight.current = true;
    setBusy('delete');
    setError(null);
    setNotice(null);
    challenge.tried();
    const result = await voice.deleteAccount(challenge.challenge.id, code);
    inFlight.current = false;
    setBusy(null);
    if (!result.ok) return refused(result.error);
    challenge.clear();
    setCode('');
    accountDeleted();
    setStep('deleted');
    AccessibilityInfo.announceForAccessibility(accountCopy.accountDeleted);
  }

  if (step === 'deleted')
    return (
      <Group testID="account-deleted-step">
        <Heading level={2} testID="account-deleted">
          {accountCopy.accountDeleted}
        </Heading>
        <Text>{accountCopy.accountDeletedDetail}</Text>
        <Button
          variant="primary"
          label={accountCopy.done}
          onPress={onDone}
          testID="account-delete-done"
        />
      </Group>
    );
  if (step === 'code')
    return (
      <Group testID="account-deletion-code-step">
        <Heading level={2}>{accountCopy.enterDeletionCode}</Heading>
        <Text testID="account-deletion-code-sent">
          {accountCopy.deletionCodeSent}
        </Text>
        <Field
          label={accountCopy.deletionCode}
          value={code}
          onChangeText={(text) => {
            const digits = codeDigits(text);
            setCode(digits);
            // Deleting needs a deliberate tap; a full code only hides the
            // keyboard so the button is in view.
            if (digits.length === CODE_LENGTH) Keyboard.dismiss();
          }}
          error={error}
          testID="account-deletion-code"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          keyboardType="number-pad"
          autoFocus
          selectTextOnFocus
        />
        <Button
          variant="danger"
          label={accountCopy.deleteAccount}
          loading={busy === 'delete'}
          onPress={() => void remove()}
          testID="account-delete-final"
        />
        {notice ? <Text testID="account-deletion-notice">{notice}</Text> : null}
        <Button
          variant="quiet"
          label={accountCopy.sendNewDeletionCode}
          disabled={challenge.wait > 0}
          loading={busy === 'resend'}
          onPress={() => void request(true)}
          testID="account-deletion-resend"
        />
        {challenge.wait > 0 ? (
          <Text variant="fine" testID="account-deletion-resend-wait">
            {accountCopy.resendIn(challenge.wait)}
          </Text>
        ) : null}
        <Button
          variant="quiet"
          label={accountCopy.cancel}
          onPress={onCancel}
          testID="account-deletion-cancel"
        />
      </Group>
    );
  return (
    <Group testID="account-delete-confirm-step">
      <Text variant="lede">{accountCopy.deleteIntro}</Text>
      <Heading level={2}>{accountCopy.deletedHeading}</Heading>
      {accountCopy.deleted.map((item) => (
        <Text key={item}>{item}</Text>
      ))}
      <Heading level={2}>{accountCopy.keptHeading}</Heading>
      {accountCopy.kept.map((item) => (
        <Text key={item}>{item}</Text>
      ))}
      <Text>{accountCopy.deleteConfirmNote}</Text>
      {error ? (
        <ErrorState message={error} testID="account-delete-error" />
      ) : null}
      <Button
        variant="danger"
        label={accountCopy.deleteAccount}
        loading={busy === 'request'}
        onPress={() => void request(false)}
        testID="account-delete-confirm"
      />
      <Button
        variant="quiet"
        label={accountCopy.cancel}
        onPress={onCancel}
        testID="account-delete-cancel"
      />
    </Group>
  );
}
