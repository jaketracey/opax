// The layout probe with its build flag on (src/perf/layout-probe.ts).
import { act } from 'react';
import { View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { Screen } from '../src/design/layout';
import { LayoutProbeRow } from '../src/perf/LayoutProbeRow';
import { layoutProbeText, resetLayoutProbe } from '../src/perf/layout-probe';

jest.mock('../src/perf/layout-probe-flag', () => ({
  layoutProbeEnabled: true,
}));

const route = { key: 'bill-1', name: 'bill/[key]' };
function page() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <NavigationRouteContext.Provider value={route as never}>
        <HeaderHeightContext.Provider value={82}>
          <Screen testID="page">
            <View />
          </Screen>
          <LayoutProbeRow />
        </HeaderHeightContext.Provider>
      </NavigationRouteContext.Provider>,
    );
  });
  return renderer;
}

beforeEach(() => {
  jest.useFakeTimers();
  act(() => resetLayoutProbe());
});
afterEach(() => jest.useRealTimers());

test('a page records its first layout, 250 ms and 1 s, and Account shows them', () => {
  const renderer = page();
  expect(layoutProbeText()).toMatch(
    /^bill\/\[key\]\n {2}first: top \S+, header 82, offset none$/,
  );
  act(() => jest.advanceTimersByTime(1500));
  expect(
    layoutProbeText()
      .split('\n')
      .map((line) => line.trim().split(':')[0]),
  ).toEqual(['bill/[key]', 'first', '250 ms', '1 s']);
  const row = renderer.root.findAll(
    (node) => node.props?.testID === 'account-layout-probe',
  );
  expect(row.length).toBeGreaterThan(0);
  act(() => renderer.unmount());
});

test('only the last 20 pages are kept', () => {
  for (let i = 0; i < 25; i += 1) {
    const renderer = page();
    act(() => renderer.unmount());
  }
  expect(
    layoutProbeText()
      .split('\n')
      .filter((line) => !line.startsWith(' ')),
  ).toHaveLength(20);
});
