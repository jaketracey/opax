import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Keyboard,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  FilterChip,
  Group,
  Heading,
  LoadingState,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { colors } from '../../design/tokens';
import { rootHeaderItems } from '../../navigation/chrome';
import { useAccount } from '../account/store';
import { AnswerView, machineNote } from './AnswerView';
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
import { deleteRemoteChat, reconcileChats, deleteAllRemoteChats } from './sync';
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
    [retryQuestion, setRetryQuestion] = useState('');
  const scroll = useRef<ScrollView>(null),
    entry = useRef<string | undefined>(undefined),
    lastStage = useRef<string | null>(null),
    lastAnswer = useRef<object | null>(null),
    answerY = useRef(0),
    syncVersion = useRef(0);
  useEffect(
    () =>
      subscribeChatDeletion(() => {
        syncVersion.current++;
      }),
    [],
  );
  useEffect(() => {
    void loadChats()
      .then(() => {
        const active = chatsSnapshot().active;
        if (active && !askSession.snapshot().thread.length)
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
    if (namesBusy || people.size) return;
    setNamesBusy(true);
    setNamesError('');
    try {
      const roster = await catalogs.roster(),
        slugs = await catalogs.slugs();
      const known = new Map<string, string>();
      for (const p of roster.data.people) {
        const slug =
          Object.entries(slugs.data.slugs).find(
            ([, name]) => name === p.name,
          )?.[0] || slugOf(p.name);
        known.set(p.name, slug);
      }
      setPeople(known);
      const index = await catalogs.bills();
      setBills(
        index.data.bills
          .filter(
            (b) => b.jurisdiction === 'federal' && Number(b.parliament) >= 47,
          )
          .map((b) => b.short_title || b.title),
      );
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
    requestAnimationFrame(() =>
      scroll.current?.scrollTo({ y: answerY.current, animated: false }),
    );
    await promise;
  }
  async function history() {
    setHistoryOpen(true);
    if (account.status?.signedIn) await sync();
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
      if (askSession.snapshot().id) askSession.open(askSession.snapshot().id!);
      setSyncNotice('Saved to your account and on this iPhone.');
    } catch (e) {
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
      setSyncNotice('This conversation could not be deleted from this iPhone.'),
    );
    if (s.id === id) askSession.start();
    if (account.status?.signedIn)
      await deleteRemoteChat(id).catch(() =>
        setSyncNotice(
          'Deleted on this iPhone. Account deletion could not complete.',
        ),
      );
  }
  function removeAll() {
    Alert.alert(
      'Delete all conversations?',
      'This removes your saved conversations on this iPhone and, when signed in, from your account.',
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
                if (account.status?.signedIn) await deleteAllRemoteChats();
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
  return (
    <>
      <Stack.Screen
        options={{ title: 'Ask', unstable_headerRightItems: rootHeaderItems }}
      />
      <Screen testID="ask-screen" scrollRef={scroll}>
        <Group>
          <Field
            label="Your question"
            placeholder="Ask a question about the public record…"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            testID="ask-question"
          />
          {inputError ? <ErrorState message={inputError} /> : null}
          <Button
            label="Ask the record"
            variant="primary"
            disabled={!draft.trim()}
            loading={s.busy}
            onPress={() => void submit()}
            testID="ask-submit"
          />
          <Button
            label="Options"
            disabled={s.busy}
            onPress={() => {
              void loadNames();
              setOptionsOpen(true);
            }}
            testID="ask-options"
          />
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
          <Button
            label={`Your conversations (${saved.chats.length})`}
            disabled={s.busy}
            onPress={() => void history()}
            testID="ask-saved"
          />
          {s.thread.length ? (
            <Button
              label="Start a new conversation"
              disabled={s.busy}
              onPress={() => {
                askSession.start();
                setDraft('');
                scroll.current?.scrollTo({ y: 0, animated: false });
              }}
              testID="ask-new"
            />
          ) : null}
        </Group>
        {!s.thread.length && !s.busy ? (
          <Group>
            {sampleQuestions.map((q, i) => (
              <Button
                key={q}
                label={q}
                variant="quiet"
                onPress={() => void submit(q)}
                testID={`ask-sample-${i}`}
              />
            ))}
            <Button
              label="Build a question"
              expanded={builderOpen}
              onPress={() => {
                void loadNames();
                setBuilderOpen(!builderOpen);
              }}
              testID="ask-builder-toggle"
            />
            {builderOpen ? (
              <>
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
              </>
            ) : null}
          </Group>
        ) : null}
        {s.thread.map((turn, i) =>
          turn.role === 'user' ? (
            <Group
              key={i}
              onLayout={(e) => {
                if (i === s.thread.length - 1 || i === s.thread.length - 2)
                  answerY.current = e.nativeEvent.layout.y;
              }}
            >
              <Heading level={2} testID="ask-user-question">
                {turn.text}
              </Heading>
              {turn.askedAs ? (
                <Text variant="metadata" testID="ask-understood">
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
          ),
        )}
        {s.busy ? (
          <Group testID="ask-progress">
            {[
              'Reading your question',
              'Searching the record',
              'Writing the answer',
            ].map((label, i) => {
              const active =
                s.stage === 'Reading your question'
                  ? 0
                  : s.stage === 'Searching the record'
                    ? 1
                    : 2;
              return (
                <Text
                  key={label}
                  variant={i === active ? 'strong' : 'metadata'}
                >
                  {label}
                  {i < active
                    ? ' · done'
                    : i === active
                      ? ' · in progress'
                      : ''}
                </Text>
              );
            })}
            {s.stage === 'Reading the record again.' ? (
              <Text>{s.stage}</Text>
            ) : null}
            {s.reading.length ? (
              <Text>Reading {s.reading.join(' · ')}</Text>
            ) : null}
            {s.streaming ? (
              <>
                <Text variant="fine">{machineNote}</Text>
                <Text
                  selectable
                  testID="ask-streaming"
                  accessibilityLiveRegion="none"
                >
                  {s.streaming}
                </Text>
              </>
            ) : null}
            <Button
              label="Cancel"
              onPress={() => askSession.cancel()}
              testID="ask-cancel"
            />
          </Group>
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
            {s.streaming ? <Text selectable>{s.streaming}</Text> : null}
            <Button
              label="Try again"
              onPress={() => void submit(retryQuestion)}
              testID="ask-retry"
            />
          </Group>
        ) : null}
        {s.notice ? <Text>{s.notice}</Text> : null}
        {answer && !s.busy ? (
          <Section title="Ask next" testID="ask-followups">
            {answer.next?.map((next, i) => (
              <Button
                key={next.question}
                label={next.question}
                onPress={() => void submit(next.question, next)}
                testID={`ask-followup-${i}`}
              />
            ))}
            <Field
              label="Ask a follow-up"
              placeholder="Ask a follow-up…"
              value={draft}
              onChangeText={setDraft}
              multiline
              testID="ask-followup-field"
            />
            <Button
              label="Ask"
              variant="primary"
              disabled={!draft.trim()}
              onPress={() => void submit()}
              testID="ask-followup-submit"
            />
          </Section>
        ) : null}
      </Screen>
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
        <Modal
          animationType="none"
          presentationStyle="pageSheet"
          onRequestClose={() => setHistoryOpen(false)}
        >
          <SafeAreaView
            style={{ flex: 1, backgroundColor: colors.paper }}
            accessibilityViewIsModal
          >
            <Screen testID="ask-history-screen">
              <Heading level={1}>
                Your conversations ({saved.chats.length})
              </Heading>
              <Text>
                {account.status?.signedIn
                  ? 'Saved to your account and on this iPhone.'
                  : 'Saved on this iPhone. Sign in to keep them across devices.'}
              </Text>
              {!saved.chats.length ? (
                <EmptyState message="No saved conversations." />
              ) : null}
              {saved.chats.map((c, i) => (
                <Group key={c.id}>
                  <Button
                    label={c.title}
                    onPress={() => {
                      askSession.open(c.id);
                      setHistoryOpen(false);
                      scroll.current?.scrollTo({
                        y: answerY.current,
                        animated: false,
                      });
                    }}
                    testID={`ask-restore-${i}`}
                  />
                  <Text variant="metadata">
                    {c.thread.filter((m) => m.role === 'user').length} questions
                  </Text>
                  <Button
                    label={`Delete conversation: ${c.title}`}
                    variant="danger"
                    onPress={() => void remove(c.id)}
                    testID={`ask-delete-${i}`}
                  />
                </Group>
              ))}
              {syncNotice ? (
                <Text testID="ask-sync-notice">{syncNotice}</Text>
              ) : null}
              {account.status?.signedIn ? (
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
              <Button
                label="Done"
                variant="primary"
                onPress={() => setHistoryOpen(false)}
                testID="ask-history-done"
              />
            </Screen>
          </SafeAreaView>
        </Modal>
      ) : null}
    </>
  );
}
