/**
 * A tapped question asks at once; a generic Ask only fills the composer
 * (Jake, 13 Nov, TestFlight build 60; journeys/ask.md 4.2).
 */
import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { useNetworkState } from 'expo-network';
import { NavigationContext } from 'expo-router/react-navigation';
import { catalogs, client } from '../src/api/runtime';
import { askConsentGiven } from '../src/features/ask/consent';
import { track } from '../src/analytics';
import { takeFocusRequest } from '../src/design/keyboard';
import { useRowHighlight } from '../src/design/row-padding';
import { InsetGroup } from '../src/design/layout';
import { colors } from '../src/design/tokens';
import { scopedQuestion } from '../src/features/ask/AskAbout';
import { composerCopy } from '../src/features/ask/AskDock';
import {
  isVisibleQuestion,
  useAskNow,
  useOpenAsk,
} from '../src/features/ask/open';
import { askDraft } from '../src/features/search/recovery';
import {
  askScreenFocused,
  askSession,
  askNowCopy,
  useAskScreenFocus,
} from '../src/features/ask/session';
import { AskFailure } from '../src/features/ask/stream';
import { chatsSnapshot, saveChats } from '../src/features/ask/store';
import { AskBlock, todayStarters } from '../src/features/today/AskBlock';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), dismissTo: jest.fn(), push: jest.fn() },
  useSegments: () => ['(tabs)', '(today)'],
}));
jest.mock('expo-network', () => ({ useNetworkState: jest.fn() }));
jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  catalogs: { roster: jest.fn(), slugs: jest.fn() },
}));
jest.mock('../src/features/ask/consent', () => ({
  askConsentGiven: jest.fn().mockResolvedValue(true),
  giveAskConsent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: null, checking: false }),
  accountSnapshot: () => ({ status: null }),
}));
// The device store keeps a copy of what it saves, as the disk does: a turn
// changed after its save never reaches it, so a missing save shows.
jest.mock('../src/features/ask/store', () => {
  const empty = () => ({ v: 1, active: null, chats: [] });
  let saved = empty();
  return {
    chatsSnapshot: () => saved,
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: jest.fn().mockResolvedValue(undefined),
    saveChats: jest.fn(async (next: unknown) => {
      saved = JSON.parse(JSON.stringify(next));
    }),
    forgetActiveChat: jest.fn(),
    resetChats: () => {
      saved = empty();
    },
  };
});
jest.mock('../src/features/ask/sync', () => ({
  syncSubmittedChat: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
  currentSection: () => 'today',
}));

const { resetChats } = jest.requireMock<{ resetChats: () => void }>(
  '../src/features/ask/store',
);
const post = jest.mocked(client.askPost);
const today = '2026-11-13';
const [first] = todayStarters(today);
const answer = (text: string) => ({
  answer: text,
  sources: [],
  answer_status: 'answered',
});
const asked = () =>
  post.mock.calls
    .filter(([path]) => path === '/api/ask?stream=1')
    .map(([, body]) => (body as { question: string }).question);
const online = (connected: boolean) =>
  jest.mocked(useNetworkState).mockReturnValue({
    isConnected: connected,
    isInternetReachable: connected,
  } as ReturnType<typeof useNetworkState>);
const flush = async () => {
  for (let i = 0; i < 6; i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
};
// The innermost node with the row's id and its press handler.
const rows = (root: ReactTestInstance) =>
  [0, 1].map(
    (i) =>
      root
        .findAll(
          (n) =>
            n.props.testID === `today-ask-${i}` &&
            typeof n.props.onPress === 'function',
        )
        .at(-1)!,
  );
async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetChats();
  online(true);
  post.mockResolvedValue(answer('An answer from the record.'));
  askSession.start();
  askSession.setDraft('');
  takeFocusRequest('ask');
  takeFocusRequest('ask-status');
  takeFocusRequest('ask-waiting');
});

