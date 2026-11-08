import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Stack, Tabs, router, useLocalSearchParams } from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store } from 'expo-router/build/global-state/router-store';
import { inMemoryContext } from 'expo-router/build/testing-library/context-stubs';
import { Text } from 'react-native';
import { AskAbout } from '../src/features/ask/AskAbout';
import { DocumentAsk } from '../src/features/ask/DocumentAsk';
import { decodeDocument } from '../src/features/records/model';
import fixtures from '../scripts/fixtures/records/contracts.json';

const speech = Object.entries(fixtures.responses)
  .filter(([path]) => path.startsWith('/api/resource/'))
  .map(([, response]) => decodeDocument(response))
  .find((doc) => doc.labels.kind === 'speech')!;

function AskDraft() {
  const params = useLocalSearchParams<{ question?: string }>();
  return <Text testID="ask-question">{params.question}</Text>;
}
const entry = (kind: 'person' | 'bill' | 'party' | 'electorate') =>
  function Entry() {
    return <AskAbout kind={kind} name="Synthetic Example" />;
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
