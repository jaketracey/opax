import { act } from 'react';
import { Stack, router } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { renderRouter } from 'expo-router/testing-library';
import { store } from 'expo-router/build/global-state/router-store';
import { Text as NativeText } from 'react-native';
import { apiClient } from '../src/api/runtime';
import { freezeSnapshot } from '../src/api/client';
import MoneyScreen from '../src/features/money/MoneyScreen';
import MoneyRecordScreen from '../src/features/money/MoneyRecord';
import {
  FilterRoute,
  FilterFacetRoute,
  FiltersLayout,
} from '../src/features/sheets/FilterRoutes';
import { FilterSheet, FilterFacet } from '../src/design/filter-sheet';
import {
  Button,
  MoneyRow,
  SegmentedPicker,
  Text,
} from '../src/design/primitives';
import { RouteOptions } from '../src/navigation/preview';
import { filterFacetRoute } from '../src/navigation/routes/filters';
import { filtersScreens } from '../src/navigation/stack/filters';
import { pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/features/money/map/MoneyMap', () => ({
  MoneyMap: () => null,
}));
jest.mock('../src/features/money/hooks', () => ({
  ...jest.requireActual('../src/features/money/hooks'),
  useFirstScreenReader: () => false,
}));
jest.mock('react-native-gesture-handler', () => require('./gesture-mock'));

const app = {
  _layout: () => (
    <Stack>
      <Stack.Screen name="source" options={{ presentation: 'formSheet' }} />
      <Stack.Screen
        name="source-destination"
        options={{ presentation: 'modal' }}
      />
    </Stack>
  ),
  source: () => <NativeText>Sources</NativeText>,
  'source-destination': () => <NativeText>Original</NativeText>,
  '(tabs)/_layout': () => (
    <NativeTabs>
      <NativeTabs.Trigger name="(today)" />
    </NativeTabs>
  ),
  '(tabs)/(today)/index': () => <NativeText>Today</NativeText>,
  '(tabs)/(today)/_layout': () => <Stack>{filtersScreens()}</Stack>,
  '(tabs)/(today)/money': MoneyScreen,
  '(tabs)/(today)/money-record': MoneyRecordScreen,
  '(tabs)/(today)/filters/_layout': FiltersLayout,
  '(tabs)/(today)/filters/[list]': FilterRoute,
  '(tabs)/(today)/filters/[list]/[facet]': FilterFacetRoute,
};

type RouteState = {
  routes: readonly {
    key?: string;
    name: string;
    params?: object;
    state?: RouteState;
  }[];
};
function findMoneyRoute(
  state: RouteState | undefined,
): RouteState['routes'][number] | undefined {
  for (const route of state?.routes ?? []) {
    if (route.name === 'money') return route;
    if (route.state) {
      const found = findMoneyRoute(route.state);
      if (found) return found;
    }
  }
}

// Each test reads the 680 KB money graph twice (map, then record). Decode each
// pinned file once per suite and freeze it as the real client does under Jest,
// so a screen that edits a shared snapshot still fails here.
const snapshots = new Map<string, unknown>();
function decoded<T>(path: string, decode: (raw: unknown) => T): T {
  if (!snapshots.has(path)) {
    const value = decode(pinned(path));
    freezeSnapshot(value);
    snapshots.set(path, value);
  }
  return snapshots.get(path) as T;
}
let rendered: ReturnType<typeof renderRouter>;
const map = () => rendered.UNSAFE_root.findByType(MoneyScreen);
const sheet = () => rendered.UNSAFE_root.findByType(FilterSheet);
const moneyRoute = () => {
  const route = findMoneyRoute(rendered.getRouterState());
  if (!route) throw new Error('The money map route is missing');
  return route;
};
const caption = () =>
  map()
    .findAllByType(Text)
    .find((node) => node.props.testID === 'money-donor-caption')!.props
    .children;
// Jest renders the real native stack, but UIKit never sends onAppear. Drive
// that native callback once for the map, including on its return from a record.
async function mapAppeared() {
  await act(async () =>
    rendered.UNSAFE_root.find(
      (node) =>
        node.props.screenId === moneyRoute().key &&
        typeof node.props.onAppear === 'function',
    ).props.onAppear(),
  );
}
async function openFilters() {
  const items = map()
    .findByType(RouteOptions)
    .props.options.unstable_headerRightItems();
  await act(async () =>
    items.find((item: { label: string }) => item.label === 'Filters').onPress(),
  );
  expect(rendered.getPathname()).toBe('/filters/money');
}

const answerFromPins = () =>
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decoded(path, decode),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
// The first render in a worker loads expo-router, the native stack and every
// money and filter screen module, and decodes the graph: about 0.5 s alone and
// several seconds on a loaded host. That is one-off setup, not the behaviour
// under test, so it runs here under its own budget and each test keeps the
// default 5 s for its own steps.
beforeAll(async () => {
  answerFromPins();
  rendered = renderRouter(app);
  await act(async () => router.push('/money'));
  await act(async () => router.push('/filters/money'));
  await act(async () => router.push('/money-record'));
  await act(async () => rendered.unmount());
}, 30_000);

