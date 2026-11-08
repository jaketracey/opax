import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { NativeStackHeaderItem } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { AccessibilityInfo, ScrollView } from 'react-native';
import AskScreen from '../src/features/ask/AskScreen';
import clarify from '../scripts/fixtures/ask-clarify.json';
import { catalogs, client } from '../src/api/runtime';
import { arriveInAsk, askSession } from '../src/features/ask/session';
import { reconcileChats, syncSubmittedChat } from '../src/features/ask/sync';
import { chatsSnapshot } from '../src/features/ask/store';
import { openAskOptions } from '../src/features/ask/Options';
import { AskFailure, type StreamHandlers } from '../src/features/ask/stream';
import { rhythm } from '../src/design/tokens';
import { conversationsRoute } from '../src/navigation/routes/ask';
import { useSeat } from '../src/features/your-mp/useSeat';

// The bar's items, as AskScreen sets them through Stack.Screen.
const mockBar: { options: Record<string, unknown> } = { options: {} };
jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockBar.options = options;
      return null;
    },
  },
  useLocalSearchParams: jest.fn(() => ({})),
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));
jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  catalogs: {
    roster: jest.fn().mockRejectedValue(new Error('Offline')),
    slugs: jest.fn(),
    bills: jest.fn(),
  },
}));
// These readers agreed to Ask's consent already (ask-consent.test.tsx).
jest.mock('../src/features/ask/consent', () => ({
  askConsentGiven: jest.fn().mockResolvedValue(true),
  giveAskConsent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: { signedIn: true } }),
  accountSnapshot: () => ({ status: { signedIn: true } }),
}));
jest.mock('../src/voice/linked', () => ({ voiceLinked: true }));
jest.mock('../src/features/ask/store', () => {
  const saved = { v: 1, active: null, chats: [] };
  return {
    chatsSnapshot: jest.fn(() => saved),
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: jest.fn().mockResolvedValue(undefined),
    saveChats: jest.fn().mockResolvedValue(undefined),
    forgetActiveChat: jest.fn(),
    clearAskConversations: jest.fn(),
  };
});
jest.mock('../src/features/ask/sync', () => ({
  ChatSyncError: jest.requireActual('../src/features/ask/sync').ChatSyncError,
  syncSubmittedChat: jest.fn().mockResolvedValue(undefined),
  deleteRemoteChat: jest.fn(),
  reconcileChats: jest.fn(),
}));
// The seat is read on the device only; no seat unless a test sets one.
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: jest.fn(() => ({ status: 'none' })),
  savedSeatDirectory: jest.fn(() => mockDirectory.current),
}));
const mockDirectory: { current: unknown } = { current: null };
jest.mock('../src/features/your-mp/model', () => ({
  ...jest.requireActual('../src/features/your-mp/model'),
  representativeProfile: () => ({
    name: 'Sam Placeholder',
    slug: 'sam-placeholder',
  }),
}));
// An answer's own rendering is covered in ask-answer-design; here it only
// has to exist. The thread's other parts are real.
jest.mock('../src/features/ask/AnswerView', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    AnswerView: () => React.createElement(View, { testID: 'ask-answer' }),
    SearchOpaxRow: ({ question }: { question: string }) =>
      React.createElement(View, { testID: 'ask-search-opax', question }),
    AskRevealContext: React.createContext(null),
    announceAnswer: jest.fn(),
    machineNote: { title: 'Machine-written', body: ['Fixture note.'] },
  };
});
jest.mock('../src/features/ask/Options', () => ({
  topics: { housing: 'Housing' },
  openAskOptions: jest.fn(),
}));
jest.mock('../src/features/ask/SourcesPane', () => ({
  AskPaneProvider: ({ children }: { children: unknown }) => children,
  useAskSources: () => ({ context: null, onScroll: undefined, pane: null }),
  useAskPane: () => null,
}));

const oneChat = {
  v: 1 as const,
  active: 'saved-fixture',
  chats: [
    {
      id: 'saved-fixture',
      title: 'A saved fixture question?',
      kind: 'all' as const,
      speaker: '',
      created: 1,
      updated: 1,
      thread: [
        { role: 'user' as const, text: 'A saved fixture question?' },
        { role: 'answer' as const, text: 'A saved fixture answer.' },
      ],
    },
  ],
};
const noChats = { v: 1 as const, active: null, chats: [] };
const answer = {
  answer: 'Synthetic fixture answer.',
  citations: {},
  sources: [
    {
      resource: 'fixture',
      title: 'Synthetic fixture',
      slug: 'fixture',
      snippet: 'Synthetic evidence passage.',
    },
  ],
};

