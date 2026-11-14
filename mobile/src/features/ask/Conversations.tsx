import { RouteOptions } from '../../navigation/preview';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  Button as SwiftButton,
  ContextMenu,
  Host,
  List,
  Section as SwiftSection,
  SwipeActions,
  Text as SwiftText,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  font,
  foregroundStyle,
  lineLimit,
  listStyle,
  refreshable,
} from '@expo/ui/swift-ui/modifiers';
import { thisDevice } from '../../design/device';
import { InsetGroup, Screen } from '../../design/layout';
import type { RowMenuAction } from '../../design/row-link';
import { LinkRow } from '../../design/rows';
import { ContentUnavailable, InlineError, Skeleton } from '../../design/states';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { closeSheetItem, headerItems, pageMenu } from '../../navigation/chrome';
import { useAccount } from '../account/store';
import {
  beginSync,
  canSync,
  invalidateSync,
  confirmDeleteAll,
  deleteConversation,
  inAccount,
  retryRemoteDelete,
  syncConversations,
} from './conversation-actions';
import { conversationMeta, groupByDate } from './conversation-dates';
import { askSession } from './session';
import { chatsSnapshot, loadChats, subscribeChats } from './store';
import type { Chat } from './model';

export const conversationsCopy = {
  title: 'Conversations',
  empty: 'No conversations yet',
  emptyBody: 'Questions you ask are saved here.',
  readFailed: 'Conversations couldn’t be read',
  remoteDeleteFailed: 'A conversation couldn’t be removed from your account.',
  deleteAll: 'Delete All Conversations',
  signIn: 'Sign in to keep them on your other devices',
  loading: 'Loading conversations',
  savedHere: (device: string) => `Saved on this ${device}.`,
  savedBoth: (device: string) =>
    `Saved on this ${device} and in your OPAX account.`,
  syncFailed: (device: string) =>
    `Saved on this ${device}. Your other devices aren't up to date yet.`,
} as const;

/**
 * Conversations (journeys/ask.md 4.11): saved conversations by date in the
 * device time zone, newest first. On iOS a SwiftUI List with a swipe and a
 * context menu Delete each (every row is plain text, so this page qualifies
 * for PLATFORM 6's list exception); elsewhere a React Native list with the
 * same Delete in each row's menu. No undo bar: Delete deletes. Delete all
 * sits in the bar's ⋯, confirmed, because it cannot be undone.
 *
 * `sheet`: the root of the modal page sheet opened from Ask's bar; a row
 * restores the conversation and closes the sheet. `account`: pushed from
 * Account › Ask; a row opens the conversation in the Ask tab.
 */
