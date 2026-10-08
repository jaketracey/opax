import { phoneCopy } from '../../design/phone-copy';
import {
  Platform,
  AccessibilityInfo,
  Alert,
  Keyboard,
  StyleSheet,
  View,
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { headerItems, rootHeaderItems } from '../../navigation/chrome';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  Button,
  IconButton,
  EmptyState,
  ErrorState,
  Composer,
  FilterChip,
  Group,
  Heading,
  LoadingState,
  KeyboardStableScreen,
  Section,
  Text,
  Disclosure,
  LinkRow,
  RowList,
} from '../../design/primitives';
import { layout, rhythm, spacing } from '../../design/tokens';
import { useReduceMotion } from '../../design/accessibility';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { AskProgress } from './AskProgress';
import { AskSheet } from './AskSheet';
import { accountSnapshot, useAccount } from '../account/store';
import { AnswerView } from './AnswerView';
import { Builder } from './QuestionBuilder';
import { Options, topics } from './Options';
import {
  chips,
  clearChip,
  defaultOptions,
  sampleQuestions,
  type Followup,
} from './model';
import { askSession } from './session';
import {
  chatsSnapshot,
  loadChats,
  saveChats,
  subscribeChats,
  subscribeChatDeletion,
  clearAskConversations,
} from './store';
import {
  ChatSyncError,
  deleteRemoteChat,
  reconcileChats,
  deleteAllRemoteChats,
} from './sync';
const slugOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’‘ʼ`.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
export default function AskScreen() {
  const s = useSyncExternalStore(
      askSession.subscribe,
      askSession.snapshot,
      askSession.snapshot,
    ),
    saved = useSyncExternalStore(subscribeChats, chatsSnapshot, chatsSnapshot),
    account = useAccount();
  const headerBottom = useHeaderBottom(),
    { height: windowHeight } = useWindowDimensions(),
    reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{
    question?: string;
    entry?: string;
    speaker?: string;
    kind?: string;
    party?: string;
    state?: string;
    topic?: string;
    from?: string;
    to?: string;
  }>();
  const [draft, setDraft] = useState(''),
    [editingFollowup, setEditingFollowup] = useState(false),
    [builderOpen, setBuilderOpen] = useState(false),
    [optionsOpen, setOptionsOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [people, setPeople] = useState<Map<string, string>>(new Map()),
    [bills, setBills] = useState<string[]>([]),
    [namesBusy, setNamesBusy] = useState(false),
    [namesError, setNamesError] = useState(''),
    [inputError, setInputError] = useState(''),
    [syncBusy, setSyncBusy] = useState(false),
    [syncNotice, setSyncNotice] = useState(''),
    [accountSynced, setAccountSynced] = useState(false),
    [retryQuestion, setRetryQuestion] = useState('');
  const scroll = useRef<ScrollView>(null),
    submitTarget = useRef<View>(null),
    followupTarget = useRef<View>(null),
    entry = useRef<string | undefined>(undefined),
    lastStage = useRef<string | null>(null),
    lastAnswer = useRef<object | null>(null),
    turnY = useRef(0),
    pinTurn = useRef(false),
    syncVersion = useRef(0),
    namesLoaded = useRef(false);
  // The scroll view runs under the native header: content y 0 sits behind the
  // bar, and the top at rest is minus the header's height.
  function scrollToTop() {
    scroll.current?.scrollTo({ y: -headerBottom, animated: false });
  }
  // Bring the current turn (the question as asked, then its stages, answer or
  // error) to just below the header. It runs from the turn's own layout, once
  // the submitted question has been laid out, never from a stale position.
  function revealTurn() {
    if (!pinTurn.current) return;
    pinTurn.current = false;
    scroll.current?.scrollTo({
      y: Math.max(turnY.current - headerBottom - rhythm.heading, -headerBottom),
      animated: !reduceMotion,
    });
  }
  function pinCurrentTurn() {
    pinTurn.current = true;
    // The turn's onLayout normally reveals it; this covers a turn whose frame
    // did not change. Two frames on, the layout has been committed.
    requestAnimationFrame(() => requestAnimationFrame(revealTurn));
  }
  useEffect(
    () =>
      subscribeChatDeletion(() => {
        syncVersion.current++;
        setAccountSynced(false);
      }),
    [],
  );
  useEffect(() => {
    void loadChats()
      .then(() => {
        const active = chatsSnapshot().active;
        if (!entry.current && active && !askSession.snapshot().thread.length)
          askSession.open(active);
      })
      .catch(() => setSyncNotice('Saved conversations could not be read.'));
  }, []);
  useEffect(() => {
    if (!params.entry || params.entry === entry.current) return;
    entry.current = params.entry;
    const o = { ...defaultOptions };
    for (const k of [
      'speaker',
      'party',
      'state',
      'topic',
      'from',
      'to',
    ] as const)
      if (params[k]) o[k] = params[k]!;
    o.kind = params.kind === 'speech' ? 'speech' : 'all';
    askSession.start(o);
    setDraft(params.question || '');
    setInputError('');
    setBuilderOpen(false);
    setEditingFollowup(false);
    requestAnimationFrame(scrollToTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => {
    if (s.stage && s.stage !== lastStage.current) {
      lastStage.current = s.stage;
      AccessibilityInfo.announceForAccessibilityWithOptions(s.stage, {
        queue: true,
      });
    }
    if (!s.stage) lastStage.current = null;
  }, [s.stage]);
  useEffect(() => {
    if (s.error) pinCurrentTurn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.error]);
  const answer = s.thread.filter((m) => m.role === 'answer').at(-1);
  useEffect(() => {
    if (answer && answer !== lastAnswer.current) {
      lastAnswer.current = answer;
      AccessibilityInfo.announceForAccessibilityWithOptions('Answer ready.', {
        queue: true,
      });
      void loadNames();
    } // Streaming text has no live-region announcements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);
  async function loadNames() {
    if (namesBusy || namesLoaded.current) return;
    setNamesBusy(true);
    setNamesError('');
    try {
      const [roster, slugs, index] = await Promise.all([
        catalogs.roster(),
        catalogs.slugs(),
        catalogs.bills(),
      ]);
      const known = new Map<string, string>();
      for (const p of roster.data.people) {
        const slug =
          Object.entries(slugs.data.slugs).find(
            ([, name]) => name === p.name,
          )?.[0] || slugOf(p.name);
        known.set(p.name, slug);
      }
      setPeople(known);
      setBills(
        index.data.bills
          .filter(
            (b) => b.jurisdiction === 'federal' && Number(b.parliament) >= 47,
          )
          .map((b) => b.short_title || b.title),
      );
      namesLoaded.current = true;
    } catch {
      setNamesError('Names from the record could not be loaded. Try again.');
    } finally {
      setNamesBusy(false);
    }
  }
  async function submit(question = draft, carry?: Followup) {
    if (s.busy || !question.trim()) return;
    setInputError('');
    if (s.options.speaker) {
      try {
        const roster = await catalogs.roster();
        if (!roster.data.people.some((p) => p.name === s.options.speaker)) {
          setInputError(
            'Choose a speaker from the parliamentarian roster in Options.',
          );
          return;
        }
      } catch {
        setInputError(
          'The parliamentarian roster could not be checked. Try again when you are online.',
        );
        return;
      }
    }
    Keyboard.dismiss();
    setRetryQuestion(question);
    setDraft('');
    setBuilderOpen(false);
    const promise = askSession.submit(question, carry);
    pinCurrentTurn();
    await promise;
  }
  async function history() {
    setHistoryOpen(true);
    const status = accountSnapshot().status;
    if (
      Platform.OS !== 'android' &&
      (!status || status.signedIn || status.accountHeld)
    )
      await sync();
  }
  async function sync() {
    if (syncBusy) return;
    const mine = ++syncVersion.current;
    setSyncBusy(true);
    setSyncNotice('');
    try {
      const next = await reconcileChats(
        chatsSnapshot(),
        () => mine === syncVersion.current,
      );
      if (mine !== syncVersion.current) return;
      await saveChats(next);
      setAccountSynced(true);
      if (askSession.snapshot().id) askSession.open(askSession.snapshot().id!);
      setSyncNotice(phoneCopy('Saved to your account and on this iPhone.'));
    } catch (e) {
      if (e instanceof ChatSyncError && e.code === 'signed-out') {
        setAccountSynced(false);
        if (!accountSnapshot().status) {
          setSyncNotice('');
          return;
        }
      }
      setSyncNotice(
        e instanceof Error ? e.message : 'Account sync could not complete.',
      );
    } finally {
      setSyncBusy(false);
    }
  }
  async function remove(id: string) {
    syncVersion.current++;
    const store = chatsSnapshot();
    await saveChats({
      ...store,
      active: store.active === id ? null : store.active,
      chats: store.chats.filter((c) => c.id !== id),
    }).catch(() =>
      setSyncNotice(
        phoneCopy('This conversation could not be deleted from this iPhone.'),
      ),
    );
    if (s.id === id) askSession.start();
    if (communityAccount)
      await deleteRemoteChat(id).catch(() =>
        setSyncNotice(
          phoneCopy(
            'Deleted on this iPhone. Account deletion could not complete.',
          ),
        ),
      );
  }
  function removeAll() {
    Alert.alert(
      'Delete all conversations?',
      Platform.OS === 'android'
        ? 'This removes your saved conversations on this phone.'
        : 'This removes your saved conversations on this iPhone and, when signed in, from your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              syncVersion.current++;
              askSession.start();
              try {
                await clearAskConversations();
                if (communityAccount) await deleteAllRemoteChats();
              } catch {
                setSyncNotice('Account sync could not complete. Try again.');
              }
            })();
          },
        },
      ],
    );
  }
  const names = [...people.keys()].sort((a, b) => a.localeCompare(b));
  // The current turn starts at the last question. A failed question has
  // already left the thread, so it is shown from the retry copy instead.
  const failed = !!s.error && s.error.code !== 'empty',
    lastQuestion = s.thread.map((m) => m.role).lastIndexOf('user'),
    split = failed || lastQuestion < 0 ? s.thread.length : lastQuestion,
    earlier = s.thread.slice(0, split),
    current = s.thread.slice(split);
  function renderTurn(turn: (typeof s.thread)[number], i: number) {
    return turn.role === 'user' ? (
      <Group key={i}>
        <Heading level={2} testID="ask-user-question">
          {turn.text}
        </Heading>
        {turn.askedAs ? (
          <Text wordSafe variant="metadata" testID="ask-understood">
            Understood as: {turn.askedAs}
          </Text>
        ) : null}
      </Group>
    ) : (
      <AnswerView
        key={i}
        turn={turn}
        question={s.thread[i - 1]!}
        people={people}
      />
    );
  }
  const communityAccount = account.status
    ? !!(account.status.signedIn || account.status.accountHeld)
    : accountSynced;
  return (
    <>
      <Stack.Screen
        options={{ title: 'Ask', ...headerItems(rootHeaderItems) }}
      />
      <KeyboardStableScreen
        testID="ask-screen"
        scrollRef={scroll}
        keyboardTarget={editingFollowup ? followupTarget : submitTarget}
      >
        <Group gap={rhythm.heading}>
          <Composer
            ref={submitTarget}
            label="Your question"
            submitLabel="Ask the record"
            placeholder="Ask a question about the public record…"
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setEditingFollowup(false)}
            onSubmit={() => void submit()}
            busy={s.busy}
            maxLength={2000}
            testID="ask-question"
            submitTestID="ask-submit"
          />
          {inputError ? <ErrorState message={inputError} /> : null}
          <RowList>
            <LinkRow
              title="Options"
              disabled={s.busy}
              onPress={() => {
                void loadNames();
                setOptionsOpen(true);
              }}
              testID="ask-options"
            />
            <LinkRow
              title="Your conversations"
              value={String(saved.chats.length)}
              disabled={s.busy}
              onPress={() => void history()}
              testID="ask-saved"
            />
          </RowList>
          {chips(s.options).map((c) => (
            <FilterChip
              key={c.id}
              filter={c.key.toLowerCase()}
              value={c.id === 'topic' ? topics[c.value] || c.value : c.value}
              onRemove={() => askSession.options(clearChip(s.options, c.id))}
              testID={`ask-chip-${c.id}`}
            />
          ))}
          {chips(s.options).length > 1 ? (
            <Button
              label="Clear all"
              onPress={() => askSession.options({ ...defaultOptions })}
            />
          ) : null}
          {s.thread.length ? (
            <Button
              label="Start a new conversation"
              variant="quiet"
              disabled={s.busy}
              onPress={() => {
                askSession.start();
                setDraft('');
                scrollToTop();
              }}
              testID="ask-new"
            />
          ) : null}
        </Group>
        {!s.thread.length && !s.busy && !s.error ? (
          <Group gap={rhythm.heading}>
            <RowList>
              {sampleQuestions.map((q, i) => (
                <LinkRow
                  key={q}
                  title={q}
                  onPress={() => void submit(q)}
                  testID={`ask-sample-${i}`}
                />
              ))}
              <Disclosure
                label="Build a question"
                icon="text.badge.plus"
                accent="people"
                open={builderOpen}
                onToggle={(open) => {
                  if (open) void loadNames();
                  setBuilderOpen(open);
                }}
                testID="ask-builder-toggle"
              >
                <Group>
                  {namesBusy ? (
                    <LoadingState label="Loading names from the record" />
                  ) : null}
                  {namesError ? (
                    <ErrorState
                      message={namesError}
                      onRetry={() => void loadNames()}
                    />
                  ) : null}
                  <Builder
                    people={names}
                    bills={bills}
                    onSubmit={(q) => void submit(q)}
                    busy={s.busy}
                  />
                </Group>
              </Disclosure>
            </RowList>
          </Group>
        ) : null}
        {earlier.map((turn, i) => renderTurn(turn, i))}
        {current.length || s.busy || s.error || s.notice ? (
          <View
            testID="ask-turn"
            style={[
              styles.turn,
              s.thread.length || s.busy || s.error
                ? {
                    // Room below the turn for it to sit under the header
                    // whatever the answer's length, so the reveal never
                    // scrolls past the end of the content.
                    minHeight: Math.max(
                      0,
                      windowHeight - headerBottom - rhythm.heading - spacing.s7,
                    ),
                  }
                : null,
            ]}
            onLayout={(e: LayoutChangeEvent) => {
              turnY.current = e.nativeEvent.layout.y;
              revealTurn();
            }}
          >
            {current.map((turn, i) => renderTurn(turn, split + i))}
            {failed && retryQuestion ? (
              <Heading level={2} testID="ask-failed-question">
                {retryQuestion}
              </Heading>
            ) : null}
            {s.busy ? (
              <AskProgress
                stage={s.stage}
                reading={s.reading}
                streaming={s.streaming}
                onCancel={() => askSession.cancel()}
              />
            ) : null}
            {s.error ? (
              <Group testID={`ask-error-${s.error.code}`}>
                <ErrorState
                  message={
                    s.error.code === 'partial' && s.streaming
                      ? `${s.error.message} This is an incomplete answer.`
                      : s.error.message
                  }
                />
                {s.streaming ? (
                  <Text wordSafe selectable>
                    {s.streaming}
                  </Text>
                ) : null}
                <Button
                  label="Try again"
                  icon="arrow.clockwise"
                  onPress={() => void submit(retryQuestion)}
                  testID="ask-retry"
                />
              </Group>
            ) : null}
            {s.notice ? <Text wordSafe>{s.notice}</Text> : null}
            {answer && !s.busy ? (
              <Section title="Ask next" accent="people" testID="ask-followups">
                <RowList>
                  {answer.next?.map((next, i) => (
                    <LinkRow
                      key={next.question}
                      title={next.question}
                      onPress={() => void submit(next.question, next)}
                      testID={`ask-followup-${i}`}
                    />
                  ))}
                </RowList>
                <Composer
                  ref={followupTarget}
                  label="Ask a follow-up"
                  submitLabel="Ask"
                  placeholder="Ask a follow-up…"
                  value={draft}
                  onChangeText={setDraft}
                  onFocus={() => setEditingFollowup(true)}
                  onSubmit={() => void submit()}
                  maxLength={2000}
                  testID="ask-followup-field"
                  submitTestID="ask-followup-submit"
                />
              </Section>
            ) : null}
          </View>
        ) : null}
      </KeyboardStableScreen>
      {optionsOpen ? (
        <Options
          value={s.options}
          people={names}
          onDone={(o) => {
            askSession.options(o);
            setOptionsOpen(false);
          }}
          onCancel={() => setOptionsOpen(false)}
        />
      ) : null}
      {historyOpen ? (
        <AskSheet
          title="Your conversations"
          onDone={() => setHistoryOpen(false)}
          testID="ask-history-screen"
          doneID="ask-history-done"
        >
          <Text wordSafe variant="caption">
            {communityAccount
              ? phoneCopy('Saved on this iPhone.')
              : Platform.OS === 'android'
                ? 'Saved on this phone.'
                : phoneCopy(
                    'Saved on this iPhone. Sign in to keep them across devices.',
                  )}
          </Text>
          {!saved.chats.length ? (
            <EmptyState message="No saved conversations." />
          ) : null}
          {saved.chats.map((c, i) => {
            const questions = c.thread.filter((m) => m.role === 'user').length;
            return (
              <View key={c.id} style={styles.conversation}>
                <View style={styles.conversationTitle}>
                  <LinkRow
                    title={c.title}
                    detail={`${questions} question${questions === 1 ? '' : 's'}`}
                    icon="bubble.left.and.bubble.right"
                    accent="people"
                    onPress={() => {
                      askSession.open(c.id);
                      setHistoryOpen(false);
                      pinCurrentTurn();
                    }}
                    testID={`ask-restore-${i}`}
                  />
                </View>
                <IconButton
                  symbol="trash"
                  accessibilityLabel={`Delete conversation: ${c.title}`}
                  onPress={() => void remove(c.id)}
                  testID={`ask-delete-${i}`}
                />
              </View>
            );
          })}
          {syncNotice ? (
            <Text wordSafe testID="ask-sync-notice">
              {syncNotice}
            </Text>
          ) : null}
          {communityAccount ? (
            <Button
              label="Sync conversations"
              loading={syncBusy}
              onPress={() => void sync()}
            />
          ) : null}
          <Button
            label="Delete all conversations"
            variant="danger"
            disabled={!saved.chats.length}
            onPress={removeAll}
            testID="ask-delete-all"
          />
        </AskSheet>
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  conversation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  conversationTitle: { flex: 1 },
  turn: { gap: layout.sectionGap },
});