let view: ReactTestRenderer | null = null;
let scrollTo: jest.SpyInstance;
beforeEach(() => {
  jest.mocked(client.askPost).mockReset();
  jest.mocked(router.push).mockClear();
  jest.mocked(chatsSnapshot).mockImplementation(() => noChats);
  scrollTo = jest
    .spyOn(
      ScrollView.prototype as unknown as { scrollTo: () => void },
      'scrollTo',
    )
    .mockImplementation(() => undefined);
  askSession.start();
  askSession.setDraft('');
});
afterEach(async () => {
  await act(async () => {
    // Let the reveal's fallback frames run before teardown.
    await new Promise((r) => setTimeout(r, 30));
    view?.unmount();
  });
  view = null;
  scrollTo.mockRestore();
  askSession.start();
  askSession.setDraft('');
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  jest.mocked(useSeat).mockReturnValue({ status: 'none' } as never);
  jest.mocked(catalogs.roster).mockRejectedValue(new Error('Offline'));
  mockDirectory.current = null;
});
async function mount() {
  await act(async () => {
    view = create(<AskScreen />);
  });
  return view!;
}
const byId = (id: string) => view!.root.findAllByProps({ testID: id });
const one = (id: string) =>
  view!.root.findAll(
    (n) =>
      n.props.testID === id &&
      (typeof n.props.onPress === 'function' ||
        typeof n.props.onChangeText === 'function'),
  )[0]!;
/** The first string child under any node with this testID. */
const textOf = (id: string) =>
  byId(id)
    .flatMap((n) => [n, ...n.findAll(() => true)])
    .map((n) => n.props.children)
    .find((c) => typeof c === 'string');
/** The accessibility label or hint given to the row with this testID. */
const a11y = (id: string, key: 'accessibilityLabel' | 'accessibilityHint') =>
  byId(id)
    .map((n) => n.props[key])
    .find((v) => typeof v === 'string');
const texts = () =>
  view!.root
    .findAll((n) => typeof n.props.children === 'string')
    .map((n) => n.props.children as string);
async function type(text: string) {
  await act(async () => one('ask-question').props.onChangeText(text));
}
async function press(id: string) {
  await act(async () => {
    await one(id).props.onPress();
  });
}
const bar = () =>
  mockBar.options as {
    unstable_headerLeftItems: () => NativeStackHeaderItem[];
    unstable_headerRightItems: () => NativeStackHeaderItem[];
  };
const barButton = (label: string) =>
  [
    ...bar().unstable_headerLeftItems(),
    ...bar().unstable_headerRightItems(),
  ].find((item) => 'label' in item && item.label === label) as
    | (NativeStackHeaderItem & { disabled?: boolean; onPress: () => void })
    | undefined;

test('a cold launch opens idle, with the last conversation first under Conversations', async () => {
  jest.mocked(chatsSnapshot).mockImplementation(() => oneChat);
  await mount();
  expect(askSession.snapshot().thread).toEqual([]);
  expect(byId('ask-idle-line')).not.toEqual([]);
  expect(texts()).toContain(
    'Answers come from parliamentary records and are machine-written.',
  );
  expect(byId('ask-starter-0')).not.toEqual([]);
  expect(byId('ask-conversation-0')).not.toEqual([]);
  // No Options row, chips or builder on the page.
  expect(byId('ask-options')).toEqual([]);
  expect(byId('ask-builder-toggle')).toEqual([]);
  await press('ask-see-all-conversations');
  expect(router.push).toHaveBeenCalledWith(conversationsRoute);
  await press('ask-conversation-0');
  expect(askSession.snapshot().id).toBe('saved-fixture');
  expect(client.askPost).not.toHaveBeenCalled();
});

