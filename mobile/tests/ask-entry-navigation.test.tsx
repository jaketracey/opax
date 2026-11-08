import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Stack, Tabs, router, useLocalSearchParams } from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store } from 'expo-router/build/global-state/router-store';
import { inMemoryContext } from 'expo-router/build/testing-library/context-stubs';
import { Pressable, Text } from 'react-native';
import { scopedQuestion } from '../src/features/ask/AskAbout';
import { DocumentAsk } from '../src/features/ask/DocumentAsk';
import { useOpenAsk } from '../src/features/ask/open';
import { askSession } from '../src/features/ask/session';
import { client } from '../src/api/runtime';
import { decodeDocument } from '../src/features/records/model';
import fixtures from '../scripts/fixtures/records/contracts.json';

jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  catalogs: {
    roster: jest.fn().mockRejectedValue(new Error('Offline')),
    slugs: jest.fn(),
  },
}));
jest.mock('../src/features/ask/store', () => {
  const saved = { v: 1, active: null, chats: [] };
  return {
    chatsSnapshot: jest.fn(() => saved),
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: jest.fn().mockResolvedValue(undefined),
    saveChats: jest.fn().mockResolvedValue(undefined),
    forgetActiveChat: jest.fn(),
  };
});

const speech = Object.entries(fixtures.responses)
  .filter(([path]) => path.startsWith('/api/resource/'))
  .map(([, response]) => decodeDocument(response))
  .find((doc) => doc.labels.kind === 'speech')!;

function AskDraft() {
  const params = useLocalSearchParams<{ question?: string }>();
  return <Text testID="ask-question">{params.question}</Text>;
}
// As profile, bill, party and seat pages call it (PageActions, BillDetail).
const entry = (kind: 'person' | 'bill' | 'party' | 'electorate') =>
  function Entry() {
    const openAsk = useOpenAsk();
    return (
      <Pressable
        testID={`${kind}-ask`}
        onPress={() => openAsk(scopedQuestion(kind, 'Sam Placeholder'))}
      />
    );
  };
const record = () => <DocumentAsk doc={speech} />;
const shared = {
  _layout: () => <Stack />,
  'bill/[key]': entry('bill'),
  'person/[slug]': entry('person'),
  'party/[slug]': entry('party'),
  'electorate/[id]': entry('electorate'),
  'doc/[slug]': record,
  money: () => <Text>Money map</Text>,
  'results/[kind]': () => <Text>Results</Text>,
  'topic/[slug]': () => <Text>Topic</Text>,
  'money-record': () => <Text>Money record</Text>,
};
const prefix = (group: string) =>
  Object.fromEntries(
    Object.entries(shared).map(([name, screen]) => [
      `(tabs)/${group}/${name}`,
      screen,
    ]),
  );
// Every tab shares Ask and all record routes, preserving the active stack.
const app = inMemoryContext({
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': () => <Tabs />,
  '(tabs)/(today)/index': () => <Text>Today</Text>,
  '(tabs)/(your-mp)/your-mp': () => <Text>Your MP</Text>,
  '(tabs)/(bills)/bills': () => <Text>Bills</Text>,
  '(tabs)/(search)/search': () => <Text>Search</Text>,
  ...prefix('(today,your-mp,bills,search,ask)'),
  '(tabs)/(today,your-mp,bills,search,ask)/ask': AskDraft,
});

const route = () => store.getRouteInfo();
let mounted: TestRenderer.ReactTestRenderer | null = null;
async function render() {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await act(async () => {
    mounted = TestRenderer.create(<ExpoRoot context={app} location="/" />);
  });
  return mounted!;
}
afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = null;
  askSession.start();
  askSession.setDraft('');
});
async function press(view: TestRenderer.ReactTestRenderer, testID: string) {
  await act(async () => {
    view.root.findByProps({ testID }).props.onPress();
  });
}

const entries = [
  ['bill', '/bill/au-federal-r7534', 'bill-ask'],
  ['person', '/person/synthetic-example', 'person-ask'],
  ['party', '/party/labor', 'party-ask'],
  ['electorate', '/electorate/synthetic', 'electorate-ask'],
  ['record', '/doc/synthetic-speech', 'doc-ask'],
] as const;

