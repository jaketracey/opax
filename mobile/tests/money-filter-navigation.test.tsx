import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Stack, Tabs, router } from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store } from 'expo-router/build/global-state/router-store';
import { inMemoryContext } from 'expo-router/build/testing-library/context-stubs';
import { Text as NativeText } from 'react-native';
import { apiClient } from '../src/api/runtime';
import MoneyScreen from '../src/features/money/MoneyScreen';
import {
  FilterRoute,
  FilterFacetRoute,
  FiltersLayout,
} from '../src/features/sheets/FilterRoutes';
import { FilterSheet } from '../src/design/filter-sheet';
import { MoneyRow, Text } from '../src/design/primitives';
import { RouteOptions } from '../src/navigation/preview';
import { pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/features/money/NativeMoneyMap', () => ({
  NativeMoneyMap: () => null,
}));
jest.mock('../src/features/money/hooks', () => ({
  ...jest.requireActual('../src/features/money/hooks'),
  useFirstScreenReader: () => true,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: jest.requireActual('react-native').View,
  GestureDetector: jest.requireActual('react-native').View,
  Gesture: {},
}));

const app = inMemoryContext({
  _layout: () => <Stack />,
  '(tabs)/_layout': () => <Tabs />,
  '(tabs)/(today)/index': () => <NativeText>Today</NativeText>,
  '(tabs)/(today)/_layout': () => <Stack />,
  '(tabs)/(today)/money': MoneyScreen,
  '(tabs)/(today)/money-record': () => <NativeText>Money record</NativeText>,
  '(tabs)/(today)/filters/_layout': FiltersLayout,
  '(tabs)/(today)/filters/[list]': FilterRoute,
  '(tabs)/(today)/filters/[list]/[facet]': FilterFacetRoute,
});

let rendered: TestRenderer.ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => rendered?.unmount());
  rendered = undefined;
});

test('money filters apply behind their sheet and survive a record push and pop', async () => {
  const setParams = jest.spyOn(router, 'setParams');
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await act(async () => {
    rendered = TestRenderer.create(<ExpoRoot context={app} location="/" />);
  });
  await act(async () => router.push('/money'));
  const map = () => rendered!.root.findByType(MoneyScreen);
  const caption = () =>
    map()
      .findAllByType(Text)
      .find((node) => node.props.testID === 'money-donor-caption')!.props
      .children;
  // Open the sheet through the map's registered owner, as the bar does.
  const items = map()
    .findByType(RouteOptions)
    .props.options.unstable_headerRightItems();
  await act(async () =>
    items.find((item: { label: string }) => item.label === 'Filters').onPress(),
  );
  expect(store.getRouteInfo().pathname).toBe('/filters/money');
  const sheet = () => rendered!.root.findByType(FilterSheet);
  await act(async () =>
    sheet().props.onChange({
      ...sheet().props.value,
      from: 2024,
      to: 2024,
      industry: 'unions',
      grants: false,
      contracts: false,
    }),
  );
  const expectedCaption =
    'Largest in 2024–25 among the 250 largest donors since 1998–99';
  expect(caption()).toBe(expectedCaption);
  const expectedParams = {
    from: '2024',
    to: '2024',
    industry: 'unions',
    layers: 'donations',
  };
  expect(setParams).not.toHaveBeenCalled();
  await act(async () => sheet().props.onDone());
  expect(setParams).toHaveBeenLastCalledWith(
    expect.objectContaining(expectedParams),
  );
  expect(store.getRouteInfo().params).toMatchObject(expectedParams);
  const donor = map()
    .findAllByType(MoneyRow)
    .find((node) => /^money-donor-\d+$/.test(node.props.testID))!;
  await act(async () => router.push(donor.props.href));
  expect(store.getRouteInfo().pathname).toBe('/money-record');
  await act(async () => router.back());
  expect(store.getRouteInfo().pathname).toBe('/money');
  expect(store.getRouteInfo().params).toMatchObject(expectedParams);
  expect(caption()).toBe(expectedCaption);
  setParams.mockRestore();
});