test('Conversations hides with none saved; the bar keeps Conversations, New question and Account', async () => {
  await mount();
  expect(byId('ask-conversations')).toEqual([]);
  expect(byId('ask-see-all-conversations')).toEqual([]);
  expect(barButton('Your conversations')?.disabled).toBe(true);
  expect(barButton('New question')?.disabled).toBe(true);
  expect(barButton('Account')).toBeDefined();
  // At most three items, Talk not among them (it is in the composer).
  expect(
    bar().unstable_headerLeftItems().length +
      bar().unstable_headerRightItems().length,
  ).toBeLessThanOrEqual(3);
  expect(barButton('Talk')).toBeUndefined();
});

test('a deep-linked draft starts a new conversation and sends nothing', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    entry: 'scoped-entry',
    question: 'What has Sam Placeholder said in parliament this year?',
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  jest.mocked(chatsSnapshot).mockImplementation(() => oneChat);
  await mount();
  expect(one('ask-question').props.value).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(askSession.snapshot().options).toMatchObject({
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  expect(askSession.snapshot().thread).toEqual([]);
  expect(byId('ask-options-line')).not.toEqual([]);
  expect(client.askPost).not.toHaveBeenCalled();
});

test('mount, typing, Options and a remount never call paid routes', async () => {
  await mount();
  await type('A question');
  await press('ask-composer-options');
  expect(openAskOptions).toHaveBeenCalled();
  await act(async () => {
    view!.unmount();
    view = create(<AskScreen />);
  });
  expect(client.askPost).not.toHaveBeenCalled();
  expect(reconcileChats).not.toHaveBeenCalled();
  expect(syncSubmittedChat).not.toHaveBeenCalled();
});

test('Talk sits in the empty composer for a signed-in reader and turns into Send', async () => {
  await mount();
  expect(byId('ask-talk')).not.toEqual([]);
  expect(byId('ask-submit')).toEqual([]);
  await press('ask-talk');
  expect(router.push).toHaveBeenCalledWith('/talk');
  await type('A question');
  expect(byId('ask-talk')).toEqual([]);
  expect(one('ask-submit').props.accessibilityLabel).toBe('Send');
});

test('a starter asks at once; the seat starter only fills the composer', async () => {
  jest.mocked(useSeat).mockReturnValue({
    status: 'chosen',
    choice: { version: 1, seatId: 'el_fixture', stateSeatIds: [] },
  } as never);
  mockDirectory.current = {
    electorates: {
      data: {
        electorates: [
          {
            electorate_id: 'el_fixture',
            status: 'current',
            jurisdiction: 'federal',
            chamber: 'representatives',
            representation_status: 'verified',
            representatives: [{ person_id: 'fixture-person' }],
          },
        ],
      },
    },
  };
  jest.mocked(client.askPost).mockResolvedValue(answer);
  await mount();
  const seat = one('ask-starter-seat');
  expect(seat).toBeDefined();
  expect(a11y('ask-starter-seat', 'accessibilityLabel')).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(a11y('ask-starter-seat', 'accessibilityHint')).toBe(
    'Puts this question in the box.',
  );
  await press('ask-starter-seat');
  expect(client.askPost).not.toHaveBeenCalled();
  expect(one('ask-question').props.value).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(askSession.snapshot().options).toMatchObject({
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  // Three rotating starters plus the seat starter.
  expect(byId('ask-starter-3')).toEqual([]);
  // A fresh page: the seat starter's Person option set the composer's.
  await act(async () => {
    askSession.newConversation();
  });
  const starter = a11y('ask-starter-0', 'accessibilityLabel')!;
  await press('ask-starter-0');
  expect(jest.mocked(client.askPost).mock.calls[0]?.[1]).toMatchObject({
    question: starter,
  });
});

test('a sent question shows the status line, Stop, and is revealed below the header', async () => {
  let on: StreamHandlers | undefined,
    fail: (e: unknown) => void = () => {};
  jest.mocked(client.askPost).mockImplementationOnce(
    (_path, _body, _signal, handlers) =>
      new Promise((_resolve, reject) => {
        on = handlers;
        fail = reject;
      }),
  );
  await mount();
  await type('Who spoke on housing?');
  scrollTo.mockClear();
  await press('ask-submit');
  const turn = byId('ask-turn')[0]!;
  expect(turn.findAllByProps({ testID: 'ask-user-question' })).not.toEqual([]);
  expect(textOf('ask-user-question')).toBe('Who spoke on housing?');
  expect(textOf('ask-status')).toBe('Reading your question');
  // Send has become Stop; the composer was cleared for the next question.
  expect(one('ask-stop').props.accessibilityLabel).toBe('Stop answering');
  expect(byId('ask-submit')).toEqual([]);
  expect(one('ask-question').props.value).toBe('');
  // The reveal uses the turn's own layout and clears the native header
  // (no navigator here: 44pt), never the raw content y behind the bar.
  await act(async () => {
    turn.props.onLayout({ nativeEvent: { layout: { y: 400 } } });
  });
  expect(scrollTo).toHaveBeenLastCalledWith(
    expect.objectContaining({ y: 400 - 44 - rhythm.heading }),
  );
  await act(async () => {
    on!.stage('Searching the record');
  });
  expect(textOf('ask-status')).toBe('Searching the record');
  // An error after text keeps the question with one plain sentence, never
  // the server's words, and Try again.
  await act(async () => {
    fail(new AskFailure('partial', 'The answer stream failed.'));
  });
  expect(textOf('ask-failed-question')).toBe('Who spoke on housing?');
  expect(byId('ask-error-partial')).not.toEqual([]);
  expect(texts().join(' ')).toContain('This answer stopped partway.');
  expect(texts().join(' ')).not.toContain('The answer stream failed.');
  expect(byId('ask-retry')).not.toEqual([]);
  expect(byId('ask-progress')).toEqual([]);
  // The failed question returns to the empty composer.
  expect(one('ask-question').props.value).toBe('Who spoke on housing?');
});

test('Stop puts the question back in an empty composer and says so', async () => {
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
    .mockImplementation(() => undefined);
  jest
    .mocked(client.askPost)
    .mockImplementationOnce(
      (_path, _body, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new AskFailure('cancelled', 'Cancelled.')),
          ),
        ),
    );
  await mount();
  await type('Who spoke on housing?');
  await press('ask-submit');
  await press('ask-stop');
  expect(askSession.snapshot().busy).toBe(false);
  expect(one('ask-question').props.value).toBe('Who spoke on housing?');
  expect(byId('ask-turn')).toEqual([]);
  expect(byId('ask-error-cancelled')).toEqual([]);
  expect(announce).toHaveBeenCalledWith(
    'Stopped. Your question is back in the box.',
    { queue: true },
  );
  announce.mockRestore();
});

test('a reply with nothing to search on asks for a full question; its suggestion fills, never sends', async () => {
  const first = {
    answer: 'A fixture answer about housing affordability.',
    citations: {},
    sources: [],
  };
  jest
    .mocked(client.askPost)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(clarify);
  await mount();
  await type('What has Sam Placeholder proposed about housing affordability?');
  await press('ask-submit');
  await type('High');
  await press('ask-submit');
  // Sent as a follow-up, with the conversation as context.
  expect(jest.mocked(client.askPost).mock.calls[1]?.[1]).toMatchObject({
    question: 'High',
    context: [
      {
        author: 'user',
        text: 'What has Sam Placeholder proposed about housing affordability?',
      },
      { author: 'answer', text: first.answer },
    ],
  });
  const turn = byId('ask-turn')[0]!;
  expect(turn.findAllByProps({ testID: 'ask-clarify' })).not.toEqual([]);
  expect(textOf('ask-clarify-question')).toBe('High');
  expect(textOf('ask-clarify-message')).toBe(
    'Name a person, party, bill or topic.',
  );
  expect(
    turn.findAllByProps({ testID: 'ask-search-opax' })[0]!.props.question,
  ).toBe('High');
  // No answer, no "Answered as", and the earlier answer stays the thread.
  expect(byId('ask-answered-as')).toEqual([]);
  expect(
    byId('ask-user-question')
      .flatMap((n) => n.findAll(() => true))
      .map((n) => n.props.children),
  ).not.toContain('High');
  expect(askSession.snapshot().thread).toHaveLength(2);
  await press('ask-clarify-suggestion');
  expect(client.askPost).toHaveBeenCalledTimes(2);
  expect(one('ask-question').props.value).toBe(clarify.suggested_question);
});

test('Answered as shows only when the rewrite changed the meaning', async () => {
  jest
    .mocked(client.askPost)
    .mockResolvedValueOnce({
      ...answer,
      asked_as: 'How did each party vote on the Example Bill 2026?',
    })
    .mockResolvedValueOnce({ questions: [] });
  await mount();
  await type('How did they vote?');
  await press('ask-submit');
  expect(textOf('ask-answered-as')).toBe(
    'Answered as: How did each party vote on the Example Bill 2026?',
  );
  expect(byId('ask-understood')).toEqual([]);
});

test('Ask next rows send; New question is enabled once there is an answer', async () => {
  jest
    .mocked(client.askPost)
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({
      questions: [{ question: 'A grounded fixture follow-up?' }],
    })
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({ questions: [] });
  await mount();
  await type('A fixture question?');
  await press('ask-submit');
  expect(byId('ask-answer')).not.toEqual([]);
  expect(byId('ask-idle-line')).toEqual([]);
  expect(barButton('New question')?.disabled).toBe(false);
  await press('ask-followup-0');
  expect(jest.mocked(client.askPost).mock.calls[2]?.[1]).toMatchObject({
    question: 'A grounded fixture follow-up?',
  });
  await act(async () => barButton('New question')!.onPress());
  expect(askSession.snapshot().thread).toEqual([]);
  expect(byId('ask-idle-line')).not.toEqual([]);
});

test('a failed follow-up hides the previous Ask next and holds Try again while OPAX is busy', async () => {
  jest
    .mocked(client.askPost)
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({
      questions: [{ question: 'A grounded fixture follow-up?' }],
    })
    .mockRejectedValueOnce(
      new AskFailure('rate-limited', 'Try again shortly.'),
    );
  await mount();
  await type('A fixture question?');
  await press('ask-submit');
  expect(byId('ask-followup-0')).not.toEqual([]);
  await type('A failing fixture question?');
  await press('ask-submit');
  expect(byId('ask-followups')).toEqual([]);
  expect(byId('ask-followup-0')).toEqual([]);
  expect(texts()).toContain('OPAX is busy right now.');
  expect(texts().join(' ')).not.toContain('Try again shortly.');
  const retry = one('ask-retry');
  expect(retry.props.disabled).toBe(true);
  expect(retry.props.accessibilityHint).toBe('Available in a moment');
  expect(askSession.snapshot().thread).toHaveLength(2);
});

test('a blocked question offers no Try again', async () => {
  jest
    .mocked(client.askPost)
    .mockRejectedValueOnce(new AskFailure('blocked', 'Forbidden (403)'));
  await mount();
  await type('A fixture question?');
  await press('ask-submit');
  expect(texts()).toContain("This question couldn't be sent.");
  expect(byId('ask-retry')).toEqual([]);
});

test('an arrival while an answer runs waits in the composer and sends a new conversation', async () => {
  let finish: (v: unknown) => void = () => {};
  jest
    .mocked(client.askPost)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ questions: [] })
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({ questions: [] });
  await mount();
  await type('A running question?');
  await press('ask-submit');
  await act(async () =>
    arriveInAsk({
      question: 'What has Sam Placeholder said in parliament this year?',
      speaker: 'Sam Placeholder',
      kind: 'speech',
    }),
  );
  // Nothing cancelled or sent; Stop stays until the answer completes.
  expect(askSession.snapshot().busy).toBe(true);
  expect(client.askPost).toHaveBeenCalledTimes(1);
  expect(byId('ask-stop')).not.toEqual([]);
  expect(textOf('ask-draft-new-conversation')).toContain(
    'Starts a new conversation',
  );
  expect(one('ask-question').props.value).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  await act(async () => finish(answer));
  const first = askSession.snapshot().id;
  // The Person option is checked against the roster before it is sent.
  jest.mocked(catalogs.roster).mockResolvedValue({
    data: { people: [{ name: 'Sam Placeholder' }] },
  } as never);
  expect(askSession.snapshot().thread).toHaveLength(2);
  await press('ask-submit');
  const asked = jest.mocked(client.askPost).mock.calls[2]?.[1] as {
    question: string;
    context?: unknown[];
  };
  expect(asked.question).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(asked.context ?? []).toEqual([]);
  expect(askSession.snapshot().id).not.toBe(first);
  expect(askSession.snapshot().options).toMatchObject({
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
});
