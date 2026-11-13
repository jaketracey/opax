/**
 * A generic "Ask about …" on a person, party, seat, bill or record page
 * switches to the Ask tab (journeys/ask.md 4.2), as a tapped question does
 * (tests/ask-now-tab.test.tsx). Opened inside the browsing tab's stack, Ask
 * had no back button and the reader was stuck (Jake, 13 Nov: switch, with a
 * way back). Ask's bar then leads back to the page, on its own tab with its
 * stack as it was; Android's system Back does the same (ask-screen.test.tsx).
 */
import { act, useEffect } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  Stack,
  Tabs,
  router,
  useLocalSearchParams,
  useSegments,
} from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store } from 'expo-router/build/global-state/router-store';
import { inMemoryContext } from 'expo-router/build/testing-library/context-stubs';
import { Pressable, Text } from 'react-native';
import { scopedQuestion } from '../src/features/ask/AskAbout';
import { DocumentAsk } from '../src/features/ask/DocumentAsk';
import { useOpenAsk, useReturnFromAsk } from '../src/features/ask/open';
import {
  askReturnSnapshot,
  noteSelectedTab,
  setAskReturn,
  useAskReturn,
} from '../src/features/ask/return';
import { askSession } from '../src/features/ask/session';
import { client } from '../src/api/runtime';
import { decodeDocument, recordHeadline } from '../src/features/records/model';
import {
  askHeaderItems,
  type TestableHeaderItem,
} from '../src/navigation/chrome';
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

// As profile, bill, party and seat pages call it (PageActions, BillDetail):
// the draft, and the page's own name for the way back.
const entry = (
  kind: 'person' | 'bill' | 'party' | 'electorate',
  testID = `${kind}-ask`,
) =>
  function Entry() {
    const openAsk = useOpenAsk();
    return (
      <Pressable
        testID={testID}
        onPress={() =>
          openAsk(scopedQuestion(kind, 'Sam Placeholder'), 'Sam Placeholder')
        }
      />
    );
  };
const PaneRecord = entry('person', 'pane-person-ask');
/**
 * Ask as AskScreen wires it: the draft, the bar's leading items from
 * askHeaderItems with the way back, and, as in Ask's sources pane beside the
 * conversation on iPad and Duo, a record whose own "Ask about" stays in Ask.
 */
function AskDraft() {
  const params = useLocalSearchParams<{ question?: string }>();
  const back = useAskReturn();
  const returnFromAsk = useReturnFromAsk();
  const leading = (
    askHeaderItems({
      canStartNew: false,
      historyEnabled: false,
      signedIn: false,
      onNew: () => undefined,
      onHistory: () => undefined,
      back: back
        ? { name: back.name, onPress: () => void returnFromAsk() }
        : null,
    }).unstable_headerLeftItems() as TestableHeaderItem[]
  ).filter((item) => item.type === 'button');
  return (
    <>
      <Text testID="ask-question">{params.question}</Text>
      {leading.map((item) => (
        <Pressable
          key={item.label}
          testID={item.testID ?? item.label}
          accessibilityLabel={item.accessibilityLabel}
          onPress={item.type === 'button' ? item.onPress : undefined}
        />
      ))}
      <PaneRecord />
    </>
  );
}
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
// As the app's tab layout does: leaving the Ask tab ends the way back.
function TabsLayout() {
  const tab = (useSegments() as string[])[1];
  useEffect(() => noteSelectedTab(tab), [tab]);
  return <Tabs />;
}
const app = inMemoryContext({
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/(today)/index': () => <Text>Today</Text>,
  '(tabs)/(your-mp)/your-mp': () => <Text>Your MP</Text>,
  '(tabs)/(bills)/bills': () => <Text>Bills</Text>,
  '(tabs)/(search)/search': () => <Text>Search</Text>,
  ...prefix('(today,your-mp,bills,search,ask)'),
  '(tabs)/(today,your-mp,bills,search,ask)/ask': AskDraft,
});

const route = () => store.getRouteInfo();
type Nav = { routes: Nav[]; name: string; state?: Nav };
/** The route names in one tab's own stack. */
const names = (tab: string) => {
  const find = (state: Nav | undefined): Nav | undefined => {
    for (const r of state?.routes ?? []) {
      if (r.name === tab) return r.state;
      const found = find(r.state);
      if (found) return found;
    }
    return undefined;
  };
  const root = store.navigationRef.current!.getRootState() as unknown as Nav;
  return (find(root)?.routes ?? []).map((r) => r.name);
};
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
  setAskReturn(null);
});
const pressable = (view: TestRenderer.ReactTestRenderer, testID: string) =>
  view.root.findAll(
    (n) => n.props.testID === testID && typeof n.props.onPress === 'function',
  )[0]!;
async function press(view: TestRenderer.ReactTestRenderer, testID: string) {
  await act(async () => {
    pressable(view, testID).props.onPress();
  });
}

const entries = [
  ['bill', '/bill/au-federal-r7534', 'bill-ask', 'bill/[key]'],
  ['person', '/person/synthetic-example', 'person-ask', 'person/[slug]'],
  ['party', '/party/labor', 'party-ask', 'party/[slug]'],
  ['electorate', '/electorate/synthetic', 'electorate-ask', 'electorate/[id]'],
  ['record', '/doc/synthetic-speech', 'doc-ask', 'doc/[slug]'],
] as const;
const shortName = (kind: string) =>
  ({
    bill: 'Bill',
    person: 'Profile',
    party: 'Party',
    electorate: 'Electorate',
    record: 'Record',
  })[kind];