it('a Today starter opens Ask and asks its question at once', async () => {
  expect(first).toMatch(/\?$/);
  const tree = await render(<AskBlock today={today} />);
  const row = rows(tree.root)[0]!;
  expect(row.props.accessibilityHint).toBe('Asks this question');
  let finish!: (value: unknown) => void;
  post.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  await act(async () => row.props.onPress());
  await flush();
  // While it runs, VoiceOver is bound for the answer's status, not the
  // composer.
  expect(askSession.snapshot().busy).toBe(true);
  expect(takeFocusRequest('ask-status')).toBe(true);
  expect(takeFocusRequest('ask')).toBe(false);
  await act(async () => finish(answer('An answer from the record.')));
  await flush();
  // It switches to the Ask tab (build 61, bug 3; tests/ask-now-tab.test.tsx).
  expect(router.navigate).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/(tabs)/(ask)/ask' }),
  );
  expect(asked()).toEqual([first]);
  const s = askSession.snapshot();
  expect(s.thread[0]).toMatchObject({ role: 'user', text: first });
  expect(s.draft).toBe('');
  // The chip event stays, and the send event a typed question gets is
  // added; neither carries the question.
  const events = jest.mocked(track).mock.calls;
  expect(events).toContainEqual([
    'opax_chip',
    { chip_kind: 'ask', placement: 'today' },
  ]);
  expect(events).toContainEqual([
    'opax_ask_started',
    { from_section: 'today', follow_up: false },
  ]);
  expect(JSON.stringify(events)).not.toContain(first!);
  tree.unmount();
});

it('a generic Ask action only fills the composer', async () => {
  let openAsk!: ReturnType<typeof useOpenAsk>;
  function Entry() {
    openAsk = useOpenAsk();
    return null;
  }
  const tree = await render(<Entry />);
  const scope = scopedQuestion('bill', 'Fixture Amendment Bill 2026');
  await act(async () => openAsk(scope));
  await flush();
  expect(post).not.toHaveBeenCalled();
  expect(askSession.snapshot().draft).toBe(scope.question);
  expect(takeFocusRequest('ask')).toBe(true);
  tree.unmount();
});

it('offline, a starter fills the composer and never queues a send', async () => {
  online(false);
  const announce = jest.spyOn(
    AccessibilityInfo,
    'announceForAccessibilityWithOptions',
  );
  const tree = await render(<AskBlock today={today} />);
  await act(async () => rows(tree.root)[0]!.props.onPress());
  await flush();
  const s = askSession.snapshot();
  expect(s.draft).toBe(first);
  expect(s.queued).toBe(false);
  expect(post).not.toHaveBeenCalled();
  expect(announce).toHaveBeenCalledWith(askNowCopy.offline, { queue: true });
  // Back online, nothing goes until the reader sends it.
  online(true);
  await flush();
  expect(post).not.toHaveBeenCalled();
  tree.unmount();
});

it('a running answer finishes in its own conversation, then the tapped question asks', async () => {
  let finish!: (value: unknown) => void;
  post.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  await act(async () => {
    void askSession.submit('A question already running?');
  });
  const running = askSession.snapshot().id;
  expect(askSession.snapshot().busy).toBe(true);

  const tree = await render(<AskBlock today={today} />);
  await act(async () => rows(tree.root)[0]!.props.onPress());
  await flush();
  // It waits visibly; the running answer is untouched.
  let s = askSession.snapshot();
  expect(s.busy).toBe(true);
  expect(s.id).toBe(running);
  expect(s).toMatchObject({ draft: first, fresh: true, queued: true });
  expect(composerCopy.queued).toBe(askNowCopy.waits);
  expect(asked()).toEqual(['A question already running?']);

  await act(async () => finish(answer('The first answer.')));
  await flush();
  // The first conversation was saved with its answer.
  const saves = jest.mocked(saveChats).mock.calls.map(([store]) => store);
  expect(
    saves.some((store) =>
      store.chats.some(
        (c) =>
          c.id === running &&
          c.thread.some((t) => t.text === 'The first answer.'),
      ),
    ),
  ).toBe(true);
  // The tapped question was asked in a new conversation.
  expect(asked()).toEqual(['A question already running?', first]);
  s = askSession.snapshot();
  expect(s.id).not.toBe(running);
  expect(s.thread[0]).toMatchObject({ role: 'user', text: first });
  expect(s.queued).toBe(false);
  tree.unmount();
});

it('editing a waiting question makes it the reader’s to send', async () => {
  let finish!: (value: unknown) => void;
  post.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  await act(async () => {
    void askSession.submit('A question already running?');
  });
  let askNow!: ReturnType<typeof useAskNow>;
  function Entry() {
    askNow = useAskNow();
    return null;
  }
  const tree = await render(<Entry />);
  await act(async () => askNow({ question: 'What has parliament said?' }));
  act(() => askSession.setDraft('What has parliament said about rivers?'));
  expect(askSession.snapshot().queued).toBe(false);
  await act(async () => finish(answer('Done.')));
  await flush();
  expect(asked()).toEqual(['A question already running?']);
  expect(askSession.snapshot().draft).toBe(
    'What has parliament said about rivers?',
  );
  tree.unmount();
});