export default function Conversations({ mode }: { mode: 'sheet' | 'account' }) {
  const saved = useSyncExternalStore(
    subscribeChats,
    chatsSnapshot,
    chatsSnapshot,
  );
  const status = useAccount().status;
  const device = thisDevice();
  const [reading, setReading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [opening] = useState(() => canSync(status));
  const [syncing, setSyncing] = useState(opening);
  const [syncFailed, setSyncFailed] = useState(false);
  const [remoteFailed, setRemoteFailed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const read = useCallback(() => {
    setReading(true);
    setReadFailed(false);
    loadChats()
      .catch(() => setReadFailed(true))
      .finally(() => {
        setReading(false);
        setNow(Date.now());
      });
  }, []);
  // Syncs on open and on pull to refresh; `syncing` starts true on open.
  const pull = useCallback(() => {
    const current = beginSync();
    return syncConversations(current).then((result) => {
      if (!current()) return;
      setSyncing(false);
      setSyncFailed(result === 'failed');
      setNow(Date.now());
    });
  }, []);
  const sync = useCallback(async () => {
    if (!canSync(status)) return;
    setSyncing(true);
    setSyncFailed(false);
    await pull();
  }, [status, pull]);
  useEffect(() => {
    loadChats()
      .catch(() => setReadFailed(true))
      .finally(() => {
        setReading(false);
        setNow(Date.now());
      });
    if (opening) void pull();
    return invalidateSync;
    // Sync on open only; a later status change does not resync on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const remove = (id: string) => {
    invalidateSync();
    setSyncing(false);
    void deleteConversation(id, status).then((ok) =>
      setRemoteFailed(ok ? null : id),
    );
  };
  const open = (chat: Chat) => {
    // Not while an answer is being written: the sheet stays where it is.
    if (!askSession.open(chat.id)) return;
    if (mode === 'sheet') router.back();
    // Leaves the Account sheet for the conversation in the Ask tab.
    else router.navigate('/ask' as Href);
  };
  const signIn = () => router.push('/account/sign-in' as Href);
  const chats = saved.chats;
  const groups = groupByDate(chats, now);
  const footer = syncFailed
    ? conversationsCopy.syncFailed(device)
    : inAccount(status)
      ? conversationsCopy.savedBoth(device)
      : conversationsCopy.savedHere(device);
  const menu = chats.length
    ? [
        pageMenu({
          name: conversationsCopy.title,
          webPath: '/',
          items: [
            {
              title: conversationsCopy.deleteAll,
              symbol: 'trash',
              destructive: true,
              onPress: () => {
                invalidateSync();
                setSyncing(false);
                confirmDeleteAll(status, conversationsCopy.deleteAll);
              },
            },
          ],
        }),
      ]
    : [];
  const bar = (
    <RouteOptions
      options={{
        title: conversationsCopy.title,
        headerLargeTitleEnabled: false,
        ...headerItems(() =>
          mode === 'sheet' ? [...menu, closeSheetItem()] : menu,
        ),
      }}
    />
  );
  // Never "No conversations yet" before the read and the first sync finish.
  if (!chats.length && (reading || syncing))
    return (
      <Screen grouped testID="ask-history-screen">
        {bar}
        <Skeleton
          shape="rows"
          count={3}
          label={conversationsCopy.loading}
          onSunken
          testID="ask-history-loading"
        />
      </Screen>
    );
  if (!chats.length)
    return (
      <Screen grouped testID="ask-history-screen">
        {bar}
        {readFailed ? (
          <ContentUnavailable
            symbol="exclamationmark.triangle"
            title={conversationsCopy.readFailed}
            action={{ label: 'Try again', onPress: read }}
            testID="ask-history-read-failed"
          />
        ) : (
          <ContentUnavailable
            symbol="text.bubble"
            title={conversationsCopy.empty}
            body={conversationsCopy.emptyBody}
            testID="ask-history-empty"
          />
        )}
        <Footer text={footer} signIn={inAccount(status) ? undefined : signIn} />
      </Screen>
    );
  const failedLine = remoteFailed ? (
    <InlineError
      subject="conversation"
      message={conversationsCopy.remoteDeleteFailed}
      onRetry={() =>
        void retryRemoteDelete(remoteFailed).then((ok) => {
          if (ok) setRemoteFailed(null);
        })
      }
      testID="ask-history-remote-failed"
    />
  ) : null;
  let index = 0;
  if (Platform.OS === 'ios')
    return (
      <View style={styles.fill} testID="ask-history-screen">
        {bar}
        {failedLine ? <View style={styles.notice}>{failedLine}</View> : null}
        <Host style={styles.fill}>
          <List
            modifiers={[
              listStyle('insetGrouped'),
              ...(canSync(status) ? [refreshable(sync)] : []),
            ]}
          >
            {groups.map((group, g) => (
              <SwiftSection
                key={group.title}
                title={group.title}
                footer={
                  g === groups.length - 1 ? (
                    <SwiftText>{footer}</SwiftText>
                  ) : undefined
                }
              >
                {group.chats.map((chat) => {
                  const i = index++;
                  const row = (
                    <SwiftButton
                      onPress={() => open(chat)}
                      modifiers={[accessibilityIdentifier(`ask-restore-${i}`)]}
                    >
                      <VStack alignment="leading" spacing={2}>
                        <SwiftText
                          modifiers={[
                            lineLimit(2),
                            // Hierarchical styles inherit the native button tint.
                            foregroundStyle(colors.ink),
                          ]}
                        >
                          {chat.title}
                        </SwiftText>
                        <SwiftText
                          modifiers={[
                            font({ textStyle: 'subheadline' }),
                            foregroundStyle(colors.inkSoft),
                          ]}
                        >
                          {conversationMeta(chat, now)}
                        </SwiftText>
                      </VStack>
                    </SwiftButton>
                  );
                  return (
                    <SwipeActions key={chat.id}>
                      <ContextMenu>
                        <ContextMenu.Trigger>{row}</ContextMenu.Trigger>
                        <ContextMenu.Items>
                          <SwiftButton
                            role="destructive"
                            label="Delete"
                            systemImage="trash"
                            onPress={() => remove(chat.id)}
                          />
                        </ContextMenu.Items>
                      </ContextMenu>
                      <SwipeActions.Actions edge="trailing">
                        <SwiftButton
                          role="destructive"
                          label="Delete"
                          systemImage="trash"
                          onPress={() => remove(chat.id)}
                        />
                      </SwipeActions.Actions>
                    </SwipeActions>
                  );
                })}
              </SwiftSection>
            ))}
            {inAccount(status) ? null : (
              <SwiftSection>
                <SwiftButton
                  label={conversationsCopy.signIn}
                  onPress={signIn}
                  modifiers={[accessibilityIdentifier('ask-history-sign-in')]}
                />
              </SwiftSection>
            )}
          </List>
        </Host>
      </View>
    );
  return (
    <Screen
      grouped
      testID="ask-history-screen"
      refreshControl={
        canSync(status) ? (
          <RefreshControl
            refreshing={syncing && !!chats.length}
            onRefresh={() => void sync()}
          />
        ) : undefined
      }
    >
      {bar}
      {failedLine}
      {groups.map((group) => (
        <InsetGroup key={group.title} header={group.title}>
          {group.chats.map((chat) => {
            const i = index++;
            const menuRows: RowMenuAction[] = [
              {
                title: 'Delete',
                symbol: 'trash',
                destructive: true,
                onPress: () => remove(chat.id),
              },
            ];
            return (
              <LinkRow
                key={chat.id}
                title={chat.title}
                detail={conversationMeta(chat, now)}
                onPress={() => open(chat)}
                menu={menuRows}
                testID={`ask-restore-${i}`}
              />
            );
          })}
        </InsetGroup>
      ))}
      <Footer text={footer} signIn={inAccount(status) ? undefined : signIn} />
    </Screen>
  );
}

function Footer({ text, signIn }: { text: string; signIn?: () => void }) {
  return (
    <View style={styles.footer}>
      <Text
        wordSafe
        variant="footnote"
        tone="inkSoft"
        testID="ask-history-footer"
      >
        {text}
      </Text>
      {signIn ? (
        <InsetGroup>
          <LinkRow
            title={conversationsCopy.signIn}
            accessory="none"
            onPress={signIn}
            testID="ask-history-sign-in"
          />
        </InsetGroup>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.sunken },
  notice: { paddingHorizontal: rhythm.screen, paddingTop: rhythm.group },
  footer: { gap: rhythm.group },
});
