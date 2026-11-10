import { RouteOptions } from '../../navigation/preview';
import { router } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { useRef, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { confirmAction } from '../../design/menu';
import {
  Button,
  ErrorState,
  Field,
  InsetGroup,
  LinkRow,
  Screen,
  Text,
} from '../../design/primitives';
import { useRowCellStyle } from '../../design/row-padding';
import { minimumTarget, rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import {
  deleteCodeRouteFor,
  signInRoute,
} from '../../navigation/routes/account';
import type { VoiceFailure } from '../../voice';
import * as voice from '../../voice';
import { clearAskConversations } from '../ask/store';
import { CODE_LENGTH, codeDigits } from './code';
import { accountCopy, deletionRefusal, refusalCopy } from './copy';
import { SettingsRow } from './parts';
import { ResendButton } from './ResendButton';
import { accountDeleted, sessionEnded } from './store';
import { issueChallenge, useCodeChallenge } from './useCodeChallenge';

/** Signed out or refused: deleting needs a new sign-in first (6.4). */
const needsSignIn = (failure: VoiceFailure) =>
  failure === 'signedOut' || failure === 'forbidden';
const signInAgain = () => router.push(signInRoute('account'));

function AndroidDeletionGuard({
  deleting,
  completed,
}: {
  deleting: boolean;
  completed: RefObject<boolean>;
}) {
  const navigation = useNavigation();
  // Covers the custom header as well as system and predictive Back.
  usePreventRemove(deleting, ({ data }) => {
    // Success returns to Account before React has committed the busy state.
    if (completed.current) navigation.dispatch(data.action);
  });
  return null;
}

/**
 * Delete account, step 1 (specs/account.md 6.2): what is deleted and kept,
 * then "Email me a deletion code". The back button is Cancel.
 */
export function DeleteIntro() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const inFlight = useRef(false);

  async function request() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const result = await voice.requestDeletionCode();
    inFlight.current = false;
    setBusy(false);
    if (!result.ok) {
      // The native core has already removed a token the Worker refused.
      if (needsSignIn(result.error)) {
        sessionEnded();
        setSignedOut(true);
      }
      return setError(deletionRefusal(result.error));
    }
    router.push(deleteCodeRouteFor(issueChallenge(result.value.challengeId)));
  }

  return (
    <Screen grouped testID="account-delete-screen">
      <Text wordSafe variant="body" testID="account-delete-confirm-step">
        {accountCopy.deleteLede}
      </Text>
      <InsetGroup header={accountCopy.deletedHeader}>
        {accountCopy.deletedRows.map((row) => (
          <PlainRow key={row} group={accountCopy.deletedHeader} text={row} />
        ))}
      </InsetGroup>
      <InsetGroup header={accountCopy.keptHeader}>
        {accountCopy.keptRows.map((row) => (
          <PlainRow key={row} group={accountCopy.keptHeader} text={row} />
        ))}
      </InsetGroup>
      <InsetGroup>
        <LinkRow
          title={accountCopy.deletionPolicy}
          external
          accessibilityHint={accountCopy.opensOnWeb}
          testID="account-deletion-policy"
          onPress={() =>
            void openOnWeb(
              '/privacy#privacy-deletion',
              accountCopy.deletionPolicy,
            )
          }
        />
      </InsetGroup>
      <View style={styles.action}>
        {signedOut ? (
          <Button
            variant="primary"
            size="large"
            fullWidth
            label={accountCopy.signInAgain}
            onPress={signInAgain}
            testID="account-deletion-sign-in"
          />
        ) : (
          <InsetGroup>
            <SettingsRow
              title={accountCopy.emailDeletionCode}
              tone="danger"
              busy={busy}
              onPress={() => void request()}
              testID="account-delete-confirm"
            />
          </InsetGroup>
        )}
        {error ? (
          <ErrorState message={error} testID="account-delete-error" />
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * Delete account, step 2 (6.3): the emailed code, then "Delete account" and
 * its confirmation. A full code hides the keyboard but never submits:
 * deleting needs a deliberate tap. On success Account shows signed out with
 * the deletion notice, and the back button can never return here (6.5).
 */
export function DeleteCode({
  challenge: initial,
}: {
  challenge: string | null;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'resend' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  // Signed out here, account not deleted: deleting needs a new sign-in.
  const [signedOut, setSignedOut] = useState(false);
  const inFlight = useRef(false);
  const completed = useRef(false);
  const challenge = useCodeChallenge(initial);

  function refused(failure: VoiceFailure) {
    // The native core has already removed a token the Worker refused.
    if (needsSignIn(failure)) {
      sessionEnded();
      setSignedOut(true);
    }
    setError(deletionRefusal(failure));
  }

  async function resend() {
    if (inFlight.current) return;
    Keyboard.dismiss();
    inFlight.current = true;
    setBusy('resend');
    setError(null);
    const result = await voice.requestDeletionCode();
    inFlight.current = false;
    setBusy(null);
    if (!result.ok) return refused(result.error);
    challenge.issued(result.value.challengeId);
    setCode('');
    setResent(true);
    AccessibilityInfo.announceForAccessibility(accountCopy.newDeletionCodeSent);
  }

  async function remove() {
    if (inFlight.current) return;
    if (code.length !== CODE_LENGTH)
      return setError(refusalCopy.codeIncomplete);
    // Same limits as sign-in, and the same answer as any refused code.
    if (!challenge.challenge || challenge.gate() !== 'open')
      return setError(refusalCopy.deletionCodeFailed);
    Keyboard.dismiss();
    inFlight.current = true;
    setBusy('delete');
    setError(null);
    challenge.tried();
    const result = await voice.deleteAccount(challenge.challenge.id, code);
    if (!result.ok && result.error === 'unavailable') {
      // A Worker outage leaves the session held. A credential-store fault on
      // this device signs it out without the Worker ever deleting anything;
      // a fresh status read tells the two apart.
      const status = await voice.status();
      if (status.ok && !status.value.signedIn && !status.value.accountHeld) {
        inFlight.current = false;
        setBusy(null);
        sessionEnded();
        setSignedOut(true);
        return setError(refusalCopy.deletionSignedOutHere);
      }
    }
    if (!result.ok) {
      inFlight.current = false;
      setBusy(null);
      return refused(result.error);
    }
    const cleared = await clearAskConversations().then(
      () => true,
      () => false,
    );
    challenge.clear();
    accountDeleted(cleared);
    completed.current = true;
    router.dismissTo('/account');
  }

  const confirm = () =>
    confirmAction(
      accountCopy.confirmDeleteTitle,
      [
        {
          title: accountCopy.deleteAccount,
          destructive: true,
          onPress: () => void remove(),
        },
      ],
      undefined,
      accountCopy.confirmDeleteMessage,
    );
  const deleting = busy === 'delete';

  return (
    <>
      {Platform.OS === 'android' ? (
        <AndroidDeletionGuard deleting={deleting} completed={completed} />
      ) : null}
      <RouteOptions
        // No swipe or back while the deletion request runs (1.1, 6.4).
        options={{ gestureEnabled: !deleting, headerBackVisible: !deleting }}
      />
      <Screen grouped testID="account-deletion-code-step">
        <View style={styles.group}>
          <Field
            grouped
            labelHidden
            label={accountCopy.deletionCode}
            value={code}
            onChangeText={(text) => {
              const digits = codeDigits(text);
              setCode(digits);
              setError(null);
              // A full code only hides the keyboard so the action is in view.
              if (digits.length === CODE_LENGTH) Keyboard.dismiss();
            }}
            testID="account-deletion-code"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
          />
          <Text
            wordSafe
            variant="footnote"
            tone="inkSoft"
            testID={
              resent ? 'account-deletion-notice' : 'account-deletion-code-sent'
            }
            style={styles.footer}
          >
            {resent
              ? accountCopy.newDeletionCodeSent
              : accountCopy.deletionCodeSent}
          </Text>
          {error ? (
            <ErrorState message={error} testID="account-deletion-code-error" />
          ) : null}
        </View>
        {signedOut ? (
          <Button
            variant="primary"
            size="large"
            fullWidth
            label={accountCopy.signInAgain}
            onPress={signInAgain}
            testID="account-deletion-sign-in"
          />
        ) : (
          <View style={styles.final}>
            <InsetGroup>
              <SettingsRow
                title={accountCopy.deleteAccount}
                tone="danger"
                busy={deleting}
                disabled={code.length !== CODE_LENGTH}
                accessibilityHint={accountCopy.confirmHint}
                onPress={confirm}
                testID="account-delete-final"
              />
            </InsetGroup>
            <ResendButton
              label={accountCopy.sendNewDeletionCode}
              countdown={accountCopy.sendNewDeletionCodeIn}
              wait={challenge.wait}
              busy={busy === 'resend'}
              onPress={() => void resend()}
              testID="account-deletion-resend"
            />
          </View>
        )}
      </Screen>
    </>
  );
}

/** A row that only says something; VoiceOver hears its group's header too. */
function PlainRow({ group, text }: { group: string; text: string }) {
  const cellStyle = useRowCellStyle();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${group}: ${text}`}
      style={[styles.row, cellStyle]}
    >
      <Text wordSafe variant="body">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { gap: rhythm.tight },
  group: { gap: rhythm.tight },
  final: { gap: rhythm.block },
  footer: { paddingHorizontal: rhythm.block },
  row: {
    minHeight: minimumTarget,
    justifyContent: 'center',
    paddingVertical: rhythm.row,
  },
});