it('Stop on the running answer lets the waiting question ask', async () => {
  post.mockImplementationOnce(() => new Promise(() => undefined));
  await act(async () => {
    void askSession.submit('A question already running?');
  });
  askSession.arrive(
    'What has parliament said?',
    { ...askSession.snapshot().options },
    { queue: true },
  );
  act(() => {
    askSession.stop();
  });
  await flush();
  expect(asked()).toEqual([
    'A question already running?',
    'What has parliament said?',
  ]);
});

it('a rate-limited tapped question shows the Retry-After countdown', async () => {
  const retryAt = Date.now() + 42_000;
  post.mockRejectedValueOnce(
    new AskFailure('rate-limited', 'Busy', 'server', retryAt),
  );
  const tree = await render(<AskBlock today={today} />);
  await act(async () => rows(tree.root)[0]!.props.onPress());
  await flush();
  expect(askSession.snapshot().error).toMatchObject({
    code: 'rate-limited',
    retryAt,
  });
  expect(asked()).toEqual([first]);
  tree.unmount();
});

it('a pressed row on a white group never takes the page colour', async () => {
  let fill: string | undefined;
  function Probe() {
    fill = useRowHighlight();
    return null;
  }
  const { designFlags } = jest.requireActual('../src/design/flags');
  const grouped = designFlags.groupedSurfaces;
  designFlags.groupedSurfaces = true;
  try {
    const { SurfaceContext } = jest.requireActual('../src/design/row-padding');
    const tree = await render(
      <SurfaceContext.Provider value="sunken">
        <InsetGroup>
          <Probe />
        </InsetGroup>
      </SurfaceContext.Provider>,
    );
    expect(fill).not.toBe(colors.sunken);
    expect(fill).not.toBe(colors.raised);
    tree.unmount();
  } finally {
    designFlags.groupedSurfaces = grouped;
  }
});

it('Search asks at once only when the row shows the typed question itself', () => {
  const typed = 'Who voted for the Fixture Bill?';
  expect(isVisibleQuestion(typed, askDraft(typed))).toBe(true);
  // A drafted wrapper is not on screen, and a question without "?" is not
  // the exact text that would be asked.
  expect(isVisibleQuestion('housing', askDraft('housing'))).toBe(false);
  expect(isVisibleQuestion('who voted', askDraft('who voted'))).toBe(false);
});

// Review round 1: a waiting question never goes into a failure.
it.each([
  ['rate limited', new AskFailure('rate-limited', 'Busy', 'server', 1)],
  ['offline', new AskFailure('offline', 'No connection.')],
  ['timed out', new AskFailure('timeout', 'Too slow.')],
])(
  'a running answer that fails (%s) keeps its failure, and the waiting question stays unsent',
  async (_case, failure) => {
    if (failure.code === 'rate-limited') failure.retryAt = Date.now() + 60_000;
    let fail!: (reason: unknown) => void;
    post.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (fail = reject)),
    );
    await act(async () => {
      void askSession.submit('A question already running?');
    });
    const tree = await render(<AskBlock today={today} />);
    await act(async () => rows(tree.root)[0]!.props.onPress());
    await flush();
    expect(askSession.snapshot().queued).toBe(true);
    await act(async () => fail(failure));
    await flush();
    expect(asked()).toEqual(['A question already running?']);
    const s = askSession.snapshot();
    expect(s.error).toBe(failure);
    expect(s.failed).toMatchObject({ question: 'A question already running?' });
    expect(s).toMatchObject({ draft: first, fresh: true, queued: false });
    if (failure.code === 'rate-limited')
      expect(s.error?.retryAt).toBeGreaterThan(Date.now() + 50_000);
    // Later, still nothing goes without the reader.
    await flush();
    expect(asked()).toEqual(['A question already running?']);
    tree.unmount();
  },
);

/**
 * A running answer with sources and a tapped question waiting behind it:
 * the answer is written and saved, the waiting question goes, and the
 * answer's Ask next request is left open for the test to settle.
 */
