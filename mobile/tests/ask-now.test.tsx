/**
 * A tapped question asks at once; a generic Ask only fills the composer
 * (Jake, 13 Nov, TestFlight build 60; journeys/ask.md 4.2).
 */
import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { useNetworkState } from 'expo-network';
import { client } from '../src/api/runtime';
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
import { askSession, askNowCopy } from '../src/features/ask/session';
import { AskFailure } from '../src/features/ask/stream';
import { saveChats } from '../src/features/ask/store';
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
jest.mock('../src/features/ask/store', () => {
  const saved = { v: 1, active: null, chats: [] };
  return {
    chatsSnapshot: () => saved,
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: jest.fn().mockResolvedValue(undefined),
    saveChats: jest.fn().mockResolvedValue(undefined),
    forgetActiveChat: jest.fn(),
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
  online(true);
  post.mockResolvedValue(answer('An answer from the record.'));
  askSession.start();
  askSession.setDraft('');
  takeFocusRequest('ask');
  takeFocusRequest('ask-status');
});

it('a Today starter opens Ask and asks its question at once', async () => {
  expect(first).toMatch(/\?$/);
  const tree = await render(<AskBlock today={today} />);
  const row = rows(tree.root)[0]!;
  expect(row.props.accessibilityHint).toBe('Asks this question');
  await act(async () => row.props.onPress());
  await flush();
  expect(router.navigate).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/ask' }),
  );
  expect(asked()).toEqual([first]);
  const s = askSession.snapshot();
  expect(s.thread[0]).toMatchObject({ role: 'user', text: first });
  expect(s.draft).toBe('');
  // VoiceOver goes to the answer's status, not the composer.
  expect(takeFocusRequest('ask-status')).toBe(true);
  expect(takeFocusRequest('ask')).toBe(false);
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
    const { SurfaceContext } = jest.requireActual(
      '../src/design/row-padding',
    );
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
