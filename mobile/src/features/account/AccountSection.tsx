import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  Button,
  Divider,
  ErrorState,
  Group,
  Section,
  Text,
} from '../../design/primitives';
import { accountCopy } from './copy';
import {
  accountView,
  clearNotice,
  refreshAccount,
  signOut,
  useAccount,
} from './store';

/**
 * The Account section of Account and about (IOS-UX 4.9 and 4.12): signed
 * out, signed in with voice time, sign-out and deletion. A plain line about
 * the account; nothing here is tracked.
 */
export function AccountSection() {
  const account = useAccount();
  const view = accountView(account);
  const [leaving, setLeaving] = useState(false);
  // Opening the sheet reads status only: no microphone, audio or reservation.
  useEffect(() => {
    void refreshAccount();
    return clearNotice;
  }, []);
  useEffect(() => {
    if (account.notice)
      AccessibilityInfo.announceForAccessibility(account.notice);
  }, [account.notice]);

  const leave = async () => {
    setLeaving(true);
    await signOut();
    setLeaving(false);
  };
  const actions = (
    <>
      <Divider variant="subtle" />
      <Button
        label={accountCopy.signOut}
        loading={leaving}
        onPress={() => void leave()}
        testID="account-sign-out"
      />
      <Divider variant="subtle" />
      <Button
        variant="danger"
        label={accountCopy.deleteAccount}
        onPress={() => router.push('/account/delete' as Href)}
        testID="account-delete"
      />
      <Text variant="fine">{accountCopy.sharedAccount}</Text>
    </>
  );
  return (
    <Section
      title="Account"
      icon="person.crop.circle"
      accent="people"
      testID="account-section"
    >
      <Group>
        {account.notice ? (
          <Text testID="account-notice">{account.notice}</Text>
        ) : null}
        {view.kind === 'checking' ? (
          <Text testID="account-sheet-message">{accountCopy.checking}</Text>
        ) : view.kind === 'failed' ? (
          <ErrorState
            message={accountCopy.statusFailed}
            onRetry={() => void refreshAccount()}
            testID="account-sheet-message"
          />
        ) : view.kind === 'signedOut' ? (
          <>
            <Text testID="account-sheet-message">{accountCopy.signedOut}</Text>
            <Button
              variant="primary"
              label={accountCopy.signInForVoice}
              onPress={() => router.push('/account/sign-in' as Href)}
              testID="account-sign-in-start"
            />
          </>
        ) : view.kind === 'unavailable' ? (
          <>
            <Text testID="account-sheet-message">
              {accountCopy.unavailableAccount}
            </Text>
            {actions}
          </>
        ) : (
          <>
            <Text testID="account-sheet-message">
              {view.email
                ? accountCopy.signedInAs(view.email)
                : accountCopy.signedInHere}
            </Text>
            <Text testID="account-voice-time">
              {view.status.unlimited
                ? accountCopy.unlimited
                : accountCopy.voiceTime(view.status.remainingSeconds)}
            </Text>
            {view.status.enabled ? null : <Text>{accountCopy.voiceOff}</Text>}
            {actions}
          </>
        )}
      </Group>
    </Section>
  );
}