async function waitingBehindAnswer(scope: { speaker?: string } = {}) {
  let finish!: (value: unknown) => void;
  let followups: ((value: unknown) => void) | undefined;
  post.mockImplementation((path: string) =>
    path === '/api/followups'
      ? new Promise((resolve) => (followups = resolve))
      : asked().length === 1
        ? new Promise((resolve) => (finish = resolve))
        : Promise.resolve(answer('The second answer.')),
  );
  await act(async () => {
    void askSession.submit('A question already running?');
  });
  const running = askSession.snapshot().id!;
  askSession.arrive(
    'What has parliament said?',
    { ...askSession.snapshot().options, ...scope },
    { queue: true },
  );
  await act(async () =>
    finish({
      answer: 'The first answer.',
      answer_status: 'answered',
      sources: [
        {
          resource: 'fixture-resource',
          slug: 'fixture-record',
          title: 'Fixture record',
          snippet: 'A passage from the fixture record about the question.',
        },
      ],
    }),
  );
  await flush();
  return { running, followups };
}
const storedChat = (id: string) =>
  chatsSnapshot().chats.find((c) => c.id === id);

it('the waiting question goes when the answer is written, before its Ask next rows, which still reach the saved conversation', async () => {
  const { running, followups } = await waitingBehindAnswer();
  // Sent while the first answer's Ask next rows are still loading.
  expect(followups).toBeDefined();
  expect(asked()).toEqual([
    'A question already running?',
    'What has parliament said?',
  ]);
  expect(askSession.snapshot().id).not.toBe(running);
  // The answer was saved before its rows arrived.
  expect(storedChat(running)?.thread.at(-1)).toMatchObject({
    role: 'answer',
    text: 'The first answer.',
  });
  expect(storedChat(running)?.thread.at(-1)?.next).toBeUndefined();
  await act(async () =>
    followups!({ questions: ['What did the committee find?'] }),
  );
  await flush();
  // Only a save puts the rows in the store's own copy.
  expect(storedChat(running)?.thread.at(-1)).toMatchObject({
    role: 'answer',
    next: [{ question: 'What did the committee find?' }],
  });
  // The open conversation is the new one, untouched by the old rows.
  expect(askSession.snapshot().thread.at(-1)?.next).toBeUndefined();
});

it('Ask next rows for a conversation deleted while they loaded are not saved', async () => {
  const { running, followups } = await waitingBehindAnswer();
  expect(storedChat(running)).toBeDefined();
  // The reader deletes the first conversation in Conversations.
  await saveChats({
    ...chatsSnapshot(),
    chats: chatsSnapshot().chats.filter((c) => c.id !== running),
  });
  jest.mocked(saveChats).mockClear();
  await act(async () =>
    followups!({ questions: ['What did the committee find?'] }),
  );
  await flush();
  expect(saveChats).not.toHaveBeenCalled();
  expect(storedChat(running)).toBeUndefined();
});

// Review: Ask next was written into the turn without an update, so rows for
// a conversation still on screen did not show.
it.each([
  [
    'the Person check refuses it',
    () =>
      jest
        .mocked(catalogs.roster)
        .mockResolvedValueOnce({ data: { people: [] } } as never),
  ],
  [
    'the roster fails to load',
    () =>
      jest.mocked(catalogs.roster).mockRejectedValueOnce(new Error('Offline')),
  ],
])(
  'Ask next rows show at once when the waiting question does not start (%s)',
  async (_case, roster) => {
    roster();
    const { running, followups } = await waitingBehindAnswer({
      speaker: 'Alex Example',
    });
    // The waiting question was refused: the answered conversation stays.
    expect(asked()).toEqual(['A question already running?']);
    let s = askSession.snapshot();
    expect(s).toMatchObject({
      id: running,
      busy: false,
      draft: 'What has parliament said?',
    });
    const written = s.thread.at(-1)!;
    expect(written).toMatchObject({ role: 'answer' });
    expect(written.next).toBeUndefined();
    const updates = jest.fn();
    const unsubscribe = askSession.subscribe(updates);
    try {
      await act(async () =>
        followups!({ questions: ['What did the committee find?'] }),
      );
      await flush();
    } finally {
      unsubscribe();
    }
    expect(updates).toHaveBeenCalled();
    s = askSession.snapshot();
    expect(s.thread.at(-1)).toMatchObject({
      role: 'answer',
      text: 'The first answer.',
      next: [{ question: 'What did the committee find?' }],
    });
    // A new turn, never a write into the one already on screen.
    expect(s.thread.at(-1)).not.toBe(written);
    expect(written.next).toBeUndefined();
    expect(storedChat(running)?.thread.at(-1)?.next).toEqual([
      { question: 'What did the committee find?' },
    ]);
  },
);

