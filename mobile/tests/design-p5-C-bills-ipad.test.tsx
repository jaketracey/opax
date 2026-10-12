import { act } from 'react';
import { AccessibilityInfo, Dimensions, Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  Stack,
  Tabs,
  router,
  useLocalSearchParams,
  type Href,
} from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store } from 'expo-router/build/global-state/router-store';
import { inMemoryContext } from 'expo-router/build/testing-library/context-stubs';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { BillRow } from '../src/design/primitives';
import BillsList from '../src/features/bills/BillsList';
import { pinned, slugs } from './pinned';

// Design pass 5, lane C, P2-21 (bills half): in landscape on regular width
// the Bills split opens its first bill rather than an empty pane. The
// selection goes through the route, as a tap's does; portrait keeps the
// quiet empty pane, and the iPhone is untouched (design-p5-C-bills.test).
//
// The real router and the real layout run here: the first cut of this test
// mocked both, so it passed while the iPad still showed "No bill selected".
// The app's native tabs draw every tab at launch, so the Bills list loads
// behind Today; `lazy: false` gives the JS tabs the same shape.
jest.mock('../src/design/adaptive', () => {
  // An iPad: `isPad` is read once, when the module loads.
  const { Platform } = jest.requireActual('react-native');
  Object.defineProperty(Platform, 'isPad', { value: true, configurable: true });
  return jest.requireActual('../src/design/adaptive');
});
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    bills: jest.fn(),
    billFor: jest.fn(),
    roster: jest.fn(),
    slugs: jest.fn(),
    directory: jest.fn(),
  },
}));

const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
const mock = jest.mocked(runtime);

function Today() {
  // Today's own params: a selection meant for Bills must never land here.
  const params = useLocalSearchParams();
  return <Text testID="today-params">{JSON.stringify(params)}</Text>;
}
const app = inMemoryContext({
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': () => <Tabs screenOptions={{ lazy: false }} />,
  '(tabs)/(today)/index': Today,
  '(tabs)/(bills)/_layout': {
    default: () => <Stack />,
    unstable_settings: { anchor: 'bills' },
  },
  '(tabs)/(bills)/bills': BillsList,
});

const size = (width: number, height: number) =>
  act(() => {
    Dimensions.set({
      window: { width, height, scale: 2, fontScale: 1 },
      screen: { width, height, scale: 2, fontScale: 1 },
    });
  });
const landscape = () => size(1366, 1024);
const portrait = () => size(1024, 1366);

beforeEach(() => {
  jest.clearAllMocks();
  landscape();
  mock.bills.mockImplementation((refresh) => fixture.bills(refresh));
  mock.billFor.mockImplementation((key, refresh) =>
    fixture.billFor(key, refresh),
  );
  mock.roster.mockImplementation(() => fixture.roster());
  mock.slugs.mockImplementation(() => fixture.slugs());
  mock.directory.mockRejectedValue(new Error('not in this test'));
});
let mounted: TestRenderer.ReactTestRenderer | null = null;
afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = null;
});
// Lets the catalog promises settle, and the effects they wake (and the
// timers those set) run.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function render(location = '/') {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await act(async () => {
    mounted = TestRenderer.create(
      <ExpoRoot context={app} location={location} />,
    );
  });
  await settle();
  return mounted!;
}
const go = async (href: Href) => {
  await act(async () => router.navigate(href));
  await settle();
};
// A tab press: the native tab bar jumps to the tab, with no params of its own.
const tab = async (name: string) => {
  await act(async () =>
    store.navigationRef.current?.dispatch({
      type: 'JUMP_TO',
      payload: { name },
    }),
  );
  await settle();
};
const route = () => store.getRouteInfo();
const rows = (view: TestRenderer.ReactTestRenderer) =>
  view.root.findAllByType(BillRow);
const emptyPane = (view: TestRenderer.ReactTestRenderer) =>
  view.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      node.props.testID === 'bills-split-empty',
  );
const todayParams = (view: TestRenderer.ReactTestRenderer) =>
  JSON.parse(
    view.root.findByProps({ testID: 'today-params' }).props.children,
  ) as Record<string, string>;
const keyOf = (row: TestRenderer.ReactTestInstance) =>
  String(row.props.testID).slice('bill-row-'.length);

test('landscape: Bills opens on its first bill, though it loaded behind Today', async () => {
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
  const view = await render('/');
  // The list is drawn (and loaded) while Today is in view; nothing is chosen
  // yet, and Today's route is left alone.
  expect(route().pathname).toBe('/');
  expect(rows(view).length).toBeGreaterThan(0);
  expect(todayParams(view)).toEqual({});

  await tab('(bills)');
  const first = rows(view)[0]!;
  expect(route().pathname).toBe('/bills');
  expect(route().params.bill).toBe(keyOf(first));
  expect(
    rows(view)
      .filter((row) => row.props.selected)
      .map(keyOf),
  ).toEqual([keyOf(first)]);
  expect(emptyPane(view)).toHaveLength(0);
  expect(todayParams(view)).toEqual({});
  // A selection, not a navigation; VoiceOver stays where it was.
  expect(focus).not.toHaveBeenCalled();
  expect(router.canGoBack()).toBe(false);

  // Closing the pane (Escape) keeps it closed, across a tab switch too.
  await act(async () => router.setParams({ bill: '' }));
  await settle();
  expect(emptyPane(view)).toHaveLength(1);
  await go('/');
  await go('/bills');
  expect(route().params.bill ?? '').toBe('');
  expect(emptyPane(view)).toHaveLength(1);
});

test('a bill already chosen (a deep link) is left as it is', async () => {
  const view = await render('/bills?bill=au-federal-r6850');
  expect(route().params.bill).toBe('au-federal-r6850');
  expect(emptyPane(view)).toHaveLength(0);
});

test('portrait keeps the empty pane until the iPad turns to landscape', async () => {
  portrait();
  const view = await render('/bills');
  expect(route().params.bill).toBeUndefined();
  expect(emptyPane(view)).toHaveLength(1);
  landscape();
  await settle();
  expect(route().params.bill).toBe(keyOf(rows(view)[0]!));
  expect(emptyPane(view)).toHaveLength(0);
});

test('a compact window in landscape (Slide Over, a narrow split) opens nothing', async () => {
  // Landscape by the window's shape, compact by its width.
  size(680, 500);
  await render('/bills');
  expect(route().params.bill).toBeUndefined();
});

test("Today's link to Bills (a navigate, with params of its own) opens the first bill too", async () => {
  const view = await render('/');
  await go('/bills');
  expect(route().pathname).toBe('/bills');
  expect(route().params.bill).toBe(keyOf(rows(view)[0]!));
  expect(emptyPane(view)).toHaveLength(0);
  expect(todayParams(view)).toEqual({});
});