const pageName = (kind: string) =>
  kind === 'record' ? recordHeadline(speech) : 'Sam Placeholder';

test.each(entries)(
  '%s: Ask about this switches to the Ask tab, scoped, and keeps the page',
  async (kind, path, testID, screen) => {
    const view = await render();
    expect(route().segments).toEqual(['(tabs)', '(today)']);
    await act(async () => router.push(path));
    expect(route().segments[1]).toBe('(today)');
    await press(view, testID);
    // Ask is the selected tab, at the root of its own stack.
    expect(route().pathname).toBe('/ask');
    expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
    expect(names('(ask)')).toEqual(['ask']);
    expect(router.canGoBack()).toBe(false);
    // The page stays on Today's stack, where the reader left it.
    expect(names('(today)')).toEqual(['index', screen]);
    expect(route().params.question).toMatch(/\?$/);
    // The draft is in the composer of a new conversation; nothing is sent.
    expect(askSession.snapshot().draft).toBe(route().params.question);
    expect(askSession.snapshot().thread).toEqual([]);
    expect(client.askPost).not.toHaveBeenCalled();
    expect(askReturnSnapshot()).toEqual({
      tab: '(today)',
      name: pageName(kind),
      // The back item's word is the page's kind, not its long name.
      short: shortName(kind),
    });
    expect(pressable(view, 'ask-back').props.accessibilityLabel).toBe(
      `Back to ${pageName(kind)}`,
    );
  },
);

test('the person entry keeps its scope: Person and Speeches, with the draft ready', async () => {
  const view = await render();
  await act(async () => router.push('/person/synthetic-example'));
  await press(view, 'person-ask');
  expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
  expect(route().params).toMatchObject({
    question: 'What has Sam Placeholder said in parliament this year?',
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  expect(askSession.snapshot().options).toMatchObject({
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  expect(askSession.snapshot().draft).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
});

test.each([
  ['(today)', '/(tabs)/(today)', ['index', 'person/[slug]']],
  ['(bills)', '/(tabs)/(bills)/bills', ['bills', 'person/[slug]']],
  ['(search)', '/(tabs)/(search)/search', ['search', 'person/[slug]']],
  ['(your-mp)', '/(tabs)/(your-mp)/your-mp', ['your-mp', 'person/[slug]']],
] as const)(
  'from %s, the way back returns to that tab and page as they were',
  async (tab, root, stack) => {
    const view = await render();
    await act(async () => router.navigate(root));
    await act(async () => router.push('/person/synthetic-example'));
    await press(view, 'person-ask');
    expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
    await press(view, 'ask-back');
    expect(route().segments).toEqual(['(tabs)', tab, 'person', '[slug]']);
    expect(route().params).toMatchObject({ slug: 'synthetic-example' });
    expect(names(tab)).toEqual(stack);
    // Used once: Ask is an ordinary tab visit again.
    expect(askReturnSnapshot()).toBeNull();
    await act(async () => router.navigate('/(tabs)/(ask)/ask'));
    expect(pressable(view, 'ask-back')).toBeUndefined();
  },
);

test('leaving Ask by another tab ends the way back', async () => {
  const view = await render();
  await act(async () => router.push('/bill/au-federal-r7534'));
  await press(view, 'bill-ask');
  expect(askReturnSnapshot()).not.toBeNull();
  await act(async () => router.navigate('/(tabs)/(bills)/bills'));
  expect(askReturnSnapshot()).toBeNull();
  await act(async () => router.navigate('/(tabs)/(ask)/ask'));
  expect(pressable(view, 'ask-back')).toBeUndefined();
  expect(names('(today)')).toEqual(['index', 'bill/[key]']);
});

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
    // Nothing to go back to outside Ask.
    expect(askReturnSnapshot()).toBeNull();
  },
);

test('a record in Ask’s sources pane (iPad, Duo) asks in place: no tab switch, no way back', async () => {
  const view = await render();
  await act(async () => router.navigate('/(tabs)/(ask)/ask'));
  await press(view, 'pane-person-ask');
  expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
  expect(names('(ask)')).toEqual(['ask']);
  expect(names('(today)')).toEqual(['index']);
  expect(askSession.snapshot().draft).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(askReturnSnapshot()).toBeNull();
  expect(pressable(view, 'ask-back')).toBeUndefined();
});

test('a page in the Ask tab closes, so the arrival opens on Ask itself', async () => {
  const view = await render();
  await act(async () => router.navigate('/(tabs)/(ask)/ask'));
  await act(async () => router.push('/money'));
  expect(names('(ask)')).toEqual(['ask', 'money']);
  await act(async () => router.navigate('/(tabs)/(today)'));
  await act(async () => router.push('/party/labor'));
  await press(view, 'party-ask');
  expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
  expect(names('(ask)')).toEqual(['ask']);
  await press(view, 'ask-back');
  expect(route().segments).toEqual(['(tabs)', '(today)', 'party', '[slug]']);
});

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