/**
 * The waiting question is refused, so the answered conversation stays open;
 * the reader clears the composer (no longer "Starts a new conversation") and
 * asks a follow-up in it.
 */
async function followUpAfterRefusal() {
  jest
    .mocked(catalogs.roster)
    .mockResolvedValueOnce({ data: { people: [] } } as never);
  const waiting = await waitingBehindAnswer({ speaker: 'Alex Example' });
  expect(asked()).toEqual(['A question already running?']);
  act(() => askSession.setDraft(''));
  return waiting;
}
const fourTurns = [
  'A question already running?',
  'The first answer.',
  'A newer question?',
  'The second answer.',
];
const committeeRow = [{ question: 'What did the committee find?' }];

// Review P3-2: the saved copy was built from the thread at the first answer,
// so rows arriving after a newer answer cut it back to two turns.
it('Ask next rows that arrive after a newer answer in the same conversation keep all four turns', async () => {
  const { running, followups } = await followUpAfterRefusal();
  await act(async () => {
    await askSession.submit('A newer question?');
  });
  await flush();
  expect(askSession.snapshot()).toMatchObject({ id: running, busy: false });
  expect(askSession.snapshot().thread.map((m) => m.text)).toEqual(fourTurns);
  await act(async () =>
    followups!({ questions: ['What did the committee find?'] }),
  );
  await flush();
  for (const thread of [
    askSession.snapshot().thread,
    storedChat(running)!.thread,
  ]) {
    expect(thread.map((m) => m.text)).toEqual(fourTurns);
    expect(thread[1]?.next).toEqual(committeeRow);
    expect(thread[3]?.next).toBeUndefined();
  }
});

// Review P3-1, accepted: rows that arrive while the newer answer is still
// running are saved, then that answer's save writes the turns on screen over
// them. The four turns are kept and the rows are dropped.
it('Ask next rows that arrive while a newer answer in the same conversation runs are dropped, and all four turns are saved', async () => {
  const { running, followups } = await followUpAfterRefusal();
  let finish!: (value: unknown) => void;
  post.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  let asking!: Promise<void>;
  await act(async () => {
    asking = askSession.submit('A newer question?');
  });
  expect(askSession.snapshot()).toMatchObject({ id: running, busy: true });
  await act(async () =>
    followups!({ questions: ['What did the committee find?'] }),
  );
  await flush();
  // The rows reach the saved copy only; the screen has an answer running.
  expect(storedChat(running)?.thread[1]?.next).toEqual(committeeRow);
  expect(askSession.snapshot().thread[1]?.next).toBeUndefined();
  await act(async () => {
    finish(answer('The second answer.'));
    await asking;
  });
  await flush();
  for (const thread of [
    askSession.snapshot().thread,
    storedChat(running)!.thread,
  ]) {
    expect(thread.map((m) => m.text)).toEqual(fourTurns);
    expect(thread[1]?.next).toBeUndefined();
  }
});

it('a running answer that asks for a full question keeps the waiting question unsent', async () => {
  let finish!: (value: unknown) => void;
  post.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  await act(async () => {
    void askSession.submit('ok');
  });
  askSession.arrive(
    'What has parliament said?',
    { ...askSession.snapshot().options },
    { queue: true },
  );
  expect(askSession.snapshot().queued).toBe(true);
  await act(async () =>
    finish({
      answer: '',
      sources: [],
      answer_status: 'needs_question',
      suggested_question: 'What has parliament said about rivers?',
    }),
  );
  await flush();
  // The clarify request stays on screen, and nothing else is asked.
  expect(asked()).toEqual(['ok']);
  const s = askSession.snapshot();
  expect(s.clarify).toEqual({
    question: 'ok',
    suggestion: 'What has parliament said about rivers?',
  });
  expect(s).toMatchObject({
    id: null,
    thread: [],
    busy: false,
    draft: 'What has parliament said?',
    fresh: true,
    queued: false,
  });
  // Nothing was searched or written: no Ask next request and no save.
  expect(post.mock.calls.map(([path]) => path)).toEqual(['/api/ask?stream=1']);
  expect(saveChats).not.toHaveBeenCalled();
  await flush();
  expect(asked()).toEqual(['ok']);
});

