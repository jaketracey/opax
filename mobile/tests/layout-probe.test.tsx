// The layout probe is a measuring build only (src/perf/layout-probe.ts). It
// must not exist in any other build: no recorder, no row in Account.
import { act } from 'react';
import { View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { Screen } from '../src/design/layout';
import { LayoutProbeRow } from '../src/perf/LayoutProbeRow';
import { layoutProbeText } from '../src/perf/layout-probe';
import { layoutProbeEnabled } from '../src/perf/layout-probe-flag';

const route = { key: 'bill-1', name: 'bill/[key]' };

test('without the build flag nothing is recorded and Account has no row', () => {
  expect(layoutProbeEnabled).toBe(false);
  jest.useFakeTimers();
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
  act(() => jest.advanceTimersByTime(1500));
  expect(layoutProbeText()).toBe('');
  expect(
    renderer.root.findAll(
      (node) => node.props?.testID === 'account-layout-probe',
    ),
  ).toHaveLength(0);
  act(() => renderer.unmount());
  jest.useRealTimers();
});

test.each([
  [undefined, false],
  ['', false],
  ['0', false],
  ['true', false],
  ['1', true],
] as const)('the flag reads %p as %s', (value, on) => {
  const before = process.env.EXPO_PUBLIC_OPAX_LAYOUT_PROBE;
  if (value === undefined) delete process.env.EXPO_PUBLIC_OPAX_LAYOUT_PROBE;
  else process.env.EXPO_PUBLIC_OPAX_LAYOUT_PROBE = value;
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const flag = require('../src/perf/layout-probe-flag') as {
        layoutProbeEnabled: boolean;
      };
      expect(flag.layoutProbeEnabled).toBe(on);
    });
  } finally {
    if (before === undefined) delete process.env.EXPO_PUBLIC_OPAX_LAYOUT_PROBE;
    else process.env.EXPO_PUBLIC_OPAX_LAYOUT_PROBE = before;
  }
});