test.each(entries)(
  '%s: Ask about this opens Ask in the browsing tab',
  async (_kind, path, testID) => {
    const view = await render();
    expect(route().segments).toEqual(['(tabs)', '(today)']);
    await act(async () => router.push(path));
    expect(route().segments[1]).toBe('(today)');
    await press(view, testID);
    expect(route().pathname).toBe('/ask');
    expect(route().segments).toEqual(['(tabs)', '(today)', 'ask']);
    expect(route().params.question).toMatch(/\?$/);
    // The draft is in the composer of a new conversation; nothing is sent.
    expect(askSession.snapshot().draft).toBe(route().params.question);
    expect(askSession.snapshot().thread).toEqual([]);
    expect(client.askPost).not.toHaveBeenCalled();
  },
);

test.each(entries)(
  '%s: inside the Ask tab, Ask about this pops back to Ask',
  async (_kind, path, testID) => {
    const view = await render();
    await act(async () => router.navigate('/(tabs)/(ask)/ask'));
    await act(async () => router.push(path));
    expect(route().segments[1]).toBe('(ask)');
    await press(view, testID);
    expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
    expect(route().params.question).toMatch(/\?$/);
    expect(router.canGoBack()).toBe(false);
  },
);

test.each([
  ['today', '/'],
  ['your-mp', '/your-mp'],
  ['bills', '/bills'],
  ['search', '/search'],
  ['ask', '/ask'],
])(
  '%s keeps Ask, money and all shared details in its own stack',
  async (tab, root) => {
    await render();
    await act(async () =>
      router.navigate(`/(tabs)/(${tab})${root === '/' ? '' : root}`),
    );
    for (const path of [
      '/money',
      '/results/speech',
      '/topic/housing',
      '/money-record?rid=org',
      '/ask',
    ]) {
      await act(async () => router.push(path));
      expect(route().segments[1]).toBe(`(${tab})`);
    }
  },
);

test('the drafts use the journey wording and the person entry sets Person and Speeches', () => {
  expect(scopedQuestion('person', 'Sam Placeholder')).toEqual({
    question: 'What has Sam Placeholder said in parliament this year?',
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  expect(scopedQuestion('person', 'Sam Placeholder', 'housing').question).toBe(
    'What did Sam Placeholder say about housing?',
  );
  expect(scopedQuestion('bill', 'Example Bill 2026').question).toBe(
    'What did parliament say about the Example Bill 2026?',
  );
  expect(scopedQuestion('party', 'Example Party').question).toBe(
    'What have Example Party members said in parliament this year?',
  );
  expect(scopedQuestion('electorate', 'Example').question).toBe(
    'What has parliament said about Example?',
  );
});

test('an arrival starts a new conversation even when one is open', async () => {
  const view = await render();
  // A finished conversation on screen.
  jest.mocked(client.askPost).mockResolvedValueOnce({
    answer: 'A fixture answer.',
    citations: {},
    sources: [],
  });
  await act(async () => {
    await askSession.submit('An earlier question?');
  });
  const earlier = askSession.snapshot().id;
  expect(askSession.snapshot().thread).toHaveLength(2);
  await act(async () => router.push('/person/sam-placeholder'));
  await press(view, 'person-ask');
  expect(askSession.snapshot().id).not.toBe(earlier);
  expect(askSession.snapshot().thread).toEqual([]);
  expect(askSession.snapshot().options).toMatchObject({
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  expect(client.askPost).toHaveBeenCalledTimes(1);
});

test('an arrival never cancels a running answer; its draft waits for a new conversation', async () => {
  const view = await render();
  let finish: (v: unknown) => void = () => {};
  jest
    .mocked(client.askPost)
    .mockReset()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  let running!: Promise<void>;
  act(() => {
    running = askSession.submit('A running question?');
  });
  await act(async () => router.push('/party/example'));
  await press(view, 'party-ask');
  expect(askSession.snapshot()).toMatchObject({
    busy: true,
    fresh: true,
    draft: 'What have Sam Placeholder members said in parliament this year?',
  });
  expect(client.askPost).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ answer: 'A fixture answer.', citations: {}, sources: [] });
    await running;
  });
  expect(askSession.snapshot().thread).toHaveLength(2);
  expect(askSession.snapshot().fresh).toBe(true);
});