describe('VoiceOver focus for a tapped question', () => {
  it('is dropped when the consent sheet opens instead of an answer', async () => {
    jest.mocked(askConsentGiven).mockResolvedValueOnce(false);
    const tree = await render(<AskBlock today={today} />);
    await act(async () => rows(tree.root)[0]!.props.onPress());
    await flush();
    expect(router.push).toHaveBeenCalledWith({ pathname: '/consent' });
    expect(post).not.toHaveBeenCalled();
    expect(takeFocusRequest('ask-status')).toBe(false);
    tree.unmount();
  });

  it('is dropped when the Person check refuses, and the composer takes it', async () => {
    jest
      .mocked(catalogs.roster)
      .mockResolvedValueOnce({ data: { people: [] } } as never);
    let askNow!: ReturnType<typeof useAskNow>;
    function Entry() {
      askNow = useAskNow();
      return null;
    }
    const tree = await render(<Entry />);
    await act(async () =>
      askNow({
        question: 'What did Alex Example say?',
        speaker: 'Alex Example',
      }),
    );
    await flush();
    expect(post).not.toHaveBeenCalled();
    expect(takeFocusRequest('ask-status')).toBe(false);
    expect(takeFocusRequest('ask')).toBe(true);
    expect(askSession.snapshot().draft).toBe('What did Alex Example say?');
    tree.unmount();
  });

  // Review: a queued send asked for the status's focus even when the reader
  // had left Ask while the question waited.
  /** An Ask screen in a navigator that the test can focus or blur. */
  function askScreen(focused: boolean) {
    const listeners = new Map<string, Set<() => void>>();
    let isFocused = focused;
    const navigation = {
      isFocused: () => isFocused,
      addListener: (type: string, listener: () => void) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
        return () => set.delete(listener);
      },
    };
    function Screen() {
      useAskScreenFocus();
      return null;
    }
    return {
      element: (
        <NavigationContext.Provider value={navigation as never}>
          <Screen />
        </NavigationContext.Provider>
      ),
      emit: (type: 'focus' | 'blur') => {
        isFocused = type === 'focus';
        listeners.get(type)?.forEach((listener) => listener());
      },
    };
  }
  /** Ends a running answer with a question waiting; the queued answer stays open. */
  async function queuedSend() {
    let finish!: (value: unknown) => void;
    let second!: (value: unknown) => void;
    post
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockImplementationOnce(
        () => new Promise((resolve) => (second = resolve)),
      );
    await act(async () => {
      void askSession.submit('A question already running?');
    });
    askSession.arrive(
      'What has parliament said?',
      { ...askSession.snapshot().options },
      { queue: true },
    );
    await act(async () => finish(answer('The first answer.')));
    await flush();
    expect(asked()).toEqual([
      'A question already running?',
      'What has parliament said?',
    ]);
    expect(askSession.snapshot().busy).toBe(true);
    const status = takeFocusRequest('ask-status');
    await act(async () => second(answer('The second answer.')));
    await flush();
    return status;
  }

  it('goes to the queued answer’s status while Ask is on screen', async () => {
    const screen = askScreen(true);
    const tree = await render(screen.element);
    expect(askScreenFocused()).toBe(true);
    expect(await queuedSend()).toBe(true);
    act(() => tree.unmount());
    expect(askScreenFocused()).toBe(false);
  });

  it('stays where the reader is when they left Ask while the question waited', async () => {
    const screen = askScreen(true);
    const tree = await render(screen.element);
    act(() => screen.emit('blur'));
    expect(askScreenFocused()).toBe(false);
    // The question still goes; only VoiceOver stays put.
    expect(await queuedSend()).toBe(false);
    expect(askSession.snapshot().thread.at(-1)).toMatchObject({
      role: 'answer',
      text: 'The second answer.',
    });
    // Back on Ask, the next queued send moves focus again.
    act(() => screen.emit('focus'));
    expect(askScreenFocused()).toBe(true);
    act(() => tree.unmount());
    expect(askScreenFocused()).toBe(false);
  });

  it('goes to the waiting line, not the other answer’s status, while it waits', async () => {
    post.mockImplementationOnce(() => new Promise(() => undefined));
    await act(async () => {
      void askSession.submit('A question already running?');
    });
    const tree = await render(<AskBlock today={today} />);
    await act(async () => rows(tree.root)[0]!.props.onPress());
    await flush();
    expect(takeFocusRequest('ask-waiting')).toBe(true);
    expect(takeFocusRequest('ask-status')).toBe(false);
    tree.unmount();
  });
});
