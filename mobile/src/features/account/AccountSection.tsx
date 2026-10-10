import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  Button,
  ErrorState,
  Group,
  Section,
  Text,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { accountCopy } from './copy';
import {
  accountView,
  clearNotice,
  refreshAccount,
  signOut,
  useAccount,
} from './store';

/**
 * The account block of Account and about (IOS-UX 4.9 and 4.12), first under
 * the sheet's title, so it has no heading of its own. Signed out: one
 * sentence and the sheet's one primary action, Sign in. Signed in: the
 * address and voice time, then sign-out and deletion side by side (stacked
 * at accessibility sizes). Nothing here is tracked.
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
      <View style={styles.actions}>
        <Button
          label={accountCopy.signOut}
          loading={leaving}
          onPress={() => void leave()}
          testID="account-sign-out"
        />
        <Button
          variant="danger"
          label={accountCopy.deleteAccount}
          onPress={() => router.push('/account/delete' as Href)}
          testID="account-delete"
        />
      </View>
      <Text wordSafe variant="fine">
        {accountCopy.sharedAccount}
      </Text>
    </>
  );
  return (
    <Section rule={false} testID="account-section">
      <Group>
        {account.notice ? (
          <Text wordSafe testID="account-notice">
            {account.notice}
          </Text>
        ) : null}
        {view.kind === 'checking' ? (
          <Text wordSafe testID="account-sheet-message">
            {accountCopy.checking}
          </Text>
        ) : view.kind === 'failed' ? (
          <ErrorState
            message={accountCopy.statusFailed}
            onRetry={() => void refreshAccount()}
            testID="account-sheet-message"
          />
        ) : view.kind === 'signedOut' ? (
          <>
            <Text wordSafe testID="account-sheet-message">
              {accountCopy.signedOut}
            </Text>
            <Button
              variant="primary"
              label={accountCopy.signInForVoice}
              onPress={() => router.push('/account/sign-in' as Href)}
              testID="account-sign-in-start"
            />
          </>
        ) : view.kind === 'unavailable' ? (
          <>
            <Text wordSafe testID="account-sheet-message">
              {accountCopy.unavailableAccount}
            </Text>
            {actions}
          </>
        ) : (
          <>
            <Group gap={rhythm.line}>
              <Text wordSafe testID="account-sheet-message">
                {view.email
                  ? accountCopy.signedInAs(view.email)
                  : accountCopy.signedInHere}
              </Text>
              <Text wordSafe variant="metadata" testID="account-voice-time">
                {view.status.unlimited
                  ? accountCopy.unlimited
                  : accountCopy.voiceTime(view.status.remainingSeconds)}
              </Text>
            </Group>
            {view.status.enabled ? null : (
              <Text wordSafe>{accountCopy.voiceOff}</Text>
            )}
            {actions}
          </>
        )}
      </Group>
    </Section>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
});
