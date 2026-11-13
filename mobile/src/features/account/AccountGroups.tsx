import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from '../../design/accessibility';
import {
  Icon,
  InlineError,
  InsetGroup,
  RowLink,
  Skeleton,
  Text,
} from '../../design/primitives';
import {
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../design/row-padding';
import { symbols } from '../../design/symbols';
import { minimumTarget, rhythm } from '../../design/tokens';
import type { VoiceStatus } from '../../voice';
import { voiceLinked } from '../../voice/linked';
import { clearAskConversations } from '../ask/store';
import { readConsent } from '../talk/bridge';
import { voiceTime, voiceTimeSpoken } from '../talk/model';
import { accountCopy } from './copy';
import { closeSheetThen, SettingsRow } from './parts';
import {
  accountView,
  clearNotice,
  localChatsCleared,
  noticeText,
  refreshAccount,
  signOut,
  useAccount,
  type AccountNotice,
} from './store';

/**
 * Groups 1 to 3 of the Account sheet (specs/account.md 2.2 and 2.5): who is
 * signed in and what the account gives, then Sign out, then Delete account
 * alone at the foot. Opening the sheet reads status only: no microphone,
 * audio or reservation. Nothing here is tracked.
 */
export function AccountGroups() {
  const account = useAccount();
  const view = accountView(account);
  const [leaving, setLeaving] = useState(false);
  const [consent, setConsent] = useState<boolean | null>(null);
  useEffect(() => {
    void refreshAccount();
    return clearNotice;
  }, []);
  // The consent value is a local read, again each time Account is shown
  // (the reader may have withdrawn it on the Voice consent page).
  useFocusEffect(
    useCallback(() => {
      let current = true;
      void readConsent().then((given) => {
        if (current) setConsent(given);
      });
      return () => {
        current = false;
      };
    }, []),
  );
  useEffect(() => {
    if (account.notice)
      AccessibilityInfo.announceForAccessibility(noticeText(account.notice));
  }, [account.notice]);

  const leave = async () => {
    setLeaving(true);
    await signOut();
    setLeaving(false);
  };
  const email =
    view.kind === 'signedIn' ||
    view.kind === 'unavailable' ||
    view.kind === 'checking' ||
    view.kind === 'failed'
      ? view.email
      : null;
  // Sign-out and deletion never wait for the status read (2.5).
  const held =
    view.kind === 'signedIn' || view.kind === 'unavailable' || email !== null;
  const notice = account.notice ? (
    <Notice notice={account.notice} />
  ) : undefined;

  let identity;
  if (view.kind === 'signedOut')
    identity = (
      <InsetGroup footer={notice}>
        <SignInRow />
      </InsetGroup>
    );
  else if (view.kind === 'checking' && email === null)
    identity = (
      <InsetGroup footer={notice}>
        <Skeleton shape="people" count={1} label={accountCopy.loading} />
      </InsetGroup>
    );
  else if (view.kind === 'failed' && email === null)
    identity = (
      <View>
        <StatusError offline={view.offline} />
        {notice}
      </View>
    );
  else {
    const status = view.kind === 'signedIn' ? view.status : null;
    identity = (
      <InsetGroup footer={notice ?? identityFooter(view.kind, status)}>
        <IdentityRow email={email} />
        {view.kind === 'checking' ? (
          <Skeleton count={voiceLinked ? 2 : 1} label={accountCopy.loading} />
        ) : null}
        {view.kind === 'failed' ? <StatusError offline={view.offline} /> : null}
        {status && voiceLinked ? (
          <SettingsRow
            title={accountCopy.talk}
            value={status.enabled ? voiceTime(status) : accountCopy.paused}
            valueSpoken={
              status.enabled ? voiceTimeSpoken(status) : accountCopy.paused
            }
            // Talk opens as its own sheet once Account has gone (2.7).
            onPress={() => closeSheetThen(() => router.push('/talk'))}
            testID="account-talk"
          />
        ) : null}
        {status && voiceLinked ? (
          <SettingsRow
            title={accountCopy.voiceConsent}
            value={
              consent === null
                ? undefined
                : consent
                  ? accountCopy.consentGiven
                  : accountCopy.consentNotGiven
            }
            href="/account/consent"
            testID="account-consent"
          />
        ) : null}
      </InsetGroup>
    );
  }

  return (
    <View style={styles.groups} testID="account-section">
      {identity}
      {held ? (
        <InsetGroup>
          <SettingsRow
            title={accountCopy.signOut}
            busy={leaving}
            onPress={() => void leave()}
            testID="account-sign-out"
          />
        </InsetGroup>
      ) : null}
      {held ? (
        <InsetGroup>
          <SettingsRow
            title={accountCopy.deleteAccount}
            tone="danger"
            disabled={leaving}
            accessibilityHint={accountCopy.confirmHint}
            onPress={() => router.push('/account/delete')}
            testID="account-delete"
          />
        </InsetGroup>
      ) : null}
    </View>
  );
}

function identityFooter(
  kind: ReturnType<typeof accountView>['kind'],
  status: VoiceStatus | null,
): string | undefined {
  if (kind === 'unavailable') return accountCopy.unavailableFooter;
  if (!status || !voiceLinked) return undefined;
  if (!status.enabled) return accountCopy.voiceOffFooter;
  if (status.unlimited) return accountCopy.unlimitedFooter;
  return undefined;
}

/** "Your account couldn't be checked." with Try again (2.5). */
function StatusError({ offline }: { offline: boolean }) {
  return (
    <InlineError
      subject="your account"
      message={offline ? accountCopy.statusOffline : accountCopy.statusFailed}
      onRetry={() => void refreshAccount()}
      testID="account-sheet-message"
    />
  );
}

/** Group 1's footer while a notice shows: news, in ink, with a checkmark. */
function Notice({ notice }: { notice: AccountNotice }) {
  if (notice === 'localChatsError')
    return (
      <InlineError
        subject="conversations"
        message={accountCopy.localChatsError}
        onRetry={() =>
          void clearAskConversations()
            .then(localChatsCleared)
            .catch(() => undefined)
        }
        testID="account-local-chats-error"
      />
    );
  return (
    <View style={styles.notice}>
      <Icon name={symbols.following} size={15} tone="inkSoft" />
      <Text
        wordSafe
        variant="footnote"
        tone="ink"
        style={styles.grow}
        testID="account-notice"
      >
        {noticeText(notice)}
      </Text>
    </View>
  );
}

const SYMBOL = 44;

/** The text's inset: beside the symbol, or under it at AX sizes (2.5). */
const textInset = (stacked: boolean) =>
  stacked ? 16 : 16 + SYMBOL + rhythm.tight;

/**
 * Signed in: the address beside the person symbol, or at AX sizes the
 * symbol above the address, which wraps (2.5); not a link.
 */
function IdentityRow({ email }: { email: string | null }) {
  const cellStyle = useRowCellStyle();
  const stacked = useAccessibilitySize();
  useRowInset(textInset(stacked));
  return (
    <View
      accessible
      accessibilityLabel={email ?? accountCopy.signedInHere}
      testID="account-identity"
      style={[styles.identity, stacked ? styles.stacked : null, cellStyle]}
    >
      <Icon name={symbols.accountOn} size={SYMBOL} maxScale={1} tone="navy" />
      <Text
        wordSafe={email === null}
        variant="name"
        style={stacked ? null : styles.grow}
      >
        {email ?? accountCopy.signedInHere}
      </Text>
    </View>
  );
}

/** Signed out: the sheet's one primary path, drawn as a row (2.2). */
function SignInRow() {
  const cellStyle = useRowCellStyle();
  const highlight = useRowHighlight();
  const stacked = useAccessibilitySize();
  useRowInset(textInset(stacked));
  return (
    <RowLink href="/account/sign-in" preview={false}>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={`${accountCopy.signIn}, ${accountCopy.signInDetail}`}
        testID="account-sign-in-start"
        onPress={() => router.push('/account/sign-in')}
        style={({ pressed }) => [
          styles.identity,
          cellStyle,
          pressed ? { backgroundColor: highlight } : null,
        ]}
      >
        {/* At AX sizes the symbol sits above the text; the chevron stays. */}
        <View
          testID="account-sign-in-lead"
          style={stacked ? styles.lead : styles.leadInline}
        >
          <Icon
            name={symbols.accountOn}
            size={SYMBOL}
            maxScale={1}
            tone="inkFaint"
            type="hierarchical"
          />
          <View style={stacked ? styles.titlesStacked : styles.titles}>
            <Text wordSafe variant="name">
              {accountCopy.signIn}
            </Text>
            <Text wordSafe variant="secondary">
              {accountCopy.signInDetail}
            </Text>
          </View>
        </View>
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      </Pressable>
    </RowLink>
  );
}

const styles = StyleSheet.create({
  groups: { gap: rhythm.section },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  lead: { flex: 1, alignItems: 'flex-start', gap: rhythm.tight },
  leadInline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  titles: { flex: 1, gap: rhythm.line },
  titlesStacked: { gap: rhythm.line },
  grow: { flex: 1 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: rhythm.tight },
});
