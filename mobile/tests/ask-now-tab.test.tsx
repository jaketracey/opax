/**
 * A tapped question switches to the Ask tab (build 61, bug 3): Today's
 * starters opened Ask inside the Today tab, with Today still selected, no
 * back button and two taps to get back. A generic "Ask about …" switches
 * the same way (tests/ask-entry-navigation.test.tsx), and both leave Ask's
 * bar a way back to the page they came from.
 */
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Stack, Tabs, router, useLocalSearchParams } from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store } from 'expo-router/build/global-state/router-store';
import { inMemoryContext } from 'expo-router/build/testing-library/context-stubs';
import { Pressable, Text } from 'react-native';
import { client } from '../src/api/runtime';
import {
  askTabStack,
  tabsState,
  useAskNow,
  useOpenAsk,
} from '../src/features/ask/open';
import { askReturnSnapshot, setAskReturn } from '../src/features/ask/return';
import { askSession } from '../src/features/ask/session';

jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));
jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  catalogs: {
    roster: jest.fn().mockRejectedValue(new Error('Offline')),
    slugs: jest.fn(),
  },
}));
jest.mock('../src/features/ask/consent', () => ({
  askConsentGiven: jest.fn().mockResolvedValue(true),
  giveAskConsent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: null, checking: false }),
  accountSnapshot: () => ({ status: null }),
}));
jest.mock('../src/features/ask/sync', () => ({
  syncSubmittedChat: jest.fn().mockResolvedValue(undefined),
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

const question = 'Which bills passed this week?';
function AskDraft() {
  const params = useLocalSearchParams<{ question?: string }>();
  return <Text testID="ask-question">{params.question}</Text>;
}
// As Today's starters and Search's question row call it.
const starter = (testID: string) =>
  function Starter() {
    const askNow = useAskNow();
    return (
      <Pressable testID={testID} onPress={() => askNow({ question })}>
        <Text>{testID}</Text>
      </Pressable>
    );
  };
function BillAsk() {
  const openAsk = useOpenAsk();
  return (
    <Pressable
      testID="bill-ask"
      onPress={() => openAsk({ question: 'What did parliament say?' })}
    />
  );
}
const shared = {
  _layout: () => <Stack />,
  'bill/[key]': BillAsk,
  ask: AskDraft,
};
const prefix = (group: string) =>
  Object.fromEntries(
    Object.entries(shared).map(([name, screen]) => [
      `(tabs)/${group}/${name}`,
      screen,
    ]),
  );
const app = inMemoryContext({
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': () => <Tabs />,
  '(tabs)/(today)/index': starter('today-ask-0'),
  '(tabs)/(your-mp)/your-mp': () => <Text>Your MP</Text>,
  '(tabs)/(bills)/bills': () => <Text>Bills</Text>,
  '(tabs)/(search)/search': starter('search-ask-row'),
  ...prefix('(today,your-mp,bills,search,ask)'),
});

type Nav = {
  key?: string;
  index?: number;
  routes: Nav[];
  name: string;
  state?: Nav;
};
const route = () => store.getRouteInfo();
const rootState = () =>
  store.navigationRef.current!.getRootState() as unknown as Nav;
const tabStack = (tab: string) => {
  const find = (state: Nav | undefined): Nav | undefined => {
    for (const r of state?.routes ?? []) {
      if (r.name === tab) return r.state;
      const found = find(r.state);
      if (found) return found;
    }
    return undefined;
  };
  return find(rootState());
};
const names = (tab: string) => (tabStack(tab)?.routes ?? []).map((r) => r.name);

let mounted: TestRenderer.ReactTestRenderer | null = null;
async function render() {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await act(async () => {
    mounted = TestRenderer.create(<ExpoRoot context={app} location="/" />);
  });
  return mounted!;
}
async function press(testID: string) {
  await act(async () => {
    mounted!.root
      .findAll(
        (n) =>
          n.props.testID === testID && typeof n.props.onPress === 'function',
      )[0]!
      .props.onPress();
  });
}
beforeEach(() => {
  jest.mocked(client.askPost).mockResolvedValue({
    answer: 'A fixture answer.',
    sources: [],
    answer_status: 'answered',
  });
});
afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = null;
  askSession.start();
  askSession.setDraft('');
  setAskReturn(null);
});

test('a Today starter switches to the Ask tab and asks there', async () => {
  await render();
  expect(route().segments).toEqual(['(tabs)', '(today)']);
  await press('today-ask-0');
  // Ask is the selected tab and the root of its own stack: no page to go
  // back to inside Ask.
  expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
  expect(route().params.question).toBe(question);
  expect(router.canGoBack()).toBe(false);
  expect(names('(ask)')).toEqual(['ask']);
  // Today's own stack is untouched, so one tap on Today returns to it.
  expect(names('(today)')).toEqual(['index']);
  expect(askSession.snapshot().thread[0]).toMatchObject({
    role: 'user',
    text: question,
  });
  // Ask's bar leads back to Today (ask-entry-navigation.test.tsx).
  expect(askReturnSnapshot()).toEqual({
    tab: '(today)',
    name: 'Today',
    short: 'Today',
  });
  await act(async () => router.navigate('/(tabs)/(today)'));
  expect(route().segments).toEqual(['(tabs)', '(today)']);
  expect(names('(today)')).toEqual(['index']);
});

test('pages left open in the Ask tab close, so the tab opens on Ask itself', async () => {
  await render();
  await act(async () => router.navigate('/(tabs)/(ask)/ask'));
  await act(async () => router.push('/bill/fixture'));
  expect(names('(ask)')).toEqual(['ask', 'bill/[key]']);
  await act(async () => router.navigate('/(tabs)/(today)'));
  await press('today-ask-0');
  expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
  expect(route().params.question).toBe(question);
  expect(names('(ask)')).toEqual(['ask']);
  expect(router.canGoBack()).toBe(false);
});

test('Search’s question row switches to the Ask tab too', async () => {
  await render();
  await act(async () => router.navigate('/(tabs)/(search)/search'));
  await press('search-ask-row');
  expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
  expect(names('(search)')).toEqual(['search']);
});

test('a generic Ask about … switches to the Ask tab too, keeping the page', async () => {
  await render();
  await act(async () => router.push('/bill/fixture'));
  jest.mocked(client.askPost).mockClear();
  await press('bill-ask');
  expect(route().segments).toEqual(['(tabs)', '(ask)', 'ask']);
  expect(names('(today)')).toEqual(['index', 'bill/[key]']);
  expect(names('(ask)')).toEqual(['ask']);
  // Drafted, never sent.
  expect(client.askPost).not.toHaveBeenCalled();
  expect(askSession.snapshot().draft).toBe('What did parliament say?');
});

test('askTabStack finds the Ask tab’s stack at any depth, or nothing', () => {
  const ask = { key: 'stack-ask', index: 1, routes: [] };
  expect(
    askTabStack({
      routes: [
        {
          name: '__root',
          state: {
            routes: [
              {
                name: '(tabs)',
                state: {
                  routes: [{ name: '(today)' }, { name: '(ask)', state: ask }],
                },
              },
            ],
          },
        },
      ],
    }),
  ).toBe(ask);
  expect(askTabStack({ routes: [{ name: '(today)' }] })).toBeUndefined();
  expect(askTabStack(undefined)).toBeUndefined();
});

test('tabsState finds the tab navigator that holds Ask, or nothing', () => {
  const tabs = {
    key: 'tabs',
    routes: [{ name: '(today)' }, { name: '(ask)' }],
  };
  expect(
    tabsState({
      routes: [
        {
          name: '__root',
          state: { routes: [{ name: '(tabs)', state: tabs }] },
        },
      ],
    }),
  ).toBe(tabs);
  expect(tabsState({ routes: [{ name: '(today)' }] })).toBeUndefined();
  expect(tabsState(undefined)).toBeUndefined();
});