afterEach(async () => {
  await act(async () => rendered?.unmount());
  jest.useRealTimers();
});

test.each(['push', 'native link'] as const)(
  'money filters survive a record, nested sheets, Back and native appearance after a %s',
  async (entry) => {
    answerFromPins();
    rendered = renderRouter(app);
    if (entry === 'push') {
      await act(async () => router.push('/money'));
    } else {
      // Same action as useLinking.native dispatches for opax://money after
      // +native-intent resolves it into the selected tab. router.push alone
      // misses the nested NAVIGATE payload and its native animation param.
      const linking = store.linking!;
      const state = linking.getStateFromPath(
        '/(tabs)/(today)/money',
        linking.config,
      )!;
      const action = linking.getActionFromState!(state, linking.config)!;
      await act(async () => store.navigationRef.current!.dispatch(action));
    }
    const key = moneyRoute().key;
    await mapAppeared();
    await openFilters();
    const owner = sheet().props.owner;
    // The facet is pushed inside the Filters form sheet, like the native UI.
    await act(async () =>
      router.push(filterFacetRoute('money', 'industry', owner)),
    );
    const facet = rendered.UNSAFE_root.findByType(FilterFacet);
    await act(async () =>
      facet.props.onChange({ ...facet.props.value, industry: 'unions' }),
    );
    await act(async () => facet.props.onBack());
    await act(async () =>
      sheet().props.onChange({
        ...sheet().props.value,
        from: 2024,
        to: 2024,
        grants: false,
        contracts: false,
        inflation: true,
      }),
    );
    const expectedParams = {
      from: '2024',
      to: '2024',
      industry: 'unions',
      layers: 'donations',
      inflation: '1',
    };
    // Updates belong to the map while the sheet owns global focus.
    expect(moneyRoute().params).toMatchObject(expectedParams);
    expect(rendered.getSearchParams()).not.toHaveProperty('industry');
    await act(async () => sheet().props.onDone());
    expect(rendered.getSearchParams()).toMatchObject(expectedParams);
    expect(
      map()
        .findAllByType(Text)
        .find((node) => node.props.testID === 'money-view-summary')!.props
        .children,
    ).toBe('Money to parties in 2024–25, union donors only');
    // The Labor journey action: the same push as the panel's Open record.
    await act(async () =>
      map()
        .findAllByType(Button)
        .find((node) => node.props.testID === 'money-test-focus')!
        .props.onPress(),
    );
    expect(rendered.getPathname()).toBe('/money-record');
    expect(rendered.getSearchParams()).toMatchObject({
      ...expectedParams,
      node: 'party:Labor',
    });
    await act(async () => router.push('/source'));
    await act(async () => router.push('/source-destination'));
    await act(async () => router.back());
    expect(rendered.getPathname()).toBe('/source');
    await act(async () => router.back());
    expect(rendered.getPathname()).toBe('/money-record');
    // Native Back dispatches POP with the record's source and stack target.
    const recordKey = store.navigationRef.current!.getCurrentRoute()!.key;
    await act(async () =>
      rendered.UNSAFE_root.find(
        (node) =>
          node.props.screenId === recordKey &&
          typeof node.props.onHeaderBackButtonClicked === 'function',
      ).props.onHeaderBackButtonClicked(),
    );
    expect(rendered.getPathname()).toBe('/money');
    await mapAppeared();
    // A pop retains the map's route key. A stale URL or a remount must not
    // overwrite the edited params when its native transition completes.
    expect(moneyRoute().key).toBe(key);
    expect(rendered.getSearchParams()).toMatchObject(expectedParams);
    await act(async () =>
      map().findByType(SegmentedPicker).props.onChange('list'),
    );
    expect(caption()).toBe(
      'Largest in 2024–25 among the 250 largest donors since 1998–99',
    );
    const donor = map()
      .findAllByType(MoneyRow)
      .find((node) => node.props.testID === 'money-donor-0')!;
    expect(donor.props.name).toBe('Mining and Energy Union');
    expect(donor.props.detail).toContain('2024–25');
    expect(donor.props.href.params).toMatchObject(expectedParams);
    // Reopening and cancelling restores the opening route values, even after
    // another facet push, with no pending focus-time commit.
    await openFilters();
    await act(async () =>
      router.push(filterFacetRoute('money', 'industry', sheet().props.owner)),
    );
    const reopenedFacet = rendered.UNSAFE_root.findByType(FilterFacet);
    await act(async () =>
      reopenedFacet.props.onChange({
        ...reopenedFacet.props.value,
        industry: 'mining',
      }),
    );
    await act(async () => reopenedFacet.props.onBack());
    await act(async () => sheet().props.onCancel());
    expect(rendered.getSearchParams()).toMatchObject(expectedParams);
  },
);
